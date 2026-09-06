#!/usr/bin/env node
/**
 * Reads the built packs back out of LevelDB and checks that every cross-reference
 * actually resolves.
 *
 * Foundry fails these quietly: a token pointing at a missing actor imports as an
 * empty token, a note with a stale pageId opens nothing, a broken @UUID renders
 * as plain text. All of it looks fine until someone runs the session.
 */

import { ClassicLevel } from "classic-level";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = join(ROOT, "packs");
const MODULE = "caverns-of-blackthorn";

const problems = [];
const notes = [];
function fail(msg) { problems.push(msg); }

async function readPack(name) {
  const db = new ClassicLevel(join(PACKS, name), { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const out = new Map();
  for await (const [key, value] of db.iterator()) out.set(key, value);
  await db.close();
  return out;
}

function topLevel(pack, collection) {
  const prefix = `!${collection}!`;
  return [...pack.entries()]
    .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("."))
    .map(([, v]) => v);
}

const main = async () => {
  for (const p of ["blackthorn-adventure", "blackthorn-actors", "blackthorn-items", "blackthorn-journal"]) {
    if (!existsSync(join(PACKS, p))) {
      fail(`pack "${p}" was not built`);
      return;
    }
  }

  const advPack = await readPack("blackthorn-adventure");
  const actorPack = await readPack("blackthorn-actors");
  const itemPack = await readPack("blackthorn-items");
  const journalPack = await readPack("blackthorn-journal");

  const adventures = topLevel(advPack, "adventures");
  if (adventures.length !== 1) fail(`expected exactly 1 adventure, found ${adventures.length}`);
  const adv = adventures[0];

  // --- the adventure must actually carry its contents ----------------------
  for (const [field, min] of [["actors", 10], ["items", 5], ["journal", 1], ["scenes", 1], ["folders", 4]]) {
    const n = adv?.[field]?.length ?? 0;
    if (n < min) fail(`adventure.${field}: ${n} entries, expected at least ${min}`);
    else notes.push(`adventure.${field}: ${n}`);
  }

  const actorIds = new Set((adv.actors ?? []).map(a => a._id));
  const itemIds = new Set((adv.items ?? []).map(i => i._id));

  // --- scene tokens must point at actors the adventure brings along --------
  const scene = adv.scenes?.[0];
  if (!scene) fail("adventure has no scene");
  else {
    notes.push(`scene "${scene.name}": ${scene.width}x${scene.height}px, grid ${scene.grid.size}px = ${scene.grid.distance} ${scene.grid.units}`);
    notes.push(`scene contents: ${scene.tokens.length} tokens, ${scene.lights.length} lights, ${scene.notes.length} notes`);

    for (const t of scene.tokens) {
      if (!actorIds.has(t.actorId)) fail(`scene token "${t.name}" -> actorId ${t.actorId} not in adventure`);
      if (t.x < 0 || t.y < 0 || t.x > scene.width || t.y > scene.height) {
        fail(`scene token "${t.name}" sits outside the canvas at (${t.x}, ${t.y})`);
      }
    }

    // --- notes must resolve to a real journal page -----------------------
    const journal = adv.journal?.[0];
    const pageIds = new Set((journal?.pages ?? []).map(p => p._id));
    for (const n of scene.notes) {
      if (n.entryId !== journal?._id) fail(`scene note "${n.text}" -> entryId does not match the bundled journal`);
      if (!n.pageId) fail(`scene note "${n.text}" has no pageId — no journal page carries that area number`);
      else if (!pageIds.has(n.pageId)) fail(`scene note "${n.text}" -> pageId ${n.pageId} is not a page of the journal`);
      if (n.x < 0 || n.y < 0 || n.x > scene.width || n.y > scene.height) {
        fail(`scene note "${n.text}" sits outside the canvas at (${n.x}, ${n.y})`);
      }
    }

    for (const l of scene.lights) {
      if (l.x < 0 || l.y < 0 || l.x > scene.width || l.y > scene.height) {
        fail(`light at (${l.x}, ${l.y}) sits outside the canvas`);
      }
    }
  }

  // --- @UUID links in the journal must resolve ----------------------------
  const journal = adv.journal?.[0];
  const uuidRe = /@UUID\[Compendium\.([^.]+)\.([^.]+)\.(Actor|Item|JournalEntry)\.([A-Za-z0-9]+)\]/g;
  let linkCount = 0;
  for (const page of journal?.pages ?? []) {
    const html = page.text?.content ?? "";
    for (const [full, mod, pack, type, id] of html.matchAll(uuidRe)) {
      linkCount++;
      if (mod !== MODULE) fail(`${page.name}: link points at foreign module "${mod}"`);
      const target = type === "Actor" ? actorIds : type === "Item" ? itemIds : new Set([journal._id]);
      if (!target.has(id)) fail(`${page.name}: ${full} does not resolve to a bundled ${type}`);
    }
    // An unresolved shorthand means resolveLinks missed a key.
    for (const [m] of html.matchAll(/\[\[(creature|item):[a-z0-9-]+\]\]/g)) {
      fail(`${page.name}: unresolved shorthand ${m}`);
    }
    if (/\{\{item:[^}]+\}\}/.test(html)) fail(`${page.name}: unresolved {{item:...}} placeholder`);
  }
  notes.push(`journal: ${journal?.pages?.length ?? 0} pages, ${linkCount} compendium links`);

  // --- actor sanity -------------------------------------------------------
  for (const actor of topLevel(actorPack, "actors")) {
    const hp = actor.system?.attributes?.hp;
    if (!hp?.max || hp.max !== hp.value) fail(`${actor.name}: hp value/max mismatch (${hp?.value}/${hp?.max})`);
    if (actor.system?.details?.cr == null) fail(`${actor.name}: no CR`);
    if (!actor.prototypeToken?.texture?.src) fail(`${actor.name}: prototype token has no image`);
    const stray = JSON.stringify(actor).match(/\{\{item:[^}]+\}\}/g);
    if (stray) fail(`${actor.name}: unresolved placeholders ${stray.join(", ")}`);
  }
  notes.push(`actors pack: ${topLevel(actorPack, "actors").length} creatures`);

  // --- item sanity --------------------------------------------------------
  for (const item of topLevel(itemPack, "items")) {
    if (!item.img) fail(`${item.name}: no image`);
    if (!item.system?.description?.value) fail(`${item.name}: no description`);
  }
  notes.push(`items pack: ${topLevel(itemPack, "items").length} items`);

  // --- assets referenced by the scene must exist on disk ------------------
  for (const src of [scene?.background?.src, adv?.img].filter(Boolean)) {
    if (!src.startsWith(`modules/${MODULE}/`)) continue;
    const rel = src.slice(`modules/${MODULE}/`.length);
    if (!existsSync(join(ROOT, rel))) fail(`referenced asset is missing from the module: ${rel}`);
  }

  const journalTop = topLevel(journalPack, "journal");
  if (journalTop.length !== 1) fail(`journal pack: expected 1 entry, found ${journalTop.length}`);

  console.log("\n".concat(notes.map(n => `  · ${n}`).join("\n")));
  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):\n` + problems.map(p => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\n✓ all cross-references resolve");
};

main().catch(err => { console.error(err); process.exit(1); });

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
import { existsSync, readFileSync } from "node:fs";

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
  if (adv.scenes?.length !== 9) fail("expected nine scenes for ten areas");
  for (const scene of adv.scenes ?? []) {
    notes.push(`scene "${scene.name}": ${scene.width}x${scene.height}px, grid ${scene.grid.size}px = ${scene.grid.distance} ${scene.grid.units}`);
    notes.push(`scene contents: ${scene.tokens.length} tokens, ${scene.lights.length} lights, ${scene.notes.length} notes`);

    for (const t of scene.tokens) {
      if (!actorIds.has(t.actorId)) fail(`scene token "${t.name}" -> actorId ${t.actorId} not in adventure`);
      if (t.x < 0 || t.y < 0 || t.x > scene.width || t.y > scene.height) {
        fail(`scene token "${t.name}" sits outside the canvas at (${t.x}, ${t.y})`);
      }
    }

    // --- notes must resolve to a real journal page -----------------------
    const journal = adv.journal?.find(j => j.pages.some(p => p.flags?.[MODULE]?.area != null)) ?? adv.journal?.[0];
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

  // --- @UUID links in every journal must resolve --------------------------
  const journalIds = new Set((adv.journal ?? []).map(j => j._id));
  const uuidRe = /@UUID\[(Compendium\.[^\]]+)\]/g;
  const external = new Set(JSON.parse(readFileSync(join(ROOT, "build", "reference-index.json"), "utf8")).references.map(r => r.uuid));
  let linkCount = 0;
  let pageCount = 0;
  for (const page of (adv.journal ?? []).flatMap(j => j.pages ?? [])) {
    pageCount++;
    const html = page.text?.content ?? "";
    for (const [full, uuid] of html.matchAll(uuidRe)) {
      linkCount++;
      const [,mod,pack,type,id] = uuid.split(".");
      if (mod !== MODULE) {
        if (!external.has(uuid)) fail(`${page.name}: unverified external link ${uuid}`);
        continue;
      }
      const target = type === "Actor" ? actorIds : type === "Item" ? itemIds : journalIds;
      if (!target.has(id)) fail(`${page.name}: ${full} does not resolve to a bundled ${type}`);
    }
    // An unresolved shorthand means resolveLinks missed a key.
    for (const [m] of html.matchAll(/\[\[(creature|item):[a-z0-9-]+\]\]/g)) {
      fail(`${page.name}: unresolved shorthand ${m}`);
    }
    if (/\{\{item:[^}]+\}\}/.test(html)) fail(`${page.name}: unresolved {{item:...}} placeholder`);
  }
  notes.push(`journals: ${adv.journal?.length ?? 0} entr(ies), ${pageCount} pages, ${linkCount} compendium links`);

  for (const [, uuid] of JSON.stringify(adv).matchAll(/(?:@UUID\[|"uuid":")((?:Compendium\.)[^"\]\\]+)/g)) {
    if (!uuid.startsWith(`Compendium.${MODULE}.`) && !external.has(uuid)) fail(`unverified external reference ${uuid}`);
  }
  for (const scene of adv.scenes) {
    for (const field of ["tokens", "notes", "walls", "lights"]) {
      const ids=scene[field].map(x=>x._id);
      if (new Set(ids).size!==ids.length) fail(`${scene.name}: duplicate ${field} IDs`);
    }
    if (!Number.isInteger(scene.grid.size) || scene.grid.size < 20) fail(`${scene.name}: invalid grid size`);
    for (const w of scene.walls) if(w.c.length!==4 || w.c.some(v=>!Number.isFinite(v))) fail(`${scene.name}: invalid wall`);
  }
  const areas=(adv.journal??[]).flatMap(j=>j.pages).map(p=>p.flags?.[MODULE]?.area).filter(x=>x!=null).sort((a,b)=>a-b);
  if(JSON.stringify(areas)!==JSON.stringify([1,2,3,4,5,6,7,8,9,10]))fail("each of ten areas must have exactly one page");

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

  // --- every module asset referenced anywhere must exist on disk ----------
  // Covers the scene background, the adventure banner, actor portraits and token
  // textures, and images embedded in journal HTML. A missing file renders as a
  // broken image in Foundry without any error being logged.
  const assetRe = new RegExp(`modules/${MODULE}/[A-Za-z0-9_./-]+`, "g");
  const referenced = new Set(JSON.stringify(adv).match(assetRe) ?? []);
  for (const src of referenced) {
    const rel = src.slice(`modules/${MODULE}/`.length);
    if (!existsSync(join(ROOT, rel))) fail(`referenced asset is missing from the module: ${rel}`);
  }
  notes.push(`module assets referenced: ${referenced.size}`);
  const arg = key => { const i=process.argv.indexOf(key); return i<0?null:process.argv[i+1]; };
  const core=arg("--core"), data=arg("--data");
  if (core && data) {
    const allAssets=new Set(JSON.stringify(adv).match(/(?:icons|systems|modules)\/[A-Za-z0-9_./-]+\.(?:svg|webp|png|jpg)/g)??[]);
    for(const src of allAssets) {
      const file=src.startsWith(`modules/${MODULE}/`)?join(ROOT,src.slice(`modules/${MODULE}/`.length)):
        src.startsWith("icons/")?join(core,"public",src):join(data,src);
      if(!existsSync(file))fail(`missing referenced asset: ${src}`);
    }
    notes.push(`core/system/module assets checked: ${allAssets.size}`);
    const urls = new Set(JSON.stringify(adv).match(/https:\/\/raw\.githubusercontent\.com\/IsThisMyRealName\/too-many-tokens-dnd\/main\/[^"\\]+/g) ?? []);
    for (const url of urls) {
      const [creature, filename] = url.split("/main/")[1].split("/").map(decodeURIComponent);
      const catalog = join(data,"modules/too-many-tokens-online/dnd/links",`${creature}.txt`);
      if (!existsSync(catalog) || !readFileSync(catalog,"utf8").split(/\r?\n/).includes(filename)) fail(`TMTO image absent from local catalog: ${url}`);
    }
    notes.push(`TMTO image references checked against local catalog: ${urls.size} (offline, not downloaded)`);
  }


  const journalTop = topLevel(journalPack, "journal");
  if (journalTop.length !== (adv.journal?.length ?? 0)) {
    fail(`journal pack holds ${journalTop.length} entr(ies) but the adventure bundles ${adv.journal?.length ?? 0}`);
  }

  console.log("\n".concat(notes.map(n => `  · ${n}`).join("\n")));
  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):\n` + problems.map(p => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\n✓ all cross-references resolve");
};

main().catch(err => { console.error(err); process.exit(1); });

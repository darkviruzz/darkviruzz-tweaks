#!/usr/bin/env node
/**
 * Build script for "Die Höhlen von Blackthorn".
 *
 * Reads the compact YAML sources under src/, expands them into full Foundry
 * documents, writes them as JSON into dist/pack-source/<pack>/ and then packs
 * each directory into a ClassicLevel database under packs/<pack>/ via the
 * official Foundry CLI.
 *
 * Foundry v11+ compendium packs ARE LevelDB directories — they cannot be shipped
 * as loose JSON, which is why this step exists at all.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import yaml from "js-yaml";

import { buildActor, xpForCR } from "./lib/actors.mjs";
import { buildItem } from "./lib/items.mjs";
import { buildJournal } from "./lib/journal.mjs";
import { buildScene } from "./lib/scene.mjs";
import { buildAdventure } from "./lib/adventure.mjs";
import { assignKeys } from "./lib/keys.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const STAGE = join(ROOT, "dist", "pack-source");
const PACKS = join(ROOT, "packs");

async function loadYamlDir(dir) {
  const path = join(SRC, dir);
  if (!existsSync(path)) return [];
  const files = (await readdir(path)).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
  const out = [];
  for (const file of files.sort()) {
    const parsed = yaml.load(await readFile(join(path, file), "utf8"));
    if (Array.isArray(parsed)) out.push(...parsed);
    else if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Writes one document per file, keyed for the CLI.
 *
 * `assignKeys` is not optional: the CLI silently skips any document without a
 * `_key`, so omitting it yields an empty pack and a zero exit code.
 */
async function stage(pack, collection, documents) {
  const dir = join(STAGE, pack);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const doc of documents) {
    assignKeys(doc, collection);
    await writeFile(join(dir, `${doc._id}.json`), JSON.stringify(doc, null, 2), "utf8");
  }
  return documents.length;
}

async function packOne(pack) {
  const cli = join(ROOT, "node_modules", ".bin", "fvtt");
  await execFileAsync(cli, [
    "package", "pack", "-n", pack,
    "--id", "caverns-of-blackthorn",
    "--type", "Module",
    "--in", join(STAGE, pack),
    "--out", PACKS
  ], { cwd: ROOT });
}

async function main() {
  const doPack = process.argv.includes("--pack") || !process.argv.includes("--no-pack");

  const creatureDefs = await loadYamlDir("creatures");
  const itemDefs = await loadYamlDir("items");
  const journalDefs = await loadYamlDir("journal");
  const sceneDefs = await loadYamlDir("scene");

  const actors = creatureDefs.map(buildActor);
  const items = itemDefs.map(buildItem);

  // The journal needs the actor roster so encounter blocks can link statblocks
  // by uuid and print each creature's XP without the numbers being retyped.
  const bestiary = new Map(
    creatureDefs.map((def, i) => [def.key, { id: actors[i]._id, name: def.name, cr: def.cr, xp: xpForCR(def.cr), img: def.tokenImg ?? def.img, size: actors[i].prototypeToken.width }])
  );
  const journals = journalDefs.map(def => buildJournal(def, { bestiary }));
  const scenes = sceneDefs.map(def => buildScene(def, { bestiary, journals }));

  const adventure = buildAdventure({ actors, items, journals, scenes });

  const counts = {
    "blackthorn-adventure": await stage("blackthorn-adventure", "adventures", [adventure]),
    "blackthorn-actors": await stage("blackthorn-actors", "actors", actors),
    "blackthorn-items": await stage("blackthorn-items", "items", items),
    "blackthorn-journal": await stage("blackthorn-journal", "journal", journals)
  };

  for (const [pack, n] of Object.entries(counts)) {
    console.log(`  staged ${String(n).padStart(3)} document(s) -> ${pack}`);
  }

  if (doPack) {
    await rm(PACKS, { recursive: true, force: true });
    for (const pack of Object.keys(counts)) {
      await packOne(pack);
      console.log(`  packed ${pack}`);
    }
  }

  console.log(`\nDone. ${actors.length} creatures, ${items.length} items, ${journals.length} journal entr(ies), ${scenes.length} scene(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

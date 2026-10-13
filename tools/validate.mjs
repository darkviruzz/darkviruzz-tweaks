#!/usr/bin/env node
/**
 * Repository validation for Darkviruzz Tweaks & QoL — zero dependencies.
 *
 * Run locally with `npm run validate` (or `node tools/validate.mjs`). CI runs it on every
 * pull request and before every release, so the conventions in CLAUDE.md are checked
 * mechanically instead of only being written down:
 *
 *   - module.json is consistent (version, download/manifest URLs, referenced files exist)
 *   - every script parses; feature files can be imported without Foundry globals
 *   - the feature contract holds (unique ids/keys, i18n keys exist, Boolean settings
 *     default to false, keybindings ship unbound)
 *   - en/de localisation files have the same keys and the same {placeholders}
 *   - README documents every setting/keybinding, CLAUDE.md lists every feature, and
 *     CHANGELOG.md has a section for the current version
 *   - each feature's init() runs without throwing against stubbed Foundry globals
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const fail = msg => errors.push(msg);
const warn = msg => warnings.push(msg);

const read = path => readFileSync(join(ROOT, path), "utf8");
const readJSON = path => JSON.parse(read(path));

/** All files below `dir` (repo-relative, forward slashes). */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

/** Strip JS comments (naive, but keeps "https://" inside strings intact). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** The set of {placeholders} in a localisation string. */
const placeholders = str => new Set(String(str).match(/\{[^}]+\}/g) ?? []);

/* ------------------------------------------------------------------ */
/*  1. module.json                                                    */
/* ------------------------------------------------------------------ */

let manifest = null;
try {
  manifest = readJSON("module.json");
} catch (err) {
  fail(`module.json: ${err.message}`);
}

if (manifest) {
  const { version, url } = manifest;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail(`module.json: version "${version}" is not x.y.z`);

  const expectedDownload = `${url}/releases/download/v${version}/module.zip`;
  if (manifest.download !== expectedDownload) {
    fail(`module.json: "download" must be ${expectedDownload} (got ${manifest.download})`);
  }
  const expectedManifest = `${url}/releases/latest/download/module.json`;
  if (manifest.manifest !== expectedManifest) {
    fail(`module.json: "manifest" must be the stable ${expectedManifest}`);
  }
  if (!(Number.parseInt(manifest.compatibility?.minimum, 10) >= 14)) {
    fail("module.json: compatibility.minimum must be 14 or newer (Foundry v14+ only)");
  }
  if (manifest.relationships?.systems?.length) {
    fail("module.json: don't declare relationships.systems — it would hide the module in other " +
      "systems' worlds; use requiresSystem per feature instead");
  }

  const referenced = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(l => l.path)
  ];
  for (const path of referenced) {
    if (!existsSync(join(ROOT, path))) fail(`module.json references a missing file: ${path}`);
  }
  for (const css of walk("styles").filter(f => f.endsWith(".css"))) {
    if (!manifest.styles?.includes(css)) fail(`${css} exists but is not listed in module.json "styles"`);
  }

  const moduleId = read("scripts/constants.js").match(/MODULE_ID\s*=\s*"([^"]+)"/)?.[1];
  if (moduleId !== manifest.id) fail(`scripts/constants.js MODULE_ID "${moduleId}" ≠ module.json id "${manifest.id}"`);
}

/* ------------------------------------------------------------------ */
/*  2. Localisation                                                   */
/* ------------------------------------------------------------------ */

const langs = {};
for (const { lang, path } of manifest?.languages ?? []) {
  try {
    langs[lang] = readJSON(path);
  } catch (err) {
    fail(`${path}: ${err.message}`);
  }
}
const en = langs.en ?? {};
if (!langs.en) fail("module.json must declare an English (en) language file");

for (const [lang, dict] of Object.entries(langs)) {
  if (lang === "en") continue;
  for (const key of Object.keys(en)) {
    if (!(key in dict)) { fail(`lang/${lang}.json is missing "${key}"`); continue; }
    const a = placeholders(en[key]);
    const b = placeholders(dict[key]);
    if (a.size !== b.size || [...a].some(p => !b.has(p))) {
      fail(`lang/${lang}.json "${key}" has placeholders ${[...b].join(" ") || "(none)"} but en has ${[...a].join(" ") || "(none)"}`);
    }
  }
  for (const key of Object.keys(dict)) {
    if (!(key in en)) fail(`lang/${lang}.json has "${key}", which en.json lacks`);
  }
}

/* ------------------------------------------------------------------ */
/*  3. Scripts: syntax + referenced i18n keys                         */
/* ------------------------------------------------------------------ */

const scripts = walk("scripts").filter(f => f.endsWith(".js"));
const usedKeys = new Set();
for (const file of scripts) {
  const check = spawnSync(process.execPath, ["--check", join(ROOT, file)], { encoding: "utf8" });
  if (check.status !== 0) fail(`${file}: syntax error\n${check.stderr.trim()}`);

  const src = stripComments(read(file));
  for (const [, key] of src.matchAll(/["'`](DT\.[A-Za-z0-9_.]+)["'`]/g)) {
    usedKeys.add(key);
    if (!(key in en)) fail(`${file}: i18n key "${key}" is not in lang/en.json`);
  }
}

/* ------------------------------------------------------------------ */
/*  4. Feature registry + contract                                    */
/* ------------------------------------------------------------------ */

let FEATURES = [];
try {
  // Imported BEFORE any Foundry globals are stubbed: a feature touching game/Hooks/CONFIG
  // at import time fails here, as it would be fragile in Foundry too.
  ({ FEATURES } = await import(pathToFileURL(join(ROOT, "scripts/features/index.js")).href));
} catch (err) {
  fail(`Importing scripts/features/index.js failed — feature files must not touch Foundry ` +
    `globals at import time: ${err.message}`);
}

const readme = existsSync(join(ROOT, "README.md")) ? read("README.md") : "";
const claude = existsSync(join(ROOT, "CLAUDE.md")) ? read("CLAUDE.md") : "";
const ids = new Set();
const settingKeys = new Set();
const actions = new Set();
const needKey = (where, key) => {
  if (!key) return fail(`${where}: missing i18n key`);
  if (!(key in en)) fail(`${where}: i18n key "${key}" is not in lang/en.json`);
};

for (const feature of FEATURES) {
  const where = `feature "${feature?.id}"`;
  if (!/^[a-z][A-Za-z0-9]*$/.test(feature?.id ?? "")) fail(`${where}: id must be camelCase`);
  if (ids.has(feature.id)) fail(`${where}: duplicate feature id`);
  ids.add(feature.id);
  if (feature.requiresSystem !== undefined && typeof feature.requiresSystem !== "string") {
    fail(`${where}: requiresSystem must be a system id string`);
  }
  if (feature.init !== undefined && typeof feature.init !== "function") fail(`${where}: init must be a function`);

  needKey(`${where} category.label`, feature.category?.label);
  if (feature.category?.hint) needKey(`${where} category.hint`, feature.category.hint);
  if (!claude.includes(`\`${feature.id}\``)) fail(`${where}: not listed in CLAUDE.md "Current features"`);

  for (const { key, options = {} } of feature.settings ?? []) {
    const sw = `${where} setting "${key}"`;
    if (settingKeys.has(key)) fail(`${sw}: duplicate setting key`);
    settingKeys.add(key);
    if (!["world", "user", "client"].includes(options.scope)) fail(`${sw}: scope must be world, user or client`);
    if (!options.type) fail(`${sw}: missing type`);
    if (options.type === Boolean && options.default !== false) {
      fail(`${sw}: Boolean settings must default to false (vanilla behaviour)`);
    }
    if (options.config !== false) {
      needKey(`${sw} name`, options.name);
      if (options.hint) needKey(`${sw} hint`, options.hint);
      if (en[options.name] && !readme.includes(en[options.name])) {
        fail(`${sw}: README.md does not mention "${en[options.name]}"`);
      }
    }
  }

  for (const { action, options = {} } of feature.keybindings ?? []) {
    const kw = `${where} keybinding "${action}"`;
    if (actions.has(action)) fail(`${kw}: duplicate action`);
    actions.add(action);
    needKey(`${kw} name`, options.name);
    if (options.hint) needKey(`${kw} hint`, options.hint);
    if (options.editable?.length) fail(`${kw}: must ship unbound (editable: []) — vanilla behaviour`);
    if (typeof options.onDown !== "function" && typeof options.onUp !== "function") {
      fail(`${kw}: needs an onDown or onUp handler`);
    }
    if (en[options.name] && !readme.includes(en[options.name])) {
      fail(`${kw}: README.md does not mention "${en[options.name]}"`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  5. Smoke test: run every init() against stubbed Foundry globals   */
/* ------------------------------------------------------------------ */

const hookNames = [];
const stubbed = ["Hooks", "game", "CONFIG", "CONST", "ui", "canvas", "foundry"];
Object.assign(globalThis, {
  Hooks: {
    on: name => { hookNames.push(name); return 0; },
    once: name => { hookNames.push(name); return 0; },
    off() {}, call() { return true; }, callAll() { return true; }
  },
  game: {
    system: { id: "dnd5e", version: "6.0.0" },
    settings: { get: () => undefined, set: async () => undefined },
    i18n: { localize: k => k, format: k => k, has: () => true },
    user: { isGM: true }, users: { activeGM: null }
  },
  CONFIG: {}, CONST: {}, ui: {}, canvas: null, foundry: { utils: {} }
});
for (const feature of FEATURES) {
  try {
    feature.init?.();
  } catch (err) {
    fail(`feature "${feature.id}": init() threw against stubbed globals: ${err.message}`);
  }
}
for (const name of stubbed) delete globalThis[name];
for (const name of hookNames) {
  if (typeof name !== "string" || !name) fail(`a feature registered a hook with an invalid name: ${name}`);
}

/* ------------------------------------------------------------------ */
/*  6. Changelog + unused keys                                        */
/* ------------------------------------------------------------------ */

if (manifest?.version) {
  const changelog = existsSync(join(ROOT, "CHANGELOG.md")) ? read("CHANGELOG.md") : "";
  if (!changelog.includes(`## [${manifest.version}]`)) {
    fail(`CHANGELOG.md has no "## [${manifest.version}]" section (used as the release notes)`);
  }
}

const declaredKeys = new Set();
for (const feature of FEATURES) {
  declaredKeys.add(feature.category?.label).add(feature.category?.hint);
  for (const { options = {} } of [...(feature.settings ?? []), ...(feature.keybindings ?? [])]) {
    declaredKeys.add(options.name).add(options.hint);
    for (const label of Object.values(options.choices ?? {})) declaredKeys.add(label);
  }
}
for (const key of Object.keys(en)) {
  if (!usedKeys.has(key) && !declaredKeys.has(key)) warn(`lang/en.json "${key}" looks unused`);
}

/* ------------------------------------------------------------------ */

const rel = relative(process.cwd(), ROOT) || ".";
for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\nvalidate: ${errors.length} error(s) in ${rel}`);
  process.exit(1);
}
console.log(`validate: OK — ${FEATURES.length} feature(s), ${settingKeys.size} setting(s), ` +
  `${actions.size} keybinding(s), ${scripts.length} script(s), v${manifest.version}` +
  (warnings.length ? ` (${warnings.length} warning(s))` : ""));

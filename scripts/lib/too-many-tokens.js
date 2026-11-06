/**
 * Data adapter for the image catalogue of "Too Many Tokens – Online" (module id
 * `too-many-tokens-online`, IsThisMyRealName, v2.0.1 — unmaintained since 2024).
 *
 * How TMT Online provides its catalogue (verified 2026-10-25 against v2.0.1 and the GitHub
 * repos): the module ships only text lists, the images live on GitHub and are loaded straight
 * from raw.githubusercontent.com (CORS `*`, ~40 KB WebP each):
 *
 *   modules/too-many-tokens-online/<system>/names.txt          one creature name per line
 *   modules/too-many-tokens-online/<system>/links/<name>.txt   one image file name per line
 *                                                              (+ "Prompts.txt" lines to skip)
 *   image URL = <base of system><creature>/<file>
 *     dnd → https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-dnd/main/
 *     pf  → https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-pf/main/Tokens/
 *
 * dnd: 374 creatures / 16 022 images, identical to the GitHub tree. pf: 234 creatures / 7 737
 * listed, 60 of them ("Xulgath Leader/*.jpg") no longer exist on GitHub — callers must cope
 * with broken images. File names are "<CreatureNoSpaces><Attribute…> (n).webp", e.g.
 * "BanditHalflingUrbanFemaleMelee (3).webp"; the attributes are CamelCase words in no fixed
 * order (TMT's own macro assumed fixed positions), with a few typos ("Costal", "Halfing").
 *
 * TMT's own wildcard is a fake prototype path
 * `tmtopptmtopptmtopp_<system>_<Creature[/Creature…]>_<regex>[.webp]` that its `createToken`
 * hook resolves; we only read it (to preselect images when converting).
 *
 * Pure helpers + fetches; no Foundry globals at import time.
 */

export const TMT_MODULE_ID = "too-many-tokens-online";

export const TMT_SYSTEMS = {
  dnd: "https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-dnd/main/",
  pf: "https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-pf/main/Tokens/"
};

const LEGACY_PREFIX = "tmtopptmtopptmtopp";
const IMAGE_FILE = /\.(webp|png|jpe?g|gif|avif)$/i;
const TMT_URL = /^https:\/\/raw\.githubusercontent\.com\/IsThisMyRealName\/too-many-tokens-(dnd|pf)\/main\/(?:Tokens\/)?([^/]+)\/([^/]+)$/;

/** Is the TMT module installed (active or not — its files are served either way)? */
export function tmtInstalled() {
  return !!game.modules?.get(TMT_MODULE_ID);
}

/** decodeURIComponent that never throws. */
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Compare image paths/URLs regardless of percent-encoding ("%20" vs " "). */
export function sameImage(a, b) {
  return !!a && !!b && decode(String(a)) === decode(String(b));
}

/** The image lines of a TMT list file (skips blanks and "Prompts.txt"-style entries). */
export function parseListing(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => IMAGE_FILE.test(line));
}

/** Full image URL of a catalogue entry. */
export function imageUrl(system, creature, file) {
  return `${TMT_SYSTEMS[system]}${encodeURIComponent(creature)}/${encodeURIComponent(file)}`;
}

/** {system, creature, file} for a TMT image URL (either encoding), else null. */
export function parseImageUrl(src) {
  const match = TMT_URL.exec(decode(String(src ?? "")));
  return match ? { system: match[1], creature: match[2], file: match[3] } : null;
}

/** A catalogue entry rebuilt from a TMT image URL (keeps the URL as given), else null. */
export function variantFromUrl(url) {
  const parsed = parseImageUrl(url);
  return parsed ? { url, ...parsed, ...describeVariant(parsed.creature, parsed.file) } : null;
}

/** {system, creatures, regex} for a TMT legacy wildcard prototype path, else null. */
export function parseLegacyWildcard(src) {
  const path = String(src ?? "");
  if (!path.startsWith(LEGACY_PREFIX)) return null;
  const [system, creatures = "", ...rest] = path.slice(LEGACY_PREFIX.length).split("_").filter(Boolean);
  if (!TMT_SYSTEMS[system]) return null;
  let regex = null;
  try {
    regex = new RegExp(rest.join("_") || ".*", "i");
  } catch {
    regex = /.*/;
  }
  return { system, creatures: creatures.split("/").filter(Boolean), regex };
}

/** Spelling variants/typos in TMT's file names, folded so that one filter chip covers them. */
const TAG_ALIASES = {
  Halfelf: "HalfElf", Halforc: "HalfOrc", Halfing: "Halfling", Halflin: "Halfling",
  Costal: "Coastal", Grasland: "Grassland", Dessert: "Desert", Mountain: "Mountains",
  Hill: "Hills", Kight: "Knight", Agressive: "Aggressive", Guradian: "Guardian", Sheperd: "Shepherd"
};

/** Split a CamelCase run into words, keeping TMT's compounds (HalfOrc, HalfElf, NSFW). */
function camelWords(text) {
  return (text.match(/NSFW|Half(?:Orc|Elf)|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [])
    .filter(word => word !== "Of")
    .map(word => TAG_ALIASES[word] ?? word);
}

/** `stem` without a leading `prefix` (compared on letters/digits only, case-insensitive). */
function stripPrefix(stem, prefix) {
  const p = prefix.toLowerCase();
  let i = 0;
  let j = 0;
  while (i < stem.length && j < p.length) {
    const c = stem[i].toLowerCase();
    if (!/[a-z0-9]/.test(c)) { i++; continue; }
    if (c !== p[j]) return stem;
    i++;
    j++;
  }
  return j === p.length ? stem.slice(i) : stem;
}

/**
 * Variant info of a file: `tags` = the words of the file name without the creature prefix,
 * the " (n)" counter, "_cleanup" and the extension ("BanditHalflingUrbanFemaleMelee (3).webp"
 * → Halfling, Urban, Female, Melee); `stem` = the tags joined with spaces.
 */
export function describeVariant(creature, file) {
  let stem = String(file).replace(IMAGE_FILE, "").replace(/_cleanup$/i, "").replace(/\s*\(\d+\)\s*$/, "").trim();
  stem = stripPrefix(stem, String(creature).replace(/[^A-Za-z0-9]/g, ""));
  // Unnamed files (e.g. "_017aa1ad-….jpg") have no meaningful words.
  const tags = /^[_-]?[0-9a-f]{8}-/i.test(stem) ? [] : [...new Set(camelWords(stem))];
  return { stem: tags.join(" "), tags };
}

/* ---------- name matching ---------- */

const STOP_WORDS = new Set(["the", "of", "a", "an", "and", "der", "die", "das", "von", "und"]);

/** D&D 2024 Monster Manual names → the 2014 names TMT uses. */
const NAME_ALIASES = {
  "tough": "Thug",
  "warrior infantry": "Tribal Warrior",
  "warrior veteran": "Veteran",
  "cultist fanatic": "Cult Fanatic",
  "priest acolyte": "Acolyte"
};

function words(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(" ")
    .filter(w => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** How well a TMT creature name fits one hint string (0 = not at all). */
function scoreName(creatureWords, hintWords) {
  if (!creatureWords.length || !hintWords.length) return 0;
  const a = creatureWords.join(" ");
  const b = hintWords.join(" ");
  if (a === b) return 100;
  if (` ${b} `.includes(` ${a} `)) return 60 + creatureWords.length * 5;  // "Bandit Captain" in "Bandit Captain 2"
  if (` ${a} `.includes(` ${b} `)) return 50;                             // hint "Guard" → "Guard Drake"
  const common = creatureWords.filter(w => hintWords.includes(w)).length;  // "Warrior Veteran" → "Veteran"
  return common ? Math.round((common / creatureWords.length) * 40) : 0;
}

/**
 * TMT creature names ranked by how well they fit any of the hint strings (token name, actor
 * name, compendium source name…). Returns `[{name, score}]`, best first, score > 0 only.
 */
export function rankCreatures(names, hints, limit = 8) {
  const hintWords = hints.map(words).filter(w => w.length);
  for (const hw of [...hintWords]) {
    for (const [from, to] of Object.entries(NAME_ALIASES)) {
      if (` ${hw.join(" ")} `.includes(` ${from} `)) hintWords.push(words(to));
    }
  }
  return names
    .map(name => {
      const cw = words(name);
      return { name, score: Math.max(0, ...hintWords.map(hw => scoreName(cw, hw))) };
    })
    .filter(entry => entry.score > 0)
    .sort((x, y) => (y.score - x.score) || x.name.localeCompare(y.name))
    .slice(0, limit);
}

/* ---------- wildcard pool (stored compactly on the actor) ---------- */

/** {base, files} with the longest common "/"-terminated prefix factored out. */
export function compactPool(urls) {
  const list = [...new Set(urls)].filter(Boolean);
  if (!list.length) return null;
  let base = list[0].slice(0, list[0].lastIndexOf("/") + 1);
  while (base && !list.every(url => url.startsWith(base))) {
    base = base.slice(0, base.lastIndexOf("/", base.length - 2) + 1);
  }
  return { base, files: list.map(url => url.slice(base.length)) };
}

/** The URLs of a stored pool (also accepts a plain array). */
export function expandPool(pool) {
  if (Array.isArray(pool)) return pool.filter(u => typeof u === "string" && u);
  if (!pool || !Array.isArray(pool.files)) return [];
  const base = typeof pool.base === "string" ? pool.base : "";
  return pool.files.filter(f => typeof f === "string" && f).map(f => base + f);
}

/** A random entry, avoiding `previous` when there is a choice. */
export function randomPick(list, previous = null, random = Math.random) {
  const choices = list.length > 1 ? list.filter(x => x !== previous) : list;
  return choices[Math.floor(random() * choices.length)] ?? null;
}

/** Spread `urls` over `count` targets: no repeats until every image was used once. */
export function distribute(urls, count, random = Math.random) {
  const out = [];
  let bag = [];
  while (out.length < count && urls.length) {
    if (!bag.length) {
      bag = [...urls];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    out.push(bag.pop());
  }
  return out;
}

/* ---------- fetching (cached per session) ---------- */

const cache = new Map();

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${path}`);
  return response.text();
}

function cached(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(err => { cache.delete(key); throw err; }));
  return cache.get(key);
}

/** All creature names of a system (sorted). */
export function loadCreatureNames(system) {
  return cached(`names:${system}`, async () => {
    const text = await fetchText(`modules/${TMT_MODULE_ID}/${system}/names.txt`);
    const names = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });
}

/** The variants of one creature, naturally sorted: `[{url, file, creature, system, stem, tags}]`. */
export function loadVariants(system, creature) {
  return cached(`links:${system}:${creature}`, async () => {
    const text = await fetchText(`modules/${TMT_MODULE_ID}/${system}/links/${encodeURIComponent(creature)}.txt`);
    return parseListing(text)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map(file => ({ url: imageUrl(system, creature, file), file, creature, system, ...describeVariant(creature, file) }));
  });
}

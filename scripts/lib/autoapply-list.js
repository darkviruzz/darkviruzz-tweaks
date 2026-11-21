/**
 * Pure helpers for the Spell Effect Auto-Apply list (feature `spellEffectAutoApply`).
 *
 * No Foundry globals: everything here works on plain item-shaped data, so the settings
 * widget, the chat-card quick add, the context-menu entry and tools/test-features.mjs all
 * share one classification.
 *
 * Item shape used (dnd5e 5.3 and 6.x): `item.name`, `item.type`, `item.system.level` (spells),
 * `item.system.range`, `item.effects` (a Collection/Map with `get(id)`) and
 * `item.system.activities` (a Collection; arrays and plain objects are accepted too). Each
 * activity: `type` (attack, save, damage, heal, utility, check, enchant, summon, cast,
 * forward, transform …), `range.units` (the effective value — inherited from the item unless
 * overridden), `effects` = `[{_id, uuid?, level}]` (AppliedEffectField).
 */

/** Range units that can mean "used on yourself" (dnd5e `CONFIG.DND5E.rangeTypes`). */
export const SELF_RANGES = new Set(["self", "touch"]);

/**
 * Activity types whose effects are never auto-applied to the user: attack / save / damage
 * effects are riders for the creature that is hit (Color Spray, the Smites, Shocking Grasp …),
 * enchant effects are enchantments for items (they have their own tray).
 */
export const BLOCKED_ACTIVITY_TYPES = new Set(["attack", "save", "damage", "enchant"]);

/** Distance units for which the range value is meaningful in a label. */
const DISTANCE_UNITS = new Set(["ft", "mi", "m", "km"]);

/**
 * Curated defaults, grouped. Each entry was checked against the dnd5e 6.0.6 SRD packs and the
 * PHB/DMG modules: a Self/Touch activity that offers exactly one effect — except the
 * "choices" group, whose items offer several effects (they need the Ask setting).
 */
export const CURATED_DEFAULTS = Object.freeze({
  spells: Object.freeze([
    "Mage Armor", "Shield", "Longstrider", "Jump", "Darkvision", "See Invisibility", "Invisibility",
    "Greater Invisibility", "Fly", "Gaseous Form", "Spider Climb", "Barkskin", "Stoneskin", "Tongues",
    "Comprehend Languages", "Speak with Animals", "Detect Magic", "Detect Evil and Good",
    "Detect Poison and Disease", "Disguise Self", "Alter Self", "Divine Favor", "Heroism",
    "Protection from Evil and Good", "Protection from Poison", "Pass without Trace", "Death Ward",
    "Freedom of Movement", "Nondetection", "True Seeing", "Mind Blank", "Foresight", "Glibness",
    "Etherealness", "Fount of Moonlight"
  ]),
  choices: Object.freeze(["Guidance", "Resistance", "Enhance Ability", "Protection from Energy"]),
  features: Object.freeze([
    "Rage", "Draconic Flight", "Innate Sorcery", "Monk's Focus", "Large Form", "Stonecunning",
    "Nature's Veil", "Dragon Wings", "Superior Defense", "Cunning Action", "Defensive Duelist",
    "Peerless Athlete"
  ]),
  items: Object.freeze([
    "Potion of Flying", "Potion of Invisibility", "Potion of Greater Invisibility",
    "Potion of Invulnerability", "Potion of Water Breathing", "Potion of Climbing", "Winged Boots",
    "Wings of Flying", "Cloak of the Bat"
  ])
});

/** All curated names in group order. */
export const CURATED_NAMES = Object.freeze(Object.values(CURATED_DEFAULTS).flat());

/* -------------------------------------------- */
/*  The stored list                              */
/* -------------------------------------------- */

/** Normalised lookup key of a name. */
export const nameKey = name => String(name ?? "").trim().toLowerCase();

/**
 * Parse the stored list (comma, semicolon or newline separated) into display names —
 * trimmed, without empties, case-insensitive duplicates dropped (first spelling wins).
 */
export function parseList(raw) {
  const seen = new Set();
  const names = [];
  for (const part of String(raw ?? "").split(/[,;\n]/)) {
    const name = part.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** The storage format: one comma-separated string (unchanged since v1.5). */
export const serialiseList = names => parseList(names.join(",")).join(", ");

/** Add names (any separators) to a stored list; returns the new stored string. */
export const addToList = (raw, ...names) => serialiseList([...parseList(raw), ...names.flatMap(n => parseList(n))]);

/** Remove a name (case-insensitive) from a stored list; returns the new stored string. */
export const removeFromList = (raw, name) => serialiseList(parseList(raw).filter(n => nameKey(n) !== nameKey(name)));

/** Is the name on the stored list (case-insensitive)? */
export const listHas = (raw, name) => parseList(raw).some(n => nameKey(n) === nameKey(name));

/* -------------------------------------------- */
/*  Classifying an item                          */
/* -------------------------------------------- */

/** The activities of an item as an array. */
export function activitiesOf(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  if (Array.isArray(acts)) return acts;
  if (Array.isArray(acts.contents)) return acts.contents;
  if (typeof acts.values === "function") return Array.from(acts.values());
  return Object.values(acts);
}

/** The effective range of an activity (activities inherit the item's range unless overridden). */
export const rangeOf = (activity, item) => activity?.range ?? item?.system?.range ?? activity?.item?.system?.range ?? null;

/** A short label for a range: "90 ft", "touch", "self", "any" … */
export function rangeLabel(range) {
  const units = range?.units;
  if (!units) return "";
  const value = range.value ?? range.reach;
  return (DISTANCE_UNITS.has(units) && (value !== undefined) && (value !== null) && (value !== ""))
    ? `${value} ${units}` : String(units);
}

/** Is this activity a self/touch range activity? */
export const isSelfRange = (activity, item) => SELF_RANGES.has(rangeOf(activity, item)?.units);

/** Is this activity's type one whose effects may be auto-applied to the user (guard B)? */
export const isAllowedActivity = activity => !BLOCKED_ACTIVITY_TYPES.has(activity?.type);

/** How many effects an activity references that actually exist (an external uuid counts). */
export function activityEffectCount(activity, item) {
  const parent = item ?? activity?.item;
  return (activity?.effects ?? []).filter(e => {
    if (!e) return false;
    if (e.uuid) return true;
    const id = e._id ?? e.id;
    const effects = parent?.effects;
    return !!id && (typeof effects?.get === "function" ? !!effects.get(id) : false);
  }).length;
}

/** Can this activity auto-apply (allowed type, self/touch range, at least one effect)? */
export const isUsableActivity = (activity, item) =>
  isAllowedActivity(activity) && isSelfRange(activity, item) && (activityEffectCount(activity, item) > 0);

/**
 * Classify one item for the list.
 * @returns {{status: "ok"|"choice"|"never", count: number, reason?: string, range?: string}}
 *   ok = a usable activity offers exactly one effect; choice = usable activities offer several
 *   (count = the smallest number); never = no usable activity, with the reason:
 *   "noActivity", "noEffect" (no activity references an effect), "range" (an allowed activity
 *   with an effect exists, but not with Self/Touch range — `range` says which), "rider" (only
 *   attack/save/damage/enchant activities carry effects).
 */
export function classifyItem(item) {
  const activities = activitiesOf(item);
  if (!activities.length) return { status: "never", count: 0, reason: "noActivity" };
  const withEffects = activities.filter(a => activityEffectCount(a, item) > 0);
  if (!withEffects.length) return { status: "never", count: 0, reason: "noEffect" };
  const usable = withEffects.filter(a => isAllowedActivity(a) && isSelfRange(a, item));
  if (usable.length) {
    const counts = usable.map(a => activityEffectCount(a, item));
    if (counts.includes(1)) return { status: "ok", count: 1 };
    return { status: "choice", count: Math.min(...counts) };
  }
  const allowed = withEffects.filter(isAllowedActivity);
  if (allowed.length) return { status: "never", count: 0, reason: "range", range: rangeLabel(rangeOf(allowed[0], item)) };
  return { status: "never", count: 0, reason: "rider" };
}

/** The list group of an item: "spell", "feature" or "item". */
export function itemGroup(item) {
  if (item?.type === "spell") return "spell";
  if (item?.type === "feat") return "feature";
  return "item";
}

const STATUS_RANK = { ok: 3, choice: 2, never: 1 };

/**
 * Index the items of the world by name.
 * @param {{item: object, pc?: boolean}[]} entries  Every embedded item with whether its actor
 *                                                   is a player character.
 * @returns {Map<string, {name, group, level, status, count, reason, range, pc}>}  Keyed by
 *   `nameKey`; for several items of one name the best status wins (ok > choice > never),
 *   group/level come from the first item, `pc` is true if any of them is on a PC.
 */
export function buildIndex(entries) {
  const index = new Map();
  for (const { item, pc = false } of entries ?? []) {
    const key = nameKey(item?.name);
    if (!key) continue;
    const info = classifyItem(item);
    const level = (item.type === "spell") ? Number(item.system?.level ?? 0) : null;
    const known = index.get(key);
    if (!known) {
      index.set(key, { name: String(item.name).trim(), group: itemGroup(item), level, pc: !!pc, ...info });
      continue;
    }
    known.pc ||= !!pc;
    if ((level !== null) && ((known.level === null) || (level < known.level))) known.level = level;
    if (STATUS_RANK[info.status] > STATUS_RANK[known.status]) {
      Object.assign(known, { status: info.status, count: info.count, reason: info.reason, range: info.range });
    }
  }
  return index;
}

/**
 * Names worth offering in the add field: items that can auto-apply (ok or choice) and are not
 * on the list yet — player characters' items first, then alphabetically.
 */
export function candidatesFromIndex(index, raw) {
  const listed = new Set(parseList(raw).map(nameKey));
  return Array.from(index?.values() ?? [])
    .filter(info => (info.status !== "never") && !listed.has(nameKey(info.name)))
    .sort((a, b) => (Number(b.pc) - Number(a.pc)) || a.name.localeCompare(b.name))
    .map(info => info.name);
}

/**
 * The stored list arranged for display: groups spell / feature / item / unknown, spells sorted
 * by level then name, the others by name.
 * @returns {{group: string, entries: {name, info: object|null}[]}[]}  Only non-empty groups.
 */
export function groupList(raw, index) {
  const groups = { spell: [], feature: [], item: [], unknown: [] };
  for (const name of parseList(raw)) {
    const info = index?.get(nameKey(name)) ?? null;
    groups[info?.group ?? "unknown"].push({ name, info });
  }
  groups.spell.sort((a, b) => ((a.info.level ?? 0) - (b.info.level ?? 0)) || a.name.localeCompare(b.name));
  for (const key of ["feature", "item", "unknown"]) groups[key].sort((a, b) => a.name.localeCompare(b.name));
  return Object.entries(groups).filter(([, entries]) => entries.length).map(([group, entries]) => ({ group, entries }));
}

/** Curated defaults not on the list yet, by curated group (empty groups dropped). */
export function missingSuggestions(raw) {
  const listed = new Set(parseList(raw).map(nameKey));
  return Object.entries(CURATED_DEFAULTS)
    .map(([group, names]) => ({ group, names: names.filter(n => !listed.has(nameKey(n))) }))
    .filter(g => g.names.length);
}

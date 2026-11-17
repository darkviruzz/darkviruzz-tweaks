/**
 * Pure helpers for comparing document snapshots (`doc.toObject()` data) — used by the
 * Combat Snapshot feature. No Foundry globals: tested in plain Node.
 *
 * Objects are flattened to dot paths; arrays and primitives are leaves (an array is compared
 * and restored as a whole). A path present now but missing in the snapshot is deleted
 * (`ForcedDeletion` in v14, else the legacy `parent.-=leaf` key).
 */

const isPlainObject = value => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** `{a: {b: 1, c: [2]}}` → `{"a.b": 1, "a.c": [2]}`; empty objects produce no entry. */
export function flatten(object, prefix = "", out = {}) {
  if (!isPlainObject(object)) return out;
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

export function sameValue(a, b) {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Copy of `data` with only the wanted top-level keys. */
function pick(data, { keys, exclude = [], skipPrivate = false } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (keys && !keys.includes(key)) continue;
    if (exclude.includes(key)) continue;
    if (skipPrivate && key.startsWith("_")) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Field differences between the current data and the snapshot data.
 * @returns {{path: string, from: *, to: *}[]} `from` = now, `to` = snapshot (sorted by path)
 */
export function diffFields(current, saved, options = {}) {
  const now = flatten(pick(current, options));
  const then = flatten(pick(saved, options));
  const paths = new Set([...Object.keys(now), ...Object.keys(then)]);
  return [...paths]
    .filter(path => !sameValue(now[path], then[path]))
    .sort()
    .map(path => ({ path, from: now[path], to: then[path] }));
}

/**
 * Match two arrays of embedded document data by `_id`.
 * @returns {{missing: object[], added: object[], common: [object, object][]}}
 *   missing = in the snapshot only, added = now only, common = [current, saved]
 */
export function diffCollection(current = [], saved = []) {
  const now = new Map((current ?? []).map(d => [d._id, d]));
  const then = new Map((saved ?? []).map(d => [d._id, d]));
  return {
    missing: [...then.values()].filter(d => !now.has(d._id)),
    added: [...now.values()].filter(d => !then.has(d._id)),
    common: [...then.values()].filter(d => now.has(d._id)).map(d => [now.get(d._id), d])
  };
}

const OPERATOR_KEY = "__$OPERATOR$__";

/**
 * Plain, JSON-safe copy of document data without Foundry's data operators. dnd5e 6 leaves
 * `ForcedDeletion` operators in item sources (`flags.dnd5e.riders`); `toObject()` returns them as
 * class instances, JSON as `{"__$OPERATOR$__": "ForcedDeletion"}` — both are dropped here, so live
 * data and a stored snapshot compare equal.
 */
export function normalizeData(data) {
  if (data === undefined) return undefined;
  return JSON.parse(JSON.stringify(data), (key, value) =>
    (value && typeof value === "object" && !Array.isArray(value) && OPERATOR_KEY in value ? undefined : value));
}

/**
 * `[{path, value}]` → a flat Foundry update object; `undefined` = delete the key. `deletion()` returns
 * the v14 deletion value (`ForcedDeletion.create()`); without it the legacy `-=key` syntax is used
 * (deprecated in v14).
 */
export function updateData(changes, { deletion } = {}) {
  const out = {};
  for (const { path, value } of changes) {
    if (value !== undefined) {
      out[path] = value;
      continue;
    }
    const operator = deletion?.();
    if (operator !== undefined) {
      out[path] = operator;
      continue;
    }
    const cut = path.lastIndexOf(".");
    out[cut < 0 ? `-=${path}` : `${path.slice(0, cut)}.-=${path.slice(cut + 1)}`] = null;
  }
  return out;
}

/** Short display text of a leaf value. */
export function formatValue(value, max = 60) {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Seconds → "1 d 2 h 3 min 4 s" (sign kept, zero parts dropped). */
export function formatDuration(seconds) {
  const sign = seconds < 0 ? "−" : "";
  let rest = Math.round(Math.abs(seconds));
  if (!rest) return "0 s";
  const parts = [];
  for (const [unit, size] of [["d", 86400], ["h", 3600], ["min", 60], ["s", 1]]) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n) parts.push(`${n} ${unit}`);
  }
  return sign + parts.join(" ");
}

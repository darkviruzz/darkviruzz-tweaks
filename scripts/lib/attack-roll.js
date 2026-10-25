/**
 * Helpers for dnd5e attack rolls, shared by the features that react to hits and misses.
 *
 * dnd5e (5.3.3 and 6.0.6) stores the AC it evaluates an attack against in two places: the
 * attack roll's `options.target` — only when exactly ONE target was selected — and per target
 * in the message's target descriptors (`message.system.targets` in 6.x,
 * `flags.dnd5e.targets` in 5.x), each with its own `ac` (null for total cover or an actor
 * without AC). A natural 20 always hits, a natural 1 always misses (`D20Roll#isCritical` /
 * `#isFumble`; `#isSuccess` ignores both).
 */

/**
 * Did the attack roll hit the given AC?
 * @param {object} roll          An evaluated D20Roll (total, isCritical, isFumble).
 * @param {number|string|null} ac
 * @returns {boolean|null}       true/false when the AC is known, null when it isn't — the GM decides.
 */
export function hitAgainst(roll, ac) {
  if ((ac === undefined) || (ac === null) || (ac === "") || !Number.isFinite(Number(ac))) return null;
  if (roll?.isCritical) return true;
  if (roll?.isFumble) return false;
  return roll?.total >= Number(ac);
}

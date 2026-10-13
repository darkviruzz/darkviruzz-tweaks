/**
 * Feature: Reset Movement History Each Round (system-agnostic)
 * -----------------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * During a started combat Foundry records each combatant token's movement history (shown by
 * the ruler / movement measurement). Core clears it from the combat's turn machinery: since
 * v14 build 14.353 `Combat#_clearMovementHistoryOnStartTurn` clears ALL combatants at every
 * turn start (before that only the combatant whose turn started), plus on combatant removal
 * and combat deletion. Those turn events run only on the active GM's client, only while the
 * combat moves forward, and not for updates made with `turnEvents: false`; systems may also
 * override the method ("it's up to the system", per the Foundry developers in #13686).
 *
 * So history can survive into a new round when the turn machinery was skipped (no GM
 * connected at the time, a module advancing the combat without turn events, a system
 * override). This feature is a safety net that does not depend on that machinery: whenever a
 * combat's round advances, the active GM clears the movement history of all its combatants.
 *
 * Implementation: the `updateCombat` hook fires on every client after any combat update; we
 * act when `round` changed, the update didn't go backwards (core passes `direction: -1` from
 * previousRound/previousTurn), and only on the active GM's client — clearing is a Token
 * update, which only a GM may do for every combatant. `Combat#clearMovementHistories()`
 * skips tokens whose history is already empty, so running alongside core's own clearing is
 * harmless.
 *
 * World-scoped (GM), off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY = "movementHistoryResetEachRound";

async function onUpdateCombat(combat, changed, options) {
  try {
    if (!("round" in changed)) return;
    if (options?.direction === -1) return;
    if (!game.settings.get(MODULE_ID, KEY)) return;
    if (!game.users.activeGM?.isSelf) return;
    if (!combat.started) return;

    const pending = combat.combatants.filter(c => c.token?.movementHistory?.length).length;
    if (!pending) return;

    await combat.clearMovementHistories();
    console.debug(`${MODULE_ID} | round ${combat.round}: cleared the movement history of ${pending} combatant(s).`);
  } catch (err) {
    console.error(`${MODULE_ID} | movement history reset failed`, err);
  }
}

export default {
  id: "movementHistoryReset",
  category: {
    label: "DT.Categories.MovementHistoryReset.Label",
    hint: "DT.Categories.MovementHistoryReset.Hint"
  },
  settings: [
    {
      key: KEY,
      options: {
        name: "DT.Settings.MovementHistoryResetEachRound.Name",
        hint: "DT.Settings.MovementHistoryResetEachRound.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.on("updateCombat", onUpdateCombat);
  }
};

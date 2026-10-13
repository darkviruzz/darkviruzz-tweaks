/**
 * Feature: Pause Control (system-agnostic)
 * ----------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Replacement for the unmaintained "Koboldworks – Pause Control" module (last release 2024,
 * verified for Foundry 12). Same four options, rebuilt on current APIs:
 *
 *   - Unpause when the world loads   — worlds always activate paused; the GM's client
 *                                      unpauses on `ready`.
 *   - Unpause when combat starts      — when a combat begins (round 0 → 1).
 *   - Pause during NPC turns          — while a combat runs, pause on turns of combatants
 *                                      without a player owner, unpause on player turns.
 *   - Restore pause after combat      — remember the pause state when a combat is created
 *                                      and restore it when the combat is deleted (ended).
 *
 * Fixes compared to the original:
 *   - "Pause on NPC turns" read `combat.data.combatants`, which no longer exists since
 *     Foundry v13 — it threw on every combat update and never worked. We use
 *     `Combat#combatant` / `Combatant#isNPC`, which also works when the combatant's token is
 *     not on the scene being viewed (the original looked the token up on the canvas).
 *   - "Unpause on combat" fired on EVERY combat update, so it unpaused again after each turn
 *     and fought the NPC-turn pause. Here it only acts when the combat actually starts, and a
 *     single handler decides the pause state, so the options combine predictably.
 *   - `game.togglePause(state, true)` (boolean second argument, deprecated since v13 and
 *     removed in v15) → `game.togglePause(state, { broadcast: true })`.
 *   - All writes run on ONE client: the active GM (`game.users.activeGM`). Only a GM may
 *     broadcast a pause change.
 *
 * Verified (v13 source / v14 API): Combat#startCombat updates `{round: 1, turn: 0}` without
 * a `direction` option; next/previous round/turn pass `{direction: ±1}`; `Combat#started` is
 * `round > 0`; `Combatant#isNPC` is `!actor || !hasPlayerOwner`; createCombat/updateCombat/
 * deleteCombat fire on every client.
 *
 * World-scoped (GM), all off by default. Disable Koboldworks Pause Control when using this.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ON_LOAD      = "pauseUnpauseOnLoad";
const KEY_COMBAT_START = "pauseUnpauseOnCombatStart";
const KEY_NPC_TURNS    = "pauseDuringNpcTurns";
const KEY_RESTORE      = "pauseRestoreAfterCombat";

/** Combat flag: was the game paused when this combat was created? */
const FLAG_BEFORE = "pausedBeforeCombat";

const setting = key => game.settings.get(MODULE_ID, key);
const isActiveGM = () => !!game.users.activeGM?.isSelf;

/** Set the pause state for everyone, if it differs. GM only. */
function setPaused(paused, reason) {
  if (game.paused === paused) return;
  game.togglePause(paused, { broadcast: true });
  console.debug(`${MODULE_ID} | ${paused ? "paused" : "unpaused"} the game (${reason}).`);
}

function onReady() {
  if (isActiveGM() && setting(KEY_ON_LOAD)) setPaused(false, "world loaded");
}

async function onCreateCombat(combat) {
  try {
    if (!isActiveGM() || !setting(KEY_RESTORE)) return;
    await combat.setFlag(MODULE_ID, FLAG_BEFORE, game.paused);
  } catch (err) {
    console.error(`${MODULE_ID} | pause control (record state) failed`, err);
  }
}

function onUpdateCombat(combat, changed, options) {
  try {
    if (!isActiveGM()) return;
    if (!("round" in changed) && !("turn" in changed)) return;
    if (!combat.started || !combat.combatants.size) return;

    // NPC-turn control decides the state on every turn change while it is enabled …
    const combatant = combat.combatant;
    if (setting(KEY_NPC_TURNS) && combatant) {
      setPaused(combatant.isNPC, combatant.isNPC ? "NPC turn" : "player turn");
      return;
    }

    // … otherwise only the start of the combat (round 0 → 1, not a rewind) unpauses.
    const started = (changed.round === 1) && (options?.direction !== -1);
    if (started && setting(KEY_COMBAT_START)) setPaused(false, "combat started");
  } catch (err) {
    console.error(`${MODULE_ID} | pause control (combat) failed`, err);
  }
}

function onDeleteCombat(combat) {
  try {
    if (!isActiveGM() || !setting(KEY_RESTORE)) return;
    const before = combat.getFlag(MODULE_ID, FLAG_BEFORE);
    if (typeof before === "boolean") setPaused(before, "combat ended — restoring");
  } catch (err) {
    console.error(`${MODULE_ID} | pause control (restore state) failed`, err);
  }
}

const worldToggle = (key, i18n) => ({
  key,
  options: {
    name: `DT.Settings.${i18n}.Name`,
    hint: `DT.Settings.${i18n}.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  }
});

export default {
  id: "pauseControl",
  category: {
    label: "DT.Categories.PauseControl.Label",
    hint: "DT.Categories.PauseControl.Hint"
  },
  settings: [
    worldToggle(KEY_ON_LOAD, "PauseUnpauseOnLoad"),
    worldToggle(KEY_COMBAT_START, "PauseUnpauseOnCombatStart"),
    worldToggle(KEY_NPC_TURNS, "PauseDuringNpcTurns"),
    worldToggle(KEY_RESTORE, "PauseRestoreAfterCombat")
  ],
  init() {
    Hooks.once("ready", onReady);
    Hooks.on("createCombat", onCreateCombat);
    Hooks.on("updateCombat", onUpdateCombat);
    Hooks.on("deleteCombat", onDeleteCombat);
  }
};

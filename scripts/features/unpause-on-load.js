/**
 * Feature: Unpause When World Loads (system-agnostic)
 * ---------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Foundry always activates a world in the paused state (game.paused = true is set on
 * world activation). When enabled, the first GM to load the world unpauses it and
 * broadcasts the change to everyone. We only act while the game is currently paused,
 * so once unpaused it stays unpaused (normal reloads do nothing).
 *
 * World-scoped (set by the GM), default off.
 *
 * Caveat: a GM reloading their browser while the game is intentionally paused will also
 * trigger an unpause — there is no reliable client-side signal that distinguishes a
 * fresh world activation from a GM page reload. Pause again afterwards if needed.
 */

import { MODULE_ID } from "../constants.js";

const KEY = "unpauseOnWorldLoad";

function onReady() {
  if (!game.user?.isGM) return;
  if (!game.settings.get(MODULE_ID, KEY)) return;
  if (!game.paused) return;

  game.togglePause(false, { broadcast: true });
  console.log(`${MODULE_ID} | unpaused the game on world load (Unpause When World Loads is enabled).`);
}

export default {
  id: "unpauseOnLoad",
  category: {
    label: "DT.Categories.Pause.Label",
    hint: "DT.Categories.Pause.Hint"
  },
  settings: [
    {
      key: KEY,
      options: {
        name: "DT.Settings.UnpauseOnWorldLoad.Name",
        hint: "DT.Settings.UnpauseOnWorldLoad.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.once("ready", onReady);
  }
};

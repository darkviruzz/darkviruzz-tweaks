/**
 * Feature: Unpause When World Loads (system-agnostic)
 * ---------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Foundry always activates a world in the paused state. When enabled, the first client
 * (GM or player) to connect unpauses the game. GMs use the standard togglePause API;
 * non-GMs use a direct socket emit that bypasses the GM-only permission check.
 *
 * World-scoped (set by the GM), default off.
 *
 * Caveat: any page reload while the game is intentionally paused will also trigger an
 * unpause — there is no reliable client-side signal that separates a fresh world
 * activation from a reconnect. Pause again afterwards if needed.
 *
 * Non-GM path: game.socket.emit('pause', false) is confirmed working in Foundry v14+
 * but is not an official API and may break in future Foundry updates.
 */

import { MODULE_ID } from "../constants.js";

const KEY = "unpauseOnWorldLoad";

function onReady() {
  if (!game.settings.get(MODULE_ID, KEY)) return;
  if (!game.paused) return;

  if (game.user?.isGM) {
    game.togglePause(false, { broadcast: true });
  } else {
    // FRAGILE: bypasses GM-only permission check via direct socket emit.
    // Confirmed working in Foundry v14+; may break if Foundry adds server-side validation.
    game.data.paused = false;
    game.socket.emit("pause", false);
    ui.pause?.render();
    Hooks.callAll("pauseGame", false);
  }

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

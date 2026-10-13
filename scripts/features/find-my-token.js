/**
 * Feature: Find My Token (system-agnostic)
 * ----------------------------------------
 * Foundry VTT v14+ · any system
 *
 * On big maps players lose track of their own token. Core already has the Tab key
 * (keybinding `core.cycleView`): its first press pans to the controlled token or the
 * user's character token and selects it — but it never zooms, never pings, and further
 * presses cycle through EVERY token the user can observe.
 *
 * This feature adds a dedicated "Find My Token" action that pans AND zooms to your token,
 * selects it, and can optionally ping it so the whole table sees where it is. It is offered
 * as a keybinding (shipped unbound — assign a key under Configure Controls) and, optionally,
 * as a button in the Token controls toolbar.
 *
 * Which token: for players their assigned character's token on the viewed scene, else a
 * controlled token, else the first token they own; for the GM the controlled token. Hidden
 * tokens are skipped for players (core Tab does the same).
 *
 * Verified (Foundry v14 API): Canvas#animatePan({x, y, scale, duration}), Canvas#ping(origin)
 * (broadcast to all users), Actor#getActiveTokens(), TokenLayer#controlled / #ownedTokens,
 * getSceneControlButtons(controls: Record<string, SceneControl>) with `button: true` +
 * `onChange` tools (`onClick` is deprecated since v13).
 *
 * All settings are per-user. The button defaults to off, ping to off; the keybinding is
 * unbound — nothing changes until the user opts in.
 */

import { MODULE_ID } from "../constants.js";

const KEY_BUTTON = "findTokenButton";
const KEY_ZOOM   = "findTokenZoom";
const KEY_PING   = "findTokenPing";
const TOOL_NAME  = "dtFindMyToken";

/** The token to find for the current user on the viewed scene, or null. */
function tokenToFind() {
  const layer = canvas.tokens;
  if (game.user.isGM) return layer.controlled[0] ?? null;

  const visible = token => !token.document.hidden;
  const character = game.user.character?.getActiveTokens().find(visible);
  return character
    ?? layer.controlled.find(visible)
    ?? layer.ownedTokens.find(visible)
    ?? null;
}

/** Pan + zoom to the user's token, select it and optionally ping it. */
async function findMyToken() {
  if (!canvas?.ready) return false;

  const token = tokenToFind();
  if (!token) {
    ui.notifications.info(game.i18n.localize(game.user.isGM
      ? "DT.FindMyToken.NoTokenGM"
      : "DT.FindMyToken.NoToken"));
    return false;
  }

  const { x, y } = token.center;
  const zoom = Number(game.settings.get(MODULE_ID, KEY_ZOOM)) || 0;
  await canvas.animatePan(zoom > 0 ? { x, y, scale: zoom, duration: 250 } : { x, y, duration: 250 });

  if (token.isOwner && !token.controlled) token.control({ releaseOthers: true });
  if (game.settings.get(MODULE_ID, KEY_PING)) canvas.ping(token.center);
  return true;
}

/** Add the toolbar button to the Token controls when the user enabled it. */
function onGetSceneControlButtons(controls) {
  if (!game.settings.get(MODULE_ID, KEY_BUTTON)) return;
  const tokenControls = controls?.tokens;
  if (!tokenControls?.tools) return;

  tokenControls.tools[TOOL_NAME] = {
    name: TOOL_NAME,
    title: "DT.FindMyToken.Button",
    icon: "fa-solid fa-crosshairs",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => findMyToken()
  };
}

export default {
  id: "findMyToken",
  category: {
    label: "DT.Categories.FindMyToken.Label",
    hint: "DT.Categories.FindMyToken.Hint"
  },
  settings: [
    {
      key: KEY_BUTTON,
      options: {
        name: "DT.Settings.FindTokenButton.Name",
        hint: "DT.Settings.FindTokenButton.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true
      }
    },
    {
      key: KEY_ZOOM,
      options: {
        name: "DT.Settings.FindTokenZoom.Name",
        hint: "DT.Settings.FindTokenZoom.Hint",
        scope: "user",
        config: true,
        type: Number,
        range: { min: 0, max: 3, step: 0.25 },
        default: 1.5
      }
    },
    {
      key: KEY_PING,
      options: {
        name: "DT.Settings.FindTokenPing.Name",
        hint: "DT.Settings.FindTokenPing.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  keybindings: [
    {
      action: "findMyToken",
      options: {
        name: "DT.Keybindings.FindMyToken.Name",
        hint: "DT.Keybindings.FindMyToken.Hint",
        editable: [],
        onDown: () => {
          findMyToken();
          return true;
        }
      }
    }
  ],
  init() {
    Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  }
};

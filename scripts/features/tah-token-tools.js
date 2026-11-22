/**
 * Feature: Token Tools in Token Action HUD (system-agnostic)
 * ---------------------------------------------------------
 * Foundry VTT v14+ · any system · module Token Action HUD Core (verified 2.1.2)
 *
 * The token tools of this module (Token Art Picker, Token Formations… — everything registered
 * with `registerTokenTool()` that also has `available(tokens)` / `open(tokens)`, see
 * lib/token-tools.js) become actions of Token Action HUD.
 *
 * How (verified against TAH Core 2.1.2, see CLAUDE.md): Core fires
 * `tokenActionHudCoreAddActionHandlerExtenders(actionHandler)` once when the HUD is built;
 * `actionHandler.addActionHandlerExtender(ext)` makes Core call `ext.extendActionHandler()` on
 * EVERY HUD build (token selection, actor updates, `forceUpdateTokenActionHud`…). There we add one
 * action per usable tool with `actionHandler.addActions(actions, {id: "token", type: "system"})`
 * — the group where Core itself puts "Toggle Combat" / "Hide/Show" (dnd5e layout: Utility tab →
 * Token). If the user's layout has no such group, `addActions` still registers the actions as
 * *available*, so they can be added to any group through TAH's own "+ Add Action" list — we
 * deliberately create no group of our own (nothing extra lands in saved layouts).
 * An action with `onClick` is run by Core's roll handler (`action.onClick()` without arguments,
 * then `forceUpdateTokenActionHud`); we open the tool for the tokens controlled at click time.
 *
 * World setting (GM): off (default) / GMs (incl. Assistant GMs) / everyone the tool allows.
 */

import { MODULE_ID } from "../constants.js";
import { registeredTools } from "../lib/token-tools.js";

const KEY = "tahTokenTools";
const ACTION_PREFIX = "dt-tool-";
const GROUP = { id: "token", type: "system" };

/** Action handlers we already extended (the hook may fire again for the same handler). */
const extended = new WeakSet();

const mode = () => String(game.settings.get(MODULE_ID, KEY) ?? "off");

/** Does the setting offer the tools to the current user? (`isGM` includes Assistant GMs.) */
function allowedForUser() {
  const m = mode();
  if (m === "all") return true;
  if (m === "gm") return !!game.user?.isGM;
  return false;
}

/** Font Awesome classes only — the icon is a fixed class string, never translated text. */
const iconHtml = classes => `<i class="${String(classes ?? "").replace(/[^\w\s-]/g, "")}"></i>`;

/** The tools offered for `tokens` (TAH-capable tools whose `available(tokens)` is true). */
function offeredTools(tokens) {
  if (!allowedForUser() || !tokens?.length) return [];
  return registeredTools().filter(tool => {
    if (typeof tool.available !== "function" || typeof tool.open !== "function") return false;
    try {
      return !!tool.available(tokens);
    } catch (err) {
      console.error(`${MODULE_ID} | token tool "${tool.id}" failed`, err);
      return false;
    }
  });
}

function runTool(tool) {
  try {
    tool.open(canvas?.tokens?.controlled ?? []);
  } catch (err) {
    console.error(`${MODULE_ID} | token tool "${tool.id}" failed`, err);
  }
}

/** TAH action data for the tools usable with `tokens`. */
function buildActions(tokens) {
  return offeredTools(tokens).map(tool => {
    const name = game.i18n.localize(tool.label);
    return {
      id: `${ACTION_PREFIX}${tool.id}`,
      name,
      listName: name,
      icon1: iconHtml(tool.icon),
      onClick: () => runTool(tool)
    };
  });
}

/** The extender object TAH calls on every build. */
function makeExtender() {
  return {
    extendActionHandler() {
      try {
        const handler = this.actionHandler;
        if (typeof handler?.addActions !== "function") return;
        const actions = buildActions(canvas?.tokens?.controlled ?? []);
        if (actions.length) handler.addActions(actions, { ...GROUP });
      } catch (err) {
        console.error(`${MODULE_ID} | token tools (Token Action HUD) failed`, err);
      }
    }
  };
}

function onAddExtenders(actionHandler) {
  try {
    if (typeof actionHandler?.addActionHandlerExtender !== "function" || extended.has(actionHandler)) return;
    extended.add(actionHandler);
    actionHandler.addActionHandlerExtender(makeExtender());
  } catch (err) {
    console.error(`${MODULE_ID} | token tools (Token Action HUD) failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = { allowedForUser, offeredTools, buildActions, makeExtender, iconHtml };

export default {
  id: "tahTokenTools",
  category: {
    label: "DT.Categories.TahTokenTools.Label",
    hint: "DT.Categories.TahTokenTools.Hint"
  },
  settings: [
    {
      key: KEY,
      options: {
        name: "DT.Settings.TahTokenTools.Name",
        hint: "DT.Settings.TahTokenTools.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
          off: "DT.Settings.TahTokenTools.Off",
          gm: "DT.Settings.TahTokenTools.Gm",
          all: "DT.Settings.TahTokenTools.All"
        },
        default: "off",
        // Rebuild the HUD at once (Core listens to this hook; without TAH nobody does).
        onChange: () => Hooks.callAll("forceUpdateTokenActionHud")
      }
    }
  ],
  init() {
    Hooks.on("tokenActionHudCoreAddActionHandlerExtenders", onAddExtenders);
  }
};

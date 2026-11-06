/**
 * Token Tools — one Token HUD entry shared by the token features (Token Art Picker, Formation…).
 *
 * Features register their tool once (`registerTokenTool` in init()). Every time the Token HUD
 * renders, the tools whose `visible(token)` is true right now are collected:
 *   - none  → nothing is added,
 *   - one   → that tool's own button (no detour through a menu),
 *   - more  → one "Token Tools" button that opens a small palette with a button per tool.
 * So a tool only shows up where it can be used (e.g. Formation only with several tokens
 * selected), and the HUD doesn't fill up with one button per feature.
 *
 * Token HUD DOM (v13/v14, see CLAUDE.md): `renderTokenHUD(hud, html)`, `html` = HTMLElement with
 * `.col.left` / `.col.right` columns of `button.control-icon`, `hud.object` = the Token. Our
 * buttons carry no `data-action` (the HUD is ApplicationV2 and would try to dispatch it).
 */

import { MODULE_ID } from "../constants.js";

/** id → tool */
const tools = new Map();
let hooked = false;

const ROOT_CLASS = "dt-token-tools";

/**
 * @typedef {object} TokenTool
 * @property {string} id
 * @property {number} [order]                 Position in the palette (low first).
 * @property {string} icon                    Font Awesome classes, e.g. "fa-solid fa-images".
 * @property {string} label                   i18n key (tooltip / palette label).
 * @property {(token: object) => boolean} visible  Is the tool usable for this HUD's token now?
 * @property {(token: object, event: Event) => void} onClick
 */

/**
 * Register a tool. Call from a feature's init(); registering the same id again replaces it.
 * @param {TokenTool} tool
 */
export function registerTokenTool(tool) {
  tools.set(tool.id, tool);
  if (!hooked) {
    Hooks.on("renderTokenHUD", onRenderTokenHUD);
    hooked = true;
  }
}

/** The tools usable for this token right now, in palette order. */
export function availableTools(token) {
  return [...tools.values()]
    .filter(tool => {
      try {
        return !!tool.visible(token);
      } catch (err) {
        console.error(`${MODULE_ID} | token tool "${tool.id}" failed`, err);
        return false;
      }
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function element(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const icon = classes => element("i", { class: classes, inert: "" });

function run(tool, token, event) {
  event.preventDefault();
  event.stopPropagation();
  try {
    tool.onClick(token, event);
  } catch (err) {
    console.error(`${MODULE_ID} | token tool "${tool.id}" failed`, err);
  }
}

/** A HUD button that runs one tool directly. */
function toolButton(tool, token) {
  const label = game.i18n.localize(tool.label);
  const button = element("button", {
    type: "button", class: `control-icon ${ROOT_CLASS} ${ROOT_CLASS}--${tool.id}`,
    "data-tooltip": label, "aria-label": label
  }, [icon(tool.icon)]);
  button.addEventListener("click", event => run(tool, token, event));
  return button;
}

/** The "Token Tools" button with its palette. */
function paletteButton(list, token) {
  const label = game.i18n.localize("DT.TokenTools.Button");
  const wrapper = element("div", { class: `${ROOT_CLASS} ${ROOT_CLASS}--menu` });
  const button = element("button", {
    type: "button", class: "control-icon", "data-tooltip": label, "aria-label": label, "aria-expanded": "false"
  }, [icon("fa-solid fa-toolbox")]);
  const palette = element("div", { class: `${ROOT_CLASS}__palette`, role: "menu" });
  palette.hidden = true;
  for (const tool of list) {
    const entry = element("button", { type: "button", class: `${ROOT_CLASS}__entry`, role: "menuitem" },
      [icon(tool.icon), element("span", {}, [game.i18n.localize(tool.label)])]);
    entry.addEventListener("click", event => {
      palette.hidden = true;
      button.setAttribute("aria-expanded", "false");
      run(tool, token, event);
    });
    palette.append(entry);
  }
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    palette.hidden = !palette.hidden;
    button.setAttribute("aria-expanded", String(!palette.hidden));
  });
  wrapper.append(button, palette);
  return wrapper;
}

function onRenderTokenHUD(hud, html) {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const token = hud?.object;
    if (!root || !token) return;
    // The HUD re-renders on every token change; start from scratch each time.
    for (const old of root.querySelectorAll?.(`.${ROOT_CLASS}`) ?? []) old.remove();
    const list = availableTools(token);
    if (!list.length) return;
    const column = root.querySelector(".col.right") ?? root.querySelector(".right");
    if (!column) return;
    column.append(list.length === 1 ? toolButton(list[0], token) : paletteButton(list, token));
  } catch (err) {
    console.error(`${MODULE_ID} | token tools (Token HUD) failed`, err);
  }
}

/** The controlled tokens if `token` is one of them, else just `token`. */
export function selectionFor(token) {
  const controlled = canvas?.tokens?.controlled ?? [];
  return controlled.includes(token) ? controlled : [token];
}

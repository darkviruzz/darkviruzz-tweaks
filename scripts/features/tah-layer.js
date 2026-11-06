/**
 * Feature: Token Action HUD Layer (system-agnostic)
 * -------------------------------------------------
 * Foundry VTT v14+ · any system · module Token Action HUD Core (verified 2.1.2)
 *
 * Token Action HUD (`#token-action-hud-app`, an ApplicationV2 with `frame: false`, also
 * `game.tokenActionHud`) opens at `position.zIndex` 100, but every right-click on one of its
 * groups runs `sendHudToBottom()` → `game.tokenActionHud.element.style.zIndex = 20` — and
 * nothing raises it again until a reload (`bringToFront()` only works for framed windows).
 * Anything docked in `#ui-middle` (layer 30), e.g. the Carousel combat tracker in `rowDocked`
 * mode, then covers the HUD.
 *
 * This pins the HUD to one layer (default 50: above the UI at 30, below windows at 100+): when
 * the HUD renders and whenever its inline z-index changes, it is set back (MutationObserver on
 * its `style` attribute; no wrapping of the module's code). Switched off, the HUD gets its own
 * `position.zIndex` back.
 *
 * World setting (GM), off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ENABLED = "tahLayerFix";
const KEY_Z = "tahLayerZIndex";
const APP_ID = "token-action-hud-app";

let observed = null;
let observer = null;

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const wanted = () => String(Math.round(Number(game.settings.get(MODULE_ID, KEY_Z)) || 50));

function hudElement() {
  return game.tokenActionHud?.element ?? document.getElementById?.(APP_ID) ?? null;
}

function enforce(element) {
  const z = wanted();
  if (element.style.zIndex !== z) element.style.zIndex = z;
}

/** Keep the HUD element on our layer (idempotent; follows a replaced element). */
function pin(element) {
  if (!element || !enabled()) return;
  enforce(element);
  if (observed === element) return;
  observer?.disconnect();
  observed = element;
  if (typeof MutationObserver !== "function") return;
  observer = new MutationObserver(() => {
    if (enabled() && observed?.isConnected) enforce(observed);
  });
  observer.observe(element, { attributes: true, attributeFilter: ["style"] });
}

/** Stop pinning and give the HUD its own layer back. */
function release() {
  observer?.disconnect();
  observer = null;
  const element = observed ?? hudElement();
  observed = null;
  if (element) element.style.zIndex = String(game.tokenActionHud?.position?.zIndex ?? 100);
}

function onRenderApplication(app, element) {
  try {
    if (app?.id !== APP_ID) return;
    pin(element instanceof HTMLElement ? element : (app.element ?? element?.[0]));
  } catch (err) {
    console.error(`${MODULE_ID} | Token Action HUD layer failed`, err);
  }
}

function refresh() {
  if (enabled()) pin(hudElement());
  else release();
}

/** For tools/test-features.mjs only. */
export const internals = { pin, release, refresh };

export default {
  id: "tahLayer",
  category: {
    label: "DT.Categories.TahLayer.Label",
    hint: "DT.Categories.TahLayer.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.TahLayerFix.Name",
        hint: "DT.Settings.TahLayerFix.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: refresh
      }
    },
    {
      key: KEY_Z,
      options: {
        name: "DT.Settings.TahLayerZIndex.Name",
        hint: "DT.Settings.TahLayerZIndex.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 31, max: 99, step: 1 },
        default: 50,
        onChange: refresh
      }
    }
  ],
  init() {
    Hooks.on("renderApplicationV2", onRenderApplication);
    // Only ever touch the HUD while switched on (vanilla otherwise).
    Hooks.once("ready", () => { if (enabled()) pin(hudElement()); });
  }
};

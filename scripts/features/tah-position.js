/**
 * Feature: Token Action HUD Position (system-agnostic)
 * ----------------------------------------------------
 * Foundry VTT v14+ · any system · module Token Action HUD Core (verified 2.1.2)
 *
 * Token Action HUD saves its position as the user flag `flags.token-action-hud-core.position =
 * {top, left}` in px from the top-left corner — written only when a drag ends (and by its "reset
 * position"). A HUD placed near the BOTTOM of a big screen therefore lands off-screen on a smaller
 * one (Core then even falls back to 80/150 when the stored value is beyond the window + 5 px),
 * and nothing in Core reacts to a window resize.
 *
 * With this on, the HUD remembers the nearest screen edges instead: when the user finishes a drag
 * we record which horizontal / vertical edge the HUD's bar is closest to and the distance of the
 * HUD's top-left corner from those edges (hidden per-user setting, so it follows the user to other
 * machines). After every HUD render and on window resize the HUD is shown at that distance from
 * its edges and clamped so the bar stays inside the window. The shifted position is DISPLAY ONLY:
 * TAH's flag is never written by us, so enlarging the window brings the HUD back to its edge
 * place. A new drag starts from the displayed position and TAH saves it as usual → new anchor.
 *
 * Ordering (Foundry 14.370 `ApplicationV2#render`): the `render*` hooks run BEFORE
 * `setPosition(options.position)`, and TAH's `setPosition()` re-applies the flag position — so we
 * apply ours in the next animation frame after the render hook.
 *
 * World setting (GM), off by default. Docked HUD styles are left alone.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ENABLED = "tahPositionAnchor";
const KEY_DATA = "tahPositionAnchorData";
const APP_ID = "token-action-hud-app";
const TAH_ID = "token-action-hud-core";

/* ---------- pure geometry ---------- */

const round = n => Math.round(Number(n) || 0);

/**
 * The anchor for a HUD whose element sits at `pos` (style left/top) with its bar at `rect`
 * (viewport coordinates) in a `viewport` of {width, height}.
 * Horizontal / vertical edge = the one the bar is nearest to; dx / dy = distance of the HUD's
 * top-left corner (= what TAH stores and what the bar grows from) from that edge.
 */
function computeAnchor(pos, rect, viewport) {
  const vw = viewport.width; const vh = viewport.height;
  const h = (rect.left <= vw - rect.right) ? "left" : "right";
  const v = (rect.top <= vh - rect.bottom) ? "top" : "bottom";
  return {
    top: round(pos.top), left: round(pos.left), h, v,
    dx: round(h === "left" ? pos.left : vw - pos.left),
    dy: round(v === "top" ? pos.top : vh - pos.top),
    vw: round(vw), vh: round(vh)
  };
}

/** Clamp `value` into [lo, hi]; when the range is empty the low end wins (top/left visible). */
function clamp(value, lo, hi) {
  if (hi < lo) return lo;
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Display position (style left/top) for `anchor` in `viewport`.
 * `box` = the bar: {width, height} and its offset {ox, oy} from the element's top-left corner.
 * The bar is kept fully inside the viewport where possible.
 */
function resolvePosition(anchor, viewport, box) {
  const vw = viewport.width; const vh = viewport.height;
  const ox = box.ox ?? 0; const oy = box.oy ?? 0;
  const left = anchor.h === "right" ? vw - anchor.dx : anchor.dx;
  const top = anchor.v === "bottom" ? vh - anchor.dy : anchor.dy;
  return {
    left: round(clamp(left, -ox, vw - box.width - ox)),
    top: round(clamp(top, -oy, vh - box.height - oy))
  };
}

/**
 * Decide what to show for TAH's stored `flag` ({top, left} or null), our `stored` anchor and the
 * current viewport / bar box.
 * → null (nothing to do: no TAH position saved) or {position, anchor, adopt}
 *   adopt = true: `anchor` is new (flag saved before / feature just enabled) and should be stored.
 */
function planPosition({ flag, stored, viewport, box }) {
  if (!flag || !Number.isFinite(Number(flag.top)) || !Number.isFinite(Number(flag.left))) return null;
  const top = Number(flag.top); const left = Number(flag.left);
  let anchor = null; let adopt = false;
  if (stored?.h && stored?.v && round(stored.top) === round(top) && round(stored.left) === round(left)) {
    anchor = stored;
  } else if (left >= 0 && left < viewport.width && top >= 0 && top < viewport.height) {
    // Adopt once, with the current viewport as the reference.
    const ox = box.ox ?? 0; const oy = box.oy ?? 0;
    const rect = { left: left + ox, top: top + oy, right: left + ox + box.width, bottom: top + oy + box.height };
    anchor = computeAnchor({ top, left }, rect, viewport);
    adopt = true;
  } else {
    // Outside this window and never anchored: show it clamped, don't store anything.
    anchor = { top, left, h: "left", v: "top", dx: left, dy: top };
  }
  return { position: resolvePosition(anchor, viewport, box), anchor, adopt };
}

/* ---------- glue ---------- */

let frame = null;
let resizeBound = false;
/** "top,left" of the flag last adopted (the settings write is async; don't repeat it per render). */
let adopted = null;

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);

function viewportSize() {
  return { width: globalThis.window?.innerWidth ?? 0, height: globalThis.window?.innerHeight ?? 0 };
}

function storedAnchor() {
  try {
    const data = game.settings.get(MODULE_ID, KEY_DATA);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/** The undocked, rendered HUD: {app, element, box} or null. */
function measuredHud() {
  const app = game.tokenActionHud;
  const element = app?.element;
  if (!app || !element?.isConnected || app.isDocked) return null;
  const bar = element.querySelector?.("#token-action-hud");
  const rect = bar?.getBoundingClientRect?.();
  const origin = element.getBoundingClientRect?.();
  if (!rect || !origin || !(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    app, element, rect,
    box: { width: rect.width, height: rect.height, ox: rect.left - origin.left, oy: rect.top - origin.top }
  };
}

/** Make TAH's expand classes match its (public) `direction` after we moved the HUD. */
function syncDirection(app, element) {
  const up = app.direction === "up";
  let changed = false;
  for (const container of element.querySelectorAll?.('[data-part="subgroupsContainer"]') ?? []) {
    if (container.classList.contains("expand-up") === up && container.classList.contains("expand-down") === !up) continue;
    container.classList.toggle("expand-up", up);
    container.classList.toggle("expand-down", !up);
    changed = true;
  }
  if (!changed) return;
  const name = element.querySelector?.('[data-part="characterName"]');
  if (up) name?.classList.add("tah-hidden");
  else if (!app.isCollapsed) name?.classList.remove("tah-hidden");
}

/** Show the HUD at its anchored, clamped place (display only). */
function apply() {
  if (!enabled()) return;
  const hud = measuredHud();
  if (!hud) return;
  const { app, element, box } = hud;
  const flag = game.user?.getFlag?.(TAH_ID, "position") ?? app.hudPosition ?? null;
  const plan = planPosition({ flag, stored: storedAnchor(), viewport: viewportSize(), box });
  if (!plan) return;
  const { left, top } = plan.position;
  if (element.style.left !== `${left}px`) element.style.left = `${left}px`;
  if (element.style.top !== `${top}px`) element.style.top = `${top}px`;
  app.topPos = top;
  app.leftPos = left;
  syncDirection(app, element);
  const key = `${plan.anchor.top},${plan.anchor.left}`;
  if (plan.adopt && adopted !== key) {
    adopted = key;
    game.settings.set(MODULE_ID, KEY_DATA, plan.anchor)?.catch?.(() => {});
  }
}

function safeApply() {
  frame = null;
  try {
    apply();
  } catch (err) {
    console.error(`${MODULE_ID} | Token Action HUD position failed`, err);
  }
}

/** Apply once in the next frame (after TAH's own setPosition; coalesces bursts). */
function schedule() {
  if (frame !== null) return;
  const raf = globalThis.requestAnimationFrame;
  frame = typeof raf === "function" ? raf(safeApply) : setTimeout(safeApply, 16);
}

/** A drag ended (TAH saved its flag): record the anchor for the place the user chose. */
function onUpdateUser(user, changes) {
  try {
    if (!enabled() || !user || user.id !== game.user?.id) return;
    if (foundry.utils.getProperty(changes ?? {}, `flags.${TAH_ID}.position`) === undefined) return;
    const flag = user.getFlag?.(TAH_ID, "position") ?? user.flags?.[TAH_ID]?.position;
    if (!flag) return;
    const hud = measuredHud();
    if (!hud) return;
    const { element, rect } = hud;
    // Only the client whose HUD actually sits there (the one that was dragged) records it — the
    // same user's other open clients get this update too.
    if (round(parseFloat(element.style.top)) !== round(flag.top)
      || round(parseFloat(element.style.left)) !== round(flag.left)) return;
    const anchor = computeAnchor(flag, rect, viewportSize());
    game.settings.set(MODULE_ID, KEY_DATA, anchor)?.catch?.(() => {});
  } catch (err) {
    console.error(`${MODULE_ID} | Token Action HUD position failed`, err);
  }
}

function onRenderApplication(app) {
  try {
    if (app?.id === APP_ID && enabled()) schedule();
  } catch (err) {
    console.error(`${MODULE_ID} | Token Action HUD position failed`, err);
  }
}

function onResize() {
  if (enabled()) schedule();
}

function bindResize() {
  if (resizeBound) return;
  globalThis.window?.addEventListener?.("resize", onResize);
  resizeBound = true;
}

function onToggle(value) {
  try {
    if (value) {
      bindResize();
      schedule();
    } else {
      game.tokenActionHud?.setPosition?.(); // TAH's own position again
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Token Action HUD position failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = {
  computeAnchor, resolvePosition, planPosition, clamp, apply, onUpdateUser, syncDirection, onToggle
};

export default {
  id: "tahPosition",
  category: {
    label: "DT.Categories.TahPosition.Label",
    hint: "DT.Categories.TahPosition.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.TahPositionAnchor.Name",
        hint: "DT.Settings.TahPositionAnchor.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: onToggle
      }
    },
    {
      key: KEY_DATA,
      options: {
        scope: "user",
        config: false,
        type: Object,
        default: {},
        onChange: () => { if (enabled()) schedule(); }
      }
    }
  ],
  init() {
    Hooks.on("renderApplicationV2", onRenderApplication);
    Hooks.on("updateUser", onUpdateUser);
    Hooks.once("ready", () => {
      try {
        bindResize();
        if (enabled()) schedule();
      } catch (err) {
        console.error(`${MODULE_ID} | Token Action HUD position failed`, err);
      }
    });
  }
};

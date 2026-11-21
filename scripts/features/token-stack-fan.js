/**
 * Feature: Stacked Tokens Fan Out (system-agnostic)
 * -------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * When the mouse rests on tokens that lie (almost) on top of each other, the stack fans out for
 * that person only, so every token of it can be clicked. The token under the mouse never moves —
 * waiting and then clicking always selects the token that was under the mouse — and every other
 * token of the stack moves a configurable share of its own size away (default 30 %).
 *
 * Display only, purely local: like *Live Token Drag* we move a token's container (`token.position`:
 * border, bars, name, effects, target pips, turn marker and — because the hit area lives in the
 * container's coordinates — the clickable area) and its mesh (`token.mesh.position`). Documents,
 * bounds, the quadtree, vision and light stay where the token really is; `Token#animate` is never
 * used (it would move vision too). Core resets both positions in `Token#_refreshPosition`, so the
 * offsets are re-applied in the `refreshToken` hook that core calls right after its render flags.
 *
 * A stack = the hovered token plus every token that this user can see and interact with and whose
 * centre is closer than STACK_RATIO × the smaller token's shorter side to a stack member
 * (transitive; document positions only). The fan collapses when the pointer leaves the fanned
 * tokens (after a short grace period), a drag starts, a member moves/changes/animates/is deleted,
 * the Token HUD opens for a member, the tool or layer changes, the scene changes or the setting is
 * switched off.
 *
 * Verified against the Foundry 14.370 client source: see CLAUDE.md "Stacked tokens fan out".
 * World-scoped (the GM switches it on for everyone), off by default; no socket, no writes.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ENABLED  = "stackFanEnabled";
const KEY_DELAY    = "stackFanDelay";
const KEY_DISTANCE = "stackFanDistance";

/** Two tokens are "stacked" when their centres are closer than this share of the smaller token's shorter side. */
const STACK_RATIO = 0.5;
/** Fan direction of the first other token: up-right (canvas y grows downwards). */
const START_ANGLE = -Math.PI / 4;
/** Ease-in time of the fan, ms. */
const EASE_MS = 140;
/** The pointer may leave the fanned tokens this long before the fan collapses, ms. */
const GRACE_MS = 250;
/** Extra margin around the fanned tokens (share of each token's shorter side). */
const AREA_MARGIN = 0.1;
/** Document changes that end a fan. */
const LAYOUT_KEYS = ["x", "y", "elevation", "width", "height", "hidden", "shape"];

const setting = key => game.settings.get(MODULE_ID, key);
const enabled = () => !!setting(KEY_ENABLED);

/** Time source and timers — replaceable by the tests. */
const clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id)
};

/* -------------------------------------------- */
/*  Pure geometry                               */
/* -------------------------------------------- */

const round9 = v => Math.round(v * 1e9) / 1e9;
const byOrder = (a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || String(a.id).localeCompare(String(b.id));

/** A direction on the unit "square ring": diagonals become (±1, ±1), axes (±1, 0) / (0, ±1). */
function squareDirection(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const max = Math.max(Math.abs(cos), Math.abs(sin));
  return { x: round9(cos / max), y: round9(sin / max) };
}

/** Smallest Chebyshev distance between any two of the directions scaled by r (in token sizes). */
function minSpacing(directions, r) {
  let min = Infinity;
  for (let i = 0; i < directions.length; i++) {
    for (let j = i + 1; j < directions.length; j++) {
      const d = Math.max(Math.abs(directions[i].x - directions[j].x), Math.abs(directions[i].y - directions[j].y)) * r;
      min = Math.min(min, d);
    }
  }
  return min;
}

/**
 * Display offsets of a fanned stack.
 * @param {{id: string, width: number, height: number, sort?: number}[]} members  sizes in px
 * @param {string} hoveredId   the token under the mouse — its offset is always exactly 0
 * @param {number} percent     distance between neighbours, in percent of each token's own size
 * @returns {Map<string, {dx: number, dy: number}>}  px
 */
function fanOffsets(members, hoveredId, percent) {
  const share = Math.max(0, Number(percent) || 0) / 100;
  const offsets = new Map();
  for (const m of members) if (m.id === hoveredId) offsets.set(m.id, { dx: 0, dy: 0 });
  const others = members.filter(m => m.id !== hoveredId).sort(byOrder);
  if (!others.length) return offsets;
  const directions = others.map((_, i) => squareDirection(START_ANGLE + ((2 * Math.PI * i) / others.length)));
  // Every token is ≥ share away from the hovered one; grow the ring until neighbours are too.
  let r = share;
  for (let k = 0; (k < 40) && share && (minSpacing(directions, r) < share - 1e-9); k++) r *= 1.1;
  others.forEach((m, i) => offsets.set(m.id, {
    dx: round9(directions[i].x * r * m.width),
    dy: round9(directions[i].y * r * m.height)
  }));
  return offsets;
}

/**
 * The stack around a token: every candidate connected to it by "centres closer than STACK_RATIO ×
 * the smaller token's shorter side" (transitive).
 * @param {{id: string, cx: number, cy: number, width: number, height: number}[]} candidates
 * @param {string} startId
 * @returns {string[]} ids in candidate order (including startId), empty if startId isn't a candidate
 */
function stackIds(candidates, startId) {
  const start = candidates.find(c => c.id === startId);
  if (!start) return [];
  const close = (a, b) => {
    const limit = STACK_RATIO * Math.min(a.width, a.height, b.width, b.height);
    return Math.hypot(a.cx - b.cx, a.cy - b.cy) < limit;
  };
  const found = new Set([start.id]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const c of candidates) {
      if (!found.has(c.id) && close(current, c)) {
        found.add(c.id);
        queue.push(c);
      }
    }
  }
  return candidates.filter(c => found.has(c.id)).map(c => c.id);
}

/* -------------------------------------------- */
/*  Canvas glue                                 */
/* -------------------------------------------- */

/** Can this user see the token and interact with it (as for hovering)? */
function isEligible(token) {
  if (!token || token.destroyed || !token.mesh || !token.document) return false;
  if (token.isPreview || token.hasPreview) return false;
  if (!token.visible || (token.renderable === false)) return false;
  if (token.document.isSecret || !token.isInteractable) return false;
  return !token.animationContexts?.size;
}

const describe = token => {
  const { x, y } = token.center;
  return { id: token.document.id, cx: x, cy: y, width: token.w, height: token.h, sort: token.document.sort ?? 0 };
};

/** Ids of the stack around a token (sorted, for comparison), from document positions. */
function currentStack(token) {
  if (!isEligible(token)) return [];
  const candidates = (canvas.tokens?.placeables ?? []).filter(isEligible).map(describe);
  return stackIds(candidates, token.document.id).sort();
}

const dragging = () => !!canvas.tokens?._draggedToken;

function emulateMove() {
  try {
    foundry.canvas?.interaction?.MouseInteractionManager?.emulateMoveEvent?.();
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: emulateMoveEvent failed`, err);
  }
}

/** Show a token at its document position + offset (container and mesh only). */
function display(token, { dx, dy }) {
  const { x, y } = token.document;
  const center = token.center;
  token.position.set(x + dx, y + dy);
  token.mesh.position.set(center.x + dx, center.y + dy);
}

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/** Waiting for the delay: { key, ids: Set, timer } */
let pending = null;
/**
 * The open fan: { hoveredId, members: Map<id, {to: {dx, dy}, at: {dx, dy}}>, start, settled, outSince, tool }
 */
let fan = null;
let ticking = false;

function cancelPending() {
  if (pending) clock.clearTimeout(pending.timer);
  pending = null;
}

/** Start the delay for the stack under a hovered token (keeps a running delay for the same stack). */
function arm(token) {
  const ids = currentStack(token);
  if (ids.length < 2) return cancelPending();
  const key = ids.join(",");
  if (pending?.key === key) return;
  cancelPending();
  const delay = Math.max(0, Number(setting(KEY_DELAY)) || 0);
  pending = { key, ids: new Set(ids), timer: clock.setTimeout(onDelay, delay) };
}

function onDelay() {
  const armed = pending;
  pending = null;
  try {
    if (!armed || fan || !enabled() || dragging()) return;
    const hovered = canvas.tokens?.hover;
    if (!isEligible(hovered)) return;
    const ids = currentStack(hovered);
    if ((ids.length < 2) || (ids.join(",") !== armed.key)) return; // the stack changed meanwhile
    open(hovered, ids);
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: could not fan out`, err);
  }
}

function open(hovered, ids) {
  const tokens = ids.map(id => canvas.tokens.get(id)).filter(Boolean);
  const offsets = fanOffsets(tokens.map(describe), hovered.document.id, setting(KEY_DISTANCE));
  const members = new Map();
  for (const [id, to] of offsets) members.set(id, { to, at: { dx: 0, dy: 0 } });
  fan = { hoveredId: hovered.document.id, members, start: clock.now(), settled: false, outSince: null,
    tool: ui.controls?.tool?.name };
  startTicking();
  step(clock.now());
}

/** Hand every member back to core (redrawn at its real place). */
function collapse({ rearm = false } = {}) {
  const closed = fan;
  fan = null;
  stopTicking();
  if (!closed) return;
  for (const id of closed.members.keys()) {
    const token = canvas.tokens?.get(id);
    if (token && !token.destroyed) token.renderFlags?.set({ refreshPosition: true });
  }
  emulateMove();
  if (rearm && enabled() && canvas.tokens?.hover) arm(canvas.tokens.hover);
}

/** Is the fan still valid? (layer, tool, drag, every member present, unanimated, undragged) */
function fanValid() {
  if (!enabled() || !canvas.tokens?.active || dragging()) return false;
  const tool = ui.controls?.tool;
  if (!tool?.interaction || (tool.name !== fan.tool)) return false;
  for (const id of fan.members.keys()) {
    const token = canvas.tokens.get(id);
    if (!token || token.destroyed || !token.mesh || token.hasPreview || token.animationContexts?.size) return false;
  }
  return true;
}

/** Is the pointer over (or just next to) one of the fanned tokens as they are displayed? */
function pointerInside() {
  const p = canvas.mousePosition;
  if (!p) return true;
  for (const [id, { at }] of fan.members) {
    const token = canvas.tokens.get(id);
    if (!token) continue;
    const { x, y } = token.document;
    const w = token.w;
    const h = token.h;
    const margin = AREA_MARGIN * Math.min(w, h);
    const left = x + at.dx - margin;
    const top = y + at.dy - margin;
    if ((p.x >= left) && (p.x <= left + w + (2 * margin)) && (p.y >= top) && (p.y <= top + h + (2 * margin))) return true;
  }
  return false;
}

/** One frame: validity, ease-in, pointer check. */
function step(now) {
  if (!fan) return;
  if (!fanValid()) return collapse();

  if (!fan.settled) {
    const t = Math.min(Math.max((now - fan.start) / EASE_MS, 0), 1);
    const e = 1 - ((1 - t) ** 3); // ease-out
    for (const [id, member] of fan.members) {
      member.at = { dx: member.to.dx * e, dy: member.to.dy * e };
      display(canvas.tokens.get(id), member.at);
    }
    fan.settled = t >= 1;
    emulateMove();
  }

  if (pointerInside()) fan.outSince = null;
  else if (fan.outSince === null) fan.outSince = now;
  else if (now - fan.outSince >= GRACE_MS) collapse({ rearm: true });
}

function onTick() {
  try {
    step(clock.now());
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: frame failed`, err);
    fan = null;
    stopTicking();
  }
}

function startTicking() {
  if (ticking) return;
  // After core's render flags (OBJECTS), like Live Token Drag.
  canvas.app.ticker.add(onTick, undefined, (PIXI.UPDATE_PRIORITY.PRIMARY ?? PIXI.UPDATE_PRIORITY.NORMAL) + 1);
  ticking = true;
}

function stopTicking() {
  if (ticking) canvas.app?.ticker?.remove(onTick);
  ticking = false;
}

/** Forget everything (scene change, setting change). */
function reset({ restore = true } = {}) {
  cancelPending();
  if (restore) collapse();
  else { fan = null; stopTicking(); }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

function onHoverToken(token, hovered) {
  try {
    if (!enabled() || fan) return; // an open fan is watched by the pointer check, not by hover events
    if (hovered) return arm(token);
    // Hover moves between tokens as an out/in pair in either order: decide once both happened.
    queueMicrotask(() => {
      try {
        if (!pending) return;
        const now = canvas.tokens?.hover;
        if (!now || !pending.ids.has(now.document?.id)) cancelPending();
      } catch (err) {
        console.error(`${MODULE_ID} | Stacked Tokens Fan Out: hover-out failed`, err);
      }
    });
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: hover failed`, err);
  }
}

function onRefreshToken(token, flags) {
  if (!fan) return;
  try {
    if (token.isPreview) {
      if (token.previewType === "dragging") collapse(); // a drag started: the drop must not include our offset
      return;
    }
    const member = fan.members.get(token.document?.id);
    if (member && flags?.refreshPosition && (canvas.tokens?.get(token.document.id) === token)) display(token, member.at);
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: refresh failed`, err);
  }
}

function onUpdateToken(document, changed) {
  if (!fan?.members.has(document.id)) return;
  try {
    if (LAYOUT_KEYS.some(k => k in (changed ?? {}))) collapse();
  } catch (err) {
    console.error(`${MODULE_ID} | Stacked Tokens Fan Out: update failed`, err);
  }
}

function onDeleteToken(document) {
  if (!fan?.members.has(document.id)) return;
  try { collapse(); } catch (err) { console.error(`${MODULE_ID} | Stacked Tokens Fan Out: delete failed`, err); }
}

/** The Token HUD sits at the token's real position — fold the fan back first. */
function onRenderTokenHUD(hud) {
  const id = hud?.object?.document?.id;
  if (!id || !fan?.members.has(id)) return;
  try { collapse(); } catch (err) { console.error(`${MODULE_ID} | Stacked Tokens Fan Out: HUD failed`, err); }
}

function onCanvasTearDown() {
  try { reset({ restore: false }); } catch (err) { console.error(`${MODULE_ID} | Stacked Tokens Fan Out: teardown failed`, err); }
}

function onSettingChange() {
  try { reset(); } catch (err) { console.error(`${MODULE_ID} | Stacked Tokens Fan Out: setting change failed`, err); }
}

export const internals = {
  fanOffsets, stackIds, isEligible, clock, STACK_RATIO, GRACE_MS, EASE_MS,
  frame: onTick,
  get state() { return { pending: !!pending, fan: fan && { hoveredId: fan.hoveredId, ids: [...fan.members.keys()].sort() } }; }
};

export default {
  id: "tokenStackFan",
  category: {
    label: "DT.Categories.TokenStackFan.Label",
    hint: "DT.Categories.TokenStackFan.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.StackFanEnabled.Name",
        hint: "DT.Settings.StackFanEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: onSettingChange
      }
    },
    {
      key: KEY_DELAY,
      options: {
        name: "DT.Settings.StackFanDelay.Name",
        hint: "DT.Settings.StackFanDelay.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 200, max: 2000, step: 100 },
        default: 600,
        onChange: onSettingChange
      }
    },
    {
      key: KEY_DISTANCE,
      options: {
        name: "DT.Settings.StackFanDistance.Name",
        hint: "DT.Settings.StackFanDistance.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 10, max: 100, step: 5 },
        default: 30,
        onChange: onSettingChange
      }
    }
  ],
  init() {
    Hooks.on("hoverToken", onHoverToken);
    Hooks.on("refreshToken", onRefreshToken);
    Hooks.on("updateToken", onUpdateToken);
    Hooks.on("deleteToken", onDeleteToken);
    Hooks.on("renderTokenHUD", onRenderTokenHUD);
    Hooks.on("canvasTearDown", onCanvasTearDown);
  }
};

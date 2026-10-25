/**
 * Feature: Live Token Drag (system-agnostic)
 * ------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * While someone drags a token, everybody else sees the token itself follow the mouse in real
 * time — core only shares the planned path (ruler). Replacement for the unmaintained module
 * "Live Drag" by Anyndel (https://github.com/Anyndol/FoundryVTT-LiveDrag, MIT License,
 * Copyright (c) 2024 Anyndol; last release 1.0.4, verified for Foundry 12). This file is a
 * re-implementation of its idea for v14, not a copy of its code. Differences:
 *   - The original hid the dragged token (alpha 0) on the dragging client and only made it
 *     visible again in `updateToken` — dropping a token on its own square, cancelling the drag
 *     or a rejected move left it invisible. We never touch the dragging client's tokens: it
 *     keeps core's drag display (faint token at the start, preview under the mouse).
 *   - There was no end signal, so other clients kept a cancelled drag at its last position
 *     until the token was next updated. We send one; the token glides back.
 *   - Positions went out on every preview refresh (dozens per second per token); we send at
 *     most ~30 per second, always the latest one. Hidden tokens go to GMs only (server-side
 *     routing via socket recipients, not a client-side filter).
 *   - No libWrapper/socketlib: core's preview hooks and the module socket are enough.
 *
 * Dragging client — v14 draws a preview clone of each dragged token (`previewType ===
 * "dragging"`) in the token layer's preview container. Its hooks ARE the drag workflow:
 *   refreshToken(preview)  the preview moved (the first refresh follows the drag start)
 *   destroyToken(preview)  the drag ended: core clears the preview container on drop, cancel
 *                          (right-click), drop on the same spot and rejected moves alike.
 * A drag is shown live unless the user held Alt when starting it (core then keeps the ruler
 * private too) and, in Shift-only mode, until Shift is pressed during it.
 *
 * Other clients — only the token's display objects are moved (its container with border, bars,
 * name and effects, plus its mesh), every frame right after core has applied its render flags.
 * The document, vision and light sources stay where the token really is: `Token#animate()`
 * would move them too, and players sharing the token's vision would then see — and explore
 * fog — wherever the mouse goes, even behind walls the token never passes. Visibility is
 * core's own test at the shown position, so players only see the token where they could see
 * it anyway (and only if they can see it where it really stands). Each received position is
 * reached in a short linear glide, which smooths the ~30 Hz updates. When the dropped move
 * arrives, core's movement animation is stopped at once (the token is already shown there; it
 * shouldn't walk its path again); on the end signal a token that is still away from its real
 * position (cancel, same spot, rejected move) glides back.
 *
 * Verified against the Foundry v14 client and server source (build 14.364): see CLAUDE.md
 * "Live Token Drag". World-scoped (GM), off by default.
 */

import { MODULE_ID } from "../constants.js";
import { emitSocketMessage, onSocketMessage } from "../lib/socket.js";

const KEY_ENABLED    = "liveDragEnabled";
const KEY_SHIFT_ONLY = "liveDragShiftOnly";

const SOCKET_FEATURE      = "liveTokenDrag";
const SEND_INTERVAL_MS    = 33;   // ≈ 30 position updates per second
const FOLLOW_MS           = 50;   // receivers glide to each position in this time
const RETURN_MS           = 250;  // glide back to the real position when a drag ends elsewhere
const VISIBILITY_CHECK_MS = 100;  // how often receivers re-test visibility at the shown position

const MOVEMENT_KEYS = ["x", "y", "elevation"];

const setting = key => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Dragging client                             */
/* -------------------------------------------- */

/** This client's drags: token id → { scene, live, hidden, last } */
const drags = new Map();

/** Latest not-yet-sent position per token id. */
const pending = new Map();
let flushTimer = null;
let lastFlush = 0;

const isDragPreview = token => !!token?.isPreview && (token.previewType === "dragging");

/** Did the user hold Alt when starting the drag? Core then hides the ruler from others. */
const isPrivateDrag = preview => !!preview._original?._plannedMovement?.[game.user.id]?.hidden;

/** Send a message; hidden tokens only to the other connected GMs. */
function send(payload, { hidden = false, volatile = false } = {}) {
  if (!hidden) return emitSocketMessage(SOCKET_FEATURE, payload, { volatile });
  const gms = game.users.filter(u => u.isGM && u.active && !u.isSelf).map(u => u.id);
  if (gms.length) emitSocketMessage(SOCKET_FEATURE, payload, { recipients: gms, volatile });
}

/** Send the latest position of every token that moved since the last flush. */
function flush() {
  flushTimer = null;
  lastFlush = Date.now();
  if (!pending.size) return;
  const visible = [];
  const hidden = [];
  for (const [id, position] of pending) (drags.get(id)?.hidden ? hidden : visible).push(position);
  pending.clear();
  const scene = canvas.scene?.id;
  // Volatile: a position that can't go out right now is worthless once the next one exists.
  if (visible.length) send({ action: "move", scene, tokens: visible }, { volatile: true });
  if (hidden.length) send({ action: "move", scene, tokens: hidden }, { hidden: true, volatile: true });
}

/** Flush at most every SEND_INTERVAL_MS; the latest position always goes out. */
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, Math.max(0, lastFlush + SEND_INTERVAL_MS - Date.now()));
}

function onRefreshToken(token) {
  if (!isDragPreview(token) || !setting(KEY_ENABLED)) return;
  const { id, x, y, hidden } = token.document;
  let drag = drags.get(id);
  if (!drag) drags.set(id, drag = { scene: canvas.scene?.id, live: false, hidden, last: "" });

  // Decide once per drag; once live it stays live until the drop.
  if (!drag.live) {
    if (isPrivateDrag(token)) return;
    if (setting(KEY_SHIFT_ONLY) && !game.keyboard.isModifierActive("SHIFT")) return;
    drag.live = true;
  }

  const position = `${x},${y}`;
  if (position === drag.last) return;
  drag.last = position;
  drag.hidden = hidden;
  pending.set(id, { id, x, y });
  scheduleFlush();
}

function onDestroyToken(token) {
  if (!isDragPreview(token)) return;
  const id = token.document.id;
  const drag = drags.get(id);
  drags.delete(id);
  pending.delete(id);
  if (drag?.live) send({ action: "end", scene: drag.scene, ids: [id] }, { hidden: drag.hidden });
}

/* -------------------------------------------- */
/*  Other clients                               */
/* -------------------------------------------- */

/**
 * Tokens this client shows at a live drag position: token id →
 * { sender, at, from, to, start, duration, back, visible, checked } (positions are {x, y}).
 */
const shown = new Map();
let ticking = false;

/** Hand a token back to core: it is redrawn where it really is. */
const restore = token => token.renderFlags.set({ refreshPosition: true, refreshVisibility: true });

/** Core's visibility rules, tested where the token is shown instead of where it stands. */
function isVisibleAt(token, position) {
  if (!token.isVisible) return false; // hidden, filtered out or unseen where it really stands
  if (!canvas.visibility.tokenVision || token.controlled || token.vision?.active) return true;
  if (!canvas.effects.visionSources.some(s => s.active)) return game.user.isGM;
  return canvas.visibility.testVisibility(token.document.getVisibilityTestPoints(position),
    { tolerance: 0, object: token });
}

/** Draw the token at its shown position — container and mesh only. */
function display(token, { at, visible }) {
  const { x, y } = token.document;
  const center = token.center;
  token.position.set(at.x, at.y);
  token.mesh.position.set(center.x + (at.x - x), center.y + (at.y - y));
  token.visible = visible;
  token.mesh.visible = visible && token.renderable;
}

/** Every frame, after core applied the render flags (which reset position and visibility). */
function onTick() {
  const now = performance.now();
  for (const [id, live] of shown) {
    const token = canvas.tokens?.get(id);
    if (!token?.mesh || token.destroyed || token.hasPreview) { // gone, or now dragged here
      shown.delete(id);
      if (token?.mesh && !token.destroyed) restore(token);
      continue;
    }
    const t = Math.min((now - live.start) / live.duration, 1);
    live.at = { x: live.from.x + ((live.to.x - live.from.x) * t), y: live.from.y + ((live.to.y - live.from.y) * t) };
    if (live.back && (t === 1)) {
      shown.delete(id);
      restore(token);
      continue;
    }
    if (now - live.checked >= VISIBILITY_CHECK_MS) {
      live.visible = isVisibleAt(token, live.at);
      live.checked = now;
    }
    display(token, live);
  }
  if (!shown.size) stopTicking();
}

function stopTicking() {
  if (ticking) canvas.app?.ticker.remove(onTick);
  ticking = false;
}

/** Glide the shown position linearly towards `to`. */
function glideTo(live, to, duration, back = false) {
  Object.assign(live, { from: { ...live.at }, to, start: performance.now(), duration, back, checked: 0 });
}

/** Show a token at a received drag position. */
function follow({ id, x, y }, senderId) {
  const token = canvas.tokens.get(id);
  if (!token?.mesh || token.hasPreview) return; // we are dragging (or configuring) it ourselves
  if (![x, y].every(Number.isFinite)) return;
  let live = shown.get(id);
  if (!live) shown.set(id, live = { sender: senderId, at: { x: token.document.x, y: token.document.y } });
  glideTo(live, { x, y }, FOLLOW_MS);
  if (ticking) return;
  // After core's render flags (OBJECTS), before the primary group update and perception.
  canvas.app.ticker.add(onTick, undefined, (PIXI.UPDATE_PRIORITY.PRIMARY ?? PIXI.UPDATE_PRIORITY.NORMAL) + 1);
  ticking = true;
}

/** The drag ended without the token moving there: glide back to where it really is. */
function release(id) {
  const live = shown.get(id);
  if (!live || live.back) return;
  const token = canvas.tokens?.get(id);
  if (token) glideTo(live, { x: token.document.x, y: token.document.y }, RETURN_MS, true);
  else shown.delete(id);
}

function onMessage(message, senderId) {
  if (!canvas?.ready || (message.scene !== canvas.scene?.id)) return;
  if (message.action === "move") {
    for (const position of message.tokens ?? []) follow(position, senderId);
  } else if (message.action === "end") {
    for (const id of message.ids ?? []) release(id);
  }
}

/**
 * The dropped move arrived. The token is already shown there, so core's movement animation
 * (which starts where the token really stood) is stopped before its first frame is drawn.
 */
function onUpdateToken(document, changed) {
  if (!shown.has(document.id) || !MOVEMENT_KEYS.some(k => k in changed)) return;
  shown.delete(document.id);
  const token = document.object;
  if (!token) return;
  token.stopAnimation();
  restore(token);
}

/** A user disconnected mid-drag: no end signal will come. */
function onUserConnected(user, connected) {
  if (connected) return;
  for (const [id, live] of shown) if (live.sender === user.id) release(id);
}

/** Leaving the scene: end our drags; the tokens shown here are destroyed anyway. */
function onCanvasTearDown() {
  for (const [id, drag] of drags) {
    if (drag.live) send({ action: "end", scene: drag.scene, ids: [id] }, { hidden: drag.hidden });
  }
  drags.clear();
  pending.clear();
  shown.clear();
  stopTicking();
}

export default {
  id: "liveTokenDrag",
  category: {
    label: "DT.Categories.LiveTokenDrag.Label",
    hint: "DT.Categories.LiveTokenDrag.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.LiveDragEnabled.Name",
        hint: "DT.Settings.LiveDragEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_SHIFT_ONLY,
      options: {
        name: "DT.Settings.LiveDragShiftOnly.Name",
        hint: "DT.Settings.LiveDragShiftOnly.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    onSocketMessage(SOCKET_FEATURE, onMessage);
    Hooks.on("refreshToken", onRefreshToken);
    Hooks.on("destroyToken", onDestroyToken);
    Hooks.on("updateToken", onUpdateToken);
    Hooks.on("userConnected", onUserConnected);
    Hooks.on("canvasTearDown", onCanvasTearDown);
  }
};

/**
 * Feature: Token Formations (system-agnostic)
 * -------------------------------------------
 * Foundry VTT v14+ · any system · made for gridless maps (works on grids too, optionally snapped)
 *
 * Select several tokens, open the formation window (Token HUD → Token Tools, or a keybinding)
 * and arrange them as a block, a honeycomb (hex), a ring or a random crowd. Sliders set how
 * close they stand (0.5 = crowded … 1 = touching, i.e. 5 ft between Medium creatures … 5 = far
 * apart; larger creatures keep larger distances), the width of a block and the facing; a select
 * decides who goes where (least movement by default, larger creatures first / last, or — dnd5e —
 * defenders (highest AC) / attackers (melee by attack bonus, then reach, then ranged) in front).
 * Within a rank, identical creatures (same rank, same size) settle by least movement and never
 * cross each other's paths.
 *
 * Preview: the main preview is a schematic picture INSIDE the window (where each token stands now
 * — faint —, its new place — solid, with its image or initial —, an arrow in between, the front,
 * red for places a wall blocks). On the canvas, ghosts of the new places (80 %) with thin arrows
 * show where on the map; while the window is open the real tokens are dimmed to 20 % — display
 * only, on this client (no document write, no socket).
 * Apply moves the tokens there together. The geometry lives in lib/formations.js (pure, tested).
 *
 * Places are kept free of walls: a candidate place is skipped if the straight line from the
 * formation's centre to it crosses a movement-blocking wall, or if it lies outside the CANVAS
 * (scene + padding — core's own movement limit: `Token#constrainMovementPath` stops at
 * `!canvas.dimensions.rect.contains(center)`, 14.370). Tokens parked in the padding next to the map
 * may stay there. The move itself is an ordinary token movement (`Scene#moveTokens`, method
 * "api"), so core still stops a token at a wall on its own way there and records the movement.
 *
 * Verified against the v14 source (14.364 / 14.370): `Scene#moveTokens({[id]: {destination,
 * autoRotate, showRuler}})` (`client/documents/scene.mjs`), `Token#checkCollision(center, {origin,
 * type, mode})`, `TokenDocument#getSize()` (px), `#getSnappedPosition({x, y})`, `Token#texture`,
 * `canvas.controls` (ControlsLayer, a PIXI container), `canvas.dimensions.rect` (= whole canvas,
 * `Scene#getDimensions`), `CONST.GRID_TYPES.GRIDLESS = 0`; move collisions use only the canvas'
 * outer bounds, not the scene rect (`ClockwiseSweepPolygon` edge types). Alpha:
 * `PlaceableObject#_refreshState` sets `this.alpha = _getTargetAlpha()`, `Token#_refreshState` /
 * `#_refreshMesh` set `mesh.alpha = this.alpha * document.alpha`; `refreshToken` fires right after.
 *
 * World switch (GM) and per-user HUD entry, both off; keybinding unbound. Players can arrange
 * the tokens they own.
 */

import { MODULE_ID } from "../constants.js";
import { registerTokenTool } from "../lib/token-tools.js";
import { planFormation, TYPES, ORDERS } from "../lib/formations.js";

const KEY_ENABLED = "formationEnabled";
const KEY_HUD = "formationHudButton";
const KEY_LAST = "formationLastOptions";

const DEFAULTS = { type: "block", spacing: 1, columns: 0, rotation: 0, order: "nearest", snap: true };
const TYPE_ICONS = {
  block: "fa-solid fa-table-cells",
  hex: "fa-solid fa-circle-nodes",
  circle: "fa-solid fa-circle-notch",
  crowd: "fa-solid fa-people-group"
};
const TYPE_LABELS = {
  block: "DT.Formation.Type.Block.Label",
  hex: "DT.Formation.Type.Hex.Label",
  circle: "DT.Formation.Type.Circle.Label",
  crowd: "DT.Formation.Type.Crowd.Label"
};
const TYPE_HINTS = {
  block: "DT.Formation.Type.Block.Hint",
  hex: "DT.Formation.Type.Hex.Hint",
  circle: "DT.Formation.Type.Circle.Hint",
  crowd: "DT.Formation.Type.Crowd.Hint"
};
const ORDER_LABELS = {
  nearest: "DT.Formation.Order.Nearest",
  largeFirst: "DT.Formation.Order.LargeFirst",
  largeLast: "DT.Formation.Order.LargeLast",
  defenders: "DT.Formation.Order.Defenders",
  attackers: "DT.Formation.Order.Attackers"
};
/** Orders that need system data (offered only where the system provides it — dnd5e). */
const SYSTEM_ORDERS = ["defenders", "attackers"];
const SVG_NS = "http://www.w3.org/2000/svg";
/** Canvas preview: real tokens dimmed to, ghosts of the new places at. */
const DIM_ALPHA = 0.2;
const GHOST_ALPHA = 0.8;

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/** The tokens a formation may move: the controlled ones the user owns, on the viewed scene. */
function formationTokens() {
  return movable(canvas?.tokens?.controlled ?? []);
}

/** Tokens of a list the user may arrange (owned, not locked). */
function movable(tokens) {
  return (tokens ?? []).filter(t => t?.document?.isOwner && !t.document.locked);
}

function lastOptions() {
  try {
    return { ...DEFAULTS, ...(game.settings.get(MODULE_ID, KEY_LAST) ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

const isGridless = () => (canvas?.grid?.type ?? 0) === (CONST.GRID_TYPES?.GRIDLESS ?? 0);
const isDnd5e = () => game.system?.id === "dnd5e";

/** The order modes the window offers in this world. */
function availableOrders() {
  return ORDERS.filter(order => !SYSTEM_ORDERS.includes(order) || isDnd5e());
}

/* -------------------------------------------- */
/*  Ranks from system data (dnd5e 5.3 / 6.x)    */
/* -------------------------------------------- */

const num = value => ((value === null) || (value === undefined) || (value === "") || !Number.isFinite(Number(value)) ? null : Number(value));

/**
 * The actor's primary attack as plain data, read synchronously from prepared dnd5e data
 * (same shapes in 5.3.3 and 6.0.6): the first item with an attack activity — equipped weapons
 * first, then other items (natural attacks, features), then spells, then unequipped weapons; by
 * the item's `sort` within a tier. To-hit = `activity.labels.modifier` (deterministic formula that
 * dnd5e itself `parseInt`s), fallback ability mod + proficiency.
 * @returns {{type: "melee"|"ranged", reach: number, units: string, bonus: number|null} | null}
 */
export function primaryAttack(actor) {
  const attacksOf = item => [...(item?.system?.activities ?? [])].filter(a => a?.type === "attack");
  const tier = item => {
    if (item.type === "weapon") return item.system?.equipped ? 0 : 3;
    return (item.type === "spell") ? 2 : 1;
  };
  const items = [...(actor?.items ?? [])].filter(item => attacksOf(item).length)
    .sort((a, b) => (tier(a) - tier(b)) || ((a.sort ?? 0) - (b.sort ?? 0)));
  const item = items[0];
  if (!item) return null;
  const activity = attacksOf(item)[0];
  const type = ((activity.attack?.type?.value || item.system?.attackType || "melee") === "ranged") ? "ranged" : "melee";
  const units = item.system?.range?.units || activity.range?.units || "ft";
  const foot = (units === "m") ? 0.3 : 1;
  let reach = Math.max(num(activity.range?.reach) ?? 0, num(item.system?.range?.reach) ?? 0);
  if (!reach) reach = (item.system?.properties?.has?.("rch") ? 10 : 5) * foot;
  let bonus = Number.parseInt(activity.labels?.modifier ?? item.labels?.modifier, 10);
  if (Number.isNaN(bonus)) {
    const abilities = actor.system?.abilities ?? {};
    let key = activity.ability;
    if (!(key in abilities)) key = ((type === "ranged") || ((abilities.dex?.mod ?? 0) > (abilities.str?.mod ?? 0))) ? "dex" : "str";
    const mod = num(abilities[key]?.mod);
    bonus = (mod === null) ? null : mod + (num(actor.system?.attributes?.prof) ?? 0);
  }
  return { type, reach, units, bonus };
}

/** Plain combat data of an actor: AC, max HP, primary attack (missing parts null). */
export function combatProfile(actor) {
  const attributes = actor?.system?.attributes;
  return { ac: num(attributes?.ac?.value), hpMax: num(attributes?.hp?.max), attack: actor ? primaryAttack(actor) : null };
}

/** Battle line of an attack: 0 melee, 1 reach (> 5 ft), 2 ranged, 3 no attack. */
export function attackerLine(attack) {
  if (!attack) return 3;
  if (attack.type === "ranged") return 2;
  const limit = (attack.units === "m") ? 1.5 : 5;
  return (attack.reach > limit + 1e-6) ? 1 : 0;
}

/** Sort keys per system order (lower = more to the front). */
const rankKeys = {
  defenders: p => [-(p?.ac ?? -1e6), -(p?.hpMax ?? 0)],
  attackers: p => [attackerLine(p?.attack), -(p?.attack?.bonus ?? 0)]
};

/** Dense ranks for lexicographically compared keys: equal keys → equal rank. */
export function denseRanks(keys) {
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d) return d;
    }
    return 0;
  };
  const unique = [...keys].sort(cmp).filter((k, i, all) => !i || cmp(k, all[i - 1]));
  return keys.map(k => unique.findIndex(u => !cmp(u, k)));
}

/**
 * Ranks per unit for a system order, or null (→ the lib falls back to size) when no token has
 * any of the data. Profiles without data get the last rank.
 * @param {object[]} profiles  combatProfile() per unit (same order)
 */
export function systemRanks(order, profiles) {
  if (!rankKeys[order]) return null;
  const has = (order === "defenders") ? (p => (p?.ac ?? null) !== null) : (p => !!p?.attack);
  if (!profiles.some(has)) return null;
  return denseRanks(profiles.map(rankKeys[order]));
}

/* -------------------------------------------- */
/*  Planning                                    */
/* -------------------------------------------- */

/** Formation units from tokens: current centre and radius in px. */
export function unitsOf(tokens) {
  return tokens.map(token => {
    const { width, height } = token.document.getSize();
    const c = token.center ?? { x: token.document.x + (width / 2), y: token.document.y + (height / 2) };
    return { id: token.id, r: Math.max(width, height) / 2, x: c.x, y: c.y };
  });
}

/** New top-left positions per token id for the given options (and which ones a wall stops). */
function computePlan(tokens, options) {
  const units = unitsOf(tokens);
  const byId = new Map(tokens.map(t => [t.id, t]));
  const anchor = {
    x: units.reduce((s, u) => s + u.x, 0) / (units.length || 1),
    y: units.reduce((s, u) => s + u.y, 0) / (units.length || 1)
  };
  let order = ORDERS.includes(options.order) ? options.order : "nearest";
  if (SYSTEM_ORDERS.includes(order) && !isDnd5e()) order = "largeFirst";
  if (SYSTEM_ORDERS.includes(order)) {
    const ranks = systemRanks(order, tokens.map(t => combatProfile(t.actor ?? t.document?.actor)));
    if (ranks) units.forEach((u, i) => { u.rank = ranks[i]; });
  }
  const probe = tokens[0];
  // The whole canvas (scene + padding) — core's own movement limit; only beyond it is invalid.
  const rect = canvas.dimensions?.rect;
  const valid = p => {
    if (rect && !rect.contains(p.x, p.y)) return false;
    try {
      return !probe.checkCollision(p, { origin: anchor, type: "move", mode: "any" });
    } catch {
      return true;
    }
  };
  const snap = (options.snap && !isGridless()) ? (unit, p) => {
    const doc = byId.get(unit.id).document;
    const { width, height } = doc.getSize();
    const s = doc.getSnappedPosition({ x: p.x - (width / 2), y: p.y - (height / 2) });
    return { x: s.x + (width / 2), y: s.y + (height / 2) };
  } : undefined;
  const centres = planFormation(units, { ...options, order, anchor, valid, snap });

  const moves = [];
  for (const token of tokens) {
    const centre = centres.get(token.id);
    if (!centre) continue;
    const { width, height } = token.document.getSize();
    const x = Math.round(centre.x - (width / 2));
    const y = Math.round(centre.y - (height / 2));
    let blocked = false;
    try {
      blocked = !!token.checkCollision(centre, { type: "move", mode: "any" });
    } catch { /* no collision test available */ }
    moves.push({ token, centre, x, y, blocked, unchanged: (x === token.document.x) && (y === token.document.y) });
  }
  return moves;
}

/* -------------------------------------------- */
/*  Schematic picture in the window             */
/* -------------------------------------------- */

/**
 * Layout of the in-window preview: current positions and new places, scaled together into a box
 * `width` wide (height follows the content's shape, between minHeight and maxHeight).
 * @returns {{width, height, places: {id, from: {x, y}, to: {x, y}, r, blocked, unchanged, label, img}[], front: {x, y, angle}}}
 */
export function schematicLayout(moves, rotation = 0, { width = 300, minHeight = 160, maxHeight = 300, pad = 14, maxR = 22 } = {}) {
  const places = moves.map(({ token, centre, blocked, unchanged }) => {
    const { width: w, height: h } = token.document.getSize();
    const name = token.document?.name ?? token.name ?? "";
    const from = token.center ?? { x: token.document.x + (w / 2), y: token.document.y + (h / 2) };
    return { id: token.id, from: { ...from }, to: { ...centre }, r: Math.max(w, h) / 2, blocked: !!blocked, unchanged: !!unchanged,
      label: String(name).trim().charAt(0).toUpperCase(), img: token.document?.texture?.src || null };
  });
  const angle = Number(rotation) || 0;
  if (!places.length) return { width, height: minHeight, places, front: { x: pad + 10, y: pad + 10, angle } };
  const points = places.flatMap(p => [p.from, p.to].map(q => ({ x: q.x, y: q.y, r: p.r })));
  const minX = Math.min(...points.map(q => q.x - q.r));
  const maxX = Math.max(...points.map(q => q.x + q.r));
  const minY = Math.min(...points.map(q => q.y - q.r));
  const maxY = Math.max(...points.map(q => q.y + q.r));
  const rMin = Math.min(...places.map(p => p.r));
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const height = Math.round(Math.min(maxHeight, Math.max(minHeight, (width - (2 * pad)) * (bh / bw) + (2 * pad))));
  const scale = Math.min((width - (2 * pad)) / bw, (height - (2 * pad)) / bh, maxR / rMin);
  const ox = (width / 2) - (((minX + maxX) / 2) * scale);
  const oy = (height / 2) - (((minY + maxY) / 2) * scale);
  const map = q => ({ x: (q.x * scale) + ox, y: (q.y * scale) + oy });
  for (const p of places) Object.assign(p, { from: map(p.from), to: map(p.to), r: p.r * scale });
  return { width, height, places, front: { x: pad + 10, y: pad + 10, angle } };
}

/** The in-window preview as an SVG element, or null where the DOM can't build SVG. */
function buildSchematic(layout) {
  if (typeof globalThis.document?.createElementNS !== "function") return null;
  const f = n => n.toFixed(1);
  const el = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  const svg = el("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, class: "dt-formation__svg", role: "img",
    "aria-label": localize("DT.Formation.Preview") });
  const defs = el("defs");
  const marker = el("marker", { id: "dt-formation-arrowhead", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0 0 L10 5 L0 10 Z", class: "dt-formation__arrowhead" }));
  defs.append(marker);
  svg.append(defs);
  // 1. where the tokens stand now (faint), 2. arrows, 3. the new places on top.
  for (const p of layout.places) {
    if (!p.unchanged) svg.append(el("circle", { cx: f(p.from.x), cy: f(p.from.y), r: f(p.r), class: "dt-formation__now" }));
  }
  for (const p of layout.places) {
    if (p.unchanged) continue;
    const dx = p.to.x - p.from.x;
    const dy = p.to.y - p.from.y;
    const len = Math.hypot(dx, dy);
    if (len <= p.r) continue;
    const end = { x: p.to.x - ((dx / len) * p.r), y: p.to.y - ((dy / len) * p.r) };
    svg.append(el("line", { x1: f(p.from.x), y1: f(p.from.y), x2: f(end.x), y2: f(end.y),
      class: `dt-formation__path${p.blocked ? " is-blocked" : ""}`, "marker-end": "url(#dt-formation-arrowhead)" }));
  }
  layout.places.forEach((p, i) => {
    const group = el("g", { class: `dt-formation__place${p.blocked ? " is-blocked" : ""}` });
    const circle = { cx: f(p.to.x), cy: f(p.to.y), r: f(p.r) };
    group.append(el("circle", { ...circle, class: "dt-formation__disc" }));
    if (p.label) {
      const text = el("text", { x: f(p.to.x), y: f(p.to.y), "font-size": f(p.r * 1.1), class: "dt-formation__initial" });
      text.textContent = p.label;
      group.append(text);
    }
    if (p.img) {
      const id = `dt-formation-clip-${i}`;
      const clip = el("clipPath", { id });
      clip.append(el("circle", circle));
      defs.append(clip);
      group.append(el("image", { href: p.img, x: f(p.to.x - p.r), y: f(p.to.y - p.r), width: f(2 * p.r), height: f(2 * p.r),
        "clip-path": `url(#${id})`, preserveAspectRatio: "xMidYMid slice" }));
    }
    group.append(el("circle", { ...circle, class: "dt-formation__ring" }));
    svg.append(group);
  });
  // Facing: an arrow pointing to the front (0° = up, clockwise like the facing slider).
  const { x, y, angle } = layout.front;
  const front = el("g", { class: "dt-formation__front", transform: `translate(${x} ${y}) rotate(${angle})` });
  front.append(el("circle", { cx: 0, cy: 0, r: 10 }), el("path", { d: "M0 -8 L6 4 L0 1 L-6 4 Z" }));
  const title = el("title");
  title.textContent = localize("DT.Formation.Front");
  front.append(title);
  svg.append(front);
  return svg;
}

/* -------------------------------------------- */
/*  Canvas preview: dimmed tokens, ghosts, arrows */
/* -------------------------------------------- */

/** Tokens currently dimmed by an open formation window (display only, this client). */
const dimmed = new Set();

/** Dim one token's container and mesh on top of what core computed (call after core's refresh). */
function applyDim(token) {
  if (!token || token.destroyed) return;
  const base = (typeof token._getTargetAlpha === "function") ? token._getTargetAlpha() : 1;
  token.alpha = base * DIM_ALPHA;
  if (token.mesh) token.mesh.alpha = token.alpha * (token.document?.alpha ?? 1);
}

/** Dim exactly these tokens; tokens dimmed before but not in the list get their alpha back. */
function setDimmed(tokens) {
  const keep = new Set(tokens);
  for (const token of [...dimmed]) if (!keep.has(token)) restoreToken(token);
  for (const token of keep) {
    dimmed.add(token);
    applyDim(token);
  }
}

/** Let core recompute the alpha (`refreshState` → `_refreshState`). */
function restoreToken(token) {
  dimmed.delete(token);
  if (!token || token.destroyed) return;
  try {
    token.renderFlags?.set({ refreshState: true });
  } catch (err) {
    console.error(`${MODULE_ID} | formation: restoring a token's alpha failed`, err);
  }
}

function restoreAll() {
  for (const token of [...dimmed]) restoreToken(token);
}

/** refreshToken: core reset the alpha (refreshState / refreshMesh) → dim again while open. */
function onRefreshToken(token, flags) {
  if (!dimmed.size || !dimmed.has(token)) return;
  try {
    if (token.destroyed) return void dimmed.delete(token);
    if (flags?.refreshState || flags?.refreshMesh) applyDim(token);
  } catch (err) {
    console.error(`${MODULE_ID} | formation: dimming failed`, err);
  }
}

class FormationPreview {
  constructor() {
    this.container = new PIXI.Container();
    this.container.eventMode = "none";
    canvas.controls.addChild(this.container);
  }

  draw(moves) {
    if (this.container.destroyed) return;
    for (const child of this.container.removeChildren()) child.destroy();
    const ghosts = this.container.addChild(new PIXI.Container());
    const lines = this.container.addChild(new PIXI.Graphics());
    const s = canvas.dimensions.uiScale ?? 1;
    for (const { token, centre, blocked, unchanged } of moves) {
      const colour = blocked ? 0xE04040 : 0x40C060;
      const { width, height } = token.document.getSize();
      const r = Math.max(width, height) / 2;
      if (token.texture) {
        const ghost = ghosts.addChild(new PIXI.Sprite(token.texture));
        ghost.anchor.set(0.5, 0.5);
        ghost.width = width;
        ghost.height = height;
        ghost.position.set(centre.x, centre.y);
        ghost.alpha = GHOST_ALPHA;
      }
      lines.lineStyle(2 * s, colour, 0.9).drawCircle(centre.x, centre.y, r);
      if (unchanged) continue;
      const from = token.center;
      const dx = centre.x - from.x;
      const dy = centre.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ux = dx / len;
      const uy = dy / len;
      const head = 10 * s;
      const tip = { x: centre.x - (ux * Math.min(r, len / 2)), y: centre.y - (uy * Math.min(r, len / 2)) };
      const wing = (sign) => ({ x: tip.x - (ux * head) - (uy * head * 0.5 * sign), y: tip.y - (uy * head) + (ux * head * 0.5 * sign) });
      // Dark under-stroke first, so the thin arrow reads on bright and dark maps alike.
      for (const [w, c, a] of [[4 * s, 0x000000, 0.6], [1.5 * s, colour, 1]]) {
        lines.lineStyle(w, c, a).moveTo(from.x, from.y).lineTo(tip.x, tip.y);
        const l = wing(1);
        const rr = wing(-1);
        lines.moveTo(l.x, l.y).lineTo(tip.x, tip.y).lineTo(rr.x, rr.y);
      }
    }
  }

  destroy() {
    if (!this.container.destroyed) this.container.destroy({ children: true });
  }
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

let FormationClass = null;
let current = null;

function make(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children);
  return node;
}

/** Built lazily: ApplicationV2 is a Foundry global, which feature files may not touch at import. */
function formationClass() {
  if (FormationClass) return FormationClass;
  const { ApplicationV2 } = foundry.applications.api;

  FormationClass = class TokenFormation extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "dt-token-formation",
      classes: ["dt-formation"],
      window: { icon: "fa-solid fa-people-group" },
      position: { width: 360, height: "auto" },
      actions: {
        type: TokenFormation.#onType,
        shuffle: TokenFormation.#onShuffle,
        apply: TokenFormation.#onApply,
        cancel: TokenFormation.#onCancel
      }
    };

    /** @type {object[]} Token placeables */ tokens;
    formation = { ...DEFAULTS, seed: 1 };
    #preview = null;
    #frame = null;
    #moves = [];

    constructor({ tokens = [], ...options } = {}) {
      super(options);
      this.tokens = tokens;
      this.formation = { ...lastOptions(), seed: Math.floor(Math.random() * 1e9) };
    }

    get title() {
      return localize("DT.Formation.Title");
    }

    async _renderHTML() {
      const o = this.formation;
      const n = this.tokens.length;
      const types = make("div", { class: "dt-formation__types", role: "radiogroup" }, TYPES.map(type => make("button", {
        type: "button", class: "dt-formation__type", "data-action": "type", "data-type": type,
        "aria-pressed": String(o.type === type), "data-tooltip": localize(TYPE_HINTS[type])
      }, [make("i", { class: TYPE_ICONS[type], inert: true }), make("span", {}, [localize(TYPE_LABELS[type])])])));
      const range = (name, label, min, max, step, value, forType) => make("div", {
        class: "form-group dt-formation__row", "data-for": forType
      }, [
        make("label", { for: `dt-formation-${name}` }, [localize(label)]),
        make("div", { class: "form-fields" }, [
          make("input", { type: "range", id: `dt-formation-${name}`, name, min, max, step, value }),
          make("output", { name: `${name}-value` })
        ])
      ]);
      const order = make("select", { name: "order", id: "dt-formation-order" },
        availableOrders().map(value => make("option", { value, selected: o.order === value }, [localize(ORDER_LABELS[value])])));
      const body = make("div", { class: "dt-formation__body" }, [
        make("p", { class: "dt-formation__count" }, [format("DT.Formation.Count", { count: n })]),
        types,
        make("div", { class: "dt-formation__schematic" }),
        range("spacing", "DT.Formation.Spacing", 0.5, 5, 0.1, o.spacing),
        range("columns", "DT.Formation.Columns", 0, Math.max(1, n), 1, Math.min(o.columns, n), "block"),
        range("rotation", "DT.Formation.Rotation", 0, 345, 15, o.rotation),
        make("div", { class: "form-group dt-formation__row" }, [
          make("label", { for: "dt-formation-order" }, [localize("DT.Formation.Order.Label")]),
          make("div", { class: "form-fields" }, [order])
        ]),
        isGridless() ? "" : make("div", { class: "form-group dt-formation__row" }, [
          make("label", { for: "dt-formation-snap" }, [localize("DT.Formation.Snap")]),
          make("div", { class: "form-fields" }, [make("input", { type: "checkbox", id: "dt-formation-snap", name: "snap", checked: !!o.snap })])
        ]),
        make("button", { type: "button", class: "dt-formation__shuffle", "data-action": "shuffle", "data-for": "crowd" },
          [make("i", { class: "fa-solid fa-shuffle", inert: true }), localize("DT.Formation.Shuffle")]),
        make("p", { class: "hint dt-formation__status" })
      ]);
      const footer = make("footer", { class: "dt-formation__footer" }, [
        make("button", { type: "button", "data-action": "apply", class: "dt-formation__apply" },
          [make("i", { class: "fa-solid fa-check", inert: true }), localize("DT.Formation.Apply")]),
        make("button", { type: "button", "data-action": "cancel" },
          [make("i", { class: "fa-solid fa-xmark", inert: true }), localize("DT.Formation.Cancel")])
      ]);
      return make("form", { class: "dt-formation__form", autocomplete: "off" }, [body, footer]);
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const form = this.element.querySelector("form");
      form.addEventListener("submit", event => event.preventDefault());
      form.addEventListener("input", () => this.#readForm());
      form.addEventListener("change", () => this.#readForm());
      this.#readForm();
    }

    _onClose(options) {
      super._onClose?.(options);
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#preview?.destroy();
      this.#preview = null;
      restoreAll();
      if (current === this) current = null;
    }

    /** Form → options, labels, visibility, preview. */
    #readForm() {
      const form = this.element?.querySelector("form");
      if (!form) return;
      const o = this.formation;
      const value = name => form.elements.namedItem(name)?.value;
      o.spacing = Number(value("spacing")) || 1;
      o.columns = Number(value("columns")) || 0;
      o.rotation = Number(value("rotation")) || 0;
      o.order = availableOrders().includes(value("order")) ? value("order") : "nearest";
      const snap = form.elements.namedItem("snap");
      if (snap) o.snap = !!snap.checked;

      const out = (name, text) => { const node = form.elements.namedItem(`${name}-value`) ?? form.querySelector(`output[name="${name}-value"]`); if (node) node.textContent = text; };
      out("spacing", `× ${o.spacing.toFixed(1)}`);
      out("columns", o.columns ? String(o.columns) : localize("DT.Formation.Auto"));
      out("rotation", `${o.rotation}°`);
      for (const button of form.querySelectorAll("[data-action='type']")) {
        button.setAttribute("aria-pressed", String(button.dataset.type === o.type));
      }
      for (const node of form.querySelectorAll("[data-for]")) node.hidden = node.dataset.for !== o.type;
      this.#schedulePreview();
    }

    #schedulePreview() {
      if (this.#frame) return;
      this.#frame = requestAnimationFrame(() => {
        this.#frame = null;
        this.#updatePreview();
      });
    }

    #updatePreview() {
      this.tokens = this.tokens.filter(t => !t.destroyed && t.document?.parent === canvas.scene);
      if (!this.tokens.length) return void this.close();
      try {
        this.#moves = computePlan(this.tokens, this.formation);
      } catch (err) {
        console.error(`${MODULE_ID} | formation planning failed`, err);
        this.#moves = [];
      }
      setDimmed(this.tokens);
      if (!this.#preview || this.#preview.container.destroyed) this.#preview = new FormationPreview();
      this.#preview.draw(this.#moves);
      this.#drawSchematic();
      const status = this.element?.querySelector(".dt-formation__status");
      const blocked = this.#moves.filter(m => m.blocked).length;
      if (status) status.textContent = blocked ? format("DT.Formation.Blocked", { count: blocked }) : "";
    }

    #drawSchematic() {
      const box = this.element?.querySelector(".dt-formation__schematic");
      if (!box) return;
      try {
        const svg = buildSchematic(schematicLayout(this.#moves, this.formation.rotation));
        if (svg) box.replaceChildren(svg);
        else box.hidden = true;
      } catch (err) {
        console.error(`${MODULE_ID} | formation schematic failed`, err);
      }
    }

    static #onType(event, target) {
      this.formation.type = target.dataset.type;
      this.#readForm();
    }

    static #onShuffle() {
      this.formation.seed = Math.floor(Math.random() * 1e9);
      this.#updatePreview();
    }

    static async #onApply() {
      this.#updatePreview();
      const moves = this.#moves.filter(m => !m.unchanged);
      const { seed, ...remember } = this.formation;
      game.settings.set(MODULE_ID, KEY_LAST, remember).catch(() => {});
      await this.close();
      await moveTokens(moves);
    }

    static #onCancel() {
      this.close();
    }
  };
  return FormationClass;
}

/** Move the tokens to their new places together (one movement operation). */
async function moveTokens(moves) {
  if (!moves.length) return 0;
  const instructions = {};
  for (const { token, x, y } of moves) instructions[token.id] = { destination: { x, y }, autoRotate: false, showRuler: false };
  try {
    await canvas.scene.moveTokens(instructions);
  } catch (err) {
    console.error(`${MODULE_ID} | formation: moving the tokens failed`, err);
    ui.notifications.error(format("DT.Formation.MoveError", { error: err.message }));
  }
  return moves.length;
}

/** Open the formation window for the controlled tokens (macro API too). */
export function openFormation({ tokens } = {}) {
  if (!enabled()) {
    ui.notifications.warn(localize("DT.Formation.Disabled"));
    return null;
  }
  const list = (tokens ?? formationTokens()).filter(t => t?.document?.isOwner);
  if (list.length < 2) {
    ui.notifications.info(localize("DT.Formation.NeedTokens"));
    return null;
  }
  current?.close();
  current = new (formationClass())({ tokens: list });
  current.render({ force: true });
  return current;
}

const HUD_TOOL = {
  id: "formation",
  order: 20,
  icon: "fa-solid fa-people-group",
  label: "DT.Formation.HudButton",
  visible: token => enabled() && !!game.settings.get(MODULE_ID, KEY_HUD) && !!token?.controlled
    && (formationTokens().length >= 2),
  onClick: () => openFormation(),
  /** Other entry points (e.g. Token Action HUD): world switch on and ≥ 2 movable tokens — independent of the per-user HUD setting. */
  available: tokens => enabled() && (movable(tokens).length >= 2),
  open: tokens => openFormation({ tokens })
};

/** For tools/test-features.mjs only. */
export const internals = {
  unitsOf, computePlan, moveTokens, HUD_TOOL, availableOrders, primaryAttack, combatProfile, attackerLine,
  denseRanks, systemRanks, schematicLayout, buildSchematic, setDimmed, restoreAll, onRefreshToken, dimmed,
  DIM_ALPHA, GHOST_ALPHA
};

export default {
  id: "tokenFormation",
  category: {
    label: "DT.Categories.Formation.Label",
    hint: "DT.Categories.Formation.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.FormationEnabled.Name",
        hint: "DT.Settings.FormationEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_HUD,
      options: {
        name: "DT.Settings.FormationHudButton.Name",
        hint: "DT.Settings.FormationHudButton.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_LAST,
      options: {
        scope: "client",
        config: false,
        type: Object,
        default: {}
      }
    }
  ],
  keybindings: [
    {
      action: "tokenFormation",
      options: {
        name: "DT.Keybindings.TokenFormation.Name",
        hint: "DT.Keybindings.TokenFormation.Hint",
        editable: [],
        onDown: () => {
          openFormation();
          return true;
        }
      }
    }
  ],
  init() {
    registerTokenTool(HUD_TOOL);
    Hooks.on("canvasTearDown", () => {
      current?.close();
      dimmed.clear();
    });
    Hooks.on("refreshToken", onRefreshToken);
    Hooks.on("destroyToken", token => dimmed.delete(token));
    const module = game.modules?.get(MODULE_ID);
    if (module) module.api = Object.assign(module.api ?? {}, { openFormation });
  }
};

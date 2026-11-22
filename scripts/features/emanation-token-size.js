/**
 * Feature: Emanations in Token Size (system-agnostic; caster handling for dnd5e 6)
 * -------------------------------------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * An emanation Region ("token" base + radius) starts with a 1×1 base everywhere: the Region
 * tool's emanation shape, dnd5e 6's TemplatePlacement and anything else that builds one. Core
 * adopts a token's x/y/size/shape — and attaches the Region to it — only while a placement with
 * `attachToToken` runs AND the mouse hovers a token at the last pointermove before the click
 * (`RegionLayer#attachPlacementToToken`, 14.370). The hand-drawn tool never looks for a token.
 * So an emanation from a Large creature often ends up Medium-sized and not following it.
 *
 * 1. Generic (setting `emanationTokenSize`, `preCreateRegion`, creating client only): every
 *    emanation shape whose base is still the untouched 1×1 token base is checked against the
 *    tokens of the viewed scene: the top-most token (elevation, then sort) whose shape contains
 *    the base's centre — tokens the user can see and that are not secret to them (GM: all), on
 *    the Region's level. The base becomes that token's `_source` {x, y, width, height, shape}.
 *    If the Region has exactly one shape and no attachment, it is also attached to the token —
 *    exactly what core writes when the hover worked: `attachment.token`, `levels: [token level]`,
 *    `hidden: token.hidden` and the elevation shifted by the token's elevation (+ depth for the
 *    top), finite bounds only. Decision: hand-drawn emanations get size AND attachment, because
 *    core keeps a base in sync with its token (moves and resizes) only when the base exactly
 *    equals the token's position/size AND the Region is attached
 *    (`TokenDocument##computeAttachedRegionUpdates`) — a resized but unattached base would be
 *    left behind at the first move. Undo / paste / keepId creations and already attached Regions
 *    are never touched. dnd5e Regions (`flags.dnd5e.activity`) are handled in step 2 instead.
 * 2. dnd5e 6 (`dnd5e.createMeasuredTemplate`, regionData before creation): the same size
 *    correction for unattached placements, but honouring dnd5e's `target.template.stationary`
 *    (size and position, never attached).
 * 3. dnd5e 6 (setting `emanationSelfOnCaster`): an emanation of an activity with range "self"
 *    that was not placed on a token goes onto the caster's token (`flags.dnd5e.origin`, else
 *    `activity.getUsageToken()`), with the caster's size, attached unless stationary. A click on
 *    another token keeps it there (attached by core's hover, or found under the click).
 *
 * World settings (GM), off by default. Untested at the table (written 2026-11-22).
 */

import { MODULE_ID } from "../constants.js";

const KEY_SIZE = "emanationTokenSize";
const KEY_SELF = "emanationSelfOnCaster";

const setting = key => !!game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Pure helpers (plain objects)                */
/* -------------------------------------------- */

/** An emanation shape with a token base that still has the default 1×1 size. */
function isDefaultTokenBase(shape) {
  return shape?.type === "emanation" && shape.base?.type === "token"
    && Number(shape.base.width) === 1 && Number(shape.base.height) === 1;
}

/** The emanation base for this token (its stored, not animated, data). */
function baseFromToken(tokenSource) {
  const { x, y, width, height, shape } = tokenSource;
  return { x, y, width, height, shape };
}

/** Centre of a token base in px; `size` = {x, y} px of one grid unit. */
function baseCenter(base, size) {
  return {
    x: Number(base.x) + (Number(base.width) * size.x / 2),
    y: Number(base.y) + (Number(base.height) * size.y / 2)
  };
}

/**
 * The top-most candidate containing the point. Candidates: `{token, contains(point), elevation,
 * sort}`; highest elevation wins, then highest sort.
 */
function pickToken(candidates, point) {
  let best = null;
  for (const c of candidates) {
    if (!c?.contains?.(point)) continue;
    if (!best || (c.elevation > best.elevation) || ((c.elevation === best.elevation) && (c.sort > best.sort))) best = c;
  }
  return best?.token ?? null;
}

/**
 * Rewrite plain region data so that shape `index` emanates from the token (TokenDocument-like
 * with `_source`). With `attach`, also attach the region like core's placement does on hover
 * (`RegionLayer#attachPlacementToToken`, 14.370): attachment, levels, hidden, elevation shifted
 * by the token's elevation (top also by depth × grid distance), finite bounds only.
 */
function applyToken(data, index, tokenDoc, { attach = false, gridDistance = 1 } = {}) {
  const src = tokenDoc._source ?? tokenDoc;
  const shape = data.shapes[index];
  shape.base = { ...shape.base, ...baseFromToken(src) };
  if (!attach) return data;
  data.attachment = { ...(data.attachment ?? {}), token: tokenDoc.id ?? src._id };
  if (typeof src.level === "string" && src.level) data.levels = [src.level];
  data.hidden = !!(tokenDoc.hidden ?? src.hidden);
  const elevation = data.elevation;
  if (elevation && typeof elevation === "object") {
    const e = Number(src.elevation) || 0;
    const depth = Number(src.depth) || 0;
    data.elevation = {
      bottom: Number.isFinite(elevation.bottom) ? elevation.bottom + e : null,
      top: Number.isFinite(elevation.top) ? elevation.top + e + (depth * gridDistance) : null
    };
  }
  return data;
}

/* -------------------------------------------- */
/*  Canvas glue                                 */
/* -------------------------------------------- */

function gridUnit() {
  const grid = canvas.grid;
  return { x: grid.sizeX ?? grid.size, y: grid.sizeY ?? grid.size };
}

function levelsOf(region) {
  const levels = region?.levels;
  if (!levels) return [];
  return Array.from(levels, l => l?.id ?? l).filter(l => typeof l === "string" && l);
}

/** Scene levels: if both sides name one, they must match (same rule as Template Auto-Targeting). */
function onLevels(doc, levels) {
  if (!levels.length) return true;
  const level = doc._source?.level ?? doc.level?.id ?? doc.level;
  if (typeof level !== "string" || !level) return true;
  return levels.includes(level);
}

/** A token the user could have hovered: visible to them and not secret (GM: every token). */
function selectable(token) {
  const doc = token?.document;
  if (!doc) return false;
  if (game.user.isGM) return true;
  return !!token.visible && !doc.isSecret;
}

function containsFn(token) {
  const doc = token.document;
  const src = doc._source ?? doc;
  return p => {
    if (typeof token.shape?.contains === "function") return token.shape.contains(p.x - src.x, p.y - src.y);
    const size = doc.getSize?.() ?? { width: (src.width ?? 1) * canvas.grid.size, height: (src.height ?? 1) * canvas.grid.size };
    return (p.x >= src.x) && (p.x <= src.x + size.width) && (p.y >= src.y) && (p.y <= src.y + size.height);
  };
}

function candidates(levels) {
  return (canvas.tokens?.placeables ?? [])
    .filter(t => selectable(t) && onLevels(t.document, levels))
    .map(t => ({
      token: t.document,
      contains: containsFn(t),
      elevation: Number(t.document._source?.elevation ?? t.document.elevation) || 0,
      sort: Number(t.document._source?.sort ?? t.document.sort) || 0
    }));
}

/** The token whose shape contains the centre of this base, or null. */
function tokenUnderBase(base, levels) {
  return pickToken(candidates(levels), baseCenter(base, gridUnit()));
}

const canvasReady = () => !!(canvas?.ready && canvas.tokens && canvas.grid);

/* -------------------------------------------- */
/*  1. Generic: preCreateRegion                 */
/* -------------------------------------------- */

function onPreCreateRegion(document, data, options = {}, userId) {
  try {
    if (!setting(KEY_SIZE)) return;
    if (options.isUndo || options.isPaste || options.keepId) return;
    if (userId && game.user?.id && userId !== game.user.id) return;
    if (!canvasReady() || document.parent !== canvas.scene) return;
    const src = document._source ?? document;
    if (src.attachment?.token) return;
    if (foundry.utils.getProperty(src, "flags.dnd5e.activity")) return;     // handled in dnd5e.createMeasuredTemplate
    const shapes = Array.from(src.shapes ?? []);
    if (!shapes.some(isDefaultTokenBase)) return;

    const changes = foundry.utils.deepClone({
      shapes: shapes.map(s => (typeof s?.toObject === "function" ? s.toObject() : s)),
      attachment: src.attachment ?? { token: null },
      levels: Array.from(src.levels ?? []),
      hidden: !!src.hidden,
      elevation: src.elevation ? { bottom: src.elevation.bottom ?? null, top: src.elevation.top ?? null } : undefined
    });
    const levels = levelsOf(src);
    let changed = false;
    changes.shapes.forEach((shape, i) => {
      if (!isDefaultTokenBase(shape)) return;
      const token = tokenUnderBase(shape.base, levels);
      if (!token) return;
      applyToken(changes, i, token, { attach: changes.shapes.length === 1, gridDistance: canvas.grid.distance ?? 1 });
      changed = true;
    });
    if (!changed) return;
    if (changes.elevation === undefined) delete changes.elevation;
    document.updateSource(changes);
  } catch (err) {
    console.error(`${MODULE_ID} | Emanations in Token Size failed`, err);
  }
}

/* -------------------------------------------- */
/*  2./3. dnd5e 6: dnd5e.createMeasuredTemplate */
/* -------------------------------------------- */

/** The caster's token on the viewed scene (dnd5e's usage token). */
function casterToken(data, activity) {
  const uuid = data?.flags?.dnd5e?.origin;
  let token = null;
  if (typeof uuid === "string" && uuid && typeof globalThis.fromUuidSync === "function") {
    try { token = fromUuidSync(uuid); } catch { token = null; }
  }
  if (token?.documentName !== "Token") token = activity?.getUsageToken?.() ?? null;   // a TokenDocument
  if (!token || (token.parent && token.parent !== canvas.scene)) return null;
  return token;
}

function onCreateMeasuredTemplate(activity, regionData) {
  try {
    const sizeOn = setting(KEY_SIZE);
    const selfOn = setting(KEY_SELF);
    if ((!sizeOn && !selfOn) || !canvasReady() || !Array.isArray(regionData)) return;
    const stationary = !!activity?.target?.template?.stationary;
    const isSelf = activity?.range?.units === "self";
    const gridDistance = canvas.grid.distance ?? 1;
    for (const data of regionData) {
      if (!data || !Array.isArray(data.shapes) || data.attachment?.token) continue;
      const levels = levelsOf(data);
      const attach = !stationary && data.shapes.length === 1;
      data.shapes.forEach((shape, i) => {
        if (!isDefaultTokenBase(shape)) return;
        const under = tokenUnderBase(shape.base, levels);
        const caster = (selfOn && isSelf) ? casterToken(data, activity) : null;
        let token = null;
        if (under) {
          if (sizeOn || (caster && (under === caster || under.id === caster.id))) token = under;
        } else if (caster) token = caster;
        if (token) applyToken(data, i, token, { attach, gridDistance });
      });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Emanations in Token Size: adjusting the dnd5e template failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = { isDefaultTokenBase, baseFromToken, baseCenter, pickToken, applyToken };

export default {
  id: "emanationTokenSize",
  category: {
    label: "DT.Categories.EmanationTokenSize.Label",
    hint: "DT.Categories.EmanationTokenSize.Hint"
  },
  settings: [
    {
      key: KEY_SIZE,
      options: {
        name: "DT.Settings.EmanationTokenSize.Name",
        hint: "DT.Settings.EmanationTokenSize.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_SELF,
      options: {
        name: "DT.Settings.EmanationSelfOnCaster.Name",
        hint: "DT.Settings.EmanationSelfOnCaster.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.on("preCreateRegion", onPreCreateRegion);
    Hooks.on("dnd5e.createMeasuredTemplate", onCreateMeasuredTemplate);
  }
};

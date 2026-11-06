/**
 * Feature: Template Auto-Targeting (system-agnostic; dnd5e 6 chat-card support)
 * -----------------------------------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * When you place a template (v14: a Region — from the Region layer's "Measured Template Mode"
 * (`flags.core.MeasuredTemplate`) or dnd5e's TemplatePlacement (`flags.dnd5e.activity`)), every creature
 * in its area becomes YOUR target — your previous targets are released. Which creatures count
 * follows the D&D rules (see lib/area-coverage.js for the sources):
 *   - Square / hex grid (default "half", DMG 2024 p. 44): a space is affected if the area
 *     covers at least half of it; a creature is in the area if one of its spaces is affected
 *     (`TokenDocument#getOccupiedGridSpaceOffsets`, so Large = 4 squares, Huge = 9, …).
 *     Alternatives: "any" (Xanathar's template method) and "center" (= Foundry's highlighted
 *     "covered grid spaces").
 *   - Gridless (default "half"): the creature's base (ellipse or rectangle) is split into
 *     sections of one grid unit — Large 2×2, Huge 3×3, Medium or smaller one section — and the
 *     same rule is applied per section. That carries the grid rule over without making big
 *     creatures either trivially hit (any overlap) or nearly unhittable (centre / half of the
 *     whole base). "any" = Xanathar's rule without a grid: any part of the base overlapped.
 * Emanations don't include their origin creature (PHB 2024 / SRD 5.2 rules glossary: "An
 * Emanation's origin … isn't included in the area of effect unless its creator decides
 * otherwise"); the other shapes are pure geometry. Walls are respected through the Region's own
 * shape (dnd5e restricts template Regions by walls). Elevation is only checked against the
 * Region's elevation range — a flying creature above a 2D template is targeted too.
 *
 * Only the creator's client acts (`createRegion` with userId === me), only for tokens on the
 * viewed scene that have an actor; hidden tokens only for the GM with the setting on, players
 * only target tokens they can see; defeated creatures are skipped unless the setting is on.
 *
 * dnd5e 6: the usage card stores its targets (`system.targets`) BEFORE the template is placed
 * (`Activity#use` → `_createUsageMessage` → `_finalizeUsage` → `#placeTemplate`), and its "Roll
 * Save" / damage buttons read them later. So after `dnd5e.postCreateMeasuredTemplate` the card's
 * targets are replaced by the template's creatures (dnd5e's own `TargetsField.getDescriptors`),
 * locally at once (`updateSource`, so `dnd5e.postUseActivity` listeners such as RSReforged see
 * them) and in the database (`update` with `diff: false`).
 *
 * World settings (GM), off by default.
 */

import { MODULE_ID } from "../constants.js";
import { RULES, baseAffected, baseSections, gridSpaceAffected } from "../lib/area-coverage.js";

const KEY_ENABLED = "templateTargetEnabled";
const KEY_GRID = "templateTargetGridRule";
const KEY_GRIDLESS = "templateTargetGridlessRule";
const KEY_HIDDEN = "templateTargetHidden";
const KEY_DEFEATED = "templateTargetDefeated";

/** How many recent chat messages are searched for the usage card of a later "Place Template". */
const CARD_SEARCH_DEPTH = 50;

const setting = key => game.settings.get(MODULE_ID, key);
const enabled = () => !!setting(KEY_ENABLED);
const ruleFor = key => (RULES.includes(setting(key)) ? setting(key) : "half");
const getProperty = (obj, path) => foundry.utils.getProperty(obj, path);

/** Usage cards by activity (dnd5e passes the same activity object to both hooks of one use). */
let cards = new WeakMap();
/** Regions created by this user in the current task (one placement may create several). */
let batch = null;

/**
 * A template Region: core's marker, or dnd5e's — dnd5e 6.0.6 sets `flags.core.MeasuredTemplate`
 * only on the placement previews; the Regions it creates carry `flags.dnd5e.activity` instead.
 */
const isTemplate = region => !!(getProperty(region, "flags.core.MeasuredTemplate")
  || getProperty(region, "flags.dnd5e.activity"));

/** Emanations exclude their origin creature (the attached token or dnd5e's usage token). */
function excludedTokenIds(region) {
  const ids = new Set();
  const shapes = Array.from(region.shapes ?? []);
  if (!shapes.some(s => s?.type === "emanation")) return ids;
  const attached = region.attachment?.token;
  const attachedId = attached?.id ?? attached;
  if (typeof attachedId === "string" && attachedId) ids.add(attachedId);
  const origin = getProperty(region, "flags.dnd5e.origin");
  if (typeof origin === "string" && origin) ids.add(origin.split(".").pop());
  return ids;
}

function isDefeated(token) {
  const id = CONFIG.specialStatusEffects?.DEFEATED;
  if (!id) return false;
  return !!(token.actor?.statuses?.has?.(id) || token.document?.hasStatusEffect?.(id));
}

/** Scene levels (v14): if both sides name a level, they must match (v14 impl unverified). */
function onRegionLevel(doc, region) {
  const levels = region.levels;
  if (!levels?.size) return true;
  const level = doc.level?.id ?? doc.level;
  if (typeof level !== "string" || !level) return true;
  for (const l of levels) if ((l?.id ?? l) === level) return true;
  return false;
}

function eligible(token, region, excluded) {
  const doc = token?.document;
  if (!doc || !token.actor || excluded.has(doc.id)) return false;
  if (doc.hidden && !(game.user.isGM && setting(KEY_HIDDEN))) return false;
  if (!game.user.isGM && !token.visible) return false;
  if (!setting(KEY_DEFEATED) && isDefeated(token)) return false;
  return onRegionLevel(doc, region);
}

function tokenSize(doc) {
  const size = doc.getSize?.();
  if (size?.width > 0 && size?.height > 0) return size;
  const unit = canvas.grid.size;
  return { width: (doc.width ?? 1) * unit, height: (doc.height ?? 1) * unit };
}

const intersects = (a, b) => (a.x < b.x + b.width) && (b.x < a.x + a.width)
  && (a.y < b.y + b.height) && (b.y < a.y + a.height);

function isEllipse(doc) {
  const shapes = globalThis.CONST?.TOKEN_SHAPES;
  if (!shapes) return false;
  return doc.shape === shapes.ELLIPSE_1 || doc.shape === shapes.ELLIPSE_2;
}

/** Is this token in the region's area by the configured rule? */
function tokenInRegion(token, region) {
  const doc = token.document;
  const elevation = doc.elevation ?? 0;
  const inside = (x, y) => (typeof region.testPoint === "function"
    ? region.testPoint({ x, y, elevation })
    : !!region.polygonTree?.testPoint?.({ x, y }));
  const { width, height } = tokenSize(doc);
  const bounds = region.bounds;
  if (bounds && !intersects({ x: doc.x, y: doc.y, width, height }, bounds)) return false;

  const grid = canvas.grid;
  if (!grid.isGridless) {
    const rule = ruleFor(KEY_GRID);
    const n = grid.isHexagonal ? 10 : 8;
    for (const o of doc.getOccupiedGridSpaceOffsets?.() ?? []) {
      if (gridSpaceAffected(grid.getVertices({ i: o.i, j: o.j }), inside, rule, n)) return true;
    }
    return false;
  }
  const sections = baseSections({ x: doc.x, y: doc.y, width, height, ellipse: isEllipse(doc) }, grid.size);
  return baseAffected(sections, inside, ruleFor(KEY_GRIDLESS));
}

/** The tokens of the viewed scene in any of these template regions. */
function tokensInRegions(regions) {
  const found = new Set();
  if (!canvas?.ready || !canvas.tokens) return found;
  for (const region of regions) {
    if (!region || region.parent !== canvas.scene) continue;
    const excluded = excludedTokenIds(region);
    for (const token of canvas.tokens.placeables ?? []) {
      if (found.has(token) || !eligible(token, region, excluded)) continue;
      try {
        if (tokenInRegion(token, region)) found.add(token);
      } catch (err) {
        console.error(`${MODULE_ID} | Template Auto-Targeting: testing ${token.name} failed`, err);
      }
    }
  }
  return found;
}

/** Make exactly these tokens the user's targets. */
function applyTargets(tokens) {
  for (const t of Array.from(game.user.targets ?? [])) {
    if (!tokens.has(t)) t.setTarget(false, { releaseOthers: false });
  }
  for (const t of tokens) {
    if (!game.user.targets?.has(t)) t.setTarget(true, { releaseOthers: false });
  }
}

function onCreateRegion(region, options, userId) {
  try {
    if (userId !== game.user.id || !enabled() || !isTemplate(region)) return;
    if (!batch) {
      batch = new Set();
      setTimeout(() => { batch = null; }, 0);
    }
    batch.add(region);
    applyTargets(tokensInRegions(batch));
  } catch (err) {
    console.error(`${MODULE_ID} | Template Auto-Targeting failed`, err);
  }
}

/* -------------------------------------------- */
/*  dnd5e 6: the usage card's recorded targets  */
/* -------------------------------------------- */

function onPostCreateUsageMessage(activity, card) {
  if (activity && typeof card?.update === "function") cards.set(activity, card);
}

/** The usage card of a template placed later from its "Place Template" button. */
function findUsageCard(activity) {
  const messages = game.messages?.contents ?? [];
  for (let i = messages.length - 1, n = 0; (i >= 0) && (n < CARD_SEARCH_DEPTH); i--, n++) {
    const m = messages[i];
    if (m?.type !== "usage" || !m.isAuthor) continue;
    if (m.getAssociatedActivity?.()?.uuid === activity.uuid) return m;
  }
  return null;
}

function describeTargets(tokens) {
  const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
  if (typeof TargetsField?.getDescriptors === "function") return TargetsField.getDescriptors(tokens);
  // Same shape as dnd5e 6.0.6 TargetsField.getDescriptors
  return Array.from(tokens, t => {
    const doc = t.document ?? t;
    const actor = doc.actor;
    const ac = actor?.statuses?.has?.("coverTotal") ? null : actor?.system?.attributes?.ac?.value;
    return { actor: actor?.uuid, ac: ac ?? null, img: doc.texture?.src, name: doc.name, token: doc.uuid };
  }).filter(d => d.actor);
}

function onPostCreateMeasuredTemplate(activity, regions) {
  try {
    if (!enabled() || !activity) return;
    const card = cards.get(activity) ?? findUsageCard(activity);
    if (!Array.isArray(card?.system?.targets)) return;             // dnd5e 6 usage cards only
    if (!(card.isAuthor || game.user.isGM)) return;
    const templates = Array.from(regions ?? []).filter(r => r?.documentName !== "Region" || isTemplate(r));
    const targets = describeTargets(tokensInRegions(templates));
    card.updateSource?.({ "system.targets": targets });
    card.update({ "system.targets": targets }, { diff: false })
      ?.catch?.(err => console.error(`${MODULE_ID} | Template Auto-Targeting: updating the card failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | Template Auto-Targeting: updating the card failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = {
  tokensInRegions, tokenInRegion, excludedTokenIds,
  reset() { cards = new WeakMap(); batch = null; }
};

const ruleChoices = prefix => ({
  half: `DT.Settings.${prefix}.Half`,
  any: `DT.Settings.${prefix}.Any`,
  center: `DT.Settings.${prefix}.Center`
});

export default {
  id: "templateTargeting",
  category: {
    label: "DT.Categories.TemplateTargeting.Label",
    hint: "DT.Categories.TemplateTargeting.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.TemplateTargetEnabled.Name",
        hint: "DT.Settings.TemplateTargetEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_GRID,
      options: {
        name: "DT.Settings.TemplateTargetGridRule.Name",
        hint: "DT.Settings.TemplateTargetGridRule.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: ruleChoices("TemplateTargetGridRule"),
        default: "half"
      }
    },
    {
      key: KEY_GRIDLESS,
      options: {
        name: "DT.Settings.TemplateTargetGridlessRule.Name",
        hint: "DT.Settings.TemplateTargetGridlessRule.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: ruleChoices("TemplateTargetGridlessRule"),
        default: "half"
      }
    },
    {
      key: KEY_HIDDEN,
      options: {
        name: "DT.Settings.TemplateTargetHidden.Name",
        hint: "DT.Settings.TemplateTargetHidden.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_DEFEATED,
      options: {
        name: "DT.Settings.TemplateTargetDefeated.Name",
        hint: "DT.Settings.TemplateTargetDefeated.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.on("createRegion", onCreateRegion);
    Hooks.on("dnd5e.postCreateUsageMessage", onPostCreateUsageMessage);
    Hooks.on("dnd5e.postCreateMeasuredTemplate", onPostCreateMeasuredTemplate);
  }
};

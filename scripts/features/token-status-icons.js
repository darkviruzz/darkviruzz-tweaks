/**
 * Feature: Token Status Icons (system-agnostic)
 * ---------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * How core draws a token's effect icons (v14 14.364, `client/canvas/placeables/token.mjs`):
 * `Token#_drawEffects` takes the actor's `appliedEffects` with `showIcon` ALWAYS (or
 * CONDITIONAL and temporary), draws one sprite per effect into `token.effects` with
 * `zIndex = index` in that list, and the LAST effect with `flags.core.overlay` becomes the big
 * overlay (`token.effects.overlay`, alpha 0.8). `Token#_refreshEffects` then lays the icons out
 * at a fixed 20 px × `canvas.dimensions.uiScale` in columns from the top left, and the overlay
 * at 60 % of the token, centred, with a translucent black rounded rect (`token.effects.bg`)
 * behind every small icon.
 *
 * Three options (purely visual, every client lays out its own canvas — no document is written):
 *   - Overlay by priority: a GM-chosen, ordered list of conditions (default Dead, Unconscious)
 *     is shown as the big overlay; the first active one wins (Dead over Unconscious), effects
 *     with core's own overlay flag come after the list. The overlay is not repeated as a small
 *     icon. The list is edited with a sortable widget inside the settings window (drag & drop
 *     or arrows), stored as comma-separated status ids (or effect names).
 *   - Larger icons when there are few: icon size = token height / count, between the normal
 *     size and N × normal (default 2) — 1–2 icons double size on a 1×1 token, 3 → 33 px, 4 →
 *     25 px, from 5 the normal 20 px. Larger tokens fit more large icons.
 *   - Ignored effects (names or status ids, e.g. "bloodied, concentrating"): either shown at
 *     normal size and not counted, or not drawn on the token at all.
 *
 * Implementation: the `refreshToken` hook runs synchronously right after core's
 * `_applyRenderFlags` (`PlaceableObject#applyRenderFlags`) — when `flags.refreshEffects` is set
 * we re-lay the sprites core just laid out, so no frame shows core's layout. Sprites are matched
 * to effects through core's `zIndex = index`; if they don't match (a redraw is pending), core's
 * layout stays until the redraw's own refresh.
 *
 * World settings (GM), both switches off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY_OVERLAY = "statusOverlayEnabled";
const KEY_OVERLAY_LIST = "statusOverlayList";
const KEY_DYNAMIC = "statusIconsDynamicSize";
const KEY_MAX_SCALE = "statusIconsMaxScale";
const KEY_IGNORED = "statusIconsIgnored";
const KEY_IGNORED_MODE = "statusIconsIgnoredMode";

/** Core's overlay: 60 % of the token, alpha 0.8. */
const OVERLAY_SIZE = 0.6;
const OVERLAY_ALPHA = 0.8;
/** Core's small icon size before uiScale. */
const BASE_SIZE = 20;

const setting = key => game.settings.get(MODULE_ID, key);

/** "a, b ,c" → ["a", "b", "c"] */
export function parseList(value) {
  return String(value ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

/** Does the entry (status id or effect name, case-insensitive) describe this effect? */
function matches(effect, entry) {
  const key = entry.toLowerCase();
  if (effect?.statuses && [...effect.statuses].some(s => String(s).toLowerCase() === key)) return true;
  return String(effect?.name ?? "").toLowerCase() === key;
}

function findLastIndex(list, predicate) {
  for (let i = list.length - 1; i >= 0; i--) if (predicate(list[i])) return i;
  return -1;
}

/**
 * Index of the effect to show as the overlay: the first entry of the priority list that is
 * active (the last such effect, like core), else core's own overlay flag, else -1.
 */
export function overlayIndex(effects, priority) {
  for (const entry of priority) {
    const index = findLastIndex(effects, e => matches(e, entry));
    if (index >= 0) return index;
  }
  return findLastIndex(effects, e => !!e?.flags?.core?.overlay);
}

/**
 * Size of the counted icons: token height / count, clamped to [base, base × maxScale].
 * @param {number} count     Icons that count (not overlay, not ignored).
 * @param {number} height    Token height in px.
 * @param {number} base      Normal icon size in px.
 * @param {number} maxScale  Largest size as a multiple of `base`.
 */
export function iconSize(count, height, base, maxScale) {
  if (count <= 0) return base;
  const max = base * Math.max(1, Number(maxScale) || 1);
  return Math.max(base, Math.min(max, height / count));
}

/**
 * Column layout like core's, but with mixed sizes: top to bottom, a new column when the next
 * icon doesn't fit below. Returns {x, y} per size.
 */
export function columnLayout(sizes, height) {
  const out = [];
  let x = 0;
  let y = 0;
  let column = 0;
  for (const size of sizes) {
    if ((y > 0) && (y + size > height + 1e-6)) {
      x += column;
      y = 0;
      column = 0;
    }
    out.push({ x, y });
    y += size;
    column = Math.max(column, size);
  }
  return out;
}

/** The effects core draws icons for, in core's order (= the sprites' zIndex). */
function drawnEffects(token) {
  const SHOW_ICON = CONST.ACTIVE_EFFECT_SHOW_ICON;
  return token.actor?.appliedEffects?.filter(e => ((e.showIcon === SHOW_ICON.ALWAYS)
    || ((e.showIcon === SHOW_ICON.CONDITIONAL) && e.isTemporary))) ?? [];
}

function anyActive() {
  return !!(setting(KEY_OVERLAY) || setting(KEY_DYNAMIC) || ((setting(KEY_IGNORED_MODE) === "hide") && parseList(setting(KEY_IGNORED)).length));
}

/**
 * Plan the layout: for each sprite its role and size.
 * @param {object[]} sprites  [{zIndex}] (the effect sprites, without the background)
 * @param {object[]} effects  drawnEffects(token)
 * @param {object} opts       {overlay: boolean, priority, coreOverlay (sprite|null), dynamic, maxScale,
 *                             ignored: string[], ignoredMode, base, height}
 * @returns {{overlay: object|null, icons: {sprite, size, x, y}[], hidden: object[]}|null}
 *   null when the sprites don't match the effects (redraw pending)
 */
export function planLayout(sprites, effects, opts) {
  if (sprites.some(s => !Number.isInteger(s.zIndex) || (s.zIndex < 0) || (s.zIndex >= effects.length))) return null;
  const byIndex = new Map(sprites.map(s => [s.zIndex, s]));
  let overlay = opts.coreOverlay ?? null;
  if (opts.overlay) {
    const index = overlayIndex(effects, opts.priority);
    overlay = (index >= 0) ? (byIndex.get(index) ?? null) : null;
  }
  const counted = [];
  const small = [];
  const hidden = [];
  for (const sprite of [...sprites].sort((a, b) => a.zIndex - b.zIndex)) {
    if (sprite === overlay) continue;
    const effect = effects[sprite.zIndex];
    const ignored = opts.ignored.some(entry => matches(effect, entry));
    if (ignored && (opts.ignoredMode === "hide")) hidden.push(sprite);
    else if (ignored) small.push(sprite);
    else counted.push(sprite);
  }
  const big = opts.dynamic ? iconSize(counted.length, opts.height, opts.base, opts.maxScale) : opts.base;
  const list = [...counted.map(sprite => ({ sprite, size: big })), ...small.map(sprite => ({ sprite, size: opts.base }))];
  const positions = columnLayout(list.map(i => i.size), opts.height);
  return { overlay, icons: list.map((icon, i) => ({ ...icon, ...positions[i] })), hidden };
}

/** Re-lay a token's effect icons (after core's _refreshEffects). */
function relayout(token) {
  const fx = token?.effects;
  if (!fx || fx.destroyed || (fx.renderable === false) || !token.document) return;
  const bg = fx.bg;
  const sprites = fx.children.filter(c => (c !== bg) && !c.destroyed);
  const { width, height } = token.document.getSize();
  const s = canvas.dimensions.uiScale ?? 1;
  const plan = planLayout(sprites, drawnEffects(token), {
    overlay: !!setting(KEY_OVERLAY),
    priority: parseList(setting(KEY_OVERLAY_LIST)),
    coreOverlay: fx.overlay ?? null,
    dynamic: !!setting(KEY_DYNAMIC),
    maxScale: Number(setting(KEY_MAX_SCALE)) || 1,
    ignored: parseList(setting(KEY_IGNORED)),
    ignoredMode: setting(KEY_IGNORED_MODE),
    base: BASE_SIZE * s,
    height
  });
  if (!plan) return;

  fx.overlay = plan.overlay;
  if (plan.overlay) {
    const size = Math.min(width, height) * OVERLAY_SIZE;
    plan.overlay.visible = true;
    plan.overlay.alpha = OVERLAY_ALPHA;
    plan.overlay.anchor?.set(0.5, 0.5);
    plan.overlay.width = plan.overlay.height = size;
    plan.overlay.position = token.document.getCenterPoint({ x: 0, y: 0 });
  }
  bg?.clear().beginFill(0x000000, 0.40).lineStyle(s, 0x000000);
  for (const { sprite, size, x, y } of plan.icons) {
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.anchor?.set(0, 0);
    sprite.width = sprite.height = size;
    sprite.x = x;
    sprite.y = y;
    bg?.drawRoundedRect(x + s, y + s, size - (2 * s), size - (2 * s), 2 * s);
  }
  for (const sprite of plan.hidden) sprite.visible = false;
}

function onRefreshToken(token, flags) {
  if (!flags?.refreshEffects) return;
  try {
    if (anyActive()) relayout(token);
  } catch (err) {
    console.error(`${MODULE_ID} | token status icons failed`, err);
  }
}

/** Settings changed: redraw every token's effects (restores core's layout when switched off). */
function redrawAll() {
  for (const token of canvas?.tokens?.placeables ?? []) token.renderFlags?.set({ redrawEffects: true });
}

/* -------------------------------------------- */
/*  Sortable priority list in the settings      */
/* -------------------------------------------- */

/** All statuses of the system: [{id, label, img}]. CONFIG.statusEffects is an object in v14. */
function statusChoices() {
  const list = Object.values(CONFIG.statusEffects ?? {});
  return list.filter(s => s?.id).map(s => ({ id: s.id, label: game.i18n.localize(s.name ?? s.label ?? s.id), img: s.img ?? s.icon }));
}

function make(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** Replace the comma-separated text input with a sortable list (the input stays the form value). */
function buildOrderWidget(input) {
  if (input.dataset.dtSortable) return;
  input.dataset.dtSortable = "1";
  // Not the hidden attribute: core's form CSS sets display on inputs (CLAUDE.md CSS gotcha).
  input.style.display = "none";
  const choices = statusChoices();
  const info = id => choices.find(c => c.id === id) ?? { id, label: id, img: null };
  const widget = make("div", { class: "dt-status-order" });
  const list = make("ol", { class: "dt-status-order__list" });
  const add = make("select", { class: "dt-status-order__add", "aria-label": game.i18n.localize("DT.StatusIcons.Add") });
  widget.append(list, add);
  input.after(widget);

  const write = ids => {
    input.value = ids.join(", ");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    render();
  };
  const current = () => parseList(input.value);
  const move = (from, to) => {
    const ids = current();
    if ((to < 0) || (to >= ids.length) || (from === to)) return;
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    write(ids);
  };
  let dragged = null;

  function render() {
    const ids = current();
    list.replaceChildren(...ids.map((id, index) => {
      const { label, img } = info(id);
      const button = (iconClass, tooltip, handler, disabled = false) => {
        const b = make("button", { type: "button", class: "dt-status-order__button", "data-tooltip": game.i18n.localize(tooltip),
          "aria-label": game.i18n.localize(tooltip) }, [make("i", { class: iconClass, inert: "" })]);
        b.disabled = disabled;
        b.addEventListener("click", event => { event.preventDefault(); handler(); });
        return b;
      };
      const item = make("li", { class: "dt-status-order__item", draggable: "true" }, [
        make("i", { class: "fa-solid fa-grip-vertical dt-status-order__grip", inert: "" }),
        make("span", { class: "dt-status-order__rank" }, [String(index + 1)]),
        ...(img ? [make("img", { src: img, alt: "" })] : []),
        make("span", { class: "dt-status-order__label" }, [label]),
        button("fa-solid fa-arrow-up", "DT.StatusIcons.Up", () => move(index, index - 1), index === 0),
        button("fa-solid fa-arrow-down", "DT.StatusIcons.Down", () => move(index, index + 1), index === ids.length - 1),
        button("fa-solid fa-xmark", "DT.StatusIcons.Remove", () => write(ids.filter((_, i) => i !== index)))
      ]);
      item.addEventListener("dragstart", event => {
        dragged = index;
        event.dataTransfer?.setData("text/plain", id);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => { dragged = null; item.classList.remove("dragging"); });
      item.addEventListener("dragover", event => event.preventDefault());
      item.addEventListener("drop", event => {
        event.preventDefault();
        event.stopPropagation();
        if (dragged !== null) move(dragged, index);
      });
      return item;
    }));
    const placeholder = make("option", { value: "" }, [game.i18n.localize("DT.StatusIcons.Add")]);
    add.replaceChildren(placeholder, ...choices.filter(c => !ids.includes(c.id))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(c => make("option", { value: c.id }, [c.label])));
    add.value = "";
  }

  add.addEventListener("change", () => {
    if (add.value) write([...current(), add.value]);
  });
  render();
}

function onRenderSettingsConfig(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const input = root?.querySelector(`[name="${MODULE_ID}.${KEY_OVERLAY_LIST}"]`);
    if (input) buildOrderWidget(input);
  } catch (err) {
    console.error(`${MODULE_ID} | token status icons (settings list) failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = { parseList, overlayIndex, iconSize, columnLayout, planLayout };

export default {
  id: "tokenStatusIcons",
  category: {
    label: "DT.Categories.StatusIcons.Label",
    hint: "DT.Categories.StatusIcons.Hint"
  },
  settings: [
    {
      key: KEY_OVERLAY,
      options: {
        name: "DT.Settings.StatusOverlayEnabled.Name",
        hint: "DT.Settings.StatusOverlayEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: redrawAll
      }
    },
    {
      key: KEY_OVERLAY_LIST,
      options: {
        name: "DT.Settings.StatusOverlayList.Name",
        hint: "DT.Settings.StatusOverlayList.Hint",
        scope: "world",
        config: true,
        type: String,
        default: "dead, unconscious",
        onChange: redrawAll
      }
    },
    {
      key: KEY_DYNAMIC,
      options: {
        name: "DT.Settings.StatusIconsDynamicSize.Name",
        hint: "DT.Settings.StatusIconsDynamicSize.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: redrawAll
      }
    },
    {
      key: KEY_MAX_SCALE,
      options: {
        name: "DT.Settings.StatusIconsMaxScale.Name",
        hint: "DT.Settings.StatusIconsMaxScale.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 1, max: 4, step: 0.25 },
        default: 2,
        onChange: redrawAll
      }
    },
    {
      key: KEY_IGNORED,
      options: {
        name: "DT.Settings.StatusIconsIgnored.Name",
        hint: "DT.Settings.StatusIconsIgnored.Hint",
        scope: "world",
        config: true,
        type: String,
        default: "",
        onChange: redrawAll
      }
    },
    {
      key: KEY_IGNORED_MODE,
      options: {
        name: "DT.Settings.StatusIconsIgnoredMode.Name",
        hint: "DT.Settings.StatusIconsIgnoredMode.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
          small: "DT.Settings.StatusIconsIgnoredMode.Small",
          hide: "DT.Settings.StatusIconsIgnoredMode.Hide"
        },
        default: "small",
        onChange: redrawAll
      }
    }
  ],
  init() {
    Hooks.on("refreshToken", onRefreshToken);
    Hooks.on("renderSettingsConfig", onRenderSettingsConfig);
  }
};

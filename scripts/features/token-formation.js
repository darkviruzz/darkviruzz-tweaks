/**
 * Feature: Token Formations (system-agnostic)
 * -------------------------------------------
 * Foundry VTT v14+ · any system · made for gridless maps (works on grids too, optionally snapped)
 *
 * Select several tokens, open the formation window (Token HUD → Token Tools, or a keybinding)
 * and arrange them as a block, a honeycomb (hex), a ring or a random crowd. Sliders set how
 * close they stand (0.5 = crowded … 1 = touching, i.e. 5 ft between Medium creatures … 5 = far
 * apart; larger creatures keep larger distances), the width of a block and the facing; a select
 * decides who goes where (least movement by default, or larger creatures first / last). A live
 * preview on the canvas shows ghost images at the new places, a line from each token to its
 * place, and marks in red where a wall is in the way. Apply moves the tokens there together.
 * The geometry lives in lib/formations.js (pure, tested in Node).
 *
 * Places are kept free of walls: a candidate place is skipped if the straight line from the
 * formation's centre to it crosses a movement-blocking wall, or if it lies outside the scene.
 * The move itself is an ordinary token movement (`Scene#moveTokens`, method "api"), so core
 * still stops a token at a wall on its own way there and records the movement as usual.
 *
 * Verified against the v14 source (14.364): `Scene#moveTokens({[id]: {destination, autoRotate,
 * showRuler}})` (`client/documents/scene.mjs`), `Token#checkCollision(center, {origin, type,
 * mode})`, `TokenDocument#getSize()` (px), `#getSnappedPosition({x, y})`, `Token#texture`,
 * `canvas.controls` (ControlsLayer, a PIXI container), `canvas.dimensions.sceneRect`,
 * `CONST.GRID_TYPES.GRIDLESS = 0`.
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
  largeLast: "DT.Formation.Order.LargeLast"
};

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/** The tokens a formation may move: the controlled ones the user owns, on the viewed scene. */
function formationTokens() {
  return (canvas?.tokens?.controlled ?? []).filter(t => t?.document?.isOwner && !t.document.locked);
}

function lastOptions() {
  try {
    return { ...DEFAULTS, ...(game.settings.get(MODULE_ID, KEY_LAST) ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

const isGridless = () => (canvas?.grid?.type ?? 0) === (CONST.GRID_TYPES?.GRIDLESS ?? 0);

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
  const probe = tokens[0];
  const rect = canvas.dimensions?.sceneRect;
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
  const centres = planFormation(units, { ...options, anchor, valid, snap });

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
/*  Canvas preview                              */
/* -------------------------------------------- */

class FormationPreview {
  constructor() {
    this.container = new PIXI.Container();
    this.container.eventMode = "none";
    canvas.controls.addChild(this.container);
  }

  draw(moves) {
    if (this.container.destroyed) return;
    for (const child of this.container.removeChildren()) child.destroy();
    const lines = this.container.addChild(new PIXI.Graphics());
    const s = canvas.dimensions.uiScale ?? 1;
    for (const { token, centre, blocked, unchanged } of moves) {
      const colour = blocked ? 0xE04040 : 0x40C060;
      const { width, height } = token.document.getSize();
      if (!unchanged) {
        lines.lineStyle(2 * s, colour, 0.8).moveTo(token.center.x, token.center.y).lineTo(centre.x, centre.y);
      }
      lines.lineStyle(2 * s, colour, 0.9).drawCircle(centre.x, centre.y, Math.max(width, height) / 2);
      if (token.texture) {
        const ghost = this.container.addChild(new PIXI.Sprite(token.texture));
        ghost.anchor.set(0.5, 0.5);
        ghost.width = width;
        ghost.height = height;
        ghost.position.set(centre.x, centre.y);
        ghost.alpha = 0.5;
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
        ORDERS.map(value => make("option", { value, selected: o.order === value }, [localize(ORDER_LABELS[value])])));
      const body = make("div", { class: "dt-formation__body" }, [
        make("p", { class: "dt-formation__count" }, [format("DT.Formation.Count", { count: n })]),
        types,
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
      o.order = value("order") || "nearest";
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
      if (!this.#preview || this.#preview.container.destroyed) this.#preview = new FormationPreview();
      this.#preview.draw(this.#moves);
      const status = this.element?.querySelector(".dt-formation__status");
      const blocked = this.#moves.filter(m => m.blocked).length;
      if (status) status.textContent = blocked ? format("DT.Formation.Blocked", { count: blocked }) : "";
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
  onClick: () => openFormation()
};

/** For tools/test-features.mjs only. */
export const internals = { unitsOf, computePlan, moveTokens, HUD_TOOL };

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
    Hooks.on("canvasTearDown", () => current?.close());
    const module = game.modules?.get(MODULE_ID);
    if (module) module.api = Object.assign(module.api ?? {}, { openFormation });
  }
};

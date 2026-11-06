/**
 * Feature: Token Art Picker — Too Many Tokens (system-agnostic)
 * --------------------------------------------------------------
 * Foundry VTT v14+ · any system · needs "Too Many Tokens – Online" INSTALLED (may be inactive)
 *
 * Replaces TMT Online's macro "DND/PF – Get Too Many Tokens For Selected Tokens" (identical to
 * the module's too-many-tokens-online-show-dialogue-*.js). That macro offers a datalist of
 * creature names, then checkbox columns built from the POSITION of CamelCase words in the file
 * names (positions differ between files, so the generated regex `.*(A).*(B).*` misses
 * variants), shows no images at all, and writes a fake wildcard path
 * `tmtopptmtopptmtopp_<sys>_<creature>_<regex>.webp` + `randomImg` to the prototype that only
 * TMT's own `createToken` hook understands (it runs on every client, updates the token after
 * creation, and throws for every other token because it never checks its input).
 *
 * This picker shows the variants as a gallery with preview: it guesses the creature from the
 * current TMT image, the actor/token/compendium-source name, offers ranked suggestions and a
 * search over all creatures, filters by attribute chips (AND, order-independent) and text, and
 * applies the chosen image(s) to the selected tokens (several images → spread randomly), the
 * prototype token and/or the actor portrait. Optional wildcard: the selection is stored on the
 * actor (flag `tokenArtPool`, compact {base, files}) and `preCreateToken` — which runs only on
 * the creating client and may modify the pending document with `updateSource` — gives each new
 * token a random image (no immediate repeats). Only tokens that would show the prototype image
 * are randomised; a token created with another image (e.g. pasted) keeps it. Our prototype
 * keeps `randomImg: false` (core can't browse remote URLs as a wildcard).
 *
 * Entry points: Token HUD button (per-user option), Actors sidebar context entry (prototype),
 * keybinding (unbound) and `game.modules.get("darkviruzz-tweaks").api.openTokenArtPicker()`
 * for a macro. Only documents the user owns are changed.
 *
 * Verified (Foundry v14 API 14.368): `getActorContextOptions(app, menuItems)` with
 * ContextMenuEntry `{label, icon, visible(target), onClick(event, target)}`;
 * `preCreateToken(document, data, options, userId)` fires only for the initiating client and
 * may call `document.updateSource`; `TokenDocument#baseActor`; ApplicationV2 `_renderHTML` /
 * `_replaceHTML` and `[data-action]` handlers `(event, target)`. Token HUD DOM
 * (`renderTokenHUD(hud, html)`, `html` HTMLElement with `.col.left/.col.right`, `hud.object`
 * = Token) from token-border 1.0 (verified v14) and Token Variant Art (v13).
 *
 * World switch (GM) off by default; the HUD button is a per-user option, also off.
 */

import { MODULE_ID } from "../constants.js";
import {
  tmtInstalled, sameImage, parseImageUrl, parseLegacyWildcard, rankCreatures,
  compactPool, expandPool, randomPick, distribute, loadCreatureNames, loadVariants, variantFromUrl
} from "../lib/too-many-tokens.js";

const KEY_ENABLED = "tokenArtEnabled";
const KEY_HUD = "tokenArtHudButton";
const FLAG_POOL = "tokenArtPool";

/** Thumbnails rendered per page (each image is ~40 KB from GitHub). */
const PAGE_SIZE = 120;
/** Minimum name-match score to preselect a creature automatically. */
const AUTO_MATCH_SCORE = 50;

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/** Last random image per actor id — the next token avoids it. */
const lastPicks = new Map();

/** The world-level actor behind a token document. */
function baseActorOf(tokenDoc) {
  return tokenDoc?.baseActor ?? game.actors?.get(tokenDoc?.actorId) ?? null;
}

/** The wildcard pool (image URLs) stored on an actor. */
export function poolOf(actor) {
  return expandPool(actor?.getFlag?.(MODULE_ID, FLAG_POOL));
}

/* ---------- wildcard on placement ---------- */

function onPreCreateToken(tokenDoc) {
  if (!enabled()) return;
  const actor = baseActorOf(tokenDoc);
  const pool = poolOf(actor);
  if (pool.length < 2) return;
  // Only tokens that would show the prototype image; an explicitly chosen image stays.
  if (!sameImage(tokenDoc.texture?.src, actor.prototypeToken?.texture?.src)) return;
  const pick = randomPick(pool, lastPicks.get(actor.id));
  lastPicks.set(actor.id, pick);
  tokenDoc.updateSource({ "texture.src": pick });
}

/* ---------- applying ---------- */

/**
 * The document updates for applying `urls`: tokens get the images spread randomly (grouped
 * per scene), actors get the first image as prototype/portrait and, with `wildcard`, the
 * whole selection as pool. `clearPool` marks actors whose old pool must be removed.
 */
export function planUpdates({ tokens = [], actors = [], urls, prototype, wildcard, portrait, random }) {
  const picks = distribute(urls, tokens.length, random);
  const tokenUpdates = new Map();
  tokens.forEach((doc, i) => {
    if (!tokenUpdates.has(doc.parent)) tokenUpdates.set(doc.parent, []);
    tokenUpdates.get(doc.parent).push({ _id: doc.id, "texture.src": picks[i] });
  });

  const actorUpdates = [];
  for (const actor of actors) {
    const update = {};
    if (prototype) {
      update["prototypeToken.texture.src"] = urls[0];
      update["prototypeToken.randomImg"] = false;
      if (wildcard) update[`flags.${MODULE_ID}.${FLAG_POOL}`] = compactPool(urls);
    }
    if (portrait) update.img = urls[0];
    if (!Object.keys(update).length) continue;
    actorUpdates.push({ actor, update, clearPool: !!prototype && !wildcard && poolOf(actor).length > 0 });
  }
  return { tokenUpdates, actorUpdates };
}

/* ---------- small DOM helper (no innerHTML with data) ---------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (["checked", "disabled", "value", "selected"].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.filter(child => child !== null && child !== undefined && child !== false));
  return node;
}

const icon = cls => el("i", { class: cls, inert: true });

/** Name of the compendium entry an actor was imported from, if resolvable. */
function sourceName(actor) {
  const uuid = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId;
  if (!uuid || typeof fromUuidSync !== "function") return null;
  try {
    return fromUuidSync(uuid)?.name ?? null;
  } catch {
    return null;
  }
}

/* ---------- the picker window ---------- */

let PickerClass = null;
let current = null;

/** Built lazily: ApplicationV2 is a Foundry global, which feature files may not touch at import. */
function pickerClass() {
  if (PickerClass) return PickerClass;
  const { ApplicationV2 } = foundry.applications.api;

  PickerClass = class TokenArtPicker extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ["dt-token-art"],
      window: { icon: "fa-solid fa-images", resizable: true },
      position: { width: 980, height: 720 },
      actions: {
        pick: TokenArtPicker.#onPick,
        tag: TokenArtPicker.#onTag,
        creature: TokenArtPicker.#onCreature,
        clearFilters: TokenArtPicker.#onClearFilters,
        more: TokenArtPicker.#onMore,
        selectMatching: TokenArtPicker.#onSelectMatching,
        clearSelection: TokenArtPicker.#onClearSelection,
        onlySelected: TokenArtPicker.#onOnlySelected,
        apply: TokenArtPicker.#onApply
      }
    };

    /** @type {TokenDocument[]} */ tokens;
    /** @type {Actor[]} */ actors;
    #ready = false;
    #els = {};
    #broken = new Set();
    #searchTimer = null;
    #listedNames = null;
    state = {
      system: "dnd", names: [], hints: [], creature: "", variants: [], loading: false, error: null,
      tags: new Set(), search: "", shown: PAGE_SIZE, selected: new Set(), anchor: null,
      hover: null, current: null, legacy: null, pool: 0, onlySelected: false
    };
    opts = { tokens: false, prototype: false, wildcard: false, portrait: false };

    constructor({ tokens = [], actors = [], ...options } = {}) {
      super(options);
      this.tokens = tokens;
      this.actors = actors;
      this.opts.tokens = tokens.length > 0;
      this.opts.prototype = !tokens.length && actors.length > 0;
    }

    get title() {
      return localize("DT.TokenArt.Title");
    }

    /* ----- data ----- */

    async _prepareContext(options) {
      if (!this.#ready) {
        this.#ready = true;
        await this.#initialise();
      }
      return {};
    }

    async #initialise() {
      const s = this.state;
      const actor = this.actors.length === 1 ? this.actors[0] : null;
      const proto = actor?.prototypeToken?.texture?.src;
      s.current = this.tokens[0]?.texture?.src ?? proto ?? null;

      const pool = poolOf(actor);
      s.legacy = parseLegacyWildcard(proto);
      const known = parseImageUrl(s.current) ?? parseImageUrl(pool[0]) ?? parseImageUrl(proto)
        ?? parseImageUrl(actor?.img);
      s.system = known?.system ?? s.legacy?.system ?? (game.system?.id === "pf2e" ? "pf" : "dnd");
      s.hints = [...new Set([
        ...this.tokens.map(t => t.name),
        ...this.actors.flatMap(a => [a.name, a.prototypeToken?.name, sourceName(a)])
      ].filter(Boolean))];
      await this.#loadNames();

      let creature = known?.creature ?? s.legacy?.creatures[0] ?? "";
      if (!creature) {
        const best = rankCreatures(s.names, s.hints, 1)[0];
        if (best?.score >= AUTO_MATCH_SCORE) creature = best.name;
      }
      if (creature) await this.#loadCreature(creature, { refresh: false });

      if (pool.length) {
        pool.forEach(url => s.selected.add(url));
        s.pool = pool.length;
        this.opts.wildcard = pool.length > 1;
      } else if (s.legacy) {
        const matches = [];
        for (const name of s.legacy.creatures) {
          try {
            // TMT tested its regex against "<creature>/<file>".
            matches.push(...(await loadVariants(s.legacy.system, name)).filter(v => s.legacy.regex.test(`${v.creature}/${v.file}`)));
          } catch { /* creature missing from the list */ }
        }
        matches.forEach(v => s.selected.add(v.url));
        this.opts.wildcard = matches.length > 1;
      }
      if (s.selected.size || s.legacy) this.opts.prototype = this.actors.length > 0;
      s.anchor = [...s.selected][0] ?? null;
      // Show an existing pool first — it is usually spread over several pages.
      s.onlySelected = s.selected.size > 0;
    }

    async #loadNames() {
      const s = this.state;
      try {
        s.names = await loadCreatureNames(s.system);
        s.error = null;
      } catch (err) {
        s.names = [];
        s.error = format("DT.TokenArt.LoadError", { error: err.message });
      }
    }

    /** Switch the gallery to a creature (exact or case-insensitive name). */
    async #loadCreature(name, { refresh = true } = {}) {
      const s = this.state;
      const wanted = String(name ?? "").trim().toLowerCase();
      const creature = s.names.find(n => n.toLowerCase() === wanted);
      if (!creature) return false;
      if (creature === s.creature && (s.loading || s.variants.length)) return true;
      s.creature = creature;
      s.variants = [];
      s.onlySelected = false;
      s.tags.clear();
      s.search = "";
      s.shown = PAGE_SIZE;
      s.loading = true;
      if (refresh) this.#refresh();
      try {
        s.variants = await loadVariants(s.system, creature);
        s.error = null;
      } catch (err) {
        s.error = format("DT.TokenArt.LoadError", { error: err.message });
      }
      s.loading = false;
      if (refresh && s.creature === creature) this.#refresh();
      return true;
    }

    /** The creature's variants — or, in "only selected" mode, the selection (any creature). */
    #base() {
      const s = this.state;
      if (!s.onlySelected) return s.variants;
      return [...s.selected].map(url => s.variants.find(v => v.url === url) ?? variantFromUrl(url)).filter(Boolean);
    }

    /** Variants passing the tag + text filters (broken images excluded). */
    #filtered() {
      const { tags, search } = this.state;
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      return this.#base().filter(v => !this.#broken.has(v.url)
        && [...tags].every(t => v.tags.includes(t))
        && terms.every(term => `${v.stem} ${v.file}`.toLowerCase().includes(term)));
    }

    /* ----- rendering (DOM built here, partial refreshes afterwards) ----- */

    async _renderHTML(context, options) {
      const s = this.state;
      const listId = `${this.id}-creatures`;

      const system = el("select", { name: "system" }, [
        el("option", { value: "dnd", text: localize("DT.TokenArt.SystemDnd"), selected: s.system === "dnd" }),
        el("option", { value: "pf", text: localize("DT.TokenArt.SystemPf"), selected: s.system === "pf" })
      ]);
      system.addEventListener("change", () => this.#onSystemChange(system.value));

      const creature = el("input", {
        type: "search", name: "creature", list: listId, value: s.creature, autocomplete: "off",
        placeholder: localize("DT.TokenArt.CreaturePlaceholder")
      });
      // Exact names (typed or picked from the datalist) load at once; Enter takes the best match.
      creature.addEventListener("input", () => this.#loadCreature(creature.value));
      creature.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        // Exact name, else the shortest name containing the typed text, else the best word match.
        const typed = creature.value.trim().toLowerCase();
        const best = s.names.find(n => n.toLowerCase() === typed)
          ?? (typed ? s.names.filter(n => n.toLowerCase().includes(typed)).sort((a, b) => a.length - b.length)[0] : null)
          ?? rankCreatures(s.names, [typed], 1)[0]?.name;
        if (!best) return;
        creature.value = best;
        this.#loadCreature(best);
      });

      const search = el("input", {
        type: "search", name: "filter", value: s.search, autocomplete: "off",
        placeholder: localize("DT.TokenArt.FilterPlaceholder")
      });
      search.addEventListener("input", () => {
        clearTimeout(this.#searchTimer);
        this.#searchTimer = setTimeout(() => {
          s.search = search.value;
          s.shown = PAGE_SIZE;
          this.#refreshTags();
          this.#refreshGallery();
        }, 150);
      });

      const gallery = el("section", { class: "dt-ta-gallery" });
      gallery.addEventListener("pointerover", event => {
        const item = event.target.closest?.(".dt-ta-item");
        if (item && item.dataset.url !== s.hover) { s.hover = item.dataset.url; this.#refreshPreview(); }
      });
      gallery.addEventListener("pointerleave", () => { s.hover = null; this.#refreshPreview(); });

      const checkbox = key => {
        const input = el("input", { type: "checkbox", name: key, checked: this.opts[key] });
        input.addEventListener("change", () => { this.opts[key] = input.checked; this.#refreshFooter(); });
        const text = el("span");
        return { input, text, label: el("label", { class: "dt-ta-option", dataset: { option: key } }, [input, text]) };
      };
      const checks = {
        tokens: checkbox("tokens"),
        prototype: checkbox("prototype"),
        wildcard: checkbox("wildcard"),
        portrait: checkbox("portrait")
      };

      this.#els = {
        system, creature, search, gallery, options: checks,
        datalist: el("datalist", { id: listId }),
        suggestions: el("div", { class: "dt-ta-suggestions" }),
        notice: el("p", { class: "dt-ta-notice" }),
        tags: el("div", { class: "dt-ta-tags" }),
        count: el("span", { class: "dt-ta-count" }),
        preview: el("img", { alt: "" }),
        caption: el("figcaption"),
        selection: el("div", { class: "dt-ta-selection" }),
        apply: el("button", { type: "button", class: "dt-ta-apply", dataset: { action: "apply" } }, [
          icon("fa-solid fa-check"), el("span", { text: localize("DT.TokenArt.Apply") })
        ])
      };
      this.#els.preview.addEventListener("error", () => this.#els.preview.classList.add("broken"));
      this.#els.preview.addEventListener("load", () => this.#els.preview.classList.remove("broken"));

      const e = this.#els;
      const root = el("div", { class: "dt-ta-root" }, [
        el("header", { class: "dt-ta-head" }, [
          el("label", { class: "dt-ta-field" }, [el("span", { text: localize("DT.TokenArt.System") }), system]),
          el("label", { class: "dt-ta-field dt-ta-creature" }, [el("span", { text: localize("DT.TokenArt.Creature") }), creature, e.datalist]),
          e.suggestions
        ]),
        e.notice,
        el("div", { class: "dt-ta-filters" }, [
          e.tags,
          el("div", { class: "dt-ta-filter-row" }, [
            search,
            el("button", { type: "button", dataset: { action: "clearFilters" }, "data-tooltip": localize("DT.TokenArt.ClearFilters"), "aria-label": localize("DT.TokenArt.ClearFilters") }, [icon("fa-solid fa-filter-circle-xmark")]),
            e.count
          ])
        ]),
        el("div", { class: "dt-ta-body" }, [
          gallery,
          el("aside", { class: "dt-ta-side" }, [
            el("figure", { class: "dt-ta-preview" }, [e.preview, e.caption]),
            e.selection,
            el("p", { class: "dt-ta-hint", text: localize("DT.TokenArt.PickHint") })
          ])
        ]),
        el("footer", { class: "dt-ta-foot" }, [
          el("div", { class: "dt-ta-options" }, Object.values(checks).map(o => o.label)),
          e.apply
        ])
      ]);
      this.#refresh();
      return root;
    }

    _replaceHTML(result, content, options) {
      content.replaceChildren(result);
    }

    _onClose(options) {
      clearTimeout(this.#searchTimer);
      if (current === this) current = null;
      super._onClose?.(options);
    }

    #refresh() {
      const s = this.state;
      const e = this.#els;
      if (!e.gallery) return;
      e.system.value = s.system;
      if (document.activeElement !== e.creature) e.creature.value = s.creature;
      e.search.value = s.search;
      if (this.#listedNames !== s.names) {
        this.#listedNames = s.names;
        e.datalist.replaceChildren(...s.names.map(name => el("option", { value: name })));
      }
      this.#refreshSuggestions();
      this.#refreshNotice();
      this.#refreshTags();
      this.#refreshGallery();
      this.#refreshFooter();
    }

    #refreshSuggestions() {
      const s = this.state;
      // Creatures already in use first (current image, old TMT wildcard, selection), then name matches.
      const inUse = [s.current, ...s.selected].map(url => parseImageUrl(url)?.creature);
      const ranked = rankCreatures(s.names, s.hints, 6).map(r => r.name);
      const names = [...new Set([...inUse, ...(s.legacy?.creatures ?? []), ...ranked].filter(n => n && s.names.includes(n)))].slice(0, 8);
      this.#els.suggestions.replaceChildren(
        ...(names.length ? [el("span", { class: "dt-ta-label", text: localize("DT.TokenArt.Suggestions") })] : []),
        ...names.map(name => el("button", {
          type: "button", class: `dt-ta-chip${name === s.creature ? " active" : ""}`,
          dataset: { action: "creature", creature: name }, "aria-pressed": String(name === s.creature), text: name
        }))
      );
    }

    #refreshNotice() {
      const s = this.state;
      let text = s.error ?? "";
      if (!text && s.pool) text = format("DT.TokenArt.PoolLoaded", { count: s.pool });
      else if (!text && s.legacy) text = format("DT.TokenArt.LegacyWildcard", { creatures: s.legacy.creatures.join(", ") });
      this.#els.notice.textContent = text;
      this.#els.notice.hidden = !text;
      this.#els.notice.classList.toggle("error", !!s.error);
    }

    #refreshTags() {
      const s = this.state;
      const filtered = this.#filtered();
      const total = new Map();
      for (const v of this.#base()) for (const t of v.tags) total.set(t, (total.get(t) ?? 0) + 1);
      const inFilter = new Map();
      for (const v of filtered) for (const t of v.tags) inFilter.set(t, (inFilter.get(t) ?? 0) + 1);
      const tags = [...total.keys()].sort((a, b) => (total.get(b) - total.get(a)) || a.localeCompare(b));
      this.#els.tags.replaceChildren(...tags.map(tag => {
        const active = s.tags.has(tag);
        const count = inFilter.get(tag) ?? 0;
        return el("button", {
          type: "button", class: `dt-ta-chip${active ? " active" : ""}`, disabled: !active && !count,
          dataset: { action: "tag", tag }, "aria-pressed": String(active)
        }, [el("span", { text: tag }), el("span", { class: "dt-ta-chip-count", text: String(count) })]);
      }));
    }

    #refreshGallery() {
      const s = this.state;
      const e = this.#els;
      if (!s.onlySelected && (s.loading || !s.creature || (!s.variants.length && s.error))) {
        e.count.textContent = "";
        e.gallery.replaceChildren(el("p", { class: "dt-ta-empty", text: localize(s.loading ? "DT.TokenArt.Loading" : "DT.TokenArt.ChooseCreature") }));
        this.#refreshPreview();
        return;
      }
      const filtered = this.#filtered();
      const shown = filtered.slice(0, s.shown);
      e.count.textContent = format("DT.TokenArt.Count", { shown: shown.length, total: filtered.length });
      const items = shown.map(v => {
        const img = el("img", { src: v.url, alt: v.stem || v.file, loading: "lazy", decoding: "async", draggable: "false" });
        img.addEventListener("error", () => this.#markBroken(v.url));
        const isCurrent = sameImage(v.url, s.current);
        return el("button", {
          type: "button", class: `dt-ta-item${s.selected.has(v.url) ? " selected" : ""}${isCurrent ? " current" : ""}`,
          dataset: { action: "pick", url: v.url }, "aria-pressed": String(s.selected.has(v.url)),
          "data-tooltip": v.stem ? `${v.stem} · ${v.file}` : v.file
        }, [img, isCurrent ? el("span", { class: "dt-ta-badge", text: localize("DT.TokenArt.Current") }) : null]);
      });
      if (!filtered.length) items.push(el("p", { class: "dt-ta-empty", text: localize("DT.TokenArt.NoMatches") }));
      if (filtered.length > shown.length) {
        items.push(el("button", { type: "button", class: "dt-ta-more", dataset: { action: "more" },
          text: format("DT.TokenArt.ShowMore", { count: filtered.length - shown.length }) }));
      }
      e.gallery.replaceChildren(...items);
      this.#refreshPreview();
    }

    #markBroken(url) {
      if (this.#broken.has(url)) return;
      this.#broken.add(url);
      this.state.selected.delete(url);
      this.#els.gallery?.querySelector(`.dt-ta-item[data-url="${CSS.escape(url)}"]`)?.remove();
      this.#refreshFooter();
    }

    #refreshSelectionMarks() {
      const selected = this.state.selected;
      for (const item of this.#els.gallery?.querySelectorAll(".dt-ta-item") ?? []) {
        const on = selected.has(item.dataset.url);
        item.classList.toggle("selected", on);
        item.setAttribute("aria-pressed", String(on));
      }
    }

    #refreshPreview() {
      const s = this.state;
      const e = this.#els;
      const url = s.hover ?? s.anchor ?? (s.selected.size ? [...s.selected].at(-1) : null) ?? s.current;
      const variant = s.variants.find(v => v.url === url) ?? null;
      const known = !variant ? parseImageUrl(url) : null;
      if (url && !String(url).startsWith("tmtopp")) {
        if (e.preview.getAttribute("src") !== url) e.preview.src = url;
        e.preview.hidden = false;
      } else {
        e.preview.removeAttribute("src");
        e.preview.hidden = true;
      }
      const lines = variant
        ? [variant.creature, variant.stem, variant.file]
        : known ? [known.creature, known.file] : [];
      e.caption.replaceChildren(...lines.filter(Boolean).map((line, i) => el(i ? "span" : "strong", { text: line })));
    }

    #refreshFooter() {
      const s = this.state;
      const e = this.#els;
      if (!e.options) return;
      const count = s.selected.size;
      e.selection.replaceChildren(
        el("strong", { text: format("DT.TokenArt.Selected", { count }) }),
        el("button", { type: "button", dataset: { action: "selectMatching" }, disabled: !s.variants.length,
          text: format("DT.TokenArt.SelectMatching", { count: this.#filtered().length }) }),
        el("button", {
          type: "button", class: s.onlySelected ? "active" : "", dataset: { action: "onlySelected" },
          disabled: !count && !s.onlySelected, "aria-pressed": String(s.onlySelected),
          text: localize("DT.TokenArt.OnlySelected")
        }),
        el("button", { type: "button", dataset: { action: "clearSelection" }, disabled: !count,
          text: localize("DT.TokenArt.ClearSelection") })
      );

      const o = e.options;
      const names = this.actors.map(a => a.name).join(", ");
      o.tokens.text.textContent = format("DT.TokenArt.ApplyTokens", { count: this.tokens.length });
      o.prototype.text.textContent = format("DT.TokenArt.ApplyPrototype", { names });
      o.wildcard.text.textContent = localize("DT.TokenArt.ApplyWildcard");
      o.portrait.text.textContent = localize("DT.TokenArt.ApplyPortrait");
      o.tokens.label.hidden = !this.tokens.length;
      o.prototype.label.hidden = o.wildcard.label.hidden = o.portrait.label.hidden = !this.actors.length;

      const wildcardPossible = this.opts.prototype && count > 1;
      o.wildcard.input.disabled = !wildcardPossible;
      o.wildcard.label.classList.toggle("disabled", !wildcardPossible);
      if (wildcardPossible) delete o.wildcard.label.dataset.tooltip;
      else o.wildcard.label.dataset.tooltip = localize("DT.TokenArt.WildcardNeeds");
      for (const [key, option] of Object.entries(o)) option.input.checked = this.opts[key] && !option.input.disabled;

      e.apply.disabled = !count || !(this.opts.tokens || this.opts.prototype || this.opts.portrait);
    }

    /* ----- interaction ----- */

    async #onSystemChange(system) {
      const s = this.state;
      s.system = system;
      await this.#loadNames();
      const keep = s.names.find(n => n.toLowerCase() === s.creature.toLowerCase());
      const best = rankCreatures(s.names, s.hints, 1)[0];
      s.creature = "";
      s.variants = [];
      const next = keep ?? (best?.score >= AUTO_MATCH_SCORE ? best.name : null);
      if (next) await this.#loadCreature(next);
      else this.#refresh();
    }

    static #onPick(event, target) {
      const s = this.state;
      const url = target.dataset.url;
      if (event.shiftKey && s.anchor) {
        const list = this.#filtered().map(v => v.url);
        const [a, b] = [list.indexOf(s.anchor), list.indexOf(url)].sort((x, y) => x - y);
        if (a >= 0) list.slice(a, b + 1).forEach(u => s.selected.add(u));
        else s.selected.add(url);
      } else if (event.ctrlKey || event.metaKey || s.onlySelected) {
        if (s.selected.has(url)) s.selected.delete(url);
        else s.selected.add(url);
        s.anchor = url;
      } else {
        s.selected.clear();
        s.selected.add(url);
        s.anchor = url;
      }
      if (s.onlySelected) this.#refreshGallery();   // a removed image leaves the view
      else this.#refreshSelectionMarks();
      this.#refreshPreview();
      this.#refreshFooter();
    }

    static #onTag(event, target) {
      const s = this.state;
      const tag = target.dataset.tag;
      if (s.tags.has(tag)) s.tags.delete(tag);
      else s.tags.add(tag);
      s.shown = PAGE_SIZE;
      this.#refreshTags();
      this.#refreshGallery();
      this.#refreshFooter();
    }

    static #onCreature(event, target) {
      this.#loadCreature(target.dataset.creature);
    }

    static #onClearFilters() {
      const s = this.state;
      s.tags.clear();
      s.search = "";
      s.shown = PAGE_SIZE;
      this.#els.search.value = "";
      this.#refreshTags();
      this.#refreshGallery();
      this.#refreshFooter();
    }

    static #onMore() {
      this.state.shown += PAGE_SIZE;
      this.#refreshGallery();
    }

    static #onSelectMatching() {
      for (const v of this.#filtered()) this.state.selected.add(v.url);
      this.#refreshSelectionMarks();
      this.#refreshFooter();
    }

    static #onClearSelection() {
      const s = this.state;
      s.selected.clear();
      s.anchor = null;
      s.onlySelected = false;
      this.#refreshTags();
      this.#refreshGallery();
      this.#refreshFooter();
    }

    static #onOnlySelected() {
      const s = this.state;
      s.onlySelected = !s.onlySelected;
      s.shown = PAGE_SIZE;
      this.#refreshTags();
      this.#refreshGallery();
      this.#refreshFooter();
    }

    static async #onApply() {
      const urls = [...this.state.selected];
      const { tokens, prototype, portrait } = this.opts;
      if (!urls.length) return ui.notifications.warn(localize("DT.TokenArt.NothingSelected"));
      if (!tokens && !prototype && !portrait) return ui.notifications.warn(localize("DT.TokenArt.NothingToApply"));
      const wildcard = prototype && this.opts.wildcard && urls.length > 1;
      const plan = planUpdates({
        tokens: tokens ? this.tokens : [],
        actors: prototype || portrait ? this.actors : [],
        urls, prototype, wildcard, portrait
      });
      this.#els.apply.disabled = true;
      try {
        for (const [scene, updates] of plan.tokenUpdates) await scene.updateEmbeddedDocuments("Token", updates);
        for (const { actor, update, clearPool } of plan.actorUpdates) {
          await actor.update(update);
          if (clearPool) await actor.unsetFlag(MODULE_ID, FLAG_POOL);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Token Art Picker: applying failed`, err);
        ui.notifications.error(format("DT.TokenArt.ApplyError", { error: err.message }));
        this.#refreshFooter();
        return;
      }
      ui.notifications.info(format("DT.TokenArt.Applied", {
        tokens: [...plan.tokenUpdates.values()].reduce((n, list) => n + list.length, 0),
        actors: plan.actorUpdates.length
      }));
      await this.close();
    }
  };
  return PickerClass;
}

/* ---------- entry points ---------- */

/**
 * Open the picker for `tokens` (Token placeables or TokenDocuments; default: the controlled
 * tokens) or for `actor`'s prototype token. Only documents the user owns are offered.
 */
export function openTokenArtPicker({ tokens, actor } = {}) {
  if (!enabled()) {
    ui.notifications.warn(localize("DT.TokenArt.Disabled"));
    return null;
  }
  if (!tmtInstalled()) {
    ui.notifications.warn(localize("DT.TokenArt.NoTmt"));
    return null;
  }
  const docs = (tokens ?? (actor ? [] : canvas?.tokens?.controlled ?? []))
    .map(t => t?.document ?? t)
    .filter(doc => doc?.isOwner);
  const actors = [...new Set([actor, ...docs.map(baseActorOf)])].filter(a => a?.isOwner);
  if (!docs.length && !actors.length) {
    ui.notifications.info(localize("DT.TokenArt.NoTarget"));
    return null;
  }
  current?.close();
  current = new (pickerClass())({ tokens: docs, actors });
  current.render({ force: true });
  return current;
}

function onRenderTokenHUD(hud, html) {
  if (!enabled() || !game.settings.get(MODULE_ID, KEY_HUD)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = hud?.object;
  if (!root || !token?.document?.isOwner || root.querySelector(".dt-token-art-hud")) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".right");
  if (!column) return;

  const label = localize("DT.TokenArt.HudButton");
  const button = el("button", {
    type: "button", class: "control-icon dt-token-art-hud", "data-tooltip": label, "aria-label": label
  }, [icon("fa-solid fa-images")]);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const controlled = canvas?.tokens?.controlled ?? [];
    openTokenArtPicker({ tokens: controlled.includes(token) ? controlled : [token] });
  });
  column.append(button);
}

/** The world actor of an Actors-sidebar entry. */
function actorOfEntry(target) {
  const id = target?.closest?.("[data-entry-id]")?.dataset.entryId ?? target?.dataset?.documentId;
  return id ? game.actors?.get(id) ?? null : null;
}

function onGetActorContextOptions(app, menuItems) {
  menuItems.push({
    label: "DT.TokenArt.ContextEntry",
    icon: '<i class="fa-solid fa-images"></i>',
    visible: target => enabled() && !!actorOfEntry(target)?.isOwner,
    onClick: (event, target) => {
      const actor = actorOfEntry(target);
      if (actor) openTokenArtPicker({ actor });
    }
  });
}

export default {
  id: "tokenArtPicker",
  category: {
    label: "DT.Categories.TokenArt.Label",
    hint: "DT.Categories.TokenArt.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.TokenArtEnabled.Name",
        hint: "DT.Settings.TokenArtEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_HUD,
      options: {
        name: "DT.Settings.TokenArtHudButton.Name",
        hint: "DT.Settings.TokenArtHudButton.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  keybindings: [
    {
      action: "tokenArtPicker",
      options: {
        name: "DT.Keybindings.TokenArtPicker.Name",
        hint: "DT.Keybindings.TokenArtPicker.Hint",
        editable: [],
        onDown: () => {
          openTokenArtPicker();
          return true;
        }
      }
    }
  ],
  init() {
    Hooks.on("preCreateToken", onPreCreateToken);
    Hooks.on("renderTokenHUD", onRenderTokenHUD);
    Hooks.on("getActorContextOptions", onGetActorContextOptions);
    const module = game.modules?.get(MODULE_ID);
    if (module) module.api = Object.assign(module.api ?? {}, { openTokenArtPicker });
  }
};

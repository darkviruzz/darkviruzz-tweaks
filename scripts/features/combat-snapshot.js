/**
 * Feature: Combat Snapshots (system-agnostic)
 * -------------------------------------------
 * Foundry VTT v14+ · any system (a few friendly field labels for dnd5e paths)
 *
 * A fight is paused between sessions and the same world is used for something else in the
 * meantime (a one-shot). The Combat document itself survives (bind it to its scene so it isn't
 * shown — or ended — elsewhere), but its surroundings don't: every round of another fight (and a
 * GM setting the clock) moves the world time, so time-based effects of the paused combatants run
 * out; someone may touch a combatant's actor, a token, an item…
 *
 * Saving only READS: nothing in the world is changed, Foundry keeps running as usual.
 *
 * *Save* stores, in a hidden world setting:
 *   - the Combat (`toObject()` incl. combatants, round, turn, initiative),
 *   - the token of every combatant (position, hidden…, and for unlinked tokens the delta),
 *   - the actor of every combatant (linked: the world actor; unlinked: the token's synthetic
 *     actor, i.e. base + delta) with all items and effects — and all player-owned actors,
 *   - the world time.
 * *Compare* lists every difference between now and the snapshot, one checkbox per difference
 * (field, missing / new item or effect, missing combatant/token/combat, world time). *Restore*
 * writes the selected ones back, in this order:
 *   1. world time → `game.time.advance(-delta)`: back to the time of the snapshot,
 *   2. every OTHER actor's running effects (world actors and unlinked tokens on all scenes that
 *      are not in the snapshot) get `start.time - delta`, so their remaining duration is what it
 *      was before the rewind ("keep others"). Done AFTER the rewind: in between their remaining
 *      duration is longer, never shorter, so nothing can expire on the way,
 *   3. the snapshot's documents — after the rewind, so the clock can't touch what we write:
 *      - fields → `doc.update()` (combat with `turnEvents: false`, token positions via
 *        `TokenDocument#move` with action "displace" = teleport, no walls),
 *      - missing documents → re-created with `keepId: true`, so every UUID that pointed at them
 *        (concentration `dependentOn`, effect origins, combatant → token) is valid again,
 *      - documents new since the snapshot → deleted.
 * Snapshots can be exported / imported as JSON files.
 *
 * Verified: see CLAUDE.md "Combat snapshots". `keepId` for embedded documents of an unlinked
 * token's synthetic actor, `game.time.advance` with a negative value and the `-=key` deletion
 * syntax are not verified against the v14 source (marked there).
 *
 * Entry points: two entries in the Combat Tracker's encounter menu (⋮, hook
 * `getCombatContextOptions`) — "save snapshot" and "snapshots…" — and the module API.
 * World setting (GM), default off; GM only.
 */

import { MODULE_ID } from "../constants.js";
import {
  diffFields, diffCollection, updateData, formatValue, formatDuration
} from "../lib/snapshot-diff.js";

const KEY_ENABLED = "combatSnapshotEnabled";
const KEY_DATA = "combatSnapshotData";
const FORMAT = 1;

const ACTOR_KEYS = ["name", "img", "system", "flags"];
const ITEM_KEYS = ["name", "system", "flags"];

const FIELD_LABELS = [
  [/^system\.attributes\.hp\.value$/, "DT.CombatSnapshot.Field.HP"],
  [/^system\.attributes\.hp\.temp$/, "DT.CombatSnapshot.Field.TempHP"],
  [/^system\.attributes\.hp\.tempmax$/, "DT.CombatSnapshot.Field.TempMax"],
  [/^system\.spells\.spell(\d)\.value$/, "DT.CombatSnapshot.Field.SpellSlots"],
  [/^system\.spells\.pact\.value$/, "DT.CombatSnapshot.Field.PactSlots"],
  [/^system\.attributes\.death\.success$/, "DT.CombatSnapshot.Field.DeathSuccess"],
  [/^system\.attributes\.death\.failure$/, "DT.CombatSnapshot.Field.DeathFailure"],
  [/^system\.attributes\.exhaustion$/, "DT.CombatSnapshot.Field.Exhaustion"],
  [/^system\.uses\.spent$/, "DT.CombatSnapshot.Field.UsesSpent"],
  [/^system\.activities\.[^.]+\.uses\.spent$/, "DT.CombatSnapshot.Field.ActivityUses"],
  [/^system\.quantity$/, "DT.CombatSnapshot.Field.Quantity"],
  [/^disabled$/, "DT.CombatSnapshot.Field.Disabled"],
  [/^duration\.expired$/, "DT.CombatSnapshot.Field.Expired"],
  [/^start\.time$/, "DT.CombatSnapshot.Field.StartTime"],
  [/^initiative$/, "DT.CombatSnapshot.Field.Initiative"],
  [/^round$/, "DT.CombatSnapshot.Field.Round"],
  [/^turn$/, "DT.CombatSnapshot.Field.Turn"]
];

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const isEnabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const mayUse = () => isEnabled() && !!game.user?.isGM;

/* -------------------------------------------- */
/*  Storage                                     */
/* -------------------------------------------- */

function loadSnapshots() {
  const data = game.settings.get(MODULE_ID, KEY_DATA);
  return Array.isArray(data?.snapshots) ? data.snapshots : [];
}

async function storeSnapshots(snapshots) {
  await game.settings.set(MODULE_ID, KEY_DATA, { snapshots });
}

/* -------------------------------------------- */
/*  Document references                         */
/* -------------------------------------------- */

/** Linked token / no token → the world actor; unlinked token → that token's synthetic actor. */
function actorRefFor(combatant) {
  const token = combatant.token;
  if (token && !token.actorLink) return { kind: "token", sceneId: token.parent?.id, tokenId: token.id };
  const actor = combatant.actor;
  return actor ? { kind: "actor", id: actor.id } : null;
}

const actorKey = ref => (ref.kind === "actor" ? `Actor.${ref.id}` : `Token.${ref.sceneId}.${ref.tokenId}`);
const refKey = ref => JSON.stringify(ref ?? null);

function resolveActor(ref) {
  if (!ref) return null;
  if (ref.kind === "actor") return game.actors?.get(ref.id) ?? null;
  return game.scenes?.get(ref.sceneId)?.tokens?.get(ref.tokenId)?.actor ?? null;
}

function resolveRef(ref) {
  switch (ref?.type) {
    case "combat": return game.combats?.get(ref.id) ?? null;
    case "combatant": return game.combats?.get(ref.combatId)?.combatants?.get(ref.id) ?? null;
    case "scene": return game.scenes?.get(ref.id) ?? null;
    case "token": return game.scenes?.get(ref.sceneId)?.tokens?.get(ref.id) ?? null;
    case "actor": return resolveActor(ref.actor);
    case "item": return resolveActor(ref.actor)?.items?.get(ref.id) ?? null;
    case "effect": return resolveRef(ref.parent)?.effects?.get(ref.id) ?? null;
    default: return null;
  }
}

/* -------------------------------------------- */
/*  Save                                        */
/* -------------------------------------------- */

function combatLabel(combat) {
  const scene = combat.scene?.name ?? localize("DT.CombatSnapshot.NoScene");
  return `${scene} — ${format("DT.CombatSnapshot.Round", { round: combat.round ?? 0 })}`;
}

function buildSnapshot(combat, { name, includePCs = true } = {}) {
  const tokens = new Map();
  const actors = new Map();
  for (const combatant of combat.combatants ?? []) {
    const token = combatant.token;
    if (token) tokens.set(`${token.parent?.id}.${token.id}`, { sceneId: token.parent?.id, data: token.toObject() });
    const ref = actorRefFor(combatant);
    const actor = combatant.actor;
    if (ref && actor && !actors.has(actorKey(ref))) {
      actors.set(actorKey(ref), { ref, name: token?.name ?? actor.name, extra: false, data: actor.toObject() });
    }
  }
  if (includePCs) {
    for (const actor of game.actors ?? []) {
      const ref = { kind: "actor", id: actor.id };
      if (actor.hasPlayerOwner && !actors.has(actorKey(ref))) {
        actors.set(actorKey(ref), { ref, name: actor.name, extra: true, data: actor.toObject() });
      }
    }
  }
  return {
    id: foundry.utils.randomID(),
    format: FORMAT,
    name: name || combatLabel(combat),
    created: Date.now(),
    worldTime: Number(game.time?.worldTime) || 0,
    system: { id: game.system?.id, version: game.system?.version },
    core: game.version ?? null,
    module: game.modules?.get(MODULE_ID)?.version ?? null,
    round: combat.round ?? 0,
    turn: combat.turn ?? null,
    sceneName: combat.scene?.name ?? null,
    combat: combat.toObject(),
    tokens: [...tokens.values()],
    actors: [...actors.values()]
  };
}

async function saveSnapshot(combat = game.combat, options = {}) {
  if (!mayUse()) return null;
  if (!combat) {
    ui.notifications.warn(localize("DT.CombatSnapshot.NoCombat"));
    return null;
  }
  const snapshot = buildSnapshot(combat, options);
  await storeSnapshots([...loadSnapshots(), snapshot]);
  ui.notifications.info(format("DT.CombatSnapshot.Saved", { name: snapshot.name, actors: snapshot.actors.length }));
  return snapshot;
}

/* -------------------------------------------- */
/*  Compare                                     */
/* -------------------------------------------- */

function fieldLabel(path) {
  for (const [pattern, key] of FIELD_LABELS) {
    const match = pattern.exec(path);
    if (match) return format(key, { level: match[1] ?? "" });
  }
  return path;
}

function opKey(op) {
  const target = op.ref ?? op.parent ?? null;
  const which = op.path ?? op.id ?? op.data?._id ?? op.documentName ?? "";
  return `${op.type}|${op.embedded ?? ""}|${refKey(target)}|${which}`;
}

function makeRow(label, from, to, op, { detail = "", extra = false } = {}) {
  return { key: opKey(op), label, detail, from, to, op, extra };
}

function fieldRows(diffs, ref, prefix, extra) {
  return diffs.map(({ path, from, to }) => makeRow(
    prefix ? `${prefix} › ${fieldLabel(path)}` : fieldLabel(path),
    formatValue(from), formatValue(to),
    { type: "update", ref, path, value: to },
    { detail: path, extra }
  ));
}

function embeddedRows(current, saved, parent, embedded, labelKey, extra, commonRows) {
  const rows = [];
  const { missing, added, common } = diffCollection(current, saved);
  for (const data of missing) {
    rows.push(makeRow(format(labelKey, { name: data.name ?? data._id }),
      localize("DT.CombatSnapshot.State.Missing"), localize("DT.CombatSnapshot.State.Recreate"),
      { type: "create", parent, embedded, data }, { extra }));
  }
  for (const data of added) {
    rows.push(makeRow(format(labelKey, { name: data.name ?? data._id }),
      localize("DT.CombatSnapshot.State.New"), localize("DT.CombatSnapshot.State.Remove"),
      { type: "delete", parent, embedded, id: data._id }, { extra }));
  }
  for (const [now, then] of common) rows.push(...commonRows(now, then));
  return rows;
}

function effectRows(current, saved, parent, prefix, extra) {
  return embeddedRows(current, saved, parent, "ActiveEffect",
    prefix ? "DT.CombatSnapshot.Row.ItemEffect" : "DT.CombatSnapshot.Row.Effect", extra,
    (now, then) => fieldRows(diffFields(now, then, { exclude: ["sort"], skipPrivate: true }),
      { type: "effect", parent, id: then._id }, prefix ? `${prefix} › ${then.name}` : then.name, extra))
    .map(row => (prefix && !row.op.path ? { ...row, label: `${prefix} › ${row.label}` } : row));
}

/* -------------------------------------------- */
/*  Other actors' running effects               */
/* -------------------------------------------- */

const snapshotKeys = snapshot => new Set((snapshot.actors ?? []).map(entry => actorKey(entry.ref)));

/** World actors and unlinked tokens (all scenes) that are NOT part of the snapshot. */
function otherActors(exclude) {
  const out = [];
  for (const actor of game.actors ?? []) {
    if (!exclude.has(actorKey({ kind: "actor", id: actor.id }))) out.push(actor);
  }
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || exclude.has(actorKey({ kind: "token", sceneId: scene.id, tokenId: token.id }))) continue;
      if (token.actor) out.push(token.actor);
    }
  }
  return out;
}

/** Running timed effects of an actor and its items: `[{parent, id, time}]`. */
function runningEffects(actor) {
  const parents = [actor, ...(actor.items ?? [])];
  const out = [];
  for (const parent of parents) {
    for (const effect of parent.effects ?? []) {
      const data = effect.toObject();
      if (typeof data.start?.time !== "number") continue;
      if (data.duration?.value === null || data.duration?.value === undefined || data.duration?.expired) continue;
      out.push({ parent, id: data._id, time: data.start.time });
    }
  }
  return out;
}

const othersEffects = snapshot => otherActors(snapshotKeys(snapshot)).flatMap(runningEffects);

/**
 * Every difference between the live world and a snapshot.
 * @param {object} snapshot
 * @returns {{groups: {title, icon, note?, rows}[], warnings: string[], delta: number}}
 *   delta = world time now − world time of the snapshot (seconds)
 */
function compareSnapshot(snapshot) {
  const groups = [];
  const warnings = [];
  const delta = (Number(game.time?.worldTime) || 0) - (Number(snapshot.worldTime) || 0);

  const sys = s => `${s?.id ?? "?"} ${s?.version ?? "?"}`;
  if (sys(snapshot.system) !== sys(game.system)) {
    warnings.push(format("DT.CombatSnapshot.Warn.System", { then: sys(snapshot.system), now: sys(game.system) }));
  }

  // World time: back to the snapshot, then the other actors keep their remaining durations
  if (delta !== 0) {
    const rows = [makeRow(localize("DT.CombatSnapshot.Row.WorldTime"),
      format("DT.CombatSnapshot.Row.TimeOffset", { time: formatDuration(delta) }),
      localize("DT.CombatSnapshot.Row.SnapshotTime"),
      { type: "time", seconds: -delta })];
    const others = othersEffects(snapshot).length;
    if (others) {
      rows.push(makeRow(localize("DT.CombatSnapshot.Row.KeepOthers"),
        format("DT.CombatSnapshot.Row.KeepOthersCount", { count: others }),
        format("DT.CombatSnapshot.Row.KeepOthersShift", { time: formatDuration(-delta) }),
        { type: "keepOthers", seconds: -delta }, { detail: localize("DT.CombatSnapshot.Row.KeepOthersHint") }));
    }
    groups.push({ title: localize("DT.CombatSnapshot.Group.Time"), icon: "fa-solid fa-clock", rows });
  }

  // Combat + combatants
  const saved = snapshot.combat ?? {};
  const combat = game.combats?.get(saved._id);
  const combatRows = [];
  const nameOf = c => c.name || snapshot.tokens?.find(t => t.data._id === c.tokenId)?.data.name
    || snapshot.actors?.find(a => a.data._id === c.actorId)?.name || c._id;
  if (!combat) {
    combatRows.push(makeRow(localize("DT.CombatSnapshot.Row.Combat"),
      localize("DT.CombatSnapshot.State.Missing"), localize("DT.CombatSnapshot.State.Recreate"),
      { type: "createTop", documentName: "Combat", data: saved }));
  } else {
    const now = combat.toObject();
    const ref = { type: "combat", id: combat.id };
    combatRows.push(...fieldRows(diffFields(now, saved, { exclude: ["combatants"], skipPrivate: true }), ref));
    combatRows.push(...embeddedRows(now.combatants, saved.combatants, ref, "Combatant",
      "DT.CombatSnapshot.Row.Combatant", false,
      (cNow, cThen) => fieldRows(diffFields(cNow, cThen, { skipPrivate: true }),
        { type: "combatant", combatId: combat.id, id: cThen._id }, nameOf(cThen))));
  }
  if (combatRows.length) groups.push({ title: localize("DT.CombatSnapshot.Group.Combat"), icon: "fa-solid fa-swords", rows: combatRows });

  // Tokens
  const tokenRows = [];
  for (const { sceneId, data } of snapshot.tokens ?? []) {
    const scene = game.scenes?.get(sceneId);
    if (!scene) {
      warnings.push(format("DT.CombatSnapshot.Warn.SceneMissing", { name: data.name }));
      continue;
    }
    const token = scene.tokens?.get(data._id);
    if (!token) {
      tokenRows.push(makeRow(format("DT.CombatSnapshot.Row.Token", { name: data.name }),
        localize("DT.CombatSnapshot.State.Missing"), localize("DT.CombatSnapshot.State.Recreate"),
        { type: "create", parent: { type: "scene", id: sceneId }, embedded: "Token", data }));
    } else {
      tokenRows.push(...fieldRows(diffFields(token.toObject(), data, { exclude: ["delta"], skipPrivate: true }),
        { type: "token", sceneId, id: data._id }, data.name));
    }
  }
  if (tokenRows.length) groups.push({ title: localize("DT.CombatSnapshot.Group.Tokens"), icon: "fa-solid fa-chess-pawn", rows: tokenRows });

  // Actors
  for (const entry of snapshot.actors ?? []) {
    const then = entry.data;
    const extra = !!entry.extra;
    const group = { title: entry.name, icon: extra ? "fa-solid fa-user" : "fa-solid fa-user-shield", extra, rows: [] };
    const actor = resolveActor(entry.ref);
    if (!actor) {
      if (entry.ref.kind === "actor") {
        group.rows.push(makeRow(localize("DT.CombatSnapshot.Row.Actor"),
          localize("DT.CombatSnapshot.State.Missing"), localize("DT.CombatSnapshot.State.Recreate"),
          { type: "createTop", documentName: "Actor", data: then }, { extra }));
      } else group.note = localize("DT.CombatSnapshot.Note.TokenMissing");
      groups.push(group);
      continue;
    }
    const now = actor.toObject();
    const aref = { type: "actor", actor: entry.ref };
    group.rows.push(...fieldRows(diffFields(now, then, { keys: ACTOR_KEYS }), aref, "", extra));
    group.rows.push(...embeddedRows(now.items, then.items, aref, "Item", "DT.CombatSnapshot.Row.Item", extra,
      (iNow, iThen) => {
        const iref = { type: "item", actor: entry.ref, id: iThen._id };
        return [
          ...fieldRows(diffFields(iNow, iThen, { keys: ITEM_KEYS }), iref, iThen.name, extra),
          ...effectRows(iNow.effects, iThen.effects, iref, iThen.name, extra)
        ];
      }));
    group.rows.push(...effectRows(now.effects, then.effects, aref, "", extra));
    if (group.rows.length) groups.push(group);
  }

  return { groups, warnings, delta };
}

/* -------------------------------------------- */
/*  Restore                                     */
/* -------------------------------------------- */

async function applyUpdate(ref, data) {
  const doc = resolveRef(ref);
  if (!doc) throw new Error(`${MODULE_ID} | combat snapshot: document not found ${refKey(ref)}`);
  if (ref.type === "token") {
    const position = {};
    for (const key of ["x", "y", "elevation"]) {
      if (key in data) {
        position[key] = data[key];
        delete data[key];
      }
    }
    if (Object.keys(data).length) await doc.update(data);
    if (Object.keys(position).length) {
      await doc.move({
        x: position.x ?? doc.x, y: position.y ?? doc.y, elevation: position.elevation ?? doc.elevation,
        action: "displace"
      });
    }
    return;
  }
  if (ref.type === "combat") return doc.update(data, { turnEvents: false });
  return doc.update(data);
}

/** Shift the start time of every running effect of the actors outside the snapshot. */
async function keepOthers(snapshot, seconds) {
  const batches = new Map();
  for (const { parent, id, time } of othersEffects(snapshot)) {
    const list = batches.get(parent) ?? [];
    list.push({ _id: id, "start.time": time + seconds });
    batches.set(parent, list);
  }
  for (const [parent, updates] of batches) await parent.updateEmbeddedDocuments("ActiveEffect", updates);
}

/** Order matters: parents before children, deletions before creations before updates. */
const STEPS = [
  ["update", "combat"], ["delete", "combat"], ["create", "combat"], ["update", "combatant"],
  ["create", "scene"], ["update", "token"],
  ["update", "actor"], ["delete", "actor"], ["create", "actor"], ["update", "item"],
  ["delete", "item"], ["create", "item"], ["update", "effect"]
];

/**
 * Write the given rows back. Every step is isolated: a failing one is reported, the rest runs.
 * @returns {Promise<{errors: Error[]}>}
 */
async function applyRows(rows, snapshot) {
  const errors = [];
  const run = async fn => {
    try {
      await fn();
    } catch (err) {
      errors.push(err);
      console.error(`${MODULE_ID} | combat snapshot restore step failed`, err);
    }
  };
  const ops = rows.map(row => row.op);
  const updates = new Map();
  const embedded = { create: new Map(), delete: new Map() };
  for (const op of ops) {
    if (op.type === "update") {
      const entry = updates.get(refKey(op.ref)) ?? { ref: op.ref, changes: [] };
      entry.changes.push({ path: op.path, value: op.value });
      updates.set(refKey(op.ref), entry);
    } else if (op.type === "create" || op.type === "delete") {
      const key = `${refKey(op.parent)}|${op.embedded}`;
      const entry = embedded[op.type].get(key) ?? { parent: op.parent, embedded: op.embedded, items: [] };
      entry.items.push(op.type === "create" ? op.data : op.id);
      embedded[op.type].set(key, entry);
    }
  }

  const time = ops.find(o => o.type === "time");
  if (time) await run(() => game.time.advance(time.seconds));
  // Only together with the rewind, and only after it (see the header comment).
  const keep = ops.find(o => o.type === "keepOthers");
  if (keep && time && snapshot) await run(() => keepOthers(snapshot, keep.seconds));
  for (const op of ops.filter(o => o.type === "createTop")) {
    await run(() => CONFIG[op.documentName].documentClass.create(clone(op.data), { keepId: true }));
  }
  for (const [kind, type] of STEPS) {
    if (kind === "update") {
      for (const { ref, changes } of updates.values()) {
        if (ref.type === type) await run(() => applyUpdate(ref, updateData(changes)));
      }
      continue;
    }
    for (const entry of embedded[kind].values()) {
      if (entry.parent.type !== type) continue;
      await run(async () => {
        const parent = resolveRef(entry.parent);
        if (!parent) throw new Error(`${MODULE_ID} | combat snapshot: parent not found ${refKey(entry.parent)}`);
        if (kind === "create") await parent.createEmbeddedDocuments(entry.embedded, clone(entry.items), { keepId: true });
        else await parent.deleteEmbeddedDocuments(entry.embedded, entry.items);
      });
    }
  }
  return { errors };
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

let AppClass = null;
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

function button(icon, label, onClick, attrs = {}) {
  const node = make("button", { type: "button", ...attrs }, [make("i", { class: icon, inert: true }), label]);
  node.addEventListener("click", event => {
    event.preventDefault();
    onClick(event);
  });
  return node;
}

/** DialogV2 takes HTML; build it with textContent so names can't inject markup. */
function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p.outerHTML;
}

async function confirm(titleKey, text) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.confirm({ window: { title: titleKey }, content: paragraph(text) });
}

function appClass() {
  if (AppClass) return AppClass;
  const { ApplicationV2 } = foundry.applications.api;

  AppClass = class CombatSnapshots extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "dt-combat-snapshots",
      classes: ["dt-csnap"],
      window: { icon: "fa-solid fa-camera", resizable: true },
      position: { width: 620, height: 680 }
    };

    view = "list";
    snapshotId = null;
    /** row key → checked, overriding the default (every row ticked) */
    choices = new Map();
    rows = [];
    busy = false;

    get title() {
      return localize("DT.CombatSnapshot.Title");
    }

    async _renderHTML() {
      return this.view === "compare" ? this.#renderCompare() : this.#renderList();
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
    }

    _onClose(options) {
      super._onClose?.(options);
      if (current === this) current = null;
    }

    #renderList() {
      const combats = game.combats?.contents ?? [];
      const select = make("select", { name: "combat" }, combats.map(c => make("option", {
        value: c.id, selected: c === game.combat
      }, [combatLabel(c)])));
      const name = make("input", { type: "text", name: "name", placeholder: localize("DT.CombatSnapshot.NamePlaceholder") });
      const pcs = make("input", { type: "checkbox", name: "pcs", id: "dt-csnap-pcs", checked: true });
      const save = button("fa-solid fa-camera", localize("DT.CombatSnapshot.Save"), async () => {
        await saveSnapshot(game.combats.get(select.value), { name: name.value.trim(), includePCs: pcs.checked });
        this.render();
      }, { disabled: !combats.length });

      const file = make("input", { type: "file", accept: ".json,application/json", hidden: true });
      file.addEventListener("change", async () => {
        const [chosen] = file.files ?? [];
        if (chosen) await importSnapshot(await chosen.text());
        this.render();
      });

      const list = loadSnapshots().slice().sort((a, b) => b.created - a.created).map(snapshot => make("li", { class: "dt-csnap__item" }, [
        make("div", { class: "dt-csnap__item-text" }, [
          make("strong", {}, [snapshot.name]),
          make("span", { class: "hint" }, [format("DT.CombatSnapshot.Meta", {
            date: new Date(snapshot.created).toLocaleString(game.i18n.lang),
            round: snapshot.round ?? 0,
            actors: snapshot.actors?.length ?? 0
          })])
        ]),
        make("div", { class: "dt-csnap__item-buttons" }, [
          button("fa-solid fa-code-compare", localize("DT.CombatSnapshot.Compare"), () => {
            this.view = "compare";
            this.snapshotId = snapshot.id;
            this.choices.clear();
            this.render();
          }),
          button("fa-solid fa-file-export", "", () => exportSnapshot(snapshot), { "data-tooltip": localize("DT.CombatSnapshot.Export"), "aria-label": localize("DT.CombatSnapshot.Export") }),
          button("fa-solid fa-trash", "", async () => {
            if (!await confirm("DT.CombatSnapshot.DeleteTitle", format("DT.CombatSnapshot.DeleteConfirm", { name: snapshot.name }))) return;
            await storeSnapshots(loadSnapshots().filter(s => s.id !== snapshot.id));
            this.render();
          }, { "data-tooltip": localize("DT.CombatSnapshot.Delete"), "aria-label": localize("DT.CombatSnapshot.Delete") })
        ])
      ]));

      return make("div", { class: "dt-csnap__body" }, [
        make("section", { class: "dt-csnap__save" }, [
          make("h3", {}, [localize("DT.CombatSnapshot.SaveHeading")]),
          make("div", { class: "form-group" }, [make("label", {}, [localize("DT.CombatSnapshot.CombatLabel")]), make("div", { class: "form-fields" }, [select])]),
          make("div", { class: "form-group" }, [make("label", {}, [localize("DT.CombatSnapshot.NameLabel")]), make("div", { class: "form-fields" }, [name])]),
          make("div", { class: "form-group" }, [
            make("label", { for: "dt-csnap-pcs" }, [localize("DT.CombatSnapshot.IncludePCs")]),
            make("div", { class: "form-fields" }, [pcs]),
            make("p", { class: "hint" }, [localize("DT.CombatSnapshot.IncludePCsHint")])
          ]),
          make("div", { class: "dt-csnap__buttons" }, [
            save,
            button("fa-solid fa-file-import", localize("DT.CombatSnapshot.Import"), () => file.click()),
            file
          ])
        ]),
        make("section", { class: "dt-csnap__list" }, [
          make("h3", {}, [localize("DT.CombatSnapshot.ListHeading")]),
          list.length ? make("ul", { class: "dt-csnap__items" }, list) : make("p", { class: "hint" }, [localize("DT.CombatSnapshot.Empty")])
        ])
      ]);
    }

    #checked(row) {
      return this.choices.get(row.key) ?? true;
    }

    #renderCompare() {
      const snapshot = loadSnapshots().find(s => s.id === this.snapshotId);
      if (!snapshot) {
        this.view = "list";
        return this.#renderList();
      }
      const { groups, warnings, delta } = compareSnapshot(snapshot);
      this.rows = groups.flatMap(g => g.rows);

      const modes = make("p", { class: "dt-csnap__time hint" }, [
        format("DT.CombatSnapshot.TimeLegend", { time: formatDuration(delta) }), " ",
        localize("DT.CombatSnapshot.OrderHint")
      ]);

      const count = make("span", { class: "dt-csnap__count" });
      const updateCount = () => {
        count.textContent = format("DT.CombatSnapshot.Selected", { count: this.rows.filter(r => this.#checked(r)).length, total: this.rows.length });
      };

      const sections = groups.map(group => {
        const boxes = [];
        const groupBox = make("input", { type: "checkbox" });
        const syncGroup = () => {
          const states = group.rows.map(r => this.#checked(r));
          groupBox.checked = states.length > 0 && states.every(Boolean);
          groupBox.indeterminate = states.some(Boolean) && !states.every(Boolean);
        };
        groupBox.addEventListener("change", () => {
          for (const row of group.rows) this.choices.set(row.key, groupBox.checked);
          for (const box of boxes) box.checked = groupBox.checked;
          syncGroup();
          updateCount();
        });
        const rows = group.rows.map(row => {
          const box = make("input", { type: "checkbox", checked: this.#checked(row) });
          boxes.push(box);
          box.addEventListener("change", () => {
            this.choices.set(row.key, box.checked);
            syncGroup();
            updateCount();
          });
          return make("label", { class: "dt-csnap__row", title: row.detail || null }, [
            box,
            make("span", { class: "dt-csnap__label" }, [row.label]),
            make("span", { class: "dt-csnap__from" }, [row.from]),
            make("i", { class: "fa-solid fa-arrow-right", inert: true }),
            make("span", { class: "dt-csnap__to" }, [row.to])
          ]);
        });
        syncGroup();
        return make("section", { class: "dt-csnap__group" }, [
          make("header", {}, [
            group.rows.length ? groupBox : "",
            make("i", { class: group.icon, inert: true }),
            make("strong", {}, [group.title]),
            make("span", { class: "hint" }, [String(group.rows.length)])
          ]),
          group.note ? make("p", { class: "hint" }, [group.note]) : "",
          ...rows
        ]);
      });
      updateCount();

      const restore = button("fa-solid fa-clock-rotate-left", localize("DT.CombatSnapshot.Restore"), () => this.#restore(snapshot),
        { class: "dt-csnap__restore", disabled: this.busy || !this.rows.length });
      const setAll = value => () => {
        for (const row of this.rows) this.choices.set(row.key, value);
        this.render();
      };

      return make("div", { class: "dt-csnap__body" }, [
        make("header", { class: "dt-csnap__head" }, [
          button("fa-solid fa-arrow-left", localize("DT.CombatSnapshot.Back"), () => {
            this.view = "list";
            this.render();
          }),
          make("div", {}, [
            make("strong", {}, [snapshot.name]),
            make("span", { class: "hint" }, [format("DT.CombatSnapshot.Meta", {
              date: new Date(snapshot.created).toLocaleString(game.i18n.lang),
              round: snapshot.round ?? 0, actors: snapshot.actors?.length ?? 0
            })])
          ])
        ]),
        modes,
        ...warnings.map(text => make("p", { class: "dt-csnap__warning" }, [make("i", { class: "fa-solid fa-triangle-exclamation", inert: true }), text])),
        this.rows.length || groups.some(g => g.note)
          ? make("div", { class: "dt-csnap__groups" }, sections)
          : make("p", { class: "dt-csnap__same" }, [make("i", { class: "fa-solid fa-check", inert: true }), localize("DT.CombatSnapshot.NoDifferences")]),
        make("footer", { class: "dt-csnap__footer" }, [
          button("fa-regular fa-square-check", localize("DT.CombatSnapshot.All"), setAll(true)),
          button("fa-regular fa-square", localize("DT.CombatSnapshot.None"), setAll(false)),
          count,
          restore
        ])
      ]);
    }

    async #restore(snapshot) {
      const rows = this.rows.filter(row => this.#checked(row));
      if (!rows.length) return ui.notifications.warn(localize("DT.CombatSnapshot.NothingSelected"));
      if (!await confirm("DT.CombatSnapshot.RestoreTitle", format("DT.CombatSnapshot.RestoreConfirm", { count: rows.length, name: snapshot.name }))) return;
      this.busy = true;
      try {
        const { errors } = await applyRows(rows, snapshot);
        if (errors.length) ui.notifications.error(format("DT.CombatSnapshot.RestoreErrors", { count: errors.length }));
        else ui.notifications.info(format("DT.CombatSnapshot.Restored", { count: rows.length }));
      } finally {
        this.busy = false;
        this.choices.clear();
        this.render();
      }
    }
  };
  return AppClass;
}

function openCombatSnapshots() {
  if (!mayUse()) return null;
  if (current?.rendered) {
    current.bringToFront?.();
    return current;
  }
  current = new (appClass())();
  current.render({ force: true });
  return current;
}

/* -------------------------------------------- */
/*  Export / import                             */
/* -------------------------------------------- */

function exportSnapshot(snapshot) {
  const safe = String(snapshot.name).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "combat";
  foundry.utils.saveDataToFile(JSON.stringify(snapshot, null, 2), "application/json", `combat-snapshot-${safe}.json`);
}

async function importSnapshot(text) {
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    snapshot = null;
  }
  if (!snapshot || snapshot.format !== FORMAT || !snapshot.combat || !Array.isArray(snapshot.actors)) {
    ui.notifications.error(localize("DT.CombatSnapshot.ImportInvalid"));
    return null;
  }
  const list = loadSnapshots();
  if (list.some(s => s.id === snapshot.id)) snapshot.id = foundry.utils.randomID();
  await storeSnapshots([...list, snapshot]);
  ui.notifications.info(format("DT.CombatSnapshot.Imported", { name: snapshot.name }));
  return snapshot;
}

/* -------------------------------------------- */
/*  Entry points                                */
/* -------------------------------------------- */

/**
 * The Combat Tracker's encounter menu (⋮). `getCombatContextOptions(app, menuItems)` fires once,
 * at the tracker's first render — the entries are always added and hide via `visible`, so the
 * setting works without a reload. `app.viewed` is the encounter the tracker shows.
 */
function onGetCombatContextOptions(app, menuItems) {
  if (!Array.isArray(menuItems)) return;
  const viewed = () => app?.viewed ?? game.combat ?? null;
  menuItems.push(
    {
      label: "DT.CombatSnapshot.MenuSave",
      icon: "fa-solid fa-camera",
      visible: () => mayUse() && !!viewed(),
      onClick: () => saveSnapshot(viewed()).catch(err => console.error(`${MODULE_ID} | combat snapshot failed`, err))
    },
    {
      label: "DT.CombatSnapshot.MenuOpen",
      icon: "fa-solid fa-clock-rotate-left",
      visible: () => mayUse(),
      onClick: () => openCombatSnapshots()
    }
  );
}

/** For tools/test-features.mjs only. */
export const internals = {
  buildSnapshot, compareSnapshot, applyRows, saveSnapshot, importSnapshot, loadSnapshots, openCombatSnapshots,
  onGetCombatContextOptions
};

export default {
  id: "combatSnapshot",
  category: {
    label: "DT.Categories.CombatSnapshot.Label",
    hint: "DT.Categories.CombatSnapshot.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.CombatSnapshotEnabled.Name",
        hint: "DT.Settings.CombatSnapshotEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_DATA,
      options: {
        scope: "world",
        config: false,
        type: Object,
        default: {}
      }
    }
  ],
  init() {
    Hooks.on("getCombatContextOptions", onGetCombatContextOptions);
    Hooks.once("ready", () => {
      const module = game.modules?.get(MODULE_ID);
      if (module) module.api = Object.assign(module.api ?? {}, { openCombatSnapshots, saveCombatSnapshot: saveSnapshot });
    });
  }
};

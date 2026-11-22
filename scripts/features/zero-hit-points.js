/**
 * Feature: Dropping to 0 Hit Points (dnd5e)
 * -----------------------------------------
 * Foundry VTT v14+ · dnd5e 6.x (5.3.x where the shapes are the same)
 *
 * D&D 2024 "Dropping to 0 Hit Points": a creature at 0 HP is Unconscious until it regains any
 * HP (characters also make death saves); a monster usually just dies; massive damage (the damage
 * left after reaching 0 is at least the HP maximum) kills outright. "Knocking Out a Creature":
 * with a melee attack the attacker may instead leave it at 1 HP and Unconscious; it then starts
 * a Short Rest, at whose end the condition ends (earlier if it regains HP or gets first aid).
 *
 * What this feature does (active GM only, one writer):
 *   - When a character or NPC drops from > 0 to 0 HP (`updateActor`; the previous HP come from
 *     dnd5e's `options.dnd5e.hp`, set in `preUpdateHP` for every HP update), it gets the
 *     Unconscious status (dnd5e's own status effect, created like dnd5e does it, flagged
 *     `flags.<MODULE_ID>.zeroHp = {mode: "auto"}`) — in and out of combat. Not when it already is
 *     Unconscious or Dead, and not when dnd5e's own "apply downed" automation will apply a
 *     status itself for this actor (it runs on the updating client) — the card still appears.
 *   - The GM gets a whispered chat card listing the creatures that dropped (all drops within
 *     a short moment share one card: a Fireball that drops six goblins = one card) with the
 *     state derived live from each actor and the buttons Dead / Knocked out / Reset (+ All dead).
 *   - Massive damage: the applying client stashes dnd5e's damage amount in
 *     `dnd5e.preApplyDamage` and hands it to the GM through the update options
 *     (`options[MODULE_ID].zeroHp = {amount, origin}`, delivered to every client's `updateActor`
 *     like dnd5e's own `options.dnd5e.hp`). The card then says "dead by the rules".
 *   - Our Unconscious ends by the rules: mode "auto" when the HP rise above 0; mode
 *     "knockedOut" when the creature regains any HP afterwards (our own 1-HP update is marked
 *     and ignored) or after 1 hour of world time (the Short Rest). Unconscious effects that are
 *     not ours (Sleep, a manual one…) are never removed by a heal.
 *
 * World-scoped (GM), off by default. Players only see the status on the token.
 */

import { MODULE_ID } from "../constants.js";

const FEATURE_ID = "zeroHitPoints";
const KEY_ENABLED = "zeroHpEnabled";

/** effect.flags[MODULE_ID].zeroHp = {mode: "auto" | "knockedOut"};
 *  message.flags[MODULE_ID].zeroHp = {entries: [...], origin};
 *  update options[MODULE_ID].zeroHp = {amount, origin} (damage) | {own: true} (our writes). */
const FLAG = "zeroHp";
const UNCONSCIOUS = "unconscious";
const TYPES = new Set(["character", "npc"]);
const HP_PATH = "system.attributes.hp.value";

/** Card grouping delay and the timer used for it (replaceable by the tests). */
export const timing = { delay: 150, schedule: (fn, ms) => setTimeout(fn, ms) };

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const isActiveGM = () => !!game.users?.activeGM?.isSelf;
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const deadStatus = () => CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
const resolve = uuid => (uuid ? fromUuidSync(uuid, { strict: false }) : null);
const hpOf = actor => actor?.system?.attributes?.hp;
const hpValue = actor => Number(hpOf(actor)?.value ?? 0);
const ownOptions = () => ({ [MODULE_ID]: { [FLAG]: { own: true } } });
const isOwnUpdate = options => !!options?.[MODULE_ID]?.[FLAG]?.own;
const getProp = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

/** The new HP value of an update's changes (expanded or flat keys), else undefined. */
function changedHp(changes) {
  const nested = getProp(changes, HP_PATH);
  return (nested !== undefined) ? nested : changes?.[HP_PATH];
}

/* -------------------------------------------- */
/*  Effects                                     */
/* -------------------------------------------- */

const effectInfo = effect => effect?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const ourEffect = actor => actor?.effects?.find(e => effectInfo(e)) ?? null;
const hasStatus = (actor, id) => !!actor?.statuses?.has(id);

/** dnd5e's static status effect "Unconscious" on this actor (whoever created it). */
function staticUnconscious(actor) {
  const id = CONFIG.statusEffects?.[UNCONSCIOUS]?._id;
  return id ? (actor?.effects?.get(id) ?? null) : null;
}

/** The automatic "downed" Unconscious effects: ours and dnd5e's own (`flags.dnd5e.autoDowned`). */
function downedUnconscious(actor) {
  return actor?.effects?.filter(e => effectInfo(e)
    || (e.flags?.dnd5e?.autoDowned && e.statuses?.has(UNCONSCIOUS))) ?? [];
}

const deadEffects = actor => actor?.effects?.filter(e => e.statuses?.has(deadStatus())) ?? [];

/** Effect data for a mode: knocked out = 1 hour (a Short Rest) of world time, auto = indefinite. */
function durationData(mode, { update = false } = {}) {
  if (mode === "knockedOut") {
    const data = { duration: { value: 1, units: "hours", expiry: null } };
    if (update) data.start = { time: game.time?.worldTime ?? 0 };
    return data;
  }
  return update ? { duration: { value: null, expiry: null } } : {};
}

async function createUnconscious(actor, mode) {
  const AE = ActiveEffect.implementation;
  const effect = await AE.fromStatusEffect(UNCONSCIOUS);
  effect.updateSource({ flags: { [MODULE_ID]: { [FLAG]: { mode } } }, ...durationData(mode) });
  return AE.create(effect.toObject?.() ?? effect, { parent: actor, keepId: true });
}

/** Turn an existing Unconscious effect into ours in the given mode. */
function switchMode(effect, mode) {
  const update = { flags: { [MODULE_ID]: { [FLAG]: { mode } } }, ...durationData(mode, { update: true }) };
  // dnd5e would delete its own auto effect as soon as the HP rise — it is ours now.
  if (effect.flags?.dnd5e?.autoDowned) update.flags.dnd5e = { autoDowned: false };
  return effect.update(update);
}

/** Make sure the actor is Unconscious through our effect in the given mode. */
async function ensureUnconscious(actor, mode) {
  const existing = ourEffect(actor) ?? staticUnconscious(actor) ?? downedUnconscious(actor)[0];
  if (existing) {
    if (effectInfo(existing)?.mode === mode && (mode !== "knockedOut")) return existing;
    await switchMode(existing, mode);
    return existing;
  }
  return createUnconscious(actor, mode);
}

/** Will dnd5e 6's own "apply downed" automation give this actor a status for this drop? */
export function dnd5eAppliesDowned(actor) {
  let setting;
  try {
    setting = game.settings.get("dnd5e", "autoApplyDowned");
  } catch {
    return false;   // dnd5e 5.3 has no such setting
  }
  if (!setting || (setting === "none") || !actor?.inCombat) return false;
  if (actor.type === "npc") return !actor.system?.traits?.important || (setting !== "deadOnly");
  return (actor.type === "character") && (setting === "all");
}

/** Set `defeated` on the actor's combatants in every encounter (like core's tracker toggle). */
async function setDefeated(actor, defeated) {
  for (const combat of game.combats ?? []) {
    for (const combatant of combat.getCombatantsByActor?.(actor) ?? []) {
      if (!!combatant.defeated !== defeated) await combatant.update({ defeated });
    }
  }
}

async function deleteEffects(actor, effects) {
  const ids = effects.map(e => e.id).filter(id => actor.effects.get(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

/* -------------------------------------------- */
/*  Massive damage                              */
/* -------------------------------------------- */

/**
 * Damage left after reaching 0 HP vs. the HP maximum (previous HP = before the damage).
 * @returns {{remaining: number, max: number}|null}  only when it is massive damage
 */
export function massiveDamage(amount, prevHp) {
  if (!Number.isFinite(amount) || (amount <= 0) || !prevHp) return null;
  const temp = Math.max(0, Number(prevHp.temp) || 0);
  const value = Math.max(0, Number(prevHp.value) || 0);
  const max = Number(prevHp.effectiveMax ?? prevHp.max);
  if (!Number.isFinite(max) || (max <= 0)) return null;
  const remaining = amount - temp - value;
  return (remaining >= max) ? { remaining, max } : null;
}

/** Damage amounts on the applying client, per actor uuid, until the HP update goes out. */
const stash = new Map();

function onPreApplyDamage(actor, amount, updates, options = {}) {
  try {
    if (!actor?.uuid || !enabled()) return;
    stash.delete(actor.uuid);
    if (!(amount > 0)) return;
    const origin = options?.origin ?? options?.originatingMessage;
    stash.set(actor.uuid, { amount, origin: origin?.id ?? null, expect: updates?.[HP_PATH] });
  } catch (err) {
    console.error(`${MODULE_ID} | zero hit points (damage) failed`, err);
  }
}

function onPreUpdateActor(actor, changes, options) {
  const data = actor?.uuid && stash.get(actor.uuid);
  if (!data) return;
  stash.delete(actor.uuid);
  const hp = changedHp(changes);
  if ((hp === undefined) || ((data.expect !== undefined) && (hp !== data.expect))) return;
  const mine = options[MODULE_ID] ?? {};
  options[MODULE_ID] = { ...mine, [FLAG]: { ...(mine[FLAG] ?? {}), amount: data.amount, origin: data.origin } };
}

function onApplyDamage(actor) {
  if (actor?.uuid) stash.delete(actor.uuid);
}

/* -------------------------------------------- */
/*  Drop / heal detection (active GM)           */
/* -------------------------------------------- */

const creating = new Set();
let pending = [];
let pendingTimer = null;

function entryFor(actor, options, prev) {
  const token = actor.isToken ? actor.token : (actor.getActiveTokens?.(false, true)?.[0] ?? null);
  const data = options?.[MODULE_ID]?.[FLAG];
  return {
    actor: actor.uuid,
    token: token?.uuid ?? null,
    name: token?.name ?? actor.name,
    img: token?.texture?.src ?? actor.img ?? null,
    massive: Number.isFinite(data?.amount) ? massiveDamage(data.amount, prev) : null,
    origin: data?.origin ?? null
  };
}

async function onDrop(actor, options, prev) {
  if (hasStatus(actor, deadStatus())) return;
  const mine = ourEffect(actor);
  if (mine && (effectInfo(mine).mode !== "auto")) await switchMode(mine, "auto");   // knocked out again
  else if (!mine && !hasStatus(actor, UNCONSCIOUS) && !staticUnconscious(actor)
    && !dnd5eAppliesDowned(actor) && !creating.has(actor.uuid)) {
    creating.add(actor.uuid);
    try {
      await createUnconscious(actor, "auto");
    } finally {
      creating.delete(actor.uuid);
    }
  }
  queueCard(entryFor(actor, options, prev));
}

async function onHeal(actor, prevValue) {
  const mine = ourEffect(actor);
  if (!mine) return;
  const { mode } = effectInfo(mine);
  if ((mode === "auto") || ((mode === "knockedOut") && (hpValue(actor) > prevValue))) await deleteEffects(actor, [mine]);
}

async function onUpdateActor(actor, changed, options) {
  try {
    if (!enabled() || !isActiveGM() || !TYPES.has(actor?.type)) return;
    const changedValue = changedHp(changed);
    const prev = options?.dnd5e?.hp;
    if ((changedValue === undefined) || !prev || isOwnUpdate(options)) return;
    const now = hpValue(actor);
    const before = Number(prev.value ?? 0);
    if ((now <= 0) && (before > 0)) await onDrop(actor, options, prev);
    else if ((now > 0) && (now > before)) await onHeal(actor, before);
  } catch (err) {
    console.error(`${MODULE_ID} | zero hit points failed`, err);
  }
}

/** Our knocked-out effect ran out (1 hour): core only marks it expired — remove it. dnd5e 6 deletes
 *  expired effects out of combat itself, so wait a moment and only delete what is still there. */
function onUpdateActiveEffect(effect, changed) {
  if ((changed?.duration?.expired !== true) || !effectInfo(effect) || !isActiveGM()) return;
  const actor = effect.parent;
  timing.schedule(() => {
    if (!actor?.effects?.get(effect.id)) return;
    actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id])
      .catch(err => console.warn(`${MODULE_ID} | zero hit points: could not remove an expired effect`, err));
  }, timing.delay);
}

/* -------------------------------------------- */
/*  GM card                                     */
/* -------------------------------------------- */

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

function queueCard(entry) {
  pending.push(entry);
  if (pendingTimer === null) pendingTimer = timing.schedule(() => { flushCards(); }, timing.delay);
}

/** Create one card for every drop collected so far. */
async function flushCards() {
  pendingTimer = null;
  const byActor = new Map();
  for (const entry of pending) byActor.set(entry.actor, entry);
  pending = [];
  const entries = [...byActor.values()];
  if (!entries.length) return null;
  const origins = new Set(entries.map(e => e.origin));
  const origin = ((origins.size === 1) && entries[0].origin) || null;
  const names = entries.map(e => e.name).join(", ");
  try {
    return await ChatMessage.implementation.create({
      content: `<p>${escapeHTML(format("DT.ZeroHp.Fallback", { names }))}</p>`,
      speaker: { alias: localize("DT.ZeroHp.Title") },
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
      flags: { [MODULE_ID]: { [FLAG]: { entries, origin } } }
    });
  } catch (err) {
    console.error(`${MODULE_ID} | zero hit points (card) failed`, err);
    return null;
  }
}

/** Live state of one card entry — never from the flag. */
export function entryState(entry) {
  const actor = resolve(entry?.actor);
  if (!actor) return "gone";
  if (hasStatus(actor, deadStatus())) return "dead";
  if (effectInfo(ourEffect(actor))?.mode === "knockedOut") return "knockedOut";
  return (hpValue(actor) <= 0) ? "dying" : "recovered";
}

/** Which buttons a state offers. */
const ACTIONS = {
  dying: ["dead", "knockOut"],
  dead: ["knockOut", "reset"],
  knockedOut: ["dead", "reset"],
  recovered: [],
  gone: []
};

const STATE_LABELS = {
  dying: "DT.ZeroHp.State.Dying",
  dead: "DT.ZeroHp.State.Dead",
  knockedOut: "DT.ZeroHp.State.KnockedOut",
  recovered: "DT.ZeroHp.State.Recovered",
  gone: "DT.ZeroHp.State.Gone"
};

/** Dead: Dead status with overlay, no automatic Unconscious, 0 HP, defeated in the tracker. */
async function markDead(actor) {
  const status = deadStatus();
  if (!hasStatus(actor, status)) await actor.toggleStatusEffect(status, { active: true, overlay: true });
  await deleteEffects(actor, downedUnconscious(actor));
  if (hpValue(actor) !== 0) await actor.update({ [HP_PATH]: 0 }, ownOptions());
  await setDefeated(actor, true);
}

/** Knocked out: no Dead, our Unconscious for 1 hour, 1 HP (dnd5e resets the death saves). */
async function knockOut(actor) {
  await deleteEffects(actor, deadEffects(actor));
  await setDefeated(actor, false);
  await ensureUnconscious(actor, "knockedOut");
  if (hpValue(actor) !== 1) await actor.update({ [HP_PATH]: 1 }, ownOptions());
}

/** Reset: back to dying — no Dead, our automatic Unconscious, 0 HP. */
async function resetDying(actor) {
  await deleteEffects(actor, deadEffects(actor));
  await setDefeated(actor, false);
  await ensureUnconscious(actor, "auto");
  if (hpValue(actor) !== 0) await actor.update({ [HP_PATH]: 0 }, ownOptions());
}

const RUN = { dead: markDead, knockOut, reset: resetDying };

export async function runAction(action, entry) {
  if (!game.user.isGM) return false;
  const actor = resolve(entry?.actor);
  if (!actor || !RUN[action]) return false;
  await RUN[action](actor);
  return true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(classes) {
  const node = el("i", classes);
  node.inert = true;
  return node;
}

const BUTTONS = {
  dead: { label: "DT.ZeroHp.Dead.Label", hint: "DT.ZeroHp.Dead.Hint", icon: "fa-solid fa-skull" },
  knockOut: { label: "DT.ZeroHp.KnockOut.Label", hint: "DT.ZeroHp.KnockOut.Hint", icon: "fa-solid fa-hand-fist" },
  reset: { label: "DT.ZeroHp.Reset.Label", hint: "DT.ZeroHp.Reset.Hint", icon: "fa-solid fa-rotate-left" },
  allDead: { label: "DT.ZeroHp.AllDead.Label", hint: "DT.ZeroHp.AllDead.Hint", icon: "fa-solid fa-skull-crossbones" }
};

function button(kind, { primary = false, secondary = false } = {}, onClick) {
  const def = BUTTONS[kind];
  const node = el("button", `dt-zhp__btn dt-zhp__btn--${kind}`);
  node.type = "button";
  if (primary) node.classList.add("dt-zhp__btn--primary");
  if (secondary) node.classList.add("dt-zhp__btn--secondary");
  node.dataset.zhp = kind;   // deliberately no data-action: the chat log would try to dispatch it
  node.dataset.tooltip = localize(def.hint);
  node.ariaLabel = node.dataset.tooltip;
  node.append(icon(def.icon), el("span", null, localize(def.label)));
  node.addEventListener("click", event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (node.disabled) return;
    node.disabled = true;
    return Promise.resolve()
      .then(() => onClick(event))
      .catch(err => {
        console.error(`${MODULE_ID} | zero hit points failed`, err);
        ui.notifications.error(format("DT.ZeroHp.Failed", { error: err?.message ?? err }));
      })
      .finally(() => { node.disabled = false; });
  });
  return node;
}

/** Name of the item behind the damage message, if cheaply available. */
function sourceLabel(messageId) {
  const message = messageId ? game.messages?.get(messageId) : null;
  if (!message) return null;
  try {
    return message.getAssociatedItem?.()?.name ?? message.system?.item?.name ?? null;
  } catch {
    return null;
  }
}

/** Open cards → what they show, refreshed when one of their actors changes. */
const cards = new Set();

function entryRow(entry, refresh, showSource) {
  const state = entryState(entry);
  const li = el("li", `dt-zhp__entry dt-zhp__entry--${state}`);
  li.dataset.state = state;
  if (entry.img) {
    const img = el("img", "dt-zhp__img");
    img.src = entry.img;
    img.alt = entry.name ?? "";
    li.append(img);
  }
  const info = el("div", "dt-zhp__info");
  info.append(el("span", "dt-zhp__name", entry.name ?? ""), el("span", "dt-zhp__state", localize(STATE_LABELS[state])));
  if (entry.massive) {
    info.append(el("span", "dt-zhp__massive", format("DT.ZeroHp.Massive", { remaining: entry.massive.remaining, max: entry.massive.max })));
  }
  const source = showSource ? sourceLabel(entry.origin) : null;
  if (source) info.append(el("span", "dt-zhp__source", format("DT.ZeroHp.Source", { source })));
  li.append(info);

  const actions = ACTIONS[state];
  if (actions.length) {
    const buttons = el("div", "dt-zhp__buttons");
    for (const action of actions) {
      buttons.append(button(action, {
        primary: (action === "dead") && !!entry.massive,
        secondary: action === "reset"
      }, async () => {
        if (await runAction(action, entry)) refresh();
      }));
    }
    li.append(buttons);
  }
  return li;
}

export function buildCard(message) {
  const data = message.flags[MODULE_ID][FLAG];
  const entries = data.entries ?? [];
  const box = el("div", "dt-zhp");
  const record = { box, message, actors: new Set(entries.map(e => e.actor)) };
  const refresh = () => {
    cards.delete(record);
    const next = buildCard(message);
    box.replaceWith(next);
  };
  record.refresh = refresh;

  const header = el("div", "dt-zhp__header");
  header.append(icon("fa-solid fa-heart-crack"), el("strong", "dt-zhp__title", localize("DT.ZeroHp.Title")));
  const source = sourceLabel(data.origin);
  if (source) header.append(el("span", "dt-zhp__source", format("DT.ZeroHp.Source", { source })));
  box.append(header);

  const list = el("ul", "unlist dt-zhp__entries");
  for (const entry of entries) list.append(entryRow(entry, refresh, !data.origin));
  box.append(list);

  const undecided = entries.filter(e => entryState(e) === "dying");
  if (undecided.length >= 2) {
    const footer = el("div", "dt-zhp__footer");
    footer.append(button("allDead", {}, async () => {
      for (const entry of undecided) if (entryState(entry) === "dying") await runAction("dead", entry);
      refresh();
    }));
    box.append(footer);
  }
  cards.add(record);
  return box;
}

function onRenderChatMessage(message, html) {
  try {
    const data = message?.flags?.[MODULE_ID]?.[FLAG];
    if (!Array.isArray(data?.entries) || !game.user?.isGM || !enabled()) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    const content = root.querySelector(".message-content") ?? root;
    content.replaceChildren(buildCard(message));
  } catch (err) {
    console.error(`${MODULE_ID} | zero hit points (chat card) failed`, err);
  }
}

/** Re-render open cards whose actors changed (any GM client). */
const changedActors = new Set();
let refreshTimer = null;

function noteChange(actor) {
  if (!cards.size || !actor?.uuid || !game.user?.isGM) return;
  changedActors.add(actor.uuid);
  if (refreshTimer !== null) return;
  refreshTimer = timing.schedule(() => {
    refreshTimer = null;
    const uuids = new Set(changedActors);
    changedActors.clear();
    for (const record of [...cards]) {
      if (record.box.isConnected === false) { cards.delete(record); continue; }
      if ([...record.actors].some(uuid => uuids.has(uuid))) record.refresh();
    }
  }, 50);
}

const onEffectChange = effect => { if (enabled()) noteChange(effect?.parent); };

/* -------------------------------------------- */

/** For tools/test-features.mjs only. */
export const internals = {
  massiveDamage, entryState, dnd5eAppliesDowned, runAction, buildCard, flushCards, timing, cards, stash
};

export default {
  id: FEATURE_ID,
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.ZeroHitPoints.Label",
    hint: "DT.Categories.ZeroHitPoints.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.ZeroHpEnabled.Name",
        hint: "DT.Settings.ZeroHpEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
    Hooks.on("dnd5e.applyDamage", onApplyDamage);
    Hooks.on("preUpdateActor", onPreUpdateActor);
    Hooks.on("updateActor", (actor, changed, options, userId) => {
      if (enabled()) noteChange(actor);
      return onUpdateActor(actor, changed, options, userId);
    });
    Hooks.on("updateActiveEffect", (effect, changed) => {
      onEffectChange(effect);
      onUpdateActiveEffect(effect, changed);
    });
    Hooks.on("createActiveEffect", onEffectChange);
    Hooks.on("deleteActiveEffect", onEffectChange);
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  }
};

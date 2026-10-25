/**
 * Feature: Weapon Mastery (dnd5e)
 * -------------------------------
 * Foundry VTT v14+ · dnd5e 5.3.x and 6.x
 *
 * dnd5e lets a character pick a weapon mastery for an attack and remembers it on the attack
 * roll (`rolls[0].options.mastery`, also `message.system.mastery` in 6.x and
 * `flags.dnd5e.roll.mastery` in 5.x), but automates none of them. This feature adds one line
 * to every ATTACK card that carries a mastery — "Weapon Mastery: <rule link> [<Mastery>]" — and
 * for the GM a dnd5e-style tray below it:
 *   - The mastery button carries out the mastery on every target it applies to. Masteries are
 *     optional, so nothing ever happens without a click. A player who may change the affected
 *     documents (Vex: their own actor) runs it directly; otherwise the click asks the active GM
 *     over the module socket, whose client applies it to the targets with a known matching
 *     hit/miss and tells the GM about targets whose hit is unknown.
 *   - The GM tray (markup of dnd5e's own `.card-tray.collapsible`, so dnd5e's CSS and chat
 *     listener fold it) lists the recorded targets — or, switched like dnd5e's
 *     "Targeted / Selected" control, the selected tokens — with hit/miss (clickable to correct
 *     it, e.g. after a Shield spell) and an Apply button per target. After applying, it folds up
 *     like dnd5e's damage and effect trays (unless dnd5e's "Collapse Chat Card Trays" is Manual).
 * What each mastery does:
 *   - Graze (miss): damage = the attack's ability modifier, weapon damage type (applyDamage).
 *   - Topple (hit): Constitution save DC 8 + ability mod + proficiency, Prone on a failure. The
 *     GM rolls for creatures without a player owner; player-owned targets get a chat card
 *     with a save button for their owners.
 *   - Push (hit, Large or smaller): the target token moves up to 10 ft straight away from the
 *     attacker, snapped to the grid, stopping before walls (movement action "displace", so it
 *     costs the target no movement).
 *   - Sap / Slow (hit): an effect on the target until the start of the attacker's next turn —
 *     Sap: disadvantage on its next attack roll; Slow: speed −10 ft, doesn't stack.
 *   - Vex (hit): an effect on the attacker — advantage on the next attack roll against that
 *     creature before the end of its next turn.
 *   - Cleave / Nick: nothing to automate — only the line with the rule link.
 * Plus an optional macro per mastery (world setting) that gets
 * `{actor, token, item, activity, mastery, targets, message, hit}`.
 *
 * Hit or miss comes from dnd5e's own data: the AC snapshot of each recorded target (see
 * lib/attack-roll.js); unknown (no AC, selected tokens) = the GM decides.
 *
 * Effects: dnd5e 6 has pseudo expiries "sourceStart"/"sourceEnd" (start/end of the ORIGIN
 * actor's turn) and rule-type changes (`{key: "attack", type: "dnd5e.advantage", value: "-1"}`
 * = disadvantage on attack rolls). dnd5e 5.3 has neither; there the core v14 expiries
 * "turnStart"/"turnEnd" are used with `start.combatant` = the attacker's combatant, and Sap's
 * disadvantage comes from this feature's `dnd5e.preRollAttackV2` hook. Vex needs the attack's
 * target, which dnd5e's rule conditions don't see, so it always uses that hook. "Next attack"
 * effects are removed once that attack has been rolled (`dnd5e.rollAttack`).
 *
 * RSReforged 6 (dnd5e 6) shows dnd5e's attack message inside the usage card
 * (`.rsr-section-attack[data-message-id]`, added asynchronously) and hides the attack card
 * itself, so the panel goes into that section and never onto the hidden child card (whose
 * copies otherwise surfaced, e.g. in chat notifications) nor the usage or damage card.
 */

import { MODULE_ID } from "../constants.js";
import { hitAgainst } from "../lib/attack-roll.js";
import { watchRsrSections } from "../lib/rsr-sections.js";
import { emitSocketMessage, onSocketMessage } from "../lib/socket.js";

const FEATURE_ID = "weaponMastery";
const KEY_ENABLED = "weaponMasteryEnabled";
const MACRO_SETTINGS = {
  cleave: "weaponMasteryMacroCleave",
  graze: "weaponMasteryMacroGraze",
  nick: "weaponMasteryMacroNick",
  push: "weaponMasteryMacroPush",
  sap: "weaponMasteryMacroSap",
  slow: "weaponMasteryMacroSlow",
  topple: "weaponMasteryMacroTopple",
  vex: "weaponMasteryMacroVex"
};
const MACRO_NAMES = {
  cleave: "DT.Settings.WeaponMasteryMacroCleave.Name",
  graze: "DT.Settings.WeaponMasteryMacroGraze.Name",
  nick: "DT.Settings.WeaponMasteryMacroNick.Name",
  push: "DT.Settings.WeaponMasteryMacroPush.Name",
  sap: "DT.Settings.WeaponMasteryMacroSap.Name",
  slow: "DT.Settings.WeaponMasteryMacroSlow.Name",
  topple: "DT.Settings.WeaponMasteryMacroTopple.Name",
  vex: "DT.Settings.WeaponMasteryMacroVex.Name"
};

/** When each mastery applies ("hit"/"miss"); Cleave and Nick have nothing to automate. */
const RULES = {
  graze: { on: "miss", icon: "fa-solid fa-droplet" },
  push: { on: "hit", icon: "fa-solid fa-angles-right" },
  sap: { on: "hit", icon: "fa-solid fa-arrow-trend-down" },
  slow: { on: "hit", icon: "fa-solid fa-person-walking" },
  topple: { on: "hit", icon: "fa-solid fa-person-falling" },
  vex: { on: "hit", icon: "fa-solid fa-crosshairs" }
};

/** effect.flags[MODULE_ID].weaponMastery = { mastery, source, message, target? } */
const FLAG_EFFECT = "weaponMastery";
/** attackMessage.flags[MODULE_ID].weaponMastery = { done: { <row key>: { <mastery>: true | "requested" } } } */
const FLAG_DONE = "weaponMastery";
/** saveRequest.flags[MODULE_ID].weaponMasterySave = { actor, dc, ability, status, mastery } */
const FLAG_SAVE = "weaponMasterySave";
/** attackRoll.options[MODULE_ID].weaponMasteryConsume = [effect ids] */
const ROLL_OPTION = MODULE_ID;
const RSR_SECTION = ".rsr-section-attack[data-message-id]";

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const resolve = uuid => (uuid ? fromUuidSync(uuid, { strict: false }) : null);

/** dnd5e 6: "start/end of the origin's next turn" expiries. */
const hasSourceExpiry = () => !!CONFIG.DND5E?.pseudoExpiryEvents?.sourceStart;
/** dnd5e 6: rule-type changes (advantage/disadvantage). */
const hasRules = () => !!CONFIG.ActiveEffect?.changeTypes?.["dnd5e.advantage"];

/** dnd5e's "Collapse Chat Card Trays" (manual / never / older / always; default older). */
function trayCollapseSetting() {
  try {
    return game.settings.get("dnd5e", "autoCollapseChatTrays") ?? "older";
  } catch {
    return "older";
  }
}

/* -------------------------------------------- */
/*  Reading the attack                          */
/* -------------------------------------------- */

/** dnd5e 6 types the message, 5.x (and RSReforged's legacy cards) flag the roll type. */
function isAttackMessage(message) {
  return (message?.type === "attack") || (message?.flags?.dnd5e?.roll?.type === "attack");
}

/** RSReforged 6 shows this attack message as a section of its usage card and hides the card. */
function shownByRsr(message) {
  return !!message?.flags?.rsreforged?.parentId && !!game.modules?.get("rsreforged")?.active;
}

function masteryOf(message) {
  const roll = message?.rolls?.[0];
  return roll?.options?.mastery ?? message?.system?.mastery ?? message?.flags?.dnd5e?.roll?.mastery ?? null;
}

/** dnd5e 6: system.targets {actor, token, ac, name, img}; 5.x: flags.dnd5e.targets {uuid, ac, name, img}. */
function targetDescriptors(message) {
  const v6 = message?.system?.targets;
  if (v6?.length) return Array.from(v6);
  const v5 = message?.flags?.dnd5e?.targets;
  return Array.isArray(v5) ? v5 : [];
}

/**
 * Everything the panel needs from an attack message, or null if it isn't an attack or carries
 * no mastery. dnd5e records a mastery only when the attacker has the weapon's mastery
 * (characters; NPCs have no weapon masteries in dnd5e) — no mastery, no panel.
 * @returns {{message, mastery, roll, actor, item, activity, ability, targets: object[]}|null}
 */
function attackContext(message) {
  if (!isAttackMessage(message)) return null;
  const mastery = masteryOf(message);
  if (!mastery) return null;
  const roll = message.rolls?.[0] ?? null;
  const actor = message.getAssociatedActor?.() ?? ChatMessage.implementation?.getSpeakerActor?.(message.speaker) ?? null;
  const item = message.getAssociatedItem?.() ?? resolve(message.system?.item?.uuid ?? message.flags?.dnd5e?.item?.uuid);
  const activity = message.getAssociatedActivity?.() ?? null;
  const ability = message.system?.ability ?? roll?.options?.ability ?? activity?.ability ?? null;
  const targets = targetDescriptors(message).map((t, index) => ({
    key: `t${index}`,
    name: t.name ?? "",
    ac: t.ac ?? null,
    actorUuid: t.actor ?? t.uuid ?? null,
    tokenUuid: t.token ?? null,
    hit: hitAgainst(roll, t.ac)
  }));
  return { message, mastery, roll, actor, item, activity, ability, targets };
}

const tokenRow = (prefix, token) => ({
  key: `${prefix}:${token.document?.uuid ?? token.actor.uuid}`, name: token.name ?? token.document?.name ?? "",
  ac: null, actorUuid: token.actor.uuid, tokenUuid: token.document?.uuid ?? null, hit: null
});

/** The GM's selected tokens (dnd5e's "Selected" mode). */
const selectedRows = () => (canvas?.tokens?.controlled ?? []).filter(t => t.actor).map(t => tokenRow("s", t));
/** The user's current targets — for a player's Vex when the attack recorded none. */
const currentTargetRows = () => Array.from(game.user?.targets ?? []).filter(t => t.actor).map(t => tokenRow("c", t));

function targetActor(row) {
  return resolve(row.actorUuid) ?? resolve(row.tokenUuid)?.actor ?? null;
}

/** The target's token on the viewed scene, or null. */
function targetToken(row) {
  const doc = resolve(row.tokenUuid);
  if (doc?.object && (doc.parent === canvas?.scene)) return doc.object;
  return targetActor(row)?.getActiveTokens?.()[0] ?? null;
}

/** The attacker's token on the viewed scene, or null. */
function attackerToken(ctx) {
  const { scene, token } = ctx.message.speaker ?? {};
  const doc = (scene && token) ? game.scenes?.get(scene)?.tokens?.get(token) : null;
  if (doc?.object && (doc.parent === canvas?.scene)) return doc.object;
  return ctx.actor?.getActiveTokens?.()[0] ?? null;
}

function abilityMod(ctx) {
  return Number(ctx.actor?.system?.abilities?.[ctx.ability]?.mod ?? 0) || 0;
}

/** Topple: DC 8 + the attack's ability modifier + proficiency bonus. */
function toppleDC(ctx) {
  return 8 + abilityMod(ctx) + (Number(ctx.actor?.system?.attributes?.prof ?? 0) || 0);
}

/** Graze: the attack's ability modifier as damage of the weapon's damage type. */
function grazeDamage(ctx) {
  const base = ctx.item?.system?.damage?.base?.types;
  const part = ctx.activity?.damage?.parts?.[0]?.types;
  const type = [...(base ?? [])][0] ?? [...(part ?? [])][0] ?? null;
  const properties = [...(ctx.item?.system?.properties ?? [])]
    .filter(p => CONFIG.DND5E?.itemProperties?.[p]?.isPhysical);
  return { value: Math.max(0, abilityMod(ctx)), type, properties };
}

/** Push only moves creatures of size Large or smaller (unknown size: allowed, the GM decides). */
function tooLargeToPush(actor) {
  const sizes = Object.keys(CONFIG.DND5E?.actorSizes ?? {});
  const size = sizes.indexOf(actor?.system?.traits?.size);
  const large = sizes.indexOf("lg");
  return (size >= 0) && (large >= 0) && (size > large);
}

/* -------------------------------------------- */
/*  Hit / miss                                  */
/* -------------------------------------------- */

/** "<message id>:<row key>" → true/false, the GM's correction for this session. */
const overrides = new Map();

/** "hit" / "miss" / "unknown" including the GM's correction. */
function trueState(ctx, row) {
  const override = overrides.get(`${ctx.message.id}:${row.key}`);
  const hit = (override !== undefined) ? override : row.hit;
  if ((hit === null) || (hit === undefined)) return "unknown";
  return hit ? "hit" : "miss";
}

/** What the current user may see: dnd5e's "Attack Roll Visibility" can hide results from players. */
function rowState(ctx, row) {
  return resultsVisible() ? trueState(ctx, row) : "unknown";
}

function resultsVisible() {
  if (game.user.isGM) return true;
  try {
    return game.settings.get("dnd5e", "attackRollVisibility") !== "none";
  } catch {
    return true;
  }
}

function applies(mastery, state) {
  const on = RULES[mastery]?.on;
  return !!on && ((state === "unknown") || (state === on));
}

/* -------------------------------------------- */
/*  Rights                                      */
/* -------------------------------------------- */

/** May the current user change every document this mastery touches for these rows? */
function mayApplyLocally(ctx, rows) {
  if (game.user.isGM) return true;
  if (ctx.mastery === "vex") return !!ctx.actor?.isOwner;
  if (!rows.length) return false;
  if (ctx.mastery === "push") return rows.every(row => targetToken(row)?.document?.isOwner);
  return rows.every(row => targetActor(row)?.isOwner);
}

function warn(key, data) {
  ui.notifications.warn(data ? format(key, data) : localize(key));
  return false;
}

/* -------------------------------------------- */
/*  Effects                                     */
/* -------------------------------------------- */

const effectInfo = effect => effect?.flags?.[MODULE_ID]?.[FLAG_EFFECT] ?? null;

function attackerCombatant(actor, combat = game.combat) {
  if (!combat?.started || !actor) return null;
  return combat.getCombatantsByActor?.(actor)?.[0] ?? null;
}

/**
 * Duration data for "until the start / end of the attacker's next turn".
 * @param {"start"|"end"} edge
 */
function untilAttackersTurn(edge, actor, combat = game.combat) {
  if (hasSourceExpiry()) return { duration: { expiry: (edge === "start") ? "sourceStart" : "sourceEnd", value: null } };
  // Core v14: turnStart/turnEnd of the effect's start combatant, which we set to the attacker.
  const data = { duration: { expiry: (edge === "start") ? "turnStart" : "turnEnd", value: null } };
  const combatant = attackerCombatant(actor, combat);
  if (combatant) {
    data.start = { combatant: combatant.id };
    // On the attacker's own turn, the end of its NEXT turn is one round later.
    if ((edge === "end") && (combat.combatant?.id === combatant.id)) Object.assign(data.duration, { value: 1, units: "rounds" });
  }
  return data;
}

function effectData(ctx, mastery, { name, img, description, changes = [], edge, target }) {
  const data = {
    name, img, description,
    origin: ctx.item?.uuid ?? ctx.actor?.uuid ?? null,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
    ...untilAttackersTurn(edge, ctx.actor),
    system: { changes },
    flags: { [MODULE_ID]: { [FLAG_EFFECT]: {
      mastery, source: ctx.actor?.uuid ?? null, message: ctx.message.id, ...(target ? { target } : {})
    } } }
  };
  if (hasSourceExpiry()) {
    const origin = { actor: ctx.actor?.uuid, item: ctx.item?.uuid, message: ctx.message.uuid };
    data.system.origin = Object.fromEntries(Object.entries(origin).filter(([, v]) => v));
  }
  return data;
}

function sapEffect(ctx) {
  return effectData(ctx, "sap", {
    name: format("DT.WeaponMastery.Effect.Sap", { attacker: ctx.actor?.name ?? "" }),
    img: "icons/svg/downgrade.svg",
    description: localize("DT.WeaponMastery.Effect.SapText"),
    changes: hasRules() ? [{ key: "attack", type: "dnd5e.advantage", value: "-1" }] : [],
    edge: "start"
  });
}

function slowEffect(ctx, actor) {
  const reduction = (actor?.system?.attributes?.movement?.units === "m") ? 3 : 10;
  return effectData(ctx, "slow", {
    name: format("DT.WeaponMastery.Effect.Slow", { attacker: ctx.actor?.name ?? "" }),
    img: "icons/svg/net.svg",
    description: localize("DT.WeaponMastery.Effect.SlowText"),
    changes: [{ key: "system.attributes.movement.bonus", type: "add", value: `-${reduction}` }],
    edge: "start"
  });
}

function vexEffect(ctx, row, target) {
  return effectData(ctx, "vex", {
    name: format("DT.WeaponMastery.Effect.Vex", { target: row.name || target?.name || "" }),
    img: "icons/svg/target.svg",
    description: localize("DT.WeaponMastery.Effect.VexText"),
    edge: "end",
    target: target?.uuid ?? row.actorUuid
  });
}

/** Replace this mastery's effects on the actor (Sap and Slow don't stack; Vex once per target). */
async function replaceEffect(actor, data, same = () => true) {
  const { mastery } = data.flags[MODULE_ID][FLAG_EFFECT];
  const old = actor.effects.filter(e => (effectInfo(e)?.mastery === mastery) && same(e)).map(e => e.id);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return true;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

async function applyGraze(ctx, row) {
  const actor = targetActor(row);
  if (!actor) return warn("DT.WeaponMastery.NoActor");
  if (!(game.user.isGM || actor.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  const { value, type, properties } = grazeDamage(ctx);
  if (value <= 0) return warn("DT.WeaponMastery.GrazeNoDamage");
  await actor.applyDamage([{ value, type, properties: new Set(properties) }]);
  return true;
}

/** Roll a Topple save for an actor the current user owns; Prone on a failure. */
async function rollToppleSave(actor, dc, { event, fastForward = false } = {}) {
  const rolls = await actor.rollSavingThrow({ ability: "con", target: dc, event }, fastForward ? { configure: false } : {});
  const roll = rolls?.[0];
  if (!roll) return false;
  const saved = (typeof roll.isSuccess === "boolean") ? roll.isSuccess : (roll.total >= dc);
  if (!saved) await actor.toggleStatusEffect("prone", { active: true });
  return true;
}

async function applyTopple(ctx, row, { event, fastForward } = {}) {
  const actor = targetActor(row);
  if (!actor) return warn("DT.WeaponMastery.NoActor");
  const dc = toppleDC(ctx);
  if (game.user.isGM && actor.hasPlayerOwner) {
    // Players roll their own saves: post a request with a save button for the owners.
    const text = document.createElement("p");
    text.textContent = format("DT.WeaponMastery.ToppleRequest", { target: actor.name, dc, attacker: ctx.actor?.name ?? "" });
    await ChatMessage.implementation.create({
      content: text.outerHTML,
      speaker: ChatMessage.implementation.getSpeaker({ actor: ctx.actor }),
      flags: { [MODULE_ID]: { [FLAG_SAVE]: { actor: actor.uuid, dc, ability: "con", status: "prone", mastery: "topple" } } }
    });
    return "requested";
  }
  if (!(game.user.isGM || actor.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  return rollToppleSave(actor, dc, { event, fastForward });
}

/** Feet → scene units: dnd5e's metric convention is 1.5 m per 5 ft. */
function pushDistance(scene = canvas?.scene) {
  const units = String(scene?.grid?.units ?? "").trim().toLowerCase();
  return ["m", "meter", "meters", "metre", "metres"].includes(units) ? 3 : 10;
}

/**
 * The farthest position up to 10 ft straight away from the attacker that the target can be
 * moved to without crossing a wall, snapped to the grid. null if there is none.
 */
function pushDestination(attacker, target) {
  const doc = target.document;
  const from = attacker.center;
  const center = target.center;
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const distance = pushDistance();
  const pixels = distance * canvas.dimensions.distancePixels;
  const gridless = canvas.grid.isGridless;
  const step = gridless ? (pixels / 20) : (canvas.grid.size / 4);
  const start = { x: doc.x, y: doc.y };
  const startOrigin = doc.getMovementOrigin(start);
  // Scan beyond the straight-line distance: with equidistant diagonals, 10 ft are 2 diagonal
  // squares (~1.41× as far in pixels). The grid's own measurement decides what is in range.
  for (let s = pixels * 2; s > 0; s -= step) {
    const raw = { x: start.x + ((dx / length) * s), y: start.y + ((dy / length) * s) };
    const snapped = gridless ? raw : doc.getSnappedPosition(raw);
    const position = { x: Math.round(snapped.x), y: Math.round(snapped.y) };
    if ((position.x === start.x) && (position.y === start.y)) continue;
    const origin = doc.getMovementOrigin(position);
    if (canvas.grid.measurePath([startOrigin, origin]).distance > (distance + 0.01)) continue;
    if (Math.hypot(origin.x - from.x, origin.y - from.y) <= length) continue;     // must end farther away
    if (target.checkCollision(origin, { origin: startOrigin, type: "move", mode: "any" })) continue;
    return position;
  }
  return null;
}

async function applyPush(ctx, row) {
  const target = targetToken(row);
  const attacker = attackerToken(ctx);
  if (!target || !attacker) return warn("DT.WeaponMastery.NoToken");
  if (!(game.user.isGM || target.document.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  if (tooLargeToPush(target.actor)) return warn("DT.WeaponMastery.PushTooLarge", { target: target.name });
  const position = pushDestination(attacker, target);
  if (!position) return warn("DT.WeaponMastery.PushBlocked", { target: target.name });
  await target.document.move({ x: position.x, y: position.y, action: "displace" });
  return true;
}

async function applySap(ctx, row) {
  const actor = targetActor(row);
  if (!actor) return warn("DT.WeaponMastery.NoActor");
  if (!(game.user.isGM || actor.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  return replaceEffect(actor, sapEffect(ctx));
}

async function applySlow(ctx, row) {
  const actor = targetActor(row);
  if (!actor) return warn("DT.WeaponMastery.NoActor");
  if (!(game.user.isGM || actor.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  return replaceEffect(actor, slowEffect(ctx, actor));
}

async function applyVex(ctx, row) {
  const attacker = ctx.actor;
  const target = targetActor(row);
  if (!attacker || !target) return warn("DT.WeaponMastery.NoActor");
  if (!(game.user.isGM || attacker.isOwner)) return warn("DT.WeaponMastery.NoPermission");
  return replaceEffect(attacker, vexEffect(ctx, row, target), e => effectInfo(e)?.target === target.uuid);
}

const ACTIONS = { graze: applyGraze, topple: applyTopple, push: applyPush, sap: applySap, slow: applySlow, vex: applyVex };

/* -------------------------------------------- */
/*  Tray state                                  */
/* -------------------------------------------- */

/** "<message id>" → { mode: "targeted" | "selected", open: boolean }, for this session. */
const trays = new Map();

function doneMap(ctx) {
  return ctx.message.flags?.[MODULE_ID]?.[FLAG_DONE]?.done ?? {};
}

function isDone(ctx, row) {
  return !!doneMap(ctx)[row.key]?.[ctx.mastery];
}

const anyDone = ctx => Object.values(doneMap(ctx)).some(entry => entry?.[ctx.mastery]);

function trayState(ctx) {
  let state = trays.get(ctx.message.id);
  if (!state) {
    // Like dnd5e's trays: folded once used, or per its "Collapse Chat Card Trays" setting.
    const setting = trayCollapseSetting();
    const old = (ctx.message.timestamp ?? Date.now()) < (Date.now() - (5 * 60 * 1000));
    const collapsed = anyDone(ctx) || (setting === "always") || ((setting === "older") && old);
    state = { mode: ctx.targets.length ? "targeted" : "selected", open: !collapsed };
    trays.set(ctx.message.id, state);
  }
  if (!ctx.targets.length) state.mode = "selected";
  return state;
}

function trayRows(ctx) {
  return (trayState(ctx).mode === "selected") ? selectedRows() : ctx.targets;
}

/**
 * Apply the mastery to the rows, record it on the card and fold the GM tray.
 * @returns {Promise<boolean>} whether anything was applied
 */
async function applyRows(ctx, rows, options = {}) {
  const updates = {};
  let applied = false;
  for (const row of rows) {
    const result = await ACTIONS[ctx.mastery](ctx, row, options);
    if (!result) continue;
    applied = true;
    if (/^t\d+$/.test(row.key)) updates[`flags.${MODULE_ID}.${FLAG_DONE}.done.${row.key}.${ctx.mastery}`] = result;
  }
  if (!applied) return false;
  if (!options.keepOpen && (trayCollapseSetting() !== "manual")) trayState(ctx).open = false;
  if (Object.keys(updates).length && ctx.message.canUserModify?.(game.user, "update")) await ctx.message.update(updates);
  return true;
}

/* -------------------------------------------- */
/*  Using the mastery                           */
/* -------------------------------------------- */

/**
 * The mastery button. The GM applies it to every row of the tray it applies to; a player
 * applies it directly when allowed (Vex), otherwise asks the active GM.
 */
async function useMastery(ctx, event) {
  const rule = RULES[ctx.mastery];
  if (!rule) return false;
  const label = masteryLabel(ctx.mastery);
  if (game.user.isGM) {
    const rows = trayRows(ctx);
    if (!rows.length) return warn("DT.WeaponMastery.NoTokens");
    const eligible = rows.filter(row => applies(ctx.mastery, trueState(ctx, row)));
    if (!eligible.length) return warn("DT.WeaponMastery.NothingApplies", { mastery: label });
    return applyRows(ctx, eligible, { event });
  }
  const rows = (!ctx.targets.length && (ctx.mastery === "vex")) ? currentTargetRows() : ctx.targets;
  if (!mayApplyLocally(ctx, rows)) return requestFromGM(ctx);
  if (!rows.length) return warn("DT.WeaponMastery.NoTargets");
  const eligible = rows.filter(row => applies(ctx.mastery, trueState(ctx, row)));
  if (!eligible.length) return warn("DT.WeaponMastery.NothingApplies", { mastery: label });
  return applyRows(ctx, eligible, { event });
}

/** Ask the active GM's client to apply the mastery of this attack card. */
function requestFromGM(ctx) {
  const gm = game.users.activeGM;
  const mastery = masteryLabel(ctx.mastery);
  if (!gm) return warn("DT.WeaponMastery.NoGM", { mastery });
  emitSocketMessage(FEATURE_ID, { action: "use", messageId: ctx.message.id }, { recipients: [gm.id] });
  ui.notifications.info(format("DT.WeaponMastery.Requested", { mastery }));
  return true;
}

/**
 * On the active GM's client: a player used the mastery button. Apply it to the targets with a
 * known matching result; targets whose hit is unknown are left to the GM, who gets a note.
 */
async function onSocketRequest(request, senderId) {
  if ((request?.action !== "use") || !game.users.activeGM?.isSelf || !enabled()) return;
  const message = game.messages?.get(request.messageId);
  const ctx = message ? attackContext(message) : null;
  const sender = game.users.get?.(senderId) ?? Array.from(game.users).find(u => u.id === senderId);
  if (!ctx || !sender || !RULES[ctx.mastery]) return;
  // Only the attacker's side may ask for its mastery.
  if (!(ctx.actor?.testUserPermission?.(sender, "OWNER") || (message.author?.id === senderId))) return;
  const known = ctx.targets.filter(row => trueState(ctx, row) === RULES[ctx.mastery].on);
  const unknown = ctx.targets.filter(row => trueState(ctx, row) === "unknown");
  const data = { user: sender.name, mastery: masteryLabel(ctx.mastery), attacker: ctx.actor?.name ?? "" };
  // Targets left for the GM keep the tray open.
  if (known.length) await applyRows(ctx, known, { fastForward: true, keepOpen: unknown.length > 0 });
  if (!ctx.targets.length) ui.notifications.info(format("DT.WeaponMastery.RequestNoTargets", data));
  else if (unknown.length) ui.notifications.info(format("DT.WeaponMastery.RequestUnknown", { ...data, targets: unknown.map(r => r.name).join(", ") }));
  else if (!known.length) ui.notifications.info(format("DT.WeaponMastery.RequestNothing", data));
}

/* -------------------------------------------- */
/*  Macro                                       */
/* -------------------------------------------- */

const macroRef = mastery => String((MACRO_SETTINGS[mastery] && game.settings.get(MODULE_ID, MACRO_SETTINGS[mastery])) ?? "").trim();

async function resolveMacro(ref) {
  let macro = null;
  if (/^(Macro|Compendium)\./.test(ref)) macro = await fromUuid(ref);
  macro ??= game.macros?.getName(ref) ?? game.macros?.get(ref) ?? null;
  return (macro?.documentName === "Macro") ? macro : null;
}

async function runMacro(ctx) {
  const ref = macroRef(ctx.mastery);
  const macro = ref ? await resolveMacro(ref) : null;
  if (!macro) return warn("DT.WeaponMastery.MacroNotFound", { macro: ref });
  const rows = ctx.targets.length ? ctx.targets : currentTargetRows();
  const targets = rows.map(row => {
    const state = rowState(ctx, row);
    return {
      actor: targetActor(row), token: targetToken(row), name: row.name, ac: row.ac,
      hit: (state === "unknown") ? null : (state === "hit")
    };
  });
  const hits = targets.map(t => t.hit);
  const hit = (hits.length && hits.every(h => h === true)) ? true
    : (hits.length && hits.every(h => h === false)) ? false : null;
  await macro.execute({
    actor: ctx.actor, token: attackerToken(ctx), item: ctx.item, activity: ctx.activity,
    mastery: ctx.mastery, targets, message: ctx.message, hit
  });
  return true;
}

/* -------------------------------------------- */
/*  Panel                                       */
/* -------------------------------------------- */

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

function button(label, iconClass, { tooltip, disabled = false, done = false, className } = {}, onClick) {
  const node = el("button", className ? `dt-wm__btn ${className}` : "dt-wm__btn");
  node.type = "button";
  node.append(icon(done ? "fa-solid fa-check" : iconClass), el("span", null, label));
  if (done) node.classList.add("dt-wm__btn--done");
  if (tooltip) node.dataset.tooltip = tooltip;
  node.disabled = disabled;
  node.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    node.disabled = true;
    Promise.resolve()
      .then(() => onClick(event))
      .catch(err => {
        console.error(`${MODULE_ID} | weapon mastery failed`, err);
        ui.notifications.error(format("DT.WeaponMastery.Failed", { error: err?.message ?? err }));
      })
      .finally(() => { node.disabled = disabled; });
  });
  return node;
}

function masteryLabel(mastery) {
  return CONFIG.DND5E?.weaponMasteries?.[mastery]?.label ?? mastery;
}

/** dnd5e's rule link: the rule as tooltip on hover, the journal page on click. */
function ruleLink(mastery) {
  const label = masteryLabel(mastery);
  const reference = CONFIG.DND5E?.weaponMasteries?.[mastery]?.reference;
  if (!reference) return el("strong", "dt-wm__mastery", label);
  const link = el("a", "content-link dt-wm__mastery", label);
  link.draggable = true;
  Object.assign(link.dataset, { link: "", uuid: reference, tooltip: label });
  return link;
}

/** What one click does (Graze damage, Topple DC) — shown in tooltips and the tray header. */
function actionDetail(ctx) {
  if (ctx.mastery === "graze") {
    const { value, type } = grazeDamage(ctx);
    return format("DT.WeaponMastery.Detail.Graze", { damage: value, type: CONFIG.DND5E?.damageTypes?.[type]?.label ?? type ?? "" });
  }
  if (ctx.mastery === "topple") return format("DT.WeaponMastery.Detail.Topple", { dc: toppleDC(ctx) });
  return "";
}

function useButton(ctx, refresh) {
  const rule = RULES[ctx.mastery];
  const label = masteryLabel(ctx.mastery);
  const detail = actionDetail(ctx);
  let tooltip;
  if (game.user.isGM) tooltip = format("DT.WeaponMastery.Use.GM", { mastery: label });
  else if (mayApplyLocally(ctx, ctx.targets)) tooltip = format("DT.WeaponMastery.Use.Self", { mastery: label });
  else tooltip = format("DT.WeaponMastery.Use.Request", { mastery: label });
  if (detail) tooltip = `${tooltip} (${detail})`;
  const done = anyDone(ctx);
  if (done) tooltip = `${localize("DT.WeaponMastery.AlreadyApplied")} ${tooltip}`;
  return button(label, rule.icon, { tooltip, done, className: "dt-wm__use" }, async event => {
    if ((await useMastery(ctx, event)) && game.user.isGM) refresh();
  });
}

const STATE_ICONS = { hit: "fa-solid fa-check", miss: "fa-solid fa-xmark", unknown: "fa-solid fa-question" };
const STATE_TOOLTIPS = {
  hit: "DT.WeaponMastery.State.Hit", miss: "DT.WeaponMastery.State.Miss", unknown: "DT.WeaponMastery.State.Unknown"
};

function targetRow(ctx, row, refresh) {
  const state = rowState(ctx, row);
  const li = el("li", `target dt-wm__target ${state}`);
  li.dataset.state = state;

  const toggle = el("button", "dt-wm__state");
  toggle.type = "button";
  toggle.append(icon(STATE_ICONS[state]));
  toggle.dataset.tooltip = `${localize(STATE_TOOLTIPS[state])} — ${localize("DT.WeaponMastery.State.Toggle")}`;
  toggle.ariaLabel = toggle.dataset.tooltip;
  toggle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    overrides.set(`${ctx.message.id}:${row.key}`, state !== "hit");
    refresh();
  });
  li.append(toggle, el("span", "name dt-wm__name", row.name));

  if (!applies(ctx.mastery, state)) {
    li.append(el("span", "dt-wm__na", localize((state === "hit") ? "DT.WeaponMastery.NotOn.Hit" : "DT.WeaponMastery.NotOn.Miss")));
    return li;
  }
  let disabled = false;
  let tooltip = actionDetail(ctx) || format("DT.WeaponMastery.Use.GM", { mastery: masteryLabel(ctx.mastery) });
  if ((ctx.mastery === "graze") && (grazeDamage(ctx).value <= 0)) {
    disabled = true;
    tooltip = localize("DT.WeaponMastery.GrazeNoDamage");
  }
  if ((ctx.mastery === "push") && tooLargeToPush(targetActor(row))) {
    disabled = true;
    tooltip = format("DT.WeaponMastery.PushTooLarge", { target: row.name });
  }
  const done = isDone(ctx, row);
  if (done) tooltip = `${localize("DT.WeaponMastery.AlreadyApplied")} ${tooltip}`;
  li.append(button(localize("DT.WeaponMastery.Apply"), RULES[ctx.mastery].icon, { tooltip, disabled, done },
    async event => {
      if (await applyRows(ctx, [row], { event })) refresh();
    }));
  return li;
}

/** The GM's tray, in dnd5e's own `.card-tray.collapsible` markup so it looks and folds natively. */
function buildTray(ctx, refresh) {
  const state = trayState(ctx);
  const tray = el("div", "card-tray dt-wm__tray collapsible");
  if (!state.open) tray.classList.add("collapsed");
  // dnd5e's chat listener toggles `.collapsed` on header clicks; doing it here keeps our state.
  tray.addEventListener("click", event => {
    if (event.target.closest?.(".collapsible-content")) return;
    event.preventDefault();
    event.stopPropagation();
    tray.classList.toggle("collapsed");
    state.open = !tray.classList.contains("collapsed");
  });
  const detail = actionDetail(ctx);
  const label = el("label", "roboto-upper");
  label.append(icon("fa-solid fa-medal"),
    el("span", null, format("DT.WeaponMastery.Tray", { mastery: detail ? `${masteryLabel(ctx.mastery)} · ${detail}` : masteryLabel(ctx.mastery) })),
    icon("fa-solid fa-caret-down"));

  const content = el("div", "collapsible-content");
  const wrapper = el("div", "wrapper");
  const source = el("section", "icon-row dt-wm__source-row");
  const selected = state.mode === "selected";
  const toggle = el("button", "dt-wm__source");
  toggle.type = "button";
  toggle.dataset.mode = state.mode;
  toggle.append(icon(selected ? "fa-solid fa-expand" : "fa-solid fa-bullseye"));
  toggle.dataset.tooltip = localize(selected ? "DT.WeaponMastery.Mode.Selected" : "DT.WeaponMastery.Mode.Targeted");
  toggle.ariaLabel = toggle.dataset.tooltip;
  toggle.disabled = !ctx.targets.length;
  toggle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    state.mode = selected ? "targeted" : "selected";
    refresh();
  });
  const list = el("ul", "unlist evaluation dt-wm__targets");
  const rows = trayRows(ctx);
  for (const row of rows) list.append(targetRow(ctx, row, refresh));
  if (!rows.length) list.append(el("li", "dt-wm__none", localize(selected ? "DT.WeaponMastery.NoTokens" : "DT.WeaponMastery.NoTargets")));
  source.append(toggle, el("span", "dt-wm__source-label",
    localize(selected ? "DT.WeaponMastery.Mode.SelectedShort" : "DT.WeaponMastery.Mode.TargetedShort")));
  wrapper.append(source, list);
  content.append(wrapper);
  tray.append(label, content);
  return tray;
}

/** Panels showing selected tokens → their refresh, re-run when the selection changes. */
const selectedPanels = new Map();
let selectionTimer = null;

function onControlToken() {
  if (!selectedPanels.size) return;
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    for (const [box, refresh] of [...selectedPanels]) {
      selectedPanels.delete(box);
      if (box.isConnected !== false) refresh();
    }
  }, 50);
}

function buildPanel(ctx) {
  const box = el("div", "dt-wm");
  box.dataset.mastery = ctx.mastery;
  const refresh = () => {
    selectedPanels.delete(box);
    box.replaceWith(buildPanel(ctx));
  };

  // One line: "Weapon Mastery:" + rule link + the mastery button (+ macro).
  const line = el("div", "dt-wm__line");
  line.append(el("strong", "dt-wm__title", localize("DT.WeaponMastery.Title")), ruleLink(ctx.mastery));
  if (RULES[ctx.mastery]) line.append(useButton(ctx, refresh));
  if (macroRef(ctx.mastery) && (game.user.isGM || ctx.actor?.isOwner)) {
    line.append(button(localize("DT.WeaponMastery.Macro"), "fa-solid fa-code",
      { tooltip: format("DT.WeaponMastery.MacroHint", { macro: macroRef(ctx.mastery) }), className: "dt-wm__macro" },
      () => runMacro(ctx)));
  }
  box.append(line);

  if (game.user.isGM && RULES[ctx.mastery]) {
    box.append(buildTray(ctx, refresh));
    if (trayState(ctx).mode === "selected") selectedPanels.set(box, refresh);
  }
  return box;
}

/* -------------------------------------------- */
/*  Chat cards                                  */
/* -------------------------------------------- */

function insertPanel(container, message) {
  if (!container || container.querySelector(":scope > .dt-wm")) return;
  if (message.isContentVisible === false) return;
  const ctx = attackContext(message);
  if (ctx) container.append(buildPanel(ctx));
}

/** Topple request card: a save button for the target's owners. */
function decorateSaveRequest(message, root) {
  const request = message.flags[MODULE_ID][FLAG_SAVE];
  const content = root.querySelector(".message-content") ?? root;
  if (content.querySelector(".dt-wm-save")) return;
  const actor = resolve(request.actor);
  if (!actor?.isOwner) return;
  const box = el("div", "dt-wm dt-wm-save");
  const ability = CONFIG.DND5E?.abilities?.[request.ability]?.label ?? request.ability;
  box.append(button(format("DT.WeaponMastery.SaveButton", { ability, dc: request.dc }), "fa-solid fa-shield-halved",
    {}, event => rollToppleSave(actor, request.dc, { event })));
  content.append(box);
}

function onRenderChatMessage(message, html) {
  try {
    if (!enabled()) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    if (message?.flags?.[MODULE_ID]?.[FLAG_SAVE]) return decorateSaveRequest(message, root);
    // RSReforged's hidden child card is represented by its section in the usage card.
    if (!shownByRsr(message)) insertPanel(root.querySelector(".message-content") ?? root, message);
    watchRsrSections(root, RSR_SECTION, insertPanel);
  } catch (err) {
    console.error(`${MODULE_ID} | weapon mastery (chat card) failed`, err);
  }
}

/* -------------------------------------------- */
/*  Sap & Vex on the next attack                */
/* -------------------------------------------- */

/** Before an attack: Sap (5.x; 6.x uses dnd5e's rule) and Vex grant (dis)advantage, marked for removal. */
function onPreRollAttack(config) {
  try {
    if (!enabled()) return;
    const actor = config?.subject?.actor;
    if (!actor?.effects) return;
    const mine = actor.effects.filter(e => e.active && effectInfo(e));
    if (!mine.length) return;
    const targets = Array.from(game.user?.targets ?? []);
    const target = (targets.length === 1) ? targets[0].actor?.uuid : null;
    const consume = [];
    for (const effect of mine) {
      const info = effectInfo(effect);
      if (info.mastery === "sap") {
        if (!hasRules()) config.disadvantage = true;
        consume.push(effect.id);
      } else if ((info.mastery === "vex") && target && (info.target === target)) {
        config.advantage = true;
        consume.push(effect.id);
      }
    }
    const options = config.rolls?.[0]?.options;
    if (!consume.length || !options) return;
    options[ROLL_OPTION] = { ...(options[ROLL_OPTION] ?? {}), weaponMasteryConsume: consume };
  } catch (err) {
    console.error(`${MODULE_ID} | weapon mastery (attack roll) failed`, err);
  }
}

/** After the attack was rolled: remove the Sap/Vex effects it used up. */
function onRollAttack(rolls, { subject } = {}) {
  const ids = rolls?.[0]?.options?.[ROLL_OPTION]?.weaponMasteryConsume;
  const actor = subject?.actor;
  if (!ids?.length || !actor?.isOwner) return;
  const existing = ids.filter(id => actor.effects.get(id));
  if (!existing.length) return;
  actor.deleteEmbeddedDocuments("ActiveEffect", existing)
    .catch(err => console.warn(`${MODULE_ID} | weapon mastery: could not remove used effects`, err));
}

/** Core marks expired effects instead of deleting them — delete ours (active GM only). */
function onUpdateActiveEffect(effect, changed) {
  if ((changed?.duration?.expired !== true) || !effectInfo(effect) || !game.users.activeGM?.isSelf) return;
  effect.delete().catch(err => console.warn(`${MODULE_ID} | weapon mastery: could not remove an expired effect`, err));
}

/* -------------------------------------------- */

/** For tools/test-features.mjs only. */
export const internals = {
  attackContext, isAttackMessage, rowState, trueState, applies, mayApplyLocally, toppleDC, grazeDamage,
  tooLargeToPush, untilAttackersTurn, sapEffect, slowEffect, vexEffect, applyRows, useMastery, runMacro,
  rollToppleSave, pushDestination, pushDistance, buildPanel, overrides, trays
};

const macroSetting = mastery => ({
  key: MACRO_SETTINGS[mastery],
  options: {
    name: MACRO_NAMES[mastery],
    hint: "DT.Settings.WeaponMasteryMacro.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  }
});

export default {
  id: FEATURE_ID,
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.WeaponMastery.Label",
    hint: "DT.Categories.WeaponMastery.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.WeaponMasteryEnabled.Name",
        hint: "DT.Settings.WeaponMasteryEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    ...Object.keys(MACRO_SETTINGS).map(macroSetting)
  ],
  init() {
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
    Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
    Hooks.on("dnd5e.rollAttack", onRollAttack);
    Hooks.on("updateActiveEffect", onUpdateActiveEffect);
    Hooks.on("controlToken", onControlToken);
    onSocketMessage(FEATURE_ID, onSocketRequest);
  }
};

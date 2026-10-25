/**
 * Feature: Weapon Mastery (dnd5e)
 * -------------------------------
 * Foundry VTT v14+ · dnd5e 5.3.x and 6.x
 *
 * dnd5e lets a character pick a weapon mastery for an attack and remembers it on the attack
 * roll (`rolls[0].options.mastery`, also `message.system.mastery` in 6.x and
 * `flags.dnd5e.roll.mastery` in 5.x), but automates none of them. This feature adds a panel
 * to every attack card that carries a mastery: the mastery with its rule link, the targets
 * with their hit/miss and one button per target for what the mastery does:
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
 *   - Cleave / Nick: rule reminder only.
 * Plus an optional macro per mastery (world setting) that gets
 * `{actor, token, item, activity, mastery, targets, message, hit}`.
 *
 * Hit or miss comes from dnd5e's own data: the AC snapshot of each recorded target (see
 * lib/attack-roll.js). Without a known AC every button is shown and the GM decides; the GM
 * can also flip a target between hit and miss on the card (e.g. after a Shield spell).
 *
 * Rights: a button is only shown to users who may change the documents it touches — the GM,
 * or the owner (attacker for Vex, target for the rest). Everyone else sees a hint.
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
 * itself, so the panel is also placed into those sections.
 */

import { MODULE_ID } from "../constants.js";
import { hitAgainst } from "../lib/attack-roll.js";
import { watchRsrSections } from "../lib/rsr-sections.js";

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

/** When each mastery applies ("hit"/"miss"; null = reminder only) and its rule hint. */
const RULES = {
  cleave: { on: null, hint: "DT.WeaponMastery.Hint.Cleave" },
  graze: { on: "miss", hint: "DT.WeaponMastery.Hint.Graze", icon: "fa-solid fa-droplet" },
  nick: { on: null, hint: "DT.WeaponMastery.Hint.Nick" },
  push: { on: "hit", hint: "DT.WeaponMastery.Hint.Push", icon: "fa-solid fa-angles-right" },
  sap: { on: "hit", hint: "DT.WeaponMastery.Hint.Sap", icon: "fa-solid fa-arrow-trend-down" },
  slow: { on: "hit", hint: "DT.WeaponMastery.Hint.Slow", icon: "fa-solid fa-person-walking" },
  topple: { on: "hit", hint: "DT.WeaponMastery.Hint.Topple", icon: "fa-solid fa-person-falling" },
  vex: { on: "hit", hint: "DT.WeaponMastery.Hint.Vex", icon: "fa-solid fa-crosshairs" }
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

/* -------------------------------------------- */
/*  Reading the attack                          */
/* -------------------------------------------- */

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
 * Everything the panel needs from an attack message, or null if it carries no mastery.
 * dnd5e records a mastery only when the attacker has the weapon's mastery (characters; NPCs
 * have no weapon masteries in dnd5e) — no mastery, no panel.
 * @returns {{message, mastery, roll, actor, item, activity, ability, targets: object[]}|null}
 */
function attackContext(message) {
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

/** Rows for the user's current targets — used when the attack recorded none. */
function currentTargetRows() {
  return Array.from(game.user?.targets ?? []).filter(t => t.actor).map(t => ({
    key: null, name: t.name ?? t.document?.name ?? "", ac: null,
    actorUuid: t.actor.uuid, tokenUuid: t.document?.uuid ?? null, hit: null
  }));
}

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
/*  Hit / miss shown on the card                */
/* -------------------------------------------- */

/** "<message id>:<row key>" → true/false, the GM's correction for this session. */
const overrides = new Map();

function rowState(ctx, row) {
  const override = overrides.get(`${ctx.message.id}:${row.key}`);
  const hit = (override !== undefined) ? override : row.hit;
  if ((hit === null) || (hit === undefined) || !resultsVisible()) return "unknown";
  return hit ? "hit" : "miss";
}

/** dnd5e's "Attack Roll Visibility": players may not be allowed to see hits and misses. */
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

/** May the current user use this mastery on this row? (current-targets rows: checked on click) */
function mayAct(ctx, row) {
  if (game.user.isGM) return true;
  if (ctx.mastery === "vex") return !!ctx.actor?.isOwner;
  if (row.key === null) return false;
  if (ctx.mastery === "push") return !!targetToken(row)?.document?.isOwner;
  if (ctx.mastery === "topple") return !!targetActor(row)?.isOwner;
  return !!targetActor(row)?.isOwner;
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
    description: localize("DT.WeaponMastery.Hint.Sap"),
    changes: hasRules() ? [{ key: "attack", type: "dnd5e.advantage", value: "-1" }] : [],
    edge: "start"
  });
}

function slowEffect(ctx, actor) {
  const reduction = (actor?.system?.attributes?.movement?.units === "m") ? 3 : 10;
  return effectData(ctx, "slow", {
    name: format("DT.WeaponMastery.Effect.Slow", { attacker: ctx.actor?.name ?? "" }),
    img: "icons/svg/net.svg",
    description: localize("DT.WeaponMastery.Hint.Slow"),
    changes: [{ key: "system.attributes.movement.bonus", type: "add", value: `-${reduction}` }],
    edge: "start"
  });
}

function vexEffect(ctx, row, target) {
  return effectData(ctx, "vex", {
    name: format("DT.WeaponMastery.Effect.Vex", { target: row.name || target?.name || "" }),
    img: "icons/svg/target.svg",
    description: localize("DT.WeaponMastery.Hint.Vex"),
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
async function rollToppleSave(actor, dc, event) {
  const rolls = await actor.rollSavingThrow({ ability: "con", target: dc, event });
  const roll = rolls?.[0];
  if (!roll) return false;
  const saved = (typeof roll.isSuccess === "boolean") ? roll.isSuccess : (roll.total >= dc);
  if (!saved) await actor.toggleStatusEffect("prone", { active: true });
  return true;
}

async function applyTopple(ctx, row, event) {
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
  return rollToppleSave(actor, dc, event);
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

/** Run the mastery on a row (or on the user's current targets) and remember it on the card. */
async function runAction(ctx, row, event) {
  const rows = (row.key === null) ? currentTargetRows() : [row];
  if (!rows.length) return warn("DT.WeaponMastery.NoTargets");
  let result = false;
  for (const r of rows) result = (await ACTIONS[ctx.mastery](ctx, r, event)) || result;
  if (result && (row.key !== null) && ctx.message.canUserModify?.(game.user, "update")) {
    await ctx.message.setFlag(MODULE_ID, `${FLAG_DONE}.done.${row.key}.${ctx.mastery}`, result);
  }
  return result;
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

function button(label, iconClass, { tooltip, disabled = false, done = false } = {}, onClick) {
  const node = el("button", "dt-wm__btn");
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

function ruleLink(mastery) {
  const label = masteryLabel(mastery);
  const reference = CONFIG.DND5E?.weaponMasteries?.[mastery]?.reference;
  if (!reference) return el("strong", "dt-wm__mastery", label);
  const link = el("a", "content-link dt-wm__mastery", label);
  link.draggable = true;
  Object.assign(link.dataset, { link: "", uuid: reference, tooltip: label });
  return link;
}

function hintText(ctx) {
  const key = RULES[ctx.mastery]?.hint;
  if (!key) return "";
  if (ctx.mastery === "graze") {
    const { value, type } = grazeDamage(ctx);
    const damageType = CONFIG.DND5E?.damageTypes?.[type]?.label ?? type ?? "";
    const ability = CONFIG.DND5E?.abilities?.[ctx.ability]?.label ?? ctx.ability ?? "";
    return format("DT.WeaponMastery.Hint.GrazeAmount", { damage: value, type: damageType, ability });
  }
  if (ctx.mastery === "topple") return format("DT.WeaponMastery.Hint.ToppleDC", { dc: toppleDC(ctx) });
  return localize(key);
}

function actionLabel(ctx) {
  switch (ctx.mastery) {
    case "graze": {
      const { value, type } = grazeDamage(ctx);
      return format("DT.WeaponMastery.Button.Graze", { damage: value, type: CONFIG.DND5E?.damageTypes?.[type]?.label ?? type ?? "" });
    }
    case "topple": return format("DT.WeaponMastery.Button.Topple", { dc: toppleDC(ctx) });
    case "push": return localize("DT.WeaponMastery.Button.Push");
    case "sap": return localize("DT.WeaponMastery.Button.Sap");
    case "slow": return localize("DT.WeaponMastery.Button.Slow");
    case "vex": return localize("DT.WeaponMastery.Button.Vex");
    default: return masteryLabel(ctx.mastery);
  }
}

const STATE_ICONS = { hit: "fa-solid fa-check", miss: "fa-solid fa-xmark", unknown: "fa-solid fa-question" };
const STATE_TOOLTIPS = {
  hit: "DT.WeaponMastery.State.Hit", miss: "DT.WeaponMastery.State.Miss", unknown: "DT.WeaponMastery.State.Unknown"
};

function isDone(ctx, row) {
  if (row.key === null) return false;
  return !!ctx.message.flags?.[MODULE_ID]?.[FLAG_DONE]?.done?.[row.key]?.[ctx.mastery];
}

function targetRow(ctx, row, rerender) {
  const state = (row.key === null) ? "unknown" : rowState(ctx, row);
  const li = el("li", "dt-wm__target");
  li.dataset.state = state;

  // Status: the GM may switch a target between hit and miss.
  const tooltip = localize(STATE_TOOLTIPS[state]);
  if (game.user.isGM && (row.key !== null)) {
    const toggle = el("button", "dt-wm__state");
    toggle.type = "button";
    toggle.append(icon(STATE_ICONS[state]));
    toggle.dataset.tooltip = `${tooltip} — ${localize("DT.WeaponMastery.State.Toggle")}`;
    toggle.ariaLabel = toggle.dataset.tooltip;
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      overrides.set(`${ctx.message.id}:${row.key}`, state !== "hit");
      rerender();
    });
    li.append(toggle);
  } else {
    const status = el("span", "dt-wm__state");
    status.append(icon(STATE_ICONS[state]));
    status.dataset.tooltip = tooltip;
    li.append(status);
  }
  li.append(el("span", "dt-wm__name", row.name || localize("DT.WeaponMastery.CurrentTargets")));

  if (!applies(ctx.mastery, state)) {
    li.append(el("span", "dt-wm__na", localize((state === "hit") ? "DT.WeaponMastery.NotOn.Hit" : "DT.WeaponMastery.NotOn.Miss")));
    return { li, acted: false };
  }
  if (!mayAct(ctx, row)) return { li, acted: false };

  let disabled = false;
  let hint = localize(RULES[ctx.mastery].hint);
  if ((ctx.mastery === "graze") && (grazeDamage(ctx).value <= 0)) {
    disabled = true;
    hint = localize("DT.WeaponMastery.GrazeNoDamage");
  }
  if ((ctx.mastery === "push") && (row.key !== null) && tooLargeToPush(targetActor(row))) {
    disabled = true;
    hint = format("DT.WeaponMastery.PushTooLarge", { target: row.name });
  }
  const done = isDone(ctx, row);
  if (done) hint = `${localize("DT.WeaponMastery.AlreadyApplied")} ${hint}`;
  li.append(button(actionLabel(ctx), RULES[ctx.mastery].icon, { tooltip: hint, disabled, done },
    event => runAction(ctx, row, event)));
  return { li, acted: true };
}

/** Open the mastery's rule page (dnd5e's journal reference). */
async function openRule(mastery) {
  const reference = CONFIG.DND5E?.weaponMasteries?.[mastery]?.reference;
  const page = reference ? await fromUuid(reference) : null;
  if (page?.parent?.sheet) return page.parent.sheet.render(true, { pageId: page.id });
  return page?.sheet?.render(true);
}

function buildPanel(ctx) {
  const box = el("div", "dt-wm");
  box.dataset.mastery = ctx.mastery;
  const rerender = () => box.replaceWith(buildPanel(ctx));

  const header = el("div", "dt-wm__header");
  header.append(icon("fa-solid fa-medal"), el("span", "dt-wm__title", localize("DT.WeaponMastery.Title")), ruleLink(ctx.mastery));
  // Every mastery — also Cleave and Nick, which nothing automates — gets its rule as a button.
  const rule = button(localize("DT.WeaponMastery.HintButton"), "fa-solid fa-circle-info",
    { tooltip: localize(RULES[ctx.mastery]?.hint ?? "") }, () => openRule(ctx.mastery));
  rule.classList.add("dt-wm__rule");
  header.append(rule);
  if (macroRef(ctx.mastery) && (game.user.isGM || ctx.actor?.isOwner)) {
    header.append(button(localize("DT.WeaponMastery.Macro"), "fa-solid fa-code",
      { tooltip: format("DT.WeaponMastery.MacroHint", { macro: macroRef(ctx.mastery) }) }, () => runMacro(ctx)));
  }
  box.append(header);

  const hint = hintText(ctx);
  if (hint) box.append(el("p", "dt-wm__hint", hint));

  if (RULES[ctx.mastery]?.on) {
    const list = el("ul", "dt-wm__targets");
    let acted = false;
    const rows = ctx.targets.length ? ctx.targets
      : [{ key: null, name: localize("DT.WeaponMastery.CurrentTargets"), ac: null, actorUuid: null, tokenUuid: null, hit: null }];
    for (const row of rows) {
      const result = targetRow(ctx, row, rerender);
      acted ||= result.acted;
      list.append(result.li);
    }
    box.append(list);
    if (!acted && !game.user.isGM) box.append(el("p", "dt-wm__note", localize("DT.WeaponMastery.GMDecides")));
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
    { tooltip: localize("DT.WeaponMastery.Hint.Topple") }, event => rollToppleSave(actor, request.dc, event)));
  content.append(box);
}

function onRenderChatMessage(message, html) {
  try {
    if (!enabled()) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    if (message?.flags?.[MODULE_ID]?.[FLAG_SAVE]) return decorateSaveRequest(message, root);
    insertPanel(root.querySelector(".message-content") ?? root, message);
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
  attackContext, rowState, applies, mayAct, toppleDC, grazeDamage, tooLargeToPush, untilAttackersTurn,
  sapEffect, slowEffect, vexEffect, runAction, runMacro, rollToppleSave, pushDestination, pushDistance,
  buildPanel, overrides
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
  id: "weaponMastery",
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
  }
};

/**
 * Feature: Savage Attacker (dnd5e)
 * --------------------------------
 * Foundry VTT v14+ · dnd5e 5.3.x and 6.x
 *
 * The 2024 feat (PHB, identifier `savage-attacker`) is description-only in Foundry: "once per
 * turn when you hit a target with a weapon, you can roll the weapon's damage dice twice and use
 * either roll against the target." dnd5e 6's rule-type Active Effects only cover d20 rolls and
 * attack/check/save bonuses, so nothing in the system can express it.
 *
 * Two ways, chosen by the GM (world setting, off by default):
 *   - Automatic: the first weapon damage roll of the turn whose attack was not a known miss rolls
 *     the weapon dice twice and keeps the higher total — the dice term becomes the pool
 *     `{XdY,XdY}kh` before the roll is evaluated, so Dice So Nice shows both sets and the roll
 *     tooltip shows the discarded one. Every other qualifying damage card gets the button below.
 *   - Button only: every qualifying damage card gets a button; nothing happens automatically.
 * The button re-rolls the weapon dice of that card and keeps the higher result (the card's
 * roll is replaced, so dnd5e's damage tray applies the new total). It is shown to the GM and
 * the actor's owners and stays usable after the turn's use — "first hit" is often a judgement
 * call, the GM decides. It notes when the feat was already used this turn.
 *
 * "Once per turn" counts every creature's turn of the running combat (round + turn), so an
 * opportunity attack on someone else's turn qualifies again, the second attack of the own turn
 * (Extra Attack) does not. Outside combat every roll qualifies. A known miss (exactly one
 * target with a known AC — dnd5e stores it as the attack roll's `options.target`) does not use
 * the turn's chance; with several or no targets the hit is unknown and the roll counts as one.
 *
 * Which dice: dnd5e marks the weapon's own damage part `base` in the roll configuration (5.3.3
 * and 6.0.6); its first dice term already includes the critical doubling, which both versions
 * apply in the DamageRoll constructor or the damage dialog — i.e. before
 * `dnd5e.postDamageRollConfiguration` — so `{2d8,2d8}kh` on a crit is the rule-accurate "roll
 * the (doubled) weapon dice twice". Unarmed Strikes are not weapons in the 2024 rules.
 *
 * Hooks: dnd5e.rollAttack (remember hit/miss per actor + activity), dnd5e.post
 * DamageRollConfiguration (automatic pool + mark the card), dnd5e.renderChatMessage (button or
 * result note). Marks live in the roll's options, so they survive modules that put dnd5e's
 * rolls into their own cards (RSReforged).
 */

import { MODULE_ID } from "../constants.js";
import { hitAgainst } from "../lib/attack-roll.js";

const KEY_MODE = "savageAttackerMode";

/** roll.options[MODULE_ID] = { savage: "auto" | "available" | "rerolled", actor, before?, after? } */
const ROLL_OPTION = MODULE_ID;
/** Actor flag: turn key of the last use. */
const FLAG_TURN = "savageAttackerTurn";
const FEAT_IDENTIFIER = "savage-attacker";
/** How long an attack roll's hit/miss is remembered for the damage roll that follows it. */
const ATTACK_MEMORY_MS = 2 * 60 * 1000;

const mode = () => game.settings.get(MODULE_ID, KEY_MODE) ?? "off";
const localize = key => game.i18n.localize(key);

/* -------------------------------------------- */
/*  Eligibility                                 */
/* -------------------------------------------- */

function hasSavageAttacker(actor) {
  return !!actor?.items?.some(i => (i.type === "feat")
    && ((i.system?.identifier === FEAT_IDENTIFIER) || (i.name?.trim().toLowerCase() === "savage attacker")));
}

/** An attack with a weapon — not an Unarmed Strike, which the 2024 rules don't count as a weapon. */
function isWeaponAttack(activity) {
  const item = activity?.item;
  return (activity?.type === "attack") && (item?.type === "weapon")
    && (item.system?.identifier !== "unarmed-strike");
}

/* -------------------------------------------- */
/*  Once per turn                               */
/* -------------------------------------------- */

/** "<combat>:<round>:<turn>" of the running combat, null outside combat. */
function turnKey(combat = game.combat) {
  if (!combat?.started) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

/** actor id → turn key, for uses whose flag update hasn't landed yet. */
const usedLocally = new Map();

function usedThisTurn(actor, key = turnKey()) {
  if (!key || !actor) return false;
  return (usedLocally.get(actor.id) === key) || (actor.getFlag?.(MODULE_ID, FLAG_TURN) === key);
}

function markUsed(actor, key = turnKey()) {
  if (!key || !actor) return;
  usedLocally.set(actor.id, key);
  if (actor.isOwner) {
    actor.setFlag(MODULE_ID, FLAG_TURN, key)
      .catch(err => console.warn(`${MODULE_ID} | savage attacker: could not store the turn`, err));
  }
}

/* -------------------------------------------- */
/*  Hit or miss                                 */
/* -------------------------------------------- */

/** `${actorId}.${activityId}` → { hit: true | false | null, at } */
const attacks = new Map();

/** true/false when the attack had exactly one target with a known AC, else null. */
function attackHit(roll) {
  return hitAgainst(roll, roll?.options?.target);
}

function onRollAttack(rolls, { subject } = {}) {
  const actor = subject?.actor;
  if (!rolls?.[0] || !actor || !subject.id) return;
  attacks.set(`${actor.id}.${subject.id}`, { hit: attackHit(rolls[0]), at: Date.now() });
}

function lastAttack(actor, activity) {
  const entry = attacks.get(`${actor.id}.${activity.id}`);
  return (entry && ((Date.now() - entry.at) <= ATTACK_MEMORY_MS)) ? entry : null;
}

/* -------------------------------------------- */
/*  Dice                                        */
/* -------------------------------------------- */

const isDice = term => term instanceof foundry.dice.terms.DiceTerm;
const isPool = term => term instanceof foundry.dice.terms.PoolTerm;
const firstDice = roll => roll.terms.findIndex(isDice);

/** Index of the weapon's own damage roll: dnd5e marks its configuration `base`. */
function baseIndex(config) {
  const index = config?.rolls?.findIndex(r => r?.base) ?? -1;
  return (index >= 0) ? index : 0;
}

/** Turn the weapon dice into `{XdY,XdY}kh` — rolled twice, the higher total counts. */
function applyPool(roll) {
  const index = firstDice(roll);
  if (index < 0) return false;
  const term = roll.terms[index];
  const [pool] = new foundry.dice.Roll(`{${term.formula},${term.formula}}kh`).terms;
  if (!isPool(pool)) return false;
  Object.assign(pool.options, term.options);
  roll.terms.splice(index, 1, pool);
  roll.resetFormula();
  return true;
}

/** Totals of a pool made by applyPool: [first, second]. */
function poolTotals(roll) {
  const pool = roll.terms.find(isPool);
  return pool?.rolls?.map(r => r.total) ?? [];
}

/* -------------------------------------------- */
/*  Automatic                                   */
/* -------------------------------------------- */

function onPostDamageRollConfiguration(rolls, config) {
  try {
    const current = mode();
    if (current === "off") return;
    const activity = config?.subject;
    const actor = activity?.actor;
    if (config?.isHealing || !isWeaponAttack(activity) || !hasSavageAttacker(actor)) return;
    const roll = rolls?.[baseIndex(config)];
    if (!roll?.terms) return;

    let applied = false;
    if ((current === "auto") && !usedThisTurn(actor) && (lastAttack(actor, activity)?.hit !== false)) {
      applied = applyPool(roll);
      if (applied) markUsed(actor);
    }
    roll.options[ROLL_OPTION] = { savage: applied ? "auto" : "available", actor: actor.uuid };
  } catch (err) {
    console.error(`${MODULE_ID} | savage attacker failed`, err);
  }
}

/* -------------------------------------------- */
/*  Button                                      */
/* -------------------------------------------- */

/**
 * Re-roll the weapon dice of the marked roll and keep the higher result.
 * @returns {{before: number, after: number}|null}
 */
async function rerollOnMessage(message, index) {
  if (!message.canUserModify(game.user, "update")) {
    ui.notifications.warn(localize("DT.SavageAttacker.NoPermission"));
    return null;
  }
  const rolls = [...message.rolls];
  const roll = rolls[index];
  const info = roll?.options?.[ROLL_OPTION];
  const ti = roll ? firstDice(roll) : -1;
  if (!info || (ti < 0)) return null;

  // Only a term that adds to the total can simply be swapped (not "2 * 1d8" or "- 1d8").
  const prev = roll.terms[ti - 1];
  const next = roll.terms[ti + 1];
  if ((prev && (prev.operator !== "+")) || (next && !["+", "-"].includes(next.operator))) {
    ui.notifications.warn(localize("DT.SavageAttacker.NotAdditive"));
    return null;
  }

  const term = roll.terms[ti];
  const again = await new foundry.dice.Roll(term.formula).evaluate();
  await game.dice3d?.showForRoll?.(again, game.user, true);
  const before = term.total;
  const after = again.total;

  const data = roll.toJSON();
  if (after > before) {
    data.terms[ti] = { ...again.terms[0].toJSON(), options: { ...term.options } };
    data.total = roll.total - before + after;
  }
  data.options = { ...data.options, [ROLL_OPTION]: { ...info, savage: "rerolled", before, after } };
  rolls[index] = roll.constructor.fromData(data);
  await message.update({ rolls: rolls.map(r => JSON.stringify(r)) });

  const actor = fromUuidSync(info.actor);
  if (actor) markUsed(actor);
  return { before, after };
}

function resultText(roll, info) {
  const [first, second] = (info.savage === "auto") ? poolTotals(roll) : [info.before, info.after];
  if (!Number.isFinite(first) || !Number.isFinite(second)) return localize("DT.SavageAttacker.Applied");
  return game.i18n.format("DT.SavageAttacker.Result", { first, second, kept: Math.max(first, second) });
}

function onRenderChatMessage(message, html) {
  try {
    if (mode() === "off") return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".dt-savage")) return;
    const index = message?.rolls?.findIndex(r => r?.options?.[ROLL_OPTION]?.savage) ?? -1;
    if (index < 0) return;
    const roll = message.rolls[index];
    const info = roll.options[ROLL_OPTION];
    const actor = fromUuidSync(info.actor);

    const box = document.createElement("div");
    box.classList.add("dt-savage");
    if (info.savage === "available") {
      if (!(game.user.isGM || actor?.isOwner)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("dt-savage__button");
      const icon = document.createElement("i");
      icon.classList.add("fa-solid", "fa-dice");
      icon.inert = true;
      const label = document.createElement("span");
      label.textContent = localize("DT.SavageAttacker.Button");
      button.append(icon, label);
      button.dataset.tooltip = localize("DT.SavageAttacker.ButtonHint");
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        rerollOnMessage(message, index).finally(() => { button.disabled = false; });
      });
      box.append(button);
      if (actor && usedThisTurn(actor)) {
        const note = document.createElement("span");
        note.classList.add("dt-savage__used");
        note.textContent = localize("DT.SavageAttacker.UsedThisTurn");
        box.append(note);
      }
    } else {
      const icon = document.createElement("i");
      icon.classList.add("fa-solid", "fa-dice");
      icon.inert = true;
      const text = document.createElement("span");
      text.textContent = resultText(roll, info);
      box.append(icon, text);
    }
    (root.querySelector(".message-content") ?? root).append(box);
  } catch (err) {
    console.error(`${MODULE_ID} | savage attacker (chat card) failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = {
  turnKey, usedThisTurn, attackHit, applyPool, rerollOnMessage,
  reset() { usedLocally.clear(); attacks.clear(); }
};

export default {
  id: "savageAttacker",
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.SavageAttacker.Label",
    hint: "DT.Categories.SavageAttacker.Hint"
  },
  settings: [
    {
      key: KEY_MODE,
      options: {
        name: "DT.Settings.SavageAttackerMode.Name",
        hint: "DT.Settings.SavageAttackerMode.Hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
          off: "DT.Settings.SavageAttackerMode.Off",
          auto: "DT.Settings.SavageAttackerMode.Auto",
          button: "DT.Settings.SavageAttackerMode.Button"
        },
        default: "off"
      }
    }
  ],
  init() {
    Hooks.on("dnd5e.rollAttack", onRollAttack);
    Hooks.on("dnd5e.postDamageRollConfiguration", onPostDamageRollConfiguration);
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  }
};

/**
 * Feature: Spell Effect Auto-Apply (dnd5e)
 * ----------------------------------------
 * Foundry VTT v14+ · dnd5e 5.x and 6.x
 *
 * Some spells are, in practice, always cast on yourself — Mage Armor being the classic
 * example. dnd5e still requires someone to press "apply" on the chat card's effect tray for
 * the spell's Active Effect to land on the actor, and by default only the GM sees that tray
 * (dnd5e 5.x: GM only; dnd5e 6.x: GM, or players if the GM enables dnd5e's
 * "allowPlayerEffectsTray" setting).
 *
 * This feature removes that click for a GM-curated whitelist of spells: when a whitelisted
 * spell is cast on the caster themselves, its effect is applied automatically, the chat card
 * shows the caster as the target, and a banner reports that it was applied.
 *
 * Conditions — ALL must hold before anything is applied:
 *   1. the feature is enabled,
 *   2. the item is a spell whose name is on the whitelist (case-insensitive),
 *   3. the spell's range is "self" or "touch",
 *   4. the caster is the target — implicit for "self"; for "touch" either nothing was
 *      targeted or the caster's own actor was the only target,
 *   5. the acting user owns the actor (dnd5e refuses effect application otherwise),
 *   6. the spell offers exactly ONE effect. Multi-effect spells (e.g. variants to choose
 *      from) are left to the player — dnd5e's own tray only pre-selects one effect.
 *
 * Applying reuses dnd5e's OWN logic instead of re-implementing it: we construct its
 * <effect-application> chat-tray element (a custom element with no constructor side effects),
 * point its public `chatMessage` field at the usage message, and call
 *   - dnd5e 6.x: `_prepareEffectData(effect, actor)` — the path its Apply button uses
 *     (origin in `system.origin`, `_stats` source tracking, `getEffectStart()`, refresh
 *     instead of duplicate), then create/update the effect ourselves;
 *   - dnd5e 5.x: `_applyEffectToActor(effect, actor)`.
 * So the result is identical to pressing the button in whichever dnd5e version is installed.
 *
 * dnd5e 6.0 moved the recorded targets from `flags.dnd5e.targets` ({uuid = actor uuid}) to
 * `system.targets` ({actor, token, …}); both shapes are handled.
 *
 * Hooks: dnd5e.preUseActivity (record the caster as target), dnd5e.postUseActivity (apply;
 * fires only on the caster's client — dnd5e has no socket layer, and the caster owns the
 * actor, so exactly one client applies), dnd5e.renderChatMessage (banner).
 *
 * Both settings are world-scoped (a table-wide rule the GM sets); the feature is off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ENABLED   = "spellAutoApplyEnabled";
const KEY_WHITELIST = "spellAutoApplyWhitelist";

/** Message flag recording what this feature auto-applied, for the chat-card banner. */
const FLAG_APPLIED = "autoApplied";

/** Range units that can mean "cast on yourself". dnd5e CONFIG.DND5E.rangeTypes. */
const SELF_RANGES = new Set(["self", "touch"]);

/* -------------------------------------------- */
/*  Eligibility                                 */
/* -------------------------------------------- */

/** Parse the whitelist setting into a Set of normalised spell names. */
function whitelistedNames() {
  const raw = game.settings.get(MODULE_ID, KEY_WHITELIST) ?? "";
  return new Set(
    String(raw)
      .split(/[,;\n]/)
      .map(name => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Is this activity's item a spell whose name is on the whitelist? */
function isWhitelistedSpell(activity) {
  const item = activity?.item;
  if (item?.type !== "spell") return false;
  const name = item.name?.trim().toLowerCase();
  return !!name && whitelistedNames().has(name);
}

/**
 * The effective range units for an activity. Activities inherit range from their item
 * unless `range.override` is set, so the activity's value is authoritative; the item is a
 * fallback for safety.
 */
function rangeUnits(activity) {
  return (activity?.range ?? activity?.item?.system?.range)?.units;
}

/**
 * Actor uuids of the targets recorded on a usage message.
 * dnd5e 6.x: `system.targets` entries `{actor, token, …}`; dnd5e 5.x: `flags.dnd5e.targets`
 * entries `{uuid, …}` where uuid is the actor uuid.
 */
function recordedTargetActors(message) {
  const v6 = message?.system?.targets;
  if (Array.isArray(v6)) return v6.map(t => t?.actor).filter(Boolean);
  const v5 = message?.getFlag?.("dnd5e", "targets");
  return Array.isArray(v5) ? v5.map(t => t?.uuid).filter(Boolean) : [];
}

/**
 * Is this activation a self-cast of a self/touch range spell?
 * "self" is self-cast by definition; "touch" only when nothing was targeted or the caster
 * was the only target.
 */
function isSelfCast(activity, message, actor) {
  const units = rangeUnits(activity);
  if (!SELF_RANGES.has(units)) return false;
  if (units === "self") return true;

  const targets = recordedTargetActors(message);
  if (!targets.length) return true;
  return (targets.length === 1) && (targets[0] === actor.uuid);
}

/* -------------------------------------------- */
/*  A — show the caster as the target            */
/* -------------------------------------------- */

/** The caster's token document on the viewed scene, if any. */
function casterToken(actor) {
  return actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
}

/**
 * Record the caster as the target of an untargeted self/touch cast, so the chat card's
 * effect tray lists them instead of falling back to "No Tokens Selected".
 *
 * dnd5e builds the target list into the message config before firing this hook, so it is
 * writable here and the card is born with the right target. An explicit target — even the
 * caster themselves — is left exactly as dnd5e recorded it.
 */
function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
  try {
    if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return;
    if (!isWhitelistedSpell(activity)) return;
    if (!SELF_RANGES.has(rangeUnits(activity))) return;

    const actor = activity.actor;
    if (!actor?.isOwner) return;

    const token = casterToken(actor);
    const ac = actor.system?.attributes?.ac?.value ?? null;

    // dnd5e 6.x — shape mirrors TargetsField.getDescriptors().
    const v6 = foundry.utils.getProperty(messageConfig, "data.system.targets");
    if (Array.isArray(v6)) {
      if (v6.length) return;
      foundry.utils.setProperty(messageConfig, "data.system.targets", [{
        actor: actor.uuid,
        ac,
        img: token?.texture?.src ?? actor.img,
        name: token?.name ?? actor.name,
        token: token?.uuid
      }]);
      return;
    }

    // dnd5e 5.x — shape mirrors getTargetDescriptors().
    const v5 = foundry.utils.getProperty(messageConfig, "data.flags.dnd5e.targets");
    if (Array.isArray(v5) && !v5.length) {
      foundry.utils.setProperty(messageConfig, "data.flags.dnd5e.targets", [{
        name: token?.name ?? actor.name,
        img: actor.img,
        uuid: actor.uuid,
        ac
      }]);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (target injection) failed`, err);
  }
}

/* -------------------------------------------- */
/*  Applying the effect                         */
/* -------------------------------------------- */

/** The effects dnd5e's tray would offer for this usage message. */
async function offeredEffects(activity, message, actor) {
  // dnd5e 6.x: exactly the list the tray shows.
  if (typeof message?.system?.getEffects === "function") return message.system.getEffects();

  // dnd5e 5.x: `activity` belongs to a temporary item clone made inside Activity#use(), so
  // resolve the real embedded effects — the clone's carry the wrong uuids.
  const realItem = actor.items.get(activity.item?.id) ?? activity.item;
  return (activity.applicableEffects ?? []).map(e => realItem?.effects?.get(e.id) ?? e);
}

/**
 * Apply one effect to the actor through dnd5e's own chat-tray logic.
 * @returns {Promise<string|null>}  The id of the created or refreshed effect.
 */
async function applyThroughDnd5e(message, effect, actor) {
  const Tray = customElements.get("effect-application");
  if (!Tray) throw new Error("dnd5e's <effect-application> element is not registered");
  const tray = new Tray();
  tray.chatMessage = message;

  // dnd5e 6.x — the code path its Apply button uses.
  if (typeof tray._prepareEffectData === "function") {
    const { action, data } = await tray._prepareEffectData(effect, actor);
    if (action === "update") {
      await actor.effects.get(data._id)?.update(data);
      return data._id;
    }
    const created = await ActiveEffect.implementation.create(data, { parent: actor });
    return created?.id ?? null;
  }

  // dnd5e 5.x.
  if (typeof tray._applyEffectToActor === "function") {
    const result = await tray._applyEffectToActor(effect, actor);
    return result?.id ?? null;
  }

  throw new Error("this dnd5e version offers no known effect-application method");
}

/** `dnd5e.postUseActivity` handler — cheap guards first, then fire-and-forget the apply. */
function onPostUseActivity(activity, usageConfig, results) {
  try {
    if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return;
    if (!isWhitelistedSpell(activity)) return;

    // Without a created chat message there's nothing for dnd5e's logic to work from.
    const message = results?.message;
    if (message?.documentName !== "ChatMessage" || !message.id) return;

    const actor = activity.actor ?? message.getAssociatedActor?.();
    // dnd5e refuses to apply effects to actors you don't own; don't try to work around it.
    if (!actor?.isOwner) return;

    if (!isSelfCast(activity, message, actor)) return;

    autoApply(activity, message, actor)
      .catch(err => console.error(`${MODULE_ID} | spell effect auto-apply failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply failed`, err);
  }
}

async function autoApply(activity, message, actor) {
  const effects = await offeredEffects(activity, message, actor);
  if (effects.length !== 1) {
    console.debug(`${MODULE_ID} | "${activity.item?.name}" offers ${effects.length} effects — ` +
      "not auto-applying, the player chooses on the chat card.");
    return;
  }

  const effectId = await applyThroughDnd5e(message, effects[0], actor);
  if (!effectId) return;
  console.debug(`${MODULE_ID} | auto-applied "${activity.item?.name}" to ${actor.name}.`);

  // Record it on the message so every client can draw the banner. The caster authored the
  // message, so they may update it. Best-effort: a failure only costs the banner.
  try {
    await message.setFlag(MODULE_ID, FLAG_APPLIED, {
      actorUuid: actor.uuid,
      name: actor.name,
      effectIds: [effectId]
    });
  } catch (err) {
    console.debug(`${MODULE_ID} | could not flag chat message as auto-applied`, err);
  }
}

/* -------------------------------------------- */
/*  B — "applied" banner on the chat card       */
/* -------------------------------------------- */

/** Is the auto-applied effect recorded in `data` still active on the actor? */
function stillApplied(actor, data) {
  if (Array.isArray(data.effectIds)) {
    return data.effectIds.some(id => {
      const effect = actor.effects?.get(id);
      return effect && !effect.disabled;
    });
  }
  // Messages flagged by v1.5.x recorded origin uuids instead of effect ids.
  const origins = Array.isArray(data.origins) ? data.origins : [];
  return origins.some(origin => !!actor.effects?.find(e => e.origin === origin));
}

/**
 * Draw an "automatically applied" banner on the usage card.
 *
 * dnd5e has no native applied-state, so this is our own element: placed directly above the
 * <effect-application> tray when the tray is rendered, otherwise (e.g. players in dnd5e 6,
 * who don't get the tray) at the end of the message content. The banner is re-derived from
 * the actor's live effects on every render, so it vanishes on its own once the effect is
 * removed instead of asserting stale state.
 */
function onRenderChatMessage(message, html) {
  try {
    const data = message?.getFlag?.(MODULE_ID, FLAG_APPLIED);
    if (!data?.actorUuid) return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".dt-sea-banner")) return;

    const actor = fromUuidSync(data.actorUuid);
    if (!actor || !stillApplied(actor, data)) return;

    const banner = document.createElement("div");
    banner.classList.add("dt-sea-banner");
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-circle-check");
    icon.inert = true;
    const text = document.createElement("span");
    text.textContent = game.i18n.format("DT.SpellAutoApply.Banner", { name: data.name ?? actor.name });
    banner.append(icon, text);

    const tray = root.querySelector("effect-application");
    if (tray) tray.insertAdjacentElement("beforebegin", banner);
    else (root.querySelector(".message-content") ?? root).append(banner);
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (banner) failed`, err);
  }
}

/* -------------------------------------------- */

export default {
  id: "spellEffectAutoApply",
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.SpellEffectAutoApply.Label",
    hint: "DT.Categories.SpellEffectAutoApply.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.SpellAutoApplyEnabled.Name",
        hint: "DT.Settings.SpellAutoApplyEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_WHITELIST,
      options: {
        name: "DT.Settings.SpellAutoApplyWhitelist.Name",
        hint: "DT.Settings.SpellAutoApplyWhitelist.Hint",
        scope: "world",
        config: true,
        type: String,
        default: "Mage Armor"
      }
    }
  ],
  init() {
    Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
    Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  }
};

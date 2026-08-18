/**
 * Feature: Spell Effect Auto-Apply (dnd5e)
 * ----------------------------------------
 * Foundry VTT v14+ · dnd5e (D&D 2024 / 5.x)
 *
 * Some spells are, in practice, always cast on yourself — Mage Armor being the classic
 * example. dnd5e still requires someone to click "apply" on the chat card for the spell's
 * Active Effect to land on the actor, and that someone is almost always the GM:
 *
 *   dnd5e only shows an effect in the chat card's <effect-application> tray when
 *     game.user.isGM || (effect.transfer && message.author === game.user)
 *   and the effects an activity applies are `transfer: false`, so players never see the
 *   button at all. (Verified: module/data/chat-message/usage-message-data.mjs.)
 *
 * This feature removes that click for a GM-curated whitelist of spells: when a whitelisted
 * spell is cast on the caster themselves, its effects are applied automatically, and the
 * chat card is made to show the caster as the target and report that it was applied.
 *
 * Conditions — ALL must hold before anything is applied:
 *   1. the feature is enabled,
 *   2. the item is a spell whose name is on the whitelist (case-insensitive),
 *   3. the spell's range is "self" or "touch",
 *   4. the caster is the target — implicit for "self"; for "touch" either nothing was
 *      targeted or the caster's own actor was the only target,
 *   5. the acting user owns the actor (dnd5e refuses effect application otherwise).
 *
 * Note on the range check: we deliberately key off *range*, not `target.affects.type`.
 * The 2024 Mage Armor is `range.units: "touch"` with `target.affects.type: "willing"` —
 * a target-type check would never match it. (Verified: packs/_source/spells24/1st-level/
 * mage-armor.yml.)
 *
 * Three hooks are used:
 *
 *   dnd5e.preUseActivity  — fills in `flags.dnd5e.targets` with the caster when nothing was
 *     targeted. Without this the chat card's effect tray has no targets, so it hides the
 *     Targeted/Selected switch, falls back to "selected" mode, reads the (empty) canvas
 *     selection and prints "No Tokens Selected". dnd5e builds that flag *before* firing this
 *     hook, so it is writable here and the card is born showing the caster.
 *
 *   dnd5e.postUseActivity — applies the effects. Fires only on the client that used the
 *     activity (dnd5e ships no socket layer), and that client is the caster's, who owns
 *     their own actor — so exactly one client applies and no GM relay is needed. The
 *     application mirrors dnd5e's own `EffectApplicationElement#_applyEffectToActor`, so
 *     origin, concentration linkage and refresh-instead-of-stack are identical to pressing
 *     the button.
 *
 *   dnd5e.renderChatMessage — draws the "automatically applied" banner above the effect
 *     tray. dnd5e has no native "already applied" state for a target, so this is ours. The
 *     banner is re-derived on every render from the actor's live effects, so it disappears
 *     by itself if the effect is later removed rather than lying about current state.
 *
 * Both settings are world-scoped (a table-wide rule the GM sets) and default to off.
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

/** Targets dnd5e snapshotted onto the usage message: {name, img, uuid, ac}, uuid = ACTOR uuid. */
function messageTargets(message) {
  const targets = message?.getFlag?.("dnd5e", "targets");
  return Array.isArray(targets) ? targets : [];
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

  const targets = messageTargets(message);
  if (!targets.length) return true;
  return (targets.length === 1) && (targets[0]?.uuid === actor.uuid);
}

/** A target descriptor for the caster, shaped like dnd5e's getTargetDescriptors() entries. */
function selfTargetDescriptor(actor) {
  const token = actor.getActiveTokens?.()?.[0] ?? actor.token?.object;
  return {
    name: token?.name ?? actor.name,
    img: actor.img,
    uuid: actor.uuid,
    ac: actor.system?.attributes?.ac?.value ?? null
  };
}

/* -------------------------------------------- */
/*  A — show the caster as the target            */
/* -------------------------------------------- */

/**
 * Record the caster as the target of an untargeted self/touch cast, so the chat card's
 * effect tray lists them instead of falling back to "No Tokens Selected".
 *
 * An explicit target — even the caster themselves — is left exactly as dnd5e recorded it.
 */
function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
  try {
    if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return;
    if (!isWhitelistedSpell(activity)) return;
    if (!SELF_RANGES.has(rangeUnits(activity))) return;

    const actor = activity.actor;
    if (!actor?.isOwner) return;

    const targets = foundry.utils.getProperty(messageConfig, "data.flags.dnd5e.targets");
    if (!Array.isArray(targets) || targets.length) return;

    foundry.utils.setProperty(
      messageConfig, "data.flags.dnd5e.targets", [selfTargetDescriptor(actor)]
    );
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (target injection) failed`, err);
  }
}

/* -------------------------------------------- */
/*  Applying the effects                        */
/* -------------------------------------------- */

/**
 * Apply the activity's effects to the caster, mirroring dnd5e's own apply-button logic.
 *
 * dnd5e uses the concentration effect as the origin when the spell concentrates, otherwise
 * the source effect itself, and looks for an existing effect with that origin to refresh
 * rather than stacking a duplicate.
 *
 * @returns {Promise<string[]>}  The origin uuids that were applied or refreshed.
 */
async function autoApplyEffects(activity, results, actor) {
  const effects = activity.applicableEffects ?? [];
  if (!effects.length) return [];

  const message = results?.message;

  // Concentration effect id: message system data in dnd5e 5.1+, a flag in 4.x.
  const concentrationId = message?.system?.concentration
    ?? message?.getFlag?.("dnd5e", "use.concentrationId");
  const concentration = concentrationId ? actor.effects.get(concentrationId) : null;

  // `activity` belongs to a temporary item clone made inside Activity#use(), so resolve the
  // real embedded documents — the clone's effects carry the wrong uuids for `origin`.
  const realItem = actor.items.get(activity.item?.id) ?? activity.item;

  const appliedOrigins = [];

  for (const clonedEffect of effects) {
    const effect = realItem?.effects?.get(clonedEffect.id) ?? clonedEffect;
    const origin = concentration ?? effect;

    const effectFlags = { flags: { dnd5e: {
      dependentOn: origin.uuid,
      scaling: message?.system?.scaling,
      spellLevel: message?.system?.spellLevel
    } } };

    // Already applied from this origin → refresh its duration instead of stacking.
    const existing = actor.effects.find(e => e.origin === origin.uuid);
    if (existing) {
      const AE = ActiveEffect.implementation;
      // getInitialDuration() is what dnd5e 5.x calls; it is deprecated in Foundry v14 and
      // slated for removal in v16, so degrade to "just re-enable" if it disappears.
      const start = (typeof AE.getInitialDuration === "function") ? AE.getInitialDuration() : {};
      await existing.update(foundry.utils.mergeObject({ ...start, disabled: false }, effectFlags));
      appliedOrigins.push(origin.uuid);
      continue;
    }

    const effectData = foundry.utils.mergeObject({
      ...effect.toObject(),
      disabled: false,
      transfer: false,
      origin: origin.uuid
    }, effectFlags);
    const applied = await ActiveEffect.implementation.create(effectData, { parent: actor });
    if (applied) appliedOrigins.push(origin.uuid);

    // dnd5e < 5.2 tracked dependents on the concentration effect rather than via the
    // `dependentOn` flag, so breaking concentration wouldn't clean this up without it.
    if (applied && concentration && foundry.utils.isNewerVersion("5.2", game.system.version)) {
      await concentration.addDependent?.(applied);
    }
  }

  console.debug(
    `${MODULE_ID} | auto-applied ${appliedOrigins.length} effect(s) of "${activity.item?.name}" to ${actor.name}.`
  );
  return appliedOrigins;
}

/** `dnd5e.postUseActivity` handler — cheap guards first, then fire-and-forget the apply. */
function onPostUseActivity(activity, usageConfig, results) {
  try {
    if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return;
    if (!isWhitelistedSpell(activity)) return;

    const actor = activity.actor ?? results?.message?.getAssociatedActor?.();
    // dnd5e refuses to apply effects to actors you don't own; don't try to work around it.
    if (!actor?.isOwner) return;

    if (!isSelfCast(activity, results?.message, actor)) return;

    autoApplyEffects(activity, results, actor)
      .then(origins => markMessageApplied(results?.message, actor, origins))
      .catch(err => console.error(`${MODULE_ID} | spell effect auto-apply failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply failed`, err);
  }
}

/**
 * Record on the usage message what was auto-applied, so every client can draw the banner.
 * The caster authored the message, so they may update it. Best-effort: a failure here only
 * costs the banner, never the effect itself.
 */
async function markMessageApplied(message, actor, origins) {
  if (!message?.setFlag || !origins?.length) return;
  try {
    await message.setFlag(MODULE_ID, FLAG_APPLIED, {
      actorUuid: actor.uuid,
      name: actor.name,
      origins
    });
  } catch (err) {
    console.debug(`${MODULE_ID} | could not flag chat message as auto-applied`, err);
  }
}

/* -------------------------------------------- */
/*  B — "applied" banner on the chat card       */
/* -------------------------------------------- */

/**
 * Draw an "automatically applied" banner above the effect tray.
 *
 * dnd5e has no native applied-state for a target (buildTargetListEntry renders only image,
 * name and a checkbox), so this is our own element inserted as a sibling of the
 * <effect-application> tray. Inserting a sibling avoids depending on the custom element
 * having upgraded — the tray builds its inner DOM in connectedCallback, and its target list
 * only when expanded, so decorating the tray's internals would be timing-dependent.
 *
 * The banner is re-derived from the actor's live effects on every render, so it vanishes on
 * its own once the effect is removed instead of asserting stale state.
 */
function onRenderChatMessage(message, html) {
  try {
    const data = message?.getFlag?.(MODULE_ID, FLAG_APPLIED);
    if (!data?.actorUuid) return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    const tray = root?.querySelector("effect-application");
    if (!tray || root.querySelector(".dt-sea-banner")) return;

    // Only claim "applied" while the effect is genuinely still on the actor.
    const actor = fromUuidSync(data.actorUuid);
    if (!actor) return;
    const origins = Array.isArray(data.origins) ? data.origins : [];
    const stillApplied = origins.some(origin => !!actor.effects?.find(e => e.origin === origin));
    if (!stillApplied) return;

    const banner = document.createElement("div");
    banner.classList.add("dt-sea-banner");
    banner.innerHTML = '<i class="fa-solid fa-circle-check" inert></i><span></span>';
    banner.querySelector("span").append(
      game.i18n.format("DT.SpellAutoApply.Banner", { name: data.name ?? actor.name })
    );
    tray.insertAdjacentElement("beforebegin", banner);
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

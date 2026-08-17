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
 * spell is cast on the caster themselves, its effects are applied automatically.
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
 * Hook: `dnd5e.postUseActivity(activity, usageConfig, results)`, which fires only on the
 * client that used the activity (dnd5e ships no socket layer). That client is the caster's,
 * and the caster owns their own actor — so exactly one client applies the effect and no
 * GM relay is needed.
 *
 * The application itself mirrors dnd5e's own `EffectApplicationElement#_applyEffectToActor`
 * (module/applications/components/effect-application.mjs) so the result is identical to
 * clicking the button: same origin, same flags, same "refresh instead of stack" behaviour.
 *
 * Both settings are world-scoped (a table-wide rule the GM sets) and default to off.
 */

import { MODULE_ID } from "../constants.js";

const KEY_ENABLED   = "spellAutoApplyEnabled";
const KEY_WHITELIST = "spellAutoApplyWhitelist";

/** Range units that can mean "cast on yourself". dnd5e CONFIG.DND5E.rangeTypes. */
const SELF_RANGES = new Set(["self", "touch"]);

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

/**
 * Is this activation a self-cast of a self/touch range spell?
 *
 * dnd5e stamps the tokens that were targeted at use time onto the usage message as
 * `flags.dnd5e.targets`, an array of `{ name, img, uuid, ac }` where `uuid` is the
 * targeted token's *actor* uuid (verified: getTargetDescriptors(), module/utils.mjs).
 * Using that snapshot is more reliable than re-reading game.user.targets afterwards.
 */
function isSelfCast(activity, message, actor) {
  // Activities inherit range from the item unless they override it, so the activity's
  // value is the effective one; fall back to the item for safety.
  const units = (activity.range ?? activity.item?.system?.range)?.units;
  if (!SELF_RANGES.has(units)) return false;
  if (units === "self") return true;

  // Touch: self-cast when nothing was targeted, or the caster was the only target.
  const targets = message?.getFlag?.("dnd5e", "targets") ?? [];
  if (!targets.length) return true;
  return (targets.length === 1) && (targets[0]?.uuid === actor.uuid);
}

/**
 * Apply the activity's effects to the caster, mirroring dnd5e's own apply-button logic.
 *
 * dnd5e uses the concentration effect as the origin when the spell concentrates, otherwise
 * the source effect itself, and looks for an existing effect with that origin to refresh
 * rather than stacking a duplicate.
 */
async function autoApplyEffects(activity, results, actor) {
  const effects = activity.applicableEffects ?? [];
  if (!effects.length) return;

  const message = results?.message;

  // Concentration effect id: message system data in dnd5e 5.1+, a flag in 4.x.
  const concentrationId = message?.system?.concentration
    ?? message?.getFlag?.("dnd5e", "use.concentrationId");
  const concentration = concentrationId ? actor.effects.get(concentrationId) : null;

  // `activity` belongs to a temporary item clone made inside Activity#use(), so resolve the
  // real embedded documents — the clone's effects carry the wrong uuids for `origin`.
  const realItem = actor.items.get(activity.item?.id) ?? activity.item;

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
      continue;
    }

    const effectData = foundry.utils.mergeObject({
      ...effect.toObject(),
      disabled: false,
      transfer: false,
      origin: origin.uuid
    }, effectFlags);
    const applied = await ActiveEffect.implementation.create(effectData, { parent: actor });

    // dnd5e < 5.2 tracked dependents on the concentration effect rather than via the
    // `dependentOn` flag, so breaking concentration wouldn't clean this up without it.
    if (applied && concentration && foundry.utils.isNewerVersion("5.2", game.system.version)) {
      await concentration.addDependent?.(applied);
    }
  }

  console.debug(
    `${MODULE_ID} | auto-applied ${effects.length} effect(s) of "${activity.item?.name}" to ${actor.name}.`
  );
}

/** `dnd5e.postUseActivity` handler — cheap guards first, then fire-and-forget the apply. */
function onPostUseActivity(activity, usageConfig, results) {
  try {
    if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return;

    const item = activity?.item;
    if (item?.type !== "spell") return;

    const name = item.name?.trim().toLowerCase();
    if (!name || !whitelistedNames().has(name)) return;

    const actor = activity.actor ?? results?.message?.getAssociatedActor?.();
    // dnd5e refuses to apply effects to actors you don't own; don't try to work around it.
    if (!actor?.isOwner) return;

    if (!isSelfCast(activity, results?.message, actor)) return;

    autoApplyEffects(activity, results, actor).catch(err =>
      console.error(`${MODULE_ID} | spell effect auto-apply failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply failed`, err);
  }
}

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
    Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  }
};

/**
 * Feature: Defeated Tokens (system-agnostic)
 * ------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * The defeated status (`CONFIG.specialStatusEffects.DEFEATED`, "dead" in core and dnd5e) is
 * only drawn as a full-token overlay when it is CREATED with the overlay flag: the combat
 * tracker's "toggle defeated" does that, a plain left-click in the Token HUD does not, and
 * `Actor#toggleStatusEffect(id, {active: true, overlay: true})` leaves an EXISTING effect
 * untouched. So a token killed via the HUD shows only a small icon. Dead tokens also keep
 * their stacking order and get in the way when clicking the living tokens around them.
 *
 * Two independent options:
 *   - Overlay: whenever a defeated-status effect is created without the overlay flag, set
 *     `flags.core.overlay = true` (still the overlay mechanism in v14 — ActiveEffect has no
 *     overlay field; the new `showIcon` is something else).
 *   - Send to back: give each of the actor's tokens a `sort` below every other token on its
 *     scene. Tokens are ordered by elevation, then `sort`, for both drawing and mouse
 *     hit-testing, so the dead token no longer covers (or catches clicks meant for) the
 *     tokens around it at the same elevation. The previous `sort` is kept in a module flag and
 *     restored when the defeated status is removed again.
 *
 * Runs only on the active GM's client (one writer; only a GM may update every token).
 * Triggered by create/deleteActiveEffect — document hooks that fire on every client
 * regardless of which scene is being viewed. Works with dnd5e's own "auto-apply downed"
 * option as well (its dead effect already carries the overlay flag).
 *
 * World-scoped (GM), both off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY_OVERLAY = "defeatedOverlay";
const KEY_TO_BACK = "defeatedSendToBack";

/** Token flag holding the `sort` value from before the token was sent to the back. */
const FLAG_SORT = "sortBeforeDefeated";

const defeatedStatus = () => CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
const isActiveGM = () => !!game.users.activeGM?.isSelf;

/** Is this an Actor-owned effect that applies the defeated status? */
function isDefeatedEffect(effect) {
  return (effect?.parent?.documentName === "Actor") && !!effect.statuses?.has(defeatedStatus());
}

/** The actor's tokens that exist in a scene (synthetic actors resolve to their own token). */
function tokensOf(actor) {
  return actor.getDependentTokens?.({ concreteOnly: true }) ?? [];
}

/** Give each of the actor's tokens a sort value below every other token on its scene. */
async function sendToBack(actor) {
  for (const token of tokensOf(actor)) {
    const others = token.parent?.tokens?.filter(t => t.id !== token.id) ?? [];
    if (!others.length) continue;
    const lowest = Math.min(...others.map(t => t.sort ?? 0));
    const current = token.sort ?? 0;
    if (current < lowest) continue;

    const update = { sort: lowest - 1 };
    // Keep the ORIGINAL order if the token is sent back more than once.
    if (token.getFlag(MODULE_ID, FLAG_SORT) === undefined) update[`flags.${MODULE_ID}.${FLAG_SORT}`] = current;
    await token.update(update);
  }
}

/** Restore the sort value a token had before it was sent to the back. */
async function restoreOrder(actor) {
  for (const token of tokensOf(actor)) {
    const original = token.getFlag(MODULE_ID, FLAG_SORT);
    if (original === undefined) continue;
    await token.update({ sort: original });
    await token.unsetFlag(MODULE_ID, FLAG_SORT);
  }
}

async function onCreateActiveEffect(effect) {
  try {
    if (!isActiveGM() || !isDefeatedEffect(effect)) return;

    if (game.settings.get(MODULE_ID, KEY_OVERLAY) && !effect.getFlag("core", "overlay")) {
      await effect.update({ "flags.core.overlay": true });
    }
    if (game.settings.get(MODULE_ID, KEY_TO_BACK)) await sendToBack(effect.parent);
  } catch (err) {
    console.error(`${MODULE_ID} | defeated tokens failed`, err);
  }
}

async function onDeleteActiveEffect(effect) {
  try {
    if (!isActiveGM() || !isDefeatedEffect(effect)) return;
    const actor = effect.parent;

    // Still defeated through another effect? Then it stays at the back.
    const status = defeatedStatus();
    const stillDefeated = actor.effects.some(e => (e.id !== effect.id) && e.active && e.statuses.has(status));
    if (stillDefeated) return;

    // Restore even if the option was switched off meanwhile, so no token stays buried.
    await restoreOrder(actor);
  } catch (err) {
    console.error(`${MODULE_ID} | defeated tokens failed`, err);
  }
}

export default {
  id: "defeatedTokens",
  category: {
    label: "DT.Categories.DefeatedTokens.Label",
    hint: "DT.Categories.DefeatedTokens.Hint"
  },
  settings: [
    {
      key: KEY_OVERLAY,
      options: {
        name: "DT.Settings.DefeatedOverlay.Name",
        hint: "DT.Settings.DefeatedOverlay.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_TO_BACK,
      options: {
        name: "DT.Settings.DefeatedSendToBack.Name",
        hint: "DT.Settings.DefeatedSendToBack.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    }
  ],
  init() {
    Hooks.on("createActiveEffect", onCreateActiveEffect);
    Hooks.on("deleteActiveEffect", onDeleteActiveEffect);
  }
};

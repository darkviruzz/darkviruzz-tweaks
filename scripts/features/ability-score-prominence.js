/**
 * Feature: Ability Score Prominence (dnd5e)
 * -----------------------------------------
 * Foundry VTT v14+ · dnd5e (D&D 2024 / 5.x)
 *
 * The default dnd5e actor sheet renders each ability as:
 *
 *   <div class="ability-score" data-ability="str">
 *     <a class="label rollable ability-check" data-action="roll" data-type="ability">STR</a>
 *     <div class="mod">+3            (or a config <button> for the owner)</div>
 *     <div class="score">16          (or an editable <input> for the owner)</div>
 *   </div>
 *
 * By default the modifier is large and the score a small pill. This feature lets each
 * user (a) reorder + resize so the score sits big directly under the ability name and
 * the modifier small below it, and (b) roll the check by clicking the score/modifier.
 *
 * The prominence swap is purely presentational: we toggle a `.dt-asp-swap` class on the
 * sheet root and let CSS do the rest, so it does not depend on the inner DOM being mounted
 * yet (it cascades whenever the abilities render). That lets us support more than one sheet
 * just by adding CSS selectors. Two sheets are covered today:
 *   - the default dnd5e actor sheet (selectors above);
 *   - the Tidy 5e Character Sheet (non-classic "Quadrone" sheet from the tidy5e-sheet
 *     module), whose ability tile is `[data-tidy-sheet-part="ability-container"]` with the
 *     modifier number in `[data-tidy-sheet-part="ability-value"]` and the score number in
 *     the `[data-tidy-sheet-part="ability-score"]` label. The Tidy *classic* sheet uses a
 *     different DOM and is not covered.
 * Tidy sheets are ApplicationV2 (so `renderActorSheetV2` fires) but also emit their own
 * `tidy5e-sheet.renderActorSheet` hook after their Svelte content renders; we listen to
 * both so the root class is present regardless of timing.
 *
 * The expanded roll-targets setting only affects the default sheet (its selectors don't
 * match Tidy, and Tidy already makes the modifier a roll button), so it no-ops on Tidy.
 *
 * Both settings are per-user and default to off (vanilla behaviour).
 */

import { MODULE_ID } from "../constants.js";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const KEY_SWAP = "abilitySwapScoreAndMod";
const KEY_ROLL = "abilityExpandedRollTargets";

/** Re-render every open actor sheet (ApplicationV2 instances + legacy V1 windows). */
function rerenderActorSheets() {
  const v2 = foundry.applications?.instances?.values?.() ?? [];
  const v1 = Object.values(ui.windows ?? {});
  for (const app of [...v2, ...v1]) {
    if (app?.actor && app.rendered) app.render();
  }
}

function onRenderActorSheet(app, html) {
  if (game.system.id !== "dnd5e") return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  root.classList.toggle("dt-asp-swap", game.settings.get(MODULE_ID, KEY_SWAP));

  if (game.settings.get(MODULE_ID, KEY_ROLL)) addAbilityRollTargets(app, root);
}

/** Make the score and modifier of each ability tile roll an ability check on click. */
function addAbilityRollTargets(app, root) {
  const actor = app.actor ?? app.document;
  if (!actor) return;

  for (const tile of root.querySelectorAll(".ability-score[data-ability]")) {
    const ability = tile.dataset.ability;
    if (!ABILITIES.includes(ability)) continue;

    for (const el of tile.querySelectorAll(".score, .mod")) {
      if (el.dataset.dtAspBound === "true") continue;
      el.dataset.dtAspBound = "true";

      // Only advertise as rollable when it is static text — not the owner's input/button.
      if (!el.querySelector("input, button, select, textarea")) el.classList.add("dt-asp-rollable");

      el.addEventListener("click", event => {
        if (event.target.closest("input, button, select, textarea, a, [data-action]")) return;
        event.preventDefault();
        event.stopPropagation();
        rollAbility(actor, ability);
      });
    }
  }
}

/** Roll an ability check across dnd5e versions (object signature 4.x+, string < 4.0). */
async function rollAbility(actor, ability) {
  if (!actor) return;
  if (typeof actor.rollAbilityCheck === "function") return actor.rollAbilityCheck({ ability });
  if (typeof actor.rollAbilityTest === "function") return actor.rollAbilityTest(ability);

  const msg = game.i18n?.format?.("DT.Notifications.NoRollMethod", { ability: ability.toUpperCase() });
  ui.notifications?.warn(msg ?? `Darkviruzz Tweaks: no ability-roll method found for ${ability.toUpperCase()}.`);
}

export default {
  id: "abilityScoreProminence",
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.AbilityScoreProminence.Label",
    hint: "DT.Categories.AbilityScoreProminence.Hint"
  },
  settings: [
    {
      key: KEY_SWAP,
      options: {
        name: "DT.Settings.AbilitySwapScoreAndMod.Name",
        hint: "DT.Settings.AbilitySwapScoreAndMod.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => rerenderActorSheets()
      }
    },
    {
      key: KEY_ROLL,
      options: {
        name: "DT.Settings.AbilityExpandedRollTargets.Name",
        hint: "DT.Settings.AbilityExpandedRollTargets.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => rerenderActorSheets()
      }
    }
  ],
  init() {
    // dnd5e sheets are ApplicationV2 -> renderActorSheetV2 fires; renderActorSheet is a
    // fallback for any legacy V1 actor sheet. Handler is idempotent.
    Hooks.on("renderActorSheetV2", onRenderActorSheet);
    Hooks.on("renderActorSheet", onRenderActorSheet);
    // Tidy 5e Sheets emit their own hook once their Svelte content has rendered. Harmless
    // if that module isn't installed (the hook simply never fires). Same idempotent handler.
    Hooks.on("tidy5e-sheet.renderActorSheet", onRenderActorSheet);
  }
};

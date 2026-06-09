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
 * user (a) swap score and modifier positions so the score shows large and the modifier
 * small, and (b) roll the check by clicking the score/modifier.
 *
 * Two sheets are supported:
 *
 *   1. Default dnd5e sheet — pure CSS: the `.dt-asp-swap` root class reorders and resizes
 *      the three sibling divs (.label, .mod, .score) via flexbox `order` + font-size rules.
 *
 *   2. Tidy 5e Character Sheet (non-classic "Quadrone" sheet) — CSS + JS data attributes:
 *      The Tidy DOM nests the modifier inside a roll button and the score in a separate
 *      label, so a pure CSS reorder would also move the abbreviation (STR etc.). Instead,
 *      after every Svelte render we read the current values and store them as data
 *      attributes; CSS pseudo-elements (content: attr(...)) then display the swapped
 *      values in-place at the verified Tidy font sizes, while the originals are hidden.
 *      The modifier sign preserves its `color-text-lightest` colour in the small slot.
 *      Verified DOM / font variables → see CLAUDE.md "Verified facts & gotchas".
 *
 *   Roll-targets (setting 2) only applies to the default sheet; Tidy already makes the
 *   modifier a roll button.
 *
 * Both settings are per-user and default to off (vanilla behaviour).
 */

import { MODULE_ID } from "../constants.js";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const KEY_SWAP   = "abilitySwapScoreAndMod";
const KEY_ROLL   = "abilityExpandedRollTargets";

/** Re-render every open actor sheet (ApplicationV2 instances + legacy V1 windows). */
function rerenderActorSheets() {
  const v2 = foundry.applications?.instances?.values?.() ?? [];
  const v1 = Object.values(ui.windows ?? {});
  for (const app of [...v2, ...v1]) {
    if (app?.actor && app.rendered) app.render();
  }
}

/** Default dnd5e sheet (and any non-Tidy actor sheet). */
function onRenderActorSheet(app, html) {
  if (game.system.id !== "dnd5e") return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  root.classList.toggle("dt-asp-swap", game.settings.get(MODULE_ID, KEY_SWAP));

  if (game.settings.get(MODULE_ID, KEY_ROLL)) addAbilityRollTargets(app, root);
}

/**
 * Tidy 5e Sheets hook — fires after Svelte content has mounted.
 * Signature from tidy5e-sheet: (app, element, data, forced).
 * Sets the root class (also set by renderActorSheetV2, but this is idempotent) and then
 * stamps data attributes onto each ability tile so CSS can display the swapped values.
 */
function onTidyRenderActorSheet(app, element, _data, _forced) {
  if (game.system.id !== "dnd5e") return;

  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  const swap = game.settings.get(MODULE_ID, KEY_SWAP);
  root.classList.toggle("dt-asp-swap", swap);

  if (swap) setTidySwapData(root);
}

/**
 * Read the current score and modifier values from each Tidy ability tile and store them
 * as data attributes for CSS content: attr() pseudo-elements.
 *
 * Verified Tidy Quadrone DOM (AbilityScore.svelte):
 *   - Modifier sign   : [data-tidy-sheet-part="ability-mod"]   (1.5rem, color-text-lightest)
 *   - Modifier value  : [data-tidy-sheet-part="ability-value"] (font-data-xlarge = 700 28px)
 *   - Score value     : first span in [data-tidy-sheet-part="ability-score"] label
 *                       (font-title-small = 400 18px title-font)
 * Both are inside [data-tidy-sheet-part="ability-container"].
 */
function setTidySwapData(root) {
  for (const tile of root.querySelectorAll('[data-tidy-sheet-part="ability-container"]')) {
    const labelContainer = tile.querySelector(".ability-label-container");
    const scoreLabel     = tile.querySelector('[data-tidy-sheet-part="ability-score"]');
    const modSign        = tile.querySelector('[data-tidy-sheet-part="ability-mod"]');
    const modValue       = tile.querySelector('[data-tidy-sheet-part="ability-value"]');
    const scoreSpan      = scoreLabel?.querySelector("span:not(.ability-proficiency-indicator)");

    if (!labelContainer || !modSign || !modValue || !scoreSpan) continue;

    // Stored on labelContainer: score shown large in the badge via ::after.
    // Stored on scoreLabel: modifier shown small below the badge via ::before / ::after.
    // CSS only activates these when the attribute is present, so no flash before first
    // Svelte mount (when renderActorSheetV2 fires before Svelte content exists).
    labelContainer.dataset.dtAspScore = scoreSpan.textContent.trim();
    scoreLabel.dataset.dtAspSign      = modSign.textContent.trim();
    scoreLabel.dataset.dtAspVal       = modValue.textContent.trim();
  }
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
    // fallback for any legacy V1 actor sheet.
    Hooks.on("renderActorSheetV2", onRenderActorSheet);
    Hooks.on("renderActorSheet",   onRenderActorSheet);
    // Tidy 5e Sheets emit their own hook once Svelte content has rendered. The data
    // attributes for the CSS swap need the mounted DOM, so we use this hook specifically.
    // Harmless when the module isn't installed (the hook simply never fires).
    Hooks.on("tidy5e-sheet.renderActorSheet", onTidyRenderActorSheet);
  }
};

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
 * user (a) swap score and modifier so the score shows large and the modifier small, and
 * (b) roll the check by clicking the score/modifier.
 *
 * Two sheets are supported:
 *
 *   1. Default dnd5e sheet — pure CSS via the `.dt-asp-swap` root class: the three sibling
 *      divs (.label/.mod/.score) are reordered with flexbox `order` and the score/modifier
 *      font sizes are swapped.
 *
 *   2. Tidy 5e Character Sheet (non-classic "Quadrone" sheet) — CSS + JS data attributes.
 *      The Tidy DOM nests the modifier (with the STR/DEX abbreviation) inside a roll button
 *      and the score in a separate label, so a CSS-only reorder would also move the
 *      abbreviation. Instead we read the current score/modifier values and stamp them as
 *      `data-dt-asp-*` attributes on the tile; CSS pseudo-elements (content: attr(...)) then
 *      display the swapped values in place at the verified Tidy font tokens, hiding the
 *      originals. The modifier sign keeps its lighter `--t5e-color-text-lightest` colour.
 *
 *      IMPORTANT: the Quadrone (ApplicationV2) sheet fires the STANDARD `renderActorSheetV2`
 *      hook — it does NOT fire `tidy5e-sheet.renderActorSheet` (that hook is for Tidy's
 *      legacy V1 sheets only; verified in Tidy5eSheetsApi.ts / the Quadrone sheet source).
 *      So we stamp the attributes from the standard render hook, where the Svelte DOM is
 *      already present (a brief retry covers any late mount).
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

function onRenderActorSheet(app, html) {
  if (game.system.id !== "dnd5e") return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  const swap = game.settings.get(MODULE_ID, KEY_SWAP);
  root.classList.toggle("dt-asp-swap", swap);

  if (game.settings.get(MODULE_ID, KEY_ROLL)) addAbilityRollTargets(app, root);

  // Tidy 5e Quadrone sheet: stamp data attributes for the CSS pseudo-element swap. The DOM
  // is normally present already at this point; retry a few frames in case Svelte mounts the
  // ability tiles slightly later. No-ops (cheaply) on non-Tidy sheets.
  if (swap) scheduleTidySwap(root);
}

/**
 * Stamp the current score and modifier values onto each Tidy ability tile as data
 * attributes so CSS `content: attr(...)` pseudo-elements can display the swapped values.
 * Returns true once tiles were found (so the retry loop can stop). Idempotent.
 *
 * Verified Tidy Quadrone DOM (AbilityScore.svelte):
 *   tile          [data-tidy-sheet-part="ability-container"]
 *   modifier sign [data-tidy-sheet-part="ability-mod"]    (lighter colour, in the badge)
 *   modifier value[data-tidy-sheet-part="ability-value"]  (font-data-xlarge, in the badge)
 *   score value   first span in [data-tidy-sheet-part="ability-score"] <label>
 */
function applyTidySwap(root) {
  const tiles = root.querySelectorAll('[data-tidy-sheet-part="ability-container"]');
  if (!tiles.length) return false;

  for (const tile of tiles) {
    const labelContainer = tile.querySelector(".ability-label-container");
    const scoreLabel     = tile.querySelector('[data-tidy-sheet-part="ability-score"]');
    const modSign        = tile.querySelector('[data-tidy-sheet-part="ability-mod"]');
    const modValue       = tile.querySelector('[data-tidy-sheet-part="ability-value"]');
    const scoreSpan      = scoreLabel?.querySelector("span:not(.ability-proficiency-indicator)");
    if (!labelContainer || !scoreLabel || !modSign || !modValue || !scoreSpan) continue;

    // Badge shows the score (large); the small slot below shows the modifier sign + value.
    labelContainer.dataset.dtAspScore = scoreSpan.textContent.trim();
    scoreLabel.dataset.dtAspSign      = modSign.textContent.trim();
    scoreLabel.dataset.dtAspVal       = modValue.textContent.trim();
  }
  console.debug(`${MODULE_ID} | Tidy ability swap: stamped ${tiles.length} ability tile(s).`);
  return true;
}

/** Apply the Tidy swap now; if the ability tiles aren't mounted yet, retry a few frames. */
function scheduleTidySwap(root, attempts = 5) {
  if (applyTidySwap(root) || attempts <= 0) return;
  requestAnimationFrame(() => scheduleTidySwap(root, attempts - 1));
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
    // dnd5e sheets — including the Tidy 5e Quadrone sheet — are ApplicationV2, so
    // renderActorSheetV2 fires. renderActorSheet is the legacy V1 fallback. We also listen
    // to Tidy's own hook for any (V1) Tidy sheet that emits it; same idempotent handler.
    Hooks.on("renderActorSheetV2", onRenderActorSheet);
    Hooks.on("renderActorSheet",   onRenderActorSheet);
    Hooks.on("tidy5e-sheet.renderActorSheet", (app, element) => onRenderActorSheet(app, element));
  }
};

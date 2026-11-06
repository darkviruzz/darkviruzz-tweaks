/**
 * Feature: Attack Targets on RSReforged Cards (dnd5e 6)
 * -----------------------------------------------------
 * Foundry VTT v14+ · dnd5e 6.x · module RSReforged 6
 *
 * dnd5e 6 shows the targets of an ATTACK only on the attack card: the attack activity's
 * `metadata.targetPhase` is "post", so the usage card renders no `<recorded-targets>`
 * (`UsageMessageData#_prepareContext`: `showTargets = targetPhase !== "post" && …`), and
 * `attack-card.hbs` renders the target pills with hit/miss (and AC for the GM). Save and check
 * activities ("pre") show their targets on the usage card — that is why a Stunning Strike card
 * named its target while the Unarmed Strike card before it didn't.
 *
 * RSReforged 6 hides dnd5e's attack card and shows the attack as a section of its usage card
 * (`.rsr-section-attack[data-message-id]`) that contains only the roll — so with RSReforged
 * nobody, not even the GM, sees whom an attack was rolled against (RSReforged 6.0.2,
 * `native-card.js` `_attackSection`).
 *
 * This puts dnd5e's own targets row back into that section: the attack message's card is
 * rendered by dnd5e (`message.system.render()`), and its targets row is copied — so visibility
 * (dnd5e's "Attack Roll Visibility" setting: hit/miss and AC for players), sorting and the
 * clickable `<target-pill>`s are exactly dnd5e's. dnd5e 5.x is not affected (no
 * `system.render`; RSReforged's legacy cards keep dnd5e's own target list).
 *
 * World setting, off by default.
 */

import { MODULE_ID } from "../constants.js";
import { watchRsrSections } from "../lib/rsr-sections.js";

const KEY_ENABLED = "rsrAttackTargetsEnabled";
const RSR_SECTION = ".rsr-section-attack[data-message-id]";
const ROW_CLASS = "dt-rsr-targets";

/** Sections being decorated right now (the render is async). */
const pending = new WeakSet();

const enabled = () => !!game.settings.get(MODULE_ID, KEY_ENABLED);

/**
 * dnd5e's targets row of an attack card, rendered by dnd5e for the current user, or null.
 * @param {object} message  A dnd5e 6 attack message.
 * @returns {Promise<HTMLElement|null>}
 */
async function targetsRow(message) {
  if ((message?.type !== "attack") || (typeof message.system?.render !== "function")) return null;
  if (!message.system.targets?.length) return null;
  const html = await message.system.render({});
  if (!html) return null;
  const template = document.createElement("template");
  template.innerHTML = html;
  const list = template.content.querySelector("ul.targets");
  const row = list?.closest(".icon-row") ?? null;
  if (!row || !list.querySelector("target-pill")) return null;
  row.classList.add(ROW_CLASS);
  return row;
}

/** Add the targets row to one RSReforged attack section (idempotent). */
async function decorate(section, message) {
  if (section.querySelector(`.${ROW_CLASS}`) || pending.has(section)) return;
  pending.add(section);
  try {
    const row = await targetsRow(message);
    if (row && !section.querySelector(`.${ROW_CLASS}`)) section.append(row);
  } catch (err) {
    console.error(`${MODULE_ID} | attack targets on RSReforged cards failed`, err);
  } finally {
    pending.delete(section);
  }
}

function onRenderChatMessage(message, html) {
  try {
    if (!enabled() || (message?.type !== "usage")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (root) watchRsrSections(root, RSR_SECTION, decorate);
  } catch (err) {
    console.error(`${MODULE_ID} | attack targets on RSReforged cards failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = { targetsRow, decorate };

export default {
  id: "rsrAttackTargets",
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.RsrAttackTargets.Label",
    hint: "DT.Categories.RsrAttackTargets.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.RsrAttackTargetsEnabled.Name",
        hint: "DT.Settings.RsrAttackTargetsEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => ui.chat?.render?.()
      }
    }
  ],
  init() {
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  }
};

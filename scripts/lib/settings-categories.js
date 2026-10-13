/**
 * Inserts a category header before the first setting of each feature in the
 * Configure Settings window, so all of this module's settings appear in one tab
 * grouped by feature.
 *
 * Foundry renders each registered setting with an input named "<module>.<key>".
 * We find that input, walk up to its `.form-group`, and insert a header before it.
 * If the DOM isn't found (e.g. a future Foundry layout change), it degrades
 * gracefully: no header is added, but the settings themselves still work.
 */

import { MODULE_ID } from "../constants.js";

/**
 * @param {object[]} features  Active feature objects (each with `settings` and `category`).
 * @param {HTMLElement} root   The rendered SettingsConfig root element.
 */
export function injectCategoryHeaders(features, root) {
  for (const feature of features) {
    const firstKey = feature.settings?.[0]?.key;
    if (!firstKey || !feature.category) continue;

    const input = root.querySelector(`[name="${MODULE_ID}.${firstKey}"]`);
    const group = input?.closest(".form-group");
    if (!group) continue;

    // Idempotent: don't add the header twice on re-render.
    if (group.previousElementSibling?.classList?.contains("dt-category")) continue;

    // Built with textContent so translated strings are never parsed as HTML.
    const header = document.createElement("div");
    header.classList.add("dt-category");

    const title = document.createElement("h3");
    title.classList.add("dt-category__title");
    title.textContent = game.i18n.localize(feature.category.label);
    header.append(title);

    if (feature.category.hint) {
      const hint = document.createElement("p");
      hint.classList.add("dt-category__hint", "notes");
      hint.textContent = game.i18n.localize(feature.category.hint);
      header.append(hint);
    }

    group.insertAdjacentElement("beforebegin", header);
  }
}

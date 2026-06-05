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

    const label = game.i18n.localize(feature.category.label);
    const hint = feature.category.hint ? game.i18n.localize(feature.category.hint) : "";

    const header = document.createElement("div");
    header.classList.add("dt-category");
    header.innerHTML =
      `<h3 class="dt-category__title">${label}</h3>` +
      (hint ? `<p class="dt-category__hint notes">${hint}</p>` : "");

    group.insertAdjacentElement("beforebegin", header);
  }
}

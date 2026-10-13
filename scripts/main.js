/**
 * Darkviruzz Tweaks & QoL — entry point / feature loader.
 *
 * Each feature lives in its own file under scripts/features/ and default-exports a
 * "feature object"; scripts/features/index.js lists them. This loader registers every
 * feature's settings and keybindings, runs its init(), and groups the settings by feature
 * (category headers) in the Configure Settings UI.
 *
 * Feature object contract (see CLAUDE.md for the full guide):
 *
 *   export default {
 *     id: "myFeature",                 // unique camelCase id
 *     requiresSystem: "dnd5e",         // optional — feature only loads on this system id
 *     category: {                      // settings category header for this feature
 *       label: "DT.Categories.<Feature>.Label",   // i18n key
 *       hint:  "DT.Categories.<Feature>.Hint"      // i18n key (optional)
 *     },
 *     settings: [                      // settings registered for this feature, in order
 *       { key: "myToggle", options: { ...game.settings.register options } }
 *     ],
 *     keybindings: [                   // optional — registered unbound (editable: [])
 *       { action: "myAction", options: { ...game.keybindings.register options } }
 *     ],
 *     init() { ... }                   // register hooks etc. (called once during "init")
 *   };
 *
 * Conventions (enforced by tools/validate.mjs): defaults are always the vanilla behaviour
 * (every feature off, keybindings unbound), and all settings appear in one settings tab,
 * categorised per feature.
 */

import { MODULE_ID } from "./constants.js";
import { FEATURES } from "./features/index.js";
import { injectCategoryHeaders } from "./lib/settings-categories.js";

/** Features whose system requirement (if any) matches the active world. */
function activeFeatures() {
  return FEATURES.filter(f => !f.requiresSystem || f.requiresSystem === game.system?.id);
}

Hooks.once("init", () => {
  const loaded = [];
  for (const feature of activeFeatures()) {
    // Isolate features: one broken feature must not take the whole module down.
    try {
      for (const { key, options } of feature.settings ?? []) {
        game.settings.register(MODULE_ID, key, options);
      }
      for (const { action, options } of feature.keybindings ?? []) {
        game.keybindings.register(MODULE_ID, action, options);
      }
      feature.init?.();
      loaded.push(feature.id);
    } catch (err) {
      console.error(`${MODULE_ID} | feature "${feature.id}" failed to initialise`, err);
    }
  }
  console.log(`${MODULE_ID} | initialised features: ${loaded.join(", ") || "(none)"}`);
});

// Group this module's settings by feature with category headers (one settings tab).
Hooks.on("renderSettingsConfig", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (root) injectCategoryHeaders(activeFeatures(), root);
});

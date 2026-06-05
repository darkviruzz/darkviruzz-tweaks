/**
 * Darkviruzz Tweaks & QoL — entry point / feature loader.
 *
 * Each feature lives in its own file under scripts/features/ and default-exports a
 * "feature object". This loader registers every feature's settings, runs its init(),
 * and groups the settings by feature (category headers) in the Configure Settings UI.
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
 *     init() { ... }                   // register hooks etc. (called once during "init")
 *   };
 *
 * Conventions enforced here: defaults are always the vanilla behaviour (every feature
 * off by default), and all settings appear in one settings tab, categorised per feature.
 */

import { MODULE_ID } from "./constants.js";
import { injectCategoryHeaders } from "./lib/settings-categories.js";

import abilityScoreProminence from "./features/ability-score-prominence.js";
import unpauseOnLoad from "./features/unpause-on-load.js";

/** Registry of all features. Add new features here. */
const FEATURES = [
  abilityScoreProminence,
  unpauseOnLoad
];

/** Features whose system requirement (if any) matches the active world. */
function activeFeatures() {
  return FEATURES.filter(f => !f.requiresSystem || f.requiresSystem === game.system?.id);
}

Hooks.once("init", () => {
  const active = activeFeatures();
  for (const feature of active) {
    for (const setting of feature.settings ?? []) {
      game.settings.register(MODULE_ID, setting.key, setting.options);
    }
    feature.init?.();
  }
  console.log(`${MODULE_ID} | initialised features: ${active.map(f => f.id).join(", ") || "(none)"}`);
});

// Group this module's settings by feature with category headers (one settings tab).
Hooks.on("renderSettingsConfig", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (root) injectCategoryHeaders(activeFeatures(), root);
});

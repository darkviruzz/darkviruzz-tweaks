/**
 * Feature registry — every feature of the module, in settings-display order.
 *
 * Add new features here (import + list entry). Kept separate from the loader so that
 * tools/validate.mjs can import the registry in plain Node: feature files must therefore
 * NOT touch Foundry globals (game, Hooks, CONFIG, canvas, ui, foundry…) at import time —
 * only inside functions / init().
 */

// dnd5e-specific
import abilityScoreProminence from "./ability-score-prominence.js";
import spellEffectAutoApply from "./spell-effect-autoapply.js";

// system-agnostic
import findMyToken from "./find-my-token.js";
import movementHistoryReset from "./movement-history-reset.js";
import defeatedTokens from "./defeated-tokens.js";
import pauseControl from "./pause-control.js";

export const FEATURES = [
  abilityScoreProminence,
  spellEffectAutoApply,
  findMyToken,
  movementHistoryReset,
  defeatedTokens,
  pauseControl
];

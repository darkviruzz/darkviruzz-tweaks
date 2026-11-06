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
import liveTokenDrag from "./live-token-drag.js";
import filePickerPreview from "./file-picker-preview.js";
import tokenArtPicker from "./token-art-picker.js";
import savageAttacker from "./savage-attacker.js";
import weaponMastery from "./weapon-mastery.js";
import chatExport from "./chat-export.js";
import tokenStatusIcons from "./token-status-icons.js";
import tokenFormation from "./token-formation.js";
import templateTargeting from "./template-targeting.js";
import rsrAttackTargets from "./rsr-attack-targets.js";
import tahLayer from "./tah-layer.js";

export const FEATURES = [
  abilityScoreProminence,
  spellEffectAutoApply,
  findMyToken,
  movementHistoryReset,
  defeatedTokens,
  tokenStatusIcons,
  pauseControl,
  liveTokenDrag,
  filePickerPreview,
  tokenArtPicker,
  tokenFormation,
  templateTargeting,
  savageAttacker,
  weaponMastery,
  rsrAttackTargets,
  chatExport,
  tahLayer
];

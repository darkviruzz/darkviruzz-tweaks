# Changelog

All notable changes to **Darkviruzz Tweaks & QoL**. The release workflow publishes the
section of the released version as the GitHub release notes, so write entries for players
and GMs, not for developers.

## [Unreleased]

### Added
- **Token Art Picker (Too Many Tokens)** (any system): pick token images from the
  *Too Many Tokens – Online* collection in a gallery with a large preview — a replacement for
  that module's "Get Too Many Tokens For Selected Tokens" macro. The creature is guessed from
  the token/actor, variants can be filtered by attributes (Human, Female, Melee, Forest …),
  and the chosen images go to the selected tokens (several images are spread randomly), the
  prototype token and/or the actor portrait. Optional **wildcard**: every newly placed token
  of the actor gets a random image from your selection. Old Too Many Tokens wildcards are
  recognised and can be converted. Open it from the actor's context menu in the Actors
  sidebar, an optional Token HUD button, a keybinding or a macro. *Too Many Tokens – Online*
  must stay installed (it may be deactivated). Off by default.

## [1.7.0] — 2026-10-13

### Added
- **Pause Control** (any system, GM): automatic pausing and unpausing, replacing the
  unmaintained *Koboldworks – Pause Control* module — **disable Koboldworks** when you switch
  these on. Four options, all off by default:
  - **Unpause When World Loads**
  - **Unpause When Combat Starts**
  - **Pause During NPC Turns** — pauses on turns of combatants without a player owner and
    unpauses on player turns. (Koboldworks' version of this has been broken since Foundry v13.)
  - **Restore Pause State After Combat**

## [1.6.0] — 2026-10-13

### Added
- **Find My Token** (any system, per player): jump to your own token — pan **and zoom** to
  it, select it, optionally ping it for the table. Use a keybinding (assign it under
  Configure Controls) and/or a crosshair button in the Token toolbar.
- **Reset Movement History Each Round** (any system, GM): a safety net that clears all
  combatants' movement history whenever a combat round advances, in case Foundry's own
  turn-start clearing didn't run.
- **Defeated Tokens** (any system, GM): show "Dead" as a big full-token overlay even when set
  via the Token HUD, and move defeated tokens behind the others so they don't get selected by
  accident — their order is restored when they're revived.

All new options are **off by default**.

### Fixed
- **Spell Effect Auto-Apply works with dnd5e 6.0.** dnd5e 6 changed where targets are stored
  and how effects are applied; the feature now supports both dnd5e 5.x and 6.x. Most
  importantly, a *Touch* spell cast on an **ally** is no longer mistaken for a self-cast on
  dnd5e 6 (which would have put e.g. Mage Armor on the caster).
- **Spell Effect Auto-Apply no longer applies every variant of a multi-effect spell.** It now
  only acts when the spell offers exactly one effect; spells with several effects to choose
  from are left to the player, just like dnd5e's own tray.
- **Tidy 5e sheet:** the "Mod" label and the modifier tooltip are now translated (the tooltip
  previously always fell back to English).

### Changed
- Spell Effect Auto-Apply now hands the effect to dnd5e's own chat-tray code instead of a
  re-implementation, so the result always matches pressing **apply** in your dnd5e version.
- The "automatically applied" banner also shows when the effect tray itself isn't displayed
  (players on dnd5e 6).

### Under the hood
- One broken feature can no longer stop the other features from loading.
- New automated checks (`npm run validate`) run on every pull request and before every
  release: manifest consistency, translations (en/de keys and placeholders), "every feature
  off by default", documentation of every setting.
- Releases are now cut only by the release workflow from `module.json` + this changelog;
  GitHub Actions updated to Node 24.

## Earlier versions

See the [GitHub releases](https://github.com/darkviruzz/darkviruzz-tweaks/releases) for
1.0.0 – 1.5.1.

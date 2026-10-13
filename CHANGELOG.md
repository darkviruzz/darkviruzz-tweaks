# Changelog

All notable changes to **Darkviruzz Tweaks & QoL**. The release workflow publishes the
section of the released version as the GitHub release notes, so write entries for players
and GMs, not for developers.

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

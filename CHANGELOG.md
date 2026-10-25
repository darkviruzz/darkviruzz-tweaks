# Changelog

All notable changes to **Darkviruzz Tweaks & QoL**. The release workflow publishes the
section of the released version as the GitHub release notes, so write entries for players
and GMs, not for developers.

## [1.8.0] — 2026-10-25

### Added
- **Live Token Drag** (any system, GM): while a token is being dragged, everyone sees it
  follow the mouse in real time, smoothly. Replaces the unmaintained *Live Drag* module by
  Anyndel — **disable Live Drag** when you switch this on. Compared to Live Drag:
  - the token no longer turns **invisible** for the person dragging it when it is dropped on
    its own square or the drag is cancelled;
  - a drag that ends without a move (cancelled with a right-click, dropped on the same spot,
    refused move) **glides back** for everyone instead of staying at its last position;
  - when a token is dropped, the others no longer see it walk its path a second time;
  - **hidden tokens** are only shown to GMs, and holding **Alt** when you start a drag keeps
    that drag private (like Foundry's ruler);
  - optional **Shift-only** mode: a drag is shown live once Shift is pressed during it;
  - doesn't need *socketlib* or *libWrapper*.

  Off by default. If live drags don't show up right after updating, relaunch the world once.

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

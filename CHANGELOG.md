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
- **File Browser Preview** (any system): see images in Foundry's File Browser without
  clicking them — a replacement for the *Asset Preview* module, which only previews on click
  (**disable Asset Preview** when you switch these on). Three options, all off by default:
  - **File Browser: Preview on Hover** (per player) — rest the mouse on an image in the List or
    Thumbnails view to see it beside the browser, with its size in pixels, its file size and,
    in the Tile Browser, how many grid squares it covers at the Asset Grid Size. Preview size
    per player: 256, 384 or 512 px (**File Browser: Preview Size**, default 384 px).
  - **File Browser: Cache Thumbnails of Large Images** (GM) — the first preview of a large
    image saves a thumbnail (max. 512 px) in the module's storage folder; from then on
    everyone sees that thumbnail instead of downloading the full image again. Made by users
    who may upload files; adjustable size threshold (**File Browser: Thumbnail Threshold (KB)**,
    default 250 KB). Images up to 512 px or up to the threshold are always shown as they are.
  - **File Browser: File Names in Tiles View** (per player).

  Dragging files from the File Browser onto the canvas works exactly as before.
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
- **Savage Attacker** (D&D 5e, GM): automates the 2024 feat. *Automatic*: the first weapon
  damage roll of each turn — also on other creatures' turns, so opportunity attacks count —
  rolls the weapon dice twice and keeps the higher result (Dice So Nice shows both, a note on
  the card shows both totals); a known miss doesn't use up the turn. Every other weapon damage
  card gets a **Savage Attacker** button for the GM and the owners, so the GM can decide which
  hit was the first. *Button only* mode is available too. Off by default.
- **Weapon Mastery** (D&D 5e, GM): makes the 2024 weapon masteries usable from the attack card.
  Every attack card with a mastery gets one line — "Weapon Mastery:", the mastery's rule link and
  a button that **carries it out on click** (masteries are optional, nothing happens by itself):
  **Graze** damage on a miss; on a hit **Topple** (Constitution save rolled by the GM for
  monsters and by the players for their own characters, Prone on a failure), **Push** 10 ft away
  from the attacker (grid and walls respected), and **Sap**, **Slow** and **Vex** as effects that
  end on their own at the right turn and are used up by the next attack. **Cleave** and **Nick**
  only show their rule. Players see just that line; their click is applied by the GM's client
  (Vex, on their own character, directly), and targets whose hit is unknown are left to the GM.
  The GM also gets a tray like dnd5e's damage and effect trays: each target's hit or miss (click
  to correct it), the targets of the attack or the selected tokens, Apply per target — and it
  folds up after applying. Optionally every mastery can run a **macro** of your choice. Works
  with RSReforged one-click attacks. Off by default.

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

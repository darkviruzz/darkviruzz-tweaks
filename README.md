# Darkviruzz Tweaks & QoL

A personal collection of quality-of-life tweaks for our gaming table, packaged as one
[Foundry VTT](https://foundryvtt.com/) module. Every feature is **individually
toggleable** and **off by default** — the module changes nothing until you opt in.

| | |
|---|---|
| **Foundry VTT** | v14+ |
| **System** | dnd5e (D&D 2024 / 5.x) for system-specific features; some features are system-agnostic |

All settings live under **Game Settings → Configure Settings → Darkviruzz Tweaks & QoL**,
grouped by feature.

## Installation (manifest URL)

In Foundry: **Add-on Modules → Install Module**, then paste:

```
https://github.com/darkviruzz/darkviruzz-tweaks/releases/latest/download/module.json
```

This always points to the latest release, so Foundry also offers updates automatically.

---

## Features

### 1. Ability Score Prominence  ·  *dnd5e · per-user*

Changes how ability scores are shown on dnd5e actor sheets. By default the sheet shows the
**modifier** large and the **score** as a small pill; this feature can flip that.

**How it works:** on each actor-sheet render it (optionally) adds a CSS class that reorders
the ability tile to **name → score → modifier** and enlarges the score / shrinks the
modifier, and/or attaches click-to-roll handlers to the score and modifier. Click-to-roll
only applies to the static (non-editable) display, so it never interferes with editing a
value or opening the ability config. Rolls use `actor.rollAbilityCheck({ ability })`.

| Setting | Default | Effect |
|---|---|---|
| **Show Ability Score Large** | off | Moves the score directly under the ability name and shows it large; the modifier moves below it, shown small. |
| **Click Score / Modifier to Roll** | off | Lets you roll an ability check by clicking the score or modifier (in addition to the ability name). |

> Styled against the default dnd5e sheet; alternate sheet modules use a different DOM and
> may not be affected. Sizes are conservative (fixed-size shield tiles) — adjust
> `styles/ability-score-prominence.css` if your theme needs different sizing.

### 2. Unpause When World Loads  ·  *any system · world / GM*

Foundry always starts a world **paused**. This feature can make it come up unpaused.

**How it works:** on the `ready` hook, if enabled, the **GM's** client unpauses the game
(`game.togglePause(false, { broadcast: true })`) when the game is currently paused, and
broadcasts it to everyone. Because it only acts while paused, normal reloads don't re-toggle
it once unpaused.

| Setting | Default | Effect |
|---|---|---|
| **Unpause When World Loads (GM)** | off | Automatically unpauses the game as the GM loads the world. Applies on the next world load / server start. |

> Caveat: a GM reloading the page while the game is *intentionally* paused will also trigger
> an unpause — Foundry exposes no reliable client-side signal that separates a fresh world
> activation from a GM page reload. Pause again afterwards if needed.

---

## Development

This repo is built to grow feature-by-feature. See **[CLAUDE.md](CLAUDE.md)** for the
architecture, the feature contract, and the conventions (target v14+ / dnd5e or
system-agnostic, defaults always off, one feature per file, settings grouped by feature,
README documents every feature).

## License

[MIT](LICENSE)

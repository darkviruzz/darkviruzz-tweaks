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

**How it works:** the prominence swap is purely presentational — on each actor-sheet render
it toggles a `.dt-asp-swap` class on the sheet root and CSS does the rest (it cascades
whenever the abilities mount, so it doesn't depend on render timing). The click-to-roll
setting attaches handlers to the score and modifier; it only applies to the static
(non-editable) display, so it never interferes with editing a value or opening the ability
config. Rolls use `actor.rollAbilityCheck({ ability })`.

**Supported sheets:** the **default dnd5e** actor sheet, and the **Tidy 5e Character Sheet**
(the non-classic / "Quadrone" sheet from the
[tidy5e-sheet](https://github.com/kgar/foundry-vtt-tidy-5e-sheets) module). On the default
sheet the score is reordered directly under the ability name; on the Tidy sheet the score is
enlarged and the modifier shrunk in place (keeping Tidy's badge layout). The Tidy **classic**
sheet uses a different DOM and is not affected. Click-to-roll only applies to the default
sheet (Tidy already makes the modifier a roll button).

| Setting | Default | Effect |
|---|---|---|
| **Show Ability Score Large** | off | Makes the score the large, prominent number and the modifier small. On the default sheet the score also moves directly under the ability name. Works on the default dnd5e sheet and the Tidy 5e Character Sheet. |
| **Click Score / Modifier to Roll** | off | Lets you roll an ability check by clicking the score or modifier (in addition to the ability name). Default dnd5e sheet only. |

> Sizes are conservative (the tiles use fixed-size shield / badge backgrounds) — adjust
> `styles/ability-score-prominence.css` if your theme needs different sizing. Other alternate
> sheet modules use a different DOM and may not be affected.


## Development

This repo is built to grow feature-by-feature. See **[CLAUDE.md](CLAUDE.md)** for the
architecture, the feature contract, and the conventions (target v14+ / dnd5e or
system-agnostic, defaults always off, one feature per file, settings grouped by feature,
README documents every feature).

## License

[MIT](LICENSE)

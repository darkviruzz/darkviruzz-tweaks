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


### 2. Spell Effect Auto-Apply  ·  *dnd5e · world (GM)*

Applies the Active Effect of a self-cast spell automatically, so nobody has to press
**apply** on the chat card. Typical case: *Mage Armor*, which you almost always cast on
yourself.

**Why the click exists in the first place:** dnd5e only shows an effect in the chat card's
apply tray to a user who is a **GM**, or who authored the message *and* the effect is a
"transfer" effect. The effects a spell applies are not transfer effects, so **players never
see the apply button at all** — only the GM does. That's why the GM ends up clicking apply
for someone else's Mage Armor.

**How it works:** the module listens to dnd5e's `dnd5e.postUseActivity` hook, which fires on
the caster's own client. When all of the conditions below hold, it applies the spell's
effects to the caster directly — using the same logic as dnd5e's own apply button, so the
result is identical (same origin, same concentration link, and re-casting **refreshes** the
existing effect instead of stacking a second copy).

**The chat card** is adjusted to match. Casting a Self/Touch spell without targeting anything
normally leaves dnd5e's target list empty, so the card's effect tray hides its
Targeted/Selected switch, falls back to reading your canvas selection and shows
*"No Tokens Selected"*. This feature records the caster as the target, so the card lists them
properly, and adds an **"Automatically applied to …"** banner above the tray. The banner is
re-checked against the actor's live effects every time the card renders, so it disappears on
its own if the effect is later removed — it never claims something is applied when it isn't.

An effect is auto-applied only when **all** of these are true:

1. the feature is enabled,
2. the item is a **spell** whose name is on the whitelist (case-insensitive),
3. the spell's **range is Self or Touch**,
4. **the caster is the target** — implicit for Self; for Touch this means either nothing was
   targeted, or the caster's own token was the only target,
5. the casting user **owns** the actor (dnd5e refuses effect application otherwise, and this
   feature does not try to work around that).

Anything else — a Touch spell aimed at an ally, a ranged spell, a spell not on the list —
behaves exactly as before and still waits for a manual apply.

| Setting | Default | Effect |
|---|---|---|
| **Auto-Apply Self-Cast Spell Effects** | off | Master switch for the feature. |
| **Auto-Apply Spell Whitelist** | `Mage Armor` | Comma-separated spell names allowed to auto-apply, e.g. `Mage Armor, Shield of Faith`. |

> Names are matched against the spell's name **as it appears on the character sheet**, so if
> your world uses translated compendium items, put the translated name in the list. The range
> check is deliberately based on *range*, not target type: the 2024 *Mage Armor* is
> `range: touch` with target type `willing`, so a target-type check would never match it.


## Development

This repo is built to grow feature-by-feature. See **[CLAUDE.md](CLAUDE.md)** for the
architecture, the feature contract, and the conventions (target v14+ / dnd5e or
system-agnostic, defaults always off, one feature per file, settings grouped by feature,
README documents every feature).

## License

[MIT](LICENSE)

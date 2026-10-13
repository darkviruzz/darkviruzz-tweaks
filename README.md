# Darkviruzz Tweaks & QoL

A personal collection of quality-of-life tweaks for our gaming table, packaged as one
[Foundry VTT](https://foundryvtt.com/) module. Every feature is **individually
toggleable** and **off by default** — the module changes nothing until you opt in.

| | |
|---|---|
| **Foundry VTT** | v14+ |
| **System** | dnd5e 5.x / 6.x (D&D 2024) for system-specific features; the other features are system-agnostic |

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

**Why the click exists in the first place:** the chat card's effect tray is a GM tool. In
dnd5e 5.x only the GM sees it for spell effects; in dnd5e 6.x players see it only if the GM
enables dnd5e's player effects-tray setting (`allowPlayerEffectsTray`, off by default) — and
even then someone still has to click **apply**. That's why the GM ends up clicking apply for
someone else's Mage Armor.

**How it works:** the module listens to dnd5e's `dnd5e.postUseActivity` hook, which fires on
the caster's own client. When all of the conditions below hold, it hands the effect to
**dnd5e's own chat-tray code** — the same code the apply button runs, in whichever dnd5e
version (5.x or 6.x) is installed — so the result is identical: same origin, same
concentration link, and re-casting **refreshes** the existing effect instead of stacking a
second copy.

**The chat card** is adjusted to match. Casting a Self/Touch spell without targeting anything
normally leaves dnd5e's target list empty, so the card's effect tray falls back to reading
your canvas selection and shows *"No Tokens Selected"*. This feature records the caster as the
target, so the card lists them properly, and adds an **"Automatically applied to …"** banner
(above the tray, or at the end of the card when the tray isn't shown to you). The banner is
re-checked against the actor's live effects every time the card renders, so it disappears on
its own if the effect is later removed — it never claims something is applied when it isn't.

An effect is auto-applied only when **all** of these are true:

1. the feature is enabled,
2. the item is a **spell** whose name is on the whitelist (case-insensitive),
3. the spell's **range is Self or Touch**,
4. **the caster is the target** — implicit for Self; for Touch this means either nothing was
   targeted, or the caster's own token was the only target,
5. the casting user **owns** the actor (dnd5e refuses effect application otherwise, and this
   feature does not try to work around that),
6. the spell offers **exactly one** effect. Spells with several effect variants to choose
   from are left to the player — dnd5e's tray pre-selects only one effect as well.

Anything else — a Touch spell aimed at an ally, a ranged spell, a spell not on the list, a
multi-effect spell — behaves exactly as before and still waits for a manual apply.

| Setting | Default | Effect |
|---|---|---|
| **Auto-Apply Self-Cast Spell Effects** | off | Master switch for the feature. |
| **Auto-Apply Spell Whitelist** | `Mage Armor` | Comma-separated spell names allowed to auto-apply, e.g. `Mage Armor, Shield of Faith`. |

> Names are matched against the spell's name **as it appears on the character sheet**, so if
> your world uses translated compendium items, put the translated name in the list. The range
> check is deliberately based on *range*, not target type: the 2024 *Mage Armor* is
> `range: touch` with target type `willing`, so a target-type check would never match it.


### 3. Find My Token  ·  *any system · per-user*

Jump to your own token on big maps — pan **and zoom** to it, select it, and optionally ping
it so the whole table sees where it is.

**How it works:** for players the target is their assigned character's token on the viewed
scene (else a selected token, else the first token they own; hidden tokens are skipped); for
the GM it is the selected token. The view pans and zooms there (`canvas.animatePan`), the
token gets selected, and with the ping option a normal Foundry ping is placed on it. Use it
via a keybinding or a toolbar button:

| Setting / control | Default | Effect |
|---|---|---|
| **Find My Token** (keybinding) | unbound | Assign a key under **Configure Controls → Darkviruzz Tweaks & QoL**. |
| **Show "Find My Token" Button** | off | Adds a crosshair button to the Token controls toolbar (requires a reload). |
| **Find My Token: Zoom Level** | 1.5 | Zoom applied when jumping; `0` keeps your current zoom and only pans. |
| **Find My Token: Ping** | off | Also ping the token after jumping (pings are visible to everyone). |

> Foundry's own **Tab** key also helps: its first press pans to your selected token or your
> character's token and selects it — but it doesn't zoom or ping, and further presses cycle
> through every token you can see.

### 4. Movement History  ·  *any system · world (GM)*

A safety net that clears the combat movement history (what the ruler's movement measurement
counts) at the start of every round.

**How it works:** Foundry records movement for combatants while a combat is running, and
normally clears it itself from its turn events — since v14 at **every turn start for all
combatants**. Those turn events only run while a GM is connected, only when the combat moves
forward, and not when a module advances the combat without them. If you see movement from
earlier rounds still counted, enable this option: whenever a combat's round advances
(not when rewinding), the connected GM's client clears the movement history of all
combatants (`Combat#clearMovementHistories`).

| Setting | Default | Effect |
|---|---|---|
| **Reset Movement History Each Round** | off | Clear all combatants' movement history whenever a round advances. Needs a GM to be connected. |

> Manual alternative built into Foundry: the Combat Tracker's **Clear Movement Histories**
> button and the per-combatant context-menu entry.

### 5. Defeated Tokens  ·  *any system · world (GM)*

Make dead tokens obvious and keep them out of the way.

**How it works:** Foundry only draws the defeated status ("Dead") as a big full-token overlay
when it is created that way — marking a combatant defeated in the Combat Tracker does, a plain
click on "Dead" in the Token HUD doesn't. When a defeated-status effect appears, the GM's
client (a) turns it into a full-token overlay and/or (b) moves the token's stacking order
behind every other token on the scene at the same elevation — so it no longer covers living
tokens or catches clicks meant for them. The previous order is remembered and restored when
the defeated status is removed (e.g. the creature is revived).

| Setting | Default | Effect |
|---|---|---|
| **Show Defeated as Full-Token Overlay** | off | Always show the defeated status as a full-token overlay. |
| **Send Defeated Tokens to the Back** | off | Move defeated tokens behind all other tokens (restored when revived). |

> dnd5e 6 has its own option to apply *Unconscious*/*Dead* automatically at 0 HP during
> combat (system setting `autoApplyDowned` in dnd5e's combat settings, off by default); its
> "Dead" effect already uses the overlay and works together with this feature.

### 6. Pause Control  ·  *any system · world (GM)*

Automatic pausing and unpausing — a replacement for the unmaintained
*Koboldworks – Pause Control* module (last release 2024, made for Foundry 12). **Disable
Koboldworks Pause Control** when you switch these on, otherwise both act at the same time.

**How it works:** the connected GM's client changes the pause state for everyone
(`game.togglePause(…, { broadcast: true })`):

- *on world load* — Foundry always starts a world paused; the GM's client unpauses it when
  the world is ready;
- *on combat start* — when **Begin Combat** is pressed (round 0 → 1);
- *during NPC turns* — on every turn change of a running combat: paused when the current
  combatant has no player owner, unpaused on player turns (works even if that combatant's
  token is on another scene);
- *after combat* — the pause state at the moment the combat was created is remembered and
  restored when the combat is ended/deleted.

| Setting | Default | Effect |
|---|---|---|
| **Unpause When World Loads** | off | Unpause when the GM loads the world. Also unpauses if a GM reloads the page while the game is paused. |
| **Unpause When Combat Starts** | off | Unpause when a combat begins. While *Pause During NPC Turns* is on, that option decides instead. |
| **Pause During NPC Turns** | off | Pause on turns of combatants without a player owner, unpause on player turns. |
| **Restore Pause State After Combat** | off | Restore the pause state from before the combat when it ends. |

> Differences from Koboldworks: its *pause on NPC turns* option has been broken since
> Foundry v13 (it read `combat.data`, which no longer exists); its *unpause on combat*
> unpaused again on every turn change. Both behave as described above here.

---

## Already built in (no tweak needed)

- **GM: move tokens through walls and other tokens** — the GM's *unconstrained movement*
  toggle in the Token controls toolbar.
- **Cycle / find tokens** — **Tab** (see *Find My Token* above).
- **Send to back / bring to front** — the **[** and **]** keys for the selected tokens.
- **Clear movement history** — Combat Tracker button and combatant context menu.


## Development

This repo is built to grow feature-by-feature. See **[CLAUDE.md](CLAUDE.md)** for the
architecture, the feature contract, and the conventions (target v14+ / dnd5e or
system-agnostic, defaults always off, one feature per file, settings grouped by feature,
README documents every feature).

`npm run validate` (Node 20+, no dependencies) checks those conventions mechanically and
`npm test` runs behaviour tests of the features against stubbed Foundry/dnd5e objects; both
run on every pull request and before every release. Releases are published by the
**Release Module** workflow from `module.json` and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)

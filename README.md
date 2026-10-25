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

### 7. Live Token Drag  ·  *any system · world (GM)*

While someone drags a token, everyone else sees the token itself follow the mouse in real
time — on its own, Foundry only shows them the planned path (the ruler). A replacement for
the unmaintained **Live Drag** module (see *Credits*); **disable Live Drag** when you switch
this on, otherwise both modules send positions.

**How it works:** while you drag, Foundry draws a preview copy of the token under your mouse.
Your client sends the preview's position to the others — at most about 30 times per second,
always the latest one — and their clients glide the token's picture there (with its border,
bars, name and status icons), so it moves smoothly. Only the picture moves: the token's
vision and light stay where the token really is until it is dropped, so nobody can peek
around a corner — or uncover fog of war — through someone else's drag. Players only see the
dragged token where they could see it anyway. Your own view while dragging stays exactly as
in Foundry.

- **Drop:** the token is already in place for everyone. The others skip Foundry's movement
  animation so it doesn't walk its path a second time (you, the one dragging, see the normal
  animation).
- **Any other end** — cancelled with a right-click (which first removes waypoints you placed
  with Ctrl+click), dropped on the same spot, or the move was refused: an end signal makes the
  token glide back to where it really is. If the person dragging disconnects mid-drag, the
  token glides back as well.
- **Hidden tokens** are only sent to GMs — Foundry's server delivers those messages to the GMs
  only, players' clients never receive them.
- **Private drags:** hold **Alt** when you *start* dragging and that drag is not shown live —
  the same key Foundry uses to keep your ruler private.
- **Shift-only mode** (optional): a drag only goes live once you press Shift during it, then
  stays live until you drop the token, so you can let go of Shift right away. Mind that Shift is
  also Foundry's "don't snap to the grid" key: while you hold it, the token moves freely between
  grid spaces; once you release it, the token snaps to the grid again.

| Setting | Default | Effect |
|---|---|---|
| **Show Token Drags Live** | off | Everyone sees dragged tokens move in real time. |
| **Live Drag Only With Shift** | off | Only show a drag live after Shift was pressed during it (see above). |

> Pairs well with Foundry's own world setting **Token Drag Vision** (core settings, off by
> default): the person dragging sees vision and light from the preview position in real
> time. On its own that invites peeking around corners; with live dragging, everyone sees the
> token being moved.
>
> The feature uses the module's own message channel, which Foundry sets up when a world is
> launched. If live drags don't show up right after installing or updating the module,
> return to setup and launch the world again.
### 8. File Browser Preview  ·  *any system · per-user (cache: world / GM)*

See images in Foundry's File Browser without clicking them — and without downloading big
maps over and over. Covers what the *Asset Preview* module does (which needs a click), so
**disable Asset Preview** when you switch these on (both draw file names on the tiles).

**How it works:**

- *Preview on hover* — rest the mouse on an image in the **List** or **Thumbnails** view and a
  preview appears beside the browser: the picture, its **size in pixels**, its **file size** and,
  in the Tile Browser, how many **grid squares** it covers at the browser's *Asset Grid Size*
  (pixel width ÷ Asset Grid Size, the same ratio Foundry uses when you drop the tile; shown in
  orange when it isn't a whole number — usually a sign that the Asset Grid Size doesn't match
  the asset pack). Sweeping the mouse over the list loads nothing; only resting on a row does.
  The preview size (256, 384 or 512 px on the long side) is a per-user choice; small images
  are enlarged to it, but at most to twice their own size.
- *Thumbnail cache* — without it, the preview loads the full image, like every other view of
  the File Browser. With it, the first preview of an image larger than the threshold saves a
  thumbnail (max. 512 px, webp, typically 20–60 KB) in
  `Data/modules/darkviruzz-tweaks/storage/thumbs/`, and every later preview — for everyone,
  in later sessions too — shows that thumbnail instead of downloading the original again. If
  the original is replaced by a different file, its thumbnail is made again automatically.
  Thumbnails are made by users who may upload files (GMs, and players with Foundry's *Upload
  New Files* permission); everyone else uses the existing thumbnails and otherwise sees the
  original. The folder survives module updates and can be deleted at any time (thumbnails are
  simply made again). Only files of the normal user-data source are cached, not Foundry's own
  core icons or S3. Images up to 512 px or up to the threshold never get a thumbnail — for them
  the original is already small.
- *File names in the Tiles view* — each tile shows its file name (the full name while you
  hover the tile).

**Drag-and-drop is not affected:** the preview is a separate overlay, nothing in the file list
is changed, and the Tiles/Thumbnails views keep loading their own images — Foundry sizes a
dropped tile from that image, so swapping in a 512 px thumbnail would shrink it.

| Setting | Default | Effect |
|---|---|---|
| **File Browser: Preview on Hover** | off | Show a preview, pixel size, file size and grid squares when resting the mouse on an image in the List or Thumbnails view. Per user. |
| **File Browser: Preview Size** | Medium (384 px) | Size of the hover preview: Small (256 px), Medium (384 px) or Large (512 px). Per user. |
| **File Browser: File Names in Tiles View** | off | Show the file name on every tile in the Tiles view. Per user. |
| **File Browser: Cache Thumbnails of Large Images** | off | Save small thumbnails of large images in this module's storage folder and use them for previews. World setting (GM). |
| **File Browser: Thumbnail Threshold (KB)** | 250 | Images up to this file size are previewed directly; larger ones get a cached thumbnail. `0` = every image larger than 512 px. World setting (GM). |
### 9. Token Art Picker (Too Many Tokens)  ·  *any system · world (GM) + per-user button*

Choose token art from the ~16,000 D&D and ~7,700 Pathfinder images of *Too Many Tokens –
Online* in a gallery with preview — a replacement for that module's macro *"DND/PF – Get Too
Many Tokens For Selected Tokens"*. **The module *Too Many Tokens – Online* must be
installed**; it may stay deactivated — the picker only reads its image lists, and the images
are loaded from GitHub exactly as before.

**How it works:**

- **Open it** for the selected tokens with the Token HUD button (option below) or a
  keybinding; for an actor's prototype token via **right-click on the actor in the Actors
  sidebar → Token Art (Too Many Tokens)**; or from a macro:
  `game.modules.get("darkviruzz-tweaks").api.openTokenArtPicker();`
- **Creature:** guessed from the current Too Many Tokens image, the token/actor name and the
  compendium the actor came from (D&D 2024 names such as *Tough* → *Thug*, *Warrior Veteran*
  → *Veteran* are mapped). Suggestions appear as buttons; the search field offers every
  creature (Enter takes the best match). Switch between the D&D and Pathfinder collections.
- **Gallery:** filter chips built from the file names (*Human*, *Female*, *Melee*, *Forest* …,
  combined with AND, counts update live) and a text filter. Hover shows a large preview.
  Click picks one image, **Ctrl-click** adds/removes, **Shift-click** adds a range;
  *Select all matching* and *Show only selected* help with larger selections.
- **Apply** to the selected tokens (several images are spread randomly — no repeats until
  each was used once), the prototype token and/or the actor portrait.
- **Wildcard:** with the prototype option and at least two images, the selection is stored
  on the actor and every newly placed token of it gets a random image from it (never the same
  one twice in a row). Tokens placed with a different image (e.g. copy & paste) keep it.
  Reopening the picker for that actor shows the stored images; applying without *Wildcard*
  removes them.
- **Old Too Many Tokens wildcards** (prototype path `tmtopptmtopptmtopp_…`) are recognised:
  their images are preselected, and applying with *Wildcard* converts them so they no longer
  need the Too Many Tokens module to be active.
- Only tokens and actors you own are changed.

| Setting / control | Default | Effect |
|---|---|---|
| **Enable Token Art Picker** | off | World switch (GM): the picker (sidebar entry, keybinding, macro API, HUD button) and the wildcard on token placement. |
| **Token Art Picker: Token HUD Button** | off | Per user: adds an image button to the Token HUD (right column) for the selected tokens. |
| **Open Token Art Picker** (keybinding) | unbound | Opens the picker for the selected tokens. Assign it under **Configure Controls → Darkviruzz Tweaks & QoL**. |

> Differences from the Too Many Tokens macro: it showed no images at all; its checkbox
> columns assumed the attribute words stand at fixed positions in the file names (they
> don't, so variants were missed); and its wildcard is resolved by a `createToken` hook that
> runs on every connected client, changes the token after it was created and — in v2.0.1 —
> throws a console error for every other token placed. Here the image is chosen before the
> token is created, on the placing client only. Tokens already on your scenes are plain image
> links and keep working with Too Many Tokens deactivated; actors with an old Too Many Tokens
> wildcard need converting once (see above).

---

### 10. Savage Attacker  ·  *dnd5e · world (GM)*

Automates the 2024 feat **Savage Attacker** (*once per turn when you hit a target with a weapon,
roll the weapon's damage dice twice and use either roll*). In Foundry the feat is only text, and
dnd5e 6's new rule effects can't express it (they cover d20 rolls and attack/check/save bonuses,
not damage).

**How it works** (for every creature that has the feat — player characters, sidekicks, NPCs):

- *Automatic* — the **first weapon damage roll of a turn** rolls the weapon dice twice and keeps
  the higher total. Dice So Nice shows both sets; the card shows "Savage Attacker: 4 / 7 → 7".
  "Once per turn" counts every creature's turn of the running combat: an **opportunity attack**
  on someone else's turn qualifies again, the second attack of your own turn (Extra Attack) does
  not. If the attack was a **known miss** (exactly one target with a known AC), the chance is not
  used up and the next hit gets it; with several or no targets the hit is unknown and the roll
  counts. Outside combat every weapon damage roll qualifies. On a critical hit the doubled
  weapon dice are rolled twice, as the rules say.
- *Button* — every other weapon damage card of a creature with the feat gets a **Savage Attacker**
  button (for the GM and the creature's owners). It rolls the weapon dice of that card again and
  keeps the higher result; the card's damage — and dnd5e's damage tray — then uses the new total.
  The button stays usable after the turn's use and only notes "already used this turn": which hit
  was really the first is the GM's call. Changing a card needs the GM or the card's author.
- Only real weapons count — not an Unarmed Strike (not a weapon in the 2024 rules), not spells.
  Extra damage dice (Hex, Sneak Attack, a second damage part) are not re-rolled, only the
  weapon's own dice.

| Setting | Default | Effect |
|---|---|---|
| **Savage Attacker** | Off | *Automatic (first hit per turn) + button*, *Button only* or *Off*. World setting (GM). |

## Already built in (no tweak needed)

- **GM: move tokens through walls and other tokens** — the GM's *unconstrained movement*
  toggle in the Token controls toolbar.
- **Cycle / find tokens** — **Tab** (see *Find My Token* above).
- **Send to back / bring to front** — the **[** and **]** keys for the selected tokens.
- **Clear movement history** — Combat Tracker button and combatant context menu.
- **See where others are moving** — while a token is dragged, Foundry shows everyone its
  planned path (ruler); hold **Alt** when you start dragging to keep it private. *Live Token
  Drag* adds the token itself.


## Credits

- **Live Token Drag** is based on the idea of
  [Live Drag](https://github.com/Anyndol/FoundryVTT-LiveDrag) by **Anyndel** (MIT License,
  © 2024 Anyndol), which is no longer maintained (last release 1.0.4, made for Foundry 12).
  This module re-implements it for Foundry v14 — without copying its code — and fixes its
  known problems, most visibly that a token turned invisible for the person dragging it when
  it was dropped on its own square or the drag was cancelled.


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

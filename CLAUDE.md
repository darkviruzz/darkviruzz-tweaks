# CLAUDE.md — working guide for this module

> **This file is the source of truth for how to work in this repo. Read it fully before
> making changes. KEEP IT UP TO DATE: whenever you learn something new (a Foundry/dnd5e
> API detail, a gotcha, a new convention, a new feature), update this file in the same
> change so the next session benefits. Treat that as part of "done". If you find a "fact"
> here to be wrong, correct it (and say what disproved it) — don't leave contradictions.**

## What this module is

**Darkviruzz Tweaks & QoL** (`id: darkviruzz-tweaks`) is a personal collection of
quality-of-life tweaks for a home game. It is intentionally a multi-feature "grab bag":
each tweak is a self-contained feature that the user can toggle on/off.

> **This repository also hosts a second, independent Foundry module.**
> `caverns-of-blackthorn/` is a *content* module (an adventure with compendium packs),
> not a tweak. It has its own `module.json`, its own build and its own
> **[caverns-of-blackthorn/CLAUDE.md](caverns-of-blackthorn/CLAUDE.md)** — read that one
> when working in it, not this file. The rules below (one feature per file, settings
> grouped by feature, defaults off) do not apply there. Its CI/release workflow is
> `.github/workflows/blackthorn.yml` (root — GitHub only runs workflows from there; an
> earlier copy inside the sub-folder never ran). Blackthorn releases use the tag prefix
> `cob-v*` and are **never** marked "Latest" — otherwise this module's manifest URL
> (`releases/latest/download/module.json`) would serve the Blackthorn manifest. Blackthorn's
> stable manifest is the rolling release `cob-latest`. Details in its CLAUDE.md.
> Consequence for THIS module: its release workflow must keep `make_latest: true`.

## Non-negotiable conventions

All of these except 7 are checked by `tools/validate.mjs` (see *Tooling*).

1. **Target platform.** Always build for **Foundry VTT v14+**. System-specific features
   target the **dnd5e** system (D&D 2024 / "5.5e"): support **5.3.x and 6.x** — the table
   runs 5.3.3 as of 2026-10 and plans to move to 6. A feature is either dnd5e-specific
   (`requiresSystem: "dnd5e"`) or **system-agnostic** (no `requiresSystem`, must not assume
   any system). Never declare `relationships.systems` in module.json — that would hide the
   module from worlds of other systems.
2. **Defaults = vanilla behaviour.** Every Boolean setting defaults to **false**, every
   keybinding ships **unbound** (`editable: []`). The module must never alter default
   Foundry/system behaviour unless the user opts in. New features start disabled.
3. **One feature = one file** under `scripts/features/`, registered in
   `scripts/features/index.js`. No mixing unrelated tweaks in a file. Shared helpers go in
   `scripts/lib/`.
4. **No Foundry globals at import time.** Feature files may only touch `game`, `Hooks`,
   `CONFIG`, `canvas`, `ui`, `foundry`… inside functions / `init()` — never at module top
   level. (The validator imports the registry in plain Node to check the contract.)
5. **All settings in one settings tab, grouped by feature.** Each feature declares a
   `category`; the loader injects category headers (see `scripts/lib/settings-categories.js`).
   Do not create separate settings menus per feature.
6. **Docs move with the code.** README explains every feature (*how it works* + every
   setting/keybinding with its default), this file's *Current features* table lists every
   feature, and CHANGELOG.md gets a section for every release.
7. **Localise all user-facing strings** via `lang/en.json` and `lang/de.json` using `DT.*`
   keys (same keys, same `{placeholders}` in both). Never hard-code display strings in JS;
   build DOM with `textContent`, not `innerHTML` with translated strings.
8. **Verify APIs against real source before using them.** Don't guess Foundry/dnd5e APIs.
   dnd5e: clone `foundryvtt/dnd5e` at the `release-x.y.z` tag. Foundry has no public source
   repo, but **an installed Foundry ships its real source**: readable client code in
   `<install>/client/**/*.mjs` and the (minified) server in `<install>/dist/`. On the dev
   machine a v14 install (build 14.364) lives in `Documents/foundryuserdata/foundry` — grep it
   first; it beats every other source. Otherwise use the v14 API docs
   (https://foundryvtt.com/api/), release notes, the League `foundry-vtt-types` repo, a v13
   client-source mirror for implementation details (mark those "v14 impl unverified"), and
   modules verified on v14. Record confirmed facts in
   *Verified facts & gotchas* below. Prefer reusing the system's own code paths over
   re-implementing them (see *Spell Effect Auto-Apply*).

## Architecture

```
module.json                     manifest (id, compatibility v14+, esmodule = scripts/main.js, socket: true)
CHANGELOG.md                    one "## [x.y.z]" section per release = the release notes
scripts/
  constants.js                  exports MODULE_ID (must match module.json id)
  main.js                       loader: registers settings + keybindings, runs init(), injects category headers
  features/
    index.js                    FEATURES registry (settings-display order) — add new features here
    ability-score-prominence.js dnd5e display tweak (per-user)
    spell-effect-autoapply.js   dnd5e auto-apply of self-cast spell effects (world/GM)
    find-my-token.js            pan/zoom/select/ping your own token (per-user + keybinding)
    movement-history-reset.js   clear combat movement history each round (world/GM)
    defeated-tokens.js          defeated = full overlay + sent to back (world/GM)
    pause-control.js            auto pause/unpause: world load, combat start, NPC turns, restore (world/GM)
    live-token-drag.js          everyone sees token drags live (world/GM; module socket)
    file-picker-preview.js      File Browser hover preview, thumbnail cache, tile names (user + world)
  lib/
    settings-categories.js      renderSettingsConfig -> per-feature category headers
    socket.js                   the module socket channel, messages routed per feature id
    token-art-picker.js         Too Many Tokens art picker window + wildcard on placement (world + user)
  lib/
    settings-categories.js      renderSettingsConfig -> per-feature category headers
    too-many-tokens.js          data adapter for TMT Online's image lists (fetch, parse, match, pools)
styles/
  settings.css                  category-header styling
  <feature>.css                 per-feature styling (every file must be listed in module.json "styles")
lang/
  en.json, de.json              DT.* localisation keys
tools/validate.mjs              zero-dependency convention/consistency checks (`npm run validate`)
tools/test-features.mjs         behaviour tests with stubbed Foundry/dnd5e objects (`npm test`)
package.json                    repo tooling only (type: module, scripts) — NOT shipped
.github/workflows/validate.yml  runs the validator on every PR and push to main
.github/workflows/release.yml   the ONLY release path (tag v* or manual dispatch; make_latest: true)
.github/workflows/blackthorn.yml CI + releases of caverns-of-blackthorn (tag cob-v*, never "Latest")
```

`scripts/main.js` is the only esmodule entry; it imports everything else with relative
`./...js` paths (browser ESM — always include the `.js` extension). The shipped zip contains
only `module.json scripts styles lang README.md LICENSE`.

The loader isolates features: each feature's registration + `init()` runs in its own
try/catch, so one broken feature doesn't stop the others from loading.

## How to add a new feature (do exactly this)

1. Create `scripts/features/<kebab-name>.js` that default-exports a **feature object**:

   ```js
   import { MODULE_ID } from "../constants.js";

   const KEY = "myFeatureToggle";

   function doThing() { /* may use game, canvas, … — only inside functions */ }

   export default {
     id: "myFeature",                    // unique camelCase id
     requiresSystem: "dnd5e",            // OMIT for system-agnostic features
     category: {
       label: "DT.Categories.MyFeature.Label",
       hint:  "DT.Categories.MyFeature.Hint"   // optional
     },
     settings: [
       { key: KEY, options: {
           name: "DT.Settings.MyFeatureToggle.Name",
           hint: "DT.Settings.MyFeatureToggle.Hint",
           scope: "user",                // "user" (per-user), "world" (GM/global) or "client"
           config: true,
           type: Boolean,
           default: false,               // ALWAYS vanilla behaviour
           onChange: () => {}
       } }
     ],
     keybindings: [                      // optional
       { action: "myAction", options: {
           name: "DT.Keybindings.MyAction.Name",
           hint: "DT.Keybindings.MyAction.Hint",
           editable: [],                 // ALWAYS unbound — the user assigns a key
           onDown: () => { doThing(); return true; }
       } }
     ],
     init() { /* register Hooks here; called once during "init" */ }
   };
   ```

2. Register it in `scripts/features/index.js` (import + `FEATURES` entry).
3. Add the `DT.*` i18n keys to **both** `lang/en.json` and `lang/de.json`.
4. If it needs CSS, add `styles/<feature>.css` and list it in `module.json` `"styles"`.
5. Add a **README section** (how it works + table of every setting/keybinding with default),
   a row in *Current features* below, and an entry in CHANGELOG.md.
6. Add behaviour tests to `tools/test-features.mjs` (drive the feature's hooks/keybindings
   with stubbed documents — happy path AND the guards: setting off, not the active GM,
   wrong system shape…).
7. Run `npm run validate` and `npm test`. Then release (see below). Update this file with
   anything learned.

Settings keys are unique strings registered under `MODULE_ID`; prefix them per feature
(e.g. `ability*`, `spellAutoApply*`, `findToken*`, `defeated*`). The first setting in a
feature's `settings` array is the anchor the category header is inserted before (settings of
one feature are registered contiguously by the loader). Settings that need a reload to take
effect (e.g. ones read by `getSceneControlButtons`) use `requiresReload: true`.

World-level features that write documents (tokens, effects of other actors…) must run on
exactly one client: guard with `game.users.activeGM?.isSelf`.

Features that need to talk to other clients without writing documents use the shared module
socket in `scripts/lib/socket.js`: `onSocketMessage(featureId, handler)` in `init()` and
`emitSocketMessage(featureId, payload, {recipients, volatile})`. No socketlib, no globals.
`module.json` has `"socket": true` (the validator checks it whenever a script listens on
`game.socket`).

## Tooling

`npm run validate` (= `node tools/validate.mjs`, Node 20+, no dependencies) fails on:
module.json inconsistencies (version format, `download` must be
`<url>/releases/download/v<version>/module.zip`, stable `manifest`, referenced files exist,
every `styles/*.css` listed, MODULE_ID match, `compatibility.minimum` ≥ 14, no
`relationships.systems`); syntax errors in any script; i18n keys used in scripts but missing
from en.json; en/de key or `{placeholder}` mismatch; feature-contract violations (ids,
duplicate keys/actions, missing i18n keys, Boolean default ≠ false, bound keybindings, init()
throwing against stubbed globals, a feature touching Foundry globals at import time); README
not mentioning a setting/keybinding name; a feature id missing from this file; no CHANGELOG
section for the current version; a script listening on `game.socket` without
`"socket": true` in module.json. It warns about en.json keys that look unused.

`npm test` (= `node tools/test-features.mjs`) loads the real feature files, captures the
hooks/keybindings they register and drives them with stubbed Foundry/dnd5e objects (both
dnd5e 5.x and 6.x message shapes). It verifies OUR logic and guards against the APIs as
documented below — it cannot prove Foundry behaves like the stubs, so keep the stubs in sync
with the verified facts and still test in a real world when possible. A feature whose logic
is mostly DOM/network glue may export its pure parts as a named `internals` object for the
tests (see `file-picker-preview.js`); the loader only uses the default export. Both commands run in
CI on every PR and before every release.

## Release process

`module.json` is the single source of truth for the version. The manifest URL is stable:
`https://github.com/darkviruzz/darkviruzz-tweaks/releases/latest/download/module.json`.

1. Add a `## [x.y.z] — YYYY-MM-DD` section to CHANGELOG.md (written for players/GMs — it
   becomes the release notes verbatim). Feature branches that are not tied to a release yet
   (several run in parallel) put their entries under `## [Unreleased]` and leave `version`
   alone; move the entries into the version section when that release is cut.
2. Bump `version` in `module.json` and set `download` to the new `v<version>` zip URL.
3. `npm run validate`, commit, PR, squash-merge to `main`.
4. Release: push the matching tag (`git tag vX.Y.Z <merge-commit> && git push origin vX.Y.Z`)
   **or** run *Actions → Release Module → Run workflow* on `main`. The workflow validates,
   refuses a tag that doesn't match module.json, extracts the CHANGELOG section, builds the
   zip (files at the root, no wrapping folder) and publishes `module.json` + `module.zip`.
   **Never** create releases by hand with `gh release create` — a manual release plus the
   tag-triggered workflow race each other and overwrite assets/notes.
5. Verify the public manifest serves the new version and the zip downloads (HTTP 200).
   GitHub's release CDN can lag a few seconds and this machine's connection to it is
   flaky (resets/404 right after publishing) — retry before concluding something is wrong.

Compatibility note: the install/manifest mechanism requires the **repo to stay public**.

### Squash-merge conflict gotcha

PRs here are **squash-merged**, so `main` gets ONE commit whose tree matches the branch but
whose history doesn't contain the branch's commits. If you then keep working on that same
branch and open another PR, git's 3-way merge (base = the old merge-base) sees both sides
editing the same regions and reports **conflicts even when `main`'s tree is identical to an
ancestor of your branch**. Fix: branch fresh off `main`, put the final content there, and PR
that — it merges as a clean fast-forward. Don't try to resolve the phantom conflict.

## Verified facts & gotchas (keep adding here)

### Foundry VTT v14 — general (verified 2026-10, v14 API docs 14.368 unless noted)

- **ApplicationV2 render hooks fire for the whole class chain**, e.g. `renderActorSheetV2`
  for dnd5e's `CharacterActorSheet`/`NPCActorSheet` and Tidy's Quadrone sheet; the element
  argument is an `HTMLElement`. `renderActorSheet` (V1) is only a fallback for legacy sheets;
  handle both shapes: `html instanceof HTMLElement ? html : html?.[0]`.
- **Re-render open sheets:** iterate `foundry.applications.instances` (ApplicationV2) AND
  `ui.windows` (legacy V1 only). `ui.windows` is not deprecated in v14 (no warning found).
- **Settings scopes:** `"user"` (per-user, synced across the user's devices; v13+),
  `"world"` (GM/global), `"client"` (per-browser/device).
- **Settings window:** `SettingsConfig` → `CategoryBrowser` → ApplicationV2; inputs are named
  `"<namespace>.<key>"` inside `.form-group`; the module's settings sit in
  `section[data-category="<moduleId>"]`. Per-feature headers: find
  `[name="<MODULE_ID>.<key>"]`, `.closest(".form-group")`,
  `insertAdjacentElement("beforebegin", header)` — idempotent, degrade gracefully.
- **Localization:** `game.i18n.has(key, fallback = true)`, `localize(key)`, `format(key, data)`.
- **Keybindings:** `game.keybindings.register(ns, action, {name, hint, editable, uneditable,
  onDown, onUp, repeat, reservedModifiers, restricted, precedence})`; `editable: []` = no
  default key; registering after `init` throws. `onDown` returning true consumes the event.
- **Scene controls (v13+):** `getSceneControlButtons(controls)` where `controls` is
  `Record<string, SceneControl>` (`controls.tokens` = token layer) and `tools` is a record.
  One-shot button tool: `{name, title (i18n key), icon, order, button: true, visible,
  onChange}`. `onClick` is deprecated since v13 (until v15).
- **Canvas:** `canvas.animatePan({x, y, scale, duration = 250, speed, easing})`;
  `canvas.ping(origin, {color, duration, name, size, style, pull})` displays locally AND on
  every other client; styles `CONFIG.Canvas.pings.types` (PULSE, ALERT, PULL, ARROW).
- **Core Tab key** (`core.cycleView`): only with the select tool and no active ruler; first
  press → controlled token, else `game.user.character`'s token; then cycles through every
  non-hidden token the user can OBSERVE (all tokens for a GM), sorted by distance from the
  top-left; pans without zoom and controls the token (v13 source; v14 id unverified).
- **Tokens of an actor:** `Actor#getActiveTokens(linked = false, document = false)` (viewed
  scene only); `Actor#getDependentTokens({concreteOnly, linked, scenes})` (all scenes;
  `concreteOnly` excludes ephemeral tokens and becomes the default in v15; a synthetic actor
  returns exactly its own token). `canvas.tokens.ownedTokens` = every token for a GM.
- **Stacking order:** `TokenDocument#sort` exists. Drawing and mouse hit-testing order by
  elevation, then sort (then controlled/hover) (v13 source; v14 impl unverified). Core
  keybindings `core.sendToBack` `[` / `core.bringToFront` `]` act on controlled objects
  (`PlaceablesLayer#_sendToBackOrBringToFront`, skips locked documents).
- **Movement history:** `TokenDocument#movementHistory`, `#clearMovementHistory()`,
  `Combat#clearMovementHistories(combatants?)` (all combatants when omitted; skips empty
  histories; updates with `noHook`, so no `updateToken` hook). Recorded only while the
  token's combat has started. Core clears it in `Combat#_clearMovementHistoryOnStartTurn`
  — since **14.353 for ALL combatants at every turn start** (before: only the starting
  combatant) — and on combatant exit / combat deletion. Turn events run only on the active
  GM's client, only when moving forward, never for `{turnEvents: false}` updates; no setting
  controls this ("up to the system", foundryvtt#13686). Combat Tracker has a *Clear Movement
  Histories* button (v13+). `combatTurnChange(combat, prior, current)` fires on all clients
  after the update; `combatRound` fires BEFORE the update on the initiating (maybe player)
  client — don't write from it.
- **Combat update options:** `nextRound`/`nextTurn` pass `{direction: 1}`,
  `previousRound`/`previousTurn` `{direction: -1}` to `combat.update` (visible as `options`
  in the `updateCombat` hook).
- **Status effects:** `CONFIG.specialStatusEffects.DEFEATED` = `"dead"` (core and dnd5e).
  In v14 `CONFIG.statusEffects` is an object keyed by id (array access still works).
  The full-token **overlay is still `flags.core.overlay`** (ActiveEffect has no overlay field;
  the new `showIcon` 0|1|2 is unrelated). `Actor#toggleStatusEffect(id, {active, overlay})`
  sets the overlay only when CREATING; with `active: true` on an existing effect it returns
  `true` and changes nothing. The combat tracker's defeated toggle uses `overlay: true`; a
  Token HUD left-click does not. Hook `applyTokenStatusEffect(token, statusId, active)` fires
  on every client but only for rendered tokens on the viewed scene and only for special
  statuses — for document-level reactions prefer `create/deleteActiveEffect`.
- **Active effect durations:** `ActiveEffect.getInitialDuration()` is deprecated in v14
  (until v16) → `ActiveEffect.getEffectStart(combat = game.combat)`. `ActiveEffect#changes`
  moved to `system.changes` in v14.
- **Users:** `game.users.activeGM` and `User#isActiveGM` both exist; use
  `game.users.activeGM?.isSelf` to pick the one client that writes.
- **Context menus (v14):** `ContextMenuEntry` is `{label, icon, visible, onClick, group,
  classes}` — `label` is localised by the menu, `visible: boolean | (target: HTMLElement) =>
  boolean`, `onClick(event: PointerEvent, target: HTMLElement)`. (The v13 keys
  `name`/`condition`/`callback` are what older modules use.) Document directories fire
  `get<DocumentName>ContextOptions(application, menuItems)`, e.g. `getActorContextOptions`;
  mutate `menuItems`. Sidebar entries carry `data-entry-id` (v13; v14 impl unverified — we
  also fall back to `data-document-id`).
- **`preCreate<Document>` hooks** `(document, data, options, userId)` fire **only on the
  client that initiates the creation**, may modify the pending document with
  `document.updateSource(...)` and cancel with `return false` — the right place to change a
  token's image before it exists (no second update, no other client involved).
  `TokenDocument#baseActor` = the world-level actor a token represents.
- **Token HUD (v13/v14):** `renderTokenHUD(hud, html)` — `html` is an HTMLElement with
  `.col.left` / `.col.right` columns of `<button type="button" class="control-icon">`;
  `hud.object` is the Token placeable. Add buttons with your own click listener and **no**
  `data-action` (the HUD is ApplicationV2 and would try to dispatch it). Source: module
  token-border 1.0 (verified v14) and Token Variant Art 6.1 (v13); TokenHUD is replaceable via
  `CONFIG.Token.hudClass`.
- **ApplicationV2 without Handlebars:** implement `_renderHTML(context, options)` (return an
  element) and `_replaceHTML(result, content, options)` (`content.replaceChildren(result)`);
  `_prepareContext` may be async (load data there). Actions: `DEFAULT_OPTIONS.actions` map
  `data-action` → static handler `(event, target)` with `this` = the app (left click only
  unless `{buttons, handler}`). We override `get title()` to localise the window title
  ourselves. A feature file must not `extend foundry.applications.api.ApplicationV2` at
  import time (Foundry global) — build the class lazily inside a function (see
  `token-art-picker.js` `pickerClass()`).
- **CSS gotcha:** an element with the `hidden` attribute is still shown if one of our rules
  sets `display` on it — scope a `[hidden] { display: none !important; }` rule.

### dnd5e default actor sheet (verified against dnd5e 6.0.6; same structure in 5.3.3)

- **Ability tile DOM:** `.ability-score[data-ability]` containing `a.label.ability-check`
  (`data-action="roll"`), `.mod` and `.score` — character sheet partial
  `templates/actors/character-ability-scores.hbs` (top row rendered with `flipped`), the NPC
  header (`templates/actors/npc-header.hbs`) inlines the same structure (+ optional img,
  `.save-tab`). "Editable" means **edit mode** (`isEditable && isEditMode`): then `.mod`
  holds only a config `<button>` (the modifier is NOT shown) and `.score` an
  `<input name="system.abilities.<key>.value">`. Don't hijack that input/button.
- **Vanilla sizes:** modifier **16px bold** (`--font-size-16`), score **13px** in a 50×23
  black pill (`less/v2/actors.less`, `character.less`). dnd5e uses **no `!important`** there.
  *(Corrected 2026-10-13: earlier notes claimed dnd5e uses `!important` and that vanilla
  shows the score large — both disproved by the LESS source and the user's screenshots.)*
- **Why our overrides need `!important`:** specificity. dnd5e scopes everything under
  `.dnd5e2.sheet.actor` (e.g. `.dnd5e2.sheet.actor .ability-scores .ability-score .mod` =
  6 classes), which beats our `.dt-asp-swap .ability-scores .ability-score .mod` (4 classes).
- **Ability check roll:** `actor.rollAbilityCheck({ ability })` (5.x and 6.x). The legacy
  `rollAbilityTest` no longer exists in 6.0.

### Tidy 5e Sheets (module `tidy5e-sheet`, verified against v13.4.3 — NOT re-checked for dnd5e 6)

- The non-classic **Quadrone** character sheet is ApplicationV2 and fires the STANDARD
  `renderActorSheetV2` hook. **It does NOT fire `tidy5e-sheet.renderActorSheet`** — that
  hook is for Tidy's legacy **V1** sheets only (verified: `Tidy5eSheetsApi.ts` says "App V1
  ... or the standard sheet render hooks in App V2", and
  `Tidy5eCharacterSheetQuadrone.svelte.ts` only calls `tidy5eSheetsPrepareSheetContext`,
  never `tidy5eSheetsRenderActorSheet`). So to touch the Quadrone DOM, hook
  `renderActorSheetV2`; the Svelte DOM is already mounted by then (a short
  `requestAnimationFrame` retry covers any late mount).
- Verified ability DOM (Quadrone, `AbilityScore.svelte`): tile
  `[data-tidy-sheet-part="ability-container"]` (= `.ability.<key>`); modifier number
  `[data-tidy-sheet-part="ability-value"]` (large by default) with its sign in
  `[data-tidy-sheet-part="ability-mod"]`, both inside the roll button
  `[data-tidy-sheet-part="ability-roller"]`; score number = the value span inside the
  `<label data-tidy-sheet-part="ability-score">` (use `> span:not(.ability-proficiency-indicator)`);
  save in `[data-tidy-sheet-part="ability-save-roller"]`. The Tidy **classic** sheet uses a
  different DOM — don't assume these selectors there.
- **Font / colour tokens** (`src/less/variables-quadrone.css` v13.4.3):
  `--t5e-font-data-xlarge = 700 var(--font-size-28)` (modifier value);
  `--t5e-font-label-xlarge = 500 var(--font-size-28)` (modifier sign, but abilities.css
  overrides sign to `font-size: 1.5rem`);
  `--t5e-font-title-small = 400 var(--font-size-18) title-font` (score);
  `--t5e-color-text-lightest = var(--t5e-color-palette-grey-40)` (sign colour, dark theme: grey-60).
- **CSS + JS data-attribute pattern** (Ability Score Prominence): when a pure CSS reorder
  would move unwanted siblings (abbreviation tied to the modifier container), JS stamps
  `data-*` attributes onto the tiles after `renderActorSheetV2`, and CSS
  `content: attr(...)` pseudo-elements display the swapped values. Rules are guarded with
  `[data-attribute]` selectors so nothing flashes before the attributes exist. Stamped:
  `labelContainer.dataset.dtAspScore` (score for the badge), `scoreLabel.dataset.dtAspRowlabel`
  (localised "Mod" label), `scoreLabel.dataset.dtAspMod` ("+3"). The "Score" text node is
  hidden via `font-size: 0` on the label; `.ability-proficiency-indicator` gets
  `font-size: revert`.

### General patterns

- **Presentational sheet tweaks = root class + CSS.** Toggle one class on the sheet root in
  the render hook and put all per-sheet selectors in CSS. The CSS cascades whenever the
  (possibly Svelte-mounted) inner DOM appears — no render-timing races, and supporting
  another sheet is just more selectors.
- **Derive UI state from live documents, not just flags.** A flag saying "applied" goes stale
  if the effect is deleted; re-checking the actor's effects on each render keeps the UI honest.

### dnd5e Activities / Active Effects — 5.3.3 (verified against `release-5.3.3`)

> dnd5e git tags are prefixed `release-` (e.g. `release-5.3.3`), **not** bare `5.3.3` — plain
> tag URLs on raw.githubusercontent.com 404. Clone the repo to inspect it properly.

- **Activity use hooks** (`module/documents/activity/mixin.mjs`, in `Activity#use()`):
  `dnd5e.preUseActivity(activity, usageConfig, dialogConfig, messageConfig)` and
  `dnd5e.postUseActivity(activity, usageConfig, results)` (same signatures in 6.0).
  `dnd5e.useActivity` and `dnd5e.postUseItem` **do not exist**; the 3.x `dnd5e.useItem` was
  removed in 4.x.
- **Hooks fire only on the triggering client.** dnd5e has no socket layer. The cross-client
  signal is the chat message. So for "the caster does X to their own actor", act in
  `postUseActivity` — the caster's client runs it and owns the actor.
- **`postUseActivity` fires AFTER the chat message is created**; `results.message` is the
  created ChatMessage document (raw data if `create === false`).
- **The activity passed to the hooks belongs to a temporary item CLONE** (also in 6.0) —
  `use()` does `item = this.item.clone({}, { keepId: true })`. Resolve real documents before
  relying on uuids: `actor.items.get(activity.item.id)` then `realItem.effects.get(id)`.
- **`activity.applicableEffects`** (5.x) → the `ActiveEffect5e[]` the tray would offer,
  filtered by spell level. `activity.isSpell` → `item.type === "spell"`.
- **Range / target live on BOTH item and activity.** The activity inherits the item's values
  unless `range.override` / `target.override` is set, so `activity.range` is the effective
  value. `range.units` ∈ movement units ∪ rangeTypes (`self`,`touch`,`spec`,`any`).
- **GOTCHA — don't detect "self-cast" via `target.affects.type === "self"`.** The 2024
  *Mage Armor* is `range.units: "touch"` with `target.affects.type: "willing"`. Key off
  **range** (`self`/`touch`) plus the actual targets.
- **Targets (5.x)** are snapshotted onto the usage message as `flags.dnd5e.targets`,
  `{name, img, uuid, ac}` with `uuid` = the targeted token's ACTOR uuid; dnd5e builds that
  flag into `messageConfig.data` before firing `preUseActivity`, so the hook can fill it in.
- **Tray visibility (5.x):** `game.user.isGM || (e.transfer && message.author === game.user)`
  — spell effects are `transfer: false`, so players never see the apply button.
- **Applying an effect (5.x):** `EffectApplicationElement#_applyEffectToActor(effect, actor)`
  uses only the element's `chatMessage` (concentration via `message.system.concentration`,
  `scaling`, `spellLevel`, origin = concentration ?? effect, refresh-instead-of-duplicate by
  `e.origin === origin.uuid`, `getInitialDuration()`). We call it on a detached element
  (see below) instead of re-implementing it.
- **Chat-card effect tray targets** (`targeted-application-mixin.mjs`): with no recorded
  targets the tray hides its Targeted/Selected switch, forces `"selected"` mode and prints
  *"No Tokens Selected"* — that's why untargeted self-casts showed it.
- **No native "already applied" state** for a target; any indicator is your own element,
  inserted as a **sibling** of `<effect-application>` (the tray builds its inner DOM in
  `connectedCallback`).
- **`dnd5e.renderChatMessage(message, html)`** fires after dnd5e's card modifications
  (also in 6.0); `html` is an `HTMLElement`. Prefer it for decorating dnd5e chat cards.

### dnd5e 6.0 changes (verified against `release-6.0.6`, requires Foundry ≥ 14.367)

- **Targets moved:** `messageConfig.data.system.targets` / `message.system.targets`
  (`TargetsField`, `module/data/chat-message/fields/targets-field.mjs`), entries
  `{actor, ac, img, name, token}` — `actor` = actor uuid, `token` = token uuid, **no `uuid`**.
  Still filled before `preUseActivity`. Nothing writes `flags.dnd5e.targets` any more (a
  migration deletes it). `getTargetDescriptors()` is deprecated (6.0 → 6.2).
  `TargetsField.getDescriptors(tokens)` is static.
- Other chat-message flags moved into system data: `item`/`activity` → `system.item`/
  `system.activity`, `originatingMessage` → `system.origin`. The card HTML changed
  substantially ("don't rely on the previous structure").
- **`activity.applicableEffects` now returns effect PROFILES**, not documents; use
  `await activity.getApplicableEffects()`. The tray itself uses
  `await message.system.getEffects()` (usage messages) — prefer that.
- **Tray visibility:** `game.user.isGM || (dnd5e setting allowPlayerEffectsTray &&
  (a recorded target's token is owned || (author is user && activity targets "self")))`.
  `allowPlayerEffectsTray` is a world setting, default false. The template renders
  `<effect-application>` only `{{#if effects.length}}` — players without permission get no
  tray element at all.
- **Tray selection is single-select:** only the first effect is pre-checked; click selects
  one, Shift-click toggles several. So multi-effect spells are a CHOICE.
- **Applying:** the Apply button calls `_prepareEffectData(effect, actor)` and batches
  creates/updates via `foundry.documents.modifyBatch`; `_applyEffectToActor` still exists but
  nothing in dnd5e calls it any more. `_prepareEffectData` uses only `this.chatMessage`:
  origin in `system.origin {activity|item, effect: concentration, message, profile}` (core
  `origin` derived from it), duplicates found via `e._stats[compendiumSource|duplicateSource]
  === effect.uuid`, refresh uses `getEffectStart()`, flags `dependentOn` (concentration),
  `scaling`, `spellLevel: message.system.level`, plus `activity.getAppliedEffectChanges()` and
  `ActiveEffect.forApplication()`.
- **Reusing it:** `EffectApplicationElement` (`customElements.get("effect-application")`)
  has no constructor and a public `chatMessage` field, so
  `const t = new (customElements.get("effect-application"))(); t.chatMessage = message;`
  gives dnd5e's exact apply logic in both 5.x (`_applyEffectToActor`) and 6.x
  (`_prepareEffectData`). Protected API — feature-detect each method.
- **Downed automation:** world setting `autoApplyDowned` (none/deadOnly/npcs/all, default
  none; added in 6.0) applies Unconscious/Dead in combat at 0 HP; its "dead" effect carries
  `flags.core.overlay: true` and `flags.dnd5e.autoDowned`; removed again above 0 HP.
- **Combat5e** overrides `_onStartTurn`/`_onEndTurn`/`_onStartRound` but only adds
  `_recoverUses` after `super` — no movement-history changes.

### Pause (feature *Pause Control*, v1.7.0)

- History: *Unpause When World Loads* existed in v1.2, was removed in v1.3.0 in favour of
  *Koboldworks – Pause Control*, and came back in v1.7.0 as part of *Pause Control* because
  Koboldworks is unmaintained (last release 2024-08-28, verified Foundry 12). Verified
  2026-10-13 from its source: its "pause on NPC turns" reads `combat.data.combatants`, and
  `Document#data` no longer exists in v13+ → throws on every combat update; its "unpause on
  combat" runs on EVERY `updateCombat` of a started combat (unpauses after each turn); it
  calls `game.togglePause(state, true)` — v13/v14 still convert a boolean second argument to
  `{broadcast}` with a deprecation warning (removal planned for v15).
- Worlds always activate paused; `game.togglePause(paused, { broadcast: true })` (GM only),
  unpause on `ready`; no client-side signal distinguishes a server start from a GM reload.
- Combat: `startCombat()` updates `{round: 1, turn: 0}` WITHOUT a `direction` option (fires
  `combatStart` before the update on the initiating client); `Combat#started` = `round > 0`;
  `Combat#combatant` = current combatant; `Combatant#isNPC` = `!actor || !hasPlayerOwner`
  (independent of the viewed scene; `Combatant#actor` resolves via token or actorId).
- A previous session noted a non-GM unpause workaround
  (`game.data.paused = false; game.socket.emit('pause', false); …`) — not an official API,
  not re-verified; we don't use it.

### Token drag, animation & module socket (feature *Live Token Drag*, v1.8.0)

Verified 2026-10-25 against the real v14 source (local install, build 14.364:
`client/canvas/placeables/{placeable-object,token}.mjs`, `client/canvas/layers/…`,
`dist/server/sockets.mjs`, `dist/packages/{package,world}.mjs`).

- **Drag workflow:** `PlaceableObject#_initializeDragLeft` clones every draggable controlled
  object (`clone()`, then `_previewType = "dragging"`; `_original` points back), adds the clone
  to `layer.preview` and draws it async → `drawToken(preview)` then `refreshToken(preview,
  flags)`. Token drags move the preview via `Token.#updateDragPreview` (sets
  `preview.document.x/y/elevation/…` + `refreshPosition`) → `refreshToken(preview)`. EVERY
  end goes through `layer.clearPreviewContainer()` (`_onDragEnd()` + `destroy()` →
  `destroyToken(preview)`): on drop in the `finally` after the update promise (also for an
  empty update = dropped on the same spot, and for errors/rejections), on cancel via
  `_finalizeDragLeft`. So `refreshToken`/`destroyToken` filtered by
  `token.previewType === "dragging"` cover the whole drag — no wrapping needed.
- `PlaceableObject#previewType` (public getter): `"dragging"|"controls"|"wheel"|"creation"|
  "config"|"api"|null`; `isPreview`, `hasPreview` (`!!_preview`), `_original`. While dragging,
  core shows the original at alpha 0.4 and the preview at 0.8 (`_getTargetAlpha`).
- Drag input: Shift = no grid snapping (`_onDragLeftMove` → `_updateDragDestination(point,
  {snap: !event.shiftKey})`), Ctrl+click adds a waypoint, right-click removes the last
  waypoint or cancels (`_onDragClickRight` → `_triggerDragLeftCancel`), Ctrl+wheel changes
  elevation, pausing cancels (`interactionData.cancelOnPause`). **Esc does NOT cancel a
  token drag** (`TokenLayer#_onDismissKey` only cancels placement / movement planning; the
  base layer's handler does nothing while a preview exists). Drop → `_prepareDragLeftDropUpdates` → `updateEmbeddedDocuments("Token",
  [{_id}], {method: "dragging", movement: {[id]: {waypoints, …}}})`; contexts whose
  `foundPath.length <= 1` produce no update.
- **MouseInteractionManager callbacks are captured when a placeable's MIM is created**
  (`_createInteractionManager` stores `this._onDragLeftMove` etc.) — patching a prototype
  after tokens are drawn would not reach existing tokens. Another reason to prefer hooks.
- **Core already shares the planned path, not the token:** `Token.#updatePlannedMovement` →
  throttled (100 ms) `game.user.broadcastActivity({plannedMovements: {[id]: …}})`, only with
  the `SHOW_RULER` permission. `hidden` = Alt held at drag start (`token._plannedMovement
  [userId].hidden`, protected field) — other clients then don't show that ruler.
- **Token animation:** `Token#animate(to, {name, duration, easing, chain, action, …})`
  animates the private `#animationData` and merges it into `token.document` every frame
  (derived data — `_source` is untouched) → `_onAnimationUpdate` refreshes
  position/visibility/HUD/occlusion and, with `core.visionAnimation` (default on),
  `initializeSources()`. An explicit `duration` wins over the movement action's defaults; no
  `easing` = linear (string easings are `CanvasAnimation[name]`). CanvasAnimation names are
  GLOBAL — an animation with the same name is terminated, so include the token id.
  `Token#stopAnimation({reset = true})` terminates every animation of the token and
  `document.reset()`s it (jumps to the source state); `Token#_destroy` calls it.
  `movementAnimationPromise` is non-null while a movement animation runs.
- **GOTCHA — `Token#animate` moves vision and light too.** The vision source is built from
  the derived document position (`_getVisionSourceData` → `document.getVisionOrigin()`), and
  for a player with OBSERVER on the token and no controlled sighted token, that token IS a
  vision source (`_isVisionSource`) — so "showing" a position with `animate()` lets them see,
  and explore fog, wherever it is shown. For a display-only move, move `token.position` (the
  container: border, bars, nameplate, tooltip, effects, target pips, turn marker) and
  `token.mesh.position` (= center, lives in the primary group) instead. The token ruler's path
  is in `layer._rulerPaths` and its labels are HTML, so neither moves with the container.
  Core resets both positions in `_refreshPosition` and `visible`/`mesh.visible` in
  `_refreshVisibility` (`mesh.visible = visible && renderable`); re-apply after core.
- **Ticker priorities** (`Canvas.#activateTicker`, set on `PIXI.UPDATE_PRIORITY`): token
  animations OBJECTS+1 (24), render flags OBJECTS = HIGH−2 (23), INTERFACE 22, primary group
  update PRIMARY = NORMAL+3 (3), perception PERCEPTION = NORMAL+2 (2); PIXI's own render
  callback runs after these (PIXI v7 Application uses LOW = −25 — not re-checked in Foundry's
  minified vendor bundle). A ticker at PRIMARY+1 runs after the render flags.
  `VisibilityGroup#restrictVisibility` only sets `refreshVisibility` render flags (applied in
  the next frame's OBJECTS pass).
- **Visibility:** `Token#isVisible` (getter; resets/sets `detectionFilter`): preview → true;
  controlled → true; hidden → GM only; no token vision → not culled; own active vision source
  → true; GM without active vision sources → true; else `canvas.visibility.testVisibility(
  document.getVisibilityTestPoints(), {tolerance: 0, object})`.
  `TokenDocument#getVisibilityTestPoints(data)` takes a partial position (`{x, y}`; defaults
  to the prepared document), constrained by walls from that position's center.
- **Update animation:** `Token#_onUpdate` → `#onUpdateAnimation`: `options.animate === false`
  → `stopAnimation({reset: false})`; otherwise the movement animates from the CURRENT rendered
  state through `options._movement[id].passed.waypoints`. The client backend calls
  `doc._onUpdate()` and then, synchronously, `Hooks.callAll("updateToken")` — stopping the
  animation in the hook means no frame of it is ever drawn (CanvasAnimation's first frame runs
  synchronously at t = 0, i.e. at the start position; terminating before the next microtask
  keeps it off the ticker).
- **Module socket:** manifest `"socket": true`, channel `module.<id>`. Server
  `handleCustomSocket(event, data, {recipients} = {}, ack)`: a `recipients` array of user ids →
  emitted to exactly those users' sockets, otherwise `socket.broadcast` (everyone but the
  sender); listeners get `(data, senderUserId)`. The server registers these listeners per client
  connection for `game.world.modules`, whose manifests are read at world launch — a changed
  manifest needs a relaunch, not just F5. `game.socket` exists before `init` (Game
  constructor). `game.socket.volatile.emit(…)` is what core uses for frequent activity data.
  For a document update the server acks the requester BEFORE broadcasting to the others, so a
  message the requester sends after its update resolved arrives after that update everywhere.
- Hooks: `userConnected(user, connected)`; `canvasTearDown(canvas)` fires after the layers
  were deactivated (the token layer's preview container is already cleared).
  `game.keyboard.isModifierActive("SHIFT")`. Core world setting `core.tokenDragPreview`
  ("Token Drag Vision", default false) previews vision/light for the person dragging only.
- **Original *Live Drag* 1.0.4 (Anyndol/Anyndel, MIT, Foundry 11–12; libWrapper + socketlib):**
  wraps `Token.prototype._onDragLeftStart`, sets the original's `document.alpha` etc. to 0 and
  restores it ONLY in `updateToken` → invisible after drop-on-same-spot/cancel/rejection; sends
  every `refreshToken` of the preview unthrottled via socketlib and moves receivers'
  `token.x/y`/`mesh` directly; no end signal; `animate: false` for the drop; leftover
  `console.log` and an undeclared global `pressedKey`.
### File Browser / FilePicker (feature *File Browser Preview*, verified 2026-10-25)

Sources: v14 API docs 14.368 (signatures), the *Asset Preview* module 0.1.2 by
BufferUnderrunOK (verified on 14.364 — row DOM and drag details), and modules on this table's
v14.364 world that write to persistent storage (Token Action HUD Core 2.1.1, Dig Down 5.0.0).
FilePicker implementation details are otherwise **v14 impl unverified** (no public source).

- **Class:** `foundry.applications.apps.FilePicker` (ApplicationV2), active class
  `FilePicker.implementation` (= `CONFIG.ux.FilePicker`, which modules may subclass). Render
  hook `renderFilePicker(app, element)` fires for subclasses too and on partial re-renders; the
  root element survives those, so bind delegated listeners once per root (WeakSet).
  `app.activeSource` ∈ `data`/`public`/`s3`; `app.displayMode` ∈ `DISPLAY_MODES` =
  `list`, `thumbs`, `tiles`, `images`.
- **Rows:** files are `li[data-file]` with `data-path` (the URL as browsed — URL-encoded, e.g.
  `Big%20Map.png`) and `data-name` (decoded name). The Tiles list is `ul.tiles`; core shows
  names in the Images view but not in Tiles. The *Asset Grid Size* field
  `input[name="tileSize"]` exists only when the picker is opened with `tileSize: true` (Tile
  Browser); a dropped tile covers `naturalWidth / tileSize` grid squares.
- **DRAG GOTCHA:** core rebinds its DragDrop to `li[data-file]` on every body render, and its
  drag start reads `li.querySelector("img").naturalWidth` to size the dropped tile. Never put
  an `<img>` into a row, never replace rows, never swap core's `img.src` for a thumbnail (a
  256 px thumbnail = a 256 px tile). Keep listeners passive (no preventDefault/stopPropagation).
- **API:** `browse(source, target, {extensions, wildcard, bucket})` → `{target, dirs, files,
  gridSize, private, privateDirs}` (no file sizes!); rejects for a missing folder.
  `createDirectory(source, target, options)` rejects if it exists. `upload(source, path, file,
  body = {}, {notify = true})` returns the response JSON (`{status, path, message}`) or
  `false`/`undefined`/`{}` on failure — check `result?.path`; the target folder must exist.
- **Permissions:** `CONST.USER_PERMISSIONS.FILES_BROWSE` (default role 2 Trusted) and
  `FILES_UPLOAD` (default role 3 Assistant GM; GMs always). Check with
  `game.user.can("FILES_UPLOAD")`. TAH Core only creates its storage folders as GM — not
  verified whether a non-GM with `FILES_UPLOAD` may `createDirectory`; our code handles a
  refusal by switching thumbnail creation off for the session.
- **Upload locations (v13+, article "Asset Management"):** uploads are refused at the top
  level of Data and of `modules/`/`systems/`/`worlds/`, inside (most) installed packages and
  other worlds; allowed in a top-level `assets` folder, new top-level folders, and the running
  world. Packages can opt in with `flags.canUpload: true`. A package with
  `persistentStorage: true` (BasePackage schema field) gets `modules/<id>/storage/`, kept
  across updates; uploading there works on v14 (TAH Core and Dig Down do it; create the
  folders with browse → catch → createDirectory, like TAH). `game.modules.get(id).persistentStorage`
  tells whether the running manifest declares it. The Forge doesn't support persistent storage.
- **Image types:** `CONST.IMAGE_FILE_EXTENSIONS` = apng avif bmp gif jpeg jpg png svg tiff webp
  (object ext → MIME; use `Object.hasOwn`).
### Too Many Tokens – Online (feature *Token Art Picker*, verified 2026-10-25 against v2.0.1)

- Module id `too-many-tokens-online` (IsThisMyRealName/Jojop, MIT, compatibility verified 12,
  last release 2.0.1 in 2024-09; one later commit 2025-12 without release). It ships **only
  text lists**; images live in the GitHub repos `too-many-tokens-dnd` (folder per creature)
  and `too-many-tokens-pf` (`Tokens/<creature>/`) and are loaded from
  `raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-<sys>/main/…` (CORS `*`,
  `max-age=300`, ~40 KB WebP, 256 px).
- Lists: `<sys>/names.txt` (dnd 374, pf 234 creatures, no trailing newline) and
  `<sys>/links/<creature>.txt` (one file name per line, plus `Prompts.txt`-like lines that
  must be skipped). dnd: 16 022 entries, **identical to the GitHub tree**; pf: 7 737, of which
  60 (`Xulgath Leader/_<uuid>_cleanup.jpg`) don't exist on GitHub → handle broken images.
- File names: `<CreatureNoSpaces><Words…> (n).webp` with CamelCase attribute words in **no
  fixed order** (race, gender, environment, weapon…), compounds `HalfOrc`/`HalfElf`, `NSFW`,
  typos (`Costal`, `Halfing`, `Kight`, `Dessert`, `Femorian`…), a few without counter or with
  `_cleanup`, some with spaces (`Giant Crawling Hand (1).webp`).
- The macros in its pack (`DND -`/`PF - Get Too Many Tokens For Selected Tokens`, LevelDB
  pack `packs/too-many-tokens-online-macros`) are byte-identical to the shipped
  `too-many-tokens-online-show-dialogue-<sys>.js`: V1 `Dialog`, datalist of names, then
  checkbox columns by word POSITION → regex `.*(A|B).*(C).*` (case-insensitive, so `Male`
  also matches `Female`); no image preview. Its wildcard writes
  `prototypeToken.texture.src = "tmtopptmtopptmtopp_<sys>_<Creature[/Creature]>_<regex>.webp"`
  + `randomImg: true`, resolved by `scripts/index.js`'s `createToken` hook: runs on **every**
  client, no GM/owner guard, updates the token after creation, and for every token whose
  prototype is NOT such a path it throws (`links.length` of `undefined`; also
  `baseActor.prototypeToken` for actorless tokens) — console errors on each token creation.
- Token URLs in worlds appear both `%20`-encoded and with raw spaces → compare decoded.
- Assumption (not verified in a running v14 world yet): files of an installed but
  **deactivated** module are still served under `modules/<id>/…` (Foundry serves the Data
  folder statically) — the picker relies on it when TMT is deactivated.

## Current features (keep this list current)

| Feature | id | File | System | Scope | Settings / keybindings (default) |
|---|---|---|---|---|---|
| Ability Score Prominence | `abilityScoreProminence` | `features/ability-score-prominence.js` | dnd5e | user | `abilitySwapScoreAndMod` (off — default dnd5e sheet + Tidy 5e non-classic sheet), `abilityExpandedRollTargets` (off — default sheet only) |
| Spell Effect Auto-Apply | `spellEffectAutoApply` | `features/spell-effect-autoapply.js` | dnd5e 5.x/6.x | world | `spellAutoApplyEnabled` (off), `spellAutoApplyWhitelist` (`"Mage Armor"`) |
| Find My Token | `findMyToken` | `features/find-my-token.js` | any | user | `findTokenButton` (off, reload), `findTokenZoom` (1.5; 0 = keep zoom), `findTokenPing` (off); keybinding `findMyToken` (unbound) |
| Movement History reset | `movementHistoryReset` | `features/movement-history-reset.js` | any | world | `movementHistoryResetEachRound` (off) |
| Defeated Tokens | `defeatedTokens` | `features/defeated-tokens.js` | any | world | `defeatedOverlay` (off), `defeatedSendToBack` (off) |
| Pause Control | `pauseControl` | `features/pause-control.js` | any | world | `pauseUnpauseOnLoad`, `pauseUnpauseOnCombatStart`, `pauseDuringNpcTurns`, `pauseRestoreAfterCombat` (all off) |
| Live Token Drag | `liveTokenDrag` | `features/live-token-drag.js` | any | world | `liveDragEnabled` (off), `liveDragShiftOnly` (off) |
| File Browser Preview | `filePickerPreview` | `features/file-picker-preview.js` | any | user + world | `filePreviewHover` (off, user), `filePreviewTileNames` (off, user), `filePreviewThumbCache` (off, world), `filePreviewThumbMinKB` (250, world) — thumbnails in `modules/<id>/storage/thumbs/` (`persistentStorage: true`) |
| Token Art Picker (Too Many Tokens) | `tokenArtPicker` | `features/token-art-picker.js` (+ `lib/too-many-tokens.js`) | any (needs TMT Online installed) | world + user | `tokenArtEnabled` (off, world), `tokenArtHudButton` (off, user); keybinding `tokenArtPicker` (unbound); actor flag `tokenArtPool` `{base, files}`; API `api.openTokenArtPicker({tokens, actor})` |

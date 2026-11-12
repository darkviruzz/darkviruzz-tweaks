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
   moved to **Foundry 14.369 + dnd5e 6.0.6 + RSReforged 6.0.2 on 2026-10-27** (before: 5.3.3) and to
   **Foundry 14.370 (Node 24.22.3) + RSReforged 6.0.5 + Tidy 14.4.2 on 2026-11-12**; dnd5e stays on 6.0.6
   (locked) until Tidy ships dnd5e 6.1 support. A feature is either dnd5e-specific
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
   machine a v14 install lives in `Documents/foundryuserdata/foundry` — **build 14.370** since
   2026-11-12 (= what the table runs; the previous 14.364 copy sits next to it as `foundry-14.364`,
   handy for diffs) — grep it first; it beats every other source. Facts below marked "14.364" were
   verified against the older build. The bundled sources of the systems and modules the table
   runs are in the data snapshots under `C:\Users\nogar\Programme\Claude\foundry\`:
   `foundryuserdata-v6-prod/Data/systems/dnd5e/dnd5e.mjs` (dnd5e **6.0.6**, + `templates/`,
   `lang/`), `foundryuserdata/Data/systems/dnd5e` (**5.3.3**), and `…/Data/modules/<id>/`
   (RSReforged 6.0.2 `src/utils/native-*.js`, Token Action HUD Core 2.1.2 `dist/*.min.mjs`, …). Otherwise use the v14 API docs
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
    token-art-picker.js         Too Many Tokens art picker window + wildcard on placement (world + user)
    savage-attacker.js          dnd5e: Savage Attacker — pooled weapon dice once per turn + card button (world/GM)
    weapon-mastery.js           dnd5e: weapon mastery line + GM tray on attack cards — effects, macros (world/GM; module socket)
    chat-export.js              chat export by time range, detailed or Foundry format (world/GM, optional for players)
    token-status-icons.js       token icons: overlay by priority list, dynamic icon size, ignored effects (world; display only)
    token-formation.js          arrange selected tokens: block / hex / ring / crowd with canvas preview (world + user HUD entry)
    template-targeting.js       target the creatures in a placed template by D&D area rules; dnd5e 6 card targets (world)
    rsr-attack-targets.js       dnd5e 6: dnd5e's targets row inside RSReforged's attack section (world)
    tah-layer.js                keep Token Action HUD on a fixed z-index above the docked UI (world)
  lib/
    settings-categories.js      renderSettingsConfig -> per-feature category headers
    socket.js                   the module socket channel, messages routed per feature id
    too-many-tokens.js          data adapter for TMT Online's image lists (fetch, parse, match, pools)
    attack-roll.js              hitAgainst(roll, ac): dnd5e hit/miss incl. nat 20/1 (Savage Attacker, Weapon Mastery)
    rsr-sections.js             watchRsrSections(root, selector, decorate): decorate RSReforged 6 attack/damage sections
    token-tools.js              registerTokenTool(): ONE Token HUD entry for all token tools (own button / palette)
    formations.js               pure formation geometry (block, hex, ring, crowd; spacing, order, walls via callback)
    area-coverage.js            pure AoE coverage: grid space / creature-base sections vs. an inside(x, y) callback
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

Features that act on selected tokens and want a Token HUD button register a tool with
`registerTokenTool({id, order, icon, label, visible(token), onClick(token)})` from
`scripts/lib/token-tools.js` instead of adding their own button: the HUD then shows only the
tools whose `visible()` is true — one as its own button, several behind one "Token Tools"
button with a palette (the user's wish: no extra submenu when only one tool applies).

## Tooling

`npm run validate` (= `node tools/validate.mjs`, Node 20+, no dependencies) fails on:
module.json inconsistencies (version format, `download` must be
`<url>/releases/download/v<version>/module.zip`, stable `manifest`, referenced files exist,
every `styles/*.css` listed, MODULE_ID match, `compatibility.minimum` ≥ 14, no
`relationships.systems`); syntax errors in any script; i18n keys used in scripts but missing
from en.json; en/de key or `{placeholder}` mismatch; a lang key that is both a string and the parent of another key (Foundry would drop the whole file); feature-contract violations (ids,
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

### Unreleased work in another clone (found 2026-11-06)

Version 1.8.0 was developed and deployed to the table from a SECOND local clone
(`C:\Users\nogar\Programme\darkviruzz-tweaks`, branch `claude/integration-1.8.0`) and never
pushed, while `main` on GitHub stayed at 1.7.0. Before starting new work, compare the module
version the table runs (`foundry\darkviruzz-tweaks-*.tar.gz`, the data snapshots) with
`origin/main`, and look at the other clone's branches; build on the newest state.

### Windows line endings

Python's text mode on Windows writes CRLF. `.gitattributes` (`* text=auto eol=lf`) normalises
commits, but keep the working tree LF too: `open(p, "w", newline="\n")`. Long `python - <<'EOF'`
heredocs in the Bash tool can break on quoting — write the script to the scratchpad and run it.

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
- **GOTCHA — a lang key must never be both a string and a parent** (`"DT.A.B"` next to
  `"DT.A.B.C"`). Foundry loads a language file with `expandObject()`; `setProperty` then runs
  `"C" in "<string>"` → TypeError, `Localization#_loadTranslationFile` catches it, logs *"Unable to
  parse localization file …"* and uses `{}` — the WHOLE file is dropped and every `DT.*` key shows
  raw (v1.8.0/1.9.0, found 2026-11-06 from the user's settings screenshot; reproduced with the v13
  `expandObject`/`setProperty` source — v14 impl unverified, but the symptom matches). If the child
  comes first, the string silently overwrites the subtree instead. Name it `"DT.A.B.Label"`;
  `tools/validate.mjs` fails on such pairs.
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

### Damage rolls (feature *Savage Attacker*, verified 2026-10-25 against the bundled `dnd5e.mjs` of 5.3.3 and 6.0.6)

- **Roll workflow** (`BasicRoll.build` → `buildConfigure` / `buildEvaluate` / `buildPost`, same in
  both versions): `dnd5e.preRoll<Name>` / `…V2` (config, dialog, message) → rolls built (dialog or
  `fromConfig`) → `dnd5e.post<Name>RollConfiguration(rolls, config, dialog, message)` with the
  **constructed but unevaluated** rolls → evaluate → chat message. For damage `hookNames` is
  `["damage"]`, i.e. `dnd5e.postDamageRollConfiguration`. `Activity#rollDamage` sets
  `rollConfig.subject = this` (the activity) and fires `dnd5e.rollDamage(rolls, {subject})`
  only AFTER the message exists — too late to change the roll.
- **Criticals are applied before that hook:** `DamageRoll`'s constructor calls
  `configureDamage()` (6.0: guarded by `options.configured`, applied exactly once; 5.3: also
  re-run by the damage dialog when "Critical" is chosen). Plain dice are doubled with
  `term.alter()`; dice WITH modifiers (e.g. Great Weapon Fighting `min3`) are duplicated as extra
  terms — Savage Attacker then only pools the first copy (known limitation).
- **Weapon base damage:** `AttackActivity#_processDamagePart` marks the weapon's own part
  `base: true` on the roll CONFIG (`config.rolls[i].base`, not on the roll's options) and appends
  `@mod` / `@magicalBonus` as further parts of the same roll. Roll order = `config.rolls` order.
- **Attack hit:** `dnd5e.rollAttack(rolls, {subject, ammoUpdate})` fires after evaluation;
  `roll.options.target` is the AC only when exactly ONE target was selected
  (`targets.length === 1 ? targets[0].ac : undefined`). `D20Roll#isSuccess` ignores nat 20/1 —
  use `isCritical` / `isFumble` first.
- **`chunkTerms`** (damage application by type) rebuilds every non-operator term with
  `RollTerm.fromData(term.toJSON())`, so a `PoolTerm` in a damage roll is fine.
- **RSReforged 6 hides dnd5e's attack AND damage messages** and shows them as
  `.rsr-section-attack[data-message-id]` / `.rsr-section-damage[data-message-id]` sections of its
  usage card (id = the child message), appended after an await. Anything added to a child card
  must also go into that section — use `lib/rsr-sections.js` (found 2026-10-25: Savage Attacker's
  button was invisible on RSReforged cards until then).
- Marks that must survive other modules' cards go into `roll.options` (serialised with the
  roll); `message.update({rolls: rolls.map(r => JSON.stringify(r))})` replaces a card's rolls
  (author or GM only — `message.canUserModify(user, "update")`).

### Weapon masteries, rule effects & expiry (feature *Weapon Mastery*, verified 2026-10-25)

Against the bundled `dnd5e.mjs` of 5.3.3 and 6.0.6, the local v14 install (14.364:
`common/documents/active-effect.mjs`, `client/documents/{active-effect,combat,token,macro}.mjs`,
`client/helpers/active-effect-registry.mjs`, `client/canvas/placeables/token.mjs`) and
RSReforged 6.0.2 (`src/utils/native-*.js`, `hooks.js`).

- **Where the mastery lives:** `AttackActivity#rollAttack` takes `rollConfig.mastery` from the
  item flag `last.<activityId>.mastery`, else `item.system.masteryOptions[0]`; it ends up in
  `rolls[0].options.mastery` (both versions), in the message — 6.0 `system.mastery` (next to
  `system.ability/ammunition/mode`), 5.3 `flags.dnd5e.roll.mastery` (+ `ammunition`,
  `attackMode`) — and back in the item flag. 6.0 lets you choose the attack ability
  (`rolls[0].options.ability`, `system.ability`); 5.3 has no choice → `AttackActivity#ability`
  (attack.ability, else the best of `availableAbilities`).
- `WeaponData#masteryOptions` is null unless `actor.system.traits.weaponProf.mastery.value` has
  the weapon's `type.baseItem` and the item has `system.mastery`; extra options come from
  `weaponProf.mastery.bonus`. `weaponProf.mastery` exists only on characters (verified again 2026-10-25: `NPCData` traits have no `weaponProf`) → **NPC attacks
  never carry a mastery**. `CONFIG.DND5E.weaponMasteries` = cleave, graze, nick, push, sap, slow,
  topple, vex with `label` (pre-localised) and `reference` (journal page UUID in `content24`),
  identical in both versions.
- **Per-target hit:** dnd5e itself evaluates every recorded target: 6.0
  `AttackMessageData#evaluatedTargets` / 5.3 `_enrichAttackTargets`: miss = `ac === null ||
  (!isCritical && (total < ac || isFumble))`. Descriptor `ac` is null for total cover or no AC
  (we treat that as unknown). 5.3 descriptors `{name, img, uuid, ac}` (uuid = token's actor),
  6.0 `{actor, ac, img, name, token}`.
- `Actor5e#applyDamage(damages, options)` is identical in both: `damages` = a number (then
  `options.ignore = true` — resistances ignored!) or `[{value, type, properties: Set}]`. Weapon
  damage `properties` = item properties with `CONFIG.DND5E.itemProperties[p].isPhysical`.
- `Actor5e#rollSavingThrow(config, dialog, message)` → `D20Roll[] | null` (both); `config.target`
  becomes `roll.options.target` (`BasicRoll.fromConfig`: `options.target ??= process.target`),
  `isSuccess` = `total >= target`.
- **Advantage from a hook:** `BasicRoll.buildConfigure` fires `dnd5e.preRoll<Hook>` / `…V2`
  (config, dialog, message) BEFORE `applyKeybindings`, which uses `roll.options.advantage ||
  config.advantage || key` (same for disadvantage; both → normal). So setting
  `config.advantage` / `config.disadvantage` in `dnd5e.preRollAttackV2` works in 5.3 and 6.0;
  `config.subject` is the activity, and keys put into `config.rolls[0].options` reach the final
  roll's options (seen again in `dnd5e.rollAttack`).
- **dnd5e 6 rule-type changes:** `CONFIG.ActiveEffect.changeTypes` gains `dnd5e.advantage`,
  `dnd5e.bonus`, `dnd5e.maximum`, `dnd5e.minimum` (handler `_applyChangeRule` →
  `actor.appliedRules`). The change `key` is the roll category — `attack`, `check`, `save` or
  `d20` (`attack:advantage` also collects `d20:advantage`); advantage values `"1"` / `"-1"`
  (counted) or `"=1"` / `"=-1"` (forced). Conditions (`FiltersField` on the change or
  `system.conditions`) only see roll data; attack roll data has `roll.ability`,
  `roll.attack.{classification,mode,type}`, `roll.type` — **no target**, so "against that
  creature" (Vex) can't be expressed. Rules are never consumed by a roll (`filterWith`'s
  `consumed` set only avoids double counting across damage parts). dnd5e 5.3 has none of this.
- **dnd5e 6 pseudo expiries:** `duration.expiry` ∈ `sourceStart`/`sourceEnd`/`targetStart`/
  `targetEnd` (`ActiveEffect5e.PSEUDO_EXPIRIES`, labels `CONFIG.DND5E.pseudoExpiryEvents`).
  `isExpiryEvent` checks only that actor's turn start/end in the combat the effect started in
  and skips the turn it was created in; source = `getSourceActor()` (`system.origin.actor ??
  item ?? activity ?? origin`); out of combat any world-time advance expires them; `_preCreate`
  forces `duration.value = null`. `system.origin` = `{activity, actor, behavior, effect, item,
  message, profile}`.
- **Core v14 effects:** `start {combat, combatant, initiative, round, turn, time}` (client
  `_preCreate` fills it from `getEffectStart()` for actor effects but keeps keys you pass),
  `duration {value, units, expiry, expired}`, changes in `system.changes` `{key, type, value,
  phase, priority}` with `type` "add"/"multiply"/"override"/"upgrade"/"downgrade"/"custom" or a
  system type (old `changes` + numeric `mode` are migrated). Expiry events
  `combatStart|roundStart|turnStart|combatEnd|roundEnd|turnEnd` refer to the combatant in
  `start.combatant` (in the start combat) — pass it to make "turnStart" mean the attacker's turn.
  `value: null` → remaining Infinity → expires at the first matching event; `units: "rounds"` →
  remaining `value - (round - start.round)`, not recomputed on turnEnd/roundEnd. Turn events run
  only on the active GM (`Combat#onStartTurn/#onEndTurn` → `ActiveEffect.registry.refresh`;
  turnEnd's context is the turn that ended). `CONFIG.ActiveEffect.expiryAction` defaults to
  `"update"`: expired effects stay on the actor with `duration.expired: true` (suppressed); dnd5e
  6 doesn't change that.
- **Speed:** `system.attributes.movement.bonus` (FormulaField, both versions) is added to every
  speed > 0, never below 0. dnd5e 6 FormulaField "add": `"" + "-10"` → `"-10"`, else
  `"<v> - 10"`. 6.0 moved the speeds to `movement.speeds.<type>` (shims for the old keys).
- **Moving a token (v14):** `TokenDocument#move(waypoint | waypoints, options)`; waypoint
  `action: "displace"` = teleport, ignores walls, recorded with cost 0. `Token#checkCollision(
  destination, {origin, type: "move", mode: "any"})` takes movement origins
  (`TokenDocument#getMovementOrigin({x, y})` = centre + half depth);
  `TokenDocument#getSnappedPosition({x, y})`; `canvas.grid.measurePath([a, b]).distance` uses the
  scene's diagonal rule; `canvas.dimensions.distancePixels`.
- `Macro#execute(scope)`: needs LIMITED (`canExecute`); a script macro gets the scope keys as
  variables.
- **RSReforged 6.0.2 on dnd5e 6** ("native workflow"): runs from `dnd5e.postUseActivity`, calls
  `activity.rollAttack(config, {configure: false}, seed)` and `rollDamage` (all dnd5e hooks
  fire; `dnd5e.rollAttack` before the attack message exists), creates dnd5e's own attack and
  damage messages (`system.origin` = usage card, `system.targets` = copy of the card's targets,
  `flags.rsreforged.parentId`) and shows them as sections
  `div.rsr-section-attack[data-message-id=<attack message id>]` in the usage card — appended
  after an `await` inside its `dnd5e.renderChatMessage` handler, so other hook listeners run
  first (watch with a MutationObserver). The child cards are hidden and emptied; updating a child
  re-renders the parent. It copies none of dnd5e's attack-card extras (no mastery line —
  RSReforged issue #47). The 5.3 (legacy) path merges damage into the attack message instead
  (the usage card then gets the rolls and `flags.dnd5e.roll = {type: "attack", mastery}`).
  RSReforged's children carry `flags.rsreforged.parentId` (+ `workflowVersion: 2`); a child is
  only hidden by RSReforged's reconcile pass (class `rsr-native-combined-original` on
  `.message[data-message-id]`, content emptied) if a registered section represents it.
- **GOTCHA — decorate only the attack message, and never RSReforged's child card** (found
  2026-10-25 from the user's screenshots: the panel showed twice — in the attack section and again
  below the card / as a separate small card). Gate on 6.x `message.type === "attack"` or 5.x
  `flags.dnd5e.roll.type === "attack"` instead of "has a mastery", and skip messages with
  `flags.rsreforged.parentId` while RSReforged is active (decorate their section instead). Which
  path showed the extra copy was not reproduced; chat notifications (`#chat-notifications`, which
  dnd5e's `ChatTrayElement#visible` also checks) render messages a second time and are a
  suspect (unverified).
- **dnd5e trays (5.3 and 6.0):** `.card-tray.<kind>-tray.collapsible(.collapsed) > label.roboto-upper
  (i.icon + span + i.fa-caret-down) + .collapsible-content > .wrapper`. `Item5e.chatListeners`
  toggles `.collapsed` on any click inside a `.collapsible` outside `.collapsible-content`;
  dnd5e's CSS (`.dnd5e2 .collapsible .collapsible-content` grid rows 1fr ↔ 0fr, scoped `@scope`)
  animates it — so the same markup folds natively without a custom element. The custom trays
  (`damage-application`, `effect-application`, base `ChatTrayElement`) reflect it as an `open`
  attribute; after Apply `DamageApplicationElement` sets `open = false` unless the dnd5e setting
  `autoCollapseChatTrays` (manual / never / older (default, > 5 min) / always) is `manual`;
  `ChatMessage5e#_collapseTrays` applies the setting at render time (before
  `dnd5e.renderChatMessage`, so trays added in that hook must apply it themselves). 6.0's
  Targeted / Selected switch is `<recorded-targets>` (`button.target-source-toggle[data-mode]`,
  `targeted` = `message.system.targets` resolved via `TargetsField.resolve`, `selected` =
  `canvas.tokens.controlled`, forced to `selected` without recorded targets, rebuilt on
  `controlToken`) — it renders `target-pill` groups, not suited for per-target buttons.
- dnd5e 6 setting `chatCardSummary`: a usage card that `rendersSummaries` shows its child rolls
  as `.card-summary[data-message-id]` (`message.system.render({summary: true})`, no
  `dnd5e.renderChatMessage`) and the child card itself renders with `hidden` — a panel on it is
  invisible.

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
- **14.370 source (`client/applications/apps/file-picker.mjs` `#onDragStart`):** the drag data is
  `{type: "Tile", texture: {src: li.dataset.path}, fromFilePicker: true, tileSize}`; the first
  `<img>` of the row only sizes the drag PREVIEW (`naturalWidth * gridSize / tileSize`), and since
  14.370 the dropped tile uses the realized texture size (#14917). The rule below still holds — a
  foreign `<img>` or swapped `src` would at least distort the preview, and on ≤ 14.369 the tile.
- **DRAG GOTCHA:** core rebinds its DragDrop to `li[data-file]` on every body render, and its
  drag start reads `li.querySelector("img").naturalWidth` to size the dropped tile. Never put
  an `<img>` into a row, never replace rows, never swap core's `img.src` for a thumbnail (a
  512 px thumbnail = a 512 px tile). Keep listeners passive (no preventDefault/stopPropagation).
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

### Chat log, export & UI layers (feature *Chat Export by Time Range*, verified 2026-10-29 against the core 14.364 sources)

- `ChatLog#export()` (on `game.messages`, triggered by the action `export` of the sidebar
  `ChatLog`): `this.contents.map(m => m.export()).join("\n---------------------------\n")`,
  saved via `foundry.utils.saveDataToFile(log, "text/plain", "fvtt-log-<Date#toDateString>.txt")`.
  No filter, all messages of the collection.
- `ChatMessage#export()`: content HTML → plain text (DIV/BR become line breaks, whitespace
  collapsed), then one line `${roll.formula} = ${roll.result} = ${roll.total}` per roll, prefixed
  `[<toLocaleDateString("en-US", {hour, minute, second})>] <alias>`.
- Template `templates/sidebar/tabs/chat/notifications.hbs` (part `log` of `ChatLog`):
  `#chat-controls` > `#message-modes` + (GM only) `.control-buttons` with
  `button.ui-control.icon[data-action="export"|"flush"]`. Our button has no `data-action`
  (AppV2's click dispatcher ignores it). `renderChatLog(app, element)` fires on every (partial)
  render → insert idempotently.
- `DialogV2.wait({render})` calls `render(event, dialog)` on the dialog's render event; the
  content sits in `form.dialog-form` (`button.form` in a button callback); button labels and the
  window title are localized by core.
- **UI layers** (core CSS variables): canvas 0, `#ui-left`/`#ui-middle`/`#ui-right` and `.app`
  `--z-index-app` 30, `--z-index-ui` 60, `.application` (AppV2 windows) `--z-index-window` 100 (+
  `ApplicationV2._maxZ` counting up in `bringToFront()`, only for framed apps), tooltip 9999,
  notifications 99999. `#ui-top` is inside `#ui-middle` (`templates/views/game.hbs`), so
  anything docked there (Carousel/combat-tracker-dock in mode `rowDocked`) lives in layer 30.
  Token Action HUD (`#token-action-hud-app`, AppV2 `frame: false`) uses `position.zIndex` 100 and
  sets `element.style.zIndex = 20` on every right-click of a group (`sendHudToBottom`) — then it
  falls below layer 30 until the next reload.

### Token effect icons (feature *Token Status Icons*, verified 2026-11-06 against core 14.364 `client/canvas/placeables/token.mjs`)

- `Token#_drawEffects` (async, via `drawEffects()` → `_partialDraw`): clears `token.effects`, adds
  `effects.bg` (PIXI.Graphics, zIndex -1), takes `actor.appliedEffects` with `showIcon === ALWAYS`
  or (`CONDITIONAL` and `isTemporary`) (`CONST.ACTIVE_EFFECT_SHOW_ICON` NONE 0 / CONDITIONAL 1 /
  ALWAYS 2), draws one PIXI.Sprite per effect (`_drawEffect(img, tint)`, skipped without img) and
  sets `sprite.zIndex = index in that list`; the overlay is `findLast(e => e.flags.core?.overlay)`
  (`_drawOverlay`: alpha 0.8, `effects.overlay = sprite`). `effects.renderable` is false while
  drawing; at the end `sortChildren()` and the render flag `refreshEffects`.
- `Token#_refreshEffects`: size `20 × canvas.dimensions.uiScale`, `rows = floor(document.getSize()
  .height / size)`, columns from the top left, `bg` rounded rect (inset 1 × uiScale, radius 2 ×
  uiScale) behind each small icon; the overlay `min(width, height) × 0.6`, anchor 0.5, at
  `document.getCenterPoint({x: 0, y: 0})`. Small icons' anchors are never reset.
- `PlaceableObject#applyRenderFlags` calls `_applyRenderFlags(flags)` and then synchronously
  `Hooks.callAll("refreshToken", token, flags)` — re-laying sprites there (when
  `flags.refreshEffects`) shows no frame of core's layout. Force a redraw with
  `token.renderFlags.set({redrawEffects: true})`.
- `CONFIG.statusEffects` entries `{id, name (i18n key), img}`; v14 object keyed by id.

### Token movement & formations (feature *Token Formations*, verified 2026-11-06 against core 14.364)

- A plain `TokenDocument#update({x, y})` IS a movement in v14: `#preUpdateMovement` infers the
  waypoints, method `"api"` (others: config, hud, dragging, keyboard, paste, undo) and — for a
  rendered token — `constrainMovementPath` stops it at walls (`constrainOptions: {ignoreWalls,
  ignoreCost}` to bypass). `Scene#moveTokens({[id]: {destination: {x, y} | waypoints, method,
  autoRotate, showRuler, constrainOptions, …}}, options)` moves several tokens in ONE update;
  `TokenDocument#move(waypoints, options)` wraps it for one token.
- `Token#checkCollision(centre, {origin, type: "move", mode: "any"})` (centre points; origin
  defaults to the token's movement origin) → boolean for mode any. `TokenDocument#getSize()`
  → px `{width, height}`, `#getSnappedPosition({x, y})` (top-left), `#getCenterPoint(data)`,
  `#getMovementOrigin(data)` (centre + half depth as elevation). `Token#texture`, `Token#center`.
- `canvas.controls` (ControlsLayer) is a PIXI container in the interface group — a preview
  container added there with `eventMode = "none"` doesn't catch clicks.
  `canvas.dimensions.sceneRect.contains(x, y)`; `CONST.GRID_TYPES.GRIDLESS = 0`.

### dnd5e 6 targets on usage vs. attack cards (feature *Attack Targets on RSReforged Cards*, verified 2026-11-06 against dnd5e 6.0.6 and RSReforged 6.0.2)

- Activity `metadata.targetPhase`: attack `"post"`, save / check `"pre"`, utility/base `""`.
  `UsageMessageData#_prepareContext`: `showTargets = targetPhase !== "post" && (effects.length ||
  targetPhase === "pre")` → `<recorded-targets>` on the usage card for saves/checks and for
  cards with effects ("No Targets" pill when empty), never for attacks.
- `attack-card.hbs` renders the targets row `section.icon-row > ul.unlist.targets.pills > li >
  target-pill[data-hit|data-miss][data-value=AC]` from `AttackMessageData#_prepareTargetsContext`
  (empty unless `isContentVisible`; `showAC = isGM || attackRollVisibility === "all"`,
  `showResult = isGM || visibility !== "none"`, hits first). `message.system.render(options)` →
  the card's HTML string (template + `_prepareContext`); styles `.dnd5e2 .pills target-pill.pill`.
- RSReforged 6.0.2 `native-card.js` `_attackSection` puts only the roll (+ advantage overlay,
  bonus button) into `.rsr-section-attack` — no targets. Its green check / red X comes from the
  roll's `options.target`, which `native-workflow.js` sets only with exactly ONE target.

### Chat message data for the export (verified 2026-11-06 against dnd5e 6.0.6)

- 6.x `CONFIG.ChatMessage.dataModels`: attack, bastionAttack/Order/Turn, check, damage, generic,
  healing, hitDie, hitPoints, item, prompt, recharge, request, rest, save, timePassed, turn,
  usage. `RollMessageData` (base of attack/check/damage/save…): `activity` / `item` =
  SourceReference `{id, img, name, type, uuid}`, `origin` (parent message), `targets`.
  Check: `ability, skill, tool, type`. Save: `ability, outcome (broken|death|revive|stable),
  resisted, type (ability|concentration|death)`. Damage: `onSave (none|half|full)`. Usage:
  `activity {chatFlavor, …}`, `buttons`, `concentration`, `effects` (effect ids of the item),
  `scaling`. `message.content` of these cards is EMPTY — the card is rendered from `system`,
  which is why core's `ChatMessage#export()` writes only the header line for them.
- `ChatMessage5e#getAssociatedActivity()/Item()/Actor()/Token()/Rolls()`. D20Roll getters
  `hasAdvantage`, `hasDisadvantage`, `isCritical`, `isFumble`; `options.target` = AC / DC;
  `isSuccess` needs a target. DamageRoll `options.type` → `CONFIG.DND5E.damageTypes[type].label`
  (or `healingTypes`).

### Token Action HUD (feature *Token Action HUD Layer*, verified 2026-11-06 against Token Action HUD Core 2.1.2)

- `game.tokenActionHud` = the HUD app, id `token-action-hud-app`, ApplicationV2 with
  `window.frame: false`, `position.zIndex` = DEFAULT_ZINDEX. `addContextMenuListener` binds
  `sendHudToBottom()` → `game.tokenActionHud.element.style.zIndex = 20` to every group's
  `contextmenu`; `clickGroup` calls `bringToFront()`, which does nothing for frameless apps — so
  the HUD stays at 20 until a reload. `renderApplicationV2(app, element)` fires for it (class
  chain). Our fix pins the inline z-index with a MutationObserver on its `style` attribute.

### Template Regions & D&D area rules (feature *Template Auto-Targeting*, verified 2026-11-06)

Sources: dnd5e 6.0.6 / 5.3.3 (`release-*` clones), Foundry v14 API docs (foundryvtt.com/api, v14),
the v14 release notes in the public repo `foundryvtt/foundryvtt` (`releases/notes-14.*.html` —
readable via raw.githubusercontent.com), and the rules texts below. Core details marked below
were re-checked on 2026-11-12 against the local client source of 14.370 (and 14.364 for comparison).
First real test on the table (2026-11-12): works for templates placed by a dnd5e activity (Fireball).

- **Measured Templates are gone in v14** (notes 14.356/14.359: "the first time that we have ever
  eliminated one of the fundamental types of data"); templates are **Regions**.
- **CORRECTED 2026-11-12 — core's "Measured Template Mode" does NOT set `flags.core.MeasuredTemplate`.**
  The earlier note assumed it (from dnd5e mirroring the flag). The source disproves it:
  `RegionLayer` creation data in template mode (14.364 and 14.370 `client/canvas/layers/regions.mjs`)
  sets only color, levels, restriction `{enabled: true, type: "move"}`, visibility ALWAYS,
  highlightMode `"coverage"`, displayMeasurements and owner ownership — in 14.370 taken from the new
  `CONFIG.Region.templateModeConfig` (`shapeTypes` incl. the new `"grid"` shape, `coneAngle`,
  `coneCurvature`, `ringAlignment`, `gridBased`, …), plus `data.flags = deepClone(templateModeConfig.flags)`,
  which core leaves UNDEFINED. Only the deprecated `MeasuredTemplateDocument.createDocuments` shim
  (`client/documents/measured-template.mjs`, old API used by modules) sets the core flag. So hand-drawn
  template-mode Regions carried no marker and Template Auto-Targeting ignored them up to 1.10.0.
  **Fixed in 1.10.1:** while the feature is on, `syncTemplateModeMarker()` (on `ready` and in the
  setting's `onChange`) merges `flags.darkviruzz-tweaks.template = true` into
  `CONFIG.Region.templateModeConfig.flags` (never replacing the object — a system may set its own) and
  removes it when switched off; `isTemplate()` accepts that marker. Foundry ≤ 14.369 has no
  `templateModeConfig` → hand-drawn templates stay unrecognised there. Untested on the table so far.
  dnd5e 6.0.6 sets `flags.core.MeasuredTemplate` ONLY on its placement previews; the
  Regions it creates carry `flags.dnd5e.{activity, item, origin (usage token uuid), dimensions,
  spellLevel}` — that is what we detect.
- `RegionDocument#testPoint(point)` (14.370 source) = `#testElevation(point.elevation) &&
  polygonTree.testPoint(point)` — the polygon tree is built from all of the Region's shapes, so holes
  and the new 14.370 grid-space shapes (e.g. a "Careful Fireball" hole) should be respected by our
  `inside()` callback (tree construction not traced line by line; untested on the table).
- **dnd5e 6 `TemplatePlacement.fromActivity`** (`module/canvas/template-placement.mjs`):
  `canvas.regions.placeRegions(data, {attachToToken, create: false, onRotate, preConfirm})` for the
  preview, then `scene.createEmbeddedDocuments("Region", regionData)` with `shapes` (types
  `circle`, `cone` (angle `CONFIG.MeasuredTemplate.defaults.angle`), `emanation` `{base: {type:
  "token", x, y, width, height, shape}, radius}`, `line`, `rectangle`, `ring`; sizes in px),
  `levels: [canvas.level.id]`, `restriction: {enabled: true, type: "move"}` (walls cut the area),
  `attachment.token` (non-stationary emanations), `visibility: ALWAYS`, `highlightMode:
  "coverage"`. Hooks: `dnd5e.preCreateMeasuredTemplate(activity, config)` and
  `dnd5e.createMeasuredTemplate(activity, regionData)` (return false cancels),
  `dnd5e.postCreateMeasuredTemplate(activity, createdRegions)`. The activity's chat button "Place
  Template" calls the same `#placeTemplate()` later (no `postCreateUsageMessage` then).
- **Emanation size = the base the Region gets, not the caster's size** (verified 2026-11-12, dnd5e 6.0.6
  `TemplatePlacement#createShapeData` + core 14.370 `RegionLayer#attachPlacementToToken`): dnd5e
  always builds the emanation base as `{type: "token", width: 1, height: 1}` and places with
  `attachToToken: true`. Core adopts the token's `x, y, width, height, shape` (and sets
  `attachment.token`) ONLY while the mouse hovers a token during placement (`canvas.tokens.hover`);
  confirmed elsewhere, the base stays 1×1, so a Large caster gets a Medium-sized emanation that is
  also not attached. A hand-drawn emanation (Region tool) always has a 1×1 base (`shapeData` of the
  tool) and never attaches. Our targeting just follows the Region's geometry (`testPoint`), so the
  area size is never our bug. (Reported by Markus 2026-11-12: "emanation bei large creatures sollte
  größer sein".)
- **Targets are recorded BEFORE the template exists:** `Activity#use` builds the usage message
  with `system.targets: TargetsField.getDescriptors()` (the user's targets at that moment), creates
  it, then `_finalizeUsage` places the template, then `dnd5e.postUseActivity`. Readers of those
  targets: `UsageMessageData#evaluatedTargets` (Roll Save / check buttons; recorded targets the
  user owns, or controlled tokens in "selected" mode) and the damage buttons
  (`rollDamage(…, {data: {system: {targets: message.system.targets}}})`). So auto-targeting must
  also rewrite the card's `system.targets` — `dnd5e.dataModels.chatMessage.fields.TargetsField
  .getDescriptors(tokens)`; we `updateSource` it at once (postUseActivity listeners like
  RSReforged run before a database round trip) and `update(…, {diff: false})` (the default diff
  against the already changed source would send nothing).
- dnd5e **5.3.3** is verified for Foundry 14 but still places `MeasuredTemplate` documents
  (`AbilityTemplate`, hook `dnd5e.createActivityTemplate`) — whether that works on v14 is
  unverified; we only handle Regions.
- **Core containment (notes 14.353, #13625):** all grid-space centre points of a token's shape
  are tested for visibility, occlusion and Region containment (before: only the centre). The
  highlight mode *Covered Grid Spaces* shows "the grid spaces on which a 1×1 Token would be
  contained" = the **centre rule**, NOT the DMG's "at least half". 14.349 (#13273): shapes except
  polygons can be grid-based (follow the grid's metric).
- API (v14 docs): `RegionDocument#testPoint(ElevatedPoint)`, `#polygonTree`
  (`PolygonTree#testPoint(point, distance = 0)`), `#bounds`, `#tokens`, `#levels`;
  `TokenDocument#testInsideRegion(region, data)`, `#getContainmentTestPoints(data)`,
  `#getOccupiedGridSpaceOffsets(data)` → `GridOffset3D[]` (walls/surfaces considered; EMPTY on
  gridless); `BaseGrid#getVertices({i, j})` (empty on gridless), `#getCenterPoint`, `isGridless`,
  `isHexagonal`; `Token#setTarget(targeted = true, {releaseOthers})` (no user/groupSelection
  arguments any more); `User#targets: Set<Token>`; `TokenLayer#targetObjects(rect,
  {releaseOthers})`; `Token#shape`; `DatabaseUpdateOperation.diff`.
- **Rules texts** (5etools data `book-xdmg/xge/dmg/xphb.json` on raw.githubusercontent.com
  `5etools-mirror-3/5etools-src`, SRD 5.2 in dnd5e's `packs/_source/content24`):
  DMG 2024 p. 44 *Areas of Effect*: "If the area has a point of origin, choose an intersection of
  squares or hexes … If an area of effect covers at least half a square or hex, the entire square
  or hex is affected." DMG 2014: same, but only "If an area of effect is circular". XGtE p. 86
  template method: any part of a square under the template counts, being adjacent isn't enough, "If
  a creature's miniature is in an affected square, that creature is in the area"; without a grid
  "a creature is included … if any part of the miniature's base is overlapped by the template";
  token method: squares instead of circles. SRD 5.2 glossary: origin included for Sphere and
  Cylinder, NOT for Cone, Cube, Line and Emanation ("unless its creator decides otherwise"); an
  Emanation extends from a creature and moves with it. Creature space DMG 2024: Large 2×2 (3
  hexes), Huge 3×3 (7), Gargantuan 4×4+ (12+). Sage Advice could not be checked (sageadvice.eu,
  dndbeyond.com and wizards.com are not reachable from the cloud session).

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
| File Browser Preview | `filePickerPreview` | `features/file-picker-preview.js` | any | user + world | `filePreviewHover` (off, user), `filePreviewSize` (384, user), `filePreviewTileNames` (off, user), `filePreviewThumbCache` (off, world), `filePreviewThumbMinKB` (250, world) — thumbnails in `modules/<id>/storage/thumbs/` (`persistentStorage: true`) |
| Savage Attacker | `savageAttacker` | `features/savage-attacker.js` | dnd5e | world | `savageAttackerMode` (`off` / `auto` / `button`, default `off`); roll option `[MODULE_ID].savage`; actor flag `savageAttackerTurn` (`<combat>:<round>:<turn>`) |
| Weapon Mastery | `weaponMastery` | `features/weapon-mastery.js` (+ `lib/attack-roll.js`, `lib/rsr-sections.js`, `lib/socket.js`) | dnd5e 5.3/6.x | world | `weaponMasteryEnabled` (off), `weaponMasteryMacro<Mastery>` × 8 (`""` = no macro); effect flag `weaponMastery` `{mastery, source, message, target?}`; attack-message flag `weaponMastery.done.<row>.<mastery>` (true / "requested" / false = undone) + `weaponMastery.undo.<row>.<mastery>` (revert data; row = `t#` or the flag-safe token UUID of a selected token) — once per row, GM Undo in the tray; save-request flag `weaponMasterySave`; attack roll option `[MODULE_ID].weaponMasteryConsume`; socket `{action: "use", messageId}` player → active GM |
| Chat Export by Time Range | `chatExport` | `features/chat-export.js` (+ `lib/attack-roll.js`) | any (dnd5e 5.3/6.x details) | world | `chatExportEnabled` (off), `chatExportPlayers` (off); button `.dt-chat-export` in `#chat-controls .control-buttons` (created for players); dialog: range (hours / days / from–to / all) + format (detailed default / foundry); API `api.exportChat({hours} \| {days} \| {from, to} \| {all: true}, {format})` |
| Token Art Picker (Too Many Tokens) | `tokenArtPicker` | `features/token-art-picker.js` (+ `lib/too-many-tokens.js`, `lib/token-tools.js`) | any (needs TMT Online installed) | world + user | `tokenArtEnabled` (off, world), `tokenArtHudButton` (off, user); keybinding `tokenArtPicker` (unbound); actor flag `tokenArtPool` `{base, files}`; API `api.openTokenArtPicker({tokens, actor})` |
| Token Status Icons | `tokenStatusIcons` | `features/token-status-icons.js` | any | world | `statusOverlayEnabled` (off), `statusOverlayList` (`"dead, unconscious"`, sortable widget in the settings window), `statusIconsDynamicSize` (off), `statusIconsMaxScale` (2), `statusIconsIgnored` (`""`), `statusIconsIgnoredMode` (`small` / `hide`, default `small`) — display only, `refreshToken` hook |
| Token Formations | `tokenFormation` | `features/token-formation.js` (+ `lib/formations.js`, `lib/token-tools.js`) | any | world + user | `formationEnabled` (off, world), `formationHudButton` (off, user), hidden `formationLastOptions` (client); keybinding `tokenFormation` (unbound); API `api.openFormation({tokens})` |
| Template Auto-Targeting | `templateTargeting` | `features/template-targeting.js` (+ `lib/area-coverage.js`) | any (dnd5e 6 card targets) | world | `templateTargetEnabled` (off), `templateTargetGridRule` (`half` / `any` / `center`, default `half`), `templateTargetGridlessRule` (same, default `half`), `templateTargetHidden` (off), `templateTargetDefeated` (off); Region marker `flags.<MODULE_ID>.template` via `CONFIG.Region.templateModeConfig.flags` (14.370+, only while on) |
| Attack Targets on RSReforged Cards | `rsrAttackTargets` | `features/rsr-attack-targets.js` (+ `lib/rsr-sections.js`) | dnd5e 6.x + RSReforged 6 | world | `rsrAttackTargetsEnabled` (off) |
| Token Action HUD Layer | `tahLayer` | `features/tah-layer.js` | any (Token Action HUD Core 2.1.2) | world | `tahLayerFix` (off), `tahLayerZIndex` (50) |

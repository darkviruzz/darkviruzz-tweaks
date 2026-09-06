# CLAUDE.md — working guide for this module

> **This file is the source of truth for how to work in this repo. Read it fully before
> making changes. KEEP IT UP TO DATE: whenever you learn something new (a Foundry/dnd5e
> API detail, a gotcha, a new convention, a new feature), update this file in the same
> change so the next session benefits. Treat that as part of "done".**

## What this module is

**Darkviruzz Tweaks & QoL** (`id: darkviruzz-tweaks`) is a personal collection of
quality-of-life tweaks for a home game. It is intentionally a multi-feature "grab bag":
each tweak is a self-contained feature that the user can toggle on/off.

> **This repository also hosts a second, independent Foundry module.**
> `caverns-of-blackthorn/` is a *content* module (an adventure with compendium packs),
> not a tweak. It has its own `module.json`, its own build and its own
> **[caverns-of-blackthorn/CLAUDE.md](caverns-of-blackthorn/CLAUDE.md)** — read that one
> when working in it, not this file. The rules below (one feature per file, settings
> grouped by feature, defaults off) do not apply there. The folder is self-contained and
> can be moved to its own repository unchanged. Its releases use the tag prefix
> `cob-v*`, so they never collide with this module's `v*` tags.

## Non-negotiable conventions

1. **Target platform.** Always build for **Foundry VTT v14+**. System-specific features
   target the **dnd5e** system (D&D 2024 / "5.5e" = the `dnd5e` system, 5.x and newer).
   A feature is either dnd5e-specific (`requiresSystem: "dnd5e"`) or **system-agnostic**
   (no `requiresSystem`, must not assume any system).
2. **Defaults = vanilla behaviour.** Every setting defaults to **off / no change**. The
   module must never alter default Foundry/system behaviour unless the user opts in. New
   features start disabled.
3. **One feature = one file** under `scripts/features/`. No mixing unrelated tweaks in a
   file. Shared helpers go in `scripts/lib/`.
4. **All settings in one settings tab, grouped by feature.** Each feature declares a
   `category`; the loader injects category headers (see `scripts/lib/settings-categories.js`).
   Do not create separate settings menus per feature.
5. **README documents every feature.** For each feature the README must explain *how it
   works* and *its settings + defaults*. Update the README in the same change as the code.
6. **Localise all user-facing strings** via `lang/en.json` and `lang/de.json` using
   `DT.*` keys. Never hard-code display strings in JS.
7. **Verify APIs against real source before using them.** Don't guess Foundry/dnd5e APIs.
   Check the dnd5e GitHub source (`foundryvtt/dnd5e`) and the Foundry API docs. Record
   confirmed facts in "Verified facts & gotchas" below.

## Architecture

```
module.json                     manifest (id, compatibility v14+, esmodule = scripts/main.js)
scripts/
  constants.js                  exports MODULE_ID (must match module.json id)
  main.js                       feature loader: registers settings, runs init(), injects category headers
  lib/
    settings-categories.js      renderSettingsConfig -> per-feature category headers
  features/
    ability-score-prominence.js dnd5e display tweak (per-user)
    spell-effect-autoapply.js   dnd5e auto-apply of self-cast spell effects (world/GM)
styles/
  settings.css                  category-header styling
  <feature>.css                 per-feature styling (listed in module.json "styles")
lang/
  en.json, de.json              DT.* localisation keys
.github/workflows/release.yml   tag push (v*) -> build zip + publish GitHub release
```

`scripts/main.js` is the only esmodule entry; it imports everything else with relative
`./...js` paths (browser ESM — always include the `.js` extension).

## How to add a new feature (do exactly this)

1. Create `scripts/features/<kebab-name>.js` that default-exports a **feature object**:

   ```js
   import { MODULE_ID } from "../constants.js";

   const KEY = "myToggle";

   function doThing() { /* ... */ }

   export default {
     id: "myFeature",                    // unique camelCase id
     requiresSystem: "dnd5e",            // OMIT for system-agnostic features
     category: {
       label: "DT.Categories.MyFeature.Label",
       hint:  "DT.Categories.MyFeature.Hint"   // optional
     },
     settings: [
       { key: KEY, options: {
           name: "DT.Settings.MyToggle.Name",
           hint: "DT.Settings.MyToggle.Hint",
           scope: "user",                // "user" (per-user) or "world" (GM/global)
           config: true,
           type: Boolean,
           default: false,               // ALWAYS vanilla behaviour
           onChange: () => {}
       } }
     ],
     init() { /* register Hooks here; called once during "init" */ }
   };
   ```

2. Register it in `scripts/main.js` → add to the `FEATURES` array (import + push).
3. Add the `DT.*` i18n keys to **both** `lang/en.json` and `lang/de.json`.
4. If it needs CSS, add `styles/<feature>.css` and list it in `module.json` `"styles"`.
5. Add a **README section** (how it works + settings + defaults).
6. Bump the version and release (see below). Update this file if you learned anything new.

Settings keys are unique strings registered under `MODULE_ID`. Prefix keys per feature
(e.g. `ability*`, `unpause*`) to keep them grouped and unambiguous. The first setting in
a feature's `settings` array is the anchor the category header is inserted before, so the
settings of one feature must be registered contiguously (the loader handles this).

## Release process

Single source of truth for the version is `module.json`. The manifest URL is stable:
`https://github.com/darkviruzz/darkviruzz-tweaks/releases/latest/download/module.json`.

To cut a release:
1. Bump `version` in `module.json` and set `download` to the new `v<version>` zip URL.
2. Commit and push `main`.
3. Build the zip with files at the **root** (no wrapping folder):
   `zip -r module.zip module.json scripts styles lang README.md LICENSE`
4. `gh release create v<version> module.json module.zip --title v<version> --latest --notes "..."`
   (The `.github/workflows/release.yml` workflow also fires on the tag and re-publishes
   the same assets idempotently — that's expected and harmless.)
5. Verify the public manifest serves the new version and the zip downloads (HTTP 200).
   GitHub's release CDN can lag a few seconds right after publishing — retry before
   concluding something is wrong.

Compatibility note: the install/manifest mechanism requires the **repo to stay public**.

### Squash-merge conflict gotcha

PRs here are **squash-merged**, so `main` gets ONE commit whose tree matches the branch but
whose history doesn't contain the branch's commits. If you then keep working on that same
branch and open another PR, git's 3-way merge (base = the old merge-base) sees both sides
editing the same regions and reports **conflicts even when `main`'s tree is identical to an
ancestor of your branch**. Fix: branch fresh off `main`, put the final content there, and PR
that — it merges as a clean fast-forward. Don't try to resolve the phantom conflict.

## Verified facts & gotchas (Foundry v14 / dnd5e 5.x — keep adding here)

- **dnd5e sheets are ApplicationV2.** Use `renderActorSheetV2` (it fires for the whole
  class chain incl. dnd5e's `CharacterActorSheet`/`NPCActorSheet`). `renderActorSheet`
  (V1) is only a fallback for legacy sheets. The `html` arg is an `HTMLElement` for V2,
  jQuery for V1 — handle both: `html instanceof HTMLElement ? html : html?.[0]`.
- **Ability tile DOM (default dnd5e sheet):** `.ability-score[data-ability]` containing
  `a.label.ability-check` (roll link), `.mod` (modifier text, or a config `<button>` for
  owners) and `.score` (value text, or an `<input>` for owners). Don't hijack the owner's
  input/button when adding click handlers.
- **Ability check roll:** `actor.rollAbilityCheck({ ability })` (object signature, dnd5e
  4.x+). Legacy `actor.rollAbilityTest(ability)` (string) only for dnd5e < 4.0.
- **Re-render open sheets:** iterate `foundry.applications.instances` (ApplicationV2) AND
  `ui.windows` (legacy V1). `ui.windows` does NOT contain V2 apps.
- **Tidy 5e Sheets (module `tidy5e-sheet`):** the non-classic **Quadrone** character sheet
  is ApplicationV2 and fires the STANDARD `renderActorSheetV2` hook. **It does NOT fire
  `tidy5e-sheet.renderActorSheet`** — that hook is for Tidy's legacy **V1** sheets only
  (verified: `Tidy5eSheetsApi.ts` says "App V1 ... or the standard sheet render hooks in
  App V2", and `Tidy5eCharacterSheetQuadrone.svelte.ts` only calls
  `tidy5eSheetsPrepareSheetContext`, never `tidy5eSheetsRenderActorSheet`). So to touch the
  Quadrone DOM, hook `renderActorSheetV2`; the Svelte DOM is already mounted by then (a short
  `requestAnimationFrame` retry covers any late mount). Do not gate Quadrone behaviour behind
  `tidy5e-sheet.renderActorSheet` — it will silently never run. Verified ability DOM (Quadrone, `AbilityScore.svelte`): tile
  `[data-tidy-sheet-part="ability-container"]` (= `.ability.<key>`); modifier number
  `[data-tidy-sheet-part="ability-value"]` (large by default) with its sign in
  `[data-tidy-sheet-part="ability-mod"]`, both inside the roll button
  `[data-tidy-sheet-part="ability-roller"]`; score number = the value span inside the
  `<label data-tidy-sheet-part="ability-score">` (use `> span:not(.ability-proficiency-indicator)`);
  save in `[data-tidy-sheet-part="ability-save-roller"]`. The Tidy **classic** sheet uses a
  different DOM — don't assume these selectors there.
- **Presentational sheet tweaks = root class + CSS.** For purely visual changes, toggle one
  class on the sheet root in the render hook and put all per-sheet selectors in CSS. The CSS
  cascades whenever the (possibly Svelte-mounted) inner DOM appears, so you avoid render-timing
  races and can support multiple sheets just by adding selectors (see Ability Score Prominence).
- **Tidy font / colour tokens (verified, `src/less/variables-quadrone.css` v13.4.3):**
  `--t5e-font-data-xlarge = 700 var(--font-size-28)` (modifier value);
  `--t5e-font-label-xlarge = 500 var(--font-size-28)` (modifier sign, but abilities.css
  overrides sign to `font-size: 1.5rem`);
  `--t5e-font-title-small = 400 var(--font-size-18) title-font` (score);
  `--t5e-color-text-lightest = var(--t5e-color-palette-grey-40)` (sign colour, dark theme: grey-60).
- **Tidy CSS + JS data-attribute pattern** (Ability Score Prominence): when a pure CSS
  reorder would move unwanted siblings (e.g. abbreviation tied to modifier container), use
  JS to stamp `data-*` attributes onto the tiles after the `renderActorSheetV2` hook, then
  CSS `content: attr(...)` pseudo-elements display the swapped values. Guard rules with
  `[data-attribute]` attribute selectors so pseudo-elements only appear once the attributes
  exist — no flash during the gap between `renderActorSheetV2` and the Svelte mount.
  Attributes stamped: `labelContainer.dataset.dtAspScore` (score value for badge),
  `scoreLabel.dataset.dtAspRowlabel` ("Mod" row label), `scoreLabel.dataset.dtAspMod`
  (combined modifier "+3"). The "Score" text node inside the label is hidden by setting
  `font-size: 0` on the label element (pseudo-elements set their own font via `font:`
  shorthand, so they're unaffected); `.ability-proficiency-indicator` gets `font-size: revert`
  to restore it.
- **dnd5e 5.x default sheet CSS: must use `!important` on font-size overrides.** dnd5e
  uses `!important` on its own size rules, so without `!important` our overrides don't
  apply. The `order` reorder then swaps visual positions but the text sizes stay native,
  leaving the mod text dominant in the score position. Fix: add `!important` to font-size
  on both `.score` and `.mod`. Score should use `--font-size-24` to match the prominence
  the original mod had.
- **dnd5e 5.x default sheet layout (verified from user screenshots):** vanilla shows score
  LARGE in the badge and mod small below. Our CSS needs `!important` on font-sizes to
  actually override dnd5e's rules and make the swap take effect correctly.
- **Pause:** worlds always activate paused (`game.paused = true` on activation). Unpause
  via `game.togglePause(false, { broadcast: true })` (returns the new state; only a GM may
  broadcast). The right time is the `ready` hook. There is no reliable client-side signal
  to distinguish a fresh server start from a GM page reload.
- **Non-GM unpause (v14+ confirmed):** `game.data.paused = false; game.socket.emit('pause', false); ui.pause?.render(); Hooks.callAll('pauseGame', false);` bypasses the GM-only check and broadcasts the pause state to all clients. Not an official API — may break in future Foundry updates.
- **Settings scopes:** `"user"` (per-user, synced across the user's devices; Foundry v13+),
  `"world"` (GM/global), `"client"` (per-browser/device).
- **Per-feature settings headers:** in `renderSettingsConfig`, find the input via
  `[name="<MODULE_ID>.<key>"]`, take `.closest(".form-group")`, and
  `insertAdjacentElement("beforebegin", header)`. Inputs are named `<module>.<key>`. Make
  it idempotent and degrade gracefully if the DOM isn't found.

### dnd5e Activities / Active Effects (verified against dnd5e **5.3.3** source)

> dnd5e git tags are prefixed `release-` (e.g. `release-5.3.3`), **not** bare `5.3.3` — plain
> tag URLs on raw.githubusercontent.com 404. Clone the repo to inspect it properly.

- **Activity use hooks** (`module/documents/activity/mixin.mjs`, in `Activity#use()`):
  `dnd5e.preUseActivity(activity, usageConfig, dialogConfig, messageConfig)` and
  `dnd5e.postUseActivity(activity, usageConfig, results)`. `dnd5e.useActivity` and
  `dnd5e.postUseItem` **do not exist**; the 3.x `dnd5e.useItem` was removed in 4.x.
- **Hooks fire only on the triggering client.** dnd5e has no socket layer at all (zero
  `socket.emit` / `game.socket.on` in `module/`). The cross-client signal is the chat message.
  So for "the caster does X to their own actor", just act in `postUseActivity` — the caster's
  client runs it and owns the actor. No GM relay, no double-apply guard needed.
- **`postUseActivity` fires AFTER the chat message is created**; `results.message` is the
  created ChatMessage document, `results.effects` holds any concentration effect.
- **The activity passed to the hooks belongs to a temporary item CLONE** —
  `use()` does `item = this.item.clone({}, { keepId: true })`. Ids are preserved but the
  clone's documents carry the wrong uuids, so **resolve real documents before using `uuid`**:
  `actor.items.get(activity.item.id)` then `realItem.effects.get(effect.id)`. The clone keeps
  the real actor as parent, so `activity.actor` is the real Actor5e.
- **`activity.applicableEffects`** (`module/data/activity/base-activity.mjs`) → the
  `ActiveEffect5e[]` the apply button would apply, already filtered by spell level. Prefer it
  over the raw `activity.effects` array (which is `{_id, level:{min,max}}` entries with a
  non-enumerable `.effect` getter). `activity.isSpell` → `item.type === "spell"`.
- **Range / target live on BOTH item and activity.** The activity inherits the item's values
  in `prepareFinalData` unless `range.override` / `target.override` is set, so
  `activity.range` is the *effective* value; fall back to `item.system.range`.
  `range.units` ∈ movement units (`ft`,`mi`,`m`,`km`) ∪ rangeTypes (`self`,`touch`,`spec`,`any`).
  `target.affects.type` ∈ `self, ally, enemy, creature, object, space, creatureOrObject, any, willing`.
- **GOTCHA — don't detect "self-cast" via `target.affects.type === "self"`.** The 2024
  *Mage Armor* is `range.units: "touch"` with `target.affects.type: "willing"`. Across the
  2024 spell packs only 13 spells use target type `self` while 73 use `range: self`. Key off
  **range** (`self`/`touch`) plus the actual targets.
- **Targets are snapshotted onto the usage message** as `flags.dnd5e.targets`, an array of
  `{name, img, uuid, ac}` where **`uuid` is the targeted token's ACTOR uuid**
  (`getTargetDescriptors()`, `module/utils.mjs`). More reliable than re-reading
  `game.user.targets` after the fact.
- **Who sees the chat-card apply button:** the `<effect-application>` tray filters effects with
  `game.user.isGM || (e.transfer && message.author === game.user)`
  (`module/data/chat-message/usage-message-data.mjs`). Effects an activity applies are
  `transfer: false`, so **players never see the apply button — only the GM does.**
  The target list additionally skips actors where `!actor.isOwner`.
- **Applying an effect programmatically** — mirror `EffectApplicationElement#_applyEffectToActor`
  (`module/applications/components/effect-application.mjs`). There is no public helper.
  `origin` = the concentration effect's uuid when the spell concentrates, else the *source
  effect's own* uuid (NOT the activity uuid). Duplicate prevention is
  `actor.effects.find(e => e.origin === origin.uuid)` → if found, `update()` to refresh
  duration + `disabled: false` instead of creating a second effect. Creation is plain
  `ActiveEffect.implementation.create({...effect.toObject(), disabled: false, transfer: false,
  origin: origin.uuid, flags: {dnd5e: {dependentOn, scaling, spellLevel}}}, { parent: actor })`.
  A non-GM must own the target actor or dnd5e throws (`DND5E.EffectApplyWarningOwnership`).
- **Concentration id** is on the usage message: `message.system.concentration` (dnd5e 5.1+) or
  `message.getFlag("dnd5e", "use.concentrationId")` (4.x). Concentration is started during
  `use()`, never by applying an effect. `activity.requiresConcentration` ← `duration.concentration`.
  dnd5e ≥ 5.2 links dependents via the `flags.dnd5e.dependentOn` flag; `addDependent()` still
  exists but is deprecated until 6.0 — needed only for < 5.2.
- **Chat-card effect tray targets** (`module/applications/components/targeted-application-mixin.mjs`):
  the tray has two modes. `buildTargetContainer()` does
  `if (!chatMessage.getFlag("dnd5e","targets")?.length) targetSourceControl.hidden = true`, and
  `connectedCallback` then forces `targetingMode = "selected"`. In `"selected"` mode the list is
  built from `canvas.tokens.controlled`; with nothing selected it prints
  `DND5E.Tokens.NoneSelected` = **"No Tokens Selected"**. That is why an untargeted self-cast
  shows that message. Fix: write `flags.dnd5e.targets` — dnd5e builds that flag into
  `messageConfig.data` *before* firing `dnd5e.preUseActivity`, so the hook can fill it in and
  the card is born with the right target. Also note `buildTargetListEntry` renders the checkbox
  `disabled` in `"selected"` mode, which is the padlock-looking control on the target row.
- **There is NO native "already applied" state** for a target — `buildTargetListEntry` renders
  only image, name and a checkbox, in both the effect and damage trays. Any applied-indicator
  has to be your own element. Insert it as a **sibling** of `<effect-application>` (which is in
  the template HTML) rather than decorating the tray's internals: the tray builds its inner DOM
  in `connectedCallback`, and its target list only while expanded
  (`shouldBuildTargetList` requires `open && visible`), so decorating inside is timing-dependent.
- **`dnd5e.renderChatMessage(message, html)`** (`module/documents/chat-message.mjs`, end of
  `renderHTML()`) fires after all dnd5e card modifications; `html` is an `HTMLElement` not yet
  inserted into the document. This is the right hook for decorating dnd5e chat cards — prefer it
  over guessing core's `renderChatMessage`/`renderChatMessageHTML` naming across versions.
- **Derive card state from live documents, not just flags.** A flag saying "applied" goes stale
  if the effect is deleted; re-checking `actor.effects.find(e => e.origin === …)` on each render
  keeps the UI honest for free.
- **`ActiveEffect.getInitialDuration()`** is what dnd5e 5.x calls to refresh a duration, but it
  is **deprecated in Foundry v14 and slated for removal in v16** (replaced by
  `getEffectStart()`, which returns a differently-shaped `{combat, initiative, round, turn}`).
  Guard the call with `typeof === "function"` rather than assuming it exists.

## Current features (keep this list current)

| Feature | id | File | System | Scope | Settings (default) |
|---|---|---|---|---|---|
| Ability Score Prominence | `abilityScoreProminence` | `features/ability-score-prominence.js` | dnd5e | user | `abilitySwapScoreAndMod` (off — default dnd5e sheet + Tidy 5e non-classic sheet), `abilityExpandedRollTargets` (off — default sheet only) |
| Spell Effect Auto-Apply | `spellEffectAutoApply` | `features/spell-effect-autoapply.js` | dnd5e | world | `spellAutoApplyEnabled` (off), `spellAutoApplyWhitelist` (`"Mage Armor"`) |

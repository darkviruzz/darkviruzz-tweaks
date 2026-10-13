#!/usr/bin/env node
/**
 * Behaviour tests for the features — run with `npm test` (Node 20+, no dependencies).
 *
 * Loads the real feature files, captures the hooks/keybindings they register, and drives
 * them with stubbed Foundry/dnd5e objects shaped after the verified APIs (dnd5e 5.x AND 6.x
 * message shapes). This checks our logic and guards — it cannot prove Foundry itself behaves
 * as the stubs assume; keep the stubs in sync with CLAUDE.md "Verified facts".
 * Add tests here when you add or change a feature.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_ID = "darkviruzz-tweaks";

/* ---------- stubs ---------- */
const hooks = {};
const settings = {};
const notes = [];
const getProperty = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const setProperty = (o, p, v) => { const ks = p.split("."); let t = o; for (const k of ks.slice(0, -1)) t = t[k] ??= {}; t[ks.at(-1)] = v; };
let activeGMSelf = true;
let createdEffects = [];

Object.assign(globalThis, {
  Hooks: { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f), callAll() {}, call() {} },
  game: {
    system: { id: "dnd5e", version: "6.0.6" },
    settings: { get: (ns, k) => settings[k] },
    i18n: { localize: k => k, format: (k, d) => `${k}:${JSON.stringify(d)}` },
    user: { isGM: false, character: null },
    get users() { return { activeGM: { isSelf: activeGMSelf } }; }
  },
  CONFIG: { specialStatusEffects: { DEFEATED: "dead" }, DND5E: { abilities: {} } },
  ui: { notifications: { info: m => notes.push(m), warn: m => notes.push(m) } },
  foundry: { utils: { getProperty, setProperty } },
  ActiveEffect: { implementation: { create: async (data, opts) => { createdEffects.push({ data, opts }); return { id: "newEffect" }; } } },
  customElements: { registry: {}, get(n) { return this.registry[n]; } }
});

const load = async f => (await import(pathToFileURL(join(ROOT, "scripts/features", f)).href)).default;
const features = {
  spell: await load("spell-effect-autoapply.js"),
  defeated: await load("defeated-tokens.js"),
  movement: await load("movement-history-reset.js"),
  find: await load("find-my-token.js"),
  pause: await load("pause-control.js")
};
for (const f of Object.values(features)) f.init();
const fire = async (name, ...args) => { for (const h of hooks[name] ?? []) await h(...args); };
const tick = () => new Promise(r => setTimeout(r, 10));
console.debug = () => {};
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

/* ---------- Spell Effect Auto-Apply ---------- */
settings.spellAutoApplyEnabled = true;
settings.spellAutoApplyWhitelist = "Mage Armor, Shield of Faith";

const tokenDoc = { uuid: "Scene.s.Token.t", name: "Wiz Token", texture: { src: "tok.webp" } };
const makeActor = () => {
  const effects = new Map();
  return {
    uuid: "Actor.wiz", name: "Wiz", img: "wiz.webp", isOwner: true, token: null,
    system: { attributes: { ac: { value: 12 } } },
    getActiveTokens: () => [tokenDoc],
    items: { get: () => ({ effects: { get: id => ({ id, real: true }) } }) },
    effects: { get: id => effects.get(id), find: () => null, _m: effects }
  };
};
const spellActivity = (actor, units = "touch", effects = [{ id: "e1" }]) => ({
  actor, range: { units }, applicableEffects: effects,
  item: { id: "i1", type: "spell", name: "Mage Armor", system: { range: { units } } }
});

await test("preUse v6: untargeted touch cast records the caster in system.targets", () => {
  const actor = makeActor();
  const cfg = { data: { system: { targets: [] } } };
  hooks["dnd5e.preUseActivity"][0](spellActivity(actor), {}, {}, cfg);
  assert.deepEqual(cfg.data.system.targets, [{ actor: "Actor.wiz", ac: 12, img: "tok.webp", name: "Wiz Token", token: "Scene.s.Token.t" }]);
});
await test("preUse v6: an explicit target (ally) is left untouched", () => {
  const cfg = { data: { system: { targets: [{ actor: "Actor.ally" }] } } };
  hooks["dnd5e.preUseActivity"][0](spellActivity(makeActor()), {}, {}, cfg);
  assert.deepEqual(cfg.data.system.targets, [{ actor: "Actor.ally" }]);
});
await test("preUse v5: untargeted cast records the caster in flags.dnd5e.targets", () => {
  const cfg = { data: { flags: { dnd5e: { targets: [] } } } };
  hooks["dnd5e.preUseActivity"][0](spellActivity(makeActor()), {}, {}, cfg);
  assert.equal(cfg.data.flags.dnd5e.targets[0].uuid, "Actor.wiz");
});
await test("preUse: non-whitelisted spell does nothing", () => {
  const a = spellActivity(makeActor()); a.item.name = "Fireball";
  const cfg = { data: { system: { targets: [] } } };
  hooks["dnd5e.preUseActivity"][0](a, {}, {}, cfg);
  assert.equal(cfg.data.system.targets.length, 0);
});

const v6Message = (targets, effects) => {
  const msg = { documentName: "ChatMessage", id: "m1", flags: {},
    system: { targets, getEffects: async () => effects },
    getFlag: () => undefined,
    setFlag: async (ns, k, v) => { msg.flags[`${ns}.${k}`] = v; } };
  return msg;
};
class TrayV6 { chatMessage; async _prepareEffectData(effect, actor) { TrayV6.calls.push({ effect, actor, msg: this.chatMessage }); return { action: "create", data: { name: "Mage Armor" } }; } }
TrayV6.calls = [];

await test("postUse v6: touch spell on an ALLY is not applied to the caster (the 1.5.x bug)", async () => {
  customElements.registry["effect-application"] = TrayV6; TrayV6.calls = []; createdEffects = [];
  const actor = makeActor();
  hooks["dnd5e.postUseActivity"][0](spellActivity(actor), {}, { message: v6Message([{ actor: "Actor.ally" }], [{ uuid: "Item.e1" }]) });
  await tick();
  assert.equal(TrayV6.calls.length, 0); assert.equal(createdEffects.length, 0);
});
await test("postUse v6: self-cast applies via dnd5e's _prepareEffectData and flags the message", async () => {
  TrayV6.calls = []; createdEffects = [];
  const actor = makeActor(); const msg = v6Message([{ actor: "Actor.wiz" }], [{ uuid: "Item.e1" }]);
  hooks["dnd5e.postUseActivity"][0](spellActivity(actor), {}, { message: msg });
  await tick();
  assert.equal(TrayV6.calls.length, 1); assert.equal(TrayV6.calls[0].msg, msg);
  assert.equal(createdEffects.length, 1); assert.equal(createdEffects[0].opts.parent, actor);
  assert.deepEqual(msg.flags[`${MODULE_ID}.autoApplied`], { actorUuid: "Actor.wiz", name: "Wiz", effectIds: ["newEffect"] });
});
await test("postUse v6: a spell offering TWO effects is not auto-applied", async () => {
  TrayV6.calls = [];
  hooks["dnd5e.postUseActivity"][0](spellActivity(makeActor()), {}, { message: v6Message([], [{ uuid: "a" }, { uuid: "b" }]) });
  await tick();
  assert.equal(TrayV6.calls.length, 0);
});
await test("postUse v6: 'update' result refreshes the existing effect instead of creating", async () => {
  let updated = null;
  class TrayUpd { chatMessage; async _prepareEffectData() { return { action: "update", data: { _id: "old" } }; } }
  customElements.registry["effect-application"] = TrayUpd; createdEffects = [];
  const actor = makeActor(); actor.effects._m.set("old", { update: async d => { updated = d; } });
  const msg = v6Message([], [{ uuid: "x" }]);
  hooks["dnd5e.postUseActivity"][0](spellActivity(actor, "self"), {}, { message: msg });
  await tick();
  assert.deepEqual(updated, { _id: "old" }); assert.equal(createdEffects.length, 0);
  assert.deepEqual(msg.flags[`${MODULE_ID}.autoApplied`].effectIds, ["old"]);
});
await test("postUse v5: uses applicableEffects resolved on the REAL item and _applyEffectToActor", async () => {
  const calls = [];
  class TrayV5 { chatMessage; async _applyEffectToActor(effect, actor) { calls.push(effect); return { id: "v5eff" }; } }
  customElements.registry["effect-application"] = TrayV5;
  const msg = { documentName: "ChatMessage", id: "m5", system: {}, getFlag: (s, k) => (s === "dnd5e" && k === "targets") ? [] : undefined, setFlag: async () => {} };
  hooks["dnd5e.postUseActivity"][0](spellActivity(makeActor()), {}, { message: msg });
  await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].real, true);
});
await test("postUse: not the owner → nothing", async () => {
  TrayV6.calls = []; customElements.registry["effect-application"] = TrayV6;
  const actor = makeActor(); actor.isOwner = false;
  hooks["dnd5e.postUseActivity"][0](spellActivity(actor), {}, { message: v6Message([], [{}]) });
  await tick();
  assert.equal(TrayV6.calls.length, 0);
});

/* ---------- Defeated Tokens ---------- */
const makeToken = (id, sort, scene) => {
  const t = { id, sort, flags: {}, updates: [],
    parent: scene,
    getFlag: (ns, k) => t.flags[`${ns}.${k}`],
    update: async d => { t.updates.push(d); if ("sort" in d) t.sort = d.sort; for (const [k, v] of Object.entries(d)) if (k.startsWith("flags.")) t.flags[k.slice(6)] = v; },
    unsetFlag: async (ns, k) => { delete t.flags[`${ns}.${k}`]; } };
  scene.tokens.push(t); return t;
};
const scene = { tokens: [] };
const dead = makeToken("dead", 5, scene); makeToken("b", 2, scene); makeToken("c", 7, scene);
const deadActor = { documentName: "Actor", effects: [], getDependentTokens: () => [dead] };
const deadEffect = () => {
  const e = { id: "dE", parent: deadActor, statuses: new Set(["dead"]), active: true, flags: {},
    getFlag: (ns, k) => e.flags[`${ns}.${k}`], update: async d => { e.lastUpdate = d; } };
  return e;
};

await test("defeated: nothing happens while both options are off", async () => {
  settings.defeatedOverlay = false; settings.defeatedSendToBack = false;
  const e = deadEffect(); await fire("createActiveEffect", e);
  assert.equal(e.lastUpdate, undefined); assert.equal(dead.updates.length, 0);
});
await test("defeated: overlay flag set + token sent behind the lowest sort, original remembered", async () => {
  settings.defeatedOverlay = true; settings.defeatedSendToBack = true;
  const e = deadEffect(); await fire("createActiveEffect", e);
  assert.deepEqual(e.lastUpdate, { "flags.core.overlay": true });
  assert.equal(dead.sort, 1); assert.equal(dead.getFlag(MODULE_ID, "sortBeforeDefeated"), 5);
});
await test("defeated: a second defeat keeps the ORIGINAL sort in the flag", async () => {
  dead.sort = 3; // something moved it up meanwhile
  await fire("createActiveEffect", deadEffect());
  assert.equal(dead.sort, 1); assert.equal(dead.getFlag(MODULE_ID, "sortBeforeDefeated"), 5);
});
await test("defeated: already behind everyone → no update", async () => {
  const before = dead.updates.length;
  await fire("createActiveEffect", deadEffect());
  assert.equal(dead.updates.length, before);
});
await test("defeated: still defeated via another effect → order not restored", async () => {
  deadActor.effects = [{ id: "other", active: true, statuses: new Set(["dead"]) }];
  await fire("deleteActiveEffect", deadEffect());
  assert.equal(dead.sort, 1);
});
await test("defeated: revived → original sort restored and flag removed", async () => {
  deadActor.effects = [];
  await fire("deleteActiveEffect", deadEffect());
  assert.equal(dead.sort, 5); assert.equal(dead.getFlag(MODULE_ID, "sortBeforeDefeated"), undefined);
});
await test("defeated: non-active-GM client never writes", async () => {
  activeGMSelf = false; const e = deadEffect(); const before = dead.updates.length;
  await fire("createActiveEffect", e);
  assert.equal(e.lastUpdate, undefined); assert.equal(dead.updates.length, before);
  activeGMSelf = true;
});
await test("defeated: effects that aren't 'dead' or live on items are ignored", async () => {
  const e = deadEffect(); e.statuses = new Set(["prone"]); await fire("createActiveEffect", e);
  const f = deadEffect(); f.parent = { documentName: "Item" }; await fire("createActiveEffect", f);
  assert.equal(e.lastUpdate, undefined); assert.equal(f.lastUpdate, undefined);
});

/* ---------- Movement History ---------- */
const combat = () => {
  const c = { round: 4, started: true, cleared: 0,
    combatants: [{ token: { movementHistory: [{}] } }, { token: { movementHistory: [] } }, { token: null }],
    clearMovementHistories: async () => { c.cleared++; } };
  return c;
};
settings.movementHistoryResetEachRound = true;
await test("movement: round advance clears histories on the active GM", async () => {
  const c = combat(); await fire("updateCombat", c, { round: 4 }, { direction: 1 }); assert.equal(c.cleared, 1);
});
await test("movement: rewind, turn-only change, non-GM, setting off, not started → no clear", async () => {
  let c = combat(); await fire("updateCombat", c, { round: 3 }, { direction: -1 }); assert.equal(c.cleared, 0);
  c = combat(); await fire("updateCombat", c, { turn: 2 }, { direction: 1 }); assert.equal(c.cleared, 0);
  activeGMSelf = false; c = combat(); await fire("updateCombat", c, { round: 5 }, {}); assert.equal(c.cleared, 0); activeGMSelf = true;
  settings.movementHistoryResetEachRound = false; c = combat(); await fire("updateCombat", c, { round: 5 }, {}); assert.equal(c.cleared, 0);
  settings.movementHistoryResetEachRound = true; c = combat(); c.started = false; await fire("updateCombat", c, { round: 1 }, {}); assert.equal(c.cleared, 0);
});
await test("movement: nothing recorded → no needless update", async () => {
  const c = combat(); c.combatants = [{ token: { movementHistory: [] } }];
  await fire("updateCombat", c, { round: 5 }, {}); assert.equal(c.cleared, 0);
});

/* ---------- Find My Token ---------- */
const pans = []; const pings = [];
const tok = (hidden = false) => { const t = { center: { x: 100, y: 200 }, document: { hidden }, isOwner: true, controlled: false, control: () => { t.controlled = true; } }; return t; };
globalThis.canvas = { ready: true, tokens: { controlled: [], ownedTokens: [] },
  animatePan: async v => pans.push(v), ping: p => pings.push(p) };
const onDown = features.find.keybindings[0].options.onDown;
settings.findTokenZoom = 1.5; settings.findTokenPing = false;

await test("find: player → character token, pan+zoom, selected, no ping by default", async () => {
  const t = tok(); game.user.character = { getActiveTokens: () => [t] };
  assert.equal(onDown(), true); await tick();
  assert.deepEqual(pans.at(-1), { x: 100, y: 200, scale: 1.5, duration: 250 });
  assert.equal(t.controlled, true); assert.equal(pings.length, 0);
});
await test("find: zoom 0 keeps the zoom; ping option pings", async () => {
  settings.findTokenZoom = 0; settings.findTokenPing = true;
  game.user.character = { getActiveTokens: () => [tok()] };
  onDown(); await tick();
  assert.deepEqual(pans.at(-1), { x: 100, y: 200, duration: 250 }); assert.equal(pings.length, 1);
  settings.findTokenZoom = 1.5; settings.findTokenPing = false;
});
await test("find: hidden character token is skipped → falls back to an owned token", async () => {
  const owned = tok(); owned.center = { x: 5, y: 6 };
  game.user.character = { getActiveTokens: () => [tok(true)] }; canvas.tokens.ownedTokens = [owned];
  onDown(); await tick();
  assert.equal(pans.at(-1).x, 5);
  canvas.tokens.ownedTokens = [];
});
await test("find: GM without a selected token gets a hint, no pan", async () => {
  game.user.isGM = true; const n = pans.length;
  onDown(); await tick();
  assert.equal(pans.length, n); assert.equal(notes.at(-1), "DT.FindMyToken.NoTokenGM");
  game.user.isGM = false;
});
await test("find: toolbar button only when enabled", () => {
  const controls = { tokens: { tools: { select: {} } } };
  settings.findTokenButton = false; hooks.getSceneControlButtons[0](controls);
  assert.equal(controls.tokens.tools.dtFindMyToken, undefined);
  settings.findTokenButton = true; hooks.getSceneControlButtons[0](controls);
  assert.equal(controls.tokens.tools.dtFindMyToken.button, true);
  assert.equal(typeof controls.tokens.tools.dtFindMyToken.onChange, "function");
});

/* ---------- Pause Control ---------- */
const toggles = [];
game.paused = true;
game.togglePause = (paused, options) => { toggles.push({ paused, options }); game.paused = paused; return paused; };
settings.movementHistoryResetEachRound = false;
const pauseCombat = (npc, { round = 1, started = true } = {}) => {
  const flags = {};
  return { round, started, combatants: Object.assign([{}, {}], { size: 2 }),
    combatant: { isNPC: npc },
    setFlag: async (ns, k, v) => { flags[`${ns}.${k}`] = v; },
    getFlag: (ns, k) => flags[`${ns}.${k}`], _flags: flags };
};
const resetPause = (paused = true) => { toggles.length = 0; game.paused = paused; };

await test("pause: world load unpauses (broadcast) only when enabled and on the active GM", async () => {
  resetPause(); settings.pauseUnpauseOnLoad = false; await fire("ready"); assert.equal(toggles.length, 0);
  settings.pauseUnpauseOnLoad = true; activeGMSelf = false; await fire("ready"); assert.equal(toggles.length, 0);
  activeGMSelf = true; await fire("ready");
  assert.deepEqual(toggles, [{ paused: false, options: { broadcast: true } }]);
});
await test("pause: combat start (round 0 → 1) unpauses; rewind to round 1 and later turns don't", async () => {
  settings.pauseUnpauseOnCombatStart = true; settings.pauseDuringNpcTurns = false;
  resetPause(); await fire("updateCombat", pauseCombat(false), { round: 1, turn: 0 }, {});
  assert.deepEqual(toggles.map(t => t.paused), [false]);
  resetPause(); await fire("updateCombat", pauseCombat(false), { round: 1, turn: 0 }, { direction: -1 });
  resetPause(); await fire("updateCombat", pauseCombat(false, { round: 2 }), { turn: 1 }, { direction: 1 });
  assert.equal(toggles.length, 0);
});
await test("pause: NPC turn pauses, player turn unpauses, and it wins over 'unpause on start'", async () => {
  settings.pauseDuringNpcTurns = true;
  resetPause(false); await fire("updateCombat", pauseCombat(true), { round: 1, turn: 0 }, {});
  assert.deepEqual(toggles.map(t => t.paused), [true]);
  resetPause(true); await fire("updateCombat", pauseCombat(false, { round: 2 }), { turn: 1 }, { direction: 1 });
  assert.deepEqual(toggles.map(t => t.paused), [false]);
  resetPause(true); await fire("updateCombat", pauseCombat(true, { round: 2 }), { turn: 2 }, { direction: 1 });
  assert.equal(toggles.length, 0); // already paused → no redundant toggle
});
await test("pause: not started / no combatants / unrelated update / non-GM → nothing", async () => {
  resetPause(false);
  await fire("updateCombat", pauseCombat(true, { round: 0, started: false }), { round: 0 }, {});
  const empty = pauseCombat(true); empty.combatants = Object.assign([], { size: 0 });
  await fire("updateCombat", empty, { turn: 1 }, {});
  await fire("updateCombat", pauseCombat(true), { name: "x" }, {});
  activeGMSelf = false; await fire("updateCombat", pauseCombat(true), { turn: 1 }, {}); activeGMSelf = true;
  assert.equal(toggles.length, 0);
});
await test("pause: state at combat creation is restored when the combat is deleted", async () => {
  settings.pauseRestoreAfterCombat = true; settings.pauseDuringNpcTurns = false;
  const c = pauseCombat(false);
  resetPause(true); await fire("createCombat", c);
  assert.equal(c._flags[`${MODULE_ID}.pausedBeforeCombat`], true);
  resetPause(false); await fire("deleteCombat", c);
  assert.deepEqual(toggles.map(t => t.paused), [true]);
  const unrecorded = pauseCombat(false);
  resetPause(false); await fire("deleteCombat", unrecorded); assert.equal(toggles.length, 0);
  settings.pauseRestoreAfterCombat = false; const d = pauseCombat(false);
  await fire("createCombat", d); assert.equal(d._flags[`${MODULE_ID}.pausedBeforeCombat`], undefined);
});

console.log(`\ntest-features: ${passed} passed`);

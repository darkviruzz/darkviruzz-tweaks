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
const userList = [];
const socketListeners = {};
const emits = [];
const keysDown = new Set();

Object.assign(globalThis, {
  Hooks: { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f), callAll() {}, call() {} },
  game: {
    system: { id: "dnd5e", version: "6.0.6" },
    settings: { get: (ns, k) => settings[k] },
    i18n: { localize: k => k, format: (k, d) => `${k}:${JSON.stringify(d)}` },
    user: { id: "me", isGM: false, character: null },
    get users() { return Object.assign(userList.slice(), { activeGM: { isSelf: activeGMSelf } }); },
    socket: {
      on: (channel, fn) => { socketListeners[channel] = fn; },
      emit: (channel, msg, opts) => emits.push({ channel, msg, opts, volatile: false }),
      get volatile() { return { emit: (channel, msg, opts) => emits.push({ channel, msg, opts, volatile: true }) }; }
    },
    keyboard: { isModifierActive: m => keysDown.has(m) }
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
  pause: await load("pause-control.js"),
  live: await load("live-token-drag.js")
};
for (const f of Object.values(features)) f.init();
const fire = async (name, ...args) => { for (const h of hooks[name] ?? []) await h(...args); };
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
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

/* ---------- Live Token Drag ---------- */
const CHANNEL = `module.${MODULE_ID}`;
userList.push(
  { id: "me", isGM: true, active: true, isSelf: true },
  { id: "gm2", isGM: true, active: true, isSelf: false },
  { id: "gm3", isGM: true, active: false, isSelf: false },
  { id: "p1", isGM: false, active: true, isSelf: false }
);
canvas.scene = { id: "scene1" };
const preview = (id, { x = 100, y = 100, hidden = false, previewType = "dragging", privateDrag = false } = {}) => ({
  isPreview: true, previewType,
  document: { id, x, y, hidden },
  _original: { _plannedMovement: { me: { hidden: privateDrag } } }
});
const moveTo = (p, x) => { p.document.x = x; return fire("refreshToken", p, {}); };
const endDrag = p => fire("destroyToken", p);
const resetEmits = async () => { await tick(40); emits.length = 0; }; // also lets the send window lapse
settings.liveDragEnabled = false; settings.liveDragShiftOnly = false;

await test("live drag (sender): setting off → nothing is sent", async () => {
  const p = preview("t1"); await moveTo(p, 150); await endDrag(p); await tick(40);
  assert.equal(emits.length, 0);
});
await test("live drag (sender): moves are coalesced to the LATEST position (~30/s), volatile, to everyone", async () => {
  settings.liveDragEnabled = true; await resetEmits();
  const p = preview("t1");
  for (const x of [110, 120, 130, 140, 150]) await moveTo(p, x);
  await tick();
  assert.equal(emits.length, 1);
  assert.deepEqual(emits[0], { channel: CHANNEL, opts: undefined, volatile: true,
    msg: { action: "move", scene: "scene1", tokens: [{ id: "t1", x: 150, y: 100 }], feature: "liveTokenDrag" } });
  await moveTo(p, 160); await moveTo(p, 170); await tick();
  assert.equal(emits.length, 1, "still inside the 33 ms window");
  await tick(40);
  assert.equal(emits.length, 2); assert.equal(emits[1].msg.tokens[0].x, 170);
  await moveTo(p, 170); await tick(40);
  assert.equal(emits.length, 2, "unchanged position is not sent again");
  await endDrag(p);
});
await test("live drag (sender): drop/cancel sends a reliable end signal; an unsent position is dropped", async () => {
  await resetEmits();
  const p = preview("t2"); await moveTo(p, 200); await endDrag(p); await tick(40);
  assert.deepEqual(emits.map(e => [e.msg.action, e.volatile]), [["end", false]]);
  assert.deepEqual(emits[0].msg, { action: "end", scene: "scene1", ids: ["t2"], feature: "liveTokenDrag" });
});
await test("live drag (sender): ignores real tokens and non-drag previews", async () => {
  await resetEmits();
  await fire("refreshToken", { isPreview: false, document: { id: "real", x: 1, y: 1 } }, {});
  const cfg = preview("t3", { previewType: "config" }); await moveTo(cfg, 300); await endDrag(cfg);
  await tick(40);
  assert.equal(emits.length, 0);
});
await test("live drag (sender): hidden token → only other CONNECTED GMs; nobody there → nothing", async () => {
  await resetEmits();
  const p = preview("h1", { hidden: true }); await moveTo(p, 120); await tick(); await endDrag(p);
  assert.deepEqual(emits.map(e => [e.msg.action, e.opts]), [["move", { recipients: ["gm2"] }], ["end", { recipients: ["gm2"] }]]);
  await resetEmits(); userList[1].active = false;
  const q = preview("h2", { hidden: true }); await moveTo(q, 120); await tick(); await endDrag(q);
  assert.equal(emits.length, 0);
  userList[1].active = true;
});
await test("live drag (sender): drag started with Alt (private ruler) is not shown, no end signal", async () => {
  await resetEmits();
  const p = preview("a1", { privateDrag: true }); await moveTo(p, 120); await tick(40); await endDrag(p);
  assert.equal(emits.length, 0);
});
await test("live drag (sender): Shift-only waits for Shift, then stays live after it is released", async () => {
  settings.liveDragShiftOnly = true; await resetEmits();
  const p = preview("s1"); await moveTo(p, 120); await tick(40);
  assert.equal(emits.length, 0);
  keysDown.add("SHIFT"); await moveTo(p, 130); keysDown.delete("SHIFT"); await tick(40);
  await moveTo(p, 140); await tick(40); await endDrag(p);
  assert.deepEqual(emits.map(e => e.msg.action), ["move", "move", "end"]);
  assert.equal(emits[1].msg.tokens[0].x, 140);
  await resetEmits(); const q = preview("s2"); await moveTo(q, 120); await endDrag(q);
  assert.equal(emits.length, 0, "never live → no end signal");
  settings.liveDragShiftOnly = false;
});
await test("live drag (sender): leaving the scene ends this client's live drags", async () => {
  await resetEmits();
  const p = preview("c1"); await moveTo(p, 120); await tick();
  await fire("canvasTearDown");
  await endDrag(p); // the preview is destroyed afterwards — no second end
  assert.deepEqual(emits.map(e => e.msg.action), ["move", "end"]);
});

// Receivers: stubbed ticker, visibility (x ≥ 1000 is too dark to see) and token display objects.
globalThis.PIXI = { UPDATE_PRIORITY: { NORMAL: 0, PRIMARY: 3 } };
const ticker = { fns: [], add(fn, ctx, priority) { this.fns.push({ fn, priority }); }, remove(fn) { this.fns = this.fns.filter(f => f.fn !== fn); } };
const frame = () => { for (const { fn } of ticker.fns) fn(); };
canvas.app = { ticker };
canvas.visibility = { tokenVision: true, testVisibility: points => points.every(p => p.x < 1000) };
canvas.effects = { visionSources: [{ active: true }] };
const liveTokens = new Map();
const liveToken = (id, { x = 0, y = 0 } = {}) => {
  const t = { id, hasPreview: false, destroyed: false, controlled: false, renderable: true, isVisible: true, vision: null,
    visible: true, stops: 0, flags: [],
    document: { id, x, y, getVisibilityTestPoints: p => [p] },
    get center() { return { x: t.document.x + 50, y: t.document.y + 50 }; },
    position: { x, y, set(a, b) { this.x = a; this.y = b; } },
    mesh: { visible: true, position: { x: x + 50, y: y + 50, set(a, b) { this.x = a; this.y = b; } } },
    renderFlags: { set: f => t.flags.push(f) },
    stopAnimation: () => { t.stops++; } };
  t.document.object = t; liveTokens.set(id, t); return t;
};
canvas.tokens.get = id => liveTokens.get(id);
const receive = (msg, sender = "p1") => socketListeners[CHANNEL]({ feature: "liveTokenDrag", scene: "scene1", ...msg }, sender);
const RESTORE = { refreshPosition: true, refreshVisibility: true };

await test("live drag (receiver): glides the DISPLAY to the position; document, vision and light stay put", async () => {
  const t = liveToken("r1");
  receive({ action: "move", tokens: [{ id: "r1", x: 300, y: 0 }] });
  assert.deepEqual(ticker.fns.map(f => f.priority), [4], "one ticker, after core's render flags");
  frame(); assert.ok(t.position.x < 300, "glides, doesn't jump");
  await tick(60); frame();
  assert.deepEqual([t.position.x, t.position.y, t.mesh.position.x, t.mesh.position.y], [300, 0, 350, 50]);
  assert.equal(t.document.x, 0); assert.equal(t.visible, true); assert.equal(t.mesh.visible, true);
  receive({ action: "move", scene: "other", tokens: [{ id: "r1", x: 1, y: 1 }] });
  socketListeners[CHANNEL]({ feature: "somethingElse", action: "move", scene: "scene1", tokens: [{ id: "r1", x: 2, y: 2 }] }, "p1");
  receive({ action: "move", tokens: [{ id: "r1", x: "evil", y: 1 }] });
  await tick(60); frame();
  assert.equal(t.position.x, 300, "other scenes, features and bad data are ignored");
});
await test("live drag (receiver): visibility is tested where the token is SHOWN (and where it really is)", async () => {
  const t = liveTokens.get("r1");
  receive({ action: "move", tokens: [{ id: "r1", x: 1200, y: 0 }] });
  await tick(60); frame();
  assert.equal(t.visible, false); assert.equal(t.mesh.visible, false);
  t.vision = { active: true }; receive({ action: "move", tokens: [{ id: "r1", x: 1300, y: 0 }] }); frame();
  assert.equal(t.visible, true, "a token you see through is always visible (core rule)");
  t.vision = null; t.isVisible = false; receive({ action: "move", tokens: [{ id: "r1", x: 500, y: 0 }] }); frame();
  assert.equal(t.visible, false, "not visible where it really stands → not shown");
  t.isVisible = true;
});
await test("live drag (receiver): end → glides back, then core redraws it; the ticker stops", async () => {
  const t = liveTokens.get("r1");
  receive({ action: "end", ids: ["r1"] });
  frame(); assert.ok(t.position.x > 0);
  await tick(270); frame();
  assert.deepEqual(t.flags.at(-1), RESTORE);
  assert.equal(ticker.fns.length, 0);
  const before = t.flags.length; receive({ action: "end", ids: ["r1"] }); frame();
  assert.equal(t.flags.length, before, "a second end is a no-op");
});
await test("live drag (receiver): drop → core's path animation is stopped, the end signal changes nothing", async () => {
  const t = liveToken("r3");
  receive({ action: "move", tokens: [{ id: "r3", x: 300, y: 300 }] });
  await fire("updateToken", t.document, { flags: { x: 1 } }, {}, "p1");
  assert.equal(t.stops, 0, "non-movement update leaves it alone");
  await fire("updateToken", t.document, { x: 300, y: 300 }, {}, "p1");
  assert.equal(t.stops, 1); assert.deepEqual(t.flags, [RESTORE]);
  receive({ action: "end", ids: ["r3"] }); frame();
  assert.equal(t.flags.length, 1); assert.equal(ticker.fns.length, 0);
  await fire("updateToken", t.document, { x: 0 }, {}, "p1");
  assert.equal(t.stops, 1, "later moves animate normally");
});
await test("live drag (receiver): own drags are ignored; starting to drag it here hands it back to core", () => {
  const own = liveToken("r5"); own.hasPreview = true;
  receive({ action: "move", tokens: [{ id: "r5", x: 1, y: 2 }] }); frame();
  assert.equal(own.position.x, 0); assert.equal(ticker.fns.length, 0);
  const t = liveToken("r6");
  receive({ action: "move", tokens: [{ id: "r6", x: 100, y: 0 }] }); frame();
  t.hasPreview = true; frame();
  assert.deepEqual(t.flags, [RESTORE]); assert.equal(ticker.fns.length, 0);
});
await test("live drag (receiver): the dragging user disconnects → only their tokens glide back", async () => {
  const a = liveToken("r7"); const b = liveToken("r8");
  receive({ action: "move", tokens: [{ id: "r7", x: 100, y: 100 }] }, "p1");
  receive({ action: "move", tokens: [{ id: "r8", x: 100, y: 100 }] }, "gm2");
  await fire("userConnected", { id: "p1" }, true);
  await fire("userConnected", { id: "p1" }, false);
  await tick(270); frame();
  assert.deepEqual(a.flags, [RESTORE]); assert.equal(b.flags.length, 0, "other users' drags continue");
  await fire("canvasTearDown");
  assert.equal(ticker.fns.length, 0);
});

/* ---------- File Browser Preview ---------- */
const fpModule = await import(pathToFileURL(join(ROOT, "scripts/features/file-picker-preview.js")).href);
const fp = fpModule.internals;
fpModule.default.init();

// The "data" source: folders that exist, files in them, and what was created/uploaded/fetched.
const fpStore = {};
const fpReset = () => {
  fp.reset();
  Object.assign(fpStore, { dirs: new Set([`modules/${MODULE_ID}`]), files: new Map(), created: [], uploads: [], fetches: [] });
};
fpReset();
const fpDefaultOriginal = { bytes: 600 * 1024, width: 4096, height: 2048, headBytes: 600 * 1024 };
let fpOriginal = { ...fpDefaultOriginal };
let fpCanUpload = true;
let fpUploadFails = false;
globalThis.CONST = { IMAGE_FILE_EXTENSIONS: { png: "image/png", webp: "image/webp", svg: "image/svg+xml" } };
game.modules = { get: () => ({ persistentStorage: true }) };
game.user.can = permission => (permission === "FILES_UPLOAD") && fpCanUpload;
foundry.applications = {
  instances: new Map(),
  apps: { FilePicker: { implementation: {
    browse: async (source, dir) => {
      if (!fpStore.dirs.has(dir)) throw new Error(`no such folder ${dir}`);
      return { files: [...fpStore.files.keys()].filter(f => f.startsWith(`${dir}/`)) };
    },
    createDirectory: async (source, dir) => { fpStore.created.push(dir); fpStore.dirs.add(dir); return dir; },
    upload: async (source, dir, file, body, options) => {
      if (fpUploadFails) return false;
      const path = `${dir}/${file.name}`;
      fpStore.uploads.push({ source, dir, name: file.name, type: file.type, notify: options?.notify });
      fpStore.files.set(path, file);
      return { status: "success", path };
    }
  } } }
};
globalThis.fetch = async (url, options = {}) => {
  fpStore.fetches.push({ url, method: options.method ?? "GET" });
  return { ok: true, headers: new Map([["content-length", String(fpOriginal.headBytes)]]),
    blob: async () => new Blob([new Uint8Array(fpOriginal.bytes)], { type: "image/png" }) };
};
globalThis.createImageBitmap = async (source, options) => (options
  ? { width: options.resizeWidth, height: options.resizeHeight, close() {} }
  : { width: fpOriginal.width, height: fpOriginal.height, close() {} });
globalThis.document = { createElement: () => ({
  getContext: () => ({ drawImage() {} }),
  toBlob: (resolve, type) => resolve(new Blob([new Uint8Array(12 * 1024)], { type }))
}) };
settings.filePreviewThumbCache = true;
settings.filePreviewThumbMinKB = 250;
const fpApp = { activeSource: "data" };
const fpMap = "worlds/greyhawk/maps/Big%20Map.png";
const fpGets = () => fpStore.fetches.filter(f => f.method === "GET").length;

await test("file preview: cache slots are stable, filename-safe, one folder per asset folder", () => {
  const a = fp.cacheSlot(fpMap);
  assert.deepEqual(fp.cacheSlot("worlds/greyhawk/maps/Big Map.png"), a); // encoded and decoded agree
  assert.match(a.dir, new RegExp(`^modules/${MODULE_ID}/storage/thumbs/[0-9a-z]+$`));
  assert.match(a.key, /^[0-9a-z]+$/);
  assert.equal(fp.cacheSlot("worlds/greyhawk/maps/Other.png").dir, a.dir);
  assert.notEqual(fp.cacheSlot("worlds/greyhawk/tokens/Big Map.png").dir, a.dir);
  const index = fp.indexFiles([`${a.dir}/${a.key}-4096x2048-614400.webp`, `${a.dir}/readme.txt`]);
  assert.deepEqual([...index], [[a.key, [{ src: `${a.dir}/${a.key}-4096x2048-614400.webp`, width: 4096, height: 2048, bytes: 614400 }]]]);
});
await test("file preview: cache off, another source or no persistent storage → the original, nothing fetched", async () => {
  settings.filePreviewThumbCache = false;
  assert.deepEqual(await fp.resolvePreview(fpApp, fpMap), { src: fpMap });
  settings.filePreviewThumbCache = true;
  assert.deepEqual(await fp.resolvePreview({ activeSource: "public" }, "icons/svg/x.png"), { src: "icons/svg/x.png" });
  game.modules = { get: () => ({ persistentStorage: false }) };
  assert.deepEqual(await fp.resolvePreview(fpApp, fpMap), { src: fpMap });
  game.modules = { get: () => ({ persistentStorage: true }) };
  assert.equal(fpStore.fetches.length, 0);
});
await test("file preview: large image without thumbnail → original shown, thumbnail made in module storage", async () => {
  fpReset();
  const preview = await fp.resolvePreview(fpApp, fpMap);
  assert.equal(preview.objectURL, true); assert.equal(preview.bytes, 600 * 1024);
  URL.revokeObjectURL(preview.src);
  await fp.idle();
  const { dir, key } = fp.cacheSlot(fpMap);
  assert.deepEqual(fpStore.created, [`modules/${MODULE_ID}/storage`, `modules/${MODULE_ID}/storage/thumbs`, dir]);
  assert.deepEqual(fpStore.uploads, [{ source: "data", dir, name: `${key}-4096x2048-614400.webp`, type: "image/webp", notify: false }]);
});
await test("file preview: next hover shows the thumbnail with the original's size, original not downloaded", async () => {
  const gets = fpGets();
  const preview = await fp.resolvePreview(fpApp, fpMap);
  assert.equal(preview.cached, true); assert.equal(preview.width, 4096); assert.equal(preview.height, 2048);
  assert.match(preview.src, /-4096x2048-614400\.webp$/);
  await fp.idle();
  assert.equal(fpGets(), gets);                        // only a HEAD to compare the size
  assert.equal(fpStore.uploads.length, 1);
});
await test("file preview: a later session finds the thumbnail by browsing its cache folder", async () => {
  fp.reset();                                          // new session, same files on the server
  const preview = await fp.resolvePreview(fpApp, fpMap);
  assert.equal(preview.cached, true); assert.equal(preview.width, 4096);
});
await test("file preview: replaced original (HEAD size differs) → thumbnail made again and preferred", async () => {
  fp.reset();
  fpOriginal = { bytes: 700 * 1024, width: 3000, height: 3000, headBytes: 700 * 1024 };
  await fp.resolvePreview(fpApp, fpMap);
  await fp.idle();
  assert.equal(fpStore.uploads.length, 2);
  assert.match(fpStore.uploads[1].name, /-3000x3000-716800\.webp$/);
  assert.equal((await fp.resolvePreview(fpApp, fpMap)).width, 3000);
  fpOriginal = { ...fpDefaultOriginal };
});
await test("file preview: small file, svg or no upload permission → original, no thumbnail", async () => {
  fpReset();
  fpOriginal.bytes = 100 * 1024;
  await fp.resolvePreview(fpApp, fpMap); await fp.idle();
  fpOriginal = { ...fpDefaultOriginal };
  assert.deepEqual(await fp.resolvePreview(fpApp, "worlds/greyhawk/maps/door.svg"), { src: "worlds/greyhawk/maps/door.svg" });
  fpCanUpload = false;
  assert.deepEqual(await fp.resolvePreview(fpApp, "worlds/greyhawk/maps/Other.png"), { src: "worlds/greyhawk/maps/Other.png" });
  fpCanUpload = true;
  await fp.idle();
  assert.equal(fpStore.uploads.length, 0);
});
await test("file preview: image already thumbnail-sized → no thumbnail, not downloaded again", async () => {
  fpReset();
  fpOriginal = { ...fpDefaultOriginal, width: 200, height: 100 };
  await fp.resolvePreview(fpApp, fpMap); await fp.idle();
  const gets = fpGets();
  assert.deepEqual(await fp.resolvePreview(fpApp, fpMap), { src: fpMap });
  assert.equal(fpGets(), gets); assert.equal(fpStore.uploads.length, 0);
  fpOriginal = { ...fpDefaultOriginal };
});
await test("file preview: a failed upload switches thumbnail creation off for the session (one warning)", async () => {
  fpReset(); fpUploadFails = true;
  const warn = console.warn; const warnings = []; console.warn = (...a) => warnings.push(a.join(" "));
  await fp.resolvePreview(fpApp, fpMap); await fp.idle();
  assert.deepEqual(await fp.resolvePreview(fpApp, "worlds/greyhawk/maps/Other.png"), { src: "worlds/greyhawk/maps/Other.png" });
  await fp.idle();
  console.warn = warn; fpUploadFails = false;
  assert.equal(warnings.length, 1);
});
await test("file preview: render hook toggles tile names per setting and binds its listeners once", () => {
  globalThis.HTMLElement ??= class {};
  const classes = new Set(); const listeners = [];
  const root = Object.assign(new HTMLElement(), {
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    addEventListener: type => listeners.push(type)
  });
  settings.filePreviewTileNames = false;
  hooks.renderFilePicker[0]({}, root);
  assert.equal(classes.has("dt-fp-tile-names"), false);
  settings.filePreviewTileNames = true;
  hooks.renderFilePicker[0]({}, root);
  assert.equal(classes.has("dt-fp-tile-names"), true);
  assert.deepEqual(listeners, ["pointerover", "pointerout", "dragstart", "scroll"]);
});

console.log(`\ntest-features: ${passed} passed`);

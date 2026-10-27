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
  live: await load("live-token-drag.js"),
  art: await load("token-art-picker.js")
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

await test("file preview: preview size is the user's choice, clamped to the viewport; small images grow at most 2x", async () => {
  assert.deepEqual(fp.displaySize(100, 50, 384), { width: 200, height: 100 });
  assert.deepEqual(fp.displaySize(2000, 1000, 384), { width: 384, height: 192 });
  assert.deepEqual(fp.displaySize(512, 256, 512), { width: 512, height: 256 });
  assert.equal(fp.displaySize(0, 0, 384), null);
  const saved = { w: globalThis.innerWidth, h: globalThis.innerHeight };
  Object.assign(globalThis, { innerWidth: 1920, innerHeight: 1080 });
  settings.filePreviewSize = 512; assert.equal(fp.previewSize(), 512);
  settings.filePreviewSize = 999; assert.equal(fp.previewSize(), 384, "unknown value falls back to medium");
  Object.assign(globalThis, { innerWidth: 800, innerHeight: 500 });
  settings.filePreviewSize = 512; assert.equal(fp.previewSize(), 436, "never larger than the viewport");
  Object.assign(globalThis, { innerWidth: saved.w, innerHeight: saved.h });
});
await test("file preview: first preview after a long rest, then quick from image to image; off the images or out of the window resets", () => {
  settings.filePreviewHover = true;
  let clock = 0;
  fp.timing.now = () => clock;
  const app = { displayMode: "list" };
  const row = path => { const r = { dataset: { path, file: "" }, isConnected: true }; r.closest = () => r; return r; };
  const a = row("maps/a.png"); const b = row("maps/b.png"); const sound = row("sounds/x.ogg");
  const gap = { closest: () => null };
  const root = { contains: node => [a, b, sound, gap].includes(node) };
  fp.hidePreview({ cool: true });
  fp.onPointerOver(app, { target: a });
  assert.equal(fp.hoverState().delay, 900, "first image: long rest");
  fp.timing.shown = true;                                   // a's preview is on screen
  fp.onPointerOver(app, { target: b });
  assert.equal(fp.hoverState().delay, 150, "image to image");
  fp.onPointerOver(app, { target: gap });                   // the gap between two rows
  assert.equal(fp.hoverState(), null, "hidden off the images");
  clock = 200; fp.onPointerOver(app, { target: a });
  assert.equal(fp.hoverState().delay, 150, "within the grace period still quick");
  fp.timing.shown = true; clock = 1000;
  fp.onPointerOver(app, { target: sound });                 // not an image
  clock = 1400; fp.onPointerOver(app, { target: b });
  assert.equal(fp.hoverState().delay, 900, "after resting off the images: long again");
  fp.timing.shown = true;
  fp.onPointerOut({ currentTarget: root, relatedTarget: a });
  assert.ok(fp.hoverState(), "moving inside the browser keeps the hover");
  fp.onPointerOut({ currentTarget: root, relatedTarget: null });   // out of the window
  fp.onPointerOver(app, { target: a });
  assert.equal(fp.hoverState().delay, 900, "leaving the browser starts over");
  settings.filePreviewHover = false; fp.hidePreview({ cool: true });
  fp.onPointerOver(app, { target: a });
  assert.equal(fp.hoverState(), null, "setting off: nothing");
  fp.timing.now = () => performance.now();
});

/* ---------- Token Art Picker (Too Many Tokens) ---------- */
const tmt = await import(pathToFileURL(join(ROOT, "scripts/lib/too-many-tokens.js")).href);
const artModule = await import(pathToFileURL(join(ROOT, "scripts/features/token-art-picker.js")).href);
const DND = "https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-dnd/main/";

await test("tmt: list parsing skips blanks and Prompts.txt; variant tags ignore order/counter/typos", () => {
  assert.deepEqual(tmt.parseListing("A (1).webp\r\n\r\nPrompts.txt\nB.png"), ["A (1).webp", "B.png"]);
  assert.deepEqual(tmt.describeVariant("Bandit", "BanditHalflingUrbanFemaleMelee (3).webp").tags, ["Halfling", "Urban", "Female", "Melee"]);
  assert.deepEqual(tmt.describeVariant("Bandit Captain", "BanditCaptainHalfOrcCostalMale (1).webp").tags, ["HalfOrc", "Coastal", "Male"]);
  assert.deepEqual(tmt.describeVariant("Giant Crawling Hand", "Giant Crawling Hand (12).webp").tags, []);
  assert.deepEqual(tmt.describeVariant("Xulgath Leader", "_017aa1ad-3a36-4b69-b82e-20c46ffb3c3b_cleanup.jpg").tags, []);
});
await test("tmt: image URLs round-trip in both encodings; legacy wildcard paths are parsed", () => {
  const url = tmt.imageUrl("dnd", "Bandit Captain", "BanditCaptainHumanMale (1).webp");
  assert.equal(url, `${DND}Bandit%20Captain/BanditCaptainHumanMale%20(1).webp`);
  assert.deepEqual(tmt.parseImageUrl(url), { system: "dnd", creature: "Bandit Captain", file: "BanditCaptainHumanMale (1).webp" });
  assert.equal(tmt.parseImageUrl(`${DND}Commoner/CommonerHumanTavernMale (22).webp`).creature, "Commoner");
  assert.equal(tmt.parseImageUrl("https://raw.githubusercontent.com/IsThisMyRealName/too-many-tokens-pf/main/Tokens/Boar/BoarSummer%20(1).webp").system, "pf");
  assert.equal(tmt.parseImageUrl("icons/svg/mystery-man.svg"), null);
  assert.ok(tmt.sameImage(`${DND}Veteran/V%20(5).webp`, `${DND}Veteran/V (5).webp`));
  const legacy = tmt.parseLegacyWildcard("tmtopptmtopptmtopp_dnd_Commoner/Scout_.*(Human).*(Male).*.webp");
  assert.deepEqual(legacy.creatures, ["Commoner", "Scout"]);
  assert.ok(legacy.regex.test("Scout/ScoutHumanMaleForest (1).webp"));
  assert.ok(!legacy.regex.test("Scout/ScoutElfFemaleForest (1).webp"));
  assert.equal(tmt.parseLegacyWildcard(`${DND}Bandit/x.webp`), null);
});
await test("tmt: creature ranking prefers exact/longer names and maps D&D 2024 renames", () => {
  const names = ["Bandit", "Bandit Captain", "Thug", "Veteran", "Tribal Warrior", "Guard"];
  assert.equal(tmt.rankCreatures(names, ["Bandit Captain 3"])[0].name, "Bandit Captain");
  assert.equal(tmt.rankCreatures(names, ["Tough"])[0].name, "Thug");
  assert.equal(tmt.rankCreatures(names, ["Warrior Veteran"])[0].name, "Veteran");
  assert.equal(tmt.rankCreatures(names, ["Guard (Bastion Defender)"])[0].name, "Guard");
  assert.deepEqual(tmt.rankCreatures(names, ["Brida"]), []);
});
await test("tmt: pools are stored compactly and spread without repeats", () => {
  const urls = [`${DND}Bandit/a.webp`, `${DND}Scout/b.webp`];
  const pool = tmt.compactPool(urls);
  assert.equal(pool.base, DND);
  assert.deepEqual(tmt.expandPool(pool), urls);
  assert.deepEqual(tmt.expandPool({ base: 3, files: ["x", null] }), ["x"]);
  assert.deepEqual(tmt.expandPool(undefined), []);
  assert.equal(new Set(tmt.distribute(["a", "b", "c"], 3)).size, 3);
  assert.equal(tmt.distribute(["a"], 4).join(), "a,a,a,a");
  assert.equal(tmt.randomPick(["a", "b"], "a", () => 0), "b");
});

const artActor = (pool, protoSrc = `${DND}Bandit/a.webp`) => ({
  id: "act1", name: "Bandit", isOwner: true, prototypeToken: { texture: { src: protoSrc } },
  getFlag: (ns, k) => (ns === MODULE_ID && k === "tokenArtPool" ? pool : undefined)
});
const pendingToken = (actor, src) => ({
  baseActor: actor, actorId: actor?.id, texture: { src }, updated: null,
  updateSource(changes) { this.updated = changes; }
});
const fullPool = tmt.compactPool([`${DND}Bandit/a.webp`, `${DND}Bandit/b%20(2).webp`, `${DND}Bandit/c.webp`]);

await test("token art: wildcard pool randomises new tokens only when enabled and on the prototype image", () => {
  const pre = hooks.preCreateToken[0];
  settings.tokenArtEnabled = false;
  let doc = pendingToken(artActor(fullPool), `${DND}Bandit/a.webp`); pre(doc); assert.equal(doc.updated, null);
  settings.tokenArtEnabled = true;
  doc = pendingToken(artActor(fullPool), `${DND}Bandit/a.webp`); pre(doc);
  assert.ok(tmt.expandPool(fullPool).includes(doc.updated["texture.src"]));
  for (let i = 0; i < 10; i++) {   // never the same image twice in a row
    const next = pendingToken(artActor(fullPool), `${DND}Bandit/a.webp`); pre(next);
    assert.notEqual(next.updated["texture.src"], doc.updated["texture.src"]);
    doc = next;
  }
  doc = pendingToken(artActor(fullPool), `${DND}Bandit/zzz.webp`); pre(doc); assert.equal(doc.updated, null);   // pasted variant
  doc = pendingToken(artActor(tmt.compactPool([`${DND}Bandit/a.webp`])), `${DND}Bandit/a.webp`); pre(doc); assert.equal(doc.updated, null);
  doc = pendingToken(null, "x.webp"); pre(doc); assert.equal(doc.updated, null);
});
await test("token art: planUpdates spreads images over tokens per scene and sets prototype/pool/portrait", () => {
  const sceneA = { id: "A" }; const sceneB = { id: "B" };
  const tokens = [{ id: "t1", parent: sceneA }, { id: "t2", parent: sceneA }, { id: "t3", parent: sceneB }];
  const urls = [`${DND}Bandit/a.webp`, `${DND}Bandit/b.webp`, `${DND}Bandit/c.webp`];
  const withPool = artActor(fullPool); const without = artActor(undefined);
  let plan = artModule.planUpdates({ tokens, actors: [withPool], urls, prototype: true, wildcard: true, portrait: false });
  assert.equal(plan.tokenUpdates.get(sceneA).length, 2); assert.equal(plan.tokenUpdates.get(sceneB).length, 1);
  assert.equal(new Set([...plan.tokenUpdates.values()].flat().map(u => u["texture.src"])).size, 3);
  const update = plan.actorUpdates[0].update;
  assert.equal(update["prototypeToken.texture.src"], urls[0]);
  assert.equal(update["prototypeToken.randomImg"], false);
  assert.deepEqual(tmt.expandPool(update[`flags.${MODULE_ID}.tokenArtPool`]), urls);
  assert.equal(plan.actorUpdates[0].clearPool, false);
  plan = artModule.planUpdates({ actors: [withPool, without], urls, prototype: true, wildcard: false });
  assert.deepEqual(plan.actorUpdates.map(a => a.clearPool), [true, false]);
  assert.equal(plan.actorUpdates[0].update[`flags.${MODULE_ID}.tokenArtPool`], undefined);
  plan = artModule.planUpdates({ actors: [withPool], urls, prototype: false, portrait: true });
  assert.deepEqual(plan.actorUpdates[0], { actor: withPool, update: { img: urls[0] }, clearPool: false });
});
await test("token art: opening is guarded (disabled, TMT not installed, nothing owned)", () => {
  notes.length = 0;
  settings.tokenArtEnabled = false; assert.equal(artModule.openTokenArtPicker(), null);
  settings.tokenArtEnabled = true; game.modules = { get: () => undefined }; assert.equal(artModule.openTokenArtPicker(), null);
  game.modules = { get: id => (id === "too-many-tokens-online" ? { active: false } : undefined) };
  canvas.tokens.controlled = [{ document: { isOwner: false } }]; assert.equal(artModule.openTokenArtPicker(), null);
  canvas.tokens.controlled = [];
  assert.deepEqual(notes, ["DT.TokenArt.Disabled", "DT.TokenArt.NoTmt", "DT.TokenArt.NoTarget"]);
});
await test("token art: Actors sidebar entry uses the v14 ContextMenuEntry shape and is gated", () => {
  const items = []; hooks.getActorContextOptions[0]({}, items);
  const entry = items[0];
  assert.equal(entry.label, "DT.TokenArt.ContextEntry"); assert.equal(typeof entry.onClick, "function");
  const owned = artActor(undefined); game.actors = { get: id => (id === "act1" ? owned : undefined) };
  const li = { closest: () => ({ dataset: { entryId: "act1" } }) };
  settings.tokenArtEnabled = false; assert.equal(entry.visible(li), false);
  settings.tokenArtEnabled = true; assert.equal(entry.visible(li), true);
  owned.isOwner = false; assert.equal(entry.visible(li), false);
});
await test("token art: Token HUD button only with both options on and an owned token", () => {
  globalThis.document = { createElement: tag => ({ tag, className: "", dataset: {}, attrs: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
    addEventListener(t, f) { this.listeners[t] = f; } }) };
  globalThis.HTMLElement = class {};
  const column = { children: [], append(...c) { this.children.push(...c); } };
  const root = Object.assign(new HTMLElement(), { querySelector: sel => (sel === ".col.right" ? column : null) });
  const hud = owner => ({ object: { document: { isOwner: owner } } });
  settings.tokenArtEnabled = true; settings.tokenArtHudButton = false;
  hooks.renderTokenHUD[0](hud(true), root); assert.equal(column.children.length, 0);
  settings.tokenArtHudButton = true;
  hooks.renderTokenHUD[0](hud(false), root); assert.equal(column.children.length, 0);
  hooks.renderTokenHUD[0](hud(true), root);
  assert.equal(column.children.length, 1);
  assert.match(column.children[0].className, /control-icon dt-token-art-hud/);
  assert.equal(typeof column.children[0].listeners.click, "function");
  delete globalThis.document; delete globalThis.HTMLElement;
});

/* ---------- Savage Attacker ---------- */
// Minimal dice: DiceTerm/PoolTerm/OperatorTerm/NumericTerm and a Roll that parses "XdY", "{XdY,XdY}kh", "+", numbers.
class SaTerm { constructor(o = {}) { Object.assign(this, o); this.options ??= {}; } toJSON() { return { ...this }; } }
class SaDice extends SaTerm { get formula() { return `${this.number}d${this.faces}${this.modifiers?.join("") ?? ""}`; } }
class SaPool extends SaTerm { get formula() { return `{${this.terms.join(",")}}${this.modifiers.join("")}`; } }
class SaOp extends SaTerm {}
class SaNum extends SaTerm {}
let saNextResults = [];
class SaRoll {
  constructor(formula = "", data = {}, options = {}) {
    this.data = data;
    this.options = options;
    this.terms = String(formula).split(" ").filter(Boolean).map(part => {
      if (["+", "-", "*", "/"].includes(part)) return new SaOp({ operator: part });
      const pool = /^\{(.+)\}(kh)$/.exec(part);
      if (pool) return new SaPool({ terms: pool[1].split(","), modifiers: [pool[2]], rolls: [] });
      const dice = /^(\d+)d(\d+)$/.exec(part);
      if (dice) return new SaDice({ number: Number(dice[1]), faces: Number(dice[2]), modifiers: [] });
      return new SaNum({ number: Number(part) });
    });
    this.resetFormula();
  }
  resetFormula() { this.formula = this.terms.map(x => x.formula ?? x.operator ?? x.number).join(" "); }
  async evaluate() {
    for (const x of this.terms) if (x instanceof SaDice) x.total = saNextResults.shift();
    this.total = this.terms.reduce((s, x) => s + (x.total ?? x.number ?? 0), 0);
    return this;
  }
  toJSON() { return { options: { ...this.options }, terms: this.terms.map(x => x.toJSON()), total: this.total }; }
  static fromData(data) {
    const r = new SaRoll();
    r.options = data.options;
    r.total = data.total;
    r.terms = data.terms.map(j => new (j.operator ? SaOp : (j.faces ? SaDice : SaNum))(j));
    return r;
  }
}
foundry.dice = { Roll: SaRoll, terms: { DiceTerm: SaDice, PoolTerm: SaPool } };
const saModule = await import(pathToFileURL(join(ROOT, "scripts/features/savage-attacker.js")).href);
const sa = saModule.internals;
saModule.default.init();
const saActors = {};
globalThis.fromUuidSync = uuid => saActors[uuid] ?? null;
const saActor = (id, { feat = true, owner = true } = {}) => {
  const flags = {};
  return saActors[`Actor.${id}`] = {
    id, uuid: `Actor.${id}`, isOwner: owner,
    items: feat ? [{ type: "feat", name: "Savage Attacker", system: { identifier: "savage-attacker" } }] : [],
    getFlag: (ns, k) => flags[`${ns}.${k}`],
    setFlag: async (ns, k, v) => { flags[`${ns}.${k}`] = v; }
  };
};
const saActivity = (actor, { type = "attack", item = "weapon", identifier = "longsword", id = "atk1" } = {}) =>
  ({ id, type, actor, item: { type: item, system: { identifier } } });
const saDamage = async (activity, formula = "1d8 + 3", { rolls = 1, base = 0 } = {}) => {
  const built = Array.from({ length: rolls }, () => new SaRoll(formula));
  const config = { subject: activity, rolls: built.map((_, i) => ({ base: i === base })) };
  await fire("dnd5e.postDamageRollConfiguration", built, config, {}, {});
  return built;
};
const saAttack = (activity, { total = 15, target = 14, isCritical = false, isFumble = false } = {}) =>
  fire("dnd5e.rollAttack", [{ total, options: { target }, isCritical, isFumble }], { subject: activity });
const saCombat = { id: "c1", started: true, round: 1, turn: 0 };

await test("savage attacker: off → nothing changes", async () => {
  sa.reset(); settings.savageAttackerMode = "off"; game.combat = saCombat;
  const [roll] = await saDamage(saActivity(saActor("a1")));
  assert.equal(roll.formula, "1d8 + 3");
  assert.equal(roll.options[MODULE_ID], undefined);
});
await test("savage attacker (auto): first weapon damage of the turn becomes {XdY,XdY}kh on the BASE roll", async () => {
  sa.reset(); settings.savageAttackerMode = "auto"; Object.assign(saCombat, { round: 1, turn: 0 });
  const actor = saActor("a2");
  const rolls = await saDamage(saActivity(actor), "1d8 + 3", { rolls: 2, base: 1 });
  assert.equal(rolls[0].formula, "1d8 + 3", "only the weapon's own (base) part");
  assert.equal(rolls[1].formula, "{1d8,1d8}kh + 3");
  assert.equal(rolls[1].options[MODULE_ID].savage, "auto");
  assert.equal(actor.getFlag(MODULE_ID, "savageAttackerTurn"), "c1:1:0");
});
await test("savage attacker (auto): crit-doubled dice are pooled as rolled ({2d8,2d8}kh)", async () => {
  sa.reset();
  const [roll] = await saDamage(saActivity(saActor("a3")), "2d8 + 3");
  assert.equal(roll.formula, "{2d8,2d8}kh + 3");
});
await test("savage attacker (auto): 2nd attack of the turn → button; opportunity attack on another turn → automatic again", async () => {
  sa.reset(); Object.assign(saCombat, { round: 2, turn: 1 });
  const actor = saActor("a4");
  const activity = saActivity(actor);
  const [first] = await saDamage(activity);
  const [second] = await saDamage(activity);
  assert.equal(first.options[MODULE_ID].savage, "auto");
  assert.equal(second.formula, "1d8 + 3");
  assert.equal(second.options[MODULE_ID].savage, "available");
  saCombat.turn = 2; // another creature's turn: opportunity attack
  const [reaction] = await saDamage(activity);
  assert.equal(reaction.options[MODULE_ID].savage, "auto");
});
await test("savage attacker (auto): a known miss doesn't use the turn; the following hit does; unknown counts", async () => {
  sa.reset(); Object.assign(saCombat, { round: 3, turn: 0 });
  const actor = saActor("a5");
  const activity = saActivity(actor);
  await saAttack(activity, { total: 10, target: 14 });
  const [miss] = await saDamage(activity);
  assert.equal(miss.options[MODULE_ID].savage, "available");
  await saAttack(activity, { total: 9, target: 14, isCritical: true });
  const [hit] = await saDamage(activity);
  assert.equal(hit.options[MODULE_ID].savage, "auto", "a crit hits regardless of AC");
  assert.equal(sa.attackHit({ total: 20, options: {} }), null, "no single target → unknown");
  assert.equal(sa.attackHit({ total: 25, options: { target: 14 }, isFumble: true }), false);
});
await test("savage attacker: no feat, Unarmed Strike, non-attack activity, button mode → no automatic pool", async () => {
  sa.reset(); Object.assign(saCombat, { round: 4, turn: 0 });
  const [noFeat] = await saDamage(saActivity(saActor("a6", { feat: false })));
  assert.equal(noFeat.options[MODULE_ID], undefined);
  const [unarmed] = await saDamage(saActivity(saActor("a7"), { identifier: "unarmed-strike" }));
  assert.equal(unarmed.options[MODULE_ID], undefined);
  const [other] = await saDamage(saActivity(saActor("a8"), { type: "damage" }));
  assert.equal(other.options[MODULE_ID], undefined);
  settings.savageAttackerMode = "button";
  const [manual] = await saDamage(saActivity(saActor("a9")));
  assert.equal(manual.formula, "1d8 + 3");
  assert.equal(manual.options[MODULE_ID].savage, "available");
  game.combat = { started: false };
  assert.equal(sa.turnKey(), null, "outside combat there is no turn to use up");
  game.combat = saCombat;
});
await test("savage attacker (button): re-roll keeps the higher result, updates the total, marks the turn", async () => {
  sa.reset(); settings.savageAttackerMode = "auto"; Object.assign(saCombat, { round: 5, turn: 0 });
  const actor = saActor("b1");
  const roll = new SaRoll("1d8 + 3"); saNextResults = [2]; await roll.evaluate();
  roll.options[MODULE_ID] = { savage: "available", actor: actor.uuid };
  let updated = null;
  const message = { rolls: [roll], canUserModify: () => true, update: async d => { updated = d; } };
  saNextResults = [7];
  assert.deepEqual(await sa.rerollOnMessage(message, 0), { before: 2, after: 7 });
  const stored = JSON.parse(updated.rolls[0]);
  assert.equal(stored.total, 10);
  assert.equal(stored.terms[0].total, 7);
  assert.equal(stored.options[MODULE_ID].savage, "rerolled");
  assert.ok(sa.usedThisTurn(actor));
  // lower second result: the original stays
  const low = new SaRoll("1d8 + 3"); saNextResults = [6]; await low.evaluate();
  low.options[MODULE_ID] = { savage: "available", actor: actor.uuid };
  saNextResults = [1];
  await sa.rerollOnMessage({ rolls: [low], canUserModify: () => true, update: async d => { updated = d; } }, 0);
  assert.equal(JSON.parse(updated.rolls[0]).total, 9);
});
await test("savage attacker (button): refused without permission or for multiplied dice", async () => {
  sa.reset(); notes.length = 0;
  const roll = new SaRoll("1d8 + 3"); saNextResults = [4]; await roll.evaluate();
  roll.options[MODULE_ID] = { savage: "available", actor: "Actor.b1" };
  assert.equal(await sa.rerollOnMessage({ rolls: [roll], canUserModify: () => false }, 0), null);
  const multiplied = new SaRoll("2 * 1d8"); saNextResults = [4]; await multiplied.evaluate();
  multiplied.options[MODULE_ID] = { savage: "available", actor: "Actor.b1" };
  assert.equal(await sa.rerollOnMessage({ rolls: [multiplied], canUserModify: () => true }, 0), null);
  assert.deepEqual(notes, ["DT.SavageAttacker.NoPermission", "DT.SavageAttacker.NotAdditive"]);
});

/* ---------- Weapon Mastery ---------- */
// Minimal DOM: elements with classes, dataset, children, listeners and a tiny selector engine
// (".a.b", "[data-x]", ":scope > .a").
class WmEl {
  constructor(tag) { Object.assign(this, { tag, className: "", dataset: {}, children: [], listeners: {}, parent: null, disabled: false, _text: "" }); }
  get classList() {
    const list = () => this.className.split(" ").filter(Boolean);
    const api = {
      add: c => { if (!api.contains(c)) this.className = [...list(), c].join(" "); },
      remove: c => { this.className = list().filter(x => x !== c).join(" "); },
      toggle: (c, force = !api.contains(c)) => { if (force) api.add(c); else api.remove(c); return force; },
      contains: c => list().includes(c)
    };
    return api;
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(" "); }
  get outerHTML() { return `<${this.tag}>${this._text}</${this.tag}>`; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceWith(n) { this.parent.children[this.parent.children.indexOf(this)] = n; n.parent = this.parent; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  matches(sel) {
    const classes = [...sel.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
    const attrs = [...sel.matchAll(/\[data-([\w-]+)\]/g)].map(m => m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()));
    return classes.every(c => this.classList.contains(c)) && attrs.every(a => a in this.dataset);
  }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) {
    if (sel.startsWith(":scope > ")) return this.children.filter(c => c.matches(sel.slice(9)));
    return [...this.walk()].filter(e => e.matches(sel));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  click() { return this.listeners.click?.({ preventDefault() {}, stopPropagation() {} }); }
}
globalThis.HTMLElement = WmEl;
globalThis.document = { createElement: tag => new WmEl(tag) };
ui.notifications.error = m => notes.push(m);
const wmCard = () => { const root = new WmEl("li"); const content = new WmEl("div"); content.className = "message-content"; root.append(content); return { root, content }; };
const buttonsOf = node => node.querySelectorAll(".dt-wm__btn");
// Users with ids: "gm" (the active GM unless activeGMSelf is false) and "me" (a player).
const wmGM = { id: "gm", name: "GM", isGM: true, get isSelf() { return activeGMSelf; } };
const wmPlayer = { id: "me", name: "Player", isGM: false };
let wmNoGM = false;
Object.defineProperty(game, "users", { configurable: true, get: () => {
  const list = [wmGM, wmPlayer];
  return Object.assign(list, { activeGM: wmNoGM ? null : wmGM, get: id => list.find(u => u.id === id) });
} });

const wmDocs = {};
let wmSeq = 0;
const wmActor = (id, { owner = true, playerOwner = false, mod = 3, prof = 2, size = "med", units = "ft" } = {}) => {
  const effects = new Map();
  effects.filter = f => [...effects.values()].filter(f);
  const actor = {
    id, uuid: `Actor.${id}`, name: id, isOwner: owner, hasPlayerOwner: playerOwner,
    system: { abilities: { str: { mod }, dex: { mod: 1 } }, attributes: { prof, movement: { units } }, traits: { size } },
    effects, created: [], deleted: [], damage: [], saves: [], statuses: [], nextSave: 5, tokens: [],
    async createEmbeddedDocuments(type, data) { return data.map(d => { const e = { id: `wmE${++wmSeq}`, active: true, ...d }; effects.set(e.id, e); actor.created.push(e); return e; }); },
    async deleteEmbeddedDocuments(type, ids) { for (const i of ids) effects.delete(i); actor.deleted.push(...ids); },
    async applyDamage(d) { actor.damage.push(d); },
    async rollSavingThrow(config) { actor.saves.push(config); return [{ total: actor.nextSave, isSuccess: actor.nextSave >= config.target }]; },
    async toggleStatusEffect(status, options) { actor.statuses.push([status, options]); },
    getActiveTokens: () => actor.tokens,
    async update(data) { for (const [path, value] of Object.entries(data)) setProperty(actor, path, value); actor.updates = (actor.updates ?? 0) + 1; },
    testUserPermission: (user, level) => !!user?.isGM || ((user?.id === "me") && (level === "OWNER") && actor.isOwner)
  };
  wmDocs[actor.uuid] = actor;
  return actor;
};
globalThis.fromUuidSync = uuid => wmDocs[uuid] ?? null;
globalThis.fromUuid = async uuid => wmDocs[uuid] ?? null;
globalThis.CONST = { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 2 } };
const wmChats = [];
globalThis.ChatMessage = { implementation: {
  create: async d => {
    const m = { ...d, id: `chat${wmChats.length}`, deleted: false, async delete() { m.deleted = true; delete messagesById[m.id]; } };
    wmChats.push(m); messagesById[m.id] = m; return m;
  },
  getSpeaker: ({ actor }) => ({ actor: actor?.id })
} };
Object.assign(CONFIG.DND5E, {
  weaponMasteries: Object.fromEntries(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"].map(k => [k, { label: k.toUpperCase(), reference: `Compendium.dnd5e.rule.${k}` }])),
  damageTypes: { slashing: { label: "Slashing" } },
  abilities: { str: { label: "Strength" }, con: { label: "Constitution" } },
  actorSizes: { tiny: {}, sm: {}, med: {}, lg: {}, huge: {}, grg: {} },
  itemProperties: { mgc: { isPhysical: true }, fin: {} }
});
CONFIG.ActiveEffect = { changeTypes: {} };
const asV6 = () => { CONFIG.DND5E.pseudoExpiryEvents = { sourceStart: "x", sourceEnd: "y" }; CONFIG.ActiveEffect.changeTypes["dnd5e.advantage"] = {}; };
const asV5 = () => { delete CONFIG.DND5E.pseudoExpiryEvents; delete CONFIG.ActiveEffect.changeTypes["dnd5e.advantage"]; };

const wmModule = await import(pathToFileURL(join(ROOT, "scripts/features/weapon-mastery.js")).href);
const wm = wmModule.internals;
wmModule.default.init();
const wmAttacker = wmActor("fighter", { mod: 3, prof: 2 });
const wmWeapon = { uuid: "Actor.fighter.Item.sword", system: { damage: { base: { types: new Set(["slashing"]) } }, properties: new Set(["mgc", "fin"]) } };
/** dnd5e 6 attack message (system.targets/system.ability); `v5: true` gives the 5.x flag shape instead. */
const wmMessage = ({ mastery = "sap", targets = [], total = 15, crit = false, fumble = false, v5 = false, id = "wm1", type = "attack" } = {}) => {
  const roll = { total, isCritical: crit, isFumble: fumble, options: { mastery, ...(v5 ? {} : { ability: "str" }) } };
  const msg = {
    id, uuid: `ChatMessage.${id}`, isContentVisible: true, speaker: {}, rolls: [roll], flags: {}, updates: 0,
    timestamp: Date.now(), author: { id: "me" },
    getAssociatedActor: () => wmAttacker, getAssociatedItem: () => wmWeapon,
    getAssociatedActivity: () => ({ ability: "str", damage: { parts: [] } }),
    canUserModify: () => true,
    async update(data) { for (const [path, value] of Object.entries(data)) setProperty(msg, path, value); msg.updates++; }
  };
  if (v5) Object.assign(msg, { system: {}, flags: { dnd5e: { roll: { mastery, type }, targets: targets.map(t => ({ uuid: t.actor, ac: t.ac, name: t.name })) } } });
  else Object.assign(msg, { type, system: { mastery, ability: "str", targets } });
  messagesById[id] = msg;
  return msg;
};
const messagesById = {};
game.messages = { get: id => messagesById[id] ?? null };
const goblin = wmActor("goblin", { owner: false });
const ogre = wmActor("ogre", { owner: false });
const t = (actor, ac) => ({ actor: actor.uuid, token: null, ac, name: actor.name });
settings.weaponMasteryEnabled = true;

await test("weapon mastery: reads dnd5e 6 and 5.x attack messages, hit/miss per target AC", () => {
  const v6 = wm.attackContext(wmMessage({ mastery: "topple", targets: [t(goblin, 13), t(ogre, 17), { actor: "Actor.x", ac: null, name: "cover" }] }));
  assert.equal(v6.mastery, "topple"); assert.equal(v6.ability, "str"); assert.equal(v6.actor, wmAttacker);
  assert.deepEqual(v6.targets.map(r => [r.key, r.hit]), [["t0", true], ["t1", false], ["t2", null]]);
  const v5 = wm.attackContext(wmMessage({ mastery: "graze", v5: true, targets: [t(goblin, 13)] }));
  assert.equal(v5.mastery, "graze"); assert.equal(v5.ability, "str", "5.x: the activity's ability");
  assert.equal(v5.targets[0].actorUuid, "Actor.goblin");
  const crit = wm.attackContext(wmMessage({ total: 9, crit: true, targets: [t(ogre, 17)] }));
  assert.equal(crit.targets[0].hit, true, "a natural 20 hits regardless of AC");
  const noMastery = wmMessage(); noMastery.rolls[0].options.mastery = undefined; noMastery.system.mastery = null;
  assert.equal(wm.attackContext(noMastery), null);
});
await test("weapon mastery: GM override, hidden results for players, which outcome a mastery needs", () => {
  const ctx = wm.attackContext(wmMessage({ id: "ov", targets: [t(goblin, 13)] }));
  game.user.isGM = true;
  assert.equal(wm.rowState(ctx, ctx.targets[0]), "hit");
  wm.overrides.set("ov:t0", false); assert.equal(wm.rowState(ctx, ctx.targets[0]), "miss");
  game.user.isGM = false; settings.attackRollVisibility = "none";
  assert.equal(wm.rowState(ctx, ctx.targets[0]), "unknown", "players don't learn the result");
  settings.attackRollVisibility = "all";
  assert.equal(wm.applies("graze", "miss"), true); assert.equal(wm.applies("graze", "hit"), false);
  assert.equal(wm.applies("sap", "unknown"), true); assert.equal(wm.applies("cleave", "hit"), false);
});
await test("weapon mastery: Topple DC, Graze damage (type, physical properties, never negative), Push size limit", () => {
  const ctx = wm.attackContext(wmMessage({ mastery: "topple" }));
  assert.equal(wm.toppleDC(ctx), 13);
  assert.deepEqual(wm.grazeDamage(ctx), { value: 3, type: "slashing", properties: ["mgc"] });
  wmAttacker.system.abilities.str.mod = -1;
  assert.equal(wm.grazeDamage(ctx).value, 0);
  wmAttacker.system.abilities.str.mod = 3;
  assert.equal(wm.tooLargeToPush({ system: { traits: { size: "lg" } } }), false);
  assert.equal(wm.tooLargeToPush({ system: { traits: { size: "huge" } } }), true);
  assert.equal(wm.tooLargeToPush({ system: { traits: {} } }), false, "unknown size: the GM decides");
});
await test("weapon mastery: durations — dnd5e 6 source expiries, core turnStart/turnEnd of the attacker's combatant on 5.x", () => {
  const combatant = { id: "cFighter" };
  const combat = { started: true, combatant, getCombatantsByActor: () => [combatant] };
  asV6();
  assert.deepEqual(wm.untilAttackersTurn("start", wmAttacker, combat), { duration: { expiry: "sourceStart", value: null } });
  assert.deepEqual(wm.untilAttackersTurn("end", wmAttacker, combat), { duration: { expiry: "sourceEnd", value: null } });
  asV5();
  assert.deepEqual(wm.untilAttackersTurn("start", wmAttacker, combat), { duration: { expiry: "turnStart", value: null }, start: { combatant: "cFighter" } });
  assert.deepEqual(wm.untilAttackersTurn("end", wmAttacker, combat), { duration: { expiry: "turnEnd", value: 1, units: "rounds" }, start: { combatant: "cFighter" } },
    "own turn: the end of the NEXT turn is a round later");
  combat.combatant = { id: "someoneElse" };   // opportunity attack
  assert.deepEqual(wm.untilAttackersTurn("end", wmAttacker, combat), { duration: { expiry: "turnEnd", value: null }, start: { combatant: "cFighter" } });
  assert.deepEqual(wm.untilAttackersTurn("start", wmAttacker, { started: false }), { duration: { expiry: "turnStart", value: null } });
});
await test("weapon mastery: effect data — Sap rule change only on dnd5e 6, Slow −10 ft (−3 m), Vex remembers its target", () => {
  game.combat = { started: false };
  const ctx = wm.attackContext(wmMessage({ targets: [t(goblin, 13)] }));
  asV6();
  let sap = wm.sapEffect(ctx);
  assert.deepEqual(sap.system.changes, [{ key: "attack", type: "dnd5e.advantage", value: "-1" }]);
  assert.deepEqual(sap.system.origin, { actor: "Actor.fighter", item: "Actor.fighter.Item.sword", message: "ChatMessage.wm1" });
  assert.deepEqual(sap.flags[MODULE_ID].weaponMastery, { mastery: "sap", source: "Actor.fighter", message: "wm1" });
  assert.equal(sap.origin, "Actor.fighter.Item.sword"); assert.equal(sap.showIcon, 2);
  asV5();
  sap = wm.sapEffect(ctx);
  assert.deepEqual(sap.system.changes, []); assert.equal(sap.system.origin, undefined);
  assert.deepEqual(wm.slowEffect(ctx, goblin).system.changes, [{ key: "system.attributes.movement.bonus", type: "add", value: "-10" }]);
  assert.equal(wm.slowEffect(ctx, wmActor("metric", { units: "m" })).system.changes[0].value, "-3");
  assert.equal(wm.vexEffect(ctx, ctx.targets[0], goblin).flags[MODULE_ID].weaponMastery.target, "Actor.goblin");
});
await test("weapon mastery: Graze applies the modifier as weapon damage and marks the card", async () => {
  game.user.isGM = true;
  const msg = wmMessage({ mastery: "graze", total: 5, targets: [t(goblin, 13)] });
  const ctx = wm.attackContext(msg);
  assert.equal(await wm.applyRows(ctx, [ctx.targets[0]]), true);
  assert.equal(goblin.damage.length, 1);
  const [[damage]] = goblin.damage;
  assert.deepEqual({ ...damage, properties: [...damage.properties] }, { value: 3, type: "slashing", properties: ["mgc"] });
  assert.equal(msg.flags[MODULE_ID].weaponMastery.done.t0.graze, true);
  game.user.isGM = false; notes.length = 0;
  const other = wm.attackContext(wmMessage({ mastery: "graze", total: 5, targets: [t(goblin, 13)], id: "wm-graze-player" }));
  assert.equal(await wm.applyRows(other, [other.targets[0]]), false, "a player who doesn't own the target can't");
  assert.deepEqual(notes, ["DT.WeaponMastery.NoPermission"]); assert.equal(goblin.damage.length, 1);
});
await test("weapon mastery: Topple — GM rolls for NPCs (Prone on a failure), player-owned targets get a save request", async () => {
  game.user.isGM = true;
  const ctx = wm.attackContext(wmMessage({ mastery: "topple", targets: [t(goblin, 13)] }));
  goblin.nextSave = 12; await wm.applyRows(ctx, [ctx.targets[0]]);
  assert.deepEqual(goblin.saves.at(-1), { ability: "con", target: 13, event: undefined });
  assert.deepEqual(goblin.statuses, [["prone", { active: true }]]);
  goblin.nextSave = 13; await wm.applyRows(ctx, [ctx.targets[0]]);
  assert.equal(goblin.saves.length, 1, "the same attack topples once");
  const again = wm.attackContext(wmMessage({ mastery: "topple", targets: [t(goblin, 13)], id: "wm1b" }));
  await wm.applyRows(again, [again.targets[0]]);
  assert.equal(goblin.statuses.length, 1, "saved: not prone");
  const pc = wmActor("rogue", { playerOwner: true });
  const msg = wmMessage({ mastery: "topple", targets: [t(pc, 12)], id: "wm-pc" });
  const pcCtx = wm.attackContext(msg);
  wmChats.length = 0;
  assert.equal(await wm.applyRows(pcCtx, [pcCtx.targets[0]]), true);
  assert.equal(pc.saves.length, 0, "the GM doesn't roll the player's save");
  assert.deepEqual(wmChats[0].flags[MODULE_ID].weaponMasterySave, { actor: "Actor.rogue", dc: 13, ability: "con", status: "prone", mastery: "topple" });
  assert.equal(msg.flags[MODULE_ID].weaponMastery.done.t0.topple, "requested");
  // the owner's button on that request
  pc.nextSave = 4;
  await wm.rollToppleSave(pc, 13, {});
  assert.deepEqual(pc.statuses, [["prone", { active: true }]]);
  game.user.isGM = false;
});
await test("weapon mastery: Sap and Slow replace older effects (no stacking), Vex once per target on the attacker", async () => {
  game.user.isGM = true; asV6();
  const sapCtx = wm.attackContext(wmMessage({ mastery: "sap", targets: [t(ogre, 10)], id: "sap1" }));
  await wm.applyRows(sapCtx, [sapCtx.targets[0]]);
  const sapCtx2 = wm.attackContext(wmMessage({ mastery: "sap", targets: [t(ogre, 10)], id: "sap2" }));
  await wm.applyRows(sapCtx2, [sapCtx2.targets[0]]);
  assert.equal(ogre.effects.size, 1); assert.equal(ogre.deleted.length, 1);
  const slowCtx = wm.attackContext(wmMessage({ mastery: "slow", targets: [t(ogre, 10)], id: "slow1" }));
  const slowCtx2 = wm.attackContext(wmMessage({ mastery: "slow", targets: [t(ogre, 10)], id: "slow2" }));
  await wm.applyRows(slowCtx, [slowCtx.targets[0]]); await wm.applyRows(slowCtx2, [slowCtx2.targets[0]]);
  assert.equal(ogre.effects.filter(e => e.flags[MODULE_ID].weaponMastery.mastery === "slow").length, 1);
  assert.equal(ogre.effects.size, 2, "Slow doesn't remove Sap");
  game.user.isGM = false;   // the attacker's owner may apply Vex to their own actor
  const vexCtx = wm.attackContext(wmMessage({ mastery: "vex", targets: [t(ogre, 10), t(goblin, 10)] }));
  await wm.applyRows(vexCtx, [vexCtx.targets[0]]); await wm.applyRows(vexCtx, [vexCtx.targets[1]]); await wm.applyRows(vexCtx, [vexCtx.targets[0]]);
  assert.deepEqual(wmAttacker.effects.filter(() => true).map(e => e.flags[MODULE_ID].weaponMastery.target).sort(), ["Actor.goblin", "Actor.ogre"]);
});
await test("weapon mastery: next attack — Sap gives disadvantage (5.x hook / 6.x rule), Vex advantage vs its target; used effects are removed", async () => {
  const pre = hooks["dnd5e.preRollAttackV2"][0];
  const ogreVex = wmAttacker.effects.filter(e => e.flags[MODULE_ID].weaponMastery.target === "Actor.ogre")[0];
  const attack = () => ({ subject: { actor: wmAttacker }, rolls: [{ options: {} }] });
  game.user.targets = new Set([{ actor: goblin }, { actor: ogre }]);
  let config = attack(); pre(config);
  assert.equal(config.advantage, undefined, "two targets: unclear which one is attacked");
  game.user.targets = new Set([{ actor: ogre }]);
  settings.weaponMasteryEnabled = false; config = attack(); pre(config); assert.equal(config.advantage, undefined);
  settings.weaponMasteryEnabled = true; config = attack(); pre(config);
  assert.equal(config.advantage, true);
  assert.deepEqual(config.rolls[0].options[MODULE_ID].weaponMasteryConsume, [ogreVex.id]);
  // the sapped ogre attacks
  const ogreSap = ogre.effects.filter(e => e.flags[MODULE_ID].weaponMastery.mastery === "sap")[0];
  ogre.isOwner = true;
  asV5(); config = { subject: { actor: ogre }, rolls: [{ options: {} }] }; pre(config);
  assert.equal(config.disadvantage, true, "5.x: disadvantage from the hook");
  asV6(); config = { subject: { actor: ogre }, rolls: [{ options: {} }] }; pre(config);
  assert.equal(config.disadvantage, undefined, "6.x: dnd5e's rule change gives the disadvantage");
  await fire("dnd5e.rollAttack", config.rolls, { subject: { actor: ogre } });
  assert.equal(ogre.effects.get(ogreSap.id), undefined, "Sap used up");
  assert.ok(ogre.effects.size === 1, "Slow stays");
  ogre.isOwner = false;
  const before = wmAttacker.deleted.length;
  await fire("dnd5e.rollAttack", [{ options: { [MODULE_ID]: { weaponMasteryConsume: [ogreVex.id] } } }], { subject: { actor: { ...wmAttacker, isOwner: false } } });
  assert.equal(wmAttacker.deleted.length, before, "only an owner removes effects");
  game.user.targets = new Set();
});
await test("weapon mastery: expired effects are deleted by the active GM only", async () => {
  let deleted = 0;
  const effect = { flags: { [MODULE_ID]: { weaponMastery: { mastery: "sap" } } }, delete: async () => { deleted++; } };
  activeGMSelf = false; await fire("updateActiveEffect", effect, { duration: { expired: true } });
  activeGMSelf = true; await fire("updateActiveEffect", effect, { duration: { expired: true } });
  await fire("updateActiveEffect", { flags: {}, delete: async () => { deleted += 10; } }, { duration: { expired: true } });
  await fire("updateActiveEffect", effect, { name: "x" });
  assert.equal(deleted, 1);
});
await test("weapon mastery: Push — farthest free grid position up to 10 ft straight away, stops before walls", () => {
  // 5 ft squares of 100 px, distance = squares (equidistant diagonals); tokens are 1×1.
  canvas.scene = { grid: { units: "ft" } };
  canvas.dimensions = { distancePixels: 20 };
  canvas.grid = { isGridless: false, size: 100,
    measurePath: ([a, b]) => ({ distance: Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 20 }) };
  let wallX = Infinity;
  const pushed = (x, y) => ({
    center: { x: x + 50, y: y + 50 }, name: "goblin",
    document: { x, y, getSnappedPosition: p => ({ x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }),
      getMovementOrigin: p => ({ x: p.x + 50, y: p.y + 50, elevation: 0 }) },
    checkCollision: (dest, { origin }) => (origin.x < wallX) && (dest.x > wallX)
  });
  const attacker = { center: { x: 50, y: 50 } };
  assert.deepEqual(wm.pushDestination(attacker, pushed(100, 0)), { x: 300, y: 0 });
  assert.deepEqual(wm.pushDestination(attacker, pushed(100, 100)), { x: 300, y: 300 }, "diagonal");
  wallX = 290; assert.deepEqual(wm.pushDestination(attacker, pushed(100, 0)), { x: 200, y: 0 });
  wallX = 160; assert.equal(wm.pushDestination(attacker, pushed(100, 0)), null);
  assert.equal(wm.pushDestination(attacker, { ...pushed(0, 0), center: { x: 50, y: 50 } }), null, "same spot: no direction");
  canvas.scene = { grid: { units: "m" } }; assert.equal(wm.pushDistance(), 3);
});
await test("weapon mastery: macro gets actor, item, mastery, targets with hit and the message", async () => {
  game.user.isGM = true;
  const calls = [];
  const macro = { documentName: "Macro", execute: async scope => calls.push(scope) };
  wmDocs["Macro.abc"] = macro;
  game.macros = { getName: n => (n === "Cleave helper" ? macro : null), get: () => null };
  settings.weaponMasteryMacroCleave = "Cleave helper";
  const msg = wmMessage({ mastery: "cleave", targets: [t(goblin, 13), t(ogre, 17)] });
  await wm.runMacro(wm.attackContext(msg));
  const [scope] = calls;
  assert.equal(scope.actor, wmAttacker); assert.equal(scope.item, wmWeapon); assert.equal(scope.mastery, "cleave"); assert.equal(scope.message, msg);
  assert.deepEqual(scope.targets.map(x => [x.actor, x.hit]), [[goblin, true], [ogre, false]]);
  assert.equal(scope.hit, null, "mixed results");
  settings.weaponMasteryMacroCleave = "Macro.abc";
  await wm.runMacro(wm.attackContext(wmMessage({ mastery: "cleave", targets: [t(goblin, 13)] })));
  assert.equal(calls[1].hit, true);
  notes.length = 0; settings.weaponMasteryMacroCleave = "missing";
  assert.equal(await wm.runMacro(wm.attackContext(msg)), false);
  assert.deepEqual(notes, ['DT.WeaponMastery.MacroNotFound:{"macro":"missing"}']);
  settings.weaponMasteryMacroCleave = "";
  game.user.isGM = false;
});
await test("weapon mastery: panel only on attack cards — not on usage or damage cards, not when off", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);   // [0] is Savage Attacker's
  game.user.isGM = true;
  const msg = wmMessage({ mastery: "sap", targets: [t(goblin, 13)], id: "only" });
  settings.weaponMasteryEnabled = false;
  let card = wmCard(); render(msg, card.root);
  assert.equal(card.root.querySelector(".dt-wm"), null);
  settings.weaponMasteryEnabled = true;
  card = wmCard(); render(msg, card.root); render(msg, card.root);
  assert.equal(card.content.querySelectorAll(".dt-wm").length, 1, "inserted once");
  for (const type of ["usage", "damage"]) {
    const other = wmMessage({ mastery: "sap", targets: [t(goblin, 13)], id: `other-${type}`, type });
    card = wmCard(); render(other, card.root);
    assert.equal(card.root.querySelector(".dt-wm"), null, `${type} card`);
  }
  const v5damage = wmMessage({ mastery: "sap", v5: true, id: "v5dmg", type: "damage" });
  card = wmCard(); render(v5damage, card.root);
  assert.equal(card.root.querySelector(".dt-wm"), null, "5.x damage card");
  const v5attack = wmMessage({ mastery: "sap", v5: true, id: "v5atk" });
  card = wmCard(); render(v5attack, card.root);
  assert.ok(card.root.querySelector(".dt-wm"), "5.x attack card (flags.dnd5e.roll.type)");
  const plain = wmMessage({ mastery: null, id: "noMastery" });
  card = wmCard(); render(plain, card.root);
  assert.equal(card.root.querySelector(".dt-wm"), null, "no recorded mastery");
  game.user.isGM = false;
});
await test("weapon mastery: one line — rule link + mastery button; Cleave/Nick without button; players see nothing more", () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  game.user.isGM = false;
  let card = wmCard(); render(wmMessage({ mastery: "sap", targets: [t(goblin, 13)], id: "line" }), card.root);
  const line = card.content.querySelector(".dt-wm__line");
  assert.match(line.querySelector(".dt-wm__mastery").dataset.uuid, /rule\.sap/);
  assert.deepEqual(buttonsOf(card.content).map(b => b.textContent.trim()), ["SAP"], "only the mastery button");
  assert.equal(card.content.querySelector(".dt-wm__tray"), null, "no tray for players");
  assert.equal(card.content.querySelector(".dt-wm__hint"), null);
  for (const mastery of ["cleave", "nick"]) {
    card = wmCard(); render(wmMessage({ mastery, targets: [t(goblin, 13)], id: `ln-${mastery}` }), card.root);
    assert.ok(card.content.querySelector(".dt-wm__mastery"), `${mastery}: rule link`);
    assert.equal(buttonsOf(card.content).length, 0, `${mastery}: nothing to automate`);
  }
  game.user.isGM = true;
  card = wmCard(); render(wmMessage({ mastery: "cleave", targets: [t(goblin, 13)], id: "ln-gm-cleave" }), card.root);
  assert.equal(card.content.querySelector(".dt-wm__tray"), null, "no tray for Cleave");
  game.user.isGM = false;
});
await test("weapon mastery: a player's click asks the active GM over the socket; Vex on their own actor runs directly", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  game.user.isGM = false; emits.length = 0; notes.length = 0;
  const sap = wmMessage({ mastery: "sap", targets: [t(goblin, 13)], id: "req-sap" });
  let card = wmCard(); render(sap, card.root);
  const before = goblin.created.length;
  await card.content.querySelector(".dt-wm__use").click(); await tick();
  assert.equal(goblin.created.length, before, "nothing applied by the player");
  assert.deepEqual(emits.at(-1), { channel: `module.${MODULE_ID}`, msg: { action: "use", messageId: "req-sap", feature: "weaponMastery" }, opts: { recipients: ["gm"] }, volatile: false });
  assert.deepEqual(notes, ['DT.WeaponMastery.Requested:{"mastery":"SAP"}']);
  wmNoGM = true; notes.length = 0; emits.length = 0;
  await card.content.querySelector(".dt-wm__use").click(); await tick();
  assert.equal(emits.length, 0); assert.deepEqual(notes, ['DT.WeaponMastery.NoGM:{"mastery":"SAP"}']);
  wmNoGM = false;
  const vex = wmMessage({ mastery: "vex", targets: [t(ogre, 10)], id: "self-vex" });
  card = wmCard(); render(vex, card.root);
  const effects = wmAttacker.created.length;
  await card.content.querySelector(".dt-wm__use").click(); await tick();
  assert.equal(emits.length, 0, "no request needed");
  assert.equal(wmAttacker.created.length, effects + 1);
});
await test("weapon mastery: the GM's client applies a player's request to known hits, leaves unknown hits to the GM", async () => {
  const dispatch = socketListeners[`module.${MODULE_ID}`];
  game.user.isGM = true; activeGMSelf = true; notes.length = 0;
  const wolf = wmActor("wolf", { owner: false });
  const bear = wmActor("bear", { owner: false });
  const msg = wmMessage({ mastery: "slow", targets: [t(wolf, 10), t(bear, 30), { actor: wmActor("shade", { owner: false }).uuid, ac: null, name: "shade" }], id: "sock" });
  await dispatch({ feature: "weaponMastery", action: "use", messageId: "sock" }, "me"); await tick();
  assert.equal(wolf.created.length, 1, "known hit: applied");
  assert.equal(bear.created.length, 0, "known miss: not applied");
  assert.equal(wmDocs["Actor.shade"].created.length, 0, "unknown: left to the GM");
  assert.equal(msg.flags[MODULE_ID].weaponMastery.done.t0.slow, true);
  assert.match(notes.at(-1), /DT\.WeaponMastery\.RequestUnknown.*shade/);
  assert.notEqual(wm.trays.get("sock")?.open, false, "the tray stays open for the GM's decision");
  // guards: not the active GM, a sender without rights on the attacker, an unknown message
  activeGMSelf = false; await dispatch({ feature: "weaponMastery", action: "use", messageId: "sock" }, "me");
  activeGMSelf = true;
  wmAttacker.isOwner = false; msg.author = { id: "gm" };
  await dispatch({ feature: "weaponMastery", action: "use", messageId: "sock" }, "me");
  wmAttacker.isOwner = true; msg.author = { id: "me" };
  await dispatch({ feature: "weaponMastery", action: "use", messageId: "nope" }, "me"); await tick();
  assert.equal(wolf.created.length, 1, "no second application");
  game.user.isGM = false;
});
await test("weapon mastery: GM tray — hit/miss per target, Apply per target, folds up after applying (dnd5e markup)", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  game.user.isGM = true; wm.trays.clear(); wm.overrides.clear();
  const imp = wmActor("imp", { owner: false });
  const msg = wmMessage({ mastery: "sap", targets: [t(imp, 13), t(ogre, 30)], id: "tray" });
  let card = wmCard(); render(msg, card.root);
  let tray = card.content.querySelector(".dt-wm__tray");
  assert.ok(tray.classList.contains("card-tray") && tray.classList.contains("collapsible"), "dnd5e's tray classes");
  assert.equal(tray.classList.contains("collapsed"), false, "open while nothing was applied");
  assert.ok(tray.querySelector(".collapsible-content"));
  let rows = card.content.querySelectorAll(".dt-wm__target");
  assert.deepEqual(rows.map(r => r.dataset.state), ["hit", "miss"]);
  assert.equal(buttonsOf(rows[0]).length, 1); assert.equal(buttonsOf(rows[1]).length, 0, "Sap on a miss: no button");
  rows[1].querySelector(".dt-wm__state").click();   // the GM corrects the miss
  rows = card.content.querySelectorAll(".dt-wm__target");
  assert.equal(rows[1].dataset.state, "hit"); assert.equal(buttonsOf(rows[1]).length, 1);
  await buttonsOf(rows[0])[0].click(); await tick();
  assert.equal(imp.created.length, 1);
  assert.equal(msg.flags[MODULE_ID].weaponMastery.done.t0.sap, true);
  tray = card.content.querySelector(".dt-wm__tray");
  assert.equal(tray.classList.contains("collapsed"), true, "folded after applying");
  card = wmCard(); render(msg, card.root);
  assert.equal(card.content.querySelector(".dt-wm__tray").classList.contains("collapsed"), true, "stays folded on re-render");
  assert.ok(card.content.querySelector(".dt-wm__use").classList.contains("dt-wm__btn--done"));
  // header click toggles like dnd5e's trays
  const header = card.content.querySelector(".dt-wm__tray");
  header.listeners.click({ target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.equal(header.classList.contains("collapsed"), false);
  // "Manual" keeps trays open; "Always" starts them folded
  wm.trays.clear(); settings.autoCollapseChatTrays = "manual";
  const manual = wmMessage({ mastery: "sap", targets: [t(imp, 13)], id: "tray-manual" });
  card = wmCard(); render(manual, card.root);
  await buttonsOf(card.content.querySelector(".dt-wm__target"))[0].click(); await tick();
  assert.equal(card.content.querySelector(".dt-wm__tray").classList.contains("collapsed"), false);
  settings.autoCollapseChatTrays = "always";
  card = wmCard(); render(wmMessage({ mastery: "sap", targets: [t(imp, 13)], id: "tray-always" }), card.root);
  assert.equal(card.content.querySelector(".dt-wm__tray").classList.contains("collapsed"), true);
  delete settings.autoCollapseChatTrays;
  game.user.isGM = false;
});
await test("weapon mastery: GM tray switches to the selected tokens like dnd5e (forced without recorded targets)", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  game.user.isGM = true; wm.trays.clear();
  const rat = wmActor("rat", { owner: false });
  canvas.tokens.controlled = [{ name: "Rat", actor: rat, document: { uuid: "Scene.s.Token.rat" } }];
  const none = wmMessage({ mastery: "graze", id: "sel" });
  let card = wmCard(); render(none, card.root);
  const toggle = card.content.querySelector(".dt-wm__source");
  assert.equal(toggle.dataset.mode, "selected"); assert.equal(toggle.disabled, true);
  const [row] = card.content.querySelectorAll(".dt-wm__target");
  assert.equal(row.dataset.state, "unknown"); assert.match(row.textContent, /Rat/);
  await card.content.querySelector(".dt-wm__use").click(); await tick();
  assert.equal(rat.damage.length, 1, "the mastery button applies to the selection");
  const recorded = wmMessage({ mastery: "graze", targets: [t(goblin, 20)], id: "sel2" });
  card = wmCard(); render(recorded, card.root);
  assert.equal(card.content.querySelector(".dt-wm__source").dataset.mode, "targeted");
  card.content.querySelector(".dt-wm__source").click();
  assert.equal(card.content.querySelector(".dt-wm__source").dataset.mode, "selected");
  assert.match(card.content.querySelector(".dt-wm__target").textContent, /Rat/);
  canvas.tokens.controlled = [];
  game.user.isGM = false;
});
await test("weapon mastery: applied once per target — repeated clicks and (concurrent) player requests do nothing", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  const dispatch = socketListeners[`module.${MODULE_ID}`];
  game.user.isGM = true; activeGMSelf = true; notes.length = 0;
  const elk = wmActor("elk", { owner: false });
  const msg = wmMessage({ mastery: "topple", targets: [t(elk, 10)], id: "once" });
  elk.nextSave = 1;
  await Promise.all([
    dispatch({ feature: "weaponMastery", action: "use", messageId: "once" }, "me"),
    dispatch({ feature: "weaponMastery", action: "use", messageId: "once" }, "me")
  ]);
  await dispatch({ feature: "weaponMastery", action: "use", messageId: "once" }, "me"); await tick();
  assert.equal(elk.saves.length, 1, "one save for three requests");
  assert.deepEqual(elk.statuses, [["prone", { active: true }]]);
  assert.deepEqual(msg.flags[MODULE_ID].weaponMastery.undo.t0.topple, { prone: "Actor.elk" });
  assert.equal(notes.filter(n => n.startsWith("DT.WeaponMastery.RequestApplied")).length, 1, "the GM hears about it once");
  const ctx = wm.attackContext(msg);
  notes.length = 0;
  assert.equal(await wm.useMastery(ctx), false, "the GM's button: nothing left to apply");
  assert.match(notes.at(-1), /AllApplied\.GM/);
  game.user.isGM = false; emits.length = 0; notes.length = 0;
  const card = wmCard(); render(msg, card.root);
  await card.content.querySelector(".dt-wm__use").click(); await tick();
  assert.equal(emits.length, 0, "a player's repeated click sends no request");
  assert.match(notes.at(-1), /AllApplied\.Player/);
});
await test("weapon mastery: the GM's Undo reverts the application and offers Apply again", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  game.user.isGM = true; wm.trays.clear(); wm.overrides.clear();
  const bat = wmActor("bat", { owner: false });
  const msg = wmMessage({ mastery: "sap", targets: [t(bat, 10)], id: "undo-sap" });
  let card = wmCard(); render(msg, card.root);
  await buttonsOf(card.content.querySelector(".dt-wm__target"))[0].click(); await tick();
  assert.equal(bat.effects.size, 1);
  card = wmCard(); render(msg, card.root);
  const undo = card.content.querySelector(".dt-wm__undo");
  assert.ok(undo, "Undo instead of Apply");
  await undo.click(); await tick();
  assert.equal(bat.effects.size, 0, "effect removed");
  assert.equal(msg.flags[MODULE_ID].weaponMastery.done.t0.sap, false);
  card = wmCard(); render(msg, card.root);
  assert.equal(card.content.querySelector(".dt-wm__undo"), null);
  await buttonsOf(card.content.querySelector(".dt-wm__target"))[0].click(); await tick();
  assert.equal(bat.effects.size, 1, "can be applied again");
  // a player-owned target's save request is deleted; Prone set by the GM's roll is removed
  const pc = wmActor("bard", { playerOwner: true });
  const reqCtx = wm.attackContext(wmMessage({ mastery: "topple", targets: [t(pc, 10)], id: "undo-req" }));
  await wm.applyRows(reqCtx, [reqCtx.targets[0]]);
  const request = wmChats.at(-1);
  await wm.undoRow(reqCtx, reqCtx.targets[0]);
  assert.equal(request.deleted, true);
  const mole = wmActor("mole", { owner: false }); mole.nextSave = 1;
  const prone = wm.attackContext(wmMessage({ mastery: "topple", targets: [t(mole, 10)], id: "undo-prone" }));
  await wm.applyRows(prone, [prone.targets[0]]);
  await wm.undoRow(prone, prone.targets[0]);
  assert.deepEqual(mole.statuses, [["prone", { active: true }], ["prone", { active: false }]]);
  game.user.isGM = false;
  assert.equal(await wm.undoRow(prone, prone.targets[0]), false, "players can't undo");
});
await test("weapon mastery: Graze records the HP it took and Undo gives it back; Push moves the token back", async () => {
  game.user.isGM = true;
  const toad = wmActor("toad", { owner: false });
  toad.system.attributes.hp = { value: 10, temp: 2, effectiveMax: 12 };
  toad.applyDamage = async ([{ value }]) => {
    const fromTemp = Math.min(toad.system.attributes.hp.temp, value);
    toad.system.attributes.hp.temp -= fromTemp;
    toad.system.attributes.hp.value -= value - fromTemp;
  };
  const msg = wmMessage({ mastery: "graze", total: 5, targets: [t(toad, 13)], id: "undo-graze" });
  const ctx = wm.attackContext(msg);
  await wm.applyRows(ctx, [ctx.targets[0]]);
  assert.deepEqual(toad.system.attributes.hp, { value: 9, temp: 0, effectiveMax: 12 });
  assert.deepEqual(msg.flags[MODULE_ID].weaponMastery.undo.t0.graze, { hp: { actor: "Actor.toad", value: 1, temp: 2 } });
  await wm.undoRow(ctx, ctx.targets[0]);
  assert.deepEqual(toad.system.attributes.hp, { value: 10, temp: 2, effectiveMax: 12 });
  const moves = [];
  wmDocs["Scene.s.Token.toad"] = { move: async to => moves.push(to) };
  await wm.revert({ move: { token: "Scene.s.Token.toad", x: 100, y: 200 } });
  assert.deepEqual(moves, [{ x: 100, y: 200, action: "displace" }]);
  await wm.revert(null);
  game.user.isGM = false;
});
await test("weapon mastery: the save button on a request rolls once per client", async () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  const pc = wmActor("cleric", { playerOwner: true });
  const request = { id: "req-once", rolls: [], flags: { [MODULE_ID]: { weaponMasterySave: { actor: pc.uuid, dc: 13, ability: "con" } } } };
  game.user.isGM = false;
  const card = wmCard(); render(request, card.root);
  await buttonsOf(card.content)[0].click(); await tick();
  await buttonsOf(card.content)[0].click(); await tick();
  assert.equal(pc.saves.length, 1);
  assert.ok(buttonsOf(card.content)[0].classList.contains("dt-wm__btn--done"));
});
await test("weapon mastery: RSReforged — panel in the attack section, never on its hidden child card; save requests", () => {
  const render = hooks["dnd5e.renderChatMessage"].at(-1);
  const child = wmMessage({ mastery: "topple", targets: [t(goblin, 13)], id: "rsrChild" });
  child.flags.rsreforged = { parentId: "usage" };
  game.modules = { get: id => (id === "rsreforged" ? { active: true } : undefined) };
  game.user.isGM = true;
  const { root } = wmCard();
  const section = new WmEl("div"); section.className = "rsr-card rsr-section-attack"; section.dataset.messageId = "rsrChild";
  root.append(section);
  render({ id: "usage", type: "usage", rolls: [], system: {}, flags: { rsreforged: { workflowVersion: 2 } } }, root);
  assert.equal(section.querySelectorAll(".dt-wm").length, 1);
  assert.equal(root.querySelector(".message-content").querySelectorAll(":scope > .dt-wm").length, 0, "not on the usage card");
  const childCard = wmCard(); render(child, childCard.root);
  assert.equal(childCard.root.querySelector(".dt-wm"), null, "not on the hidden child card");
  game.modules = { get: () => undefined };
  const plainCard = wmCard(); render(child, plainCard.root);
  assert.ok(plainCard.root.querySelector(".dt-wm"), "without RSReforged the card itself gets it");
  const pc = wmDocs["Actor.rogue"];
  const request = { id: "req", rolls: [], flags: { [MODULE_ID]: { weaponMasterySave: { actor: pc.uuid, dc: 13, ability: "con" } } } };
  game.user.isGM = false;
  let card = wmCard(); render(request, card.root);
  assert.equal(buttonsOf(card.content).length, 1, "the target's owner gets the save button");
  pc.isOwner = false; card = wmCard(); render(request, card.root);
  assert.equal(buttonsOf(card.content).length, 0);
  pc.isOwner = true;
  delete globalThis.document; delete globalThis.HTMLElement;
});

await test("savage attacker: button/note also land in RSReforged's damage section of the usage card", async () => {
  globalThis.HTMLElement = WmEl;
  globalThis.document = { createElement: tag => new WmEl(tag) };
  settings.savageAttackerMode = "auto";
  const render = (message, html) => fire("dnd5e.renderChatMessage", message, html);
  const owner = saActor("rsr1");
  const available = { id: "dmgChild", rolls: [{ options: { [MODULE_ID]: { savage: "available", actor: owner.uuid } } }] };
  game.messages = { get: id => (id === "dmgChild" ? available : null) };
  game.modules = { get: id => (id === "rsreforged" ? { active: true } : undefined) };
  game.user.isGM = true;
  const { root } = wmCard();
  const section = new WmEl("div"); section.className = "rsr-card rsr-section-damage"; section.dataset.messageId = "dmgChild";
  root.append(section);
  await render({ id: "usage", rolls: [], system: {}, flags: { rsreforged: { workflowVersion: 2 } } }, root);
  assert.equal(section.querySelectorAll(".dt-savage").length, 1);
  assert.match(section.textContent, /DT\.SavageAttacker\.Button/);
  await render({ id: "usage", rolls: [], system: {}, flags: {} }, root);
  assert.equal(section.querySelectorAll(".dt-savage").length, 1, "idempotent on re-render");
  game.user.isGM = false;
  game.modules = { get: () => undefined };
  delete globalThis.document; delete globalThis.HTMLElement;
});

await test("savage attacker: the note shows both totals, each with its dice as tooltip", async () => {
  globalThis.HTMLElement = WmEl;
  globalThis.document = { createElement: tag => new WmEl(tag) };
  settings.savageAttackerMode = "auto";
  const rerolled = { id: "dmgR", rolls: [{ terms: [], options: { [MODULE_ID]: {
    savage: "rerolled", actor: "Actor.none", before: 14, after: 16, beforeDice: [8, 6], afterDice: [9, 7] } } }] };
  let card = wmCard();
  await fire("dnd5e.renderChatMessage", rerolled, card.root);
  assert.deepEqual(card.content.querySelectorAll(".dt-savage__total").map(n => [n.textContent, n.dataset.tooltip]),
    [["14", "8 + 6"], ["16", "9 + 7"]]);
  const pool = new SaPool({ terms: ["2d6", "2d6"], modifiers: ["kh"], rolls: [
    { total: 5, dice: [{ results: [{ result: 2 }, { result: 3 }] }] },
    { total: 9, dice: [{ results: [{ result: 4 }, { result: 5 }, { result: 1, active: false }] }] }
  ] });
  const auto = { id: "dmgA", rolls: [{ terms: [pool], options: { [MODULE_ID]: { savage: "auto", actor: "Actor.none" } } }] };
  card = wmCard();
  await fire("dnd5e.renderChatMessage", auto, card.root);
  assert.deepEqual(card.content.querySelectorAll(".dt-savage__total").map(n => n.dataset.tooltip), ["2 + 3", "4 + 5"],
    "discarded dice (e.g. rerolls) are left out");
  assert.match(card.content.textContent, /→ 9/);
  delete globalThis.document; delete globalThis.HTMLElement;
});

console.log(`\ntest-features: ${passed} passed`);

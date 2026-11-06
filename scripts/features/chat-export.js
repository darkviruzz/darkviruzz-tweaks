/**
 * Feature: Chat Export by Time Range (system-agnostic)
 * ----------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Core's chat export (the floppy-disk button in the chat controls, GM only) always writes the
 * WHOLE chat log to a text file. This adds a second button next to it that exports a time range
 * only: the last N hours, the last N days (rolling, N × 24 h), from day A to day B (whole days,
 * local time) or everything. Oldest first, with one header line (world, range, count).
 *
 * Two formats:
 *   - detailed (default): what happened, readable without Foundry — for dnd5e the item and
 *     activity, the kind of roll, every roll with its d20s (advantage / disadvantage, critical,
 *     natural 1), damage per type and in total, the targets with AC and hit/miss (players: as
 *     far as dnd5e's "Attack Roll Visibility" shows it to them), save DCs and success/failure,
 *     the effects a card offers, whispers and blind rolls. Core's export leaves dnd5e 6 cards
 *     EMPTY (their content is rendered from `message.system`, `message.content` is "") — that is
 *     why the first version's files said so little. Works for dnd5e 5.x (flags) and 6.x (system
 *     data); other systems get flavor, text and rolls.
 *   - Foundry: core's format — `ChatMessage#export()` per message ("[time] alias", the content
 *     as plain text, one "formula = result = total" line per roll) and core's separator.
 *
 * Players (optional, world setting): they get the button too and export only what they can
 * see — `message.visible` and `message.isContentVisible` (others' whispers and blind rolls are
 * left out). The GM exports everything, like core. Core's own button stays as it is.
 *
 * Macro API: `game.modules.get("darkviruzz-tweaks").api.exportChat({hours} | {days} |
 * {from, to} | {all: true}, {format: "detailed" | "foundry"})` — from/to as Date, timestamp or
 * "YYYY-MM-DD" (whole days).
 *
 * dnd5e data used (verified against the bundled dnd5e.mjs 6.0.6 and 5.3.3): 6.x message types
 * `usage | attack | damage | healing | save | check | …` with `system.item` / `system.activity`
 * ({name, type, uuid}), `system.targets` ({name, ac, actor, token}), attack
 * `system.evaluatedTargets` (+ isMiss), damage `system.onSave`, usage `system.effects` (effect
 * ids of the item); 5.x `flags.dnd5e.roll.type`, `flags.dnd5e.item.uuid`, `flags.dnd5e.targets`.
 * Rolls: `DamageRoll#options.type` (damage type key → `CONFIG.DND5E.damageTypes` /
 * `healingTypes`), `D20Roll#isCritical`/`isFumble`/`hasAdvantage`/`hasDisadvantage`,
 * `options.target` (AC / DC), `isSuccess`.
 *
 * Verified (Foundry 14.364): ChatLog#export (`contents.map(m => m.export())` joined with
 * "\n---------------------------\n", file `fvtt-log-<date>.txt`), ChatMessage#export,
 * template sidebar/tabs/chat/notifications.hbs (`#chat-controls` > `.control-buttons`, GM
 * only), `foundry.utils.saveDataToFile(data, type, filename)`, DialogV2.wait({render}) with a
 * button callback `(event, button, dialog)`, FormDataExtended.
 */

import { MODULE_ID } from "../constants.js";
import { hitAgainst } from "../lib/attack-roll.js";

const KEY_ENABLED = "chatExportEnabled";
const KEY_PLAYERS = "chatExportPlayers";
/** Core's separator between messages (ChatLog#export). */
const SEPARATOR = "\n---------------------------\n";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BUTTON_CLASS = "dt-chat-export";

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

function mayExport(user = game.user) {
  if (!game.settings.get(MODULE_ID, KEY_ENABLED)) return false;
  return !!user?.isGM || !!game.settings.get(MODULE_ID, KEY_PLAYERS);
}

/* -------------------------------------------- */
/*  Range and messages                          */
/* -------------------------------------------- */

/** "YYYY-MM-DD" → local midnight of that day, or null. */
function dayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const [y, m, d] = String(value).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** A Date, a timestamp or "YYYY-MM-DD" (start of that day) → timestamp, or null. */
function toTime(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (Number.isFinite(value)) return value;
  return dayStart(value);
}

/**
 * The time range to export.
 * @param {{hours?: number, days?: number, from?: Date|number|string, to?: Date|number|string}} spec
 *   hours / days: up to now; from/to: "YYYY-MM-DD" means the whole day (to: until its end)
 * @returns {{from: number, to: number}|null}
 */
function rangeFor(spec = {}, now = Date.now()) {
  const hours = Number(spec.hours);
  const days = Number(spec.days);
  if (spec.all) return { from: 0, to: now };
  if (hours > 0) return { from: now - (hours * HOUR), to: now };
  if (days > 0) return { from: now - (days * DAY), to: now };
  let from = toTime(spec.from);
  let to = (dayStart(spec.to) !== null) ? dayStart(spec.to) + DAY - 1 : toTime(spec.to);
  if ((from === null) && (to === null)) return null;
  from ??= 0;
  to ??= now;
  if (from > to) {
    // Days given the wrong way round: swap them, still whole days.
    const a = dayStart(spec.to) ?? to;
    const b = (dayStart(spec.from) !== null) ? dayStart(spec.from) + DAY - 1 : from;
    [from, to] = [a, b];
  }
  return { from, to };
}

/** The messages in the range that this user may export, oldest first. */
function messagesIn({ from, to }, user = game.user) {
  const all = Array.from(game.messages?.contents ?? game.messages ?? []);
  return all
    .filter(m => (Number(m.timestamp) >= from) && (Number(m.timestamp) <= to))
    .filter(m => user?.isGM || ((m.visible !== false) && (m.isContentVisible !== false)))
    .sort((a, b) => a.timestamp - b.timestamp);
}

const formatTime = time => new Date(time).toLocaleString(game.i18n?.lang || undefined,
  { dateStyle: "short", timeStyle: "short" });

const pad = n => String(n).padStart(2, "0");
/** Local "YYYY-MM-DD_HHMM" for file names. */
function stamp(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/* -------------------------------------------- */
/*  Detailed format                             */
/* -------------------------------------------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

/** HTML → plain text lines (block ends and <br> become line breaks). Works without a DOM. */
function htmlToText(html) {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|header|footer|ul|ol|table)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const detail = (key, data) => (data ? format(key, data) : localize(key));
const formatSeconds = time => new Date(time).toLocaleString(game.i18n?.lang || undefined,
  { dateStyle: "short", timeStyle: "medium" });

/** Label of a dnd5e config entry (labels may be i18n keys or plain strings), or null. */
function configLabel(group, key) {
  const entry = CONFIG.DND5E?.[group]?.[key];
  const label = (typeof entry === "string") ? entry : entry?.label;
  return label ? localize(label) : null;
}

/** The kind of roll message: attack, damage, healing, save, check, usage or null. */
function messageKind(message) {
  const type = message?.type;
  if (["usage", "attack", "damage", "healing", "save", "check"].includes(type)) return type;
  const v5 = message?.flags?.dnd5e?.roll?.type;
  if ((v5 === "attack") || (v5 === "damage")) return v5;
  if ((v5 === "save") || (v5 === "death")) return "save";
  if (["ability", "skill", "tool", "check", "concentration", "initiative"].includes(v5)) return "check";
  if (message?.flags?.dnd5e?.item || message?.flags?.dnd5e?.activity) return "usage";
  return null;
}

function nameFromUuid(uuid) {
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid, { strict: false })?.name ?? null;
  } catch {
    return null;
  }
}

/** Item and activity names of a dnd5e card (6.x system data, 5.x flags). */
function cardSource(message) {
  const sys = message?.system ?? {};
  const item = sys.item?.name || nameFromUuid(message?.flags?.dnd5e?.item?.uuid);
  const activity = sys.activity?.name || nameFromUuid(message?.flags?.dnd5e?.activity?.uuid);
  return { item: item || null, activity: activity || null };
}

/** "formula = result = total", plus the d20s (advantage…), critical / natural 1, the damage type. */
function rollLine(roll, { kind } = {}) {
  let line = `${roll.formula} = ${roll.result} = ${roll.total}`;
  if (["attack", "save", "check"].includes(kind)) {
    const d20 = (roll.dice ?? []).find(d => d.faces === 20);
    const results = (d20?.results ?? []).map(r => r.result);
    if (results.length > 1) {
      const mode = roll.hasDisadvantage ? "DT.ChatExport.Detail.Disadvantage"
        : (roll.hasAdvantage ? "DT.ChatExport.Detail.Advantage" : "DT.ChatExport.Detail.Dice");
      line += ` (${detail(mode)}: ${results.join(", ")})`;
    }
    if (roll.isCritical) line += ` — ${detail("DT.ChatExport.Detail.Critical")}`;
    else if (roll.isFumble) line += ` — ${detail("DT.ChatExport.Detail.Fumble")}`;
  } else if ((kind === "damage") || (kind === "healing")) {
    const type = roll.options?.type;
    if (type) line += ` ${configLabel("damageTypes", type) ?? configLabel("healingTypes", type) ?? type}`;
    if (roll.isCritical) line += ` (${detail("DT.ChatExport.Detail.Critical")})`;
  }
  return line;
}

/** dnd5e's attack roll visibility for the current user: {ac, result}. GMs see everything. */
function attackVisibility() {
  if (game.user?.isGM) return { ac: true, result: true };
  let visibility = "all";
  try {
    visibility = game.settings.get("dnd5e", "attackRollVisibility") ?? "all";
  } catch { /* not dnd5e */ }
  return { ac: visibility === "all", result: visibility !== "none" };
}

/** Target descriptors: 6.x system.targets, 5.x flags.dnd5e.targets. */
function targetsOf(message) {
  const v6 = message?.system?.targets;
  if (v6?.length) return Array.from(v6);
  const v5 = message?.flags?.dnd5e?.targets;
  return Array.isArray(v5) ? v5 : [];
}

/** "vs. Name (AC 17): hit" lines of an attack. */
function attackTargetLines(message) {
  const roll = message.rolls?.[0];
  const targets = targetsOf(message);
  if (!targets.length) return [detail("DT.ChatExport.Detail.NoTargets")];
  const show = attackVisibility();
  const evaluated = message.system?.evaluatedTargets;
  return targets.map((target, i) => {
    let text = target.name ?? "?";
    if (show.ac) text += ` (${detail("DT.ChatExport.Detail.AC", { ac: target.ac ?? "?" })})`;
    if (show.result) {
      const miss = evaluated?.[i]?.isMiss;
      const hit = (miss === undefined) ? hitAgainst(roll, target.ac) : !miss;
      const key = (hit === null) ? "DT.ChatExport.Detail.Unknown" : (hit ? "DT.ChatExport.Detail.Hit" : "DT.ChatExport.Detail.Miss");
      text += `: ${detail(key)}`;
    }
    return `${detail("DT.ChatExport.Detail.Versus")} ${text}`;
  });
}

/** The activity of a usage card (for its save DC and effects), or null. */
function activityOf(message) {
  try {
    return message.getAssociatedActivity?.() ?? null;
  } catch {
    return null;
  }
}

/** Detailed text of one message: a head line and indented details. */
function describeMessage(message) {
  const kind = messageKind(message);
  const { item, activity } = cardSource(message);
  const flavor = htmlToText(message.flavor);
  const kindKey = {
    attack: "DT.ChatExport.Detail.Attack", damage: "DT.ChatExport.Detail.Damage", healing: "DT.ChatExport.Detail.Healing"
  }[kind];
  const kindLabel = kindKey ? detail(kindKey) : null;

  // Title: "item — activity" (or the kind of roll), else the flavor.
  let title = flavor.split("\n")[0] ?? "";
  if (item) {
    const second = kindLabel ?? ((activity && (activity !== item)) ? activity : null);
    title = second ? `${item} — ${second}` : item;
  }

  let head = `[${formatSeconds(message.timestamp)}] ${message.alias ?? message.speaker?.alias ?? ""}`.trimEnd();
  if (title) head += `: ${title}`;
  const tags = [];
  const whisper = Array.from(message.whisper ?? []).map(id => game.users?.get?.(id)?.name).filter(Boolean);
  if (whisper.length) tags.push(detail("DT.ChatExport.Detail.Whisper", { users: whisper.join(", ") }));
  if (message.blind) tags.push(detail("DT.ChatExport.Detail.Blind"));
  if (tags.length) head += ` (${tags.join(", ")})`;

  const lines = [];
  for (const line of flavor.split("\n")) if (line && (line !== title) && !title.includes(line)) lines.push(line);
  // dnd5e cards: their content is the item card (description, buttons) — 6.x even leaves it empty.
  if (!kind) lines.push(...htmlToText(message.content).split("\n").filter(Boolean));

  const rolls = Array.from(message.rolls ?? []);
  if (kind === "attack") {
    for (const roll of rolls) lines.push(`${detail("DT.ChatExport.Detail.AttackRoll")}: ${rollLine(roll, { kind })}`);
    lines.push(...attackTargetLines(message));
  } else if ((kind === "damage") || (kind === "healing")) {
    for (const roll of rolls) lines.push(rollLine(roll, { kind }));
    const total = rolls.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    if (rolls.length > 1) lines.push(detail("DT.ChatExport.Detail.Total", { total }));
    const onSave = message.system?.onSave;
    const onSaveKey = { none: "DT.ChatExport.Detail.OnSave.None", half: "DT.ChatExport.Detail.OnSave.Half",
      full: "DT.ChatExport.Detail.OnSave.Full" }[onSave];
    if (onSaveKey) lines.push(detail(onSaveKey));
    const names = targetsOf(message).map(t => t.name).filter(Boolean);
    if (names.length) lines.push(detail("DT.ChatExport.Detail.Targets", { targets: names.join(", ") }));
  } else if ((kind === "save") || (kind === "check")) {
    for (const roll of rolls) {
      let line = rollLine(roll, { kind });
      const dc = roll.options?.target;
      if ((dc !== undefined) && (dc !== null) && (dc !== "") && Number.isFinite(Number(dc))) {
        const success = roll.isSuccess ?? (roll.total >= Number(dc));
        const result = success ? "DT.ChatExport.Detail.Success" : "DT.ChatExport.Detail.Failure";
        line += ` ${detail("DT.ChatExport.Detail.VersusDC", { dc })}: ${detail(result)}`;
      }
      lines.push(line);
    }
  } else {
    for (const roll of rolls) lines.push(rollLine(roll, { kind }));
  }

  if (kind === "usage") {
    const names = targetsOf(message).map(t => t.name).filter(Boolean);
    if (names.length) lines.push(detail("DT.ChatExport.Detail.Targets", { targets: names.join(", ") }));
    const act = activityOf(message);
    const dc = act?.save?.dc?.value;
    if (dc) {
      const ability = [...(act.save.ability ?? [])].map(a => configLabel("abilities", a) ?? a).join("/");
      lines.push(detail("DT.ChatExport.Detail.Save", { dc, ability }));
    }
    const effects = Array.from(message.system?.effects ?? [])
      .map(id => act?.item?.effects?.get?.(id)?.name ?? null).filter(Boolean);
    if (effects.length) lines.push(detail("DT.ChatExport.Detail.Effects", { effects: effects.join(", ") }));
  }

  return [head, ...lines.map(l => `    ${l}`)].join("\n");
}

/** The file text: one header line, then the messages in the chosen format. */
function buildLog(messages, range, { format: fileFormat = "detailed" } = {}) {
  const header = format("DT.ChatExport.Header", {
    world: game.world?.title ?? "", from: formatTime(range.from), to: formatTime(range.to), count: messages.length
  });
  if (fileFormat === "foundry") return `${header}\n\n${messages.map(m => m.export()).join(SEPARATOR)}\n`;
  const blocks = messages.map(m => {
    try {
      return describeMessage(m);
    } catch (err) {
      console.warn(`${MODULE_ID} | chat export: message ${m.id} written in Foundry's format`, err);
      return m.export();
    }
  });
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}

/**
 * Export the chat messages of a time range to a text file (macro API).
 * @param {object} spec                     {hours} | {days} | {from, to} | {all: true}
 * @param {{format?: "detailed"|"foundry"}} [options]
 * @returns {number} how many messages were exported (0: nothing, no file)
 */
function exportChat(spec = {}, { format: fileFormat = "detailed" } = {}) {
  const range = rangeFor(spec);
  if (!range) {
    ui.notifications.warn(localize("DT.ChatExport.InvalidRange"));
    return 0;
  }
  const messages = messagesIn(range);
  if (!messages.length) {
    ui.notifications.warn(format("DT.ChatExport.None", { from: formatTime(range.from), to: formatTime(range.to) }));
    return 0;
  }
  foundry.utils.saveDataToFile(buildLog(messages, range, { format: fileFormat }), "text/plain",
    `fvtt-log-${stamp(range.from)}--${stamp(range.to)}.txt`);
  return messages.length;
}

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Form values → range spec. */
function specFromForm(data) {
  if (data.mode === "all") return { all: true };
  if (data.mode === "hours") return { hours: Number(data.hours) };
  if (data.mode === "days") return { days: Number(data.days) };
  return { from: data.from, to: data.to };
}

function dialogContent() {
  const day = today();
  const group = (mode, label, input) =>
    `<div class="form-group" data-dt-mode="${mode}"><label>${localize(label)}</label><div class="form-fields">${input}</div></div>`;
  return `<div class="${BUTTON_CLASS}-dialog">
    <div class="form-group"><label>${localize("DT.ChatExport.Mode.Label")}</label><div class="form-fields">
      <select name="mode">
        <option value="hours" selected>${localize("DT.ChatExport.Mode.Hours")}</option>
        <option value="days">${localize("DT.ChatExport.Mode.Days")}</option>
        <option value="range">${localize("DT.ChatExport.Mode.Range")}</option>
        <option value="all">${localize("DT.ChatExport.Mode.All")}</option>
      </select></div></div>
    <div class="form-group"><label>${localize("DT.ChatExport.Format.Label")}</label><div class="form-fields">
      <select name="format">
        <option value="detailed" selected>${localize("DT.ChatExport.Format.Detailed")}</option>
        <option value="foundry">${localize("DT.ChatExport.Format.Foundry")}</option>
      </select></div></div>
    ${group("hours", "DT.ChatExport.Hours", `<input type="number" name="hours" value="5" min="1" step="1">`)}
    ${group("days", "DT.ChatExport.Days", `<input type="number" name="days" value="1" min="1" step="1">`)}
    ${group("range", "DT.ChatExport.From", `<input type="date" name="from" value="${day}">`)}
    ${group("range", "DT.ChatExport.To", `<input type="date" name="to" value="${day}">`)}
    <p class="hint" data-dt-count></p>
  </div>`;
}

/** Show the fields of the chosen mode and how many messages the range holds. */
function refreshDialog(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const node of form.querySelectorAll("[data-dt-mode]")) {
    node.style.display = (node.dataset.dtMode === data.mode) ? "" : "none";
  }
  const range = rangeFor(specFromForm(data));
  const count = range ? messagesIn(range).length : 0;
  const hint = form.querySelector("[data-dt-count]");
  if (hint) hint.textContent = range
    ? format("DT.ChatExport.Count", { count, from: formatTime(range.from), to: formatTime(range.to) })
    : localize("DT.ChatExport.InvalidRange");
}

async function openExportDialog() {
  if (!mayExport()) return null;
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title: "DT.ChatExport.Title", icon: "fa-solid fa-clock-rotate-left" },
    position: { width: 420 },
    content: dialogContent(),
    buttons: [{
      action: "export", label: "DT.ChatExport.Export", icon: "fa-solid fa-floppy-disk", default: true,
      callback: (event, button) => {
        const data = Object.fromEntries(new FormData(button.form).entries());
        return exportChat(specFromForm(data), { format: data.format });
      }
    }],
    render: (event, dialog) => {
      const form = dialog.element?.querySelector("form");
      if (!form) return;
      refreshDialog(form);
      form.addEventListener("input", () => refreshDialog(form));
      form.addEventListener("change", () => refreshDialog(form));
    }
  });
}

/* -------------------------------------------- */
/*  Chat controls                               */
/* -------------------------------------------- */

/** Put the button into the chat controls (after core's export/clear for the GM). */
function insertButton(controls) {
  if (!controls || controls.querySelector(`.${BUTTON_CLASS}`)) return;
  let box = controls.querySelector(".control-buttons");
  if (!box) {
    // Players have no core control buttons.
    box = document.createElement("div");
    box.className = "control-buttons";
    controls.append(box);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ui-control icon fa-solid fa-clock-rotate-left ${BUTTON_CLASS}`;
  button.dataset.tooltip = "";
  button.ariaLabel = localize("DT.ChatExport.Button");
  button.addEventListener("click", event => {
    event.preventDefault();
    openExportDialog().catch(err => console.error(`${MODULE_ID} | chat export failed`, err));
  });
  box.append(button);
}

function onRenderChatLog(app, element) {
  try {
    if (!mayExport()) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const controls = root?.querySelector?.("#chat-controls") ?? document.getElementById?.("chat-controls");
    insertButton(controls);
  } catch (err) {
    console.error(`${MODULE_ID} | chat export button failed`, err);
  }
}

/** For tools/test-features.mjs only. */
export const internals = {
  rangeFor, messagesIn, buildLog, exportChat, insertButton, specFromForm, stamp, htmlToText, messageKind, rollLine,
  describeMessage
};

export default {
  id: "chatExport",
  category: {
    label: "DT.Categories.ChatExport.Label",
    hint: "DT.Categories.ChatExport.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.ChatExportEnabled.Name",
        hint: "DT.Settings.ChatExportEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => ui.chat?.render?.()
      }
    },
    {
      key: KEY_PLAYERS,
      options: {
        name: "DT.Settings.ChatExportPlayers.Name",
        hint: "DT.Settings.ChatExportPlayers.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => ui.chat?.render?.()
      }
    }
  ],
  init() {
    Hooks.on("renderChatLog", onRenderChatLog);
    Hooks.once("ready", () => {
      const module = game.modules?.get(MODULE_ID);
      if (module) module.api = Object.assign(module.api ?? {}, { exportChat });
    });
  }
};

/**
 * Feature: Chat Export by Time Range (system-agnostic)
 * ----------------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Core's chat export (the floppy-disk button in the chat controls, GM only) always writes the
 * WHOLE chat log to a text file. This adds a second button next to it that exports a time range
 * only: the last N hours, the last N days (rolling, N × 24 h), or from day A to day B (whole
 * days, local time). The file has core's format — `ChatMessage#export()` per message
 * ("[time] alias", the content as plain text, one "formula = result = total" line per roll),
 * core's separator, oldest first — plus one header line with the world and the range.
 *
 * Players (optional, world setting): they get the button too and export only what they can
 * see — `message.visible` and `message.isContentVisible` (others' whispers and blind rolls are
 * left out). The GM exports everything, like core. Core's own button stays as it is.
 *
 * Macro API: `game.modules.get("darkviruzz-tweaks").api.exportChat({hours} | {days} |
 * {from, to})` — from/to as Date, timestamp or "YYYY-MM-DD" (whole days).
 *
 * Verified (Foundry 14.364): ChatLog#export (`contents.map(m => m.export())` joined with
 * "\n---------------------------\n", file `fvtt-log-<date>.txt`), ChatMessage#export,
 * template sidebar/tabs/chat/notifications.hbs (`#chat-controls` > `.control-buttons`, GM
 * only), `foundry.utils.saveDataToFile(data, type, filename)`, DialogV2.wait({render}) with a
 * button callback `(event, button, dialog)`, FormDataExtended.
 */

import { MODULE_ID } from "../constants.js";

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

/** The file text: one header line, then core's format. */
function buildLog(messages, range) {
  const header = format("DT.ChatExport.Header", {
    world: game.world?.title ?? "", from: formatTime(range.from), to: formatTime(range.to), count: messages.length
  });
  return `${header}\n\n${messages.map(m => m.export()).join(SEPARATOR)}\n`;
}

/**
 * Export the chat messages of a time range to a text file (macro API).
 * @returns {number} how many messages were exported (0: nothing, no file)
 */
function exportChat(spec = {}) {
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
  foundry.utils.saveDataToFile(buildLog(messages, range), "text/plain",
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
  if (data.mode === "hours") return { hours: Number(data.hours) };
  if (data.mode === "days") return { days: Number(data.days) };
  return { from: data.from, to: data.to };
}

function dialogContent() {
  const day = today();
  const group = (mode, label, input) =>
    `<div class="form-group" data-dt-mode="${mode}"><label>${localize(label)}</label><div class="form-fields">${input}</div></div>`;
  return `<div class="${BUTTON_CLASS}-dialog">
    <div class="form-group"><label>${localize("DT.ChatExport.Mode")}</label><div class="form-fields">
      <select name="mode">
        <option value="hours" selected>${localize("DT.ChatExport.Mode.Hours")}</option>
        <option value="days">${localize("DT.ChatExport.Mode.Days")}</option>
        <option value="range">${localize("DT.ChatExport.Mode.Range")}</option>
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
      callback: (event, button) => exportChat(specFromForm(Object.fromEntries(new FormData(button.form).entries())))
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
export const internals = { rangeFor, messagesIn, buildLog, exportChat, insertButton, specFromForm, stamp };

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

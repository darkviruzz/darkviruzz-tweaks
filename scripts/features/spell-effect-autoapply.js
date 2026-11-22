/**
 * Feature: Spell Effect Auto-Apply (dnd5e)
 * ----------------------------------------
 * Foundry VTT v14+ · dnd5e 5.x and 6.x
 *
 * Some spells, features and items are, in practice, always used on yourself — Mage Armor,
 * Rage, a Potion of Flying. dnd5e still requires someone to press "apply" on the chat card's
 * effect tray for the Active Effect to land on the actor, and by default only the GM sees that
 * tray (dnd5e 5.x: GM only; dnd5e 6.x: GM, or players if the GM enables dnd5e's
 * "allowPlayerEffectsTray" setting).
 *
 * This feature removes that click for a GM-curated list of item names: when a listed spell,
 * feature or item is used on the user's own actor, its effect is applied automatically, the
 * chat card shows the actor as the target, and a banner reports that it was applied.
 *
 * Conditions — ALL must hold before anything is applied:
 *   1. the feature is enabled,
 *   2. the item's name is on the list (case-insensitive; any item type since 1.12),
 *   3. the activity is not an attack, save, damage or enchant activity (their effects are
 *      riders for the creature that is hit / enchantments for items),
 *   4. the activity's range is "self" or "touch",
 *   5. the user is the target — implicit for "self"; for "touch" either nothing was
 *      targeted or the actor itself was the only target,
 *   6. the acting user owns the actor (dnd5e refuses effect application otherwise),
 *   7. the activity offers exactly ONE effect — or several and the GM enabled "ask": then the
 *      acting user picks one in a dialog (cancel = nothing applied).
 *
 * Applying reuses dnd5e's OWN logic instead of re-implementing it: we construct its
 * <effect-application> chat-tray element (a custom element with no constructor side effects),
 * point its public `chatMessage` field at the usage message, and call
 *   - dnd5e 6.x: `_prepareEffectData(effect, actor)` — the path its Apply button uses
 *     (origin in `system.origin`, `_stats` source tracking, `getEffectStart()`, refresh
 *     instead of duplicate, `disabled: false, transfer: false`), then create/update the effect;
 *   - dnd5e 5.x: `_applyEffectToActor(effect, actor)`.
 *
 * GM helpers: a list widget in the settings window (chips grouped by spells / features /
 * items / not found, with a status per entry, an add field with candidates from the world's
 * actors and the curated suggestions), an "Auto-apply in future" button on usage cards of
 * eligible items that aren't listed yet, and an entry in dnd5e's item context menu.
 *
 * Hooks: dnd5e.preUseActivity (record the user as target), dnd5e.postUseActivity (apply;
 * fires only on the acting client — dnd5e has no socket layer, and that user owns the actor,
 * so exactly one client applies), dnd5e.renderChatMessage (banner, quick add),
 * dnd5e.getItemContextOptions (context-menu entry), renderSettingsConfig (list widget).
 *
 * All settings are world-scoped (a table-wide rule the GM sets); the feature is off by default.
 */

import { MODULE_ID } from "../constants.js";
import {
  CURATED_NAMES, parseList, serialiseList, addToList, removeFromList, listHas, nameKey,
  activitiesOf, isAllowedActivity, isSelfRange, activityEffectCount, isUsableActivity, rangeOf,
  buildIndex, candidatesFromIndex, groupList, missingSuggestions, classifyItem, SELF_RANGES
} from "../lib/autoapply-list.js";

const KEY_ENABLED   = "spellAutoApplyEnabled";
const KEY_WHITELIST = "spellAutoApplyWhitelist";
const KEY_ASK       = "spellAutoApplyAskChoice";

/** Message flag recording what this feature auto-applied, for the chat-card banner. */
const FLAG_APPLIED = "autoApplied";

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/* -------------------------------------------- */
/*  Eligibility                                 */
/* -------------------------------------------- */

const storedList = () => String(game.settings.get(MODULE_ID, KEY_WHITELIST) ?? "");

/** Is this activity's item on the list (any item type)? */
function isListed(activity) {
  const name = activity?.item?.name;
  return !!nameKey(name) && listHas(storedList(), name);
}

/** The effective range units of an activity. */
const rangeUnits = activity => rangeOf(activity, activity?.item)?.units;

/**
 * Actor uuids of the targets recorded on a usage message.
 * dnd5e 6.x: `system.targets` entries `{actor, token, …}`; dnd5e 5.x: `flags.dnd5e.targets`
 * entries `{uuid, …}` where uuid is the actor uuid.
 */
function recordedTargetActors(message) {
  const v6 = message?.system?.targets;
  if (Array.isArray(v6)) return v6.map(t => t?.actor).filter(Boolean);
  const v5 = message?.getFlag?.("dnd5e", "targets");
  return Array.isArray(v5) ? v5.map(t => t?.uuid).filter(Boolean) : [];
}

/**
 * Is this activation a use on oneself of a self/touch range activity?
 * "self" is self-use by definition; "touch" only when nothing was targeted or the actor
 * was the only target.
 */
function isSelfCast(activity, message, actor) {
  const units = rangeUnits(activity);
  if (!SELF_RANGES.has(units)) return false;
  if (units === "self") return true;

  const targets = recordedTargetActors(message);
  if (!targets.length) return true;
  return (targets.length === 1) && (targets[0] === actor.uuid);
}

/** Cheap checks shared by both use hooks. */
const eligibleActivity = activity =>
  !!game.settings.get(MODULE_ID, KEY_ENABLED) && isListed(activity) && isAllowedActivity(activity);

/* -------------------------------------------- */
/*  Show the user as the target                 */
/* -------------------------------------------- */

/** The actor's token document on the viewed scene, if any. */
function casterToken(actor) {
  return actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
}

/**
 * Record the actor as the target of an untargeted self/touch use, so the chat card's effect
 * tray lists them instead of falling back to "No Tokens Selected".
 *
 * dnd5e builds the target list into the message config before firing this hook, so it is
 * writable here and the card is born with the right target. An explicit target — even the
 * actor themselves — is left exactly as dnd5e recorded it.
 */
function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
  try {
    if (!eligibleActivity(activity)) return;
    if (!SELF_RANGES.has(rangeUnits(activity))) return;

    const actor = activity.actor;
    if (!actor?.isOwner) return;

    const token = casterToken(actor);
    const ac = actor.system?.attributes?.ac?.value ?? null;

    // dnd5e 6.x — shape mirrors TargetsField.getDescriptors().
    const v6 = foundry.utils.getProperty(messageConfig, "data.system.targets");
    if (Array.isArray(v6)) {
      if (v6.length) return;
      foundry.utils.setProperty(messageConfig, "data.system.targets", [{
        actor: actor.uuid,
        ac,
        img: token?.texture?.src ?? actor.img,
        name: token?.name ?? actor.name,
        token: token?.uuid
      }]);
      return;
    }

    // dnd5e 5.x — shape mirrors getTargetDescriptors().
    const v5 = foundry.utils.getProperty(messageConfig, "data.flags.dnd5e.targets");
    if (Array.isArray(v5) && !v5.length) {
      foundry.utils.setProperty(messageConfig, "data.flags.dnd5e.targets", [{
        name: token?.name ?? actor.name,
        img: actor.img,
        uuid: actor.uuid,
        ac
      }]);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (target injection) failed`, err);
  }
}

/* -------------------------------------------- */
/*  Applying the effect                         */
/* -------------------------------------------- */

/** The effects dnd5e's tray would offer for this usage message. */
async function offeredEffects(activity, message, actor) {
  // dnd5e 6.x: exactly the list the tray shows (system.effects resolved to documents; an
  // effect referenced by an activity is prepared with transfer = disabled = false).
  if (typeof message?.system?.getEffects === "function") return message.system.getEffects();

  // dnd5e 5.x: `activity` belongs to a temporary item clone made inside Activity#use(), so
  // resolve the real embedded effects — the clone's carry the wrong uuids.
  const realItem = actor.items.get(activity.item?.id) ?? activity.item;
  return (activity.applicableEffects ?? []).map(e => realItem?.effects?.get(e.id) ?? e);
}

/**
 * Apply one effect to the actor through dnd5e's own chat-tray logic.
 * @returns {Promise<string|null>}  The id of the created or refreshed effect.
 */
async function applyThroughDnd5e(message, effect, actor) {
  const Tray = customElements.get("effect-application");
  if (!Tray) throw new Error("dnd5e's <effect-application> element is not registered");
  const tray = new Tray();
  tray.chatMessage = message;

  // dnd5e 6.x — the code path its Apply button uses.
  if (typeof tray._prepareEffectData === "function") {
    const { action, data } = await tray._prepareEffectData(effect, actor);
    if (action === "update") {
      await actor.effects.get(data._id)?.update(data);
      return data._id;
    }
    const created = await ActiveEffect.implementation.create(data, { parent: actor });
    return created?.id ?? null;
  }

  // dnd5e 5.x.
  if (typeof tray._applyEffectToActor === "function") {
    const result = await tray._applyEffectToActor(effect, actor);
    return result?.id ?? null;
  }

  throw new Error("this dnd5e version offers no known effect-application method");
}

/** `dnd5e.postUseActivity` handler — cheap guards first, then fire-and-forget the apply. */
function onPostUseActivity(activity, usageConfig, results) {
  try {
    if (!eligibleActivity(activity)) return;

    // Without a created chat message there's nothing for dnd5e's logic to work from.
    const message = results?.message;
    if (message?.documentName !== "ChatMessage" || !message.id) return;

    const actor = activity.actor ?? message.getAssociatedActor?.();
    // dnd5e refuses to apply effects to actors you don't own; don't try to work around it.
    if (!actor?.isOwner) return;

    if (!isSelfCast(activity, message, actor)) return;

    autoApply(activity, message, actor)
      .catch(err => console.error(`${MODULE_ID} | spell effect auto-apply failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply failed`, err);
  }
}

/**
 * Ask the acting user which of several effects to apply.
 * @returns {Promise<object|null>}  The chosen effect, or null (cancelled / closed).
 */
async function chooseEffect(itemName, actor, effects) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return null;
  // DialogV2 accepts a <div> without attributes as content; built with textContent.
  const content = document.createElement("div");
  const prompt = document.createElement("p");
  prompt.textContent = format("DT.SpellAutoApply.Choose.Prompt", { name: itemName, actor: actor.name });
  const select = document.createElement("select");
  select.name = "effect";
  effects.forEach((effect, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = effect?.name ?? String(index + 1);
    select.append(option);
  });
  content.append(prompt, select);

  const result = await DialogV2.wait({
    window: { title: format("DT.SpellAutoApply.Choose.Title", { name: itemName }), icon: "fa-solid fa-wand-magic-sparkles" },
    content,
    buttons: [{
      action: "apply", label: "DT.SpellAutoApply.Choose.Apply", icon: "fa-solid fa-check", default: true,
      callback: (event, button) => button.form?.elements?.effect?.value ?? null
    }, {
      action: "cancel", label: "DT.SpellAutoApply.Choose.Cancel", icon: "fa-solid fa-xmark", callback: () => null
    }],
    rejectClose: false
  });
  const index = Number.parseInt(result, 10);
  return Number.isInteger(index) ? (effects[index] ?? null) : null;
}

async function autoApply(activity, message, actor) {
  const effects = await offeredEffects(activity, message, actor);
  let effect = null;
  if (effects.length === 1) effect = effects[0];
  else if ((effects.length > 1) && game.settings.get(MODULE_ID, KEY_ASK)) {
    effect = await chooseEffect(activity.item?.name ?? "", actor, effects);
    if (!effect) return;
  } else {
    console.debug(`${MODULE_ID} | "${activity.item?.name}" offers ${effects.length} effects — ` +
      "not auto-applying, the player chooses on the chat card.");
    return;
  }

  const effectId = await applyThroughDnd5e(message, effect, actor);
  if (!effectId) return;
  console.debug(`${MODULE_ID} | auto-applied "${activity.item?.name}" to ${actor.name}.`);

  // Record it on the message so every client can draw the banner. The user authored the
  // message, so they may update it. Best-effort: a failure only costs the banner.
  try {
    await message.setFlag(MODULE_ID, FLAG_APPLIED, {
      actorUuid: actor.uuid,
      name: actor.name,
      effectIds: [effectId]
    });
  } catch (err) {
    console.debug(`${MODULE_ID} | could not flag chat message as auto-applied`, err);
  }
}

/* -------------------------------------------- */
/*  "Applied" banner on the chat card           */
/* -------------------------------------------- */

/** Is the auto-applied effect recorded in `data` still active on the actor? */
function stillApplied(actor, data) {
  if (Array.isArray(data.effectIds)) {
    return data.effectIds.some(id => {
      const effect = actor.effects?.get(id);
      return effect && !effect.disabled;
    });
  }
  // Messages flagged by v1.5.x recorded origin uuids instead of effect ids.
  const origins = Array.isArray(data.origins) ? data.origins : [];
  return origins.some(origin => !!actor.effects?.find(e => e.origin === origin));
}

/**
 * Draw an "automatically applied" banner on the usage card.
 *
 * dnd5e has no native applied-state, so this is our own element: placed directly above the
 * <effect-application> tray when the tray is rendered, otherwise (e.g. players in dnd5e 6,
 * who don't get the tray) at the end of the message content. Re-derived from the actor's live
 * effects on every render, so it vanishes once the effect is removed.
 */
function renderBanner(message, root) {
  const data = message?.getFlag?.(MODULE_ID, FLAG_APPLIED);
  if (!data?.actorUuid) return;
  if (root.querySelector(".dt-sea-banner")) return;

  const actor = fromUuidSync(data.actorUuid);
  if (!actor || !stillApplied(actor, data)) return;

  const banner = document.createElement("div");
  banner.classList.add("dt-sea-banner");
  const icon = document.createElement("i");
  icon.classList.add("fa-solid", "fa-circle-check");
  icon.inert = true;
  const text = document.createElement("span");
  text.textContent = format("DT.SpellAutoApply.Banner", { name: data.name ?? actor.name });
  banner.append(icon, text);

  const tray = root.querySelector("effect-application");
  if (tray) tray.insertAdjacentElement("beforebegin", banner);
  else (root.querySelector(".message-content") ?? root).append(banner);
}

/* -------------------------------------------- */
/*  Quick add on the usage card (GM)            */
/* -------------------------------------------- */

/** Write the list setting (GM only — world setting). */
async function writeList(raw) {
  await game.settings.set(MODULE_ID, KEY_WHITELIST, serialiseList(parseList(raw)));
}

/**
 * The item a usage card offers to add: the used activity is self/touch, of an allowed type,
 * references at least one effect, and the item isn't listed yet. Null otherwise.
 */
function quickAddCandidate(message) {
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, KEY_ENABLED)) return null;
  if (message?.type !== "usage") return null;
  const activity = message.getAssociatedActivity?.();
  const item = activity?.item ?? message.getAssociatedItem?.();
  const name = item?.name?.trim();
  if (!activity || !name || listHas(storedList(), name)) return null;
  if (!isAllowedActivity(activity) || !isSelfRange(activity, item)) return null;
  const count = activityEffectCount(activity, item) || (message.system?.effects?.length ?? 0);
  return count > 0 ? name : null;
}

function renderQuickAdd(message, root) {
  if (root.querySelector(".dt-sea-quickadd")) return;
  const name = quickAddCandidate(message);
  if (!name) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("dt-sea-quickadd");
  button.dataset.tooltip = localize("DT.SpellAutoApply.QuickAddHint");
  const icon = document.createElement("i");
  icon.classList.add("fa-solid", "fa-wand-magic-sparkles");
  icon.inert = true;
  const text = document.createElement("span");
  text.textContent = format("DT.SpellAutoApply.QuickAdd", { name });
  button.append(icon, text);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    writeList(addToList(storedList(), name)).then(() => {
      const done = document.createElement("div");
      done.classList.add("dt-sea-quickadd", "dt-sea-quickadd--done");
      const doneIcon = document.createElement("i");
      doneIcon.classList.add("fa-solid", "fa-circle-check");
      doneIcon.inert = true;
      const doneText = document.createElement("span");
      doneText.textContent = format("DT.SpellAutoApply.QuickAdded", { name });
      done.append(doneIcon, doneText);
      button.replaceWith(done);
    }).catch(err => {
      button.disabled = false;
      console.error(`${MODULE_ID} | spell effect auto-apply (quick add) failed`, err);
    });
  });

  // Outside the tray: dnd5e toggles a collapsible tray on any click inside it.
  const tray = root.querySelector("effect-application");
  if (tray) tray.insertAdjacentElement("afterend", button);
  else (root.querySelector(".message-content") ?? root).append(button);
}

function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  try {
    renderBanner(message, root);
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (banner) failed`, err);
  }
  try {
    renderQuickAdd(message, root);
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (quick add) failed`, err);
  }
}

/* -------------------------------------------- */
/*  Item context menu (GM)                      */
/* -------------------------------------------- */

/**
 * `dnd5e.getItemContextOptions(item, menuItems)` — fired by dnd5e's own actor sheets (5.3 and
 * 6.x). dnd5e 6 entries are `{label, icon: "<classes>", visible, onClick}`, dnd5e 5.3 entries
 * `{name, icon: "<i …>", condition, callback}`; we mirror whatever shape the menu uses.
 */
function onGetItemContextOptions(item, menuItems) {
  try {
    if (!game.user?.isGM || !game.settings.get(MODULE_ID, KEY_ENABLED)) return;
    if (!Array.isArray(menuItems) || !nameKey(item?.name)) return;
    const listed = listHas(storedList(), item.name);
    if (!listed && !activitiesOf(item).some(a => isUsableActivity(a, item))) return;

    const label = listed ? "DT.SpellAutoApply.Context.Remove" : "DT.SpellAutoApply.Context.Add";
    const iconClass = listed ? "fa-solid fa-wand-magic" : "fa-solid fa-wand-magic-sparkles";
    const toggle = () => {
      const raw = storedList();
      const next = listHas(raw, item.name) ? removeFromList(raw, item.name) : addToList(raw, item.name);
      writeList(next).then(() => ui.notifications?.info(format(
        listHas(next, item.name) ? "DT.SpellAutoApply.Notify.Added" : "DT.SpellAutoApply.Notify.Removed", { name: item.name })))
        .catch(err => console.error(`${MODULE_ID} | spell effect auto-apply (context menu) failed`, err));
    };
    const legacy = menuItems.length && menuItems.every(e => ("name" in e) && !("label" in e));
    menuItems.push(legacy
      ? { name: label, icon: `<i class="${iconClass}"></i>`, callback: toggle }
      : { label, icon: iconClass, onClick: toggle });
  } catch (err) {
    console.error(`${MODULE_ID} | spell effect auto-apply (context menu) failed`, err);
  }
}

/* -------------------------------------------- */
/*  The list widget in the settings window      */
/* -------------------------------------------- */

/** Every embedded item of the world's actors with whether the actor is a player character. */
function worldItemEntries() {
  const entries = [];
  for (const actor of game.actors ?? []) {
    const pc = (actor.type === "character") && !!actor.hasPlayerOwner;
    for (const item of actor.items ?? []) entries.push({ item, pc });
  }
  return entries;
}

function make(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const GROUP_LABELS = {
  spell: "DT.SpellAutoApply.List.Group.Spells",
  feature: "DT.SpellAutoApply.List.Group.Features",
  item: "DT.SpellAutoApply.List.Group.Items",
  unknown: "DT.SpellAutoApply.List.Group.Unknown"
};
const SUGGEST_LABELS = {
  spells: "DT.SpellAutoApply.List.Suggest.Spells",
  choices: "DT.SpellAutoApply.List.Suggest.Choices",
  features: "DT.SpellAutoApply.List.Suggest.Features",
  items: "DT.SpellAutoApply.List.Suggest.Items"
};
const REASON_LABELS = {
  range: "DT.SpellAutoApply.Status.Range",
  rider: "DT.SpellAutoApply.Status.Rider",
  noEffect: "DT.SpellAutoApply.Status.NoEffect",
  noActivity: "DT.SpellAutoApply.Status.NoActivity"
};

/** Display status of a list entry: {key, icon, short, tooltip}. */
function entryStatus(info, askOn) {
  if (!info) return { key: "unknown", icon: "fa-solid fa-circle-question", short: "",
    tooltip: localize("DT.SpellAutoApply.Status.Unknown") };
  if (info.status === "ok") return { key: "ok", icon: "fa-solid fa-circle-check", short: "",
    tooltip: localize("DT.SpellAutoApply.Status.Ok") };
  if (info.status === "choice") return {
    key: askOn ? "choice" : "never",
    icon: askOn ? "fa-solid fa-list-check" : "fa-solid fa-triangle-exclamation",
    short: format("DT.SpellAutoApply.Status.ChoiceShort", { count: info.count }),
    tooltip: format(askOn ? "DT.SpellAutoApply.Status.Choice" : "DT.SpellAutoApply.Status.ChoiceOff", { count: info.count })
  };
  return { key: "never", icon: "fa-solid fa-ban", short: localize("DT.SpellAutoApply.Status.NeverShort"),
    tooltip: format(REASON_LABELS[info.reason] ?? "DT.SpellAutoApply.Status.NoEffect", { range: info.range || "?" }) };
}

/** Replace the comma-separated text input with the list widget (the input stays the form value). */
function buildListWidget(input) {
  if (input.dataset.dtSeaList) return;
  // Build everything first; only hide the plain input once the widget exists.
  const index = buildIndex(worldItemEntries());
  const askOn = !!game.settings.get(MODULE_ID, KEY_ASK);

  const widget = make("div", { class: "dt-sea-list" });
  const groupsBox = make("div", { class: "dt-sea-list__groups" });
  const datalistId = `dt-sea-candidates-${Math.random().toString(36).slice(2, 8)}`;
  const datalist = make("datalist", { id: datalistId });
  const addInput = make("input", { type: "text", class: "dt-sea-list__input", list: datalistId,
    placeholder: localize("DT.SpellAutoApply.List.AddPlaceholder"), "aria-label": localize("DT.SpellAutoApply.List.AddPlaceholder") });
  const addButton = make("button", { type: "button", class: "dt-sea-list__add" },
    [make("i", { class: "fa-solid fa-plus", inert: "" }), localize("DT.SpellAutoApply.List.Add")]);
  const addRow = make("div", { class: "dt-sea-list__addrow" }, [addInput, datalist, addButton]);
  const suggest = make("details", { class: "dt-sea-list__suggest" });
  widget.append(groupsBox, addRow, suggest);

  const write = raw => {
    input.value = serialiseList(parseList(raw));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    render();
  };
  const addFromField = () => {
    if (!addInput.value.trim()) return;
    write(addToList(input.value, addInput.value));
    addInput.value = "";
    addInput.focus();
  };
  addButton.addEventListener("click", event => { event.preventDefault(); addFromField(); });
  // Enter would submit the settings form.
  addInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    addFromField();
  });

  function chip(name, info) {
    const status = entryStatus(info, askOn);
    const remove = make("button", { type: "button", class: "dt-sea-chip__remove",
      "data-tooltip": localize("DT.SpellAutoApply.List.Remove"), "aria-label": localize("DT.SpellAutoApply.List.Remove") },
    [make("i", { class: "fa-solid fa-xmark", inert: "" })]);
    remove.addEventListener("click", event => { event.preventDefault(); write(removeFromList(input.value, name)); });
    const parts = [make("i", { class: `${status.icon} dt-sea-chip__icon`, inert: "" }), make("span", { class: "dt-sea-chip__name" }, [name])];
    if ((info?.group === "spell") && Number.isFinite(info.level)) {
      parts.push(make("span", { class: "dt-sea-chip__level" },
        [info.level === 0 ? localize("DT.SpellAutoApply.List.Cantrip") : format("DT.SpellAutoApply.List.Level", { level: info.level })]));
    }
    if (status.short) parts.push(make("span", { class: "dt-sea-chip__note" }, [status.short]));
    parts.push(remove);
    return make("li", { class: "dt-sea-chip", "data-status": status.key, "data-tooltip": status.tooltip }, parts);
  }

  function render() {
    const raw = input.value;
    const groups = groupList(raw, index);
    groupsBox.replaceChildren(...(groups.length ? groups.map(({ group, entries }) => make("section", { class: "dt-sea-list__group" }, [
      make("h4", {}, [`${localize(GROUP_LABELS[group])} (${entries.length})`]),
      make("ul", { class: "dt-sea-list__chips" }, entries.map(({ name, info }) => chip(name, info)))
    ])) : [make("p", { class: "dt-sea-list__empty" }, [localize("DT.SpellAutoApply.List.Empty")])]));

    datalist.replaceChildren(...candidatesFromIndex(index, raw).map(name => make("option", { value: name })));

    const missing = missingSuggestions(raw);
    const total = missing.reduce((sum, g) => sum + g.names.length, 0);
    const summary = make("summary", {}, [format("DT.SpellAutoApply.List.Suggestions", { count: total })]);
    if (!total) {
      suggest.replaceChildren(summary, make("p", { class: "dt-sea-list__empty" }, [localize("DT.SpellAutoApply.List.SuggestionsNone")]));
      return;
    }
    const addAll = make("button", { type: "button", class: "dt-sea-list__addall" },
      [make("i", { class: "fa-solid fa-plus", inert: "" }), localize("DT.SpellAutoApply.List.AddAll")]);
    addAll.addEventListener("click", event => {
      event.preventDefault();
      suggest.open = true;
      write(addToList(input.value, ...missing.flatMap(g => g.names)));
    });
    suggest.replaceChildren(summary, ...missing.map(({ group, names }) => make("div", { class: "dt-sea-list__suggestgroup" }, [
      make("span", { class: "dt-sea-list__suggestlabel" }, [localize(SUGGEST_LABELS[group])]),
      ...names.map(name => {
        const info = index.get(nameKey(name));
        const b = make("button", { type: "button", class: "dt-sea-list__suggestion",
          "data-tooltip": entryStatus(info, askOn).tooltip }, [make("i", { class: "fa-solid fa-plus", inert: "" }), name]);
        b.addEventListener("click", event => {
          event.preventDefault();
          suggest.open = true;
          write(addToList(input.value, name));
        });
        return b;
      })
    ])), addAll);
  }

  render();
  input.after(widget);
  input.dataset.dtSeaList = "1";
  // Not the hidden attribute: core's form CSS sets display on inputs (CLAUDE.md CSS gotcha).
  input.style.display = "none";
}

function onRenderSettingsConfig(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const input = root?.querySelector(`[name="${MODULE_ID}.${KEY_WHITELIST}"]`);
    if (input) buildListWidget(input);
  } catch (err) {
    // The plain text input stays usable.
    console.error(`${MODULE_ID} | spell effect auto-apply (settings list) failed`, err);
  }
}

/* -------------------------------------------- */

/** For tools/test-features.mjs only. */
export const internals = { entryStatus, quickAddCandidate, classifyItem };

export default {
  id: "spellEffectAutoApply",
  requiresSystem: "dnd5e",
  category: {
    label: "DT.Categories.SpellEffectAutoApply.Label",
    hint: "DT.Categories.SpellEffectAutoApply.Hint"
  },
  settings: [
    {
      key: KEY_ENABLED,
      options: {
        name: "DT.Settings.SpellAutoApplyEnabled.Name",
        hint: "DT.Settings.SpellAutoApplyEnabled.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_ASK,
      options: {
        name: "DT.Settings.SpellAutoApplyAskChoice.Name",
        hint: "DT.Settings.SpellAutoApplyAskChoice.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_WHITELIST,
      options: {
        name: "DT.Settings.SpellAutoApplyWhitelist.Name",
        hint: "DT.Settings.SpellAutoApplyWhitelist.Hint",
        scope: "world",
        config: true,
        type: String,
        // Only for worlds that never saved the list; existing worlds use the Suggestions.
        default: CURATED_NAMES.join(", ")
      }
    }
  ],
  init() {
    Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
    Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
    Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
    Hooks.on("dnd5e.getItemContextOptions", onGetItemContextOptions);
    Hooks.on("renderSettingsConfig", onRenderSettingsConfig);
  }
};

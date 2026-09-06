import { stableId } from "./ids.mjs";

/**
 * Expands the compact item definitions in src/items into dnd5e Item documents.
 *
 * Covers the three shapes this adventure needs: magic gear that grants a passive
 * bonus (an ActiveEffect that transfers to the wearer), consumables with a use
 * activity, and plain loot.
 */

/** dnd5e / Foundry ActiveEffect change modes. */
const MODE = { ADD: 2, OVERRIDE: 5, UPGRADE: 4 };

function buildEffect(def, itemId) {
  const effectId = stableId(`effect:${itemId}:${def.name}`);
  return {
    _id: effectId,
    name: def.name,
    img: def.img,
    changes: def.changes.map(c => ({
      key: c.key,
      mode: MODE[c.mode ?? "ADD"],
      value: String(c.value),
      priority: c.priority ?? 20
    })),
    disabled: false,
    // transfer: the effect applies to whoever carries/attunes the item, rather
    // than needing to be applied from a chat card.
    transfer: true,
    duration: {},
    description: def.description ? `<p>${def.description}</p>` : "",
    origin: null,
    tint: "#ffffff",
    statuses: []
  };
}

function buildUseActivity(def, itemId) {
  const activityId = stableId(`activity:${itemId}:use`);
  const use = def.use;
  const activity = {
    _id: activityId,
    type: use.heal ? "heal" : "utility",
    sort: 0,
    activation: { type: use.activation ?? "action", value: 1 },
    consumption: {
      targets: use.consumesSelf
        ? [{ type: "itemUses", target: "", value: "1", scaling: { mode: "" } }]
        : [],
      scaling: { allowed: false },
      spellSlot: false
    },
    range: { units: "self" },
    target: { affects: { type: "self" } }
  };
  if (use.heal) {
    activity.healing = {
      number: use.heal.number,
      denomination: use.heal.denom,
      bonus: String(use.heal.bonus ?? ""),
      types: [use.heal.type ?? "healing"],
      custom: { enabled: false, formula: "" },
      scaling: { number: 1 }
    };
  }
  return { [activityId]: activity };
}

/**
 * @param {object} def   An item definition from src/items.
 * @returns {object}     A dnd5e Item document ready to be packed.
 */
export function buildItem(def) {
  const itemId = def.id ?? stableId(`item:${def.key}`);

  const system = {
    description: {
      value: def.description,
      chat: def.chat ?? ""
    },
    identified: true,
    quantity: def.quantity ?? 1,
    rarity: def.rarity ?? "",
    attunement: def.attunement ? "required" : "",
    attuned: false,
    equipped: false,
    weight: { value: def.weight ?? 0, units: "lb" },
    price: { value: def.price ?? 0, denomination: "gp" },
    properties: def.properties ?? [],
    source: { rules: "2024", revision: 1, custom: "Die Höhlen von Blackthorn" }
  };

  if (def.type === "weapon") {
    system.type = { value: def.weaponType ?? "simpleM", baseItem: def.baseItem ?? "" };
    system.damage = {
      base: {
        number: def.damage.number,
        denomination: def.damage.denom,
        bonus: String(def.damage.bonus ?? ""),
        types: [def.damage.type],
        custom: { enabled: false, formula: "" },
        scaling: { number: 1 }
      }
    };
    system.magicalBonus = def.magicalBonus ?? null;
    system.range = { value: null, long: null, units: "ft", reach: def.reach ?? 5 };
    system.activities = {
      [stableId(`activity:${itemId}:attack`)]: {
        _id: stableId(`activity:${itemId}:attack`),
        type: "attack",
        sort: 0,
        activation: { type: "action", value: 1 },
        attack: {
          ability: "",
          bonus: "",
          flat: false,
          type: { value: "melee", classification: "weapon" }
        },
        damage: { includeBase: true, parts: [] },
        range: { value: String(def.reach ?? 5), units: "ft" },
        target: { affects: { count: "1", type: "creature" } }
      }
    };
  } else if (def.type === "equipment") {
    system.type = { value: def.equipmentType ?? "trinket", baseItem: "" };
    system.armor = { value: null, magicalBonus: def.magicalBonus ?? null };
  } else if (def.type === "consumable") {
    system.type = { value: def.consumableType ?? "potion", subtype: "" };
    system.uses = {
      max: "1",
      spent: 0,
      autoDestroy: true,
      recovery: []
    };
  }

  if (def.use) system.activities = { ...(system.activities ?? {}), ...buildUseActivity(def, itemId) };

  return {
    _id: itemId,
    name: def.name,
    type: def.type,
    img: def.img,
    system,
    effects: (def.effects ?? []).map(e => buildEffect(e, itemId)),
    folder: def.folder ?? null,
    sort: def.sort ?? 0,
    flags: { "caverns-of-blackthorn": { key: def.key } }
  };
}

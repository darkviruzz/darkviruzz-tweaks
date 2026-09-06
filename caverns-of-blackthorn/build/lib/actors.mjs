import { stableId } from "./ids.mjs";

/**
 * Expands the compact creature definitions in src/creatures into full dnd5e NPC
 * documents.
 *
 * Only fields that differ from the schema default are emitted: Foundry fills the
 * rest in from the DataModel when the pack is loaded, so writing the complete
 * ~600-line boilerplate of a real SRD actor buys nothing.
 */

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

const SIZE_TO_TOKEN = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

/** CR -> XP, mirroring CONFIG.DND5E.CR_EXP_LEVELS. */
const CR_XP = new Map([
  [0, 10], [0.125, 25], [0.25, 50], [0.5, 100], [1, 200], [2, 450], [3, 700],
  [4, 1100], [5, 1800], [6, 2300], [7, 2900], [8, 3900], [9, 5000], [10, 5900],
  [11, 7200], [12, 8400], [13, 10000], [14, 11500], [15, 13000], [16, 15000],
  [17, 18000], [18, 20000], [19, 22000], [20, 25000]
]);

export function xpForCR(cr) {
  return CR_XP.get(cr) ?? 10;
}

/** Proficiency bonus by CR (2024 rules: +2 up to CR 4, then +1 per 4 CR). */
export function proficiencyForCR(cr) {
  if (cr < 5) return 2;
  return Math.floor((cr - 1) / 4) + 2;
}

function abilityMod(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * Damage description enrichers. dnd5e renders `[[/attack extended]]` and
 * `[[/damage average extended]]` into the "+6 to hit, reach 5 ft." / "12
 * (2d8 + 3) Slashing damage" text the statblock shows, computed from the
 * activity — so the numbers can never drift out of sync with the mechanics.
 */
const ATTACK_DESC = "<p>[[/attack extended]]. [[/damage average extended]].</p>";

function makeAttackActivity(action, { id }) {
  const isRanged = action.kind === "ranged";
  const damage = action.damage;
  return {
    [id]: {
      _id: id,
      type: "attack",
      sort: 0,
      activation: { type: "action", value: 1 },
      attack: {
        ability: action.ability ?? "",
        bonus: "",
        flat: false,
        type: {
          value: isRanged ? "ranged" : "melee",
          classification: action.classification ?? "weapon"
        }
      },
      damage: { includeBase: true, parts: (action.extraDamage ?? []).map(expandDamagePart) },
      range: isRanged
        ? { value: String(action.range ?? 80), long: String(action.long ?? 320), units: "ft" }
        : { value: String(action.reach ?? 5), units: "ft" },
      target: { affects: { count: "1", type: "creature" } },
      ...(damage?.onHit ? { description: { chatFlavor: damage.onHit } } : {})
    }
  };
}

function expandDamagePart(part) {
  return {
    number: part.number ?? null,
    denomination: part.denom ?? null,
    bonus: part.bonus != null ? String(part.bonus) : "",
    types: part.type ? [part.type] : [],
    custom: { enabled: false, formula: "" },
    scaling: { number: 1 }
  };
}

/** A weapon item carrying one attack activity. */
function makeWeapon(action, actorId, sort) {
  const itemId = stableId(`item:${actorId}:${action.name}`);
  const activityId = stableId(`activity:${actorId}:${action.name}`);
  return {
    _id: itemId,
    name: action.name,
    type: "weapon",
    img: action.img ?? "icons/skills/melee/blade-tip-orange.webp",
    sort,
    system: {
      description: { value: action.text ? `${ATTACK_DESC}<p>${resolveItemRefs(action.text, actorId)}</p>` : ATTACK_DESC },
      equipped: true,
      identified: true,
      quantity: 1,
      proficient: null,
      type: { value: action.kind === "ranged" ? "simpleR" : "simpleM", baseItem: action.baseItem ?? "" },
      properties: action.properties ?? [],
      damage: { base: expandDamagePart(action.damage) },
      range:
        action.kind === "ranged"
          ? { value: action.range ?? 80, long: action.long ?? 320, units: "ft", reach: null }
          : { value: null, long: null, units: "ft", reach: action.reach ?? 5 },
      activities: makeAttackActivity(action, { id: activityId }),
      source: { rules: "2024", revision: 1, custom: "Caverns of Blackthorn" }
    }
  };
}

/** A feat item: either a passive trait or an active ability with a save/utility. */
function makeFeat(entry, actorId, sort, { passive }) {
  const itemId = stableId(`item:${actorId}:${entry.name}`);
  const item = {
    _id: itemId,
    name: entry.name,
    type: "feat",
    img: entry.img ?? (passive ? "icons/magic/symbols/rune-sigil-black-pink.webp" : "icons/skills/melee/strike-flail-destructive-yellow.webp"),
    sort,
    system: {
      description: { value: `<p>${resolveItemRefs(entry.text, actorId)}</p>` },
      type: { value: "monster", subtype: "" },
      properties: passive ? ["trait"] : [],
      identifier: slugify(entry.name),
      activities: {},
      source: { rules: "2024", revision: 1, custom: "Caverns of Blackthorn" }
    }
  };
  if (entry.requirements) item.system.requirements = entry.requirements;
  if (entry.uses) {
    item.system.uses = {
      max: String(entry.uses.max),
      spent: 0,
      recovery: [{ period: entry.uses.per ?? "day", type: "recoverAll", formula: "" }]
    };
  }

  if (!passive) {
    const activityId = stableId(`activity:${actorId}:${entry.name}`);
    if (entry.save) {
      item.system.activities = {
        [activityId]: {
          _id: activityId,
          type: "save",
          sort: 0,
          activation: { type: entry.activation ?? "action", value: 1 },
          save: {
            ability: [entry.save.ability],
            dc: { calculation: "", formula: String(entry.save.dc) }
          },
          damage: {
            onSave: entry.save.onSave ?? "half",
            parts: (entry.save.damage ?? []).map(expandDamagePart)
          },
          range: entry.range ? { value: String(entry.range), units: "ft" } : { units: "self" },
          target: entry.target ?? { affects: { count: "1", type: "creature" } },
          ...(entry.effects ? { effects: entry.effects } : {})
        }
      };
    } else {
      item.system.activities = {
        [activityId]: {
          _id: activityId,
          type: "utility",
          sort: 0,
          activation: { type: entry.activation ?? "action", value: 1 },
          range: entry.range ? { value: String(entry.range), units: "ft" } : { units: "self" },
          target: entry.target ?? { affects: { type: "self" } }
        }
      };
    }
  }
  return item;
}

/**
 * Resolves `{{item:Name}}` placeholders to dnd5e's `[[/item .<id>]]` enricher.
 *
 * Multiattack entries need to point at the actor's own attack items by id, but
 * those ids are generated here — so the definitions name the attack and this
 * rewrites it into the reference dnd5e renders as a clickable roll.
 */
function resolveItemRefs(text, actorId) {
  return text.replace(/\{\{item:([^}]+)\}\}/g, (_, name) => `[[/item .${stableId(`item:${actorId}:${name.trim()}`)}]]`);
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Guards against the two mistakes that would otherwise ship silently.
 *
 * 1. An explicit damage `bonus` equal to the attack ability's modifier. dnd5e
 *    adds that modifier to base weapon damage itself, so writing it out again
 *    doubles it — and the statblock still *looks* right, because the enricher
 *    prints the doubled number as if it were intended.
 * 2. A `{{item:Name}}` reference (multiattack, rider effects) naming an item the
 *    creature does not have. The placeholder still resolves — to the id of an
 *    item that does not exist — leaving a dead link in the rendered statblock.
 */
function validate(def) {
  const problems = [];
  const own = new Set((def.actions ?? []).map(a => a.name));

  for (const action of def.actions ?? []) {
    const bonus = action.damage?.bonus;
    if (bonus != null && action.ability) {
      const mod = abilityMod(def.abilities[action.ability]);
      if (Number(bonus) === mod) {
        problems.push(
          `${action.name}: damage bonus ${bonus} duplicates the ${action.ability} modifier ` +
          `(dnd5e adds it automatically) — drop the bonus or set it to the extra amount only`
        );
      }
    }
  }

  const texts = [...(def.traits ?? []), ...(def.actions ?? [])].map(e => e.text ?? "");
  for (const text of texts) {
    for (const [, name] of text.matchAll(/\{\{item:([^}]+)\}\}/g)) {
      if (!own.has(name.trim())) {
        problems.push(`references {{item:${name.trim()}}}, which this creature does not have`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`Creature "${def.key}":\n  - ${problems.join("\n  - ")}`);
  }
}

/**
 * @param {object} def   A creature definition from src/creatures.
 * @returns {object}     A dnd5e NPC actor document ready to be packed.
 */
export function buildActor(def) {
  validate(def);
  const actorId = def.id ?? stableId(`actor:${def.key}`);
  const prof = proficiencyForCR(def.cr);

  const abilities = {};
  for (const key of ABILITIES) {
    abilities[key] = { value: def.abilities[key] };
    if (def.saves?.includes(key)) abilities[key].proficient = 1;
  }

  const skills = {};
  for (const [skill, value] of Object.entries(def.skills ?? {})) {
    skills[skill] = { value };
  }

  const items = [];
  let sort = 0;
  for (const trait of def.traits ?? []) {
    items.push(makeFeat(trait, actorId, (sort += 100000), { passive: true }));
  }
  for (const action of def.actions ?? []) {
    items.push(
      action.kind === "ability"
        ? makeFeat(action, actorId, (sort += 100000), { passive: false })
        : makeWeapon(action, actorId, (sort += 100000))
    );
  }

  const tokenSize = SIZE_TO_TOKEN[def.size] ?? 1;

  return {
    _id: actorId,
    name: def.name,
    type: "npc",
    img: def.img ?? "icons/svg/mystery-man.svg",
    items,
    effects: [],
    folder: def.folder ?? null,
    system: {
      abilities,
      skills,
      attributes: {
        ac: { flat: def.ac, calc: def.acCalc ?? "flat" },
        hp: { value: def.hp.value, max: def.hp.value, formula: def.hp.formula },
        movement: { ...def.speed, units: "ft" },
        senses: {
          units: "ft",
          special: def.senses?.special ?? "",
          ranges: {
            darkvision: def.senses?.darkvision ?? null,
            blindsight: def.senses?.blindsight ?? null,
            tremorsense: def.senses?.tremorsense ?? null,
            truesight: def.senses?.truesight ?? null
          }
        },
        init: { ability: "dex", bonus: "" }
      },
      details: {
        biography: { value: def.description ? `<p>${def.description}</p>` : "", public: "" },
        alignment: def.alignment ?? "",
        type: { value: def.type, subtype: def.subtype ?? "", swarm: "", custom: "" },
        cr: def.cr,
        source: { rules: "2024", revision: 1, custom: "Die Höhlen von Blackthorn" }
      },
      traits: {
        size: def.size,
        languages: { value: def.languages ?? [], custom: def.languagesCustom ?? "" },
        ci: { value: def.conditionImmunities ?? [], custom: "" },
        di: { value: def.damageImmunities ?? [], custom: "", bypasses: [] },
        dr: { value: def.damageResistances ?? [], custom: "", bypasses: [] },
        dv: { value: def.damageVulnerabilities ?? [], custom: "", bypasses: [] }
      },
      resources: {
        legact: { max: 0, spent: 0 },
        legres: { max: 0, spent: 0 },
        lair: { value: false, initiative: null }
      }
    },
    prototypeToken: {
      name: def.tokenName ?? def.name,
      displayName: 20,
      displayBars: 40,
      actorLink: def.actorLink ?? false,
      width: tokenSize,
      height: tokenSize,
      disposition: def.disposition ?? -1,
      sight: { enabled: false },
      bar1: { attribute: "attributes.hp" },
      texture: { src: def.tokenImg ?? def.img ?? "icons/svg/mystery-man.svg", scaleX: 1, scaleY: 1 }
    },
    flags: {
      "caverns-of-blackthorn": { key: def.key, xp: xpForCR(def.cr), proficiency: prof }
    }
  };
}

export { ABILITIES, abilityMod };

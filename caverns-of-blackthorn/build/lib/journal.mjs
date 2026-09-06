import { stableId } from "./ids.mjs";

/**
 * Expands the journal sources into Foundry JournalEntry documents.
 *
 * The interesting part is `encounters`: a page declares which creatures stand in
 * a room and how many, and this renders the roster table, the linked statblocks
 * and the XP total — computed, never typed. The original adventure's populations
 * are large enough that hand-totalling them would be wrong within one edit.
 */

const MODULE = "caverns-of-blackthorn";
const ACTOR_PACK = `Compendium.${MODULE}.blackthorn-actors.Actor`;
const ITEM_PACK = `Compendium.${MODULE}.blackthorn-items.Item`;

/**
 * XP budget per character by level, from the 2024 DMG encounter tables
 * (verified against CONFIG.DND5E.ENCOUNTER_DIFFICULTY in dnd5e 5.3.3).
 * Index = character level; each entry is [low, moderate, high].
 */
const ENCOUNTER_DIFFICULTY = [
  [0, 0, 0],
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500],
  [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100],
  [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100], [2200, 3700, 4700],
  [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800],
  [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]
];

function budgetFor(level, size) {
  const [low, moderate, high] = ENCOUNTER_DIFFICULTY[level];
  return { low: low * size, moderate: moderate * size, high: high * size };
}

/** Where an XP total falls relative to the party's budget. */
function rate(xp, budget) {
  if (xp < budget.low) return { label: "unterhalb Niedrig", cls: "trivial" };
  if (xp < budget.moderate) return { label: "Niedrig", cls: "low" };
  if (xp < budget.high) return { label: "Mittel", cls: "moderate" };
  if (xp <= budget.high * 2) return { label: "Hoch", cls: "high" };
  return { label: "tödlich — nicht als Kampf gedacht", cls: "deadly" };
}

function fmt(n) {
  return n.toLocaleString("de-DE");
}

function actorLink(entry) {
  return `@UUID[${ACTOR_PACK}.${entry.id}]{${entry.name}}`;
}

function crLabel(cr) {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

/**
 * Renders one encounter: roster table with linked statblocks, XP total and how
 * that total sits against the party budget.
 */
function renderEncounter(enc, { bestiary, party }) {
  const budget = budgetFor(party.level, party.size);
  const rows = [];
  let total = 0;

  for (const line of enc.creatures) {
    const beast = bestiary.get(line.key);
    if (!beast) throw new Error(`Encounter "${enc.name}" references unknown creature "${line.key}"`);
    const subtotal = beast.xp * line.count;
    total += subtotal;
    rows.push(
      `<tr><td style="text-align:right">${line.count}&times;</td>` +
      `<td>${actorLink(beast)}</td>` +
      `<td style="text-align:center">${crLabel(beast.cr)}</td>` +
      `<td style="text-align:right">${fmt(beast.xp)}</td>` +
      `<td style="text-align:right">${fmt(subtotal)}</td></tr>`
    );
  }

  const verdict = rate(total, budget);
  const note = enc.note ? `<p>${enc.note}</p>` : "";

  return `
<section class="cob-encounter">
  <h3>${enc.name}</h3>
  ${note}
  <table>
    <thead><tr><th>Anz.</th><th>Kreatur</th><th>HG</th><th>XP</th><th>Summe</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
    <tfoot><tr><th colspan="4" style="text-align:right">Gesamt</th><th style="text-align:right">${fmt(total)} XP</th></tr></tfoot>
  </table>
  <p class="cob-verdict"><strong>Für ${party.size}&times; Stufe ${party.level}:</strong> ${verdict.label}
  <span class="cob-budget">(Budget: niedrig ${fmt(budget.low)} · mittel ${fmt(budget.moderate)} · hoch ${fmt(budget.high)} XP)</span></p>
</section>`.trim();
}

/** Renders the scaling block: same encounter, three party strengths. */
function renderScaling(scaling, { bestiary }) {
  const cols = scaling.steps.map(step => {
    const parts = step.creatures.map(l => {
      const beast = bestiary.get(l.key);
      if (!beast) throw new Error(`Scaling step references unknown creature "${l.key}"`);
      return `${l.count}&times; ${beast.name}`;
    });
    return `<tr><td><strong>${step.for}</strong></td><td>${parts.join(", ")}</td></tr>`;
  });
  return `
<section class="cob-scaling">
  <h4>Skalierung</h4>
  <table><tbody>${cols.join("")}</tbody></table>
</section>`.trim();
}

/**
 * Rewrites the shorthand link syntax used in the journal prose:
 *   [[creature:key]]  -> a linked statblock
 *   [[item:key]]      -> a linked item
 * so the source text stays readable and the ids stay generated.
 */
function resolveLinks(html, { bestiary }) {
  return html
    .replace(/\[\[creature:([a-z0-9-]+)\]\]/g, (_, key) => {
      const beast = bestiary.get(key);
      if (!beast) throw new Error(`Journal references unknown creature "${key}"`);
      return actorLink(beast);
    })
    .replace(/\[\[item:([a-z0-9-]+)\]\]/g, (_, key) => `@UUID[${ITEM_PACK}.${stableId(`item:${key}`)}]`);
}

/**
 * @param {object} def            A journal definition from src/journal.
 * @param {object} ctx
 * @param {Map} ctx.bestiary      key -> {id, name, cr, xp}
 * @returns {object}              A Foundry JournalEntry document.
 */
export function buildJournal(def, { bestiary }) {
  const entryId = def.id ?? stableId(`journal:${def.key}`);
  const party = def.party ?? { level: 7, size: 4 };

  const pages = def.pages.map((page, index) => {
    const pageId = stableId(`page:${def.key}:${page.key}`);
    let content = resolveLinks(page.content ?? "", { bestiary });

    for (const enc of page.encounters ?? []) {
      content += "\n" + renderEncounter(enc, { bestiary, party });
    }
    if (page.scaling) content += "\n" + renderScaling(page.scaling, { bestiary });
    if (page.after) content += "\n" + resolveLinks(page.after, { bestiary });

    return {
      _id: pageId,
      name: page.name,
      type: "text",
      title: { show: true, level: page.level ?? 1 },
      text: { format: 1, content },
      image: {},
      video: { controls: true, volume: 0.5 },
      src: null,
      system: {},
      sort: (index + 1) * 100000,
      ownership: { default: page.playerVisible ? 2 : -1 },
      flags: { [MODULE]: { key: page.key, area: page.area ?? null } }
    };
  });

  return {
    _id: entryId,
    name: def.name,
    pages,
    folder: def.folder ?? null,
    sort: def.sort ?? 0,
    ownership: { default: 0 },
    flags: { [MODULE]: { key: def.key, party } }
  };
}

export { budgetFor, ENCOUNTER_DIFFICULTY };

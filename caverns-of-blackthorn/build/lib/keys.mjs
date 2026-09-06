/**
 * Assigns the `_key` fields the Foundry CLI needs to pack a document.
 *
 * The CLI's packer does `if (!doc._key) continue` — a document without a key is
 * skipped in silence, producing an empty pack and a successful exit code. So
 * every document AND every embedded document has to carry one.
 *
 * Key format is `!<collection path>!<id path>`, both joined with ".", e.g.
 *   !actors!ACTORID
 *   !actors.items!ACTORID.ITEMID
 *   !actors.items.effects!ACTORID.ITEMID.EFFECTID
 *
 * This mirrors the CLI's own HIERARCHY table (lib/package.mjs). Adventures are
 * deliberately absent from it: their contents stay inline in the stored value
 * rather than becoming separate keys, which is what makes a one-click import
 * possible.
 */

const HIERARCHY = {
  actors: { items: [], effects: [] },
  cards: { cards: [] },
  combats: { combatants: [], groups: [] },
  delta: { items: [], effects: [] },
  effects: {},
  items: { effects: [] },
  journal: { pages: [], categories: [] },
  playlists: { sounds: [] },
  regions: { behaviors: [] },
  tables: { results: [] },
  tokens: { delta: {} },
  scenes: {
    drawings: [], tokens: [], levels: [], lights: [], notes: [],
    regions: [], sounds: [], templates: [], tiles: [], walls: []
  }
};

function join(prefix, part) {
  return prefix ? `${prefix}.${part}` : part;
}

/**
 * Recursively stamps `_key` onto a document and everything embedded in it.
 *
 * @param {object} doc          The document to key, modified in place.
 * @param {string} collection   Collection name, e.g. "actors" or "adventures".
 * @param {object} [prefixes]   Internal: accumulated collection and id paths.
 * @returns {object}            The same document, for chaining.
 */
export function assignKeys(doc, collection, { sublevelPrefix = "", idPrefix = "" } = {}) {
  const sublevel = join(sublevelPrefix, collection);
  const id = join(idPrefix, doc._id);
  doc._key = `!${sublevel}!${id}`;

  for (const [embeddedName, type] of Object.entries(HIERARCHY[collection] ?? {})) {
    const value = doc[embeddedName];
    if (Array.isArray(type) && Array.isArray(value)) {
      for (const child of value) {
        assignKeys(child, embeddedName, { sublevelPrefix: sublevel, idPrefix: id });
      }
    } else if (value && !Array.isArray(type)) {
      assignKeys(value, embeddedName, { sublevelPrefix: sublevel, idPrefix: id });
    }
  }
  return doc;
}

export { HIERARCHY };

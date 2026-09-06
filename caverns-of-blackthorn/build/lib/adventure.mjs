import { stableId } from "./ids.mjs";

/**
 * Bundles everything into a single Adventure document.
 *
 * An Adventure is what makes this a one-click install: the GM opens the
 * compendium, hits Import, and the scene, journal, creatures and treasure land in
 * the world in their folders, with the scene's tokens still pointing at the
 * imported actors. Shipping the packs alone would leave that assembly to the GM.
 */

const MODULE = "caverns-of-blackthorn";

/** Sidebar folders created by the import, so nothing lands loose in the tree. */
function folders() {
  return [
    { _id: stableId("folder:actors"), name: "Blackthorn — Kreaturen", type: "Actor", sorting: "m", color: "#4a2c1a", sort: 100000, folder: null, description: "" },
    { _id: stableId("folder:items"), name: "Blackthorn — Hort", type: "Item", sorting: "m", color: "#4a2c1a", sort: 100000, folder: null, description: "" },
    { _id: stableId("folder:journal"), name: "Die Höhlen von Blackthorn", type: "JournalEntry", sorting: "m", color: "#4a2c1a", sort: 100000, folder: null, description: "" },
    { _id: stableId("folder:scenes"), name: "Die Höhlen von Blackthorn", type: "Scene", sorting: "m", color: "#4a2c1a", sort: 100000, folder: null, description: "" }
  ];
}

export function buildAdventure({ actors, items, journals, scenes }) {
  const folderList = folders();
  const byType = Object.fromEntries(folderList.map(f => [f.type, f._id]));

  // Deep-clone into the adventure. A shallow spread would share the embedded
  // arrays (an actor's items, a journal's pages) with the standalone packs, so
  // keying one pack would stamp `_key` fields into the other's documents and the
  // build would only be correct in one particular order.
  const inFolder = (docs, type) =>
    docs.map(d => ({ ...structuredClone(d), folder: byType[type] }));

  return {
    _id: stableId("adventure:blackthorn"),
    name: "Die Höhlen von Blackthorn",
    img: `modules/${MODULE}/assets/maps/blackthorn-banner.webp`,
    caption: "Ein Humanoiden-Hort unter dem Gnarley-Forst — konvertiert für D&D 2024.",
    description: `
<p>Südöstlich von Dyvers, tief unter dem Gnarley-Forst, liegt der Bau von Blackthorn:
mehrere hundert Orks, Gnolle und Oger, eine Fontäne aus leuchtendem Wasser, die jede
Wunde schließt, und eine Duergar-Gesandtschaft mit eigenen Plänen.</p>
<p><strong>Der Import legt an:</strong> die Karte als Szene mit Beleuchtung und
vorbereiteten Begegnungen, das Abenteuer als Journal mit allen sieben Bereichen,
15 Statblocks nach 2024er Bauweise und den Hort des Oger-Häuptlings.</p>
<p><em>Gerechnet für vier Charaktere auf Stufe 7. Fan-Konvertierung, kein offizielles
Produkt.</em></p>`.trim(),
    sort: 0,
    folder: null,
    actors: inFolder(actors, "Actor"),
    items: inFolder(items, "Item"),
    journal: inFolder(journals, "JournalEntry"),
    scenes: inFolder(scenes, "Scene"),
    folders: folderList,
    combats: [],
    macros: [],
    cards: [],
    playlists: [],
    tables: [],
    flags: { [MODULE]: { version: 1 } }
  };
}

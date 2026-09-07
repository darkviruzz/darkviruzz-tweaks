import { stableId } from "./ids.mjs";

/**
 * Builds the Foundry Scene from a compact declaration.
 *
 * Coordinates in src/scene are given in MAP CELLS of the original survey — one
 * cell is 10 ft, matching the "One Square Equals 10 Feet" note on the map. They
 * are converted to pixels here, so replacing the background image later only
 * means changing `grid.size` and the cell offsets in one place instead of
 * recomputing every token and note position by hand.
 */

const MODULE = "caverns-of-blackthorn";

/** dnd5e/Foundry light animation and darkness defaults for a plain light source. */
function light({ dim, bright, color, alpha = 0.4, animation = null, luminosity = 0.5 }) {
  return {
    negative: false,
    priority: 0,
    alpha,
    angle: 360,
    bright,
    color,
    coloration: 1,
    dim,
    attenuation: 0.5,
    luminosity,
    saturation: 0,
    contrast: 0,
    shadows: 0,
    animation: animation ?? { type: null, speed: 5, intensity: 5, reverse: false },
    darkness: { min: 0, max: 1 }
  };
}

/**
 * Lays `count` tokens out around an anchor in a loose spiral rather than a rigid
 * block, so a guard post looks like creatures standing around a cavern instead
 * of a parade formation. Deterministic: same input, same layout on every build.
 */
function formation({ around, count, spacing = 1.4, jitter = 0.35, seed = 1 }) {
  const [ax, ay] = around;
  const out = [];
  // Golden-angle spiral: even spacing without the rings lining up.
  const golden = Math.PI * (3 - Math.sqrt(5));
  let rand = seed * 9301 + 49297;
  const next = () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280;
  };
  for (let i = 0; i < count; i++) {
    const r = spacing * Math.sqrt(i + 0.5);
    const a = i * golden;
    out.push([
      ax + r * Math.cos(a) + (next() - 0.5) * jitter,
      ay + r * Math.sin(a) + (next() - 0.5) * jitter
    ]);
  }
  return out;
}

export function buildScene(def, { bestiary, journals }) {
  const sceneId = def.id ?? stableId(`scene:${def.key}`);

  // One 10 ft map cell -> pixels. The scene grid is half of this, because dnd5e
  // works in 5 ft squares and a Medium token must occupy one of them.
  const cellPx = def.cellPixels;
  const gridSize = cellPx / 2;
  const toPx = ([cx, cy]) => [Math.round(cx * cellPx), Math.round(cy * cellPx)];

  // Pins bind to whichever journal actually carries area-tagged pages, not to
  // journals[0] — otherwise adding a second journal entry silently repoints every
  // pin at the wrong document depending on filename sort order.
  const journal = journals.find(j => j.pages.some(p => p.flags?.[MODULE]?.area != null)) ?? journals[0];
  const pageIdFor = area => journal?.pages.find(p => p.flags?.[MODULE]?.area === area)?._id ?? null;

  const tokens = [];
  for (const group of def.tokens ?? []) {
    const beast = bestiary.get(group.key);
    if (!beast) throw new Error(`Scene token references unknown creature "${group.key}"`);
    const placements = group.at ?? formation(group);
    placements.forEach((cell, i) => {
      const [x, y] = toPx(cell);
      tokens.push({
        _id: stableId(`token:${def.key}:${group.key}:${i}`),
        name: beast.name,
        actorId: beast.id,
        actorLink: false,
        x,
        y,
        elevation: 0,
        width: group.size ?? beast.size ?? 1,
        height: group.size ?? beast.size ?? 1,
        texture: { src: group.img ?? beast.img ?? "icons/svg/mystery-man.svg", scaleX: 1, scaleY: 1, tint: "#ffffff" },
        disposition: -1,
        displayName: 20,
        displayBars: 40,
        bar1: { attribute: "attributes.hp" },
        sight: { enabled: false },
        hidden: group.hidden ?? true,
        flags: { [MODULE]: { area: group.area ?? null } }
      });
    });
  }

  const lights = (def.lights ?? []).map((l, i) => {
    const [x, y] = toPx(l.at);
    return {
      _id: stableId(`light:${def.key}:${i}`),
      x,
      y,
      rotation: 0,
      walls: true,
      vision: false,
      hidden: false,
      config: light(l),
      flags: { [MODULE]: { note: l.note ?? "" } }
    };
  });

  const notes = (def.notes ?? []).map(n => {
    const [x, y] = toPx(n.at);
    return {
      _id: stableId(`note:${def.key}:${n.area}`),
      entryId: journal?._id ?? null,
      pageId: pageIdFor(n.area),
      x,
      y,
      texture: { src: n.icon ?? "icons/svg/book.svg", tint: n.tint ?? "#ffcc66" },
      iconSize: 48,
      text: n.label,
      fontSize: 32,
      textAnchor: 1,
      textColor: "#ffffff",
      global: false,
      flags: { [MODULE]: { area: n.area } }
    };
  });

  return {
    _id: sceneId,
    name: def.name,
    active: false,
    navigation: true,
    navName: def.navName ?? def.name,
    background: { src: def.background, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, tint: null },
    width: def.widthCells * cellPx,
    height: def.heightCells * cellPx,
    padding: 0.05,
    initial: def.initial
      ? { x: Math.round(def.initial.at[0] * cellPx), y: Math.round(def.initial.at[1] * cellPx), scale: def.initial.scale ?? 0.3 }
      : null,
    backgroundColor: def.backgroundColor ?? "#0a0a0a",
    grid: {
      type: 1,
      size: gridSize,
      style: "solidLines",
      thickness: 1,
      color: def.gridColor ?? "#000000",
      alpha: def.gridAlpha ?? 0.12,
      distance: 5,
      units: "ft"
    },
    tokenVision: def.tokenVision ?? true,
    fog: { exploration: true, overlay: null, colors: { explored: null, unexplored: null } },
    environment: {
      darknessLevel: def.darkness ?? 1,
      darknessLock: false,
      globalLight: { enabled: false, alpha: 0.5, bright: false, color: null, coloration: 1, luminosity: 0.5, saturation: 0, contrast: 0, shadows: 0, darkness: { min: 0, max: 1 } },
      cycle: false,
      base: { hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0 },
      dark: { hue: 0, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0 }
    },
    tokens,
    lights,
    notes,
    walls: def.walls ?? [],
    sounds: [],
    templates: [],
    tiles: [],
    drawings: [],
    regions: [],
    folder: def.folder ?? null,
    sort: def.sort ?? 0,
    ownership: { default: 0 },
    flags: { [MODULE]: { key: def.key, cellPixels: cellPx } }
  };
}

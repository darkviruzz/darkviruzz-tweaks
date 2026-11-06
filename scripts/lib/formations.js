/**
 * Formation geometry for the Token Formation feature — pure functions, no Foundry globals.
 *
 * Every token is a circle with radius r (half its larger side, in px). Two tokens i and j may
 * stand no closer than (r_i + r_j) × spacing, centre to centre: spacing 1 = they touch (two
 * Medium tokens 5 ft apart), 0.5 = crowded (half overlapping), 2 = one token's width of room in
 * between — and a Large creature automatically keeps a larger distance than a Medium one.
 *
 * Formations (local frame: x to the right, the FRONT is -y; rotated by `rotation` degrees
 * clockwise and centred on `anchor`):
 *   - block:  rows of `columns` places (auto ≈ square, rather wider than deep), filled front to
 *             back, each row from the middle outwards;
 *   - hex:    honeycomb around the centre (the most compact blob), filled from the centre out;
 *   - circle: one ring, each token taking an arc as wide as itself;
 *   - crowd:  random places without overlap (seeded, so the preview stays still until reshuffled).
 *
 * Block, hex and crowd generate an ordered list of CANDIDATE places on a lattice whose step is
 * the smallest token's distance; tokens are then placed one by one on the first free candidate
 * that keeps every distance and passes `valid` (walls, scene bounds). Order modes:
 *   - nearest (default): largest first (they need the room), each choosing — among as many of the
 *     next free candidates as there are tokens left — the one closest to where it stands now;
 *     afterwards tokens of the same size swap places while that shortens the total way;
 *   - largeFirst: larger creatures take the first places (centre / front rows);
 *   - largeLast:  smaller creatures first (centre / front), larger ones outside / behind.
 */

export const TYPES = ["block", "hex", "circle", "crowd"];
export const ORDERS = ["nearest", "largeFirst", "largeLast"];

const EPS = 1e-6;
const SQRT3_2 = Math.sqrt(3) / 2;

/** Deterministic PRNG (mulberry32). */
export function random(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Rotate a local point by `deg` (clockwise on screen, y down) and move it to `anchor`. */
export function toWorld(point, anchor, deg) {
  const t = (Number(deg) || 0) * Math.PI / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return { x: anchor.x + (point.x * cos) - (point.y * sin), y: anchor.y + (point.x * sin) + (point.y * cos) };
}

/** Number of smallest-token places the group needs (a Large token counts as 4 Medium ones). */
function effectiveCount(units, rMin) {
  return units.reduce((n, u) => n + ((u.r / rMin) ** 2), 0);
}

/** Auto width of a block: ⌈√n⌉ columns — square, or one row wider than deep. */
export function autoColumns(count) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count)) - EPS));
}

/** Block candidates: rows front to back, each from the middle out. */
export function blockCandidates(count, step, columns, rows) {
  const c = Math.max(1, Math.round(columns));
  const expected = Math.max(1, Math.ceil(count / c));
  const order = [...Array(c).keys()].sort((a, b) => (Math.abs(a - ((c - 1) / 2)) - Math.abs(b - ((c - 1) / 2))) || (a - b));
  const out = [];
  for (let k = 0; k < rows; k++) {
    for (const j of order) out.push({ x: (j - ((c - 1) / 2)) * step, y: (k - ((expected - 1) / 2)) * step });
  }
  return out;
}

/** Honeycomb candidates around the centre, nearest first (then clockwise from the front). */
export function hexCandidates(step, wanted) {
  let rings = 0;
  while (1 + (3 * rings * (rings + 1)) < wanted) rings++;
  const out = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      out.push({ x: step * (q + (r / 2)), y: step * SQRT3_2 * r });
    }
  }
  const angle = p => (Math.atan2(p.x, -p.y) + (2 * Math.PI)) % (2 * Math.PI);
  return out.sort((a, b) => (Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)) || (angle(a) - angle(b)));
}

/** Uniform random candidates in a disc. */
export function crowdCandidates(radius, wanted, rng) {
  const out = [];
  for (let i = 0; i < wanted; i++) {
    const a = rng() * 2 * Math.PI;
    const d = radius * Math.sqrt(rng());
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d });
  }
  return out;
}

/**
 * Place units on ordered candidates (see the file comment).
 * @returns {{result: Map<string, {x, y}>, complete: boolean}}  complete = every unit found a place
 */
function placeOnCandidates(units, candidates, opts) {
  const { spacing, order, valid, snap } = opts;
  const placed = [];
  const result = new Map();
  let complete = true;
  const validCache = new Map();
  const isValid = p => {
    if (!valid) return true;
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (!validCache.has(key)) validCache.set(key, !!valid(p));
    return validCache.get(key);
  };
  const fits = (unit, p) => placed.every(q => dist(p, q) >= ((unit.r + q.r) * spacing) - EPS);

  const sorted = [...units].sort((a, b) => {
    if (order === "largeLast") return (a.r - b.r) || 0;
    return (b.r - a.r) || (order === "nearest" ? dist(a, opts.anchor) - dist(b, opts.anchor) : 0);
  });

  for (const [index, unit] of sorted.entries()) {
    const pool = (order === "nearest") ? (sorted.length - index) : 1;
    const options = [];
    for (const candidate of candidates) {
      const p = snap ? snap(unit, candidate) : candidate;
      if (!fits(unit, p) || !isValid(p)) continue;
      options.push(p);
      if (options.length >= pool) break;
    }
    if (!options.length) {
      complete = false;
      continue;
    }
    const best = (order === "nearest")
      ? options.reduce((a, b) => (dist(unit, b) < dist(unit, a) ? b : a))
      : options[0];
    placed.push({ x: best.x, y: best.y, r: unit.r });
    result.set(unit.id, { x: best.x, y: best.y });
  }
  return { result, complete };
}

/** Swap places between same-size units while it shortens the total way (nearest mode). */
export function improveBySwapping(units, result, maxPasses = 20) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        if (Math.abs(a.r - b.r) > EPS) continue;
        const pa = result.get(a.id);
        const pb = result.get(b.id);
        if ((dist(a, pb) + dist(b, pa)) < (dist(a, pa) + dist(b, pb)) - EPS) {
          result.set(a.id, pb);
          result.set(b.id, pa);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return result;
}

/** One ring; each unit takes an arc as wide as itself (× spacing). */
function circlePlan(units, opts) {
  const { spacing, anchor, order, snap } = opts;
  const n = units.length;
  if (n === 1) {
    const p = snap ? snap(units[0], anchor) : { ...anchor };
    return new Map([[units[0].id, p]]);
  }
  const angleOf = u => Math.atan2(u.y - anchor.y, u.x - anchor.x);
  let ring;
  if (order === "nearest") ring = [...units].sort((a, b) => angleOf(a) - angleOf(b));
  else if (order === "largeLast") ring = [...units].sort((a, b) => a.r - b.r);
  else ring = [...units].sort((a, b) => b.r - a.r);

  const arcs = ring.map(u => u.r * spacing * 2);
  const total = arcs.reduce((s, a) => s + a, 0);
  // Angular position of each unit's centre (fraction of the full circle).
  const fractions = [];
  let run = 0;
  for (const arc of arcs) {
    fractions.push((run + (arc / 2)) / total);
    run += arc;
  }
  let radius = total / (2 * Math.PI);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let delta = (fractions[j] - fractions[i]) * 2 * Math.PI;
    if (delta <= 0) delta += 2 * Math.PI;
    const need = ((ring[i].r + ring[j].r) * spacing) / (2 * Math.sin(Math.min(Math.PI, delta) / 2));
    radius = Math.max(radius, need);
  }
  const place = start => ring.map((u, i) => {
    const a = start + (fractions[i] * 2 * Math.PI);
    return { x: anchor.x + (Math.cos(a) * radius), y: anchor.y + (Math.sin(a) * radius) };
  });
  let start = ((Number(opts.rotation) || 0) - 90) * Math.PI / 180;
  if (order === "nearest") {
    // Turn the ring to where the tokens already are.
    let bestCost = Infinity;
    for (let k = 0; k < 72; k++) {
      const s = (k / 72) * 2 * Math.PI;
      const cost = place(s).reduce((sum, p, i) => sum + dist(ring[i], p), 0);
      if (cost < bestCost) [bestCost, start] = [cost, s];
    }
  }
  const points = place(start);
  return new Map(ring.map((u, i) => [u.id, snap ? snap(u, points[i]) : points[i]]));
}

/**
 * Plan a formation.
 * @param {{id: string, r: number, x: number, y: number}[]} units  current centres (px) and radii
 * @param {object} opts
 * @param {string} [opts.type="block"]       block | hex | circle | crowd
 * @param {number} [opts.spacing=1]          distance factor (see above)
 * @param {number} [opts.columns=0]          block width, 0 = automatic
 * @param {number} [opts.rotation=0]         degrees, clockwise; 0 = front up
 * @param {string} [opts.order="nearest"]    nearest | largeFirst | largeLast
 * @param {number} [opts.seed=1]             crowd randomness
 * @param {{x, y}} [opts.anchor]             centre of the formation (default: the group's centre)
 * @param {(p: {x, y}) => boolean} [opts.valid]          may a token stand there (walls, bounds)?
 * @param {(unit, p: {x, y}) => {x, y}} [opts.snap]       grid snapping of a centre
 * @returns {Map<string, {x: number, y: number}>}  new centre per unit id (units that found no
 *   place keep their position)
 */
export function planFormation(units, opts = {}) {
  const list = units.filter(u => Number.isFinite(u.x) && Number.isFinite(u.y) && (u.r > 0));
  if (!list.length) return new Map();
  const type = TYPES.includes(opts.type) ? opts.type : "block";
  const order = ORDERS.includes(opts.order) ? opts.order : "nearest";
  const spacing = Math.max(0.1, Number(opts.spacing) || 1);
  const anchor = opts.anchor ?? {
    x: list.reduce((s, u) => s + u.x, 0) / list.length,
    y: list.reduce((s, u) => s + u.y, 0) / list.length
  };
  const rotation = Number(opts.rotation) || 0;
  const base = { spacing, order, anchor, rotation, valid: opts.valid, snap: opts.snap };

  if (type === "circle") return circlePlan(list, base);

  const rMin = Math.min(...list.map(u => u.r));
  const rMax = Math.max(...list.map(u => u.r));
  const step = 2 * rMin * spacing;
  const count = effectiveCount(list, rMin);
  const wanted = Math.min(6000, Math.ceil(Math.max(30, 4 * list.length) * ((rMax / rMin) ** 2)));

  let result = null;
  if (type === "crowd") {
    const rng = random(opts.seed ?? 1);
    // Random packings reach ~50 % density; start there and widen until everyone fits.
    let radius = Math.sqrt(list.reduce((s, u) => s + ((u.r * spacing) ** 2), 0) / 0.5);
    for (let attempt = 0; attempt < 12; attempt++) {
      const local = crowdCandidates(Math.max(radius, rMax * spacing), Math.max(wanted, 40 * list.length), rng);
      const placed = placeOnCandidates(list, local.map(p => toWorld(p, anchor, rotation)), base);
      result = placed.result;
      if (placed.complete) break;
      radius *= 1.15;
    }
  } else {
    let local;
    if (type === "hex") local = hexCandidates(step, wanted);
    else {
      const columns = (Number(opts.columns) > 0) ? Math.round(opts.columns) : autoColumns(count);
      const rows = Math.ceil(wanted / columns) + 4;
      local = blockCandidates(count, step, columns, rows);
    }
    result = placeOnCandidates(list, local.map(p => toWorld(p, anchor, rotation)), base).result;
  }

  result ??= new Map();
  for (const u of list) if (!result.has(u.id)) result.set(u.id, { x: u.x, y: u.y });
  return (order === "nearest") ? improveBySwapping(list, result) : result;
}

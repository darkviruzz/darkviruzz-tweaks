/**
 * Pure geometry for "which creatures does an area of effect affect?" — no Foundry globals.
 * Used by the feature Template Auto-Targeting (scripts/features/template-targeting.js).
 *
 * The area itself is only seen through a callback `inside(x, y) → boolean` (in Foundry:
 * `RegionDocument#testPoint`), so walls, holes and every template shape are handled by core.
 * Coverage is measured by sampling a midpoint lattice — exact enough for the "at least half"
 * test (an 8×8 lattice resolves 1/64 of a square; a straight edge through the middle of a
 * square gives exactly 32 of 64) and robust for any shape.
 *
 * Rules (sources: DMG 2024 p. 44, DMG 2014 ch. 8, Xanathar's Guide p. 86):
 *   "half"   — a square / hex is affected if the area covers at least half of it (DMG 2024:
 *              "If an area of effect covers at least half a square or hex, the entire square or
 *              hex is affected"; 2014: circular areas only).
 *   "any"    — any part of it (Xanathar's template method: "If any part of a square is under the
 *              template, that square is included … Being adjacent to the edge of the template
 *              isn't enough"; without a grid: "any part of the miniature's base is overlapped").
 *   "center" — its centre point (what Foundry v14 highlights as "covered grid spaces": the spaces
 *              in which a 1×1 token would be contained).
 * A creature is in the area if any of its squares is affected (XGtE: "If a creature's miniature
 * is in an affected square, that creature is in the area").
 *
 * Gridless: the creature's base is split into sections of one grid unit (5 ft) — a Large base
 * into 2×2, a Huge one into 3×3, a Medium or smaller base is one section — and the same rule is
 * applied to every section: the creature is in the area if one of its sections is.
 */

export const RULES = Object.freeze(["half", "any", "center"]);

/** Even-odd point-in-polygon test. */
export function pointInPolygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if (((a.y > y) !== (b.y > y)) && (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

const centroid = points => {
  if (!points.length) return null;
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
};

/**
 * Midpoint lattice of n×n samples over a polygon's bounding box, kept if inside the polygon
 * (a square keeps all of them, a hexagon about three quarters).
 * @param {{x: number, y: number}[]} vertices  The grid space's vertices.
 * @param {number} [n=8]
 */
export function polygonSamples(vertices, n = 8) {
  if (!vertices?.length) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const w = maxX - minX, h = maxY - minY;
  const axisAlignedRect = vertices.length === 4
    && vertices.every(v => (v.x === minX || v.x === maxX) && (v.y === minY || v.y === maxY));
  const points = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: minX + ((i + 0.5) * w) / n, y: minY + ((j + 0.5) * h) / n };
      if (axisAlignedRect || pointInPolygon(p.x, p.y, vertices)) points.push(p);
    }
  }
  return points;
}

/**
 * Does the area cover enough of these samples for the rule?
 * @param {{x: number, y: number}[]} samples
 * @param {(x: number, y: number) => boolean} inside
 * @param {"half"|"any"|"center"} rule
 * @param {{x: number, y: number}} [center]  Used by the rule "center".
 */
export function coversEnough(samples, inside, rule, center = centroid(samples)) {
  if (rule === "center") return !!center && !!inside(center.x, center.y);
  if (!samples.length) return false;
  if (rule === "any") return samples.some(p => inside(p.x, p.y));
  // "half": at least half of the samples (early exit both ways)
  const need = Math.ceil(samples.length / 2);
  const maxMisses = samples.length - need;
  let hits = 0, misses = 0;
  for (const p of samples) {
    if (inside(p.x, p.y)) { if (++hits >= need) return true; }
    else if (++misses > maxMisses) return false;
  }
  return hits >= need;
}

/** Is this grid space (square or hex, given by its vertices) affected? */
export function gridSpaceAffected(vertices, inside, rule, n = 8) {
  if (!vertices?.length) return false;
  return coversEnough(polygonSamples(vertices, n), inside, rule, centroid(vertices));
}

/**
 * Split a creature's base into sections of one grid unit (at least one), each with its sample
 * points (inside the base: an ellipse or a rectangle).
 * @param {{x: number, y: number, width: number, height: number, ellipse?: boolean}} base  In px.
 * @param {number} unit         Pixels per grid unit.
 * @param {number} [perUnit=10] Samples per grid unit along each axis.
 * @returns {{points: {x: number, y: number}[], center: {x: number, y: number}}[]}
 */
export function baseSections({ x, y, width, height, ellipse = false }, unit, perUnit = 10) {
  if (!(width > 0) || !(height > 0) || !(unit > 0)) return [];
  const cols = Math.max(1, Math.round(width / unit));
  const rows = Math.max(1, Math.round(height / unit));
  const sw = width / cols, sh = height / rows;
  const nx = Math.max(2, Math.round((perUnit * sw) / unit));
  const ny = Math.max(2, Math.round((perUnit * sh) / unit));
  const cx = x + (width / 2), cy = y + (height / 2), rx = width / 2, ry = height / 2;
  const inBase = (px, py) => !ellipse || ((((px - cx) / rx) ** 2) + (((py - cy) / ry) ** 2) <= 1);
  const sections = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const points = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const px = x + (c * sw) + (((i + 0.5) * sw) / nx);
          const py = y + (r * sh) + (((j + 0.5) * sh) / ny);
          if (inBase(px, py)) points.push({ x: px, y: py });
        }
      }
      if (points.length) sections.push({ points, center: centroid(points) });
    }
  }
  return sections;
}

/** Is a creature with these base sections in the area? */
export function baseAffected(sections, inside, rule) {
  return sections.some(s => coversEnough(s.points, inside, rule, s.center));
}

#!/usr/bin/env python3
"""
Renders the placeholder battlemap for "Die Höhlen von Blackthorn".

This is an original drawing, not a trace of any published map: the cavern
topology (which chamber connects to which, and roughly where) follows the
adventure text, and the shapes are generated here. It exists so the module is
playable immediately; swap in a hand-drawn map later by replacing the image and
adjusting `cellPixels` in src/scene/blackthorn.yml if the grid changes.

Style follows the classic survey look — white cavern floor, fine grid, heavy
stippled rock edge — so it reads the same way at the table.

Coordinates throughout are MAP CELLS of 10 ft, matching the scene definition.
"""

import math
import random
from PIL import Image, ImageDraw, ImageFilter

# --- geometry -------------------------------------------------------------

CELL_PX = 100          # pixels per 10 ft cell -> Foundry grid of 50 px per 5 ft
WIDTH_CELLS = 73
HEIGHT_CELLS = 45

WHITE = (252, 251, 247)
PAPER = (238, 234, 224)
INK = (26, 24, 22)
GRID = (176, 170, 158)
WATER = (150, 176, 190)

SEED = 20260906


def cells(v):
    return int(round(v * CELL_PX))


class Blob:
    """One cavern chamber: a union of discs with a wobbling radius."""

    def __init__(self, name, lobes, wobble=0.16, points=360):
        self.name = name
        self.lobes = lobes          # [(cx, cy, r), ...] in cells
        self.wobble = wobble
        self.points = points

    def polygon(self, rng):
        """Outline sampled by ray-casting the union of lobes from its centroid."""
        cx = sum(l[0] for l in self.lobes) / len(self.lobes)
        cy = sum(l[1] for l in self.lobes) / len(self.lobes)
        # Low-frequency noise so the edge undulates like rock rather than jitters.
        harmonics = [(rng.uniform(0, math.tau), rng.uniform(0.4, 1.0), k)
                     for k in (2, 3, 5, 7, 11)]
        pts = []
        for i in range(self.points):
            a = math.tau * i / self.points
            dx, dy = math.cos(a), math.sin(a)
            reach = 0.0
            for lx, ly, lr in self.lobes:
                # distance from centroid along the ray to the far side of this disc
                ox, oy = lx - cx, ly - cy
                proj = ox * dx + oy * dy
                perp2 = (ox * ox + oy * oy) - proj * proj
                if perp2 <= lr * lr:
                    reach = max(reach, proj + math.sqrt(lr * lr - perp2))
            if reach <= 0:
                continue
            n = sum(amp * math.sin(k * a + phase) for phase, amp, k in harmonics)
            n /= sum(amp for _, amp, _ in harmonics)
            r = reach * (1.0 + self.wobble * n)
            pts.append((cells(cx + r * dx), cells(cy + r * dy)))
        return pts


# Chamber layout, following the map's arrangement: the upper cavern in the
# north-east with its shaft to the surface, the gnoll cavern north-west, the
# great fountain cavern in the middle, the ogre lair west and higher up, the
# quiet cavern south, the orc cavern filling the east, and the canyon cutting
# across the southern edge.
CHAMBERS = [
    Blob("1 obere Hoehle", [(46, 7.0, 5.6), (49.5, 5.5, 4.2), (43, 9.0, 3.8)]),
    Blob("1b aufgang",     [(57, 3.5, 1.9), (58, 6.5, 1.7)], wobble=0.10),
    Blob("3 gnollhoehle",  [(19, 8.0, 5.8), (23.5, 6.5, 4.4), (16, 11.0, 3.8)]),
    Blob("2 fontaene",     [(32, 21.0, 6.2), (39, 20.0, 5.2), (26, 22.5, 4.2), (44, 21.5, 3.4)]),
    Blob("4 ogerbau",      [(11, 21.5, 4.6), (14, 23.5, 3.4), (9, 25.0, 3.0)]),
    Blob("5 laermhoehle",  [(37, 33.0, 5.8), (44, 32.0, 4.4), (31, 34.0, 4.0)]),
    Blob("6 orkhoehle",    [(60, 23.0, 7.2), (66, 20.0, 5.2), (57, 29.0, 4.8), (64, 29.0, 4.4)]),
]

# Connecting passages: (from_cell, to_cell, half-width in cells)
PASSAGES = [
    ((45.5, 11.0), (43.0, 15.0), 0.8),   # 1 -> 2, the winding stair down
    ((43.0, 15.0), (39.5, 16.0), 0.8),
    ((52.5, 4.5), (55.5, 3.8), 0.7),     # 1 -> 1b, the cut stair to the surface
    ((22.5, 11.0), (27.0, 17.5), 0.8),   # 3 -> 2
    ((15.5, 21.0), (26.0, 21.0), 0.8),   # 4 -> 2, the spiral stair
    ((41.0, 25.0), (39.5, 29.0), 0.9),   # 2 -> 5, down the cliff face
    ((47.0, 21.5), (53.5, 22.5), 1.0),   # 2 -> 6
    ((47.5, 32.0), (53.5, 30.0), 1.0),   # 5 -> 6
    ((68.5, 20.5), (72.5, 18.5), 0.7),   # 6 -> east tunnels, to the duergar
    ((68.0, 27.5), (72.5, 29.5), 0.7),
]

# The canyon runs across the south-west corner, 1000 ft deep with a strong river.
CANYON = [(-2, 30.0), (13, 34.0), (25, 37.0), (39, 40.0), (55, 42.5), (75, 45.0)]
CANYON_WIDTH = 3.6


def stipple(draw, polygon, rng, density=0.55, spread=1.15):
    """Scatter dots just outside an outline — the classic hand-inked rock edge."""
    n = len(polygon)
    for i in range(n):
        x0, y0 = polygon[i]
        x1, y1 = polygon[(i + 1) % n]
        seg = math.hypot(x1 - x0, y1 - y0)
        if seg < 1:
            continue
        # outward normal
        nx, ny = (y1 - y0) / seg, -(x1 - x0) / seg
        for _ in range(max(1, int(seg * density / 8))):
            t = rng.random()
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            d = rng.random() ** 1.7 * spread * CELL_PX * 0.42
            r = rng.choice((1, 1, 2, 2, 3))
            cx, cy = px + nx * d, py + ny * d
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK)


def main():
    rng = random.Random(SEED)
    W, H = WIDTH_CELLS * CELL_PX, HEIGHT_CELLS * CELL_PX

    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    # --- floor mask: chambers plus passages ------------------------------
    floor = Image.new("L", (W, H), 0)
    fdraw = ImageDraw.Draw(floor)
    polys = []
    for chamber in CHAMBERS:
        poly = chamber.polygon(rng)
        polys.append(poly)
        fdraw.polygon(poly, fill=255)
    for (ax, ay), (bx, by), hw in PASSAGES:
        fdraw.line((cells(ax), cells(ay), cells(bx), cells(by)),
                   fill=255, width=cells(hw * 2))

    # Soften then re-threshold so passages blend into chambers instead of
    # showing seams where they meet.
    floor = floor.filter(ImageFilter.GaussianBlur(CELL_PX * 0.05))
    floor = floor.point(lambda v: 255 if v > 128 else 0)

    # --- paint the floor --------------------------------------------------
    img.paste(Image.new("RGB", (W, H), WHITE), (0, 0), floor)

    # --- grid, clipped to the floor --------------------------------------
    grid_layer = Image.new("RGB", (W, H), WHITE)
    gdraw = ImageDraw.Draw(grid_layer)
    for gx in range(0, W + 1, CELL_PX):
        gdraw.line((gx, 0, gx, H), fill=GRID, width=2)
    for gy in range(0, H + 1, CELL_PX):
        gdraw.line((0, gy, W, gy), fill=GRID, width=2)
    img.paste(grid_layer, (0, 0), floor)

    # --- canyon: cuts through everything, drawn on top --------------------
    canyon_px = [(cells(x), cells(y)) for x, y in CANYON]
    half = cells(CANYON_WIDTH) // 2
    band = Image.new("L", (W, H), 0)
    ImageDraw.Draw(band).line(canyon_px, fill=255, width=half * 2, joint="curve")
    img.paste(Image.new("RGB", (W, H), PAPER), (0, 0), band)
    river = Image.new("L", (W, H), 0)
    ImageDraw.Draw(river).line(canyon_px, fill=255, width=cells(0.9), joint="curve")
    img.paste(Image.new("RGB", (W, H), WATER), (0, 0), river)

    # --- rock edges -------------------------------------------------------
    outline = Image.new("RGB", (W, H), PAPER)
    odraw = ImageDraw.Draw(outline)
    edge = floor.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(13))
    img.paste(Image.new("RGB", (W, H), INK), (0, 0), edge)

    for poly in polys:
        stipple(draw, poly, rng)
    for pts in (canyon_px,):
        for i in range(len(pts) - 1):
            draw.line((pts[i], pts[i + 1]), fill=INK, width=4)

    out = "assets/maps/blackthorn.webp"
    img.save(out, "WEBP", quality=88, method=6)
    print(f"{out}  {W}x{H}px  ({WIDTH_CELLS}x{HEIGHT_CELLS} cells of 10 ft = "
          f"{WIDTH_CELLS*10}x{HEIGHT_CELLS*10} ft)")

    # A downscaled preview of the map, for embedding in the journal. The
    # compendium's banner is the clan standard from make-banner.py — keep the
    # filenames distinct so the two scripts cannot overwrite each other.
    preview = img.resize((1200, int(1200 * H / W)), Image.LANCZOS)
    preview.save("assets/maps/blackthorn-map-preview.webp", "WEBP", quality=85, method=6)
    print(f"assets/maps/blackthorn-map-preview.webp  {preview.size[0]}x{preview.size[1]}px")


if __name__ == "__main__":
    main()

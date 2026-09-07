#!/usr/bin/env python3
"""
Renders the Blackthorn clan standard.

An original drawing from the heraldic description in the source notes — a black
thorn on undyed linen, a red slash across it, a red skull below — not a copy of
any artist's rendition of it. The elements themselves (thorn, slash, skull) are
generic heraldry; the execution here is generated.

The slash is the point: the thorn stood for the place long before the clan did.
Garghuk added the stroke, and it is the cut that parts a chain.
"""

import math
import random
from PIL import Image, ImageDraw, ImageFilter

W, H = 1024, 1536
LINEN = (204, 186, 152)
LINEN_DARK = (176, 156, 120)
INK = (24, 20, 18)
BLOOD = (168, 44, 32)
SEED = 5760306


def linen_ground(rng):
    """Undyed cloth: warm base, uneven weave, darker along the edges."""
    img = Image.new("RGB", (W, H), LINEN)
    px = img.load()
    for y in range(H):
        for x in range(0, W, 2):
            n = rng.randint(-11, 11)
            # weave: alternating warp/weft catches the light differently
            n += 5 if (x // 3 + y // 3) % 2 else -5
            for dx in (0, 1):
                if x + dx < W:
                    r, g, b = px[x + dx, y]
                    px[x + dx, y] = (max(0, min(255, r + n)),
                                     max(0, min(255, g + n)),
                                     max(0, min(255, b + n)))
    # grime toward the edges — a banner carried, not framed
    grime = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grime)
    gd.rectangle((0, 0, W, H), outline=255, width=90)
    grime = grime.filter(ImageFilter.GaussianBlur(60))
    img.paste(Image.new("RGB", (W, H), LINEN_DARK), (0, 0), grime)
    return img


def ragged_bottom(rng, img):
    """Tear the lower edge into tongues, the way a standard wears out."""
    mask = Image.new("L", (W, H), 255)
    md = ImageDraw.Draw(mask)
    x = 0
    while x < W:
        w = rng.randint(38, 78)
        depth = rng.randint(60, 240)
        md.polygon([(x, H), (x + w // 2, H - depth), (x + w, H)], fill=0)
        x += w
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(img.convert("RGBA"), (0, 0), mask)
    return out, mask


def thorn(draw, cx, top, bottom, rng):
    """A blackthorn shoot: one hard vertical, thorns paired down its length."""
    draw.line((cx, top, cx, bottom), fill=INK, width=26)
    y = top + 40
    side = 1
    while y < bottom - 40:
        # thorns get shorter toward the tip
        t = (y - top) / (bottom - top)
        length = int(118 * (0.55 + 0.45 * (1 - t))) + rng.randint(-10, 10)
        rise = int(length * 0.80)
        draw.line((cx, y, cx + side * length, y - rise), fill=INK, width=13)
        # each thorn ends in a point
        draw.polygon([
            (cx + side * length, y - rise),
            (cx + side * int(length * 0.86), y - int(rise * 0.72)),
            (cx + side * int(length * 0.92), y - int(rise * 1.02)),
        ], fill=INK)
        side *= -1
        y += rng.randint(52, 72)


def skull(draw, cx, cy, w, h):
    """A blunt red skull — a mark, not a portrait."""
    draw.ellipse((cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 3), fill=BLOOD)
    # jaw
    jw = int(w * 0.62)
    draw.polygon([
        (cx - jw // 2, cy + h // 4), (cx + jw // 2, cy + h // 4),
        (cx + int(jw * 0.34), cy + int(h * 0.62)), (cx - int(jw * 0.34), cy + int(h * 0.62)),
    ], fill=BLOOD)
    # teeth cut out of the jaw
    for i in range(-2, 3):
        tx = cx + i * int(w * 0.115)
        draw.rectangle((tx - 9, cy + int(h * 0.30), tx + 9, cy + int(h * 0.60)), fill=LINEN)
    # eyes and nose, punched through to the cloth
    ew, eh = int(w * 0.235), int(h * 0.235)
    for sx in (-1, 1):
        ex = cx + sx * int(w * 0.20)
        draw.polygon([
            (ex - ew // 2, cy - eh), (ex + ew // 2, cy - int(eh * 0.8)),
            (ex + int(ew * 0.32), cy + int(eh * 0.5)), (ex - int(ew * 0.40), cy + int(eh * 0.3)),
        ], fill=LINEN)
    draw.polygon([
        (cx, cy + int(h * 0.02)),
        (cx + int(w * 0.075), cy + int(h * 0.19)),
        (cx - int(w * 0.075), cy + int(h * 0.19)),
    ], fill=LINEN)


def slash(img, rng):
    """The stroke across the thorn: a brush-drag, thick at the start, torn at the end."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0 = int(W * 0.20), int(H * 0.44)
    x1, y1 = int(W * 0.86), int(H * 0.20)
    steps = 260
    for i in range(steps):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        width = int(52 * (1.0 - 0.40 * t)) + rng.randint(-3, 3)
        alpha = 255
        d.ellipse((x - width, y - width // 2, x + width, y + width // 2),
                  fill=BLOOD + (alpha,))
    # dry-brush gaps so it reads as paint, not as a printed bar
    gaps = Image.new("L", (W, H), 255)
    gd = ImageDraw.Draw(gaps)
    for _ in range(34):
        t = rng.random()
        x = x0 + (x1 - x0) * t + rng.randint(-40, 40)
        y = y0 + (y1 - y0) * t + rng.randint(-34, 34)
        r = rng.randint(3, 11)
        gd.ellipse((x - r, y - r, x + r, y + r), fill=0)
    gaps = gaps.filter(ImageFilter.GaussianBlur(3))
    layer.putalpha(Image.composite(layer.getchannel("A"),
                                   Image.new("L", (W, H), 0), gaps))
    img.paste(layer, (0, 0), layer)


def main():
    rng = random.Random(SEED)
    img = linen_ground(rng)
    draw = ImageDraw.Draw(img)

    thorn(draw, W // 2, int(H * 0.14), int(H * 0.60), rng)
    slash(img, rng)
    draw = ImageDraw.Draw(img)
    skull(draw, W // 2, int(H * 0.755), int(W * 0.36), int(H * 0.145))

    img, mask = ragged_bottom(rng, img)

    out = "assets/maps/blackthorn-banner.webp"
    img.save(out, "WEBP", quality=90, method=6)
    print(f"{out}  {W}x{H}px")

    # Square crop for the compendium card and journal illustration.
    card = img.crop((0, 0, W, W)).resize((512, 512), Image.LANCZOS)
    card.save("assets/maps/blackthorn-sigil.webp", "WEBP", quality=90, method=6)
    print("assets/maps/blackthorn-sigil.webp  512x512px")


if __name__ == "__main__":
    main()

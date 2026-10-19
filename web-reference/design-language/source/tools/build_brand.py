"""Build the vector masters and the favicon set from the shipped mark.

    python3 -I web-reference/design-language/source/tools/build_brand.py

Needs Pillow, numpy and scipy. Not part of the site build: the site keeps
deriving its own mask from the JPEG (apps/web/build.mjs), and nothing here
changes that. This produces the files every other medium needs, and refuses to
write them if the vector stops matching the mask the site renders.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from trace_mark import trace  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / 'apps/web/src/assets/evergreen-logo.jpeg'
OUT = Path(__file__).resolve().parents[1]

# tokens.md. Nothing else is allowed in a brand file.
PINE, PINE_DEEP, SURFACE, INK = '#1a3a2e', '#022419', '#fcf9f8', '#0f0f0f'

# One mark at every size. Two simplified variants were built and rejected
# (brand.md, "Why there is no small mark"): without the ticks the letter reads
# as a 2, and with the ticks closed into an arc it reads as a gear.


def bbox(loops):
    pts = np.vstack(loops)
    return pts.min(0), pts.max(0)


def svg(loops, fill, title):
    (x0, y0), (x1, y1) = bbox(loops)
    w, h = x1 - x0, y1 - y0
    d = ''.join(
        'M' + 'L'.join(f'{x - x0:.1f} {y - y0:.1f}' for x, y in lp) + 'Z' for lp in loops
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" '
        f'role="img" aria-label="{title}">\n'
        f'  <path fill="{fill}" fill-rule="evenodd" d="{d}"/>\n</svg>\n'
    )


def raster(loops, size, glyph_w, ground, ink, ss=16):
    """Mark centred on a square tile. Supersampled, then reduced."""
    (x0, y0), (x1, y1) = bbox(loops)
    scale = glyph_w * ss / (x1 - x0)
    big = size * ss
    ox = (big - (x1 - x0) * scale) / 2
    oy = (big - (y1 - y0) * scale) / 2
    acc = np.zeros((big, big), bool)
    for lp in loops:  # even-odd: XOR each ring
        layer = Image.new('1', (big, big), 0)
        ImageDraw.Draw(layer).polygon(
            [((x - x0) * scale + ox, (y - y0) * scale + oy) for x, y in lp], fill=1
        )
        acc ^= np.asarray(layer, bool)
    alpha = Image.fromarray((acc * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    tile = Image.new('RGB', (size, size), ground)
    tile.paste(Image.new('RGB', (size, size), ink), mask=alpha)
    return tile


def fidelity(loops, field):
    """Intersection over union against the mask the site renders (alpha > .5)."""
    h, w = field.shape
    acc = np.zeros((h, w), bool)
    for lp in loops:
        layer = Image.new('1', (w, h), 0)
        ImageDraw.Draw(layer).polygon([tuple(p) for p in lp], fill=1)
        acc ^= np.asarray(layer, bool)
    ref = field > 0.5
    return (acc & ref).sum() / (acc | ref).sum()


def favicon_svg(mark):
    """32-unit pine tile, cream mark, 2-unit inset at the sides."""
    (x0, y0), (x1, y1) = bbox(mark)
    s = 28 / (x1 - x0)
    oy = (32 - (y1 - y0) * s) / 2
    d = ''.join(
        'M' + 'L'.join(f'{2 + (x - x0) * s:.2f} {oy + (y - y0) * s:.2f}' for x, y in lp) + 'Z'
        for lp in mark
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n'
        f'  <rect width="32" height="32" fill="{PINE}"/>\n'
        f'  <path fill="{SURFACE}" fill-rule="evenodd" d="{d}"/>\n</svg>\n'
    )


def main():
    full, field = trace(SRC)
    iou = fidelity(full, field)
    print(f'mark: {len(full)} shapes, IoU {iou:.4f} against the shipped mask')
    if iou < 0.99:
        sys.exit('the trace no longer matches the shipped mask; nothing written')

    brand, fav = OUT / 'brand', OUT / 'favicon'
    for name, fill in (('pine', PINE), ('cream', SURFACE), ('ink', INK)):
        (brand / f'evergreen-mark-{name}.svg').write_text(svg(full, fill, 'Evergreen'))

    (fav / 'favicon.svg').write_text(favicon_svg(full))
    ico = [raster(full, s, s - 2 * max(1, s // 16), PINE, SURFACE) for s in (16, 32, 48)]
    ico[2].save(fav / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    # iOS rounds the corners itself; keep the glyph inside its safe area.
    raster(full, 180, round(180 * 0.62), PINE, SURFACE).save(fav / 'apple-touch-icon.png')
    # Maskable: the glyph's diagonal stays inside the 80% safe circle.
    for s in (192, 512):
        raster(full, s, round(s * 0.58), PINE, SURFACE).save(fav / f'icon-{s}.png')
    (fav / 'site.webmanifest').write_text(
        json.dumps(
            {
                'name': 'Evergreen',
                'short_name': 'Evergreen',
                'icons': [
                    {'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
                    {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'},
                ],
                'theme_color': PINE_DEEP,
                'background_color': SURFACE,
                'display': 'browser',
            },
            indent=2,
        )
        + '\n'
    )

    # Proof sheet: the mark at every size the rules name, on every ground,
    # then the favicon tiles at the sizes a browser actually asks for.
    sizes = (16, 24, 32, 48, 64, 128)
    grounds = ((SURFACE, PINE), (PINE, SURFACE), (PINE_DEEP, SURFACE), (INK, SURFACE))
    sheet = Image.new('RGB', (40 + sum(s + 24 for s in sizes), 5 * 170), SURFACE)
    for row, (ground, ink) in enumerate(grounds):
        band = Image.new('RGB', (sheet.width, 170), ground)
        x = 20
        for s in sizes:
            band.paste(raster(full, s, s, ground, ink), (x, 85 - s // 2))
            x += s + 24
        sheet.paste(band, (0, row * 170))
    x = 20
    for tile in ico + [Image.open(fav / 'apple-touch-icon.png')]:
        sheet.paste(tile, (x, 4 * 170 + 85 - tile.height // 2))
        x += tile.width + 24
    sheet.save(OUT / 'renders/brand-proof.png')
    print('wrote brand/, favicon/ and renders/brand-proof.png')


if __name__ == '__main__':
    main()

"""Trace the shipped logo mask to vector paths.

The site derives its mark from the JPEG with an SVG feColorMatrix whose alpha
row is `-2 0 0 0 1.9`: alpha = clamp(1.9 - 2R). This reproduces that field and
takes its 0.5 isoline (R = 0.7) with sub-pixel interpolation, so the vector is
the silhouette the site already renders, not a redraw.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

def alpha_field(path):
    r = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)[..., 0] / 255
    return np.clip(1.9 - 2 * r, 0, 1)

# Marching squares, level 0.5. Corners: tl, tr, br, bl -> bit 8,4,2,1.
def isolines(f, level=0.5):
    f = np.pad(f, 1, constant_values=0)
    h, w = f.shape
    tl, tr, br, bl = f[:-1, :-1], f[:-1, 1:], f[1:, 1:], f[1:, :-1]
    idx = (tl > level) * 8 + (tr > level) * 4 + (br > level) * 2 + (bl > level) * 1
    ys, xs = np.nonzero((idx != 0) & (idx != 15))
    def interp(a, b):
        return (level - a) / (b - a)
    segs = {}
    # edge ids: top(y,x,'h'), bottom(y+1,x,'h'), left(y,x,'v'), right(y,x+1,'v')
    def pt(y, x, e):
        if e == 'T': return ((y, x, 'h'), (x + interp(f[y, x], f[y, x + 1]), y))
        if e == 'B': return ((y + 1, x, 'h'), (x + interp(f[y + 1, x], f[y + 1, x + 1]), y + 1))
        if e == 'L': return ((y, x, 'v'), (x, y + interp(f[y, x], f[y + 1, x])))
        if e == 'R': return ((y, x + 1, 'v'), (x + 1, y + interp(f[y, x + 1], f[y + 1, x + 1])))
    # oriented so inside is on the left when walking
    table = {1: [('L', 'B')], 2: [('B', 'R')], 3: [('L', 'R')], 4: [('R', 'T')], 5: None,
             6: [('B', 'T')], 7: [('L', 'T')], 8: [('T', 'L')], 9: [('T', 'B')], 10: None,
             11: [('T', 'R')], 12: [('R', 'L')], 13: [('R', 'B')], 14: [('B', 'L')]}
    nxt, coord = {}, {}
    for y, x in zip(ys, xs):
        c = idx[y, x]
        pairs = table[c]
        if pairs is None:  # saddle: disambiguate by centre value
            centre = (tl[y, x] + tr[y, x] + br[y, x] + bl[y, x]) / 4
            if c == 5:
                pairs = [('L', 'T'), ('R', 'B')] if centre > level else [('L', 'B'), ('R', 'T')]
            else:
                pairs = [('T', 'R'), ('B', 'L')] if centre > level else [('T', 'L'), ('B', 'R')]
        for a, b in pairs:
            ka, pa = pt(y, x, a); kb, pb = pt(y, x, b)
            nxt[ka] = kb; coord[ka] = pa; coord[kb] = pb
    loops, seen = [], set()
    for start in list(nxt):
        if start in seen: continue
        loop, k = [], start
        while k not in seen and k in nxt:
            seen.add(k); loop.append(coord[k]); k = nxt[k]
        if len(loop) > 2:
            # undo the pad, then move from pixel-index space (centres on integers)
            # to image space, where pixel i covers [i, i + 1] as it does in SVG
            loops.append([(px - 0.5, py - 0.5) for px, py in loop])
    return loops

def rdp(pts, eps):
    pts = np.asarray(pts)
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    d = b - a
    n = np.hypot(*d) or 1
    dist = np.abs(d[0] * (pts[:, 1] - a[1]) - d[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.array([a, b])

def simplify_closed(loop, eps):
    pts = np.asarray(loop)
    # split at the two farthest-apart points so RDP has stable anchors
    i = 0; j = int(np.argmax(np.hypot(*(pts - pts[0]).T)))
    first = rdp(pts[i:j + 1], eps); second = rdp(np.vstack([pts[j:], pts[:1]]), eps)
    return np.vstack([first[:-1], second[:-1]])

def path_d(loops, scale=1.0, ox=0, oy=0):
    out = []
    for lp in loops:
        p = [(f'{(x - ox) * scale:.1f}', f'{(y - oy) * scale:.1f}') for x, y in lp]
        out.append('M' + ' '.join(f'{x} {y}' for x, y in p[:1]) + 'L' + ' '.join(f'{x} {y}' for x, y in p[1:]) + 'Z')
    return ''.join(out)

def area(lp):
    x, y = np.asarray(lp).T
    return 0.5 * (np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def trace(path, small=False, eps=0.45):
    """Loops for the full mark, or for the small mark with the ticks removed."""
    f = alpha_field(path)
    if small:
        # The two largest bodies are the ring and the leaf; everything else is
        # a tick. Dilate the kept region a few pixels before masking so the
        # anti-aliased fringe survives and the edge is interpolated, not cut.
        lab, n = ndimage.label(f > 0.5)
        sizes = ndimage.sum(np.ones_like(f), lab, range(1, n + 1))
        keep = np.isin(lab, np.argsort(sizes)[::-1][:2] + 1)
        keep = ndimage.binary_dilation(keep, iterations=4)
        f = np.where(keep, f, 0)
    loops = [simplify_closed(lp, eps) for lp in isolines(f)]
    return [lp for lp in loops if abs(area(lp)) > 40], f

"""Cut an object out of a Nano Banana picture on a plain white background → RGBA PNG (transparent background), the object
centred in a square with a margin (what Hunyuan3D-2 expects).

    python3 tools/lib/cutout.py in.png out.png [--fill 0.84]

The background is the white region connected to the picture's border (a flood fill with a tolerance), so white parts
inside the object (flour, a white plate) stay. The edge is softened by one pixel; tiny specks are dropped.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque


def _label(m):
    """4-connected components of a boolean mask → (labels, [sizes])"""
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    sizes = []
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        k = len(sizes) + 1
        lab[y0, x0] = k; q = deque([(y0, x0)]); n = 0
        while q:
            y, x = q.popleft(); n += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = k; q.append((yy, xx))
        sizes.append(n)
    return lab, sizes


def cutout(src, dst, fill=0.84, tol=26, green=False):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    H, W, _ = a.shape
    if green:
        # a flat chroma-green background (Nano Banana's cut-out pass): green clearly above red and blue = background;
        # the edge pixels lose their green spill
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        spill = g - np.maximum(r, b)
        bg_ = (spill > 60) & (g > 120)
        a2 = a.copy()
        edge = (spill > 0) & ~bg_
        a2[..., 1] = np.where(edge, np.maximum(r, b) + np.minimum(spill, 10), g)
        im = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8))
        a = a2
        bgish = bg_
    else:
        bgish = None
    # "white enough": bright and unsaturated (shadows under the object are light grey: they go too, softly)
    if bgish is None:
        mx, mn = a.max(2), a.min(2)
        bgish = (mn > 255 - tol - 18) & (mx - mn < 22)
    bg = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if bgish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if bgish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and not bg[yy, xx] and bgish[yy, xx]:
                bg[yy, xx] = True; q.append((yy, xx))
    if green:
        bg = bgish          # the key is global: green seen through a gap (under a table, in a handle) goes too
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    al = np.asarray(alpha).copy()
    # keep the object: the biggest solid piece and the pieces at least 3% of its size (labels, letters, specks go)
    lab, sizes = _label(al > 128)
    if len(sizes) > 1:
        keep = [i + 1 for i, s_ in enumerate(sizes) if s_ >= 0.03 * max(sizes)]
        mask = np.isin(lab, keep)
        mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        al[~mask] = 0
    ys, xs = np.nonzero(al > 128)
    if len(xs) == 0:
        raise SystemExit(f'{src}: nothing left after the cut')
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgba = np.dstack([np.asarray(im), al])
    crop = Image.fromarray(rgba[y0:y1 + 1, x0:x1 + 1], 'RGBA')
    side = int(max(crop.width, crop.height) / fill)
    out = Image.new('RGBA', (side, side), (255, 255, 255, 0))
    out.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2), crop)
    out = out.resize((max(512, min(1024, side)),) * 2, Image.LANCZOS)
    out.save(dst)
    return (x1 - x0 + 1) / W, (y1 - y0 + 1) / H


if __name__ == '__main__':
    fill = float(sys.argv[sys.argv.index('--fill') + 1]) if '--fill' in sys.argv else 0.84
    w, h = cutout(sys.argv[1], sys.argv[2], fill, green='--green' in sys.argv)
    print(f'cut {sys.argv[1]} → {sys.argv[2]} (object {w:.2f} × {h:.2f} of the picture)')

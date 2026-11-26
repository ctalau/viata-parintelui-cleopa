"""Procedural, tileable PBR textures baked with numpy (deterministic: every generator takes a seed).

Every texture is periodic (FFT-filtered noise / wrapped Voronoi), so it tiles without seams. Height fields are turned into
OpenGL (glTF) tangent-space normal maps. Images are written as JPEG (colour / normal / roughness) into a cache folder and
then embedded in the GLB by the glTF exporter.
"""
import os
import numpy as np
from PIL import Image

CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.cache')


# ---------------------------------------------------------------- noise primitives (all periodic on the n x n torus)
def _freq(n, m=None):
    m = m or n
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(m)[None, :] * m
    return fx, fy


def fbm(n, seed, beta=2.2, lo=1.0, hi=None, m=None, aniso=(1.0, 1.0)):
    """Periodic fractal noise in [-1, 1]-ish (unit std). beta = spectral slope, lo/hi = band (in cycles per tile)."""
    m = m or n
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((n, m))
    fx, fy = _freq(n, m)
    k = np.sqrt((fx * aniso[0]) ** 2 + (fy * aniso[1]) ** 2)
    amp = np.where(k < lo, 0.0, np.power(np.maximum(k, 1e-6), -beta / 2))
    if hi:
        amp *= np.exp(-(k / hi) ** 2)
    r = np.real(np.fft.ifft2(np.fft.fft2(w) * amp))
    return r / (r.std() + 1e-9)


def voronoi(n, seed, cells, m=None, jitter=1.0):
    """Wrapped Voronoi on the torus. Returns (F1, F2, cell id) with distances in cell units."""
    m = m or n
    rng = np.random.default_rng(seed)
    gx = max(1, int(round(np.sqrt(cells * m / n))))
    gy = max(1, int(round(cells / gx)))
    pts = []
    for j in range(gy):
        for i in range(gx):
            pts.append(((i + 0.5 + (rng.random() - 0.5) * jitter) / gx, (j + 0.5 + (rng.random() - 0.5) * jitter) / gy))
    pts = np.array(pts)
    y, x = np.mgrid[0:n, 0:m]
    u, v = (x + 0.5) / m, (y + 0.5) / n
    f1 = np.full((n, m), 9.0); f2 = np.full((n, m), 9.0); idx = np.zeros((n, m), np.int32)
    scale = np.sqrt(gx * gy)
    for k, (px, py) in enumerate(pts):
        dx = np.abs(u - px); dx = np.minimum(dx, 1 - dx)
        dy = np.abs(v - py); dy = np.minimum(dy, 1 - dy)
        d = np.sqrt((dx * gx) ** 2 + (dy * gy) ** 2)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, k, idx)
        f1 = np.where(closer, d, f1)
    return f1, f2, idx


def norm01(a):
    lo, hi = np.percentile(a, 0.5), np.percentile(a, 99.5)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, r):
    """Periodic gaussian blur (FFT)."""
    n, m = a.shape
    fx, fy = _freq(n, m)
    g = np.exp(-2 * (np.pi ** 2) * (r ** 2) * ((fx / m) ** 2 + (fy / n) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def hex2rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def ramp(t, stops):
    """Colour ramp: stops = [(pos, '#rrggbb'), ...] → (..., 3) array (sRGB)."""
    t = np.clip(t, 0, 1)
    ps = [p for p, _ in stops]
    cs = [hex2rgb(c) for _, c in stops]
    out = np.zeros(t.shape + (3,))
    for ch in range(3):
        out[..., ch] = np.interp(t, ps, [c[ch] for c in cs])
    return out


def normal_from_height(h, strength, wrap=True):
    """h: height (rows = image rows, top to bottom). Returns uint8 RGB OpenGL normal map (green = +V, glTF)."""
    if wrap:
        h = blur(h, 0.8)
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(h)
    nx = -dx * strength
    ny = dy * strength          # image rows go down = -V
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return (np.clip(n * 0.5 + 0.5, 0, 1) * 255 + 0.5).astype(np.uint8)


def to8(rgb):
    return (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)


def save(name, arr, quality=88):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name + '.jpg')
    if arr.dtype != np.uint8:
        arr = to8(arr)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, -1)
    Image.fromarray(arr).save(p, quality=quality, subsampling=0 if 'nrm' in name else 2)
    return p


def pack_rough(r, ao=None):
    """glTF metallicRoughness: G = roughness, B = metal (0). R = AO when the same UV is used."""
    a = np.ones_like(r) if ao is None else ao
    return np.stack([a, r, np.zeros_like(r)], -1)


# ---------------------------------------------------------------- material textures
def sand(n=1024, seed=1, base=('#f2cf96', '#e3b273', '#cf9a5c'), ripples=True):
    """Warm desert sand: grain speckle, soft colour patches, wind ripples (≈ 7 per tile)."""
    big = fbm(n, seed, 3.0, 1, 6)
    grain = fbm(n, seed + 1, 0.0, n / 8)
    y, x = np.mgrid[0:n, 0:n] / n
    warp = fbm(n, seed + 2, 3.2, 1, 5) * 0.06
    rip = np.sin((y + warp + 0.03 * np.sin(x * 2 * np.pi * 2)) * 2 * np.pi * 7)
    rip = np.sign(rip) * np.abs(rip) ** 0.7 if ripples else 0 * rip
    t = norm01(big * 0.8 + grain * 0.15)
    col = ramp(t, [(0, base[2]), (0.5, base[1]), (1, base[0])])
    col *= (1 + 0.06 * grain[..., None])
    sp = (fbm(n, seed + 3, 0.0, n / 3) > 2.6)[..., None]
    col = np.where(sp, col * 0.72, col)
    col += (rip[..., None] * 0.025)
    h = rip * 0.6 + grain * 0.08 + big * 0.2
    rough = 0.86 + 0.06 * grain
    return to8(col), normal_from_height(h, 2.2), to8(pack_rough(rough))


def sandstone(n=1024, seed=2, warm=True, tint=None, cracks=1.0):
    """Layered sandstone: horizontal strata along V, fbm erosion, Voronoi cracks, grain. For box-projected rock UVs."""
    y, x = np.mgrid[0:n, 0:n] / n
    warp = fbm(n, seed, 3.0, 1, 4) * 0.08
    strata = np.sin((y + warp) * 2 * np.pi * 9) * 0.5 + np.sin((y + warp * 1.7) * 2 * np.pi * 23) * 0.25
    big = fbm(n, seed + 1, 2.6, 1)
    grain = fbm(n, seed + 2, 0.0, n / 6)
    f1, f2, _ = voronoi(n, seed + 3, 16)
    crack = (1 - smooth(0.0, 0.05, f2 - f1)) * smooth(-0.3, 0.6, fbm(n, seed + 4, 2.6, 1, 6)) * cracks
    stops = tint or ([(0, '#cf9f72'), (0.35, '#e2b484'), (0.7, '#efc999'), (1, '#f9e2ba')] if warm else
                     [(0, '#7d7470'), (0.4, '#a29a92'), (0.75, '#c1b7aa'), (1, '#ded3c1')])
    t = norm01(strata * 0.45 + big * 0.6 + grain * 0.06)
    col = ramp(t, stops)
    col *= (1 - 0.22 * crack[..., None]) * (1 + 0.05 * grain[..., None])
    h = strata * 0.5 + big * 0.5 - crack * 0.9 + grain * 0.05 + f1 * 0.25 * max(cracks, 0.15)
    rough = 0.82 + 0.1 * crack - 0.05 * norm01(big)
    return to8(col), normal_from_height(h, 3.0), to8(pack_rough(np.clip(rough, 0, 1)))


def plaster(n=1024, seed=3, colors=('#f4d6aa', '#e6be8e', '#d4a677'), brick='#c98a5c'):
    """Mud plaster over mud bricks: smooth hand-trowelled plaster, a few patches fallen off showing bricks, hairline cracks."""
    y, x = np.mgrid[0:n, 0:n] / n
    big = fbm(n, seed, 2.8, 1)
    trowel = fbm(n, seed + 1, 2.0, 3, 40, aniso=(0.6, 1.4))
    grain = fbm(n, seed + 2, 0.0, n / 6)
    # bricks: 4 courses per tile, 2 bricks per course, running bond
    rows = 6
    by = y * rows
    row = np.floor(by)
    bx = x * 3 + 0.5 * (row % 2)
    fy, fx = by - row, bx - np.floor(bx)
    mortar = np.maximum(smooth(0.06, 0.0, np.minimum(fy, 1 - fy)), smooth(0.03, 0.0, np.minimum(fx, 1 - fx)))
    bid = (row * 7 + np.floor(bx) * 13) % 5 / 5
    patch = smooth(1.45, 1.75, fbm(n, seed + 3, 3.2, 1, 8) + 0.2 * grain)  # where the plaster is gone
    f1, f2, _ = voronoi(n, seed + 4, 14)
    crack = (1 - smooth(0.0, 0.025, f2 - f1)) * smooth(0.2, 0.6, fbm(n, seed + 5, 2.5, 1, 6)) * (1 - patch)
    pl = ramp(norm01(big * 0.7 + trowel * 0.3), [(0, colors[2]), (0.55, colors[1]), (1, colors[0])])
    br = hex2rgb(brick) * (0.85 + 0.25 * bid[..., None]) * (1 + 0.08 * grain[..., None])
    br = br * (1 - 0.35 * mortar[..., None]) + hex2rgb('#c9a27a') * 0.35 * mortar[..., None]
    col = pl * (1 - patch[..., None]) + br * patch[..., None]
    edge = smooth(0.0, 0.25, patch) * smooth(0.6, 0.25, patch)
    col *= (1 - 0.25 * edge[..., None]) * (1 - 0.4 * crack[..., None]) * (1 + 0.04 * grain[..., None])
    h = trowel * 0.25 + big * 0.2 + (1 - patch) * 1.0 - patch * mortar * 0.5 - crack * 0.6 + grain * 0.04
    rough = 0.9 - 0.08 * norm01(trowel) + 0.05 * patch
    return to8(col), normal_from_height(h, 2.4), to8(pack_rough(np.clip(rough, 0, 1)))


def wood(n=1024, seed=4, planks=4, colors=('#b98552', '#8f5d34', '#6b4224'), weathered=True):
    """Weathered planks along V (grain vertical), `planks` per tile, dark seams, knots."""
    y, x = np.mgrid[0:n, 0:n] / n
    px = x * planks
    pid = np.floor(px)
    fx = px - pid
    rng = np.random.default_rng(seed)
    off = rng.random(planks)[pid.astype(int) % planks]
    grain = fbm(n, seed, 1.6, 2, None, aniso=(1.0, 0.04))
    rings = np.sin((fx * 6 + grain * 1.5 + off * 10) * np.pi * 2) * 0.5
    fine = fbm(n, seed + 1, 0.6, 10, None, aniso=(1.0, 0.05))
    seam = smooth(0.035, 0.0, np.minimum(fx, 1 - fx))
    f1, _, _ = voronoi(n, seed + 2, 6)
    knot = smooth(0.18, 0.0, f1)
    t = norm01(rings * 0.5 + fine * 0.3 + off[..., None][..., 0] * 0.6)
    col = ramp(t, [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    if weathered:
        col = col * 0.85 + hex2rgb('#a08a72') * 0.15 * norm01(fbm(n, seed + 3, 2.5, 1))[..., None]
    col *= (1 - 0.55 * seam[..., None]) * (1 - 0.35 * knot[..., None])
    h = fine * 0.3 + rings * 0.2 - seam * 1.5 - knot * 0.3
    rough = 0.78 + 0.1 * norm01(fine)
    return to8(col), normal_from_height(h, 3.0), to8(pack_rough(np.clip(rough, 0, 1)))


def reeds(n=1024, seed=5, colors=('#f2d894', '#d9b46a', '#ad8644')):
    """Thatch of dry reeds/palm leaves along U (strands horizontal in V rows), for roofs and the reed mat edges."""
    y, x = np.mgrid[0:n, 0:n] / n
    strands = fbm(n, seed, 1.2, 3, None, aniso=(0.03, 1.0))
    layer = np.sin((y * 5 + 0.15 * fbm(n, seed + 1, 3, 1, 4)) * 2 * np.pi)
    lay = smooth(-0.2, 1.0, layer)
    fine = fbm(n, seed + 2, 0.4, 30, None, aniso=(0.05, 1.0))
    t = norm01(strands * 0.7 + fine * 0.3 + lay * 0.5)
    col = ramp(t, [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    col *= (0.85 + 0.15 * lay[..., None])
    h = strands * 0.5 + fine * 0.3 + lay * 0.8
    rough = 0.85 + 0.05 * fine
    return to8(col), normal_from_height(h, 3.2), to8(pack_rough(np.clip(rough, 0, 1)))


def weave(n=1024, seed=6, cells=16, colors=('#e6c27e', '#c8984f', '#9c6c32'), band=None, diagonal=False):
    """Over-under plain weave of flat palm-leaf strips (basket / mat). `cells` crossings per tile.
    band = (v0, v1, '#hex', '#hex2'): dyed strands between v0..v1 (fraction of V), alternating two colours."""
    y, x = np.mgrid[0:n, 0:n] / n
    if diagonal:
        x, y = (x + y) % 1.0, (x - y) % 1.0
    u, v = x * cells, y * cells
    iu, iv = np.floor(u), np.floor(v)
    fu, fv = u - iu, v - iv
    over = ((iu + iv) % 2) == 0         # horizontal strip on top
    # strip profile: rounded across its width, gap at the edges
    ph = np.sin(np.clip(fv, 0, 1) * np.pi) ** 0.6      # horizontal strip (runs along u)
    pv = np.sin(np.clip(fu, 0, 1) * np.pi) ** 0.6
    # bending over/under along the strip
    bh = np.cos((fu - 0.5) * np.pi) * 0.5
    bv = np.cos((fv - 0.5) * np.pi) * 0.5
    hh = np.where(over, ph * (0.6 + bh), pv * (0.6 + bv))
    gap = np.where(over, ph, pv)
    fh = fbm(n, seed + 1, 0.3, 60, None, aniso=(0.05, 1.0))
    fv_ = fbm(n, seed + 2, 0.3, 60, None, aniso=(1.0, 0.05))
    fiber = np.where(over, fh, fv_)
    rng = np.random.default_rng(seed + 9)
    tone_u = rng.random(cells)[iu.astype(int) % cells]
    tone_v = rng.random(cells)[iv.astype(int) % cells]
    tone = np.where(over, tone_v, tone_u)
    col = ramp(norm01(tone * 0.6 + fiber * 0.15 + hh * 0.4), [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    if band:
        v0, v1, c1, c2 = band
        inb = (y >= v0) & (y < v1)
        dyed = np.where((iv % 2)[..., None] == 0, hex2rgb(c1), hex2rgb(c2)) * (0.85 + 0.3 * tone[..., None])
        sel = (inb & over)[..., None]
        col = np.where(sel, dyed * (0.8 + 0.25 * hh[..., None]), col)
    shade = smooth(0.0, 0.35, gap)
    col *= (0.35 + 0.65 * shade[..., None]) * (1 + 0.06 * fiber[..., None])
    h = hh + fiber * 0.06
    rough = 0.72 + 0.12 * (1 - shade)
    return to8(col), normal_from_height(h, 4.0), to8(pack_rough(np.clip(rough, 0, 1)))


def rope(n=512, seed=7, colors=('#d9b77a', '#b38a4e', '#7d5a2c')):
    """Twisted palm-fibre rope: diagonal strands along U (rope runs along U)."""
    y, x = np.mgrid[0:n, 0:n] / n
    s = (x * 8 + y * 3) % 1.0
    prof = np.sin(s * np.pi) ** 0.5
    fib = fbm(n, seed, 0.4, 40, None, aniso=(0.3, 1.0))
    col = ramp(norm01(prof * 0.8 + fib * 0.2), [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    col *= (0.45 + 0.55 * prof[..., None])
    return to8(col), normal_from_height(prof + fib * 0.05, 4.0), to8(pack_rough(0.85 + 0.05 * fib))


def clay(n=512, seed=8, colors=('#d98a56', '#c06d3e', '#9c5230'), lines=True):
    """Terracotta: soft blotches, potter's wheel lines along U (around), dark speckles."""
    y, x = np.mgrid[0:n, 0:n] / n
    big = fbm(n, seed, 2.8, 1)
    grain = fbm(n, seed + 1, 0.0, n / 5)
    wheel = np.sin(y * 2 * np.pi * 40 + fbm(n, seed + 2, 2.5, 1, 6) * 0.8) * (0.5 if lines else 0)
    col = ramp(norm01(big * 0.8 + wheel * 0.1), [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    sp = (grain > 2.4)[..., None]
    col = np.where(sp, col * 0.6, col) * (1 + 0.04 * grain[..., None])
    h = wheel * 0.25 + big * 0.2 + grain * 0.03
    rough = 0.78 + 0.08 * norm01(big)
    return to8(col), normal_from_height(h, 2.0), to8(pack_rough(rough))


def bark(n=512, seed=9):
    """Date-palm trunk: overlapping leaf-base scales in rings (V along the trunk, U around)."""
    y, x = np.mgrid[0:n, 0:n] / n
    rows = 10
    v = y * rows
    r = np.floor(v)
    u = x * 8 + 0.5 * (r % 2)
    fu, fv = u - np.floor(u), v - r
    scale = smooth(0.0, 0.25, fv) * (1 - smooth(0.75, 1.0, fv)) * (0.6 + 0.4 * np.sin(fu * np.pi))
    tip = np.abs(fu - 0.5) < (0.5 - fv * 0.45)
    fib = fbm(n, seed, 0.5, 30, None, aniso=(1.0, 0.1))
    h = np.where(tip, 1 - fv * 0.8, 0.1) + fib * 0.08
    col = ramp(norm01(h + fib * 0.2), [(0, '#86663f'), (0.5, '#a8835a'), (1, '#c9a678')])
    col *= (0.78 + 0.22 * smooth(0.0, 0.4, h)[..., None])
    return to8(col), normal_from_height(h, 3.0), to8(pack_rough(0.88 + 0.05 * fib))


def cloth(n=512, seed=10, color='#c9b48d'):
    y, x = np.mgrid[0:n, 0:n] / n
    a = np.sin(x * 2 * np.pi * 64) * np.sin(y * 2 * np.pi * 64)
    big = fbm(n, seed, 2.5, 1)
    col = hex2rgb(color)[None, None, :] * (0.9 + 0.08 * big[..., None] + 0.04 * a[..., None])
    return to8(col), normal_from_height(a * 0.3 + big * 0.1, 2.0), to8(pack_rough(0.9 + 0 * a))


def leaf(n=512, seed=11):
    """Palm leaflet: midrib along U, parallel veins, slight colour gradient. Vertex colours tint it per frond."""
    y, x = np.mgrid[0:n, 0:n] / n
    mid = smooth(0.03, 0.0, np.abs(y - 0.5))
    veins = np.sin(y * 2 * np.pi * 14) * 0.5 + 0.5
    fib = fbm(n, seed, 1.0, 10, None, aniso=(0.05, 1.0))
    col = ramp(norm01(x * 0.6 + fib * 0.4), [(0, '#d2dcc0'), (0.6, '#e6eed6'), (1, '#f6f8ea')])
    col = col * (0.92 + 0.08 * veins[..., None]) + mid[..., None] * 0.12
    h = mid * 0.6 + veins * 0.1 + fib * 0.05
    return to8(col), normal_from_height(h, 2.0), to8(pack_rough(0.6 + 0.1 * fib))


def blocks(n=1024, seed=21, rows=4, cols=3, colors=('#f6dcae', '#e9c48e', '#d6a96f'), mortar='#c79b68', groove=0.07, bevel=0.16, relief=2.6):
    """Ashlar of soft sandstone blocks (the toy-city look of the poster): `rows` courses × `cols` blocks per tile in running
    bond, every block a slightly different warm tone, rounded (bevelled) edges sinking into deep mortar grooves, fine grain.
    Used for walls (box UVs) and for paving (top UVs)."""
    y, x = np.mgrid[0:n, 0:n] / n
    by = y * rows
    row = np.floor(by)
    bx = x * cols + 0.5 * (row % 2)
    col_i = np.floor(bx)
    fy, fx = by - row, bx - col_i
    # distance to the block edge in block units (x scaled to the same physical size)
    dx = np.minimum(fx, 1 - fx) * rows / cols   # a block is (1/cols) wide and (1/rows) tall in the tile
    dy = np.minimum(fy, 1 - fy)
    d = np.minimum(dx, dy)
    g = groove / 2
    pillow = smooth(g, g + bevel, d)          # 0 in the groove, rising over the bevel to 1 on the face
    rng = np.random.default_rng(seed)
    tone = rng.random(64)
    bid = ((row.astype(int) * 7 + col_i.astype(int) * 13) % 64)
    t = tone[bid]
    grain = fbm(n, seed + 2, 0.0, n / 6)
    big = fbm(n, seed + 3, 2.6, 1)
    face = ramp(np.clip(t * 0.8 + 0.2 * norm01(big), 0, 1), [(0, colors[2]), (0.5, colors[1]), (1, colors[0])])
    col = face * (1 + 0.06 * grain[..., None])
    col = col * pillow[..., None] + hex2rgb(mortar) * (1 - pillow[..., None]) * 0.85
    col *= (0.9 + 0.1 * pillow[..., None])
    chips = smooth(0.72, 0.86, fbm(n, seed + 5, 2.4, 2, 24)) * smooth(g + bevel * 1.2, g, d)   # worn, chipped edges
    col *= (1 - 0.12 * chips[..., None])
    h = pillow * 1.0 + grain * 0.03 + big * 0.08 * pillow - chips * 0.25
    rough = 0.88 - 0.05 * pillow
    return to8(col), normal_from_height(h, relief), to8(pack_rough(np.clip(rough, 0, 1)))


def stripes(n=512, seed=22, count=6, colors=('#c8382c', '#f1d9a4'), threads=80):
    """Striped woven awning cloth (red / cream like the poster's stall): `count` stripe pairs across U, plain weave."""
    y, x = np.mgrid[0:n, 0:n] / n
    s = (np.floor(x * count * 2) % 2)[..., None]
    c0, c1 = hex2rgb(colors[0]), hex2rgb(colors[1])
    col = c0 * (1 - s) + c1 * s
    w = 0.5 + 0.5 * np.sin(x * 2 * np.pi * threads) * np.sin(y * 2 * np.pi * threads)
    big = fbm(n, seed, 2.5, 1)
    col = col * (0.88 + 0.1 * w[..., None] + 0.06 * big[..., None])
    return to8(col), normal_from_height(w * 0.4 + big * 0.1, 2.0), to8(pack_rough(0.88 + 0 * w))


def image_tex(n=1024, path=None, relief=2.0, rough=0.85, seam=0.22, bright=1.0, rotate=False):
    """A painted texture (e.g. tools/texture-ai.mjs → assets/textures/*.jpg) as a tileable set: the picture is cross-faded with
    itself shifted by half a tile near the edges (no seam where it repeats), the normal map comes from its brightness (joints and
    dark grain sink), a flat roughness."""
    img = np.asarray(Image.open(path).convert('RGB').resize((n, n), Image.LANCZOS)).astype(np.float32) / 255.0
    if rotate:                      # grain along the other axis (a log beam: its tube UVs run v along the length)
        img = np.ascontiguousarray(np.rot90(img))
    rolled = np.roll(np.roll(img, n // 2, 0), n // 2, 1)
    t = np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n * seam)
    w1 = np.clip(t, 0, 1)
    w = np.minimum(w1[:, None], w1[None, :])
    w = w * w * (3 - 2 * w)
    col = img * w[..., None] + rolled * (1 - w[..., None])
    col = np.clip(col * bright, 0, 1)
    lum = col @ np.array([0.3, 0.55, 0.15], dtype=np.float32)
    h = blur(lum, 1.2)
    return to8(col), normal_from_height(h, relief), to8(pack_rough(np.full((n, n), rough, dtype=np.float32)))

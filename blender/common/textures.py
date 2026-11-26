"""Procedural, tileable PBR detail textures baked with numpy (deterministic; no Blender render needed).

Every map is greyscale-ish detail meant to be MULTIPLIED by a colour at runtime (material.color), so one texture
serves every robe colour. Normal maps are tangent space, OpenGL convention (+Y = up the V axis), as glTF wants.
"""
import numpy as np


def pnoise(size, period, seed=0):
    """Periodic value noise on a size x size grid with `period` lattice cells across (tileable)."""
    rng = np.random.default_rng(seed)
    lat = rng.random((period, period))
    x = np.arange(size) * period / size
    i = np.floor(x).astype(int); f = x - i
    u = f * f * (3 - 2 * f)
    i0 = i % period; i1 = (i + 1) % period
    a = lat[np.ix_(i0, i0)]; b = lat[np.ix_(i0, i1)]; c = lat[np.ix_(i1, i0)]; d = lat[np.ix_(i1, i1)]
    U = u[None, :]; V = u[:, None]
    return (a * (1 - U) + b * U) * (1 - V) + (c * (1 - U) + d * U) * V


def pfbm(size, period, octaves=4, seed=0):
    s = np.zeros((size, size)); amp = 0.5; tot = 0
    for o in range(octaves):
        s += amp * pnoise(size, period * (2 ** o), seed + o * 31)
        tot += amp; amp *= 0.5
    return s / tot


def height_to_normal(h, strength):
    """h: (H, W) height (tileable). Returns RGB normal map 0..1."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.5 * strength  # row 0 = top: +V is up
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def weave(size=1024, threads=96, seed=1, fuzz=0.35):
    """Woollen twill: returns (albedo, rough_rgb, normal)."""
    y, x = np.mgrid[0:size, 0:size] / size
    tx = x * threads; ty = y * threads
    # twill: warp over 2 / under 2, shifted every row
    cx = np.floor(tx).astype(int); cy = np.floor(ty).astype(int)
    over = ((cx + cy) % 4) < 2
    fx = tx - cx; fy = ty - cy
    warp = np.sin(np.pi * fx) ** 0.8 * (0.75 + 0.25 * np.cos(np.pi * (fy - 0.5)))
    weft = np.sin(np.pi * fy) ** 0.8 * (0.75 + 0.25 * np.cos(np.pi * (fx - 0.5)))
    h = np.where(over, warp, weft)
    fz = pfbm(size, 32, 4, seed)
    slub = pnoise(size, 12, seed + 5)
    h = h * (0.75 + 0.25 * slub) + fuzz * (fz - 0.5)
    albedo = 0.80 + 0.12 * (h - h.mean()) / (h.std() + 1e-6) * 0.5 + 0.08 * (pfbm(size, 8, 3, seed + 9) - 0.5)
    albedo = np.clip(albedo, 0.55, 1.0)
    rough = np.clip(0.86 + 0.08 * (fz - 0.5), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 3.0)


def fur(size=1024, seed=3):
    """Shaggy sheepskin: clumps of strands running down the V axis."""
    y, x = np.mgrid[0:size, 0:size] / size
    clump = pnoise(size, 10, seed)
    warpx = x + 0.04 * (pnoise(size, 6, seed + 1) - 0.5)
    strands = 0.5 + 0.5 * np.sin(2 * np.pi * (warpx * 70 + 0.3 * pnoise(size, 24, seed + 2)))
    tufts = pfbm(size, 16, 3, seed + 3)
    h = 0.55 * clump + 0.25 * strands * (0.4 + clump) + 0.35 * tufts
    albedo = np.clip(0.80 + 0.22 * (h - 0.5) + 0.05 * (pnoise(size, 5, seed + 4) - 0.5), 0.55, 1.0)
    rough = np.clip(0.9 + 0.06 * (tufts - 0.5), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 7.0)


def strands(size=512, seed=7, count=46, wave=0.03):
    """Sculpted toy hair / beard: soft grooves along V (locks), gentle waves."""
    y, x = np.mgrid[0:size, 0:size] / size
    xw = x + wave * np.sin(2 * np.pi * (y * 3 + 0.5 * pnoise(size, 4, seed)))
    g = 0.5 + 0.5 * np.cos(2 * np.pi * xw * count)
    lock = pnoise(size, 9, seed + 1)
    fine = 0.5 + 0.5 * np.cos(2 * np.pi * xw * count * 3.1)
    h = 0.7 * g ** 1.5 + 0.2 * fine + 0.25 * lock
    albedo = np.clip(0.86 + 0.16 * (h - 0.5), 0.6, 1.0)
    rough = np.clip(0.55 + 0.15 * (1 - g), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 4.0)


def plastic(size=512, seed=11):
    """Injection-moulded plastic: almost flat, tiny orange-peel, roughness that varies a little."""
    n1 = pfbm(size, 24, 4, seed)
    rough = np.clip(0.34 + 0.10 * (n1 - 0.5) + 0.05 * (pnoise(size, 6, seed + 3) - 0.5), 0, 1)
    rgb = np.ones((size, size, 3)) * (0.985 + 0.015 * (pnoise(size, 8, seed + 4)[..., None] - 0.5))
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(n1, 0.35)


def leather(size=512, seed=13):
    n1 = pfbm(size, 20, 4, seed)
    cells = pnoise(size, 48, seed + 1)
    h = 0.6 * n1 + 0.4 * cells
    albedo = np.clip(0.85 + 0.2 * (h - 0.5), 0.5, 1)
    rough = np.clip(0.6 + 0.15 * (h - 0.5), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 2.0)


def rope(size=512, seed=17, ply=3, twist=7.0):
    """Twisted rope (three plies spiralling along V): diagonal ridges + fibre fuzz. Returns (albedo, rough_rgb, normal)."""
    y, x = np.mgrid[0:size, 0:size] / size
    ph = (x * ply + y * twist) % 1.0
    ridge = np.sin(np.pi * ph) ** 0.7
    fib = 0.5 + 0.5 * np.sin(2 * np.pi * (x * ply * 9 + y * twist * 9 + 0.6 * pnoise(size, 16, seed)))
    h = 0.8 * ridge + 0.12 * fib + 0.12 * pfbm(size, 24, 3, seed + 1)
    albedo = np.clip(0.72 + 0.32 * (h - 0.5), 0.45, 1.0)
    rough = np.clip(0.88 + 0.06 * (fib - 0.5), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 6.0)


def knit(size=1024, cols=16, rows=20, seed=23):
    """Chunky hand knitting (stockinette): columns of V stitches, each V = two plump slanted loops of plied yarn with a
    fuzzy halo. `cols` x `rows` stitches per tile; U runs across the columns, V down the rows. Returns (albedo, rough, normal)."""
    y, x = np.mgrid[0:size, 0:size] / size
    tx = x * cols; ty = y * rows
    cx = np.floor(tx).astype(int); cy = np.floor(ty).astype(int)
    fx = tx - cx - 0.5; fy = ty - cy                       # fx -0.5..0.5 across the column, fy 0..1 down the row
    rng = np.random.default_rng(seed)
    jit = rng.random((rows, cols))                         # per-stitch plumpness (hand-made unevenness)
    jt = jit[cy % rows, cx % cols]
    h = np.zeros_like(x)
    for s in (-1, 1):                                      # the two legs of the V
        # a leg runs from the top outer corner (s*0.47, -0.2) to the bottom middle (s*0.04, 1.05) of the cell
        ax, ay, bx, by = s * 0.46, -0.25, s * 0.03, 1.08
        for oy in (-1, 0, 1):                              # the neighbour rows' legs overlap (the stitches interlock)
            px = fx; py = fy - oy
            dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
            t = np.clip(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1)
            qx = px - (ax + t * dx); qy = py - (ay + t * dy)
            d = np.sqrt(qx * qx + qy * qy)
            w = 0.215 * (0.9 + 0.2 * jt) * (0.75 + 0.25 * np.sin(np.pi * t))   # plump in the middle of the leg
            leg = np.sqrt(np.clip(1 - (d / w) ** 2, 0, 1))
            # plies twisting along the leg
            ply = 0.5 + 0.5 * np.cos(2 * np.pi * (t * 5.5 + (qx * dy - qy * dx) / np.sqrt(L2) * 2.2 * s))
            leg = leg * (0.86 + 0.14 * ply)
            h = np.maximum(h, leg * (1 if oy == 0 else 0.92))
    fz = pfbm(size, 64, 4, seed + 1)
    halo = pfbm(size, 160, 2, seed + 2)
    h = h * (0.92 + 0.08 * fz) + 0.07 * (halo - 0.5)
    # the gaps between the loops fall into shadow; each loop is lighter on its crown
    # heathered wool: every stitch a slightly different shade, light flecks of fibre in it, a fuzzy halo
    shade = 0.86 + 0.26 * pnoise(size, cols * 2, seed + 5)
    fl = pnoise(size, 300, seed + 4) * 0.6 + pnoise(size, 97, seed + 6) * 0.4; fleck = np.clip((fl - 0.74) * 5, 0, 1) * np.clip(h * 2, 0, 1)
    albedo = (0.40 + 0.60 * np.clip(h, 0, 1) ** 0.7) * shade + 0.07 * (pfbm(size, 8, 3, seed + 3) - 0.5) + 0.10 * (halo - 0.5) + 0.45 * fleck
    albedo = np.clip(albedo, 0.25, 1.25) / 1.1
    rough = np.clip(0.9 + 0.06 * (fz - 0.5), 0, 1)
    rgb = np.stack([albedo] * 3, -1)
    rr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
    return rgb, rr, height_to_normal(h, 9.0)

"""Signed-distance modelling for organic toy parts (beards, hair, hands, cloaks, hats).

Everything is in THREE.js coordinates (Y up, the figure faces +Z); `bl.py` converts to Blender when the mesh is made.
An SDF is a function f(P) -> d for P an (N, 3) float array (negative inside). Primitives + smooth unions, then
`mesh_sdf()` polygonises it with vectorised *surface nets* (one vertex per voxel, quads across sign changes),
projects the vertices onto the zero level (Newton steps) and returns (verts, quads). Pure numpy, deterministic.
"""
import numpy as np


# ---------------------------------------------------------------- primitives
def _len(v):
    return np.sqrt(np.maximum(np.sum(v * v, axis=-1), 1e-18))


def sphere(c, r):
    c = np.asarray(c, float)
    return lambda P: _len(P - c) - r


def ellipsoid(c, rad):
    """Approximate SDF of an ellipsoid (Inigo Quilez' bound) — good enough for smooth blends."""
    c = np.asarray(c, float); rad = np.asarray(rad, float)

    def f(P):
        q = (P - c)
        k0 = _len(q / rad)
        k1 = _len(q / (rad * rad))
        return k0 * (k0 - 1.0) / k1
    return f


def capsule(a, b, ra, rb=None):
    """Round cone from a (radius ra) to b (radius rb)."""
    a = np.asarray(a, float); b = np.asarray(b, float)
    rb = ra if rb is None else rb
    ba = b - a; L2 = float(np.dot(ba, ba))

    def f(P):
        pa = P - a
        h = np.clip((pa @ ba) / L2, 0.0, 1.0)
        return _len(pa - h[:, None] * ba) - (ra + (rb - ra) * h)
    return f


def spline_tube(points, radii, samples=48):
    """A tube along a Catmull-Rom curve through `points` with radius interpolated from `radii` (per point)."""
    pts = np.asarray(points, float); rr = np.asarray(radii, float)
    n = len(pts)
    S = []
    for i in range(n - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(n - 1, i + 2)]
        for s in np.linspace(0, 1, samples // (n - 1), endpoint=False):
            t2, t3 = s * s, s * s * s
            q = 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            S.append((q, rr[i] + (rr[i + 1] - rr[i]) * (3 * t2 - 2 * t3)))
    S.append((pts[-1], rr[-1]))
    parts = [capsule(S[i][0], S[i + 1][0], S[i][1], S[i + 1][1]) for i in range(len(S) - 1)]
    return union(*parts)


def rbox(c, half, r):
    """Rounded box: centre, half extents, corner radius."""
    c = np.asarray(c, float); half = np.asarray(half, float)

    def f(P):
        q = np.abs(P - c) - (half - r)
        return _len(np.maximum(q, 0.0)) + np.minimum(np.max(q, axis=-1), 0.0) - r
    return f


def plane(n, d):
    """Half space n·P - d < 0 is inside."""
    n = np.asarray(n, float); n = n / np.linalg.norm(n)
    return lambda P: P @ n - d


# ---------------------------------------------------------------- operators
def union(*fs):
    def f(P):
        out = fs[0](P)
        for g in fs[1:]:
            out = np.minimum(out, g(P))
        return out
    return f


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def sunion(k, *fs):
    def f(P):
        out = fs[0](P)
        for g in fs[1:]:
            out = smin(out, g(P), k)
        return out
    return f


def ssub(k, a, b):
    """a minus b, smooth."""
    def f(P):
        return -smin(-a(P), b(P), k)
    return f


def sub(a, b):
    return lambda P: np.maximum(a(P), -b(P))


def inter(a, b, k=0.0):
    if k <= 0:
        return lambda P: np.maximum(a(P), b(P))
    return lambda P: -smin(-a(P), -b(P), k)


def displace(f, g):
    return lambda P: f(P) + g(P)


def transform(f, M):
    """f evaluated in the frame of the 4x4 matrix M (object -> world): world point P -> M^-1 P."""
    Mi = np.linalg.inv(np.asarray(M, float))

    def g(P):
        Q = P @ Mi[:3, :3].T + Mi[:3, 3]
        return f(Q)
    return g


# deterministic value noise (hash of the integer lattice) — for fur, curls, strands
def _hash3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0xFFFFFF)


def vnoise(P, freq, seed=0):
    Q = P * freq
    i = np.floor(Q).astype(np.int64); fr = Q - i
    u = fr * fr * (3 - 2 * fr)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out = out + w * _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out * 2.0 - 1.0


def fbm(P, freq, octaves=3, seed=0):
    s, a, f = 0.0, 0.5, freq
    for o in range(octaves):
        s = s + a * vnoise(P, f, seed + o * 17)
        a *= 0.5; f *= 2.03
    return s


# ---------------------------------------------------------------- polygonisation (surface nets)
def mesh_sdf(f, lo, hi, step, project=2, chunk=400000):
    lo = np.asarray(lo, float) - 2 * step; hi = np.asarray(hi, float) + 2 * step
    n = np.ceil((hi - lo) / step).astype(int) + 1
    xs = lo[0] + np.arange(n[0]) * step; ys = lo[1] + np.arange(n[1]) * step; zs = lo[2] + np.arange(n[2]) * step
    G = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1).reshape(-1, 3)
    F = np.concatenate([f(G[i:i + chunk]) for i in range(0, len(G), chunk)]).reshape(n)
    inside = F < 0
    # cells: corners c[dx,dy,dz]
    nc = n - 1
    corners = [(dx, dy, dz) for dx in (0, 1) for dy in (0, 1) for dz in (0, 1)]
    cv = [F[dx:dx + nc[0], dy:dy + nc[1], dz:dz + nc[2]] for dx, dy, dz in corners]
    cmin = np.minimum.reduce(cv); cmax = np.maximum.reduce(cv)
    active = (cmin < 0) & (cmax >= 0)
    idx = -np.ones(nc, dtype=np.int64)
    act = np.argwhere(active)
    idx[active] = np.arange(len(act))
    # vertex = mean of the zero crossings on the 12 cell edges
    acc = np.zeros((len(act), 3)); cnt = np.zeros(len(act))
    edges = [(a, b) for a in range(8) for b in range(a + 1, 8) if sum(abs(np.array(corners[a]) - np.array(corners[b]))) == 1]
    base = np.stack([xs[act[:, 0]], ys[act[:, 1]], zs[act[:, 2]]], -1)
    vals = [c[active] for c in cv]
    for a, b in edges:
        va, vb = vals[a], vals[b]
        m = (va < 0) != (vb < 0)
        t = np.where(m, va / np.where(m, va - vb, 1.0), 0.0)
        pa = np.array(corners[a], float); pb = np.array(corners[b], float)
        p = base + step * (pa[None] + t[:, None] * (pb - pa)[None])
        acc[m] += p[m]; cnt[m] += 1
    V = acc / np.maximum(cnt, 1)[:, None]
    # quads across every grid edge with a sign change
    quads = []
    for ax in range(3):
        e = np.zeros(3, int); e[ax] = 1
        s0 = inside[:n[0] - e[0], :n[1] - e[1], :n[2] - e[2]]
        s1 = inside[e[0]:, e[1]:, e[2]:]
        ch = s0 != s1
        # the 4 cells around the edge need the two other axes >= 1
        o = [i for i in range(3) if i != ax]
        P = np.argwhere(ch)
        ok = (P[:, o[0]] >= 1) & (P[:, o[1]] >= 1) & (P[:, o[0]] < nc[o[0]] + 1) & (P[:, o[1]] < nc[o[1]] + 1)
        P = P[ok]
        P = P[(P[:, ax] < nc[ax])]
        flip = s0[tuple(P.T)]
        def cell(d0, d1):
            Q = P.copy(); Q[:, o[0]] -= d0; Q[:, o[1]] -= d1
            Q = np.minimum(Q, nc - 1)
            return idx[tuple(Q.T)]
        c00, c10, c11, c01 = cell(0, 0), cell(1, 0), cell(1, 1), cell(0, 1)
        q = np.stack([c00, c10, c11, c01], -1)
        good = (q >= 0).all(1)
        q = q[good]; fl = flip[good]
        if ax == 1:
            fl = ~fl
        q[fl] = q[fl][:, ::-1]
        quads.append(q)
    Q = np.concatenate(quads)[:, ::-1].copy()
    # Newton projection onto the surface (smooth silhouettes, exact normals)
    for _ in range(project):
        h = step * 0.25
        d = f(V)
        g = np.stack([(f(V + [h, 0, 0]) - f(V - [h, 0, 0])), (f(V + [0, h, 0]) - f(V - [0, h, 0])), (f(V + [0, 0, h]) - f(V - [0, 0, h]))], -1) / (2 * h)
        gl = np.maximum(np.sum(g * g, -1), 1e-12)
        V = V - np.clip(d / gl, -step, step)[:, None] * g
    return V, Q


def sdf_normals(f, V, h=1e-3):
    g = np.stack([(f(V + [h, 0, 0]) - f(V - [h, 0, 0])), (f(V + [0, h, 0]) - f(V - [0, h, 0])), (f(V + [0, 0, h]) - f(V - [0, 0, h]))], -1)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-12)


def rcyl(c, r, halfh, rr):
    """Rounded vertical cylinder: centre c, radius r, half height halfh, edge radius rr."""
    c = np.asarray(c, float)

    def f(P):
        q = P - c
        d = np.stack([np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) - (r - rr), np.abs(q[:, 1]) - (halfh - rr)], -1)
        return _len(np.maximum(d, 0.0)) + np.minimum(np.max(d, -1), 0.0) - rr
    return f


def head_shape(grow=0.0):
    """The toy head (cylinder 2.965..3.935, r 0.56, rounded edges) grown by `grow`."""
    return rcyl((0, 3.45, 0), 0.56 + grow, 0.485 + grow, 0.10 + grow)


def superellipsoid(c, rad, n=2.5):
    c = np.asarray(c, float); rad = np.asarray(rad, float)

    def f(P):
        q = np.abs(P - c) / rad
        k = np.sum(q ** n, -1) ** (1.0 / n)
        return (k - 1.0) * rad.min()
    return f

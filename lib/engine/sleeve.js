// Mâneca dintr-o bucată, cu cotul rotunjit pe fiecare desen: port al maneci_bake.Sleeve.drawing.
// Mâneca e rigidă pe braț și pe antebraț; între ele axa ocolește cotul pe un arc (exteriorul
// rotund), iar marginea interioară a brațului se oprește în pliu.
const FILLET = 0.3;
const REACH = 0.5;
const MITER = 3;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export class Sleeve {
  /**
   * `rest`: Float32Array xyz în spațiul armăturii; `onUpper`: Uint8Array (ponderea brațului > .5);
   * `bones`: repausul oaselor (restOf) pentru latura dată.
   */
  constructor(rest, onUpper, side, restBones, clothCount = rest.length / 3) {
    this.rest = rest; this.onUpper = onUpper; this.side = side;
    const S = restBones[`upper_arm.${side}`].head, E = restBones[`forearm.${side}`].head, W = restBones[`hand.${side}`].head;
    this.head = S;
    this.upper = Math.hypot(S[0] - E[0], S[1] - E[1]);
    this.lower = Math.hypot(E[0] - W[0], E[1] - W[1]);
    const n = rest.length / 3;
    this.d = new Float32Array(n);
    this.shoulderBlend = new Float32Array(n);
    this.cuffBow = new Float32Array(n);
    const cuffWidths = new Map();
    const end = this.upper + this.lower;
    let half = 0;
    for (let i = 0; i < n; i++) {
      this.d[i] = S[1] - rest[i * 3 + 1];
      if (Math.abs(this.d[i] - this.upper) < 0.05) half = Math.max(half, Math.abs(rest[i * 3] - S[0]));
    }
    for (let i = 0; i < n; i++) {
      const d = this.d[i];
      this.shoulderBlend[i] = smooth((d + 0.02) / (0.64 * this.upper));
      if (i >= clothCount || d < end - 0.20) continue;
      const key = Math.round(d * 10000);
      cuffWidths.set(key, Math.max(cuffWidths.get(key) ?? 0, Math.abs(rest[3 * i] - S[0])));
    }
    // Also bend the embroidered stitches onto the same cylindrical cuff.
    const sections = [...cuffWidths].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < n; i++) {
      const d = this.d[i];
      if (d < end - 0.18 || !sections.length) continue;
      const key = Math.round(d * 10000);
      const right = sections.findIndex(([k]) => k >= key);
      const [k0, r0] = sections[right < 0 ? sections.length - 1 : Math.max(0, right - 1)];
      const [k1, r1] = sections[right < 0 ? sections.length - 1 : right];
      const radius = k0 === k1 ? r0 : r0 + (r1 - r0) * (key - k0) / (k1 - k0);
      const x = rest[3 * i] - S[0];
      this.cuffBow[i] = Math.sqrt(Math.max(0, radius * radius - x * x)) * smooth((d - end + 0.18) / 0.045);
    }
    this.half = half;
    this.out = new Float32Array(rest.length);
  }

  /** `mu`, `mf`: matricile de deformare (4×4, coloane, ca three.Matrix4.elements); S, E, W: capetele oaselor. */
  drawing(mu, mf, S, E, W, lift = 0, liftRamp = null, chestAngle = 0, elevation = 0) {
    const { rest, onUpper, d, out } = this;
    const n = rest.length / 3;
    for (let i = 0; i < n; i++) {
      const m = onUpper[i] ? mu : mf;
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      out[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] + (liftRamp ? lift * liftRamp[i] : 0);
    }
    const Lu = Math.hypot(E[0] - S[0], E[1] - S[1]), Lf = Math.hypot(W[0] - E[0], W[1] - E[1]);
    if (Lu < 1e-6 || Lf < 1e-6) return out;
    const u = [(E[0] - S[0]) / Lu, (E[1] - S[1]) / Lu], f = [(W[0] - E[0]) / Lf, (W[1] - E[1]) / Lf];
    const upperAngle = Math.atan2(u[0], -u[1]);
    const swing = Math.atan2(Math.sin(upperAngle - chestAngle), Math.cos(upperAngle - chestAngle));
    const lengthRatio = Lu / this.upper;
    for (let i = 0; i < n; i++) {
      const weight = this.shoulderBlend[i];
      if (weight < 1) {
        // Hold the collar end of the cap on the torso. Let its outer fabric
        // turn progressively with the humerus without flattening the crown.
        const angle = upperAngle - (1 - weight) * Math.max(-0.9, Math.min(0.9, swing));
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = rest[3 * i] - this.head[0], y = -d[i] * (1 + weight * (lengthRatio - 1));
        out[3 * i] = S[0] + x * cos - y * sin;
        out[3 * i + 1] = S[1] + x * sin + y * cos;
      } else if (this.cuffBow[i]) {
        const bow = this.cuffBow[i] * Math.sin(elevation) * 0.69;
        out[3 * i] += f[0] * bow;
        out[3 * i + 1] += f[1] * bow;
      }
    }
    const cross = u[0] * f[1] - u[1] * f[0];
    const theta = Math.acos(Math.max(-1, Math.min(1, u[0] * f[0] + u[1] * f[1])));
    if (theta < 1e-3) return out;
    const bend = cross > 0 ? 1 : -1;
    const perp = (v) => [-v[1] * bend, v[0] * bend];
    const n1 = perp(u), n2 = perp(f);
    const halfTan = Math.tan(theta / 2);
    const T = Math.min(FILLET * this.half * halfTan, REACH * Lu, REACH * Lf);
    const R = T / halfTan;
    const C = [E[0] - u[0] * T + n1[0] * R, E[1] - u[1] * T + n1[1] * R];
    const su = Lu / this.upper, sf = Lf / this.lower;
    const dA = this.upper - T / su, dB = this.upper + T / sf;
    const denominator = Math.max(1 + n1[0] * n2[0] + n1[1] * n2[1], 1e-6);
    const room = 0.8 * Math.min(Lu, Lf);
    for (let i = 0; i < n; i++) {
      const up = onUpper[i];
      const bx = up ? S[0] + d[i] * su * u[0] : E[0] + (d[i] - this.upper) * sf * f[0];
      const by = up ? S[1] + d[i] * su * u[1] : E[1] + (d[i] - this.upper) * sf * f[1];
      const lx = out[i * 3] - bx, ly = out[i * 3 + 1] - by;
      const o = up ? lx * n1[0] + ly * n1[1] : lx * n2[0] + ly * n2[1];
      if (d[i] > dA && d[i] < dB && o <= 0) {
        const phi = (d[i] - dA) / (dB - dA) * theta * bend;
        const c = Math.cos(phi), s = Math.sin(phi);
        const r0 = [-n1[0], -n1[1]];
        const radial = [c * r0[0] - s * r0[1], s * r0[0] + c * r0[1]];
        out[i * 3] = C[0] + radial[0] * R - radial[0] * o;
        out[i * 3 + 1] = C[1] + radial[1] * R - radial[1] * o;
      } else if (o > 0) {
        let mx = o * (n1[0] + n2[0]) / denominator, my = o * (n1[1] + n2[1]) / denominator;
        const length = Math.hypot(mx, my);
        const k1 = Math.min(1, MITER * o / Math.max(length, 1e-9));
        mx *= k1; my *= k1;
        const along = Math.max(mx * f[0] + my * f[1], -(mx * u[0] + my * u[1]));
        const k2 = Math.min(1, room / Math.max(along, 1e-9));
        mx *= k2; my *= k2;
        const M = [E[0] + mx, E[1] + my];
        if (up && (out[i * 3] - M[0]) * u[0] + (out[i * 3 + 1] - M[1]) * u[1] > 0) {
          out[i * 3] = M[0]; out[i * 3 + 1] = M[1];
        }
      }
    }
    return out;
  }
}

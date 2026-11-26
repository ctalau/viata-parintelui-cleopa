// Every clip x every beard / hat / cloak variant through the self-collision test (tests/engine3-clips.test.mjs,
// `npm run clipcheck`). A clip that puts a hand into the head, the beard into the chest or a leg through the robe
// can never ship. Pure three.js (Node or browser).
import { Character } from './character.js';
import { Body, selfCollisions, restBaseline } from './collide.js';
import { variant } from './anim.js';

export const TEST_LOOKS = {
  bare: { preset: 'young', hair: 'short', beard: 'none', hat: 'none', cloak: 'none' },
  short: { preset: 'monk', hair: 'short', beard: 'short', hat: 'none', cloak: 'none' },
  full_cap: { preset: 'monk', beard: 'full', hat: 'cap', cloak: 'none' },
  long_cowl: { preset: 'elder', beard: 'long', hat: 'cowl', cloak: 'mantle' },
  rope_cowl: { preset: 'elder', beard: 'long', hat: 'cowl', cloak: 'mantle', beltStyle: 'rope', belt: '#c9a46a' },
  fluffy_culion: { preset: 'elder', beard: 'fluffy', hat: 'culion', cloak: 'mantle', beltStyle: 'rope', belt: '#c9a46a', face: 'detailed', brows: 'bushy' },
  fluffy_openhood: { preset: 'elder', beard: 'fluffy', hat: 'openhood', cloak: 'mantle', beltStyle: 'rope', belt: '#c9a46a', face: 'detailed', brows: 'bushy' },
  long_kam: { preset: 'elder', beard: 'long', hat: 'kamilavka', cloak: 'mantle', hair: 'long' },
  curly_fleece: { preset: 'young', hair: 'curly', beard: 'none', hat: 'none', cloak: 'fleece' },
};

export function checkClips(asset, { looks = TEST_LOOKS, clips = null, hz = 15, tolScale = 1 } = {}) {
  const problems = [];
  for (const [lk, look] of Object.entries(looks)) {
    const ch = new Character(asset, look, { faces: false });
    const body = new Body(ch, { stride: 2 });
    ch.pose([]); ch.root.updateMatrixWorld(true); restBaseline(body);
    const names = clips || Object.keys(asset.clips);
    const done = new Set();
    for (const base of names) {
      // the runtime plays the look's variant of a clip (cross -> cross_beard for long beards)
      const name = variant(asset, base.replace(/_beard$/, ''), ch.look, base.endsWith('_L') ? 'L' : 'R') || base;
      const key = `${lk}:${name}`;
      if (done.has(key) || (base.endsWith('_beard') && !['long', 'full', 'fluffy'].includes(ch.look.beard))) continue;
      if (ch.look.beard === 'long' && /^talk[24]/.test(base)) continue; // never played by long beards (anim.js picks talk1 / talk3)
      done.add(key);
      const C = asset.clips[name];
      const n = Math.max(2, Math.ceil(C.duration * hz));
      const worst = new Map();
      for (let i = 0; i <= n; i++) {
        const t = (C.duration * i) / n;
        ch.pose([{ clip: name, t, w: 1 }]);
        ch.root.updateMatrixWorld(true);
        body.begin();
        for (const c of selfCollisions(body)) {
          const k = `${c.a}>${c.b}`;
          if (!worst.has(k) || worst.get(k).depth < c.depth) worst.set(k, { ...c, t });
        }
      }
      for (const [k, c] of worst) if (c.depth > 0) problems.push({ look: lk, clip: name, pair: k, depth: +c.depth.toFixed(3), t: +c.t.toFixed(2), kind: c.kind });
    }
  }
  void tolScale;
  return problems;
}

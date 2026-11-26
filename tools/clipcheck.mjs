// npm run clipcheck [-- --clips cross,pray --looks long_cowl]: self-collision of every clip x look variant (Node)
import { parseArgs } from './lib/common.mjs';
import { loadMonk } from '../tests/engine3-lib.mjs';
import { checkClips, TEST_LOOKS } from '../lib/engine3/clipcheck.js';
const args = parseArgs();
const asset = await loadMonk();
const looks = args.looks ? Object.fromEntries(String(args.looks).split(',').map((k) => [k, TEST_LOOKS[k]])) : TEST_LOOKS;
const t0 = Date.now();
const P = checkClips(asset, { looks, clips: args.clips ? String(args.clips).split(',') : null, hz: +(args.hz || 15) });
for (const p of P) console.log(`  ⚠ ${p.clip.padEnd(13)} ${p.look.padEnd(13)} ${p.pair.padEnd(26)} ${p.kind} ${p.depth.toFixed(3)} at ${p.t}s`);
console.log(P.length ? `${P.length} problem(s)` : 'clips: no self-collision ✓', `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
process.exitCode = P.length ? 1 : 0;

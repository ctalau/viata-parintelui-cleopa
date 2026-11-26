// What a render machine (RunPod pod) needs from the repo to render films exactly like the local preview.
// Every file the render page loads must be in here: a file left out does not crash the page by itself — an icon became a
// plain board on YouTube because assets/ was not uploaded. tests/bundle.test.mjs checks every film against this list.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './common.mjs';

export const RENDER_FILES = ['package.json', 'lib', 'tools', 'assets', 'node_modules/three/build', 'node_modules/three/examples/jsm',
  'node_modules/three/package.json', 'node_modules/@fontsource/fredoka', 'node_modules/three-mesh-bvh'];

/** Repo-relative files a film references outside its own folder (icon images, …). */
export async function filmAssets(dir) {
  const { descriptorImages } = await import('../../lib/components/props.js').catch(() => ({}));
  const desc = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  if (descriptorImages) return descriptorImages(desc);
  // props.js needs three (always installed here); fallback: every "src" string
  return [...JSON.stringify(desc).matchAll(/"src"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** true if `rel` (repo-relative) is inside one of the bundled paths. */
export const inBundle = (rel, extra = []) => [...RENDER_FILES, ...extra].some((p) => rel === p || rel.startsWith(p + '/'));

/** The list of paths to tar for these film folders; throws when a film references a file that is missing or not bundled. */
export async function bundlePaths(videoDirs) {
  const rels = videoDirs.map((d) => path.relative(ROOT, d));
  for (const d of videoDirs) for (const a of await filmAssets(d)) {
    if (!fs.existsSync(path.join(ROOT, a))) throw new Error(`${path.basename(d)}: ${a} does not exist`);
    if (!inBundle(a, rels)) throw new Error(`${path.basename(d)}: ${a} is not in the render bundle (tools/lib/bundle.mjs RENDER_FILES)`);
  }
  return [...RENDER_FILES, ...rels];
}

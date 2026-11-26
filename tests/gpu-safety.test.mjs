// The YouTube MP4s are rendered on NVIDIA GPUs, the reviewed stills with SwiftShader. NaN from bump mapping (normalize of a
// zero derivative) is 0 on SwiftShader but NaN on NVIDIA, and the blur passes smear it into big black blocks (039).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

const stageSrc = fs.readFileSync(new URL('../lib/engine/stage.js', import.meta.url), 'utf8');

test('the bump-map chunk is patched: every normalize is guarded', async () => {
  const { SAFE_BUMP } = await import('../lib/engine/stage.js');
  const orig = fs.readFileSync(new URL('../node_modules/three/src/renderers/shaders/ShaderChunk/bumpmap_pars_fragment.glsl.js', import.meta.url), 'utf8');
  const patched = SAFE_BUMP(orig);
  // a three upgrade that changes the chunk must not silently drop the guard
  assert.ok(!/normalize\( dFdx/.test(patched) && !/normalize\( dFdy/.test(patched), 'unguarded normalize(dFdx/dFdy) left');
  assert.ok(!/return normalize\( abs\( fDet \)/.test(patched), 'unguarded final normalize left');
  assert.match(THREE.ShaderChunk.bumpmap_pars_fragment, /return surf_norm/, 'stage.js applies the patch to THREE.ShaderChunk');
});

test('NaN pixels are scrubbed before the blur passes', () => {
  const i = stageSrc.indexOf('new RenderPass('), s = stageSrc.indexOf('ShaderPass(SCRUB_NAN)', i), b = stageSrc.indexOf('new UnrealBloomPass(');
  assert.ok(i > 0 && s > i && s < b, 'SCRUB_NAN must follow the RenderPass, before bloom');
});

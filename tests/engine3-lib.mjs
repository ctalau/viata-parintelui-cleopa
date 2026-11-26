// Node helpers for the blender-style tests: load monk.glb WITHOUT its textures (no DOM needed) as a CharacterAsset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../lib/engine3/assets.js';
import { CharacterAsset } from '../lib/engine3/character.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readGLBJson(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + n).toString('utf8')), bin: b.subarray(20 + n + 8), buf: b };
}

/** the GLB with images / textures removed (materials keep their factors) */
export function strippedGLB(file) {
  const { json, buf } = readGLBJson(file);
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) {
    const p = m.pbrMetallicRoughness || {};
    delete p.baseColorTexture; delete p.metallicRoughnessTexture; delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    for (const k of Object.keys(m.extensions || {})) { const e = m.extensions[k]; for (const kk of Object.keys(e)) if (/Texture$/.test(kk)) delete e[kk]; }
  }
  const n = buf.readUInt32LE(12);
  const binChunk = buf.subarray(20 + n);
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + binChunk.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const out = Buffer.concat([head, jh, js, binChunk]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

let cached = null;
export async function loadMonk() {
  if (cached) return cached;
  const file = path.join(ROOT, 'assets/characters/monk.glb');
  const gltf = await parseGLB(strippedGLB(file));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/characters/monk.json'), 'utf8'));
  return (cached = new CharacterAsset(gltf, meta));
}

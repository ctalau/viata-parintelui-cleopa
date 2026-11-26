import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial,
  OrthographicCamera, Scene, SRGBColorSpace, TextureLoader, WebGLRenderer,
} from 'three';

const ROOT = '/assets/film/';

async function response(url) {
  const result = await fetch(url);
  if (!result.ok) throw new Error(`${url} · HTTP ${result.status}`);
  return result;
}

export async function createFilm(canvas) {
  const info = await (await response(ROOT + 'index.json')).json();
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, depth: true });
  renderer.setClearColor('#292929');
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 100);
  const textures = new Map();
  const loader = new TextureLoader();
  const loaded = new Map();
  let current;
  let frameDrawn = -1;

  function texture(name) {
    if (!textures.has(name)) {
      const pending = loader.loadAsync(ROOT + 'textures/' + encodeURIComponent(name)).then((map) => {
        map.colorSpace = SRGBColorSpace;
        return map;
      }).catch((error) => {
        textures.delete(name);
        throw error;
      });
      textures.set(name, pending);
    }
    return textures.get(name);
  }

  async function load(shot) {
    const [definition, binary] = await Promise.all([
      response(ROOT + shot.id + '.json').then((result) => result.json()),
      response(ROOT + shot.id + '.bin').then((result) => new Response(
        result.body.pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer()),
    ]);
    const floats = ([offset, count]) => new Float32Array(binary, offset, count);
    const data = (track) => ({ values: floats(track.data), stride: track.stride });
    const scene = new Scene();
    const materialCache = new Map();
    function getMaterial(definition) {
      const key = JSON.stringify(definition);
      if (!materialCache.has(key)) {
        const pending = (async () => new MeshBasicMaterial({
          color: new Color().fromArray(definition.color),
          side: DoubleSide,
          ...(definition.image && { map: await texture(definition.image), alphaTest: .5 }),
        }))();
        materialCache.set(key, pending);
      }
      return materialCache.get(key);
    }
    const nodes = await Promise.all(definition.objects.map(async (object) => {
      const geometry = new BufferGeometry();
      const coords = new BufferAttribute(floats(object.positions).slice(), 3);
      geometry.setAttribute('position', coords);
      geometry.setIndex(new BufferAttribute(new Uint32Array(binary, ...object.indices), 1));
      if (object.uv) geometry.setAttribute('uv', new BufferAttribute(floats(object.uv), 2));
      const materials = await Promise.all(object.materials.map(getMaterial));
      for (const group of object.groups) geometry.addGroup(...group);
      const mesh = new Mesh(geometry, materials.length === 1 ? materials[0] : materials);
      mesh.name = object.name;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      return {
        mesh, coords, matrix: data(object.matrix), visible: new Uint8Array(binary, ...object.visible),
        deform: object.deform && data(object.deform),
      };
    }));
    for (const { mesh } of nodes) scene.add(mesh);
    return {
      scene, nodes, count: definition.count, cameras: floats(definition.camera),
      dispose() {
        for (const { mesh } of nodes) mesh.geometry.dispose();
        for (const material of materialCache.values()) material.then((item) => item.dispose());
      },
    };
  }

  function preload(shot) {
    if (!loaded.has(shot.id)) {
      loaded.set(shot.id, load(shot).catch((error) => {
        loaded.delete(shot.id);
        throw error;
      }));
    }
    return loaded.get(shot.id);
  }

  function shotAt(frame) {
    return info.shots.findLastIndex((shot) => shot.frame <= frame);
  }

  function fit(width, height, pixelRatio = 1) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    frameDrawn = -1;
  }

  let requestedTime = 0;
  let pendingDraw;
  const frameAt = (time) => Math.min(info.end, Math.max(1, Math.floor(time*info.fps+.00001)+1));

  function draw(time) {
    requestedTime = time;
    pendingDraw ??= Promise.resolve().then(drawLatest).finally(() => { pendingDraw = undefined; });
    return pendingDraw;
  }

  async function drawLatest() {
    let index = frameAt(requestedTime);
    let slot = shotAt(index);
    let shot = info.shots[slot];
    while (current?.id !== shot.id) {
      const view = await preload(shot);
      index = frameAt(requestedTime);
      const latest = shotAt(index);
      if (latest !== slot) {
        slot = latest;
        shot = info.shots[slot];
        continue;
      }
      current = { id: shot.id, view };
      const keep = info.shots.slice(Math.max(0, slot-1), slot+2);
      for (const [id, pending] of loaded) {
        if (keep.some((entry) => entry.id === id)) continue;
        loaded.delete(id);
        pending.then((old) => old.dispose(), () => {});
      }
      if (info.shots[slot+1]) preload(info.shots[slot+1]).catch(() => {});
    }
    const { nodes, cameras, count, scene } = current.view;
    const sample = Math.min(count-1, Math.floor((index-shot.frame)/info.step));
    const frame = shot.frame + sample*info.step;
    if (frame === frameDrawn) return frame;
    const [x, y, z, width] = cameras.subarray(sample*4, sample*4+4);
    camera.position.set(x, y, z);
    camera.left = -width/2;
    camera.right = width/2;
    camera.top = width*9/32;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    for (const { mesh, visible, matrix, coords, deform } of nodes) {
      mesh.visible = Boolean(visible[sample]);
      if (!mesh.visible) continue;
      const start = sample * matrix.stride;
      mesh.matrix.set(...matrix.values.subarray(start, start+12), 0, 0, 0, 1);
      mesh.matrixWorldNeedsUpdate = true;
      if (deform) {
        const from = sample * deform.stride;
        coords.array.set(deform.values.subarray(from, from+coords.array.length));
        coords.needsUpdate = true;
      }
    }
    renderer.render(scene, camera);
    frameDrawn = frame;
    canvas.dataset.frame = frame;
    return frame;
  }

  return { info, draw, fit };
}

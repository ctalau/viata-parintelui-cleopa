import { Group, MathUtils, OrthographicCamera, Scene } from 'three';

export function assembleScene(clip, assets) {
  const scene = new Scene();
  const { center, width } = clip.camera;
  const height = width * 9 / 16;
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 80);
  const objects = new Map();
  const motions = [];

  for (const item of clip.objects) {
    const template = assets.get(item.asset);
    if (!template) throw new Error(`Obiect necunoscut: ${item.asset}`);
    if (objects.has(item.id)) throw new Error(`ID de instanță duplicat: ${item.id}`);
    const node = new Group();
    node.name = item.id;
    node.position.fromArray(item.position);
    node.scale.setScalar(item.scale ?? 1);
    node.rotation.z = MathUtils.degToRad(item.rotation ?? 0);
    node.add(template.clone(true));
    // Parents precede their children in the descriptor so placement stays local.
    const parent = item.parent ? objects.get(item.parent) : scene;
    if (!parent) throw new Error(`Instanța părinte trebuie declarată prima: ${item.parent}`);
    parent.add(node);
    objects.set(item.id, node);
    if (item.keys?.length) motions.push([node, item.keys]);
  }

  function setTime(time) {
    for (const [node, keys] of motions) {
      const next = keys.findIndex(({ at }) => at > time);
      if (next === -1 || next === 0) {
        node.position.fromArray(next === 0 ? keys[0].position : keys.at(-1).position);
        continue;
      }
      const a = keys[next - 1];
      const b = keys[next];
      const t = MathUtils.smoothstep(time, a.at, b.at);
      node.position.set(...a.position.map((value, axis) => MathUtils.lerp(value, b.position[axis], t)));
    }
  }

  function setAngle(degrees) {
    const angle = MathUtils.degToRad(degrees);
    camera.position.set(center[0] + 20 * Math.sin(angle), center[1], 20 * Math.cos(angle));
    camera.lookAt(...center, 0);
  }

  setAngle(0);
  setTime(0);
  return { scene, camera, objects, setTime, setAngle };
}

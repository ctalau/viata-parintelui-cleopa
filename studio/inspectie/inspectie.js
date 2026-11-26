const $ = (id) => document.getElementById(id);
const colors = ['#dca753', '#5f8bd0', '#3fa389', '#cc6867'];
const formatDepth = new Intl.NumberFormat('ro', { maximumFractionDigits: 2 });
const jointNames = ['Piept', 'Braț', 'Antebraț', 'Mână'];

function svg(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function drawWeights({ weights }) {
  const centers = weights.map(([distance, ...row]) => {
    const x = distance * 300;
    let total = 0;
    return [x, ...row.map((value) => 65 * (1 - (total += value)))];
  });
  colors.forEach((color, group) => {
    const top = centers.map((row) => [row[0], row[group + 1]]);
    const bottom = centers.map((row) => [row[0], group === 0 ? 65 : row[group]]).reverse();
    $('weights').append(svg('polygon', { points: [...top, ...bottom].join(' '), fill: color }));
    const label = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = color;
    label.append(swatch, jointNames[group]);
    $('weight-legend').append(label);
  });
}

function setup(data) {
  const video = $('shot');
  const slider = $('frame');
  const overlay = $('overlay');
  const stage = overlay.parentElement;
  const layerPreview = $('layer-preview');
  const select = $('bone');
  const last = data.frames.length - 1;
  const startTime = (data.start - 1) / data.fps;
  const endTime = data.end / data.fps;
  let mode = 'joint';
  let actor = 'costica';
  let layer = 'all';
  let current = (data.snapshot - data.start) / data.step;
  const timestamp = (index) => (data.start + index * data.step - 0.5) / data.fps;
  slider.min = data.start;
  slider.max = data.start + last * data.step;
  slider.step = data.step;
  $('snapshot-note').textContent = `Straturi la cadrul Blender ${data.snapshot} · ${data.camera}`;

  function draw(index) {
    current = index;
    const frame = data.start + index * data.step;
    slider.value = frame;
    $('frame-readout').textContent = `Cadru ${frame}`;
    const sample = data.frames[index];
    overlay.replaceChildren();
    if (mode === 'layers') return;
    if (mode === 'rig') {
      const selected = Number(select.value);
      const bones = sample.rigs[actor];
      for (const [i, [x1, y1, x2, y2]] of bones.entries()) {
        if (i === selected) continue;
        overlay.append(svg('line', { x1, y1, x2, y2, stroke: '#fffdf0', 'stroke-opacity': 0.76, 'stroke-width': 2.5 }));
      }
      const [x1, y1, x2, y2] = bones[selected];
      overlay.append(svg('line', { x1, y1, x2, y2, stroke: '#ffce66', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
        overlay.append(svg('circle', { cx, cy, r: 5, fill: '#ffce66', stroke: '#332b20', 'stroke-width': 1.5 }));
      }
      return;
    }
    const grid = data.sleeve.faces.map((face) => `M${face.map((id) => sample.sleeve[id].join(',')).join('L')}Z`).join('');
    overlay.append(svg('path', { d: grid, fill: '#ffe09a', 'fill-opacity': 0.12, stroke: '#ffe09a', 'stroke-width': 1.4 }));
    for (const [joint, color] of [['upper_arm.R', colors[1]], ['forearm.R', colors[2]], ['hand.R', colors[3]]]) {
      const i = data.rigs.costica.bones.findIndex(({ name }) => name === joint);
      const [cx, cy] = sample.rigs.costica[i];
      overlay.append(svg('circle', { cx, cy, r: 5.5, fill: color, stroke: '#fffaf2', 'stroke-width': 1.5 }));
    }
  }

  function seek(index) {
    const next = Math.min(last, Math.max(0, index));
    draw(next);
    if (video.readyState > 0) video.currentTime = timestamp(next);
  }

  function sync(mediaTime) {
    if (mode === 'layers') return;
    if (mediaTime >= endTime) {
      video.pause();
      seek(last);
      return;
    }
    const index = Math.floor((mediaTime - startTime + 0.0001) * data.fps / data.step);
    const next = Math.max(0, Math.min(last, index));
    if (next !== current) draw(next);
  }

  function setLayer(id) {
    layer = id;
    const item = data.layers.find((entry) => entry.id === id);
    video.hidden = Boolean(item);
    layerPreview.hidden = !item;
    if (item) {
      layerPreview.src = `/inspectie/${id}.webp`;
      layerPreview.alt = item.label;
    }
    for (const button of $('layers').children) button.setAttribute('aria-pressed', button.value === id);
    const objects = item?.objects ?? data.layers.flatMap((entry) => entry.objects);
    $('object-summary').textContent = `Obiecte în cadru (${objects.length})`;
    $('objects').replaceChildren(...objects.map(([name, type, minZ, maxZ]) => {
      const li = document.createElement('li');
      const label = document.createElement('small');
      const depth = minZ === maxZ ? formatDepth.format(minZ) : `${formatDepth.format(minZ)}…${formatDepth.format(maxZ)}`;
      label.textContent = `${type} · Z ${depth}`;
      li.append(name, ' · ', label);
      return li;
    }));
  }

  function updateBone() {
    const { parent } = data.rigs[actor].bones[select.value];
    $('bone-parent').textContent = parent ? `Os părinte · ${parent}` : 'Rădăcina rigului';
    draw(current);
  }

  function setActor(id) {
    actor = id;
    for (const button of $('characters').children) button.setAttribute('aria-pressed', button.value === id);
    select.replaceChildren(...data.rigs[id].bones.map(({ name }, index) => new Option(name, index)));
    select.value = data.rigs[id].bones.findIndex(({ name }) => name === 'forearm.R');
    updateBone();
  }

  function choice(container, id, label, choose) {
    const button = document.createElement('button');
    button.type = 'button';
    button.value = id;
    button.textContent = label;
    button.addEventListener('click', () => choose(id));
    $(container).append(button);
  }

  for (const { id, label } of [{ id: 'all', label: 'Cadrul întreg' }, ...data.layers]) {
    choice('layers', id, label, setLayer);
  }
  for (const id of Object.keys(data.rigs)) {
    choice('characters', id, data.layers.find((entry) => entry.id === id).label, setActor);
  }

  function updateZoom() {
    stage.classList.toggle('zoomed', mode === 'joint' && $('zoom').checked);
  }

  function setMode(next) {
    video.pause();
    mode = next;
    for (const button of document.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', button.dataset.mode === mode);
      $(`${button.dataset.mode}-panel`).hidden = button.dataset.mode !== mode;
    }
    const inspectingLayer = mode === 'layers';
    $('transport').hidden = inspectingLayer;
    $('zoom-option').hidden = mode !== 'joint';
    updateZoom();
    $('snapshot-note').hidden = !inspectingLayer;
    if (inspectingLayer) {
      seek((data.snapshot - data.start) / data.step);
      setLayer(layer);
    } else {
      video.hidden = false;
      layerPreview.hidden = true;
      draw(current);
    }
  }

  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
  $('zoom').addEventListener('change', updateZoom);
  select.addEventListener('change', updateBone);
  slider.addEventListener('input', () => {
    video.pause();
    seek((Number(slider.value) - data.start) / data.step);
  });
  for (const [id, offset] of [['previous', -1], ['next', 1]]) {
    $(id).addEventListener('click', () => {
      video.pause();
      seek(current + offset);
    });
  }
  $('play-shot').addEventListener('click', async () => {
    if (!video.paused) {
      video.pause();
      return;
    }
    if (current === last) seek(0);
    try {
      await video.play();
      $('video-status').hidden = true;
    } catch {
      $('video-status').textContent = 'Scena nu a putut fi redată. Încearcă din nou.';
      $('video-status').hidden = false;
    }
  });
  video.addEventListener('play', () => { $('play-shot').textContent = 'Pauză'; });
  video.addEventListener('pause', () => { $('play-shot').textContent = 'Redă scena'; });
  video.addEventListener('loadedmetadata', () => seek(current));
  if ('requestVideoFrameCallback' in video) {
    const update = (_, metadata) => {
      if (!video.paused && !video.seeking) sync(metadata.mediaTime);
      video.requestVideoFrameCallback(update);
    };
    video.requestVideoFrameCallback(update);
  } else {
    video.addEventListener('timeupdate', () => {
      if (!video.paused && !video.seeking) sync(video.currentTime);
    });
  }

  drawWeights(data.sleeve);
  setActor(actor);
  setMode(mode);
  seek(current);
  $('loading').hidden = true;
  $('workbench').hidden = false;
}

try {
  const response = await fetch('/inspectie/scene.json');
  if (!response.ok) throw new Error('Date indisponibile');
  setup(await response.json());
} catch (error) {
  $('loading').textContent = 'Datele inspectorului nu s-au încărcat. Reîncarcă pagina.';
  console.error(error);
}

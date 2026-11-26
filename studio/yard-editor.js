const editor = document.querySelector('#cadru-2');
const form = document.querySelector('#yard-controls');
const storageKey = 'cleopa-ograda-straturi-v1';
const layers = [...form.querySelectorAll('fieldset')].map((group) => {
  const visible = group.querySelector('input[type="checkbox"]');
  const [x, y] = group.querySelectorAll('input[type="range"]');
  return { image: document.getElementById(group.dataset.yardImage), visible, x, y };
});
const inputs = layers.flatMap(({ visible, x, y }) => [visible, x, y]);

function updateLayers() {
  for (const { image, visible, x, y } of layers) {
    image.hidden = !visible.checked;
    image.style.transform = `translate(${x.value}%, ${y.value}%)`;
    for (const input of [x, y]) {
      const value = `${input.value}%`;
      input.nextElementSibling.value = value;
      input.setAttribute('aria-valuetext', value);
    }
  }
}

function saveLayers() {
  const values = Object.fromEntries(inputs.map((input) => [
    input.name, input.type === 'checkbox' ? input.checked : input.valueAsNumber,
  ]));
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // The editor still works when browser storage is unavailable.
  }
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  for (const input of inputs) {
    const value = saved?.[input.name];
    if (input.type === 'checkbox' && typeof value === 'boolean') input.checked = value;
    if (input.type === 'range' && Number.isFinite(value)) input.value = value;
  }
} catch {
  // Keep the scene defaults if the stored values cannot be read.
}

form.addEventListener('input', updateLayers);
form.addEventListener('change', saveLayers);
form.addEventListener('reset', () => requestAnimationFrame(() => {
  updateLayers();
  saveLayers();
}));
form.addEventListener('submit', (event) => event.preventDefault());
updateLayers();

function openLinkedEditor() {
  if (location.hash === '#cadru-2') editor.open = true;
}

document.querySelector('a[href="#cadru-2"]').addEventListener('click', () => {
  editor.open = true;
});
window.addEventListener('hashchange', openLinkedEditor);
openLinkedEditor();

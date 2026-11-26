const mode = new URLSearchParams(location.search);
const cuts = document.querySelector('#film-workbench');
if (cuts && !mode.has('mod') && !mode.has('clip') && !mode.has('export')) {
  cuts.hidden = false;
  document.querySelector('#assembly-workbench').hidden = true;
  const { mountShotViewer } = await import('../film/atelier.js');
  await mountShotViewer();
} else {
  await import('./asamblare.js');
}

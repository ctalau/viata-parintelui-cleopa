// Catalog page: shows how many problems were reported for each film (from localStorage) and copies them all.
import { loadIssues, issuesText } from './issues.js';
import { copyText } from './copy.js';

const films = [...document.querySelectorAll('.card')].map((c) => ({ id: c.dataset.film, title: c.dataset.title, el: c, issues: loadIssues(c.dataset.film) }));
let total = 0;
for (const f of films) {
  total += f.issues.length;
  const b = f.el.querySelector('.badge');
  if (f.issues.length) { b.textContent = f.issues.length; b.title = `${f.issues.length} probleme raportate`; b.classList.add('on'); }
}
const box = document.querySelector('.all-issues');
if (total) {
  box.classList.add('on');
  box.querySelector('span').textContent = `${total} probleme raportate în ${films.filter((f) => f.issues.length).length} filme (salvate în acest browser).`;
  const btn = box.querySelector('button');
  btn.onclick = async () => {
    await copyText(issuesText(films, { version: document.body.dataset.version }));
    const old = btn.textContent; btn.textContent = 'Copiat ✓'; setTimeout(() => (btn.textContent = old), 1600);
  };
}

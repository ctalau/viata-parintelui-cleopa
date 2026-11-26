// Problems reported on the web player: stored per film in this browser's localStorage, copied out as text.
const KEY = (film) => `lego-shorts:issues:${film}`;

export function loadIssues(film) {
  try { return JSON.parse(localStorage.getItem(KEY(film)) || '[]'); } catch { return []; }
}
export function saveIssues(film, issues) {
  try { if (issues.length) localStorage.setItem(KEY(film), JSON.stringify(issues)); else localStorage.removeItem(KEY(film)); } catch {}
}

/** 83.4 → "1:23" (or "1:23.4" with tenths). */
export function fmtTime(t, tenths = false) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${(tenths ? s.toFixed(1) : Math.floor(s).toString()).padStart(tenths ? 4 : 2, '0')}`;
}

/** Plain-text feedback for one or more films: [{ id, title, issues }]. */
export function issuesText(films, { url = '', version = '' } = {}) {
  const out = [];
  for (const f of films) {
    if (!f.issues.length) continue;
    const link = url && films.length === 1 ? ` — ${url}` : '';
    out.push(`Feedback film ${f.id} „${f.title}”${version ? ` (versiunea ${version})` : ''}${link}`);
    f.issues.forEach((it, i) => {
      const where = [`${it.t.toFixed(1)}s`, `scena ${it.scene}`, it.beat != null ? `replica #${it.beat}` : null].filter(Boolean).join(', ');
      out.push(`${i + 1}. [${fmtTime(it.t, true)}] ${it.text}`);
      const line = it.line ? `; ${it.who || ''}: „${it.line.length > 70 ? it.line.slice(0, 67) + '…' : it.line}”` : '';
      out.push(`   (${where}${line})`);
    });
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

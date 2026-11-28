// Verificările episodului pe scena motorului: node tools/engine/check.mjs <episod> [--step 2] [--json raport.json]
// Raportează mâini peste capetele altora, smucituri, vorbitori în afara cadrului, gura nemișcată
// în replici și cadrele care nu se refac identic după salturi (determinism). Iese cu 1 la probleme
// netolerate (episodes/<id>/allow.json: [{kind, who, from, to, reason}]).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { ROOT, serve } from './serve.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { step: { type: 'string', default: '2' }, json: { type: 'string' } } });
const [id] = positionals;
const server = await serve();
const browser = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let report;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/engine/still.html?ep=${id}&w=640`);
  await page.waitForFunction(() => window.gata, null, { timeout: 180000 });
  report = await page.evaluate(async (step) => {
    const { checkEpisode, checkDeterminism } = await import('/lib/engine/checks.js');
    const stage = window.stage;
    const problems = checkEpisode(stage, { step });
    const times = Array.from({ length: 10 }, (_, i) => Math.round((i + 0.37) / 10 * stage.duration * 24) / 24);
    problems.push(...checkDeterminism(stage, window.renderer, times));
    return problems;
  }, Number(values.step));
} finally { await browser.close(); server.close(); }
const allowFile = path.join(ROOT, 'episodes', id, 'allow.json');
const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : [];
const allowed = (p) => allow.find((a) => a.kind === p.kind && (!a.who || p.who === a.who) && (a.from == null || (p.from >= a.from && (p.to ?? p.from) <= a.to)));
for (const p of report) console.log(`${allowed(p) ? '·' : '⚠'} ${p.kind} ${p.from ?? ''}${p.to && p.to !== p.from ? `–${p.to}` : ''} ${p.who ?? ''} ${p.worst ?? p.detail ?? ''}${allowed(p) ? ` (permis: ${allowed(p).reason})` : ''}`);
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 1));
const bad = report.filter((p) => !allowed(p));
console.log(bad.length ? `CHECK_FAIL ${bad.length} probleme` : `CHECK_OK ${report.length} semnalări, toate permise`);
process.exit(bad.length ? 1 : 0);

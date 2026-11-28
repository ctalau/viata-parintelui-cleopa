// Verifică playerul generic (/motor/?ep=…) în Chromium: încărcare, salt, redare, cererile de rețea.
import { chromium } from 'playwright';
const [address = 'http://127.0.0.1:4173', ep = '002-semnul-crucii'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const urls = [];
const errors = [];
page.on('request', (r) => urls.push(r.url()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${address}/motor/?ep=${ep}`);
await page.waitForFunction(() => document.querySelector('#picture')?.dataset.frame, null, { timeout: 120000 });
await page.evaluate(() => { document.querySelector('#seek').value = '9'; document.querySelector('#seek').dispatchEvent(new Event('input')); });
await page.waitForFunction(() => Number(document.querySelector('#picture').dataset.frame) > 200, null, { timeout: 60000 });
const after = await page.$eval('#picture', (c) => c.dataset.frame);
await page.click('#play');
await page.waitForTimeout(2000);
const played = await page.$eval('#picture', (c) => c.dataset.frame);
console.log(JSON.stringify({ after, played, plan: urls.filter((u) => /plan-\d+/.test(u)).length, glb: urls.filter((u) => u.endsWith('.glb')).length, errors }));
await browser.close();
if (errors.length || Number(played) <= Number(after)) process.exit(1);

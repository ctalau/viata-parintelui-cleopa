// One image made of many labelled frames, composed in the recorder page (window.__studio.sheet*): the contact sheet
// of `npm run still` (+ the stills with check warnings, + the poster) and the review sheet of `npm run review`.
//   sections: [{ title?, cols, tileW, tiles: [{ t, crop?: actorId, label? }] }]  → JPEG data URL
// One sheet = one image to look at = one agent turn.
export async function composeSheet(page, sections, { width = 1640, aspect = 9 / 16, quality = 0.86 } = {}) {
  const pad = 6, titleH = 34;
  let h = pad;
  const laid = sections.filter((s) => s.tiles.length).map((s) => {
    const cols = Math.max(1, Math.min(s.cols, s.tiles.length)), tileW = s.tileW ?? Math.floor((width - pad * (cols + 1)) / cols);
    const tileH = Math.round(tileW * (s.aspect ?? aspect)), rows = Math.ceil(s.tiles.length / cols);
    const y0 = h + (s.title ? (s.titleH ?? titleH) : 0);
    h = y0 + rows * (tileH + pad);
    return { ...s, cols, tileW, tileH, y0 };
  });
  const W = Math.max(...laid.map((s) => s.cols * (s.tileW + pad) + pad), 200);
  await page.evaluate(([w, hh]) => window.__studio.sheetStart(w, hh), [W, h]);
  for (const s of laid) {
    if (s.title) await page.evaluate(([y, t, w, size]) => window.__studio.sheetText(8, y, t, size, '#222', w), [s.y0 - (s.titleH ?? titleH) + 2, s.title, W - 16, s.titleSize ?? 22]);
    for (const [i, tile] of s.tiles.entries()) {
      const x = pad + (i % s.cols) * (s.tileW + pad), y = s.y0 + Math.floor(i / s.cols) * (s.tileH + pad);
      tile.found = await page.evaluate(([t, x, y, w, hh, crop, label]) => window.__studio.sheetTile(t, x, y, w, hh, crop, label),
        [tile.t, x, y, s.tileW, s.tileH, tile.crop || null, tile.label || '']);
    }
  }
  return page.evaluate(([q]) => window.__studio.sheetEnd('image/jpeg', q), [quality]);
}
export const saveDataURL = async (fs, file, data) => fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
export const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

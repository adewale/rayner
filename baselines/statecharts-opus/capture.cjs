// Captures every step of index.html at 1280x720 and 390x844, writes a transcript and a contact sheet.
// Usage: node baselines/statecharts-opus/capture.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const dir = __dirname;
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(dir, 'index.html');

// Guesses a reader might make on predict steps (1-based step number -> radio values).
const guesses = { 4: ['2'], 8: ['4'], 13: ['yes'], 15: ['region', '6'] };
// Extra interactions captured as <step>-<width>-try.png to show the trace.
const tries = {
  2: ['SWITCH', 'SWITCH'],
  3: ['CAPS'],
  6: ['POWER_ON', 'START', 'GROUND', 'POWER_OFF'],
  11: ['PLAY', 'MUTE'],
  14: ['PLAY', 'MUTE'],
  16: ['POWER_ON', 'START', 'FROTH_ON', 'POWER_OFF'],
};

// At phone width, grow the viewport to the page height so the fixed footer sits at the end.
async function shot(page, w, h, file) {
  if (w === 1280) return page.screenshot({ path: file });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: w, height: Math.max(h, H) });
  await page.waitForTimeout(50);
  await page.screenshot({ path: file });
  await page.setViewportSize({ width: w, height: h });
}

(async () => {
  const browser = await chromium.launch();
  const transcript = [];
  const errors = [];
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${w}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${w}: ${m.text()}`); });
    await page.goto(url);
    const n = await page.evaluate(() => window.__steps);
    for (let i = 1; i <= n; i++) {
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) errors.push(`${w}: step ${i} has horizontal overflow`);
      if (w === 1280) {
        const fits = await page.evaluate(() => { const s = document.getElementById('stage'); return s.scrollHeight <= s.clientHeight + 1; });
        if (!fits) errors.push(`1280: step ${i} needs vertical scrolling inside the stage`);
      }
      await shot(page, w, h, path.join(out, `${i}-${w}.png`));
      if (w === 1280) {
        transcript.push(await page.evaluate((i) => {
          const q = s => document.querySelector(s);
          return {
            step: i,
            kicker: q('.kicker').innerText,
            heading: q('h2').innerText,
            text: q('.text').innerText.replace(q('.kicker').innerText, '').replace(q('h2').innerText, '').trim(),
            predict: q('.predicts') ? q('.predicts').innerText.trim() : '',
            figureText: q('.figure').innerText.trim(),
            figureDescriptions: [...document.querySelectorAll('.figure svg[role=img]')].map(s => s.getAttribute('aria-label')),
            nextButton: q('#next').innerText,
          };
        }, i));
      }
      if (tries[i]) {
        for (const ev of tries[i]) await page.getByRole('button', { name: ev, exact: true }).first().click();
        await page.waitForTimeout(80);
        await shot(page, w, h, path.join(out, `${i}-${w}-try.png`));
      }
      if (guesses[i]) {
        for (const g of guesses[i]) await page.locator(`input[type=radio][value="${g}"]`).evaluate(e => e.click());
      }
      if (i < n) await page.click('#next');
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'transcript.json'), JSON.stringify(transcript, null, 2));

  // Contact sheet of every 1280 screenshot.
  const n = transcript.length;
  const cells = Array.from({ length: n }, (_, k) => `<figure><img src="file://${path.join(out, `${k + 1}-1280.png`)}"><figcaption>${k + 1}. ${transcript[k].heading}</figcaption></figure>`).join('');
  const html = `<!doctype html><html><head><style>body{margin:0;background:#ddd;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px}figure{margin:0;background:#fff;padding:4px}img{width:100%;display:block;border:1px solid #bbb}figcaption{padding:4px 2px 0}</style></head><body><main>${cells}</main></body></html>`;
  const sheet = path.join(out, 'contact.html');
  fs.writeFileSync(sheet, html);
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('file://' + sheet);
  await page.waitForLoadState('load');
  await page.screenshot({ path: path.join(out, 'contact.png'), fullPage: true });
  fs.unlinkSync(sheet);
  await browser.close();
  console.log(errors.length ? 'ISSUES:\n' + errors.join('\n') : 'No errors.');
})();

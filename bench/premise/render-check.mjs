// Opens each page in Chromium, steps through every scenario of a method-only page, and reports console
// errors and the step count: node bench/premise/render-check.mjs <page.html>...
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch();
for (const file of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  let views = 0;
  const selects = await page.$$('select');
  const combos = [[]];
  for (const s of selects) {
    const values = await s.$$eval('option', (os) => os.map((o) => o.value));
    combos.splice(0, combos.length, ...combos.flatMap((c) => values.map((v) => [...c, v])));
  }
  if (selects.length) {
    for (const combo of combos) {
      for (let i = 0; i < selects.length; i++) await selects[i].selectOption(combo[i]);
      while (await page.$eval('.nav button:first-child', (b) => !b.disabled)) await page.click('.nav button:first-child');
      views++;
      while (await page.$eval('.nav button:last-child', (b) => !b.disabled)) {
        await page.click('.nav button:last-child');
        views++;
      }
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`${file}: ${views} views, ${errors.length} console errors${errors.length ? ': ' + errors.join(' | ') : ''}, horizontal overflow ${overflow}`);
  await page.close();
}
await browser.close();

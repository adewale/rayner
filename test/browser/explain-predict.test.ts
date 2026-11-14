// The player's prediction control (meta.predict): the reader chooses an option on the asking step,
// moves on either way, and the revealing step says what they chose and the answer, standalone, in a
// raw iframe, through the loader and on a phone, with the keyboard as with a pointer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Frame, Page } from 'playwright-core';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer, buildLoader } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';

const enabled = !!process.env.EXPLAIN_BROWSER,
  options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for served prediction checks' };
let browser: Browser, folder: string, server: Awaited<ReturnType<typeof serve>>, host: string;
let hostBody = '';
const hostServer = createServer((_, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(hostBody);
});

before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-predict-reader-'));
  await buildExplainer(await collectProject('test/fixtures/prediction', { write: false }), join(folder, 'prediction.html'));
  await buildLoader(join(folder, 'loader.js'));
  server = await serve(folder, 0, 'prediction.html');
  await new Promise<void>((r) => hostServer.listen(0, '127.0.0.1', r));
  host = `http://127.0.0.1:${(hostServer.address() as { port: number }).port}`;
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  server?.close();
  hostServer.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

type Where = Page | Frame;
/** Wait until the player rests on the step titled `title`. */
const resting = (where: Where, title: string) =>
  where.waitForFunction((t) => document.querySelector('[data-ready=true]') && document.querySelector('.lede strong')?.textContent === t && !document.querySelector('#content.loading'), title);
const pressed = (where: Where) => where.locator('.predict .option[aria-pressed=true]').allInnerTexts();

/** Choose `choice` on the first question, go on, and read the reveal; then the named reveal two steps on. */
async function choosesAndSees(where: Where, how: 'click' | 'keyboard' | 'tap') {
  await resting(where, 'Even or odd?');
  assert.equal(await where.locator('.predict-prompt').innerText(), 'Your prediction');
  assert.deepEqual(await where.locator('.predict .option').allInnerTexts(), ['Even', 'Odd']);
  assert.deepEqual(await pressed(where), []);
  assert.equal(await where.locator('.predict-said').innerText(), 'Choose one before you go on, or go on without choosing.');
  // The asking step does not show the answer.
  assert.equal(await where.locator('.predict-reveal').innerText(), '');
  const odd = where.locator('.predict .option', { hasText: 'Odd' });
  if (how === 'keyboard') {
    await odd.focus();
    await odd.press('Enter');
  } else if (how === 'tap') await odd.tap();
  else await odd.click();
  assert.deepEqual(await pressed(where), ['Odd']);
  assert.equal(await where.locator('.predict-said').innerText(), 'You chose “Odd”. Next shows the answer.');
  // A reader may change their mind before moving on.
  if (how === 'keyboard') {
    const even = where.locator('.predict .option', { hasText: 'Even' });
    await even.focus();
    await even.press(' ');
    assert.deepEqual(await pressed(where), ['Even']);
    await where.locator('.predict .option', { hasText: 'Odd' }).press('Enter');
  }
  await where.locator('.stepper .button.primary').click();
  await resting(where, 'The answer');
  assert.equal(await where.locator('.predict-reveal').innerText(), 'You predicted “Odd”; the answer is “Even”.');
  assert.equal(await where.locator('.predict-reveal p').getAttribute('data-outcome'), 'wrong');
  assert.ok(await where.locator('.predict-ask').isHidden());
  // Back on the asking step, the choice is still there.
  await where.locator('.stepper .button[aria-keyshortcuts=ArrowLeft]').click();
  await resting(where, 'Even or odd?');
  assert.deepEqual(await pressed(where), ['Odd']);
}

test('standalone: choose with a pointer, move on, and read “You predicted …; the answer is …”', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${server.url}/prediction.html?step=ask`);
    await resting(page, 'Even or odd?');
    // On a wide page the row sits at the top of the rail, beside the picture, as the live row does.
    assert.equal(await page.locator('.rail-body > .predict:first-child').count(), 1);
    await choosesAndSees(page, 'click');
    // The second prediction is revealed by a named later step, not the next one.
    await page.goto(`${server.url}/prediction.html?step=second`);
    await resting(page, 'Halving');
    assert.equal(await page.locator('.predict-prompt').innerText(), 'How many times does 12 halve before it is odd?');
    await page.locator('.predict .option', { hasText: '2' }).click();
    assert.equal(await page.locator('.predict-said').innerText(), 'You chose “2”. A later step shows the answer.');
    await page.locator('.stepper .button.primary').click();
    await resting(page, 'A pause');
    assert.ok(await page.locator('.predict').isHidden());
    await page.locator('.stepper .button.primary').click();
    await resting(page, 'The count');
    assert.equal(await page.locator('.predict-reveal').innerText(), 'How many times does 12 halve before it is odd? You predicted “2”, and the answer is “2”.');
    assert.equal(await page.locator('.predict-reveal p').getAttribute('data-outcome'), 'right');
  } finally {
    await page.close();
  }
});

test('beside the picture, a rail too long for the window keeps the prediction in view rather than scrolling to the step’s name', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 340 }, reducedMotion: 'reduce' });
  try {
    for (const [step, title] of [['second', 'Halving'], ['end', 'The count']] as const) {
      await page.goto(`${server.url}/prediction.html?step=${step}`);
      await resting(page, title);
      const { overflows, top, rail } = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('.rail-body')!, row = body.querySelector<HTMLElement>('.predict')!;
        return { overflows: body.scrollHeight > body.clientHeight, top: row.getBoundingClientRect().top, rail: body.getBoundingClientRect().top };
      });
      assert.ok(overflows, `${step}: the rail must overflow for this test to mean anything`);
      assert.ok(top >= rail - 1, `${step}: the prediction row starts ${rail - top} px above the rail's visible top`);
    }
  } finally {
    await page.close();
  }
});

test('moving on without choosing is allowed, and the reveal still gives the answer; each scenario has its own answer', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${server.url}/prediction.html?step=ask&n=7`);
    await resting(page, 'Even or odd?');
    await page.keyboard.press('ArrowRight');
    await resting(page, 'The answer');
    assert.equal(await page.locator('.predict-reveal').innerText(), 'The answer is “Odd”.');
    assert.equal(await page.locator('.predict-reveal p').getAttribute('data-outcome'), 'none');
  } finally {
    await page.close();
  }
});

test('the keyboard chooses: Enter and Space press an option, and each option says whether it is chosen', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${server.url}/prediction.html?step=ask`);
    await choosesAndSees(page, 'keyboard');
    assert.equal(await page.locator('.predict-options').getAttribute('role'), 'group');
    assert.equal(await page.locator('.predict-options').getAttribute('aria-labelledby'), 'predict-prompt');
  } finally {
    await page.close();
  }
});

test('on a phone the options are taps at least 44 px tall that fit the width', options, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    await page.goto(`${server.url}/prediction.html?step=ask`);
    await resting(page, 'Even or odd?');
    // On a phone it follows the caption, as the live row does.
    assert.equal(await page.locator('.words > .caption + .predict').count(), 1);
    // Right under the caption's words: the row does not wait below the space reserved for the scenario's longest caption.
    const gap = await page.evaluate(() => {
      const caption = document.querySelector('.words > .caption')!, range = document.createRange();
      range.selectNodeContents(caption);
      return document.querySelector('.predict')!.getBoundingClientRect().top - range.getBoundingClientRect().bottom;
    });
    assert.ok(gap < 32, `the prediction row starts ${gap} px below the caption's words`);
    for (const box of await page.locator('.predict .option').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().toJSON() as DOMRect))) {
      assert.ok(box.height >= 44, `an option is ${box.height} px tall`);
      assert.ok(box.left >= 0 && box.right <= 390, `an option runs off the phone (${box.left}–${box.right})`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await choosesAndSees(page, 'tap');
  } finally {
    await page.close();
  }
});

test('framed: a raw iframe and the loader both let the reader choose and see the reveal', options, async () => {
  for (const [name, body] of [
    ['a raw iframe', `<!doctype html><style>body{margin:0}</style><iframe title="t" src="${server.url}/prediction.html?step=ask" style="width:900px;height:900px;border:0"></iframe>`],
    ['the loader', `<!doctype html><div id="a"></div><script src="${server.url}/loader.js" data-src="${server.url}/prediction.html?step=ask" data-target="a" data-title="Predictions"></script>`],
  ] as const) {
    hostBody = body;
    // With motion: Next plays the revealing step rather than jumping to it.
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    try {
      await page.goto(host);
      // The loader makes its iframe before pointing it at the page, so wait for the frame to load the page.
      let frame = page.frames().find((f) => f.url().includes('prediction.html'));
      for (const start = Date.now(); !frame && Date.now() - start < 10_000; frame = page.frames().find((f) => f.url().includes('prediction.html'))) await page.waitForTimeout(50);
      assert.ok(frame, `${name}: the explainer's frame`);
      await frame.waitForSelector('[data-ready=true]');
      assert.ok(await frame.evaluate(() => 'framed' in document.documentElement.dataset), `${name}: the page knows it is framed`);
      await choosesAndSees(frame, 'click');
    } finally {
      await page.close();
    }
  }
});

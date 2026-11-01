// A lettered page in Chromium, served with its header recipe: the player puts the requested
// faces in place before it draws, so the live stage draws the same Greek outlines as the
// poster the build drew in Node. Without them its Greek would be the faces' empty glyph.
// The outline-snapshot fixtures are held to the same rule: the page draws the stored runs,
// and never shapes them, so each step's resting picture is Node's, path for path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { launch } from '../../tools/lib/browser.ts';
import { collectProject, defaultVariant, ROOT } from '../../tools/lib/explain-project.ts';
import type { Project } from '../../tools/lib/explain-project.ts';
import { SnapshotSink, renderAt, renderElements } from '../../src/index.ts';
import { restingTime } from '../../explain/trace.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';

const enabled = !!process.env.EXPLAIN_BROWSER,
  options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for the lettered page in Chromium' };
let browser: Browser, folder: string, server: { url: string; close(): void }, project: Project;
/** The outline-snapshot fixtures (test/lettering/): scripts, faces, cuts and maths drawn from stored runs. */
const OUTLINES = ['arabic', 'devanagari', 'hebrew', 'math', 'matching', 'style', 'styles'] as const;
const outlines: Partial<Record<(typeof OUTLINES)[number], Project>> = {};
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-browser-'));
  for (const id of OUTLINES) {
    outlines[id] = await collectProject(join(ROOT, 'test/lettering', id), { write: false });
    await buildExplainer(outlines[id]!, join(folder, id + '.html'));
  }
  // Last, so its faces are the ones in place when the Greek test draws in Node
  project = await collectProject(join(ROOT, 'test/fixtures/lettering'), { write: false });
  await buildExplainer(project, join(folder, 'lettered.html'));
  server = await serve(folder, 0, 'lettered.html');
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  server?.close();
  await rm(folder, { recursive: true, force: true });
});

test('the live stage of a lettered page draws the Greek outlines the build draws in Node', options, async () => {
  for (const word of ['logos', 'phos']) {
    // The first step's resting picture as the build draws it, with the lettering in place
    const v = defaultVariant(project, { word });
    const scene = await renderAt(v.Scene, restingTime(v.trace.steps[0]!, v.trace.fps), new SnapshotSink());
    // As the player's DomSink draws it: absolute path data, a line of text one path
    const expected = renderElements(scene, { relative: false })
      .filter((r) => r.tag === 'path')
      .map((r) => String(r.attrs.d))
      .sort();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${server.url}/lettered.html?word=${word}`);
    await page.waitForSelector('[data-ready=true]');
    const live = () => page.locator('.stage').evaluate((s) => [...s.querySelectorAll('path')].map((p) => p.getAttribute('d')!).sort());
    await page.waitForFunction(
      (n) => document.querySelectorAll('.stage path').length === n,
      expected.length,
    );
    assert.ok(expected.length > 4, `${word}: the picture has the card and its words`);
    assert.deepEqual(await live(), expected, `${word}: the live stage draws what Node drew`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

/** Every resting picture of `project`'s default case, as Node draws it: absolute path data, sorted. */
async function nodePaths(p: Project): Promise<string[][]> {
  const v = defaultVariant(p);
  const out: string[][] = [];
  for (const step of v.trace.steps) {
    const scene = await renderAt(v.Scene, restingTime(step, v.trace.fps), new SnapshotSink());
    out.push(renderElements(scene, { relative: false }).filter((r) => r.tag === 'path').map((r) => String(r.attrs.d)).sort());
  }
  return out;
}

test('each outline-snapshot page draws, at every step, the paths Node draws from the same runs', options, async () => {
  for (const id of OUTLINES) {
    const p = outlines[id]!, expected = await nodePaths(p), steps = defaultVariant(p).trace.steps;
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const [i, step] of steps.entries()) {
      await page.goto(`${server.url}/${id}.html?step=${encodeURIComponent(step.step)}`);
      await page.waitForSelector('[data-ready=true]');
      await page.waitForFunction((n) => document.querySelectorAll('.stage path').length === n, expected[i]!.length);
      const live = await page.locator('.stage').evaluate((s) => [...s.querySelectorAll('path')].map((q) => q.getAttribute('d')!).sort());
      // The paper and at least one line of lettering (the player draws a line as one path)
      assert.ok(expected[i]!.length >= 2, `${id} ${step.step}: the picture has its lettering`);
      assert.deepEqual(live, expected[i], `${id} ${step.step}: the live stage draws what Node drew`);
    }
    assert.deepEqual(errors, [], id);
    await page.close();
  }
});

test('a right-to-left caption reads and aligns right to left on the page; a left-to-right one stays left', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  /** The caption's text against its box: how far its ink sits from each side, and its direction. */
  const caption = () => page.locator('.player .caption').evaluate((p) => {
    const range = document.createRange();
    range.selectNodeContents(p);
    const text = range.getBoundingClientRect(), box = p.getBoundingClientRect();
    return { left: text.left - box.left, right: box.right - text.right, direction: getComputedStyle(p).unicodeBidi };
  });
  // The Hebrew fixture's first caption is one Hebrew line ending in a full stop
  await page.goto(`${server.url}/hebrew.html`);
  await page.waitForSelector('[data-ready=true]');
  const rtl = await caption();
  assert.equal(rtl.direction, 'plaintext');
  assert.ok(rtl.right < 1 && rtl.left > 40, `the Hebrew caption hugs the right edge: ${JSON.stringify(rtl)}`);
  await page.goto(`${server.url}/style.html`);
  await page.waitForSelector('[data-ready=true]');
  const ltr = await caption();
  assert.notEqual(ltr.direction, 'plaintext');
  assert.ok(ltr.left < 1 && ltr.right > 40, `the English caption hugs the left edge: ${JSON.stringify(ltr)}`);
  await page.close();
});

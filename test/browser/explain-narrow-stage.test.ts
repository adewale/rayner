// A narrow stage is taller than 16:9 only when the scenario's close-ups use that height: a scene whose
// every label reads on the whole picture fills a 16:9 phone stage, framed and standalone, and a scene
// with close-ups keeps the taller stage. Neither changes height as the reader steps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Frame, Page } from 'playwright-core';
import { launch } from '../../tools/lib/browser.ts';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer, buildLoader } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { NARROW_ASPECT, closeUps, narrowAspect, stepLayouts } from '../../app/embed-closeup.ts';
import { FRAME } from '../../src/internal.ts';

const enabled = !!process.env.EXPLAIN_BROWSER,
  options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for real cross-origin browser checks' };
const STEPS = ['one', 'two', 'three'];
/** A scene of three steps, each bringing a row of labels at `size` stage units. */
const scene = (name: string, size: number) => `import { Scene, Text, FadeIn } from 'rayner';
export default class ${name} extends Scene {
  override async construct() {
    for (const [i, step] of ${JSON.stringify(STEPS)}.entries()) {
      await this.step(step, { title: 'Step ' + step, caption: 'Labels arrive in row ' + step + '.' });
      const row = [-5, 0, 5].map((x) => new Text('label ' + step, { fontSize: ${size} }).moveTo([x, 2 - i * 2]));
      await this.play(...row.map((t) => new FadeIn(t)));
    }
  }
}
`;
// At a 390 px phone the standalone stage is 358 px wide (22.4 px per stage unit): 0.8 units reads at
// about 18 px on the whole picture; 0.2 units reads at 4.5 px, so every step zooms in.
const SCENES = { whole: ['WholeRows', 0.8], closer: ['SmallRows', 0.2] } as const;

let browser: Browser, folder: string, embed: { url: string; close(): void } | undefined, host: string;
let hostBody = '';
const hostServer = createServer((_, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(hostBody);
});
const layouts = new Map<string, Awaited<ReturnType<typeof stepLayouts>>>();
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-narrow-stage-'));
  for (const [id, [name, size]] of Object.entries(SCENES)) {
    const dir = join(folder, 'src', id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'scene.ts'), scene(name, size));
    const project = await collectProject(dir, { write: false });
    layouts.set(id, await stepLayouts(project.scenarios[0]!.Scene));
    await buildExplainer(project, join(folder, id + '.html'));
  }
  await buildLoader(join(folder, 'loader.js'));
  embed = await serve(folder, 0, 'whole.html');
  await new Promise<void>((r) => hostServer.listen(0, '127.0.0.1', r));
  host = `http://127.0.0.1:${(hostServer.address() as { port: number }).port}`;
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  hostServer.close();
  embed?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

/** The stage's size once `step` has settled, in the page or in the frame the loader made. */
async function stageAt(where: Page | Frame, step: string) {
  await where.waitForFunction(
    (name) => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === name && !document.querySelector('#content.loading'),
    step,
  );
  await where.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  return where.locator('.stage').evaluate((s) => {
    const r = s.getBoundingClientRect();
    return { w: r.width, h: r.height, narrow: s.classList.contains('narrow') };
  });
}

/** The stage on every step, standalone and framed by the loader, at a 390 × 844 phone. */
async function phoneStages(id: string) {
  const sizes: Record<'standalone' | 'framed', { w: number; h: number; narrow: boolean }[]> = { standalone: [], framed: [] };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(`${embed!.url}/${id}.html`);
    await page.waitForSelector('[data-ready=true]');
    for (const [i, step] of STEPS.entries()) {
      if (i) await page.locator('.stepper').getByRole('button', { name: 'Next step', exact: true }).click();
      sizes.standalone.push(await stageAt(page, step));
    }
    hostBody = `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div id="x"></div><script src="${embed!.url}/loader.js" data-src="${embed!.url}/${id}.html" data-target="x" data-title="${id}"></script>`;
    const framed = await context.newPage();
    await framed.goto(host);
    const handle = await framed.waitForSelector('#x iframe');
    const frame = (await handle.contentFrame())!;
    await frame.waitForSelector('[data-ready=true]');
    for (const [i, step] of STEPS.entries()) {
      if (i) await frame.locator('.stepper').getByRole('button', { name: 'Next step', exact: true }).click();
      sizes.framed.push(await stageAt(frame, step));
    }
  } finally {
    await context.close();
  }
  return sizes;
}

test('narrowAspect: 16:9 when no step of the scenario zooms in, else as tall as its most zoomed close-up uses, never over NARROW_ASPECT', options, () => {
  const flat = FRAME.h / FRAME.w;
  for (const w of [358, 388]) {
    const whole = layouts.get('whole')!, closer = layouts.get('closer')!;
    assert.ok([...whole.values()].every((l) => closeUps(l, w, w * flat).length === 1 && closeUps(l, w, w * flat)[0]!.k === 1));
    assert.equal(narrowAspect(whole.values(), w), flat);
    const k = Math.max(...[...closer.values()].flatMap((l) => closeUps(l, w, w * flat).map((z) => z.k)));
    assert.ok(k > 1);
    assert.equal(narrowAspect(closer.values(), w), Math.min(NARROW_ASPECT, k * flat + 2 / w));
    // No close-up wider than 16:9 can use more height: the answer is the same at the height it sets.
    for (const layout of closer.values())
      for (const z of closeUps(layout, w, w * narrowAspect(closer.values(), w))) assert.ok(z.k <= k + 1e-9);
  }
});

test('phone: a scene whose every label reads on the whole picture gets a 16:9 stage, framed and standalone, on every step', options, async () => {
  const sizes = await phoneStages('whole');
  for (const [mode, steps] of Object.entries(sizes))
    for (const [i, { w, h, narrow }] of steps.entries()) {
      assert.ok(narrow, `${mode} step ${i + 1}: the stage is narrow (${w} px)`);
      assert.ok(Math.abs(h - (w * 9) / 16) <= 1, `${mode} step ${i + 1}: a ${w} px stage is ${h} px tall, not 16:9 (${(w * 9) / 16})`);
    }
});

test('phone: a scene with close-ups keeps the taller stage, framed and standalone, at one height across its steps', options, async () => {
  const sizes = await phoneStages('closer');
  for (const [mode, steps] of Object.entries(sizes)) {
    for (const [i, { w, h, narrow }] of steps.entries()) {
      assert.ok(narrow, `${mode} step ${i + 1}: the stage is narrow (${w} px)`);
      assert.ok(h > (w * 9) / 16 + 20, `${mode} step ${i + 1}: a ${w} px stage is ${h} px tall, no taller than 16:9`);
      assert.equal(h, steps[0]!.h, `${mode}: the stage keeps its height as the reader steps`);
    }
  }
  // Framed, the loader sizes the frame to the content, so nothing but NARROW_ASPECT caps the stage.
  for (const { w, h } of sizes.framed) assert.ok(Math.abs(h - w * NARROW_ASPECT) <= 1, `framed: ${h} px for a ${w} px stage, not ${w * NARROW_ASPECT}`);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { Text } from '../../src/index.ts';
import { isHeading } from '../../explain/stage.ts';
import { collectProject } from '../../tools/lib/explain-project.ts';
import type { Project } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { storyFrames, inspectStoryFrame, covered } from '../../tools/lib/explain-story-review.ts';
import type { StoryClaim } from '../../tools/lib/explain-story-review.ts';

const enabled = !!process.env.EXPLAIN_BROWSER;
const options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for served ring-buffer reader checks' };
let project: Project, folder: string, browser: Browser, server: Awaited<ReturnType<typeof serve>>;
const steps = ['reader-capacity', 'reader-reuse'];
// The queue-order claim needs the whole storage row beside its pointers and
// occupied count, including the fifth slot at the opposite end from the reused slots.
const row: StoryClaim['targets'] = [
  ...Array.from({ length: 5 }, (_, i) => ({ key: `slot:${i}` })),
  ...Array.from({ length: 5 }, (_, i) => ({ text: `slot ${i}` })),
  { key: 'indices' },
  { key: 'length' },
];

before(async () => {
  if (!enabled) return;
  project = await collectProject('scenes/explainers/ring-buffer', { write: false });
  assert.equal(project.variants.length, 2);
  folder = await mkdtemp(join(tmpdir(), 'rayner-ring-reader-'));
  await buildExplainer(project, join(folder, 'ring.html'));
  server = await serve(folder, 0, 'ring.html');
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  server?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

test('both operation cases open with all five readable storage slots, pointers, count and result', options, async () => {
  let openings = 0, checkedTargets = 0;
  for (const variant of project.variants) {
    const claims = steps.map((step) => ({
      step, opening: true,
      targets: step === 'reader-reuse' ? [...row, { key: 'operation-result' }] : row,
    }));
    const frames = await storyFrames(variant.Scene, claims);
    const minimum = new Map<string, number>();
    await new variant.Scene({
      async frame() {},
      async stepEnd(scene, step) {
        if (!steps.includes(step.name)) return;
        const labels = scene.familyMembers().filter((m): m is Text => m instanceof Text && !!m.text.trim() && !isHeading(m));
        assert.ok(labels.length > 0);
        minimum.set(step.name, Math.min(...labels.map((m) => m.textSize())));
      },
    }, { skipUntil: Infinity }).run();
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await page.addInitScript(() => document.addEventListener('rayner:step', (event) => {
        (window as unknown as { ringStep: string }).ringStep = (event as CustomEvent).detail.step;
      }));
      try {
        for (const step of steps) {
          const caseName = `${variant.values.operations}/${step}/${viewport.width}`;
          await page.goto(`${server.url}/ring.html?${new URLSearchParams({ ...variant.values, step })}`);
          await page.waitForSelector('[data-ready=true]');
          await page.waitForFunction((name) => (window as unknown as { ringStep: string }).ringStep === name &&
            !document.querySelector('#content.loading') && !document.querySelector('svg.leaving'), step);
          const frame = frames.get(step)!;
          const seen = await inspectStoryFrame(page, frame);
          const claimed = frame.targets.filter((target) => target.opening);
          assert.equal(claimed.length, step === 'reader-reuse' ? 13 : 12);
          for (const target of claimed) for (const index of target.indices) {
            const ink = seen.ink.find((paint) => paint.index === index)!;
            assert.ok(ink.visible && ink.complete && covered(ink.box, [seen.viewport]),
              `${caseName}: ${target.name} must be completely painted in the opening`);
          }
          const scale = await page.locator('.stage svg:not(.leaving)').evaluate((node) => {
            const matrix = (node as SVGSVGElement).getScreenCTM()!;
            return Math.hypot(matrix.a, matrix.b) * 1000;
          });
          const pixels = minimum.get(step)! * scale;
          assert.ok(pixels >= 12 - 1e-6, `${caseName}: smallest body label is ${pixels}px`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, caseName);
          openings++;
          checkedTargets += claimed.length;
        }
      } finally {
        await page.close();
      }
    }
  }
  assert.equal(openings, 8);
  assert.equal(checkedTargets, 100);
});

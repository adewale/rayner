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
const options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for served Monty Hall reader checks' };
let project: Project, folder: string, browser: Browser, server: Awaited<ReturnType<typeof serve>>;
const steps = ['choice', 'host', 'predict', 'reveal'];
// The inference compares all three doors under the pictured host rule. A later
// tour stop cannot repair a door or the rule missing beside the opening caption.
const targets: StoryClaim['targets'] = [
  ...[0, 1, 2].map((i) => ({ key: `door-${i}` })),
  ...['A', 'B', 'C'].map((text) => ({ text })),
  { key: 'monty-rule' },
  { key: 'monty-result' },
];

before(async () => {
  if (!enabled) return;
  project = await collectProject('scenes/explainers/monty-hall', { write: false });
  assert.equal(project.variants.length, 12);
  folder = await mkdtemp(join(tmpdir(), 'rayner-monty-reader-'));
  await buildExplainer(project, join(folder, 'monty.html'));
  server = await serve(folder, 0, 'monty.html');
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  server?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

test('every host, first choice and decision opens with all three readable doors and the complete host rule', options, async () => {
  let openings = 0, checkedTargets = 0;
  for (const variant of project.variants) {
    const claims = steps.map((step) => ({ step, opening: true, targets }));
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
        (window as unknown as { montyStep: string }).montyStep = (event as CustomEvent).detail.step;
      }));
      try {
        for (const step of steps) {
          const caseName = `${JSON.stringify(variant.values)}/${step}/${viewport.width}`;
          await page.goto(`${server.url}/monty.html?${new URLSearchParams({ ...variant.values, step })}`);
          await page.waitForSelector('[data-ready=true]');
          await page.waitForFunction((name) => (window as unknown as { montyStep: string }).montyStep === name &&
            !document.querySelector('#content.loading') && !document.querySelector('svg.leaving'), step);
          const frame = frames.get(step)!;
          const seen = await inspectStoryFrame(page, frame);
          const claimed = frame.targets.filter((target) => target.opening);
          assert.equal(claimed.length, 8);
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
  assert.equal(openings, 96);
  assert.equal(checkedTargets, 768);
});

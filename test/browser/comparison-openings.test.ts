import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject, ROOT } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { reviewSubjects } from '../../tools/lib/explain-review-scene.ts';
import { storyFrames, inspectStoryFrame, verifyStoryTargets } from '../../tools/lib/explain-story-review.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { stepQuery } from '../../explain/internal.ts';
import { readableOpeningLabel } from '../../tools/lib/explain-review-plan.ts';

test('primary ring, block-width, route/trip and cache comparisons are readable together in every scenario opening', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for served comparison openings', timeout: 300_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-comparison-openings-'));
  const browser = await launch();
  const server = await serve(directory, 0, 'index.html');
  const rows: string[] = [];
  try {
    for (const [id, step, expectedScenarios] of [['ring-buffer', 'result', 2], ['periodic-groups', 'stack', 5], ['gtfs', 'day', 6], ['cache-policies', 'pattern', 2]] as const) {
      const project = await collectProject(join(ROOT, 'scenes/explainers', id));
      assert.equal(project.scenarios.length, expectedScenarios);
      await buildExplainer(project, join(directory, `${id}.html`));
      const declared = await reviewSubjects(project);
      for (const scenario of project.scenarios) {
        const applicable = declared.filter(subject => Object.entries(subject.settings ?? {}).every(([key, value]) => scenario.values[key] === value));
        const frame = (await storyFrames(scenario.Scene, applicable)).get(step)!;
        const targets = frame.targets.filter(target => target.opening);
        assert.ok(targets.length >= 2, `${id}: independent comparison subjects are declared`);
        if (id === 'gtfs') {
          for (const name of ['gtfs-summary:routes', 'gtfs-summary:trips', 'A route row promises no dated departure'])
            assert.ok(targets.some(target => target.name === name), `the day opening must include ${name}`);
        }
        const indices = new Set(targets.flatMap(target => target.indices));
        const labels = frame.labels.filter(label => label.indices.some(index => indices.has(index)));
        assert.ok(labels.length >= 2, `${id}: the subjects contain actual words`);
        for (const width of [320, 390, 1280]) {
          const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.addInitScript(() => document.addEventListener('rayner:step', event => { (window as unknown as { comparisonReady: string }).comparisonReady = (event as CustomEvent).detail.step; }));
          try {
            await page.goto(`${server.url}/${id}.html?${stepQuery(scenario.values, step)}`);
            await page.waitForFunction(step => (window as unknown as { comparisonReady?: string }).comparisonReady === step && !document.querySelector('#content.loading'), step);
            await page.locator('.leaving').waitFor({ state: 'detached' });
            await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
            const opening = await inspectStoryFrame(page, frame);
            assert.equal(verifyStoryTargets(frame, [opening], step, width, targets).size, targets.length);
            for (const label of labels) {
              const scale = Math.min(...label.indices.filter(index => indices.has(index)).map(index => opening.ink.find(ink => ink.index === index)!.scale));
              assert.ok(readableOpeningLabel(label.size * scale), `${id}/${width}: ${label.text} is ${label.size * scale}px`);
            }
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            rows.push(`${id}/${JSON.stringify(scenario.values)}/${width}`);
          } finally { await page.close(); }
        }
      }
    }
    assert.equal(rows.length, 45, 'all fifteen scenarios at three fresh widths');
    assert.equal(new Set(rows).size, 45, 'no repeated row hides a missing scenario or width');
  } finally { await browser.close(); server.close(); await rm(directory, { recursive: true, force: true }); }
});

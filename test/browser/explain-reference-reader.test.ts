import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { reviewClaims } from '../../tools/lib/explain-review-scene.ts';
import { reviewStoryVariant, storyFrames, inspectStoryFrame, covered } from '../../tools/lib/explain-story-review.ts';
const enabled = !!process.env.EXPLAIN_BROWSER;
test(
  'the served reader skips optional notes, preserves direct links and returns to the last main step',
  { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for reference navigation' },
  async () => {
    const project = await collectProject('test/fixtures/reference-steps', { write: false });
    assert.equal(project.variants.length, 3);
    assert.deepEqual(
      project.variants[0]!.trace.steps.map((s) => s.step),
      ['alpha', 'note', 'omega', 'source'],
      'full verification retains every step',
    );
    const folder = await mkdtemp(join(tmpdir(), 'rayner-references-'));
    let browser: Awaited<ReturnType<typeof launch>> | undefined, server: Awaited<ReturnType<typeof serve>> | undefined;
    try {
      await buildExplainer(project, join(folder, 'index.html'));
      server = await serve(folder, 0, 'index.html');
      browser = await launch();
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
        await page.addInitScript(() =>
          document.addEventListener('rayner:step', (e: any) => ((window as any).__step = e.detail.step)),
        );
        const settled = async (step: string) => {
          await page.waitForFunction((step) => (window as any).__step === step, step);
          await page.locator('.leaving').waitFor({ state: 'detached' });
        };
        await page.goto(server.url);
        await settled('alpha');
        assert.equal(await page.locator('ol.steps:not(.supporting-steps)>li').count(), 2);
        assert.equal(await page.locator('ol.supporting-steps>li').count(), 2);
        await page.evaluate(() => {
          const stage = document.querySelector('.stage')!;
          const w = window as unknown as { noteFlashed: boolean; noteObserver: MutationObserver };
          w.noteFlashed = false;
          w.noteObserver = new MutationObserver(() => {
            if (stage.querySelector('path[fill="#ff0044"]')) w.noteFlashed = true;
          });
          w.noteObserver.observe(stage, { subtree: true, childList: true, attributes: true });
        });
        await page.locator('.stepper button[aria-label="Next step"]').click();
        await settled('omega');
        assert.equal(
          await page.evaluate(() => {
            const w = window as unknown as { noteFlashed: boolean; noteObserver: MutationObserver };
            w.noteObserver.disconnect();
            return w.noteFlashed;
          }),
          false,
          'Next must not flash the skipped reference picture, including with ordinary motion',
        );

        assert.equal(
          await page.locator('.stepper .primary').getAttribute('aria-label'),
          'Start again from step 1',
          'the main ending offers a restart instead of silently entering notes',
        );
        await page.locator('.stepper .primary').click();
        await settled('alpha');
        await page.locator('.stepper .primary').click();
        await settled('omega');
        const closedRail = page.locator('details.rail:not([open])>summary');
        if (await closedRail.count()) await closedRail.click();
        await page.locator('details.supporting>summary').click();
        await page.locator('button[data-step="note"]').click();
        await settled('note');
        assert.ok(
          (await page.locator('.stage path[fill="#ff0044"]').count()) > 0,
          'the observation control really paints the reference colour on direct entry',
        );

        await page.getByRole('button', { name: 'Back to the explanation', exact: true }).click();
        await settled('omega');
        await page.goto(server.url + '/index.html?step=note');
        await settled('note');
        await page.locator('.stepper button[aria-label="Next step"]').click();
        await settled('omega');
        await page.goto(server.url + '/index.html?step=source');
        await settled('source');
        await page.locator('fieldset.case input[value="two"]').check();
        await page.waitForURL(/case=two/);
        await settled('source');
        await page.getByRole('button', { name: 'Back to the explanation', exact: true }).click();
        await settled('alpha');
        assert.equal(new URL(page.url()).searchParams.get('case'), 'two');
        await page.goto(server.url + '/index.html?case=all');
        await settled('alpha');
        assert.equal(
          await page.locator('ol.steps:not(.supporting-steps)>li').count(),
          4,
          'an all-note scene keeps a complete reachable path',
        );
        assert.equal(await page.locator('details.supporting').isVisible(), false);
        await page.locator('.stepper button[aria-label="Next step"]').click();
        await settled('note');
        assert.equal(
          await page.getByRole('button', { name: 'Back to the explanation', exact: true }).isVisible(),
          false,
        );
        await page.close();
      }
    } finally {
      await browser?.close();
      server?.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test(
  'all seasons cases retain complete caption witnesses in legacy tours, including the unchanged June reference',
  { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for seasons reference tours' },
  async () => {
    const project = await collectProject('scenes/explainers/seasons', { write: false });
    assert.equal(project.variants.length, 4);
    const claims = await reviewClaims(project);
    const expected = {
      tromso: { name: 'Tromsø', formula: '90° − |69.65° − 23.44°| = 43.79°', june: '24.0 h of daylight', december: ['0.0 h of daylight', 'Noon Sun -3.1°, below the horizon'], january: '0.0 h', other: '24.0 h' },
      london: { name: 'London', formula: '90° − |51.5° − 23.44°| = 61.94°', june: '16.4 h of daylight', december: ['7.6 h of daylight'], january: '8.0 h', other: '16.0 h' },
      quito: { name: 'Quito', formula: '90° − |0° − 23.44°| = 66.56°', june: '12.0 h of daylight', december: ['12.0 h of daylight'], january: '15 January: 12.0 h', other: '15 July: 12.0 h' },
      sydney: { name: 'Sydney', formula: '90° − |-33.87° − 23.44°| = 32.69°', june: '9.7 h of daylight', december: ['14.3 h of daylight'], january: '14.0 h', other: '10.0 h' },
    };
    const folder = await mkdtemp(join(tmpdir(), 'rayner-seasons-references-'));
    let browser: Awaited<ReturnType<typeof launch>> | undefined, server: Awaited<ReturnType<typeof serve>> | undefined;
    let formalRows = 0, phoneRows = 0;
    try {
      await buildExplainer(project, join(folder, 'seasons.html'));
      server = await serve(folder, 0, 'seasons.html');
      browser = await launch();
      const page = await browser.newPage();
      for (const variant of project.variants) {
        // The complete existing reviewer must still accept every main and
        // detail step. Before the subject declarations it rejects the noon
        // globe revealed incidentally when the old callout disappears.
        const reviewed = await reviewStoryVariant(page, `${server.url}/seasons.html`, variant, claims);
        assert.equal(reviewed.length, 22);
        formalRows += reviewed.length;
        const applicable = claims.filter((claim) => Object.entries(claim.settings ?? {}).every(([key, value]) => variant.values[key] === value));
        const frames = await storyFrames(variant.Scene, applicable);
        const values = expected[variant.values.place as keyof typeof expected];
        await page.setViewportSize({ width: 320, height: 568 });
        for (const step of ['noon', 'december', 'latitude', 'distance']) {
          await page.goto(`${server.url}/seasons.html?${new URLSearchParams({ ...variant.values, step })}`);
          await page.waitForFunction((name) => (window as unknown as { raynerReviewStep: string }).raynerReviewStep === name &&
            !document.querySelector('#content.loading') && !document.querySelector('svg.leaving'), step);
          const frame = frames.get(step)!;
          const views = [await inspectStoryFrame(page, frame)];
          const visited = new Set([views[0]!.viewBox]);
          const next = page.locator('.view-controls > button').first();
          if (await next.isVisible() && await next.isEnabled()) {
            for (let n = 0; n < frame.records.length + 1; n++) {
              await next.click();
              await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
              const view = await inspectStoryFrame(page, frame);
              if (visited.has(view.viewBox)) break;
              visited.add(view.viewBox);
              views.push(view);
              assert.ok(n < frame.records.length, 'the native tour must terminate');
            }
          }
          const expectedKeys = step === 'noon'
            ? ['june-horizon', 'june-place', 'june-noon-ray', 'noon-notes']
            : step === 'december'
              ? ['june-latitude', 'december-latitude', 'june-north', 'december-north', 'solstice-months', 'june-daylight-callout', 'december-daylight-callout', 'december-noon-ray']
              : step === 'latitude'
                ? ['june-latitude', 'december-latitude', 'latitude-circles', 'june-daylight-table', 'december-daylight-table', `emphasis: row ${values.name}`, `emphasis: row ${values.name}`]
                : ['distance-orbit', 'daylight-curve', 'january-point', 'january-value', ...(variant.values.place === 'quito' ? ['july-point', 'july-value'] : ['mirror-daylight-curve', 'mirror-january-point', 'mirror-january-value'])];
          assert.deepEqual(frame.targets.map((target) => target.name).sort(), [...expectedKeys].sort());
          const indices = new Set(frame.targets.flatMap((target) => target.indices));
          for (const target of frame.targets) for (const index of target.indices) {
            const eligible = views.filter((view) => {
              const paint = view.ink.find((ink) => ink.index === index)!;
              return paint.visible && paint.complete;
            });
            assert.ok(eligible.length, `${variant.values.place}/${step}/320: ${target.name} needs complete native paint`);
            const paint = eligible[0]!.ink.find((ink) => ink.index === index)!;
            assert.ok(covered(paint.box, eligible.map((view) => view.viewport)), `${target.name}: the reachable tour must cover all claimed ink`);
          }
          const labels = frame.labels.filter((label) => label.indices.some((index) => indices.has(index)));
          const words = step === 'noon' ? ['horizon', 'noon sunlight', values.formula]
            : step === 'december' ? ['June', 'December', values.june, ...values.december]
              : step === 'latitude' ? ['Tromsø', 'London', 'Quito', 'Sydney', '24.0 h', '0.0 h', '16.4 h', '7.6 h', '12.0 h', '9.7 h', '14.3 h']
                : ['January', 'July', values.january, values.other];
          for (const word of words) assert.ok(labels.some((label) => label.text === word), `${step}: missing independent expected value ${word}`);
          for (const label of labels) {
            const eligible = views.filter((view) => label.indices.every((index) => {
              const ink = view.ink.find((paint) => paint.index === index)!;
              return ink.visible && ink.complete && covered(ink.box, [view.viewport]);
            }));
            assert.ok(eligible.length, `${label.text}: one stop must contain the whole label`);
            const pixels = Math.max(...eligible.map((view) => label.size * Math.min(...label.indices.map((index) => view.ink.find((paint) => paint.index === index)!.scale))));
            // SVG viewBox rounding can move a 12px result by a few millionths
            // of a CSS pixel; use the same native tolerance as transformed-text proof.
            assert.ok(pixels >= 12 - 1e-5, `${variant.values.place}/${step}: ${label.text} complete native type is ${pixels}px`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          phoneRows++;
        }
      }
      assert.equal(formalRows, 88);
      assert.equal(phoneRows, 16);
    } finally {
      await browser?.close();
      server?.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);

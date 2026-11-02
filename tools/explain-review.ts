import { readerChrome } from './lib/explain-reader-shell.ts';
// Review the built collection as served, not just its source. Run demos:build (or demos:check) first;
// Checks every resting step in every served case on desktop and phone.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildInputs } from './lib/build-inputs.ts';
import { spawnSync, execFileSync } from 'node:child_process';
import type { Browser, Page } from 'playwright-core';
import { launch } from './lib/browser.ts';
import { collectProject, sceneInputs, ROOT } from './lib/explain-project.ts';
import { serve } from './lib/explain-serve.ts';
import { chromeFor } from '../app/embed-strings.ts';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';
import {
  reviewScope,
  reviewCases,
  readStoryPlan,
  reviewCodeHash,
  validateReviewedCases,
} from './lib/explain-review-plan.ts';
import { reviewStoryVariant} from './lib/explain-story-review.ts';
import { checkBuilt } from './lib/explain-site-describe.ts';
import { reviewClaims } from './lib/explain-review-scene.ts';

let server: Awaited<ReturnType<typeof serve>> | undefined;
let browser: Browser | undefined, page: Page | undefined;
let codeHash: string | undefined;
const { values } = parseArgs({ options: { shard: { type: 'string' }, from: { type: 'string' } } });
const scope = reviewScope(values.shard ? ['--shard', values.shard] : []);
const built = resolve(values.from ?? join(ROOT, 'out/explainers'));
const inputs = await buildInputs(ROOT);
const suffix = scope.total === 1 ? '' : `shard-${scope.part}-of-${scope.total}`;
const receipt = join(ROOT, 'out/validation', `browser-review${suffix ? '-' + suffix : ''}.json`);
const review = join(ROOT, 'out/review', suffix);
try {
  await rm(receipt, { force: true });
  await rm(review, { recursive: true, force: true });
  codeHash = await reviewCodeHash(ROOT, inputs.hash);
  server = await serve(built, 0, 'index.html');
  const base = server.url;
  browser = await launch();
  page = await browser.newPage({ viewport: { width: 1180, height: 980 } });
  const errors: string[] = [],
    connections: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === base) return route.continue();
    connections.push(url);
    return route.abort();
  });
  await mkdir(review, { recursive: true });
  if (scope.part === 1) {
    await page.goto(base + '/');
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.screenshot({ path: join(review, 'gallery.png'), fullPage: true, animations: 'disabled' });
  }
  const plan = await readStoryPlan(built, values.from ? undefined : EXPLAINERS.map(entry => entry.id));
  assert.deepEqual(plan.scenes, EXPLAINERS.filter(entry => plan.scenes.includes(entry.id)).map(entry => entry.id), 'built scenes must match the source inventory order');
  const planned = reviewCases(plan.cases, scope);
  assert.ok(planned.length, 'story shard selects no cases');
  const selectedScenes = new Set(planned.map(c => c.scene));
  const cases = [];
  for (const entry of EXPLAINERS.filter(entry => selectedScenes.has(entry.id))) {
    const project = await collectProject(join(ROOT, 'scenes/explainers', entry.id), { write: false });
    const claims = await reviewClaims(project);
    assert.deepEqual(
      JSON.parse(await readFile(join(built, entry.id, 'inputs.json'), 'utf8')),
      await sceneInputs(project, inputs.hash),
      `${entry.id}: rebuild stale collection output before reviewing`,
    );
    let selected = 0;
    for (const [index, variant] of project.variants.entries()) {
      selected++;
      const directory = join(review, 'story', entry.id, String(index));
      await mkdir(directory, { recursive: true });
      const t = chromeFor(project.Scene.meta?.lang);
      const teaching = variant.trace.steps.some(s => s.meta.detail !== true) ? variant.trace.steps.filter(s => s.meta.detail !== true) : variant.trace.steps;
      const steps = await reviewStoryVariant(
        page,
        `${base}/${entry.id}.html`,
        variant,
        claims,
        directory,
        { chrome: readerChrome(t), home: PRODUCT.home, cases: project.Scene.settings?.length ?? 0, steps: teaching.map(s => s.step),
          crop: { player: t.player, next: t.nextLabel, title: project.Scene.meta?.title ?? entry.id,
            kicker: t.stepOf(1, teaching.length), segments: teaching.length, cases: project.Scene.settings?.length ?? 0,
            madeWith: t.madeWith, home: PRODUCT.home, open: null } },
      );
      cases.push({ scene: entry.id, settings: variant.values, steps });
    }
    if (selected) console.log(`${entry.id}: ${selected} selected cases, every resting step passed both widths`);
  }

  validateReviewedCases(cases, planned);
  // One shard owns the shared gallery, headers, host and publication boundary.
  if (scope.part === 1) {
    const headers = await fetch(base + '/' + planned[0]!.scene + '.html', { method: 'HEAD' });
    assert.match(headers.headers.get('content-security-policy') ?? '', /connect-src 'none'/);
    assert.equal(headers.headers.get('x-frame-options'), null);

    if (plan.scenes.length === EXPLAINERS.length) {
      await page.goto(base + '/embed-lab.html');
      await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2);
      const mainFrame = page.mainFrame();
      for (const frame of page.frames().filter((frame) => frame !== mainFrame))
        await frame.waitForSelector('[data-ready=true]');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('iframe')].every((frame) => {
          const root = frame.contentDocument?.querySelector('#content');
          return root && Math.abs(frame.clientHeight - Math.ceil(root.getBoundingClientRect().height)) <= 1;
        }),
      );
      await page.screenshot({ path: join(review, 'embed-lab.png'), fullPage: true, animations: 'disabled' });
    }
    // Link previews: site:export --origin checks every explainer page and share page for its Open
    // Graph and Twitter card tags, with absolute https URLs and pictures at the declared size.
    const site = await mkdtemp(join(tmpdir(), 'rayner-site-'));
    try {
      const exported = spawnSync(
        process.execPath,
        [join(ROOT, 'tools/explain-site.ts'), site, '--origin', 'https://example.org', '--from', built],
        { encoding: 'utf8' },
      );
      assert.equal(exported.status, 0, `site:export --origin failed:\n${exported.stderr.slice(-4000)}`);
      console.log(exported.stdout.split('\n').find((line) => line.includes('Twitter card')));
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(connections, []);
  const after = await buildInputs(ROOT);
  assert.equal(after.hash, inputs.hash, 'build inputs changed during review');
  assert.equal(await reviewCodeHash(ROOT, after.hash), codeHash, 'review implementation or caption claims changed during review');
  for (const id of selectedScenes) await checkBuilt(join(built, id), join(ROOT, 'scenes/explainers', id), after.hash);
  await mkdir(join(ROOT, 'out/validation'), { recursive: true });
  await writeFile(
    receipt,
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
        scope,
        collectionChecks: scope.part === 1,
        catalogHash: plan.catalogHash,
        reviewCodeHash: codeHash,
        cases: cases.length,
        stepWidths: cases.reduce((n, c) => n + c.steps.length, 0),
        results: cases,
        consoleErrors: errors,
        runtimeConnections: connections,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${cases.length} served cases, every resting step at both widths, passed caption, actual paint, story-target, no-error and no-external-connection checks. Shared collection checks run once in shard 1. Screenshots: ${review}`,
  );
} catch (error) {
  await mkdir(review, { recursive: true });
  let screenshotError: string | undefined;
  try {
    await page?.screenshot({ path: join(review, 'failure.png'), fullPage: true });
  } catch (e) {
    screenshotError = String(e);
  }
  await writeFile(
    join(review, 'failure.json'),
    JSON.stringify(
      { scope, reviewCodeHash: codeHash, url: page?.url(), error: String(error), screenshotError },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  await browser?.close();
  server?.close();
}

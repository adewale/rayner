import { readerChrome } from './lib/explain-reader-shell.ts';
// Review the built collection as served, not just its source. Run demos:build (or demos:check) first;
// Checks every resting step in every served case on desktop and phone.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import type { Browser, Page } from 'playwright-core';
import { launch } from './lib/browser.ts';
import { collectProject, sceneInputs, ROOT } from './lib/explain-project.ts';
import { serve } from './lib/explain-serve.ts';
import { chromeFor } from '../app/embed-strings.ts';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';
import {
  reviewScope,
  inReviewScope,
  readStoryPlan,
  reviewCodeHash,
  validateReviewedCases,
} from './lib/explain-review-plan.ts';
import { reviewStoryVariant, STORY_CLAIMS } from './lib/explain-story-review.ts';
import { reviewClaims } from './lib/explain-review-scene.ts';

let server: Awaited<ReturnType<typeof serve>> | undefined;
let browser: Browser | undefined, page: Page | undefined;
let codeHash: string | undefined;
const scope = reviewScope(process.argv.slice(2));
const suffix = scope.total === 1 ? '' : `shard-${scope.part}-of-${scope.total}`;
const receipt = join(ROOT, 'out/validation', `browser-review${suffix ? '-' + suffix : ''}.json`);
const review = join(ROOT, 'out/review', suffix);
try {
  await rm(receipt, { force: true });
  await rm(review, { recursive: true, force: true });
  codeHash = await reviewCodeHash(ROOT);
  server = await serve(join(ROOT, 'out'), 0, 'explainers/');
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
  await page.goto(base + '/explainers/');
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
  });
  await page.screenshot({ path: join(review, 'gallery.png'), fullPage: true, animations: 'disabled' });
  const plan = await readStoryPlan(join(ROOT, 'out/explainers'));
  const planned = plan.cases.filter((_, i) => inReviewScope(i, scope));
  assert.ok(planned.length, 'story shard selects no cases');
  let ordinal = 0;
  const cases = [];
  for (const entry of EXPLAINERS) {
    const project = await collectProject(join(ROOT, 'scenes/explainers', entry.id), { write: false });
    const claims = await reviewClaims(project, undefined, STORY_CLAIMS[entry.id]);
    assert.deepEqual(
      JSON.parse(await readFile(join(ROOT, 'out/explainers', entry.id, 'inputs.json'), 'utf8')),
      await sceneInputs(project),
      `${entry.id}: rebuild stale collection output before reviewing`,
    );
    let selected = 0;
    for (const [index, variant] of project.variants.entries()) {
      if (!inReviewScope(ordinal++, scope)) continue;
      selected++;
      const directory = join(review, 'story', entry.id, String(index));
      await mkdir(directory, { recursive: true });
      const t = chromeFor(project.Scene.meta?.lang);
      const teaching = variant.trace.steps.some(s => s.meta.detail !== true) ? variant.trace.steps.filter(s => s.meta.detail !== true) : variant.trace.steps;
      const steps = await reviewStoryVariant(
        page,
        `${base}/explainers/${entry.id}.html`,
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
  const headers = await fetch(base + '/explainers/exgit.html', { method: 'HEAD' });
  assert.match(headers.headers.get('content-security-policy') ?? '', /connect-src 'none'/);
  assert.equal(headers.headers.get('x-frame-options'), null);

  await page.goto(base + '/explainers/embed-lab.html');
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
  // Link previews: site:export --origin checks every explainer page and share page for its Open
  // Graph and Twitter card tags, with absolute https URLs and pictures at the declared size.
  const site = await mkdtemp(join(tmpdir(), 'rayner-site-'));
  try {
    const exported = spawnSync(
      process.execPath,
      [join(ROOT, 'tools/explain-site.ts'), site, '--origin', 'https://example.org'],
      { encoding: 'utf8' },
    );
    assert.equal(exported.status, 0, `site:export --origin failed:\n${exported.stderr.slice(-4000)}`);
    console.log(exported.stdout.split('\n').find((line) => line.includes('Twitter card')));
  } finally {
    await rm(site, { recursive: true, force: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(connections, []);
  assert.equal(await reviewCodeHash(ROOT), codeHash, 'review implementation or caption claims changed during review');
  await mkdir(join(ROOT, 'out/validation'), { recursive: true });
  await writeFile(
    receipt,
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
        scope,
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
    `${cases.length} served cases, every resting step at both widths, passed caption, actual paint, story-target, no-error and no-external-connection checks. Response headers, link preview tags and the two-embed host page passed. Screenshots: ${review}`,
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

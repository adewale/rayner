import { cropTest, readerChrome, readerShellProblems } from '../tools/lib/explain-reader-shell.ts';
import type { CropExpectation } from '../tools/lib/explain-reader-shell.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page, Frame } from 'playwright-core';
import { launch } from '../tools/lib/browser.ts';
import { collectProject, defaultVariant } from '../tools/lib/explain-project.ts';
import type { Project } from '../tools/lib/explain-project.ts';
import { buildExplainer, buildLoader } from '../tools/lib/explain-build.ts';
import { serve } from '../tools/lib/explain-serve.ts';
import { publishedPage } from '../tools/lib/explain-share.ts';
import { fc, params } from './lib/pbt.ts';
import { resolveSettings } from '../explain/index.ts';
import type { Settings } from '../explain/index.ts';
import { pictureHtml, pictureSummary, stepWords } from '../explain/trace.ts';
import { NARROW_PX, READ_PX, closeUps, labelsToRead, stageScale, stepLayouts, toView, viewBox } from '../app/embed-closeup.ts';
import type { StepLayout } from '../app/embed-closeup.ts';
import { labelOf } from '../explain/diagrams.ts';
import { labelsSaying, restingBox, wordsOutsideCards } from './lib/scenes.ts';
import type { Box } from '../src/index.ts';
import { chromeFor } from '../app/embed-strings.ts';
import { Text, VMobject } from '../src/index.ts';

const enabled = !!process.env.EXPLAIN_BROWSER,
  options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for real cross-origin browser checks' };
let browser: Browser, folder: string, host: string, embed: string;
// The host page is whatever a test sets; the explainers are served as published, with their header recipe.
let hostBody = '';
const hostServer = createServer((_, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(hostBody);
});

let embedServer: { url: string; close(): void } | undefined;
const projects = new Map<string, Project>();
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-embed-test-'));
  browser = await launch();
  await new Promise<void>((r) => hostServer.listen(0, '127.0.0.1', r));
  host = `http://127.0.0.1:${(hostServer.address() as { port: number }).port}`;
  // quotient-familial is the one scene in French (meta.lang 'fr'); token-bucket,
  // mr-cache and quotient-familial watch state for readers (meta.watch).
  for (const name of ['mr-cache', 'oauth-pkce', 'exgit', 'lantern', 'send-sync', 'quotient-familial', 'feature-tour', 'token-bucket']) {
    const project = await collectProject(`scenes/explainers/${name}`, { write: false });
    projects.set(name, project);
    await buildExplainer(project, join(folder, name + '.html'));
  }
  const references = await collectProject('test/fixtures/reference-steps', {write: false});
  projects.set('references', references);
  await buildExplainer(references, join(folder, 'references.html'));
  await buildLoader(join(folder, 'loader.js'));
  embedServer = await serve(folder, 0, 'mr-cache.html');
  embed = embedServer.url;
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  hostServer.close();
  embedServer?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});
function loader(id: string, scene: string) {
  return `<div id="${id}"></div><script src="${embed}/loader.js" data-src="${embed}/${scene}.html" data-target="${id}" data-title="${scene}"></script>`;
}

test('missing steps fall back to the explanation when reference notes precede its first step', options, async () => {
  const source = join(folder, 'leading-note.ts');
  await writeFile(
    source,
    `import{Scene,Text}from'rayner';import{stage,settingsOf}from'rayner/explain';
export default class Leading extends Scene{
static meta={id:'leading-note',title:'Start with the explanation'};
static settings=[{id:'case',label:'Case',default:'one',options:[{value:'one',label:'One'},{value:'two',label:'Two'}]}];
async construct(){const s=stage(this);for(const id of ['note','start',...(settingsOf(this).case==='one'?['extra']:[]),'ending']){
await this.step(id,{title:id,caption:id,detail:id==='note'});await s.clear();await s.enter(new Text(id,{fontSize:1}));}}}`,
  );
  const project = await collectProject(source, { write: false });
  await buildExplainer(project, join(folder, 'leading-note.html'));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    const entry = `${embed}/leading-note.html`;
    await page.goto(entry + '?step=missing');
    await page.waitForSelector('[data-ready=true]');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'start');
    assert.equal(await page.locator('details.supporting').getAttribute('open'), null);
    assert.match((await page.locator('.notice').textContent()) ?? '', /no “missing” step/);
    await page.goto(entry + '?case=one&step=extra');
    await page.waitForSelector('[data-ready=true]');
    await page.locator('fieldset.case input[value="two"]').check();
    await page.waitForURL(/case=two&step=start/);
    await page.goto(entry + '?step=note');
    await page.waitForSelector('[data-ready=true]');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'note', 'valid reference permalinks remain valid');
    await page.getByRole('button', { name: 'Back to the explanation', exact: true }).click();
    await page.waitForURL(/step=start/);
  } finally {
    await page.close();
  }
});

test('Next view leaves an authored whole-frame opening and distinguishes Whole picture from its first stop', options, async () => {
  const source = join(folder, 'identity-opening.ts');
  await writeFile(source, `import{Scene,Text}from'rayner';import{stage}from'rayner/explain';
export default class IdentityOpening extends Scene{
static meta={id:'identity-opening',title:'Readable comparison'};
async construct(){const s=stage(this);await this.step('compare',{title:'Compare',caption:'The large labels compare.'});
const subject=new Text('COMPARISON',{fontSize:1}),detail=new Text('tiny detail',{fontSize:0.15}).moveTo([4,-3]);
await s.enter(subject,detail);s.reading(subject);}}`);
  const project = await collectProject(source, {write: false});
  await buildExplainer(project, join(folder, 'identity-opening.html'));
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  try {
    await page.goto(`${embed}/identity-opening.html`);
    await page.waitForSelector('[data-ready=true]');
    const [w, h] = await page.locator('.stage').evaluate(e => [e.clientWidth, e.clientHeight]);
    const tour = closeUps((await stepLayouts(project.Scene)).get('compare'), w!, h!);
    assert.ok(tour.length > 1 && tour[0]!.k === 1 && tour[1]!.k > 1,
      'large comparison labels need the whole frame while smaller implementation labels need detail stops');
    const count = page.locator('.view-controls > span'), next = page.getByRole('button', {name: 'Next view', exact: true});
    const painted = () => page.locator('.stage svg:not(.leaving)').getAttribute('viewBox');
    const opening = await painted();
    await next.click();
    const detail = await painted();
    assert.notEqual(detail, opening, 'Next view must paint a detail view from the identity opening');
    assert.equal(await count.textContent(), `View 2 of ${tour.length}`);
    const detailZoom = await settledZoom(page);
    assert.ok(detailZoom && Math.abs(detailZoom.k - tour[1]!.k) < 1e-6);
    // Whole picture explicitly opts out, even though its pixels match the authored opening.
    await page.getByRole('button', {name: 'Whole picture', exact: true}).click();
    assert.equal(await count.textContent(), 'Whole picture');
    await next.click();
    assert.equal(await painted(), opening);
    assert.equal(await count.textContent(), `View 1 of ${tour.length}`);
    await next.click();
    assert.equal(await painted(), detail);
    assert.equal(await count.textContent(), `View 2 of ${tour.length}`);
    // A manual reset away from a detail stop still behaves as Whole picture did.
    await page.locator('.stage').focus();
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    assert.equal(await painted(), opening);
    assert.equal(await count.textContent(), 'Whole picture');
    await next.click();
    assert.equal(await count.textContent(), `View 1 of ${tour.length}`);
    await next.click();
    assert.equal(await painted(), detail);
  } finally { await page.close(); }
});

test('authored phone openings keep comparison ink readable without painting a clipped heading', options, async () => {
  const { storyFrames, inspectStoryFrame, covered, STORY_CLAIMS } = await import(
    '../tools/lib/explain-story-review.ts'
  );
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  let openings = 0;
  try {
    for (const [id, names] of [
      ['gtfs', ['reader-date', 'reader-stop']],
      ['token-bucket', ['reader-refill']],
      ['latest-search', ['reader-guard']],
    ] as const) {
      const project = await collectProject(`scenes/explainers/${id}`, { write: false });
      const variant = defaultVariant(project);
      await buildExplainer(project, join(folder, `${id}-heading.html`));
      const claims = (STORY_CLAIMS[id] ?? []).filter((c) =>
        Object.entries(c.settings ?? {}).every(([k, v]) => variant.values[k] === v),
      );
      const frames = await storyFrames(variant.Scene, [
        ...claims,
        ...names.map((step) => ({ step, targets: [{ key: '__heading' }, { key: '__chrome' }] })),
      ]);
      const layouts = await stepLayouts(variant.Scene);
      for (const step of names) {
        await page.goto(`${embed}/${id}-heading.html?${new URLSearchParams({ ...variant.values, step })}`);
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(() => !document.querySelector('svg.leaving'));
        const frame = frames.get(step)!,
          seen = await inspectStoryFrame(page, frame);
        const headingIndices = new Set(
          frame.targets.filter((t) => t.name === '__heading' || t.name === '__chrome').flatMap((t) => t.indices),
        );
        const headingInk = seen.ink.filter((p) => headingIndices.has(p.index));
        assert.ok(headingInk.length > 1, 'the observation control contains native heading and chrome ink');
        // Use the actual stage for admission; the paint checker expands its
        // viewport by one pixel for coverage rounding, including off-screen ink.
        const viewport = await page.locator('.stage svg:not(.leaving)').evaluate((node) => {
          const svg = node as SVGSVGElement,
            stage = svg.parentElement!.getBoundingClientRect(),
            inverse = svg.getScreenCTM()!.inverse();
          const a = new DOMPoint(stage.left, stage.top).matrixTransform(inverse),
            b = new DOMPoint(stage.right, stage.bottom).matrixTransform(inverse);
          return [a.x, a.y, b.x, b.y];
        });
        const overlaps = (b: number[]) =>
          b[0]! < viewport[2]! && b[2]! > viewport[0]! && b[1]! < viewport[3]! && b[3]! > viewport[1]!;
        assert.ok(
          !headingInk.some((p) => overlaps(p.box)) ||
            headingInk.every((p) => p.visible && p.complete && covered(p.box, [seen.viewport])),
          `${id}/${step}: the opening must show all heading ink or leave it outside the picture`,
        );
        const subjects = frame.targets.filter((t) => t.opening);
        assert.ok(subjects.length > 0);
        for (const target of subjects)
          for (const index of target.indices) {
            const ink = seen.ink.find((p) => p.index === index)!;
            assert.ok(
              ink.visible && ink.complete && covered(ink.box, [seen.viewport]),
              `${id}/${step}/${target.name}: comparison ink remains whole`,
            );
          }
        const scale = await page.locator('.stage svg:not(.leaving)').evaluate((svg) => {
          const matrix = (svg as SVGSVGElement).getScreenCTM()!;
          return Math.hypot(matrix.a, matrix.b) * 1000;
        });
        const labels = layouts.get(step)!.reading!.labels;
        assert.ok(labels.length > 0);
        for (const label of labels)
          assert.ok(label.size * scale >= 12 - 1e-5, `${id}/${step}: ${label.size * scale}px declared label`);
        openings++;
      }
    }
    assert.equal(openings, 4);
  } finally {
    await page.close();
  }
});

// specs/player-redesign.md R2: the viewports the stepper row must fit at load, and the two pages it is checked on.
const R2_VIEWPORTS = [[320, 568], [390, 568], [390, 844], [768, 1024], [1280, 800], [1440, 900]] as const;
const R2_PAGES = ['/mr-cache.html?step=before&request=hit', '/oauth-pkce.html?attacker=yes'];
type Rect = { top: number; bottom: number; left: number; right: number };
/** Boxes of the named elements (the first match of each), with the viewport they were read in. */
const boxesOf = <K extends string>(page: Page, selectors: Record<K, string>) =>
  page.evaluate((selectors: Record<string, string>) => {
    const rect = (s: string): Rect | null => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
    };
    return {
      boxes: Object.fromEntries(Object.entries(selectors).map(([k, s]) => [k, rect(s)])),
      scrollY,
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, selectors as Record<string, string>) as Promise<{ boxes: Record<K, Rect>; scrollY: number; width: number; height: number; scrollWidth: number }>;
const insideViewport = (b: Rect, v: { width: number; height: number }) => b.top >= 0 && b.bottom <= v.height && b.left >= 0 && b.right <= v.width;
// The visible explanation excludes notes, unless the author supplied only notes.
// Keep this oracle separate from the production navigation helper.
const teachingSpecs = (project: Project, values: Settings) => {
  const all = stepsOf(project, values), story = all.filter(step => !step.detail);
  return story.length ? story : all;
};

test('one stepper row: exactly one Next step and one Previous step button', options, async () => {
  for (const [name, project] of projects) {
    const t = chromeFor(project.Scene.meta?.lang);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/${name}.html`);
      await page.waitForSelector('[data-ready=true]');
      const seen = await page.evaluate((t) => ({
        next: document.querySelectorAll(`button[aria-label="${t.nextLabel}"]`).length,
        previous: document.querySelectorAll(`button[aria-label="${t.previous}"]`).length,
        // The card: the picture, the stepper row, the words, in that order.
        order: [...document.querySelector('.player')!.children].filter((e) => e.matches('.frame, .stepper, .words')).map((e) => e.className),
        stage: !!document.querySelector('.player > .frame > .stage'),
        group: [document.querySelector('.stepper')?.getAttribute('role'), document.querySelector('.stepper')?.getAttribute('aria-label')],
        first: [...document.querySelectorAll('.stepper > button')].slice(0, 2).map((b) => b.getAttribute('aria-label')),
        nextText: document.querySelector('.stepper .primary')?.textContent,
      }), { nextLabel: t.nextLabel, previous: t.previous });
      assert.deepEqual(seen, {
        next: 1,
        previous: 1,
        order: ['frame', 'stepper', 'words'],
        stage: true,
        group: ['group', t.controls],
        first: [t.previous, t.nextLabel],
        nextText: t.next,
      }, name);
    } finally { await page.close(); }
  }
  // The one pair works, on a short phone and a desktop.
  for (const viewport of [{ width: 390, height: 568 }, { width: 1280, height: 800 }]) for (const [entry, following] of [['reader-request', 'reader-outcome'], ['before', 'diff']]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/mr-cache.html?step=${entry}&request=hit`);
      await page.waitForSelector('[data-ready=true]');
      assert.equal(await page.getByRole('button', { name: 'Previous step', exact: true }).isDisabled(), entry === 'reader-request');
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('step'), following);
      assert.equal(await page.getByRole('button', { name: 'Previous step', exact: true }).isEnabled(), true);
    } finally { await page.close(); }
  }
});

test('Next is on screen at load', options, async () => {
  for (const [width, height] of R2_VIEWPORTS)
    for (const url of R2_PAGES) {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.goto(embed + url);
        await page.waitForSelector('[data-ready=true]');
        const v = await boxesOf(page, { next: 'button[aria-label="Next step"]', stage: '.stage', stepper: '.stepper', caption: '.caption', lede: '.lede' });
        const where = `${url} at ${width}×${height}`;
        assert.equal(v.scrollY, 0, `${where}: opened at the top`);
        assert.ok(insideViewport(v.boxes.next, v), `${where}: Next ${JSON.stringify(v.boxes.next)}`);
        if (width >= 1280) assert.ok(insideViewport(v.boxes.lede, v), `${where}: the step heading ${JSON.stringify(v.boxes.lede)}`);
        if (width === 390 && height === 844) {
          assert.ok(insideViewport(v.boxes.stage, v), `${where}: the stage ${JSON.stringify(v.boxes.stage)}`);
          assert.ok(insideViewport(v.boxes.stepper, v), `${where}: the stepper row ${JSON.stringify(v.boxes.stepper)}`);
          assert.ok(v.boxes.caption.top + 24 <= v.height, `${where}: the caption's first line ${JSON.stringify(v.boxes.caption)}`);
        }
        assert.ok(v.scrollWidth <= v.width, `${where}: no horizontal scroll (${v.scrollWidth} > ${v.width})`);
      } finally { await page.close(); }
    }
  // specs/player-tile.md T1: with the header inside the card, the French ten-step page too.
  for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(embed + '/quotient-familial.html');
      await page.waitForSelector('[data-ready=true]');
      const v = await boxesOf(page, { next: '.stepper .primary', lede: '.lede' });
      assert.ok(insideViewport(v.boxes.next, v) && insideViewport(v.boxes.lede, v), `quotient-familial at ${width}×${height}: ${JSON.stringify(v.boxes)}`);
    } finally { await page.close(); }
  }
});

test('feature-tour case navigation starts with its recipe, including transcript links, while direct result permalinks still work', options, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    await page.goto(embed + '/feature-tour.html?feature=camera&step=result');
    await page.waitForSelector('[data-ready=true]');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'result', 'a direct result permalink remains valid');
    const links = await page.locator('.transcript section a').evaluateAll(anchors => anchors.map(a => new URL((a as HTMLAnchorElement).href).searchParams.get('step')));
    assert.equal(links.length, 15, 'each authoring case offers one entry link');
    assert.deepEqual([...new Set(links)], ['recipe'], 'entry links start at the code, not the result');
    await page.locator('fieldset.case input[value="state"]').check();
    await page.waitForURL(/feature=state&step=recipe/);
    assert.equal(await page.locator('.steps button[aria-current="step"]').getAttribute('data-step'), 'recipe');
    await page.locator('.stepper button[aria-label="Next step"]').click();
    await page.waitForURL(/feature=state&step=result/);
    await page.goBack();
    await page.waitForURL(/feature=state&step=recipe/);
    await page.goBack();
    await page.waitForURL(/feature=camera&step=result/);
    assert.equal(new URL(page.url()).searchParams.get('feature'), 'camera');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'result');
    await page.goto(embed + '/mr-cache.html?request=hit&step=request');
    await page.waitForSelector('[data-ready=true]');
    await page.locator('fieldset.case input[value="miss"]').check();
    await page.waitForURL(/request=miss&step=request/);
  } finally { await page.close(); }
});

test('fullscreen keeps the stepper row reachable when the player overflows', options, async () => {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce'});
  try {
    await page.goto(embed + '/mr-cache.html?step=before&request=hit');
    await page.waitForSelector('[data-ready=true]');
    await page.getByRole('button', {name: 'Enlarge'}).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    const bounds = await page.evaluate(() => {
      const player = document.querySelector<HTMLElement>('.player')!;
      const row = document.querySelector('.stepper')!.getBoundingClientRect(),
        stage = document.querySelector('.stage')!.getBoundingClientRect();
      const head = document.querySelector('.head')!.getBoundingClientRect(),
        lede = document.querySelector('.lede')!.getBoundingClientRect();
      return {top: row.top, bottom: row.bottom, stage: stage.height, viewport: innerHeight, overflow: player.scrollHeight > player.clientHeight, head: [head.top, head.bottom], lede: [lede.top, lede.bottom]};
    });
    assert.equal(bounds.overflow, true, 'the test exercises a scrollable fullscreen player');
    assert.ok(bounds.stage <= bounds.viewport - 180 + 1, 'the stage keeps within the screen less 180 px');
    assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.viewport, 'Next is reachable at scroll position zero');
    // specs/player-tile.md T2: the card alone, its header and the step's heading on screen too.
    assert.ok(bounds.head[0]! >= 0 && bounds.lede[1]! <= bounds.viewport, `the header and the step heading are on screen ${JSON.stringify(bounds)}`);
    await page.getByRole('button', {name: 'Next step', exact: true}).click();
    assert.equal(new URL(page.url()).searchParams.get('step'), 'diff');
  } finally { await page.close(); }
});

test('phone: the stepper row follows the picture, the words follow it, and a single view never advertises Next view', options, async () => {
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  try {
    await page.goto(embed + '/oauth-pkce.html?attacker=yes&step=attack');
    await page.waitForSelector('[data-ready=true]');
    await page.locator('.leaving').waitFor({state: 'detached'});
    const {boxes: b} = await boxesOf(page, {stage: '.stage', stepper: '.stepper', lede: '.lede', caption: '.caption'});
    assert.ok(b.stepper.top >= b.stage.bottom - 1 && b.stepper.top - b.stage.bottom <= 2, 'the stepper row is straight under the picture');
    assert.ok(b.lede.top >= b.stepper.bottom, 'the step heading follows the stepper row');
    assert.ok(b.caption.top >= b.lede.bottom, 'the caption follows the step heading');
    assert.equal(await page.locator('.view-controls').isVisible(), false, 'a single view needs no tour toolbar');
    assert.equal(await page.getByRole('button', {name: 'Next view', exact: true}).isVisible(), false);
    assert.equal(await page.locator('.view-help').isVisible(), false);
    assert.equal(await page.getByRole('button', {name: 'Whole picture', exact: true}).isEnabled(), true);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
    assert.ok(await page.locator('.stage').evaluate(stage => {const box = stage.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;}), 'using a view tool brings the changed picture into view');
  } finally { await page.close(); }
});
// Shell-wide assertions also run in every catalog story case. These fixtures keep the
// independent language and hosting boundaries without rebuilding the whole collection.
const shellFixtures = ['mr-cache', 'quotient-familial', 'feature-tour', 'lantern'];
test('shared player chrome works in both languages, with and without settings', options, async () => {
  const { PRODUCT } = await import('../scenes/explainers/catalog.ts');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const languages = new Set<string>();
  try {
    for (const id of shellFixtures) {
      const project = projects.get(id)!;
      languages.add(project.Scene.meta?.lang ?? 'en');
      await page.goto(`${embed}/${id}.html`);
      await page.waitForSelector('[data-ready=true]');
      const contract = { chrome: readerChrome(chromeFor(project.Scene.meta?.lang)), home: PRODUCT.home,
        cases: project.Scene.settings?.length ?? 0, steps: teachingSpecs(project, resolveSettings(project.Scene)).map(s => s.step) };
      assert.deepEqual(await page.evaluate(readerShellProblems, contract), [], id);
      // A deliberate missing segment and footer must each be rejected by the keeper.
      if (id === shellFixtures[0]) {
        await page.locator('.step-bar button').first().evaluate(el => el.remove());
        assert.ok((await page.evaluate(readerShellProblems, contract)).some(p => p.startsWith('teaching steps:')));
        await page.locator('a.mark').evaluate(el => el.remove());
        assert.ok((await page.evaluate(readerShellProblems, contract)).some(p => p.startsWith('maker mark:')));
      }
    }
    assert.equal(languages.size, 2, 'English and French both visited');
  } finally { await page.close(); }
});
test('the shared tile stands alone in English and French, standalone, in a raw iframe and in the loader', options, async () => {
  const { PRODUCT } = await import('../scenes/explainers/catalog.ts');
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, reducedMotion: 'reduce' });
  let pages = 0;
  try {
    const page = await context.newPage();
    for (const id of shellFixtures) {
      const project = projects.get(id)!;
      const t = chromeFor(project.Scene.meta?.lang),
        values = resolveSettings(project.Scene),
        first = teachingSpecs(project, values);
      const expect: CropExpectation = {
        player: t.player,
        next: t.nextLabel,
        title: project.Scene.meta?.title ?? id,
        kicker: t.stepOf(1, first.length),
        segments: first.length,
        cases: project.Scene.settings?.length ?? 0,
        madeWith: t.madeWith,
        home: PRODUCT.home,
        open: null,
      };
      const src = `${embed}/${id}.html`;
      await page.goto(src);
      await page.waitForSelector('#content[data-ready=true]');
      assert.deepEqual(await page.evaluate(cropTest, expect), [], `${id}, standalone`);
      if (id === shellFixtures[0]) {
        await page.locator('#content').evaluate(content => {
          const extra = document.createElement('div'); extra.id = 'outside-tile-control'; extra.textContent = 'Outside the tile'; content.append(extra);
        });
        assert.ok((await page.evaluate(cropTest, expect)).some(p => p.startsWith('outside the tile:')), 'the crop keeper rejects content outside the tile');
        await page.locator('#outside-tile-control').evaluate(el => el.remove());
        await page.locator('h1').evaluate(el => el.textContent = 'Wrong title');
        assert.ok((await page.evaluate(cropTest, expect)).some(p => p.startsWith('h1:')), 'the crop keeper rejects a wrong title');
        await page.locator('h1').evaluate((el, title) => el.textContent = title, expect.title);
        assert.deepEqual(await page.evaluate(cropTest, expect), [], 'restoring the page restores crop acceptance');
      }
      const framed = { ...expect, open: { path: src, query: { ...values, step: first[0]!.step } } };
      for (const [how, body] of [
        ['a raw iframe', `<!doctype html><style>body{margin:0}</style><iframe title="t" src="${src}" style="width:900px;height:800px;border:0"></iframe>`],
        ['the loader', `<!doctype html><style>body{margin:0}</style><div id="a"></div><script src="${embed}/loader.js" data-src="${src}" data-target="a" data-title="t"></script>`],
      ] as const) {
        hostBody = body;
        await page.goto(host);
        await page.waitForFunction(() => !!document.querySelector('iframe'));
        const frame = (await (await page.locator('iframe').elementHandle())!.contentFrame())!;
        await frame.waitForSelector('#content[data-ready=true]');
        assert.deepEqual(await frame.evaluate(cropTest, framed), [], `${id}, in ${how}`);
      }
      pages++;
    }
  } finally {
    await context.close();
  }
  assert.equal(pages, shellFixtures.length);
});
test('the step heading shows on every width with the total', options, async () => {
  for (const [name, total, kicker] of [['mr-cache', 2, 'Step 1 of 2'], ['quotient-familial', 2, 'Étape 1 sur 2']] as const) {
    const project = projects.get(name)!,
      first = stepWords(project.variants.find((v) => sameCase(project, v.values, resolveSettings(project.Scene)))!.trace.steps[0]!);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      try {
        await page.goto(`${embed}/${name}.html`);
        await page.waitForSelector('[data-ready=true]');
        const lede = await page.locator('.lede').evaluate((p) => ({
          visible: (p as HTMLElement).offsetParent !== null,
          kicker: p.querySelector('.kicker')?.textContent,
          title: p.querySelector('strong')?.textContent,
          line: (p.querySelector('.line') as HTMLElement | null)?.hidden ? null : p.querySelector('.line')?.textContent,
          // The caption announces the step; the heading is not a second live region.
          live: p.closest('[aria-live]') !== null,
        }));
        const where = `${name} at ${viewport.width}`;
        assert.deepEqual(lede, { visible: true, kicker, title: first.title, line: first.line || null, live: false }, where);
        assert.match(lede.kicker!, new RegExp(` ${total}$`), `${where}: the kicker names the total`);
      } finally { await page.close(); }
    }
  }
});
// specs/player-guidance.md G1: under the caption, what the step changed of the state the author watches.
const changesOf = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.words > .changes');
    return row && {
      hidden: row.hidden,
      label: row.firstElementChild && !row.firstElementChild.classList.contains('change') ? row.firstElementChild.textContent : null,
      changes: [...row.querySelectorAll('.change')].map((c) => c.textContent),
      live: row.closest('[aria-live]') !== null,
      height: row.getBoundingClientRect().height,
    };
  });
test('what changed: token-bucket\'s burst step lists its three watched changes under the caption; a scene without watch has no row', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/token-bucket.html?step=burst`);
    await page.waitForSelector('[data-ready=true]');
    const burst = await changesOf(page);
    assert.deepEqual({ ...burst, height: undefined }, {
      hidden: false,
      label: 'What changed',
      changes: ['Tokens left: 5 → 0', 'Accepted: 0 → 5', 'Rejected: R6'],
      // Plain text, read with the words: the caption already announces the step.
      live: false,
      height: undefined,
    });
    // It follows the caption, inside the words.
    assert.equal(await page.locator('.caption + .changes').count(), 1);
    // The comparison step changes nothing watched: no items, but the row keeps its room.
    await page.locator('.steps button[data-step=trace]').click();
    await page.waitForFunction(() => document.querySelector('.steps [aria-current=step]')?.getAttribute('data-step') === 'trace');
    const trace = await changesOf(page);
    assert.deepEqual([trace!.hidden, trace!.label, trace!.changes], [false, null, []]);
    assert.equal(trace!.height, burst!.height, 'the row keeps the room of its tallest step');
    // French: the label and the values in French.
    await page.goto(`${embed}/quotient-familial.html?step=parts`);
    await page.waitForSelector('[data-ready=true]');
    assert.deepEqual((await changesOf(page))!.changes, ['Parts\u202f: 2,5']);
    assert.equal((await changesOf(page))!.label, 'Ce qui a changé');
    for (const scene of ['exgit', 'send-sync']) {
      await page.goto(`${embed}/${scene}.html`);
      await page.waitForSelector('[data-ready=true]');
      assert.equal(await page.locator('.changes').count(), 0, `${scene}: no changes row`);
      assert.doesNotMatch((await page.locator('.transcript').textContent())!, /What changed/, `${scene}: no line in the transcript`);
    }
  } finally {
    await page.close();
  }
});
// specs/player-guidance.md G3: the controls teach their keys, and the footer how to move.
test('every keyed control names its key in its tooltip and aria-keyshortcuts, in English and French; names are unchanged', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    for (const [name, lang] of [['mr-cache', 'en'], ['quotient-familial', 'fr']] as const) {
      const t = chromeFor(lang);
      await page.goto(`${embed}/${name}.html`);
      await page.waitForSelector('[data-ready=true]');
      const keys = await page.evaluate(
        (names) => names.map((n) => {
          const b = document.querySelector<HTMLButtonElement>(`.stepper button[aria-label="${n}"]`);
          return b && [b.title, b.getAttribute('aria-keyshortcuts')];
        }),
        [t.previous, t.nextLabel, t.zoomIn, t.zoomOut, t.wholePicture],
      );
      assert.deepEqual(keys, [
        [`${t.previous} (←)`, 'ArrowLeft'],
        [`${t.nextLabel} (→)`, 'ArrowRight'],
        [`${t.zoomIn} (+)`, '+'],
        [`${t.zoomOut} (−)`, '-'],
        [`${t.wholePicture} (0)`, '0'],
      ], name);
      // At the end ArrowRight does not start again, so Start again names no key.
      await page.locator('.step-bar button').last().click();
      await page.waitForFunction((label) => document.querySelector('.stepper .primary')?.getAttribute('aria-label') === label, t.startAgainLabel);
      assert.deepEqual(await page.locator('.stepper .primary').evaluate((b) => [(b as HTMLButtonElement).title, b.getAttribute('aria-keyshortcuts')]), [t.startAgainLabel, null]);
      await page.getByRole('button', { name: t.previous, exact: true }).click();
      await page.waitForFunction((label) => document.querySelector('.stepper .primary')?.getAttribute('aria-label') === label, t.nextLabel);
      assert.deepEqual(await page.locator('.stepper .primary').evaluate((b) => [(b as HTMLButtonElement).title, b.getAttribute('aria-keyshortcuts')]), [`${t.nextLabel} (→)`, 'ArrowRight']);
    }
  } finally {
    await page.close();
  }
});
test('the footer hint: keys on a fine pointer, taps on a touch screen, wrapping on a narrow card without pushing the mark or the way out off the row', options, async () => {
  const fine = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    for (const [name, lang] of [['mr-cache', 'en'], ['quotient-familial', 'fr']] as const) {
      const t = chromeFor(lang);
      await fine.goto(`${embed}/${name}.html`);
      await fine.waitForSelector('[data-ready=true]');
      assert.equal(await fine.locator('.foot .hint').textContent(), t.hintKeys, name);
      const page = await touch.newPage();
      await page.goto(`${embed}/${name}.html`);
      await page.waitForSelector('[data-ready=true]');
      assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
      // On a narrow stage, a step with more than one view says how Next view differs from Next.
      const touring = await page.locator('.view-controls').evaluate((v) => !(v as HTMLElement).hidden && (v as HTMLElement).style.visibility !== 'hidden');
      assert.equal(await page.locator('.foot .hint').textContent(), touring ? t.viewHelp : t.hintTouch, name);
      await page.close();
    }
    // Source notes name the return control when the story's segments are hidden;
    // a source note with several views still explains its available Next view control.
    const phone = await touch.newPage();
    try {
      const t = chromeFor('en');
      await phone.goto(`${embed}/mr-cache.html?request=hit&step=request`);
      await phone.waitForSelector('[data-ready=true]');
      assert.equal(await phone.locator('.foot .hint').textContent(), t.backToStory, 'a source note with one view');
      assert.equal(await phone.locator('.step-bar').isVisible(), false, 'source notes hide the teaching-path segments');
      assert.equal(await phone.getByRole('button', { name: t.backToStory, exact: true }).isVisible(), true, 'the named return control is available');
      await phone.goto(`${embed}/mr-cache.html?request=hit&step=after`);
      await phone.waitForSelector('[data-ready=true]');
      assert.equal(await phone.locator('.foot .hint').textContent(), t.viewHelp, 'a step with three views');
      assert.equal(await phone.getByRole('button', { name: 'Next view', exact: true }).getAttribute('aria-describedby'),
        await phone.locator('.foot .hint').getAttribute('id'), 'Next view is described by the hint');
    } finally { await phone.close(); }
    // Framed at 390 px, with the way out: the hint wraps between them, inside the footer's row.
    hostBody = `<!doctype html><style>body{margin:0}</style><iframe title="t" src="${embed}/quotient-familial.html" style="width:390px;height:900px;border:0"></iframe>`;
    const host390 = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    try {
      await host390.goto(host);
      const frame = await readyFrame(host390, 'quotient-familial');
      const row = await frame.evaluate(() => {
        const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const foot = box('.foot'), mark = box('.foot .mark'), hint = box('.foot .hint'), open = box('.foot .open');
        return { inside: [mark, hint, open].every((b) => b.left >= foot.left && b.right <= foot.right && b.top >= foot.top && b.bottom <= foot.bottom), order: mark.right <= hint.left && hint.right <= open.left, lines: Math.round(hint.height / 18) };
      });
      assert.deepEqual({ ...row, lines: undefined }, { inside: true, order: true, lines: undefined }, JSON.stringify(row));
      assert.ok(row.lines >= 2, `the hint wraps: ${JSON.stringify(row)}`);
    } finally { await host390.close(); }
    // At 360 px and under the keys-or-taps hint may go; the mark and the way out stay. The words
    // on Next view stay, on a step that has more than one view.
    await fine.setViewportSize({ width: 340, height: 700 });
    await fine.goto(`${embed}/mr-cache.html?request=hit&step=request`);
    await fine.waitForSelector('[data-ready=true]');
    assert.equal(await fine.locator('.foot .hint').isVisible(), false);
    await fine.goto(`${embed}/mr-cache.html?request=hit&step=after`);
    await fine.waitForSelector('[data-ready=true]');
    assert.equal(await fine.locator('.foot .hint').isVisible(), true);
    assert.equal(await fine.locator('.foot .hint').textContent(), chromeFor('en').viewHelp);
  } finally {
    await fine.close();
    await touch.close();
  }
});
// specs/player-guidance.md G7: the changes row, the hint and the thumbnails follow the page's direction.
test('right to left: the changes row reads from the right and the footer hint sits between the mark and the way out', options, async () => {
  hostBody = `<!doctype html><style>body{margin:0}</style><iframe title="t" src="${embed}/mr-cache.html?request=hit&step=before" style="width:1280px;height:900px;border:0"></iframe>`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  try {
    await page.goto(host);
    const frame = await readyFrame(page, 'mr-cache');
    const seen = await frame.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      const box = (e: Element) => e.getBoundingClientRect();
      const label = box(document.querySelector('.changes > span')!), change = box(document.querySelector('.changes .change')!);
      const mark = box(document.querySelector('.foot .mark')!), hint = box(document.querySelector('.foot .hint')!), open = box(document.querySelector('.foot .open')!);
      return { changes: label.left > change.right, hint: mark.left >= hint.right && hint.left >= open.right };
    });
    assert.deepEqual(seen, { changes: true, hint: true });
  } finally {
    await page.close();
  }
});
// specs/player-guidance.md G2: after the last step, Start again, and for a scene with settings, its next case.
const endOf = (page: Page) =>
  page.evaluate(() => {
    const next = document.querySelector<HTMLButtonElement>('.stepper .primary')!,
      tries = [...document.querySelectorAll<HTMLButtonElement>('.stepper > .button.try')];
    return {
      name: next.getAttribute('aria-label'),
      text: next.querySelector('span')!.textContent,
      disabled: next.disabled,
      // The Try button follows Next straight away, in the row and in the Tab order.
      tryCase: tries.filter((b) => !b.hidden).map((b) => [b.textContent, b.previousElementSibling === next]),
      step: new URL(location.href).searchParams.get('step'),
      request: new URL(location.href).searchParams.get('request'),
    };
  });
test('the last step: Next becomes Start again, back to step 1; Try ‘Cache miss’ loads the miss case at step 1; leaving the end restores Next', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/mr-cache.html?step=after`);
    await page.waitForSelector('[data-ready=true]');
    assert.deepEqual(await endOf(page), { name: 'Next step', text: 'Next', disabled: false, tryCase: [], step: 'after', request: 'hit' });
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'request');
    assert.deepEqual(await endOf(page), {
      name: 'Start again from step 1', text: 'Start again', disabled: false,
      tryCase: [['Try ‘Cache miss’', true]], step: 'request', request: 'hit',
    });
    // ArrowRight at the end does nothing: no wrap.
    await page.locator('#content').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    assert.equal((await endOf(page)).step, 'request');
    // Start again goes to step 1 and pushes history, as a step click does.
    const length = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Start again from step 1', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'reader-request');
    assert.deepEqual(await endOf(page), { name: 'Next step', text: 'Next', disabled: false, tryCase: [], step: 'reader-request', request: 'hit' });
    assert.equal(await page.evaluate(() => history.length), length + 1);
    // Try: the next option of the first setting, at its first step; then it offers the one after, wrapping.
    await page.goto(`${embed}/mr-cache.html?step=request`);
    await page.waitForSelector('[data-ready=true]');
    await page.getByRole('button', { name: 'Try ‘Cache miss’', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('request') === 'miss');
    await page.waitForFunction(() => !document.getElementById('content')!.classList.contains('loading'));
    assert.deepEqual(await endOf(page), { name: 'Next step', text: 'Next', disabled: false, tryCase: [], step: 'reader-request', request: 'miss' });
    assert.equal(await page.locator('input[name=request]:checked').getAttribute('value'), 'miss');
    // Focus stays on Next when the Try button goes.
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('primary')), true);
    await page.locator('.step-bar button[data-step=reader-outcome]').click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'reader-outcome');
    assert.deepEqual((await endOf(page)).tryCase, [['Try ‘Cache hit’', true]]);
    // Leaving the end, by Previous, restores Next and removes Try.
    await page.getByRole('button', { name: 'Previous step', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'reader-request');
    assert.deepEqual(await endOf(page), { name: 'Next step', text: 'Next', disabled: false, tryCase: [], step: 'reader-request', request: 'miss' });
    // A scene with one case (lantern; exgit has two): Start again, and no case button at all.
    await page.goto(`${embed}/lantern.html`);
    await page.waitForSelector('[data-ready=true]');
    await page.locator('.step-bar button').last().click();
    await page.waitForFunction(() => document.querySelector('.stepper .primary')?.getAttribute('aria-label') === 'Start again from step 1');
    assert.equal(await page.locator('.stepper > .button.try').count(), 0);
    // French: Recommencer, and Essayer « 2 » for quotient-familial's first setting.
    await page.goto(`${embed}/quotient-familial.html?step=revenus-2025`);
    await page.waitForSelector('[data-ready=true]');
    const fr = await endOf(page);
    assert.deepEqual([fr.name, fr.text, fr.tryCase], ['Recommencer à l’étape 1', 'Recommencer', [['Essayer «\u202f2\u202f»', true]]]);
  } finally {
    await page.close();
  }
});
test('the last step while it plays: Next still reads Next and rests the step; the face changes only at rest', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  try {
    await page.addInitScript(() => {
      (window as unknown as { __rests: string[] }).__rests = [];
      document.addEventListener('rayner:step', (e) => (window as unknown as { __rests: string[] }).__rests.push((e as CustomEvent).detail.step));
    });
    await page.goto(`${embed}/mr-cache.html?step=after`);
    await page.waitForSelector('[data-ready=true]');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    // Playing the last step: busy, and Next is still Next, enabled.
    await page.waitForFunction(() => document.querySelector('.stage')!.getAttribute('aria-busy') === 'true');
    const playing = await endOf(page);
    assert.deepEqual([playing.name, playing.disabled, playing.tryCase], ['Next step', false, []]);
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { __rests: string[] }).__rests.at(-1) === 'request');
    assert.equal(await page.locator('.stage').getAttribute('aria-busy'), null);
    const rested = await endOf(page);
    assert.deepEqual([rested.name, rested.step, rested.tryCase], ['Start again from step 1', 'request', [['Try ‘Cache miss’', true]]]);
  } finally {
    await page.close();
  }
});
// specs/player-redesign.md R3: the step bar. One segment per step, the current one filling as it plays.
/** The step bar as the reader's tools see it: each segment's step, state, Tab stop, name and fill. */
const stepBarOf = (page: Page) =>
  page.locator('.step-bar button').evaluateAll((bs) =>
    bs.map((b) => ({
      step: b.getAttribute('data-step'),
      state: b.getAttribute('data-state'),
      current: b.getAttribute('aria-current') === 'step',
      tab: (b as HTMLElement).tabIndex,
      label: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      progress: getComputedStyle(b).getPropertyValue('--progress').trim(),
    })),
  );
test('the step bar follows the teaching path and rebuilds when a case changes that path', options, async () => {
  for (const [name, setting, from, to] of [['mr-cache', 'request', 'hit', 'miss'], ['oauth-pkce', 'attacker', 'no', 'yes'], ['references', 'case', 'one', 'all']] as const) {
    const p = projects.get(name)!;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/${name}.html?${setting}=${from}`);
      await page.waitForSelector('[data-ready=true]');
      const expected = (value: string) => {
        const list = teachingSpecs(p, resolveSettings(p.Scene, { [setting]: value }));
        return list.map((s, i) => ({ step: s.step, label: `Step ${i + 1} of ${list.length}: ${s.title}`, title: s.title }));
      };
      const seen = async () => (await stepBarOf(page)).map(({ step, label, title }) => ({ step, label, title }));
      assert.deepEqual(await seen(), expected(from), `${name} ${setting}=${from}`);
      assert.equal(await page.locator('.step-bar').getAttribute('aria-label'), 'Step progress');
      await page.locator(`input[name="${setting}"][value="${to}"]`).locator('xpath=..').click();
      await page.waitForURL(new RegExp(`${setting}=${to}`));
      await page.waitForFunction((n) => document.querySelectorAll('.step-bar button').length === n, expected(to).length);
      assert.deepEqual(await seen(), expected(to), `${name} ${setting}=${to}`);
    } finally { await page.close(); }
  }
  // The attack adds a source step without inflating the teaching path. The
  // all-notes case separately proves that a changed bar inventory is rebuilt.
  const pkce = projects.get('oauth-pkce')!;
  assert.notEqual(stepsOf(pkce, resolveSettings(pkce.Scene, { attacker: 'no' })).length, stepsOf(pkce, resolveSettings(pkce.Scene, { attacker: 'yes' })).length);
  assert.equal(teachingSpecs(pkce, resolveSettings(pkce.Scene, { attacker: 'no' })).length, teachingSpecs(pkce, resolveSettings(pkce.Scene, { attacker: 'yes' })).length);
  const references = projects.get('references')!;
  assert.notEqual(teachingSpecs(references, {case: 'one'}).length, teachingSpecs(references, {case: 'all'}).length);
});

test('a segment jumps to its step', options, async () => {
  const p = projects.get('references')!,
    list = teachingSpecs(p, resolveSettings(p.Scene, {case: 'one'}));
  assert.equal(new Set(list.map((s) => s.caption)).size, list.length, 'the teaching steps have distinct captions');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/references.html?case=one`);
    await page.waitForSelector('[data-ready=true]');
    for (const i of [1, 0, 1]) {
      await page.locator('.step-bar button').nth(i).click();
      await page.waitForFunction((step) => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === step, list[i]!.step);
      assert.equal(await page.locator('.caption').innerText(), list[i]!.caption, `segment ${i + 1}`);
      assert.equal(await page.locator('.steps [aria-current=step]').getAttribute('data-step'), list[i]!.step, 'the rail agrees');
      assert.equal(new URL(page.url()).searchParams.get('step'), list[i]!.step);
    }
  } finally { await page.close(); }
});

test('segment states follow the selected step', options, async () => {
  const p = projects.get('references')!,
    list = teachingSpecs(p, resolveSettings(p.Scene, {case: 'one'}));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    const { page } = await counted(context, `${embed}/references.html?case=one`);
    for (const k of [0, 1, 0, 1]) {
      const n = await page.evaluate(() => (window as unknown as { __settles: number }).__settles);
      if (k !== 0 || n > 1) {
        await page.locator('.step-bar button').nth(k).click();
        await page.waitForFunction((n) => (window as unknown as { __settles: number }).__settles > n, n);
      }
      const bar = await stepBarOf(page);
      assert.deepEqual(
        bar.map(({ step, state, current, tab }) => ({ step, state, current, tab })),
        list.map((s, i) => ({ step: s.step, state: i < k ? 'done' : i === k ? 'current' : 'todo', current: i === k, tab: i === k ? 0 : -1 })),
        `at step ${k + 1}`,
      );
      assert.equal(bar[k]!.progress, '1', 'the current segment is full at rest');
    }
  } finally { await context.close(); }
});

test('the current segment fills while a step plays and is full when it rests', options, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  try {
    await context.addInitScript(() => {
      const w = window as unknown as { __fills: Array<string | 'settled'> };
      w.__fills = [];
      document.addEventListener('rayner:step', () => w.__fills.push('settled'));
      new MutationObserver((records) => {
        for (const r of records) {
          const b = r.target as HTMLElement;
          if (b.matches?.('.step-bar button[data-step="reader-outcome"]')) w.__fills.push(getComputedStyle(b).getPropertyValue('--progress').trim());
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    const { page, errors } = await counted(context, `${embed}/mr-cache.html?step=reader-request&request=hit`);
    await quiet(page);
    const fills = () => page.evaluate(() => (window as unknown as { __fills: Array<string | 'settled'> }).__fills);
    const before = (await fills()).length;
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { __last: { step: string } | null }).__last?.step === 'reader-outcome', undefined, { timeout: 30_000 });
    await quiet(page);
    const seen = (await fills()).slice(before),
      settled = seen.indexOf('settled');
    assert.ok(settled > 0, `the step settled after fills: ${JSON.stringify(seen)}`);
    const playing = seen.slice(0, settled).map(Number);
    assert.ok(playing.some((v) => v > 0 && v < 1), `a fill strictly between 0 and 1 before the step rested: ${JSON.stringify(seen)}`);
    assert.ok(playing.every((v, i) => i === 0 || v >= playing[i - 1]!), `the fill only grows while the step plays: ${JSON.stringify(playing)}`);
    assert.equal((await stepBarOf(page))[1]!.progress, '1', 'full once the step rests');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion fills the segment at once', options, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/mr-cache.html?step=reader-request&request=hit`);
    await page.waitForSelector('[data-ready=true]');
    // Read in the same task as the press: nothing has had a frame to animate.
    const now = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('button[aria-label="Next step"]')!.click();
      const current = document.querySelector<HTMLElement>('.step-bar [aria-current=step]')!;
      return { step: current.dataset.step, progress: getComputedStyle(current).getPropertyValue('--progress').trim(), transition: getComputedStyle(current.querySelector('.fill')!).transitionDuration };
    });
    assert.deepEqual(now, { step: 'reader-outcome', progress: '1', transition: '0s' });
  } finally { await page.close(); }
});

test('arrow keys inside the step bar move the step and the focus', options, async () => {
  const p = projects.get('references')!,
    list = teachingSpecs(p, resolveSettings(p.Scene, {case: 'one'}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/references.html?case=one`);
    await page.waitForSelector('[data-ready=true]');
    const focused = () =>
      page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return { step: a?.closest('.step-bar') ? a.dataset.step : null, current: document.querySelector('.step-bar [aria-current=step]') === a, url: new URL(location.href).searchParams.get('step') };
      });
    await page.locator('.step-bar [aria-current=step]').focus();
    for (const [key, i] of [['ArrowRight', 1], ['ArrowRight', 1], ['ArrowLeft', 0], ['End', 1], ['Home', 0], ['ArrowLeft', 0]] as const) {
      await page.keyboard.press(key);
      await page.waitForFunction((step) => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === step, list[i]!.step);
      assert.deepEqual(await focused(), { step: list[i]!.step, current: true, url: list[i]!.step }, `${key} → step ${i + 1}`);
    }
    // One Tab stop in the bar: the current segment.
    assert.equal(await page.locator('.step-bar button[tabindex="0"]').count(), 1);
  } finally { await page.close(); }
});

test('pressing the current segment while a step plays rests the picture', options, async () => {
  const p = projects.get('mr-cache')!,
    step = p.variants.find((v) => v.values.request === 'hit')!.trace.steps[1]!,
    motion = (step.hold ?? step.t1!) - step.t0;
  assert.equal(step.step, 'reader-outcome');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  try {
    const { page, errors } = await counted(context, `${embed}/mr-cache.html?step=reader-request&request=hit`);
    await quiet(page);
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    // Early in the step's motion, press its segment.
    const pressed = await page.evaluate(
      () =>
        new Promise<{ progress: number; settles: number; at: number }>((resolve, reject) => {
          const w = window as unknown as { __settles: number };
          const end = performance.now() + 10_000;
          const look = () => {
            const b = document.querySelector<HTMLButtonElement>('.step-bar [aria-current=step]')!,
              progress = Number(getComputedStyle(b).getPropertyValue('--progress'));
            if (b.dataset.step === 'reader-outcome' && progress > 0 && progress < 0.5) {
              const settles = w.__settles;
              b.click();
              resolve({ progress, settles, at: performance.now() });
            } else if (performance.now() > end) reject(new Error(`never saw the fill mid-step: ${progress}`));
            else requestAnimationFrame(look);
          };
          look();
        }),
    );
    const rested = await page.evaluate(
      ({ settles }) =>
        new Promise<number>((resolve) => {
          const w = window as unknown as { __settles: number };
          const look = () => (w.__settles > settles ? resolve(performance.now()) : requestAnimationFrame(look));
          look();
        }),
      pressed,
    );
    const remaining = (1 - pressed.progress) * motion * 1000;
    assert.ok(rested - pressed.at < remaining, `rested ${Math.round(rested - pressed.at)} ms after the press, before the ${Math.round(remaining)} ms of motion left`);
    assert.equal(await page.evaluate(() => (window as unknown as { __last: { step: string } }).__last.step), 'reader-outcome');
    assert.equal((await stepBarOf(page))[1]!.progress, '1', 'full once rested');
    await quiet(page);
    // Pressing the current segment at rest does nothing.
    const settles = await page.evaluate(() => (window as unknown as { __settles: number }).__settles);
    await page.locator('.step-bar [aria-current=step]').click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => (window as unknown as { __settles: number }).__settles), settles, 'a press at rest changes nothing');
    const link = await counted(context, `${embed}/mr-cache.html?step=reader-outcome&request=hit`);
    assert.equal(await stagePicture(page), await stagePicture(link.page), 'the rested picture is the link\'s picture');
    assert.deepEqual([...errors, ...link.errors], []);
  } finally { await context.close(); }
});

test('no horizontal overflow', options, async () => {
  for (const width of [320, 390, 768, 1280])
    for (const name of ['mr-cache', 'quotient-familial']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      try {
        await page.goto(`${embed}/${name}.html`);
        await page.waitForSelector('[data-ready=true]');
        const seen = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, segments: document.querySelectorAll('.step-bar button').length }));
        assert.ok(seen.scroll <= seen.width, `${name} at ${width}: ${JSON.stringify(seen)}`);
        if (name === 'quotient-familial') assert.equal(seen.segments, 2, 'the two teaching steps exclude the technical notes');
      } finally { await page.close(); }
    }
});
// specs/player-redesign.md R5, R6, R10: the rail beside the card, the tools beside Next, both following the page's direction.
test('the rail is a pane beside the card when wide and a closed details row inside the card, under the words, when narrow', options, async () => {
  const p = projects.get('mr-cache')!,
    list = teachingSpecs(p, resolveSettings(p.Scene, { request: 'hit' }));
  assert.ok(list.every((s) => s.line), "mr-cache's teaching steps each have a line");
  const rail = (page: Page) =>
    page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>('.rail')!,
        r = rail.getBoundingClientRect(),
        c = document.querySelector('.player')!.getBoundingClientRect();
      return {
        tag: rail.tagName,
        rails: document.querySelectorAll('.rail').length,
        heading: rail.querySelector('h2')?.textContent ?? null,
        summary: rail.querySelector('summary')?.textContent ?? null,
        open: (rail as HTMLDetailsElement).open ?? null,
        holdsList: !!rail.querySelector(':scope > ol.steps, :scope > .rail-body > ol.steps'),
        afterWords: rail.parentElement === document.querySelector('.player') && rail.previousElementSibling?.matches('.words, .notice') === true,
        box: { left: r.left, right: r.right, top: r.top },
        card: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
      };
    });
  for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/mr-cache.html?request=hit`);
      await page.waitForSelector('[data-ready=true]');
      const seen = await rail(page);
      const where = `at ${width}×${height}`;
      assert.deepEqual([seen.tag, seen.rails, seen.heading, seen.holdsList], ['ASIDE', 1, 'Steps', true], where);
      assert.equal(await page.locator('.steps button').count(), stepsOf(p, {request: 'hit'}).length, `${where}: every source step remains available`);
      assert.equal(await page.locator('details.supporting').evaluate((d) => (d as HTMLDetailsElement).open), false, `${where}: source details start closed`);
      assert.ok(seen.box.left >= seen.card.right, `${where}: the rail is beside the card ${JSON.stringify(seen)}`);
      assert.ok(Math.abs(seen.box.top - seen.card.top) <= 2, `${where}: the rail's top is the card's ${JSON.stringify(seen)}`);
      // Every item shows its title and its line; none is bold, current or not.
      const items = await page.locator('.steps:not(.supporting-steps) button').evaluateAll((bs) =>
        bs.map((b) => ({
          title: b.querySelector('.title')?.textContent,
          line: b.querySelector('.line')?.textContent,
          shown: (b.querySelector('.line') as HTMLElement | null)?.offsetParent != null,
          weight: getComputedStyle(b.querySelector('.title')!).fontWeight,
        })),
      );
      assert.deepEqual(items, list.map((s) => ({ title: s.title, line: s.line, shown: true, weight: '400' })), where);
      // Changing step moves neither the page nor the card.
      const place = () => page.evaluate(() => [scrollY, document.querySelector('.player')!.getBoundingClientRect().top, document.querySelector('.rail')!.getBoundingClientRect().top]);
      const before = await place();
      for (const i of [1, 0]) {
        await page.locator('.steps:not(.supporting-steps) button').nth(i).click();
        await page.waitForFunction((step) => document.querySelector('.steps [aria-current=step]')?.getAttribute('data-step') === step, list[i]!.step);
        assert.deepEqual(await place(), before, `${where}: step ${i + 1} kept the page and the card in place`);
        assert.equal(await page.locator('.steps [aria-current=step]').getAttribute('data-state'), 'current');
      }
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
      await page.waitForFunction((step) => document.querySelector('.steps [aria-current=step]')?.getAttribute('data-step') === step, list[1]!.step);
      assert.deepEqual(await place(), before, `${where}: Next kept the page and the card in place`);
    } finally { await page.close(); }
  }
  for (const [width, height] of [[390, 844], [768, 1024]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/mr-cache.html?request=hit`);
      await page.waitForSelector('[data-ready=true]');
      const seen = await rail(page);
      const where = `at ${width}×${height}`;
      assert.deepEqual([seen.tag, seen.rails, seen.summary, seen.open, seen.holdsList], ['DETAILS', 1, 'All 2 steps', false, true], where);
      // specs/player-tile.md T2: a row of the card, under the words.
      assert.ok(seen.afterWords && seen.box.top < seen.card.bottom, `${where}: the rail is a row in the card, under the words ${JSON.stringify(seen)}`);
      assert.equal(await page.locator('.steps:not(.supporting-steps) button').count(), list.length, `${where}: the list is in the page`);
      await page.locator('details.rail > summary').click();
      await page.locator('.steps:not(.supporting-steps) button').nth(1).click();
      await page.waitForFunction((step) => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === step, list[1]!.step);
      assert.equal(await page.locator('.caption').innerText(), list[1]!.caption, where);
      // The nested source disclosure is a real reader path on phones too.
      await page.locator('details.supporting > summary').click();
      await page.locator('.supporting-steps button[data-step=before]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'before');
      assert.equal(await page.locator('.step-bar').isVisible(), false, `${where}: source details do not impersonate the main path`);
      assert.equal(await page.locator('.supporting-steps [aria-current=step]').getAttribute('data-step'), 'before');
      const touring = await page.locator('.view-controls').evaluate((v) => !(v as HTMLElement).hidden && (v as HTMLElement).style.visibility !== 'hidden');
      assert.equal(await page.locator('.foot .hint').textContent(), touring ? chromeFor('en').viewHelp : chromeFor('en').backToStory, `${where}: guidance names an available control`);
    } finally { await page.close(); }
  }
  // Across the width the rail moves between the two, keeping the one list.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/mr-cache.html?request=hit&step=${list[1]!.step}`);
    await page.waitForSelector('[data-ready=true]');
    const list0 = await page.locator('.steps:not(.supporting-steps)').elementHandle();
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForFunction(() => document.querySelector('.rail')?.tagName === 'DETAILS');
    assert.equal(await page.evaluate((ol) => ol!.isConnected && ol!.parentElement!.tagName, list0), 'DETAILS');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => document.querySelector('.rail')?.tagName === 'ASIDE');
    assert.equal(await page.locator('.steps [aria-current=step]').getAttribute('data-step'), list[1]!.step);
  } finally { await page.close(); }
});

// specs/player-tile.md T2: one tile holds everything the page shows.
test('one tile: the border is on .layout.tile alone, the rail pane runs its height, and the steps and transcript rows are in the card', options, async () => {
  for (const [width, height] of [[1280, 800], [1440, 900], [390, 844], [768, 1024]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/mr-cache.html?request=hit`);
      await page.waitForSelector('[data-ready=true]');
      const seen = await page.evaluate(() => {
        const tile = document.querySelector<HTMLElement>('.layout')!,
          player = document.querySelector<HTMLElement>('.player')!,
          rail = document.querySelector<HTMLElement>('aside.rail'),
          shadowed = [...document.querySelectorAll<HTMLElement>('#content *')].filter((e) => getComputedStyle(e).boxShadow !== 'none' && !e.closest('.segments, .stage, .overview, .button'));
        return {
          tileClass: tile.className,
          tileShadow: getComputedStyle(tile).boxShadow !== 'none',
          tileRadius: getComputedStyle(tile).borderTopLeftRadius,
          playerShadow: getComputedStyle(player).boxShadow,
          shadowed: shadowed.map((e) => e.className),
          outside: [...document.getElementById('content')!.children].map((e) => e.className),
          tileHeight: tile.getBoundingClientRect().height,
          railHeight: rail?.getBoundingClientRect().height ?? null,
          railRule: rail ? getComputedStyle(rail).borderInlineStartWidth : null,
          rows: [...player.children].filter((e) => e.matches('.words, details.rail, details.transcript')).map((e) => e.className),
        };
      });
      const where = `at ${width}×${height}`;
      assert.deepEqual([seen.tileClass, seen.tileShadow, seen.tileRadius, seen.playerShadow], ['layout tile', true, '12px', 'none'], where);
      assert.deepEqual(seen.shadowed, ['layout tile'], `${where}: one element carries the tile's edge`);
      assert.deepEqual(seen.outside, ['layout tile'], `${where}: #content holds the tile and nothing else`);
      if (width >= 1100) {
        assert.equal(seen.railHeight, seen.tileHeight, `${where}: the rail's rule runs the tile's height`);
        assert.equal(seen.railRule, '1px', where);
        assert.deepEqual(seen.rows, ['words', 'transcript'], where);
      } else {
        assert.equal(seen.railHeight, null, where);
        assert.deepEqual(seen.rows, ['words', 'rail', 'transcript'], `${where}: the steps row, then the transcript row, under the words`);
      }
    } finally { await page.close(); }
  }
});

test('view tools share Next\'s row when wide and wrap below it when narrow', options, async () => {
  for (const [width, height] of [[1280, 800], [390, 844]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/mr-cache.html?step=after&request=hit`);
      await page.waitForSelector('[data-ready=true]');
      const v = await boxesOf(page, { next: 'button[aria-label="Next step"]', tools: '.stepper .tools' });
      const { next, tools } = v.boxes, where = `at ${width}×${height}`;
      assert.equal(await page.locator('.stepper .tools').getAttribute('role'), 'group');
      assert.equal(await page.locator('.stepper .tools').getAttribute('aria-label'), 'View tools');
      if (width >= 1280) {
        assert.ok(tools.top < next.bottom && tools.bottom > next.top, `${where}: the tools share Next's row ${JSON.stringify(v.boxes)}`);
        assert.ok(tools.left >= next.right, `${where}: the tools follow Next ${JSON.stringify(v.boxes)}`);
      } else {
        assert.ok(tools.top >= next.bottom, `${where}: the tools wrap below Next ${JSON.stringify(v.boxes)}`);
        // Every control in the row, except the step bar's thin segments, is at least 44 px each way.
        const small = await page.locator('.stepper > button:not([hidden]), .stepper .tools > button:not([hidden])').evaluateAll((bs) =>
          bs.map((b) => [b.getAttribute('aria-label'), b.getBoundingClientRect().width, b.getBoundingClientRect().height] as const).filter(([, w, h]) => w < 44 || h < 44),
        );
        assert.deepEqual(small, [], where);
      }
    } finally { await page.close(); }
  }
});

test('right to left: the step bar fills from the right, the rail sits on the left, and the footer\'s mark is on the right with the way out on the left', options, async () => {
  // No catalog page sets dir="rtl" (a right-to-left lettered page keeps its controls as they are),
  // so this sets it on mr-cache to check the logical properties the stepper row and rail use.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/mr-cache.html?request=hit&step=reader-request`);
    await page.waitForSelector('[data-ready=true]');
    const seen = await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      const b = document.querySelector<HTMLElement>('.step-bar [aria-current=step]')!;
      b.style.setProperty('--progress', '0.5');
      const box = b.getBoundingClientRect(),
        fill = b.querySelector('.fill')!.getBoundingClientRect(),
        rail = document.querySelector('.rail')!.getBoundingClientRect(),
        card = document.querySelector('.player')!.getBoundingClientRect(),
        prev = document.querySelector('button[aria-label="Previous step"]')!.getBoundingClientRect(),
        next = document.querySelector('button[aria-label="Next step"]')!.getBoundingClientRect();
      return { box: [box.left, box.right], fill: [fill.left, fill.right], rail: rail.right, card: card.left, prev: prev.left, next: next.right };
    });
    assert.ok(Math.abs(seen.fill[1]! - seen.box[1]!) <= 1 && seen.fill[0]! > seen.box[0]! + 1, `the fill grows from the right: ${JSON.stringify(seen)}`);
    assert.ok(seen.rail <= seen.card, `the rail is on the card's left: ${JSON.stringify(seen)}`);
    assert.ok(seen.prev > seen.next, `Previous is right of Next: ${JSON.stringify(seen)}`);
  } finally { await page.close(); }
  // specs/player-tile.md T9: in a frame, the footer's mark is at the inline start (the right) and the way out at the end (the left).
  hostBody = `<!doctype html><style>body{margin:0}</style><iframe title="t" src="${embed}/mr-cache.html?request=hit" style="width:1280px;height:800px;border:0"></iframe>`;
  const host2 = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await host2.goto(host);
    const frame = await readyFrame(host2, 'mr-cache');
    const seen = await frame.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { foot: [box('.foot').left, box('.foot').right], mark: [box('.foot .mark').left, box('.foot .mark').right], open: [box('.foot .open').left, box('.foot .open').right], rail: box('.rail').right, card: box('.player').left };
    });
    assert.ok(seen.mark[1]! > seen.open[1]! && seen.foot[1]! - seen.mark[1]! < 24 && seen.open[0]! - seen.foot[0]! < 24, `the mark at the right, the way out at the left: ${JSON.stringify(seen)}`);
    assert.ok(seen.rail <= seen.card, `the rail on the left: ${JSON.stringify(seen)}`);
  } finally { await host2.close(); }
});
async function readyFrame(page: Page, scene: string): Promise<Frame> {
  await page.waitForFunction(() => document.querySelectorAll('iframe').length > 0);
  const matches = (f: Frame) => f.url().startsWith(embed + '/' + scene);
  const frame =
    page.frames().find(matches) ?? (await page.waitForEvent('framenavigated', { predicate: matches }));
  assert.ok(frame);
  await frame.waitForSelector('[data-ready=true]');
  return frame;
}
async function assertHeight(page: Page, id: string, frame: Frame) {
  const expected = await frame
    .locator('#content')
    .evaluate((r) => Math.ceil(r.getBoundingClientRect().height));
  await page.waitForFunction(
    ({ id, expected }) =>
      (document.querySelector(`#${id} iframe`) as HTMLIFrameElement)?.style.height === expected + 'px',
    { id, expected },
  );
  return expected;
}
async function deliver(page: Page, frame: Frame, height: number) {
  await page.evaluate((height) => {
    (window as unknown as { received: boolean }).received = false;
    window.addEventListener('message', function seen(event) {
      if (event.data?.height === height) {
        (window as unknown as { received: boolean }).received = true;
        window.removeEventListener('message', seen);
      }
    });
  }, height);
  await frame.evaluate(
    (height) => parent.postMessage({ type: 'rayner:resize', version: 1, height }, '*'),
    height,
  );
  await page.waitForFunction(() => (window as unknown as { received: boolean }).received);
}

test(
  'two real cross-origin embeds resize independently, grow, shrink and reject wrong-window messages',
  options,
  async () => {
    hostBody = `<!doctype html><style>body{margin:0;max-width:700px}</style>${loader('a', 'mr-cache')}${loader('b', 'oauth-pkce')}`;
    const page = await browser.newPage();
    try {
      await page.goto(host);
      const a = await readyFrame(page, 'mr-cache'),
        b = await readyFrame(page, 'oauth-pkce');
      const ah = await assertHeight(page, 'a', a),
        bh = await assertHeight(page, 'b', b);
      // specs/player-tile.md T3: the loader adds the iframe and nothing else; the way out is the page's footer.
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#a > *, #b > *')].map((e) => e.tagName)), ['IFRAME', 'IFRAME']);
      assert.equal(await page.locator('a').count(), 0, 'no link outside the frames');
      await a.locator('.transcript > summary').click();
      const grown = await assertHeight(page, 'a', a);
      assert.ok(grown > ah);
      await assertHeight(page, 'b', b);
      await a.locator('.transcript > summary').click();
      assert.equal(await assertHeight(page, 'a', a), ah);
      // Same origin, wrong window: a's valid message must never resize b.
      await deliver(page, a, 7777);
      assert.equal(
        await page.locator('#b iframe').evaluate((el) => (el as HTMLIFrameElement).style.height),
        bh + 'px',
      );
      // Restore a through a genuine content change.
      await a.locator('.transcript > summary').click();
      await assertHeight(page, 'a', a);
      // Correct WindowProxy after navigation, wrong origin: origin check remains necessary.
      await page.route('http://localhost:43219/**', (r) =>
        r.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Other origin</p>' }),
      );
      await b.goto('http://localhost:43219/forger');
      await deliver(page, b, 8888);
      assert.equal(
        await page.locator('#b iframe').evaluate((el) => (el as HTMLIFrameElement).style.height),
        bh + 'px',
      );
    } finally {
      await page.close();
    }
  },
);
// specs/player-tile.md T3: the loader mounts an iframe and nothing else, and dispose() takes it away with its listener.
test('the loader appends only the iframe, and dispose() removes the iframe and its message listener', options, async () => {
  hostBody = `<!doctype html><div id="t"></div><script src="${embed}/loader.js"></script>`;
  const page = await browser.newPage();
  try {
    await page.goto(host);
    await page.evaluate(() => {
      const w = window as unknown as { __listeners: number };
      w.__listeners = 0;
      const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
      window.addEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, unknown?]) => { if (type === 'message') w.__listeners++; return add(type, ...(rest as [EventListenerOrEventListenerObject])); }) as typeof window.addEventListener;
      window.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, unknown?]) => { if (type === 'message') w.__listeners--; return remove(type, ...(rest as [EventListenerOrEventListenerObject])); }) as typeof window.removeEventListener;
    });
    await page.evaluate((src) => {
      const w = window as unknown as { __dispose: () => void; RaynerEmbed: { mountExplainer: (t: HTMLElement, s: string, o: object) => () => void } };
      w.__dispose = w.RaynerEmbed.mountExplainer(document.getElementById('t')!, src, { title: 'Cache' });
    }, `${embed}/mr-cache.html`);
    await readyFrame(page, 'mr-cache');
    assert.deepEqual(await page.evaluate(() => ({ children: [...document.getElementById('t')!.children].map((e) => e.tagName), links: document.querySelectorAll('a').length, listeners: (window as unknown as { __listeners: number }).__listeners })), { children: ['IFRAME'], links: 0, listeners: 1 });
    await page.evaluate(() => (window as unknown as { __dispose: () => void }).__dispose());
    assert.deepEqual(await page.evaluate(() => ({ children: document.getElementById('t')!.childNodes.length, links: document.querySelectorAll('a, iframe').length, listeners: (window as unknown as { __listeners: number }).__listeners })), { children: 0, links: 0, listeners: 0 });
    // specs/player-guidance.md G4: goTo after dispose does nothing, and does not throw.
    assert.equal(await page.evaluate(() => (window as unknown as { __dispose: { goTo(step?: string): unknown } }).__dispose.goTo('request')), undefined);
  } finally { await page.close(); }
});
// specs/player-guidance.md G4: the host page hears each settled step and can drive the player.
type Heard = { step: string; index: number; total: number; settings: Record<string, string> };
const heard = (page: Page) => page.evaluate(() => (window as unknown as { heard: { a: Heard[]; b: Heard[]; onStep: Heard[] } }).heard);
const stepOfFrame = (frame: Frame) => frame.evaluate(() => Object.fromEntries(new URL(location.href).searchParams));
test('two embeds: goTo on A moves only A, replacing its history entry; A\'s rayner:step reaches the host once per settled step with its index and total; B is unaffected', options, async () => {
  hostBody = `<!doctype html><style>body{margin:0;max-width:700px}</style><div id="a"></div><div id="b"></div><button id="go">Show a miss</button>
<script src="${embed}/loader.js"></script><script>
window.heard = { a: [], b: [], onStep: [] };
const a = RaynerEmbed.mountExplainer(document.getElementById('a'), ${JSON.stringify(embed + '/mr-cache.html')}, { title: 'A', onStep: (d) => heard.onStep.push(d) });
const b = RaynerEmbed.mountExplainer(document.getElementById('b'), ${JSON.stringify(embed + '/exgit.html')}, { title: 'B' });
// The event bubbles from each iframe.
document.getElementById('a').addEventListener('rayner:step', (e) => heard.a.push(e.detail));
document.getElementById('b').addEventListener('rayner:step', (e) => heard.b.push(e.detail));
document.getElementById('go').onclick = () => a.goTo('request', { request: 'miss' });
</script><iframe id="sibling" srcdoc="<p>A sibling at the host's origin</p>"></iframe>`;
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.goto(host);
    const a = await readyFrame(page, 'mr-cache'),
      b = await readyFrame(page, 'exgit');
    await page.waitForFunction(() => { const h = (window as unknown as { heard: { a: unknown[]; b: unknown[] } }).heard; return h.a.length >= 1 && h.b.length >= 1; });
    const exgit = stepsOf(projects.get('exgit')!, resolveSettings(projects.get('exgit')!.Scene));
    const cache = stepsOf(projects.get('mr-cache')!, {request: 'hit'});
    const first = await heard(page);
    assert.deepEqual(first.a, [{ step: 'reader-request', index: 0, total: cache.length, settings: { request: 'hit' } }]);
    assert.deepEqual(first.onStep, first.a, 'onStep hears what the event carries');
    assert.deepEqual(first.b, [{ step: exgit[0]!.step, index: 0, total: exgit.length, settings: { change: 'add' } }]);
    const before = await a.evaluate(() => history.length),
      bWas = await stepOfFrame(b);
    await page.locator('#go').click();
    await page.waitForFunction(() => (window as unknown as { heard: { a: unknown[] } }).heard.a.length >= 2);
    await a.waitForSelector('[data-ready=true]');
    await page.waitForTimeout(500);
    const after = await heard(page);
    assert.deepEqual(after.a, [...first.a, { step: 'request', index: cache.findIndex(s => s.step === 'request'), total: cache.length, settings: { request: 'miss' } }], 'once per settled step; indices address the complete raw trace');
    assert.deepEqual(after.onStep, after.a);
    assert.deepEqual(after.b, first.b, 'B heard nothing more');
    const moved = await stepOfFrame(a);
    assert.deepEqual([moved.step, moved.request], ['request', 'miss']);
    assert.equal(await a.locator('input[name=request]:checked').getAttribute('value'), 'miss');
    assert.equal(await a.evaluate(() => history.length), before, 'host-driven navigation replaces the history entry');
    assert.deepEqual(await stepOfFrame(b), bWas, 'B did not move');
    // From a window that is not the parent, at the parent's own origin: nothing.
    const sibling = page.frames().find((f) => f.url() === 'about:srcdoc')!;
    await sibling.evaluate(() => parent.document.querySelector<HTMLIFrameElement>('#a iframe')!.contentWindow!.postMessage({ type: 'rayner:goto', version: 1, step: 'before' }, '*'));
    await page.waitForTimeout(500);
    assert.equal((await stepOfFrame(a)).step, 'request', 'a sibling window cannot drive the player');
    assert.equal((await heard(page)).a.length, 2);
  } finally {
    await page.close();
  }
});
test('a rayner:goto from another origin does nothing; a raw iframe without parentOrigin neither posts nor accepts messages', options, async () => {
  const goto = { type: 'rayner:goto', version: 1, step: 'request', settings: { request: 'miss' } };
  // The frame is told its parent is at `host`; the page that frames it is at another origin.
  const elsewhere = host.replace('127.0.0.1', 'localhost');
  hostBody = `<!doctype html><script>window.posts = []; addEventListener('message', (e) => posts.push(e.data));</script><iframe title="t" src="${embed}/mr-cache.html?parentOrigin=${encodeURIComponent(host)}" style="width:700px;height:900px;border:0"></iframe>`;
  for (const [origin, moves] of [[elsewhere, false], [host, true]] as const) {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    try {
      await page.goto(origin);
      const frame = await readyFrame(page, 'mr-cache');
      await page.evaluate(({ goto, embed }) => frames[0]!.postMessage(goto, embed), { goto, embed });
      if (moves) await frame.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'request');
      else await page.waitForTimeout(600);
      assert.equal((await stepOfFrame(frame)).step, moves ? 'request' : 'reader-request', `the parent at ${origin}`);
      // The page posts its steps only to the parentOrigin it was given.
      const steps = (await page.evaluate(() => (window as unknown as { posts: { type?: string }[] }).posts)).filter((m) => m?.type === 'rayner:step');
      assert.equal(steps.length, moves ? 2 : 0, `step reports heard at ${origin}`);
    } finally {
      await page.close();
    }
  }
  // A raw iframe, no parentOrigin: no message out on load or on Next, none taken in.
  hostBody = `<!doctype html><script>window.posts = []; addEventListener('message', (e) => posts.push(e.data));</script><iframe title="t" src="${embed}/mr-cache.html" style="width:700px;height:900px;border:0"></iframe>`;
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.goto(host);
    const frame = await readyFrame(page, 'mr-cache');
    await frame.locator('.stepper .primary').click();
    await frame.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'reader-outcome');
    await page.evaluate(({ goto, embed }) => frames[0]!.postMessage(goto, embed), { goto, embed });
    await page.waitForTimeout(600);
    assert.equal((await stepOfFrame(frame)).step, 'reader-outcome', 'a raw iframe takes no goto');
    assert.deepEqual(await page.evaluate(() => (window as unknown as { posts: unknown[] }).posts), [], 'a raw iframe posts nothing');
  } finally {
    await page.close();
  }
});
test('the script-tag loader dispatches rayner:step on its iframe, and the event bubbles to the host document', options, async () => {
  hostBody = `<!doctype html><script>window.tagSteps = []; document.addEventListener('rayner:step', (e) => tagSteps.push([e.target.tagName, e.target.parentElement.id, e.detail.step, e.detail.index, e.detail.total]));</script>${loader('a', 'mr-cache')}`;
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.goto(host);
    const frame = await readyFrame(page, 'mr-cache');
    await page.waitForFunction(() => (window as unknown as { tagSteps: unknown[] }).tagSteps.length >= 1);
    await frame.locator('.stepper .primary').click();
    await page.waitForFunction(() => (window as unknown as { tagSteps: unknown[] }).tagSteps.length >= 2);
    const total = stepsOf(projects.get('mr-cache')!, {request: 'hit'}).length;
    assert.deepEqual(await page.evaluate(() => (window as unknown as { tagSteps: unknown[] }).tagSteps), [['IFRAME', 'a', 'reader-request', 0, total], ['IFRAME', 'a', 'reader-outcome', 1, total]]);
  } finally {
    await page.close();
  }
});
/** The colour of one screen pixel of `page`, read back from a screenshot (the host cannot read a cross-origin frame's pixels). */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const reader = await browser.newPage();
  try {
    return await reader.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }, png.toString('base64'));
  } finally { await reader.close(); }
}
// specs/player-tile.md T4: in a frame the page is the tile alone, on the host's background.
test('framed, the page draws only the tile: a transparent body, no padding, and the host\'s background at the tile\'s corner in light and dark device schemes', options, async () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    hostBody = `<!doctype html><style>body{margin:0;padding:20px;background:rgb(251,248,243)}</style>${loader('a', 'mr-cache')}`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(host);
      const frame = await readyFrame(page, 'mr-cache');
      await assertHeight(page, 'a', frame);
      const inside = await frame.evaluate(() => ({
        framed: document.documentElement.hasAttribute('data-framed'),
        theme: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
        padding: getComputedStyle(document.getElementById('content')!).padding,
        tile: (() => { const r = document.querySelector('.tile')!.getBoundingClientRect(); return [r.left, r.top, innerWidth - r.right]; })(),
      }));
      assert.deepEqual(inside, { framed: true, theme: 'light', body: 'rgba(0, 0, 0, 0)', padding: '0px', tile: [1, 1, 1] }, colorScheme);
      const box = (await page.locator('#a iframe').boundingBox())!;
      assert.deepEqual(await pixelAt(page, box.x + 2, box.y + 2), [251, 248, 243], `${colorScheme} device: the host's background at the tile's corner`);
      // And inside the corner's curve, the tile's own surface.
      assert.notDeepEqual(await pixelAt(page, box.x + 16, box.y + 16), [251, 248, 243], colorScheme);
    } finally { await context.close(); }
  }
  // Standalone, as before: the page's background and padding.
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/mr-cache.html`);
    await page.waitForSelector('[data-ready=true]');
    assert.deepEqual(await page.evaluate(() => ({
      framed: document.documentElement.hasAttribute('data-framed'),
      body: getComputedStyle(document.body).backgroundColor,
      padding: getComputedStyle(document.getElementById('content')!).padding,
    })), { framed: false, body: 'rgb(247, 247, 247)', padding: '24px 16px 48px' });
  } finally { await page.close(); }
});
test('the loader passes theme=light or theme=dark from the host page\'s computed colour scheme when the theme is auto, and the given theme otherwise', options, async () => {
  const cases = [
    { scheme: 'light', host: '', theme: '', want: 'light' },
    { scheme: 'dark', host: '', theme: '', want: 'light' },
    { scheme: 'dark', host: 'light dark', theme: '', want: 'dark' },
    { scheme: 'light', host: 'light dark', theme: '', want: 'light' },
    { scheme: 'light', host: 'dark', theme: '', want: 'dark' },
    { scheme: 'dark', host: 'light', theme: 'auto', want: 'light' },
    { scheme: 'light', host: '', theme: 'dark', want: 'dark' },
    { scheme: 'dark', host: 'dark', theme: 'light', want: 'light' },
  ] as const;
  for (const c of cases) {
    hostBody = `<!doctype html>${c.host ? `<style>:root{color-scheme:${c.host}}</style>` : ''}<div id="a"></div><script src="${embed}/loader.js" data-src="${embed}/mr-cache.html" data-target="a" data-title="t"${c.theme ? ` data-theme="${c.theme}"` : ''}></script>`;
    const context = await browser.newContext({ colorScheme: c.scheme });
    try {
      const page = await context.newPage();
      await page.goto(host);
      const src = new URL(await page.locator('#a iframe').getAttribute('src') ?? '');
      assert.equal(src.searchParams.get('theme'), c.want, JSON.stringify(c));
    } finally { await context.close(); }
  }
});
// specs/player-tile.md T5: no catalog explainer changes style between cases, so this scene does.
const TWO_PAPERS = `import{Scene,Text}from'rayner';import{stage,settingsOf}from'rayner/explain';
export default class TwoPapers extends Scene{static meta={id:'two-papers',title:'Two papers'};
static settings=[{id:'look',label:'Look',default:'cream',options:[{value:'cream',label:'Cream'},{value:'night',label:'Night'}]}];
async construct(){const s=stage(this,{style:settingsOf(this).look==='night'?'nord':'hand-drawn'});
await this.step('one',{caption:'A label.'});await s.enter(new Text('paper',{fontSize:0.4}),{describe:'paper'});
await this.step('two',{caption:'Another.'});await s.enter(new Text('again',{fontSize:0.4}).moveTo([0,-1]),{describe:'again'});}}`;
test('the neutral tile stays independent of the case palette, including before its script runs', options, async () => {
  const dir = join(folder, 'two-papers');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'scene.ts'), TWO_PAPERS);
  await buildExplainer(await collectProject(dir, { write: false }), join(folder, 'two-papers.html'));
  const paper = (page: Page) => page.evaluate(() => ({
    player: getComputedStyle(document.querySelector('.player')!).getPropertyValue('--paper').trim(),
    tile: getComputedStyle(document.querySelector('.tile')!).backgroundColor,
  }));
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.goto(`${embed}/two-papers.html`);
    await page.waitForSelector('[data-ready=true]');
    const first = await paper(page);
    assert.equal(first.player, '');
    assert.ok(['rgb(255, 255, 255)', 'color(srgb 1 1 1)'].includes(first.tile), first.tile);
    await page.locator('.case input[value=night]').check();
    await page.waitForFunction(() => !document.querySelector('#content.loading'));
    await page.waitForTimeout(300); // observe the settled chrome, beyond its background transition
    const second = await paper(page);
    assert.deepEqual(second, first, 'the neutral tile does not follow the paper');
    // A catalog page, too: mr-cache draws on hand-drawn's paper.
    await page.goto(`${embed}/mr-cache.html`);
    await page.waitForSelector('[data-ready=true]');
    assert.deepEqual(await paper(page), first);
  } finally { await page.close(); }
  // Without the script, the shell also uses neutral chrome.
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const shell = await context.newPage();
    for (const [id, want] of [['two-papers', ''], ['exgit', '']] as const) {
      await shell.goto(`${embed}/${id}.html`);
      assert.equal((await paper(shell)).player, want, id);
    }
  } finally { await context.close(); }
});
// specs/player-tile.md T6: the published height at 640 px is the height the loader gives the frame there.
test('known heights: mr-cache measures three heights above the floor, and the loader at 640 px settles the frame at heights["640"] within 2 px', options, async () => {
  const { measureEmbed, embedSizeProblems } = await import('../tools/lib/explain-embed-size.ts');
  const size = await measureEmbed(browser, embed, 'mr-cache.html');
  assert.deepEqual(embedSizeProblems(size), [], JSON.stringify(size));
  assert.ok(size.heights['390'] > size.heights['640'], `a phone's page is taller: ${JSON.stringify(size)}`);
  // A different host on another origin, as a reader's would be.
  hostBody = `<!doctype html><style>body{margin:0}</style>${loader('a', 'mr-cache')}<p>After the embed.</p>`;
  const page = await browser.newPage({ viewport: { width: 640, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.goto(host);
    const frame = await readyFrame(page, 'mr-cache');
    const settled = await assertHeight(page, 'a', frame);
    assert.ok(Math.abs(settled - size.heights['640']) <= 2, `settled at ${settled}, published ${size.heights['640']}`);
  } finally { await page.close(); }
});
// The rest of URL cases, step fallback, history, copy link and reduced motion is the player
// model's (below), including the fixed fallback scenario.
test('?theme=dark, light and auto (following the reader\'s colour scheme) set the page colours', options, async () => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  try {
    const background = async (theme: string) => {
      await page.goto(`${embed}/oauth-pkce.html?theme=${theme}`);
      await page.waitForSelector('[data-ready=true]');
      return {
        theme: await page.locator('html').getAttribute('data-theme'),
        background: await page.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor),
      };
    };
    assert.deepEqual(await background('dark'), { theme: 'dark', background: 'rgb(20, 20, 20)' });
    assert.deepEqual(await background('light'), { theme: 'light', background: 'rgb(247, 247, 247)' });
    assert.deepEqual(await background('auto'), { theme: 'auto', background: 'rgb(20, 20, 20)' });
  } finally {
    await context.close();
  }
});
// site:export --origin gives each step of the default case a share page, <path>/<id>/<step>, and
// marks the player; Copy link then gives that page, whose link preview is the step. Any other case,
// a step whose name is not path-safe, or a page published without share pages copies ?step=.
test('Copy link gives the step\'s share page when site:export published one, else the player URL', options, async () => {
  const site = join(folder, 'site');
  await mkdir(site, { recursive: true });
  // As site:export --origin publishes a page: publishedPage, from the steps demos:build lists.
  const publish = async (id: string, from: string, steps: string[]) => {
    const manifest = { id, title: id, lang: 'en', cover: steps[0]!, steps: steps.map((step) => ({ step, title: step, caption: '', picture: '' })) };
    await writeFile(join(site, id + '.html'), publishedPage(await readFile(from + '.html', 'utf8'), manifest, 'https://example.org', '/projects/rayner'));
    await copyFile(from + '.html.headers.json', join(site, id + '.html.headers.json'));
  };
  await publish('mr-cache', join(folder, 'mr-cache'), ['before', 'diff', 'after', 'request']);
  // A scene whose second step has a name no share page can have.
  const odd = join(folder, 'odd-steps');
  await mkdir(odd, { recursive: true });
  await writeFile(
    join(odd, 'scene.ts'),
    `import{Scene,Text,FadeIn}from'rayner';export default class Odd extends Scene{static meta={title:'Odd steps'};async construct(){` +
      `await this.step('one',{title:'One',caption:'A word.'});await this.play(new FadeIn(new Text('one')));` +
      `await this.step('two words',{title:'Two',caption:'Two words.'});await this.play(new FadeIn(new Text('two').moveTo([0,-2])));}}`,
  );
  await buildExplainer(await collectProject(odd, { write: false }), join(folder, 'odd-steps.html'));
  await publish('odd-steps', join(folder, 'odd-steps'), ['one']);
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
  const page = await context.newPage();
  const copied = async () => {
    await page.evaluate(() => {
      document.querySelector('.notice')!.textContent = '';
      return navigator.clipboard.writeText('');
    });
    await page.locator('button[aria-label="Copy link"]').click();
    await page.waitForFunction(() => document.querySelector('.notice')?.textContent === 'Link copied.');
    return page.evaluate(() => navigator.clipboard.readText());
  };
  const open = async (url: string) => {
    await page.goto(url);
    await page.waitForSelector('[data-ready=true]');
  };
  try {
    await open(`${embed}/site/mr-cache.html?step=diff`);
    assert.equal(await copied(), 'https://example.org/projects/rayner/mr-cache/diff');
    // The share page sends readers to the default case, so another case keeps the player URL.
    const pick = (value: string) => page.locator(`input[name="request"][value="${value}"]`).locator('xpath=..').click();
    await pick('miss');
    await page.waitForURL(/request=miss/);
    assert.equal(await copied(), `${embed}/site/mr-cache.html?step=diff&request=miss`);
    await pick('hit');
    await page.waitForURL(/request=hit/);
    assert.equal(await copied(), 'https://example.org/projects/rayner/mr-cache/diff');
    await open(`${embed}/site/odd-steps.html?step=one`);
    assert.equal(await copied(), 'https://example.org/projects/rayner/odd-steps/one');
    await page.locator('.stepper button[aria-label="Next step"]').click();
    await page.waitForURL(/step=two/);
    assert.equal(await copied(), `${embed}/site/odd-steps.html?step=two+words`);
    // Built without site:export: no share pages, so the player URL, as before.
    await open(`${embed}/mr-cache.html?step=diff`);
    assert.equal(await copied(), `${embed}/mr-cache.html?step=diff&request=hit`);
  } finally {
    await context.close();
  }
});
test('stepping within the teaching or source path keeps the heading line, Next, steps list and transcript in place', options, async () => {
  // Caption lengths and tour controls cannot shift a path while the reader steps.
  // Opening the separate source disclosure deliberately changes the page's height.
  for (const [width, height] of [[1180, 800], [390, 844]] as const)
    for (const scene of ['exgit', 'mr-cache', 'send-sync', 'token-bucket']) {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.addInitScript(() => {
          (window as unknown as { __layoutSettles: number }).__layoutSettles = 0;
          document.addEventListener('rayner:step', (event) => {
            const w = window as unknown as { __layoutSettles: number; __layoutStep: string };
            w.__layoutSettles++;
            w.__layoutStep = (event as CustomEvent<{ step: string }>).detail.step;
          });
        });
        await page.goto(`${embed}/${scene}.html`);
        await page.waitForSelector('[data-ready=true]');
        const paths = {story:{places:new Set<string>(),lines:new Set<string>()}, detail:{places:new Set<string>(),lines:new Set<string>()}};
        const n = await page.locator('.steps button').count();
        for (let i = 0; i < n; i++) {
          const before = await page.evaluate(() => (window as unknown as { __layoutSettles: number }).__layoutSettles);
          const step = await page.locator('.steps button').nth(i).getAttribute('data-step');
          assert.ok(step, 'the clicked step button identifies its target');
          const path = await page.locator('.steps button').nth(i).evaluate(b => !!b.closest('.supporting-steps')) ? paths.detail : paths.story;
          await page.locator('.steps button').nth(i).evaluate((b: HTMLElement) => b.click());
          await page.waitForFunction(({ before, step, i }) => {
            const w = window as unknown as { __layoutSettles: number; __layoutStep: string };
            return w.__layoutSettles > before && w.__layoutStep === step &&
              document.querySelectorAll('.steps button')[i]?.getAttribute('aria-current') === 'step';
          }, { before, step, i });
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
          if (await page.locator('.lede .line').isVisible())
            path.lines.add(await page.locator('.lede .line').evaluate((line) => (line.getBoundingClientRect().top + scrollY).toFixed(1)));
          path.places.add(
            await page.evaluate(() =>
              ['.stepper', '.rail', '.transcript'].map((s) => (document.querySelector(s)!.getBoundingClientRect().top + scrollY).toFixed(1)).join(' '),
            ),
          );
        }
        for(const [name,path] of Object.entries(paths)){
          assert.ok(path.places.size, `${scene}: ${name} path was exercised`);
          assert.equal(path.places.size, 1, `${scene}/${name} at ${width} px: controls, steps and transcript tops per step ${[...path.places].join(' | ')}`);
          if(width<600)assert.equal(path.lines.size,1,`${scene}/${name}: the line below the phone title stays at one height`);
        }
      } finally {
        await page.close();
      }
    }
});
test(
  'mobile controls and transcript work offline with storage disabled and no page errors',
  options,
  async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => {
      if (new URL(r.request().url()).origin === embed) return r.continue();
      requests.push(r.request().url());
      return r.abort();
    });
    await page.addInitScript(() => {
      for (const key of ['localStorage', 'sessionStorage'])
        Object.defineProperty(window, key, {
          get() {
            throw new Error('Storage disabled');
          },
        });
    });
    try {
      await page.goto(embed + '/mr-cache.html?request=miss&step=after');
      await page.waitForSelector('[data-ready=true]');
      assert.match(await page.locator('.caption').innerText(), /removes the handler’s edge to D1/);
      // The first Tab stop is the case picker; the page's main region is not one (WCAG 2.4.7).
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'radio');
      const viewport = await page.locator('.stage svg').evaluate((svg) => {
        const clips = [...svg.querySelectorAll('clipPath')];
        return {
          rects: clips.map((c) => ({
            namespace: c.namespaceURI,
            units: c.getAttribute('clipPathUnits'),
            width: c.querySelector('rect')?.getAttribute('width'),
            height: c.querySelector('rect')?.getAttribute('height'),
          })),
          references:
            svg.querySelectorAll('[clip-path]').length > 0 &&
            [...svg.querySelectorAll('[clip-path]')]
              .map((p) => p.getAttribute('clip-path'))
              .every((value) => clips.some((c) => value === `url(#${c.id})`)),
        };
      });
      // Clip paths are SVG elements in stage units, and every clip-path reference resolves to one.
      assert.ok(viewport.rects.length > 0);
      for (const rect of viewport.rects) {
        assert.equal(rect.namespace, 'http://www.w3.org/2000/svg');
        assert.equal(rect.units, 'userSpaceOnUse');
        assert.ok(Number(rect.width) > 0 && Number(rect.height) > 0, JSON.stringify(rect));
      }
      assert.equal(viewport.references, true);
      // A phone opens the step on its close-up: the labels near what the step changed read at
      // 12 px or more, and the overview over the stage's corner steps through the rest of the change.
      const project = projects.get('mr-cache')!,
        values = resolveSettings(project.Scene, { request: 'miss' });
      const size = await page.locator('.stage').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
      const layout = (await stepLayouts(project.variants.find((v) => v.values.request === values.request)!.Scene)).get('after')!;
      const tour = closeUps(layout, size.w, size.h);
      const painted = () => settledZoom(page);
      const near = (a: ReturnType<typeof zoomOf>, b: { k: number; x: number; y: number }) =>
        !!a && Math.abs(a.k - b.k) < 1e-4 * b.k && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
      assert.ok(tour[0]!.k > 1 && tour.length > 1, `mr-cache's detailed edit step needs a close-up tour: ${JSON.stringify(tour)}`);
      assert.ok(near(await painted(), tour[0]!), `opens on the first close-up ${JSON.stringify(tour[0])}`);
      const smallest = Math.min(...labelsToRead(layout).map((l) => l.size));
      assert.ok(smallest * stageScale(size.w, size.h).s * tour[0]!.k >= READ_PX - 1e-6, 'labels near the change read at 12 px');
      for (let i = 1; i <= tour.length; i++) {
        await page.locator('.overview').click();
        const want = tour[i % tour.length]!;
        await until(async () => near(zoomOf(await paintedView(page)), want), `close-up ${i}`);
      }
      // Whole picture shows the author's frame, and keeps it for the next steps; Close-up brings the close-ups back.
      await page.getByRole('button', { name: 'Whole picture' }).click();
      await until(async () => zoomOf(await paintedView(page)) === null, 'Whole picture');
      assert.equal(await page.getByRole('button', { name: 'Close-up of each step' }).isVisible(), true);
      assert.equal(await page.locator('.overview').isHidden(), true, 'no overview of the whole picture');
      // Zoom: a phone reader can still enlarge the vector stage and pan it, without page overflow.
      // It narrows the viewBox over the author's camera, the way the camera itself zooms, so the
      // element keeps its size (no layout shift) and Whole picture is the author's frame.
      const rect = (v: string) => v.split(' ').map(Number);
      const view = async () => rect((await paintedView(page)).view);
      const width = () => page.locator('.stage svg').evaluate((svg) => svg.getBoundingClientRect().width);
      const [fit, fitWidth] = [await view(), await width()];
      assert.deepEqual(fit, rect((await paintedView(page)).camera), 'Whole picture shows the author\'s frame');
      await page.getByRole('button', { name: 'Zoom in' }).click();
      await page.getByRole('button', { name: 'Zoom in' }).click();
      // Button zoom glides for 220 ms; wait for it to settle at 2.56×.
      await until(async () => Math.abs(fit[2]! / (await view())[2]! - 1.6 * 1.6) < 0.01, 'two zoom steps');
      assert.ok(Math.abs((await width()) - fitWidth) < 0.5, 'the stage keeps its size');
      const box = (await page.locator('.stage').boundingBox())!;
      const before = (await view())[0]!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      assert.ok((await view())[0]! < before, 'drag pans: dragging right shows what is to the left');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      // The zoom holds across step changes, over each step's own camera, and while Next plays.
      const zoomed = (await view())[2]!;
      const replaced = async (click: () => Promise<void>) => {
        await page.locator('.stage svg:not(.leaving)').evaluate((svg) => svg.setAttribute('data-old', ''));
        await click();
        await page.waitForFunction(() => !document.querySelector('.stage svg[data-old]'));
      };
      await replaced(() => page.locator('.stepper').getByRole('button', { name: 'Previous step' }).click());
      await quiet(page);
      assert.ok(Math.abs(zoomed / (await view())[2]! - 1) < 1e-6, 'zoom kept across steps');
      await replaced(() => page.locator('.stepper').getByRole('button', { name: 'Next step' }).click());
      assert.ok(Math.abs(zoomed / (await view())[2]! - 1) < 1e-6, 'zoom kept while the step plays');
      await quiet(page);
      assert.ok(Math.abs(zoomed / (await view())[2]! - 1) < 1e-6, 'zoom kept through an animated step');
      await page.getByRole('button', { name: 'Whole picture' }).click();
      await until(async () => zoomOf(await paintedView(page)) === null, 'Whole picture');
      assert.deepEqual(await view(), fit, 'Whole picture is the author frame');
      assert.equal(await page.getByRole('button', { name: 'Whole picture' }).isHidden(), true, 'Whole picture appears only when zoomed');
      await page.getByRole('button', { name: 'Close-up of each step' }).click();
      await until(async () => zoomOf(await paintedView(page)) !== null, 'Close-up');
      assert.ok(near(await painted(), tour[0]!), 'Close-up returns to the step\'s first close-up');
      assert.equal(await page.getByRole('button', { name: 'Close-up of each step' }).isHidden(), true);
      await page.getByRole('button', { name: 'Whole picture' }).click();
      await until(async () => zoomOf(await paintedView(page)) === null, 'Whole picture');
      await page.locator('.transcript > summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#content').focus();
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        () => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === 'diff',
      );
      // The first Tab reaches the case picker; its focus ring is drawn on the segment around the radio.
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'radio');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.activeElement!.closest('label')!).outlineWidth),
        '2px',
      );
      // Further Tabs reach the step controls, which show the same ring.
      for (let i = 0; i < 6 && (await page.evaluate(() => document.activeElement?.tagName)) !== 'BUTTON'; i++)
        await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineWidth), '2px');
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
    } finally {
      await page.close();
    }
  },
);
// The author's camera (lantern's 'points' step focuses the camera on Mobject) and the reader's
// zoom compose: Whole picture is the author's frame, a zoom narrows it, and the camera's glide home in the
// next step plays under a held zoom.
test(
  "reader zoom composes with the author's camera: Whole picture is the author frame, and a camera glide plays under a held zoom",
  options,
  async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(embed + '/lantern.html?step=points');
      await page.waitForSelector('[data-ready=true]');
      await quiet(page);
      const rect = (v: string) => v.split(' ').map(Number);
      const home = '-8000 -4500 16000 9000';
      const author = await paintedView(page);
      assert.notEqual(author.camera, home, 'the step frames part of the stage');
      assert.equal(author.view, author.camera, 'Whole picture shows the author frame');
      await page.locator('.stage').focus();
      await page.keyboard.press('+');
      await page.keyboard.press('+');
      const zoomed = await paintedView(page);
      assert.equal(zoomed.camera, author.camera, 'the author frame is unchanged under a reader zoom');
      // Read as a scale over the stage (zoomOf), not a ratio of widths: a stage whose rounded height
      // makes it a hair less wide than 16:9 is fitted by height, and its view is a little wider.
      assert.ok(Math.abs(zoomOf(zoomed)!.k - 2.56) < 1e-3, `two zoom steps narrow the author frame 2.56 times: ${JSON.stringify(zoomed)}`);
      const [cx, cy, cw, ch] = rect(zoomed.camera) as [number, number, number, number],
        [vx, vy, vw, vh] = rect(zoomed.view) as [number, number, number, number];
      assert.ok(vx >= cx - 1e-3 && vy >= cy - 1e-3 && vx + vw <= cx + cw + 1e-3 && vy + vh <= cy + ch + 1e-3, 'the view stays inside the author frame');
      // Next plays 'clock', whose s.clear() glides the camera home: every frame keeps the reader's 2.56×.
      const seen: Painted[] = [];
      await page.locator('.stepper').getByRole('button', { name: 'Next step' }).click();
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        const p = await paintedView(page).catch(() => null);
        if (p && (!seen.length || seen.at(-1)!.view !== p.view)) seen.push(p);
        if (p?.camera === home && seen.length > 3) break;
      }
      const gliding = seen.filter((p) => p.camera !== author.camera && p.camera !== home);
      assert.ok(gliding.length > 0, `the camera glide was seen under the zoom: ${seen.map((p) => p.camera).join(' | ')}`);
      for (const p of seen)
        assert.ok(Math.abs(zoomOf(p)!.k - 2.56) < 1e-3, `zoom held through the glide: ${p.camera} -> ${p.view}`);
      await quiet(page);
      assert.equal((await paintedView(page)).camera, home, 'the camera is home after clear()');
      await page.locator('.stage').focus();
      await page.keyboard.press('0');
      const fit = await paintedView(page);
      assert.equal(fit.view, fit.camera, 'Whole picture returns to the author frame');
      // On a phone the step's close-up is a reader zoom over that author frame, worked out in its units.
      const phone = await context.browser()!.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      try {
        const small = await phone.newPage();
        small.on('pageerror', (e) => errors.push(e.message));
        await small.goto(embed + '/lantern.html?step=points');
        await small.waitForSelector('[data-ready=true]');
        await quiet(small);
        const p = await paintedView(small);
        assert.equal(p.camera, author.camera, 'the phone shows the same author frame');
        const layout = (await stepLayouts(projects.get('lantern')!.variants[0]!.Scene)).get('points');
        const want = closeUps(layout, p.w, p.h)[0]!,
          got = zoomOf(p);
        if (want.k === 1) assert.equal(got, null);
        else
          assert.ok(
            got && Math.abs(got.k - want.k) < 1e-4 * want.k && Math.abs(got.x - want.x) < 0.01 && Math.abs(got.y - want.y) < 0.01,
            `close-up over the camera: painted ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`,
          );
      } finally {
        await phone.close();
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);
test(
  'raw iframe and standalone artifact contain a useful poster and all-case transcript without JavaScript',
  options,
  async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(embed + '/mr-cache.html');
      assert.ok((await page.locator('.poster path').count()) > 10);
      assert.match(await page.locator('.transcript').innerText(), /Follow a request: Cache hit/);
      assert.match(await page.locator('.transcript').innerText(), /Follow a request: Cache miss/);
      hostBody = `<!doctype html><iframe title="Raw explanation" src="${embed}/mr-cache.html" style="width:390px;height:640px"></iframe><a href="${embed}/mr-cache.html">Open standalone</a>`;
      await page.goto(host);
      const frame = page.frames().find((f) => f.url().startsWith(embed));
      assert.ok(frame);
      assert.ok((await frame.locator('.poster path').count()) > 10);
    } finally {
      await context.close();
    }
  },
);

// ---------------------------------------------------------------------------
// Property tests. The player is a state machine: fast-check generates command
// sequences (fc.commands), runs them against a real page, and after every
// command compares the page with a model built in Node from each case's trace.
// Browser runs are expensive, so counts are modest (test/lib/pbt.ts; FC_RUNS
// sets them all). A failure prints seed, path and the commands' replayPath;
// replay with FC_SEED=<seed> FC_PATH=<path> FC_REPLAY_PATH=<replayPath>.
//
// Reduced motion: the model runs under prefers-reduced-motion: reduce, where
// Next shows the finished step at once. With motion on, Next plays an
// animation in wall-clock time for an unpredictable number of frames, so the
// model's per-command assertions would race it; the motion-on path has its own
// property further down (Next ends on the step's resting picture), which waits
// for each animation to settle. Commands that land while a case is still loading
// are covered by the racing property, which checks consistency, not a model.
// size 'max' spreads sequence lengths up to maxCommands (the default size keeps them under ~10).
const commandOptions = (maxCommands: number) => ({
  maxCommands,
  size: 'max' as const,
  ...(process.env.FC_REPLAY_PATH ? { replayPath: process.env.FC_REPLAY_PATH } : {}),
});

interface StepSpec {
  detail: boolean;
  step: string;
  caption: string;
  title: string;
  line: string;
  summary: string;
  picture: string;
}
interface Entry {
  values: Settings;
  step: string;
}
interface PlayerModel {
  project: Project;
  entries: Entry[];
  index: number;
  notice: string;
  k: number;
  transcript: boolean;
  settles: number;
  /** On a narrow stage, each step opens on its close-up (docs/REFERENCE.md); Whole picture turns this off, Close-up on. */
  follow: boolean;
  /** The selected close-up ordinal; comparison openings and later details may use different scales. */
  tourStop: number;
}
interface PlayerReal {
  page: Page;
  errors: string[];
  /** history.length before the player's first entry. */
  base: number;
  /** Stage insertions made by the HTML parser (the poster), before the player ran. */
  parsed: number;
}
const settingsOfProject = (p: Project) => p.Scene.settings ?? [];
const sameCase = (p: Project, a: Settings, b: Settings) => settingsOfProject(p).every((s) => a[s.id] === b[s.id]);
function stepsOf(p: Project, values: Settings): StepSpec[] {
  const v = p.variants.find((v) => sameCase(p, v.values, values));
  assert.ok(v, `no prebuilt case ${JSON.stringify(values)}`);
  return v.trace.steps.map((s) => ({
    detail: s.meta.detail === true,
    step: s.step,
    caption: stepWords(s).caption,
    title: stepWords(s).title,
    line: stepWords(s).line,
    summary: pictureSummary(s.after),
    picture: pictureHtml(s.after),
  }));
}
const current = (m: PlayerModel) => m.entries[m.index]!;
const steps = (m: PlayerModel) => stepsOf(m.project, current(m).values);
const selected = (m: PlayerModel) => steps(m).findIndex((s) => s.step === current(m).step);
/** Independent reader contract: main controls skip notes; an opened note follows
 * source order. An all-notes case keeps its complete sequence usable. */
function teachingSteps(list: StepSpec[]) {
  const main = list.map((s, i) => !s.detail ? i : -1).filter(i => i >= 0);
  return main.length ? main : list.map((_, i) => i);
}
function neighbour(list: StepSpec[], i: number, by: -1 | 1) {
  const main = teachingSteps(list);
  if (!main.includes(i)) return Math.max(0, Math.min(list.length - 1, i + by));
  return main[Math.max(0, Math.min(main.length - 1, main.indexOf(i) + by))]!;
}
function presentedSteps(list: StepSpec[]) {
  const main = teachingSteps(list);
  return [...main, ...list.map((_, i) => i).filter(i => !main.includes(i))].map(i => list[i]!);
}
/** Zoom goes from 1× (fit) up to 6× (docs/REFERENCE.md); a zoom by `factor` lands inside that range. */
const ZOOM_MAX = 6;
const kAfter = (k: number, factor: number) => Math.min(ZOOM_MAX, Math.max(1, k * factor));
function push(m: PlayerModel, entry: Entry) {
  m.entries = [...m.entries.slice(0, m.index + 1), entry];
  m.index = m.entries.length - 1;
}
/** What the documented load does: resolve the case, keep the step by name or fall back to the first with a notice. */
function resolveLoad(p: Project, request: Record<string, string>, step: string | undefined) {
  let values: Settings;
  const notices: string[] = [];
  try {
    values = resolveSettings(p.Scene, request);
  } catch (error) {
    values = resolveSettings(p.Scene);
    notices.push(`${(error as Error).message}. Showing the default case.`);
  }
  const list = stepsOf(p, values);
  let found = step ? list.findIndex((s) => s.step === step) : teachingSteps(list)[0]!;
  // Both fallbacks are announced when both apply.
  if (found < 0) {
    found = teachingSteps(list)[0]!;
    notices.push(`This case has no “${step}” step, so it opens at the first step.`);
  }
  return { entry: { values, step: list[found]!.step }, notice: notices.join(' ') };
}

/** The parts of the card the reader model checks, in order (specs/player-tile.md T2). */
const CARD_ORDER = 'head frame stepper words transcript foot';
/** Everything the reader can see or the host can read, in one snapshot. */
function observe(ids: string[]) {
  const q = new URL(location.href).searchParams;
  const w = window as unknown as {
    __settles: number;
    __attaches: number;
    __last: { step: string; settings: Record<string, string> } | null;
  };
  const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  const stage = document.querySelector<HTMLElement>('.stage')!;
  return {
    settles: w.__settles,
    attaches: w.__attaches,
    last: w.__last,
    loading: document.getElementById('content')!.classList.contains('loading'),
    url: location.href,
    urlStep: q.get('step'),
    urlCase: Object.fromEntries(ids.map((id) => [id, q.get(id)])),
    current: [...document.querySelectorAll<HTMLElement>('.steps [aria-current=step]')].map((b) => b.dataset.step),
    list: [...document.querySelectorAll<HTMLElement>('.steps button')].map((b) => b.dataset.step),
    bar: [...document.querySelectorAll<HTMLElement>('.step-bar button')].map((b) => [b.dataset.step, b.dataset.state, b.getAttribute('aria-current')]),
    caption: document.querySelector('.caption')!.textContent,
    lede: [...document.querySelectorAll('.lede > *')].map((e) => ((e as HTMLElement).hidden ? null : e.textContent)),
    stageLabel: stage.getAttribute('aria-label'),
    // The resting picture in words: a summary as the stage's description, the full list under a disclosure.
    summary: document.getElementById(stage.getAttribute('aria-describedby') ?? '')?.textContent,
    picture: document.querySelector('.described > div')?.innerHTML,
    title: document.querySelector('h1')!.textContent,
    prevDisabled: button('Previous step')!.disabled,
    // Next's face: at rest on the last step it is Start again (specs/player-guidance.md G2).
    next: ((b) => ({ name: b.getAttribute('aria-label'), text: b.querySelector('span')!.textContent, disabled: b.disabled }))(
      document.querySelector<HTMLButtonElement>('.stepper .primary')!,
    ),
    tryCase: [...document.querySelectorAll<HTMLButtonElement>('.stepper > .button.try')].map((b) => (b.hidden ? null : b.textContent)),
    notice: document.querySelector('.notice')!.textContent,
    checked: Object.fromEntries(
      ids.map((id) => [id, document.querySelector<HTMLInputElement>(`input[name="${id}"]:checked`)?.value ?? null]),
    ),
    history: history.length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    painted: (() => {
      const svg = stage.querySelector('svg');
      return svg && { view: svg.getAttribute('viewBox')!, camera: svg.getAttribute('data-camera') ?? svg.getAttribute('viewBox')! };
    })(),
    stageW: stage.clientWidth,
    stageH: stage.clientHeight,
    zoomOutDisabled: button('Zoom out')!.disabled,
    zoomInDisabled: button('Zoom in')!.disabled,
    // Unseen, whether removed or holding its place (Whole picture keeps its place so the controls do not wrap).
    wholeHidden: ((b) => b.hidden || getComputedStyle(b).visibility === 'hidden')(button('Whole picture')!),
    closeUpHidden: button('Close-up of each step')!.hidden,
    overviewHidden: document.querySelector<HTMLButtonElement>('.overview')!.hidden,
    viewCount: document.querySelector('.view-controls > span')!.textContent,
    transcriptOpen: (document.querySelector('details.transcript') as HTMLDetailsElement).open,
    transcriptLinks: [...document.querySelectorAll<HTMLAnchorElement>('.transcript section:not([hidden]) a')].map((a) => a.href),
    // specs/player-tile.md T2: the card's parts, in the card's order, and nothing of the page outside the tile.
    card: [...document.querySelector('.player')!.children].flatMap((e) => ['head', 'frame', 'stepper', 'words', 'transcript', 'foot'].filter((c) => e.classList.contains(c))),
    outside: [...document.getElementById('content')!.children].map((e) => e.className),
  };
}
/** The stage's accessible description as Chromium computes it for assistive technology. */
async function stageDescription(page: Page): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.stage' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return String(nodes[0]?.description?.value ?? '');
  } finally {
    await cdp.detach();
  }
}
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
/**
 * What the stage paints. The reader's zoom narrows the SVG's viewBox over the author's frame,
 * which the SVG keeps as `data-camera` (app/embed-zoom.ts); with the stage's size, that reads
 * back as the zoom painted.
 */
interface Painted {
  view: string;
  camera: string;
  w: number;
  h: number;
}
const paintedView = (page: Page | Frame): Promise<Painted> =>
  page.locator('.stage svg:not(.leaving)').evaluate((svg) => ({
    view: svg.getAttribute('viewBox')!,
    camera: svg.getAttribute('data-camera') ?? svg.getAttribute('viewBox')!,
    w: svg.parentElement!.clientWidth,
    h: svg.parentElement!.clientHeight,
  }));
/** The reader's zoom painted over the author's frame; null when the stage shows the author's frame (Whole picture). */
function zoomOf(p: Painted | null) {
  if (!p || p.view === p.camera) return null;
  // Read the world interval under the stage independently of the painter.
  const [ax, ay, aw, ah] = p.camera.trim().split(/[\s,]+/).map(Number);
  const [left, top, width] = p.view.trim().split(/[\s,]+/).map(Number);
  const pixels = Math.min(p.w / aw!, p.h / ah!);
  const k = p.w / width! / pixels;
  return { k, x: -((left! - ax!) * pixels + (p.w - aw! * pixels) / 2) * k,
    y: -((top! - ay!) * pixels + (p.h - ah! * pixels) / 2) * k };
}
/** The zoom painted once any glide (220 ms) has landed: two reads a frame apart agree. */
async function settledZoom(page: Page | Frame) {
  for (let i = 0; ; i++) {
    const a = await paintedView(page);
    await (page as Page).evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const b = await paintedView(page);
    if (a.view === b.view || i > 60) return zoomOf(b);
  }
}
/** Poll until `ok` holds, for up to `ms`. */
async function until(ok: () => Promise<boolean>, what: string, ms = 5000) {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function verify(m: PlayerModel, r: PlayerReal, what: string) {
  const ids = settingsOfProject(m.project).map((s) => s.id);
  await r.page
    .waitForFunction(
      (n) =>
        (window as unknown as { __settles: number }).__settles >= n &&
        !document.getElementById('content')!.classList.contains('loading'),
      m.settles,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await twoFrames(r.page);
  await settledZoom(r.page);
  const seen = await r.page.evaluate(observe, ids);
  const entry = current(m),
    list = steps(m),
    i = selected(m),
    spec = list[i]!;
  const problems: string[] = [];
  const expect = (ok: boolean, label: string, actual: unknown, expected: unknown) => {
    if (!ok) problems.push(`${label}: got ${JSON.stringify(actual)}, model says ${JSON.stringify(expected)}`);
  };
  const eq = (label: string, actual: unknown, expected: unknown) =>
    expect(JSON.stringify(actual) === JSON.stringify(expected), label, actual, expected);
  eq('page errors', r.errors, []);
  eq('settled steps (rayner:step events)', seen.settles, m.settles);
  // Reduced motion: the only pictures ever attached are the resting frames shown on settling.
  eq('pictures attached to the stage', seen.attaches - r.parsed, m.settles);
  eq('URL step', seen.urlStep, entry.step);
  eq('URL case', seen.urlCase, Object.fromEntries(ids.map((id) => [id, entry.values[id]])));
  eq('checked case', seen.checked, Object.fromEntries(ids.map((id) => [id, entry.values[id]])));
  eq('last settled step', seen.last && { step: seen.last.step, settings: seen.last.settings }, {
    step: entry.step,
    settings: Object.fromEntries(ids.map((id) => [id, entry.values[id]])),
  });
  eq('step list', seen.list, presentedSteps(list).map(s => s.step));
  const main = teachingSteps(list);
  eq('step bar', seen.bar, main.map(j => [list[j]!.step, j < i ? 'done' : j === i ? 'current' : 'todo', j === i ? 'step' : 'false']));
  eq('aria-current', seen.current, [entry.step]);
  eq('caption', seen.caption, spec.caption);
  eq('stage label', seen.stageLabel, `${seen.title}: ${spec.title}${spec.line ? ` — ${spec.line}` : ''}`);
  eq('lede', seen.lede, [main.includes(i) ? `Step ${main.indexOf(i)+1} of ${main.length}` : 'Details and sources', spec.title, spec.line || null]);
  eq('stage description', seen.summary, spec.summary);
  eq('computed stage description', await stageDescription(r.page), spec.summary.replace(/\s+/g, ' ').trim());
  // Compared as the browser serializes it, which writes &quot; in text as a plain quote.
  const parsed = await r.page.evaluate((html) => Object.assign(document.createElement('div'), { innerHTML: html }).innerHTML, spec.picture);
  eq('picture disclosure', seen.picture, parsed);
  eq('Previous disabled', seen.prevDisabled, neighbour(list, i, -1) === i);
  // Next is never disabled: on the last step it is Start again, and a scene with settings offers
  // its first setting's next option beside it, at rest.
  const last = neighbour(list, i, 1) === i;
  eq('Next is Start again', seen.next, last
    ? { name: 'Start again from step 1', text: 'Start again', disabled: false }
    : { name: 'Next step', text: 'Next', disabled: false });
  const first = settingsOfProject(m.project)[0];
  eq('Try another case', seen.tryCase, first ? [last ? `Try ‘${nextOption(m).label}’` : null] : []);
  eq('notice', seen.notice, m.notice);
  eq('history length', seen.history, r.base + m.entries.length);
  eq('horizontal overflow', seen.overflow, false);
  eq('transcript open', seen.transcriptOpen, m.transcript);
  eq('card order', seen.card.join(' '), CARD_ORDER);
  eq('only the tile in the page', seen.outside.join(' '), 'layout tile');
  eq(
    'transcript links',
    seen.transcriptLinks.map((h) => {
      const q = new URL(h).searchParams;
      return [q.get('step'), ...ids.map((id) => q.get(id))];
    }),
    list.map((s) => [s.step, ...ids.map((id) => entry.values[id])]),
  );
  // Zoom: the scale the model predicts, painted so the drawing covers the stage.
  eq('Zoom out disabled', seen.zoomOutDisabled, m.k <= 1);
  eq('Zoom in disabled', seen.zoomInDisabled, m.k >= ZOOM_MAX);
  eq('Whole picture hidden', seen.wholeHidden, m.k <= 1);
  const narrow = seen.stageW > 0 && seen.stageW < NARROW_PX;
  eq('Close-up hidden', seen.closeUpHidden, !(narrow && !m.follow));
  const tour = await tourOf(m, seen.stageW, seen.stageH),
    multipleViews = narrow && tour.length > 1;
  eq('overview hidden', seen.overviewHidden, !(multipleViews && m.k > 1));
  const wholeFrameOutsideTour = m.k <= 1 && (!m.follow || tour[m.tourStop]?.k !== 1);
  eq('view count', seen.viewCount, multipleViews && wholeFrameOutsideTour ? 'Whole picture' : `View ${m.tourStop + 1} of ${tour.length}`);
  // The zoom is painted as a viewBox over the author's frame (data-camera); at k = 1 it is that frame.
  const t = zoomOf(seen.painted && { ...seen.painted, w: seen.stageW, h: seen.stageH });
  if (m.k === 1) eq('viewBox at k=1 (the author frame)', seen.painted?.view, seen.painted?.camera);
  else if (!t) problems.push(`viewBox: the author frame painted, model k=${m.k}`);
  else {
    // The viewBox is written to a thousandth of a user unit, so the zoom reads back to well
    // under a millionth of its scale and a thousandth of a pixel of its pan.
    const eps = 1e-3;
    expect(Math.abs(t.k - m.k) <= 1e-6 * m.k, 'painted scale', seen.painted, m.k);
    expect(
      t.x <= eps && t.y <= eps && t.x + seen.stageW * t.k >= seen.stageW - eps && t.y + seen.stageH * t.k >= seen.stageH - eps,
      'drawing covers stage',
      { painted: seen.painted, zoom: t, w: seen.stageW, h: seen.stageH },
      'covered',
    );
  }
  if (problems.length) throw new Error(`after ${what}:\n  ${problems.join('\n  ')}\n  at ${seen.url}`);
}

type Cmd = fc.AsyncCommand<PlayerModel, PlayerReal>;
/** A command: `act` drives the page and updates the model; every command then verifies the whole page. */
const command = (
  name: string,
  check: (m: PlayerModel) => boolean,
  act: (m: PlayerModel, r: PlayerReal) => Promise<void>,
): Cmd => ({
  check: (m) => check(m as PlayerModel),
  async run(m, r) {
    const settles = m.settles;
    await act(m, r);
    if (m.settles > settles) await reframe(m, r);
    await verify(m, r, name);
  },
  toString: () => name,
});
/** The stage's size now, and whether it is narrow enough for close-ups. */
/** The stage's size once it holds: after a resize the header and the heading settle within a frame or two. */
async function stageSize(r: PlayerReal) {
  const read = () => r.page.locator('.stage').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
  let last = await read();
  for (let i = 0; i < 30; i++) {
    await r.page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const now = await read();
    if (now.w === last.w && now.h === last.h) break;
    last = now;
  }
  return { w: last.w, h: last.h, narrow: last.w > 0 && last.w < NARROW_PX };
}
const layoutCache = new Map<string, Promise<Map<string, StepLayout>>>();
/** A case's step layouts, worked out in Node as the page works them out. */
function layoutsOf(p: Project, values: Settings) {
  const key = JSON.stringify([p.file, values]);
  if (!layoutCache.has(key)) layoutCache.set(key, stepLayouts(p.variants.find((v) => sameCase(p, v.values, values))!.Scene));
  return layoutCache.get(key)!;
}
/** The close-ups of the current step on this stage. */
async function tourOf(m: PlayerModel, w: number, h: number) {
  return closeUps((await layoutsOf(m.project, current(m).values)).get(current(m).step), w, h);
}
/** A step settled: on a narrow stage with close-ups on, the zoom is the step's close-up; otherwise it keeps its place. */
async function reframe(m: PlayerModel, r: PlayerReal) {
  const { w, h, narrow } = await stageSize(r);
  m.tourStop = 0;
  if (narrow && m.follow) m.k = (await tourOf(m, w, h))[0]!.k;
}
const button = (r: PlayerReal, name: string) => r.page.locator(`.stepper button[aria-label="${name}"]`);
/** Show a step of this case: a history entry when the step changes, a fresh resting picture always. */
function goTo(m: PlayerModel, index: number) {
  const step = steps(m)[index]!.step;
  if (step !== current(m).step) push(m, { values: current(m).values, step });
  m.settles++;
}
const always = () => true;
/** The option after the current one of the scene's first setting, wrapping: what Try shows. */
function nextOption(m: PlayerModel) {
  const s = settingsOfProject(m.project)[0]!,
    i = s.options.findIndex((o) => o.value === current(m).values[s.id]);
  return s.options[(i + 1) % s.options.length]!;
}
const isLast = (m: PlayerModel) => neighbour(steps(m), selected(m), 1) === selected(m);
/** At rest on the last step, Next reads Start again and goes back to step 1, pushing history as a step click does. */
const StartAgain = command('StartAgain', isLast, async (m, r) => {
  await button(r, 'Start again from step 1').click();
  goTo(m, teachingSteps(steps(m))[0]!);
});
/** At rest on the last step of a scene with settings: the first setting's next option, the others kept, at step 1. */
const TryCase = command(
  'TryCase',
  (m) => isLast(m) && settingsOfProject(m.project).length > 0,
  async (m, r) => {
    const s = settingsOfProject(m.project)[0]!,
      option = nextOption(m);
    await r.page.locator('.stepper > .button', { hasText: `Try ‘${option.label}’` }).click();
    const { entry, notice } = resolveLoad(m.project, { ...current(m).values, [s.id]: option.value }, undefined);
    if (!sameCase(m.project, entry.values, current(m).values)) m.k = 1;
    push(m, entry);
    m.notice = notice;
    m.settles++;
  },
);
const Next = command(
  'Next',
  (m) => neighbour(steps(m), selected(m), 1) !== selected(m),
  async (m, r) => {
    await button(r, 'Next step').click();
    goTo(m, neighbour(steps(m), selected(m), 1));
  },
);
const Previous = command(
  'Previous',
  (m) => neighbour(steps(m), selected(m), -1) !== selected(m),
  async (m, r) => {
    await button(r, 'Previous step').click();
    goTo(m, neighbour(steps(m), selected(m), -1));
  },
);
const ClickStep = (i: number) =>
  command(
    `ClickStep(${i})`,
    (m) => i < steps(m).length,
    async (m, r) => {
      const step = steps(m)[i]!.step;
      const target = r.page.locator(`.steps button[data-step="${step}"]`);
      const rail = r.page.locator('details.rail:not([open]) > summary');
      if (await rail.count()) await rail.click();
      if (steps(m)[i]!.detail && !await target.isVisible())
        await r.page.locator('.supporting > summary').click();
      await target.click();
      goTo(m, i);
    },
  );
/** A step bar segment: another step jumps there; the current step's, at rest, does nothing. */
const ClickSegment = (i: number) =>
  command(
    `ClickSegment(${i})`,
    (m) => teachingSteps(steps(m)).includes(selected(m)) && i < teachingSteps(steps(m)).length,
    async (m, r) => {
      const target = teachingSteps(steps(m))[i]!;
      await r.page.locator('.step-bar button').nth(i).click();
      if (target !== selected(m)) goTo(m, target);
    },
  );
const TranscriptLink = (i: number) =>
  command(
    `TranscriptLink(${i})`,
    (m) => m.transcript && i < steps(m).length,
    async (m, r) => {
      await r.page.locator('.transcript section:not([hidden]) a').nth(i).click();
      goTo(m, i);
    },
  );
const ChooseCase = (setting: number, option: number) =>
  command(
    `ChooseCase(${setting}, ${option})`,
    (m) => {
      const s = settingsOfProject(m.project)[setting];
      return !!s && option < s.options.length;
    },
    async (m, r) => {
      const s = settingsOfProject(m.project)[setting]!,
        value = s.options[option]!.value;
      await r.page.locator(`input[name="${s.id}"][value="${value}"]`).locator('xpath=..').click();
      // Choosing the case already shown changes nothing.
      if (current(m).values[s.id] === value) return;
      // A new case keeps the step by name, or falls back to the first with a notice; zoom resets.
      const { entry, notice } = resolveLoad(m.project, { ...current(m).values, [s.id]: value }, current(m).step);
      push(m, entry);
      m.notice = notice;
      m.k = 1;
      m.settles++;
    },
  );
/** Back/Forward restore case and step; zoom keeps its place across steps and resets when the case changes (docs/REFERENCE.md). */
function traverse(m: PlayerModel, by: number) {
  const was = current(m).values;
  m.index += by;
  m.notice = '';
  if (!sameCase(m.project, was, current(m).values)) m.k = 1;
  m.settles++;
}
const Back = command(
  'Back',
  (m) => m.index > 0,
  async (m, r) => {
    await r.page.goBack({ waitUntil: 'commit' });
    traverse(m, -1);
  },
);
const Forward = command(
  'Forward',
  (m) => m.index < m.entries.length - 1,
  async (m, r) => {
    await r.page.goForward({ waitUntil: 'commit' });
    traverse(m, 1);
  },
);
const ZoomButton = (which: 'Zoom in' | 'Zoom out' | 'Whole picture') =>
  command(
    `ZoomButton(${which})`,
    (m) => (which === 'Zoom in' ? m.k < ZOOM_MAX : m.k > 1),
    async (m, r) => {
      const { narrow } = await stageSize(r);
      await button(r, which).click();
      m.k = which === 'Whole picture' ? 1 : kAfter(m.k, which === 'Zoom in' ? 1.6 : 1 / 1.6);
      // On a narrow stage, Whole picture keeps the whole picture for the steps that follow.
      if (which === 'Whole picture' && narrow) m.follow = false;
    },
  );
/** Close-up: shown on a narrow stage once Whole picture has turned close-ups off; it turns them on and frames this step. */
const CloseUpButton = command('CloseUpButton', (m) => !m.follow, async (m, r) => {
  const { w, h, narrow } = await stageSize(r);
  if (!narrow) return; // hidden, so there is nothing to press
  await button(r, 'Close-up of each step').click();
  m.follow = true;
  m.tourStop = 0;
  m.k = (await tourOf(m, w, h))[0]!.k;
});
/** The overview: shown on a narrow zoomed stage; it moves to the next close-up at that view's scale. */
const OverviewButton = command('OverviewButton', always, async (m, r) => {
  const overview = r.page.locator('.overview');
  if (!(await overview.isVisible()) || (await overview.isDisabled())) return;
  const {w, h} = await stageSize(r), tour = await tourOf(m, w, h);
  await overview.click();
  m.tourStop = (Math.min(m.tourStop, tour.length - 1) + 1) % tour.length;
  m.k = tour[m.tourStop]!.k;
});
const CopyLink: Cmd = {
  check: always,
  async run(m, r) {
    await r.page.evaluate(() => navigator.clipboard.writeText(''));
    await button(r, 'Copy link').click();
    m.notice = 'Link copied.';
    await verify(m, r, 'CopyLink');
    const copied = new URL(await r.page.evaluate(() => navigator.clipboard.readText()));
    const here = new URL(r.page.url());
    here.searchParams.delete('parentOrigin');
    assert.equal(copied.href, here.href, 'the copied link is this page without parentOrigin');
    assert.equal(copied.searchParams.get('step'), current(m).step);
    for (const s of settingsOfProject(m.project)) assert.equal(copied.searchParams.get(s.id), current(m).values[s.id]);
  },
  toString: () => 'CopyLink',
};
/** A key pressed on the page, or on the focused stage: only the stage takes zoom keys, and once zoomed its arrows pan. */
const Key = (key: string, onStage = false) =>
  command(`Key(${JSON.stringify(key)}${onStage ? ', stage' : ''})`, always, async (m, r) => {
    await r.page.locator(onStage ? '.stage' : '#content').focus();
    await r.page.keyboard.press(key);
    const i = selected(m),
      stepping = !(onStage && m.k > 1);
    if (stepping && key === 'ArrowRight' && neighbour(steps(m), i, 1) !== i) goTo(m, neighbour(steps(m), i, 1));
    // ArrowLeft mirrors Previous, which is disabled on the first step.
    if (stepping && key === 'ArrowLeft' && neighbour(steps(m), i, -1) !== i) goTo(m, neighbour(steps(m), i, -1));
    if (!onStage) return;
    if (key === '+' || key === '=') m.k = kAfter(m.k, 1.6);
    if (key === '-') m.k = kAfter(m.k, 1 / 1.6);
    if (key === '0') {
      m.k = 1;
      if ((await stageSize(r)).narrow) m.follow = false;
    }
  });
/** A point on the stage. The stage has 12 px rounded corners, outside which a pointer is not on it. */
async function stagePoint(r: PlayerReal, u: number, v: number) {
  // Earlier clicks scroll the page; a pointer off the viewport reaches nothing.
  await r.page.locator('.stage').evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = (await r.page.locator('.stage').boundingBox())!,
    view = r.page.viewportSize()!,
    inset = 12;
  // The part of the stage on screen (a short viewport shows only part of it), inside the corners.
  const left = Math.max(box.x, 0) + inset,
    top = Math.max(box.y, 0) + inset,
    right = Math.min(box.x + box.width, view.width) - inset,
    bottom = Math.min(box.y + box.height, view.height) - inset;
  return { x: left + u * (right - left), y: top + v * (bottom - top) };
}
const DoubleClick = (u: number, v: number) =>
  command(`DoubleClick(${u}, ${v})`, always, async (m, r) => {
    const p = await stagePoint(r, u, v);
    await r.page.mouse.dblclick(p.x, p.y);
    m.k = m.k > 1 ? 1 : kAfter(m.k, 2.5);
  });
const CtrlWheel = (dy: number) =>
  command(`CtrlWheel(${dy})`, always, async (m, r) => {
    const p = await stagePoint(r, 0.5, 0.5);
    await r.page.mouse.move(p.x, p.y);
    await r.page.keyboard.down('Control');
    await r.page.mouse.wheel(0, dy);
    await r.page.keyboard.up('Control');
    m.k = kAfter(m.k, Math.exp(-dy / 100));
  });
const Drag = (dx: number, dy: number) =>
  command(`Drag(${dx}, ${dy})`, always, async (_m, r) => {
    const p = await stagePoint(r, 0.5, 0.5);
    await r.page.mouse.move(p.x, p.y);
    await r.page.mouse.down();
    await r.page.mouse.move(p.x + dx, p.y + dy, { steps: 3 });
    await r.page.mouse.up();
  });
const ToggleTranscript = command('ToggleTranscript', always, async (m, r) => {
  await r.page.locator('.transcript > summary').click();
  m.transcript = !m.transcript;
});
/** On a narrow page, open or close the steps row in the card; a wide page has no such row, and nothing happens. */
const ToggleSteps = command('ToggleSteps', always, async (_m, r) => {
  const row = r.page.locator('details.rail > summary');
  if (await row.count()) await row.click();
});
const Resize = (width: number, height: number) =>
  command(`Resize(${width}, ${height})`, always, async (m, r) => {
    await r.page.setViewportSize({ width, height });
    const size = await stageSize(r);
    m.tourStop = Math.min(m.tourStop, (await tourOf(m, size.w, size.h)).length - 1);
  });

// Narrower than 200 CSS px a single unbreakable word (a step title) is wider than the column.
const viewportArb = fc.record({ width: fc.integer({ min: 200, max: 1600 }), height: fc.integer({ min: 400, max: 1200 }) });
/** URL text: any code point, plus lone surrogates and the characters URLs treat specially. */
const urlText = fc.string({
  unit: fc.oneof(
    fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }),
    fc.constantFrom('\uD800', '\uDC00', '\0', '&', '=', '#', '%', '+', ' ', '?', '“', '”'),
  ),
});
function initialArb(p: Project) {
  const names = [...new Set(p.variants.flatMap((v) => v.trace.steps.map((s) => s.step)))];
  return fc.record({
    values: fc.tuple(
      ...settingsOfProject(p).map((s) =>
        fc.option(fc.oneof(fc.constantFrom(...s.options.map((o) => o.value)), urlText), { nil: undefined }),
      ),
    ),
    step: fc.option(fc.oneof(fc.constantFrom(...names), urlText), { nil: undefined }),
    viewport: viewportArb,
  });
}
function commandArbs(p: Project): fc.Arbitrary<Cmd>[] {
  const settings = settingsOfProject(p);
  return [
    fc.constant(Next),
    fc.constant(Previous),
    fc.constant(StartAgain),
    fc.constant(TryCase),
    fc.nat({ max: 7 }).map(ClickStep),
    fc.nat({ max: 7 }).map(ClickSegment),
    fc.nat({ max: 7 }).map(TranscriptLink),
    ...(settings.length
      ? [fc.tuple(fc.nat({ max: settings.length - 1 }), fc.nat({ max: 2 })).map(([s, o]) => ChooseCase(s, o))]
      : []),
    fc.constant(Back),
    fc.constant(Forward),
    fc.constantFrom('Zoom in', 'Zoom out', 'Whole picture').map((w) => ZoomButton(w as 'Zoom in')),
    fc.constant(CopyLink),
    fc.tuple(fc.constantFrom('ArrowRight', 'ArrowLeft', 'ArrowUp', '+', '=', '-', '0'), fc.boolean()).map(([k, onStage]) => Key(k, onStage)),
    fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })).map(
      ([u, v]) => DoubleClick(u, v),
    ),
    fc.integer({ min: -5000, max: 5000 }).map(CtrlWheel),
    fc.tuple(fc.integer({ min: -400, max: 400 }), fc.integer({ min: -400, max: 400 })).map(([x, y]) => Drag(x, y)),
    fc.constant(ToggleTranscript),
    fc.constant(ToggleSteps),
    viewportArb.map((v) => Resize(v.width, v.height)),
    fc.constant(CloseUpButton),
    fc.constant(OverviewButton),
  ];
}
async function openPlayer(name: string, initial: { values: (string | undefined)[]; step?: string; viewport: { width: number; height: number } }) {
  const p = projects.get(name)!;
  const query = new URLSearchParams();
  settingsOfProject(p).forEach((s, i) => {
    if (initial.values[i] !== undefined) query.set(s.id, initial.values[i]!);
  });
  if (initial.step !== undefined) query.set('step', initial.step);
  // The model reads the URL the way the page does: WHATWG decoding of the same query.
  const q = new URLSearchParams(query.toString()),
    request: Record<string, string> = {};
  for (const s of settingsOfProject(p)) if (q.has(s.id)) request[s.id] = q.get(s.id)!;
  const { entry, notice } = resolveLoad(p, request, q.get('step') ?? undefined);
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: 'reduce',
    viewport: initial.viewport,
  });
  context.setDefaultTimeout(5000);
  await context.addInitScript(() => {
    const w = window as unknown as { __settles: number; __attaches: number; __last: unknown };
    w.__settles = 0;
    w.__attaches = 0;
    w.__last = null;
    document.addEventListener('rayner:step', (e) => {
      w.__settles++;
      w.__last = (e as CustomEvent).detail;
    });
    new MutationObserver((records) => {
      for (const r of records)
        if ((r.target as Element).classList?.contains('stage') && r.addedNodes.length) w.__attaches++;
    }).observe(document, { childList: true, subtree: true });
  });
  // A failed opening closes its context too: shrinking reruns failing cases, and each would leave one open.
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${embed}/${name}.html${query.size ? '?' + query : ''}`);
    await page.waitForSelector('[data-ready=true]');
    const base = (await page.evaluate(() => history.length)) - 1;
    const parsed = (await page.evaluate(() => (window as unknown as { __attaches: number }).__attaches)) - 1;
    const model: PlayerModel = { project: p, entries: [entry], index: 0, notice, k: 1, transcript: false, settles: 1, follow: true, tourStop: 0 };
    const real: PlayerReal = { page, errors, base, parsed };
    await reframe(model, real);
    await verify(model, real, `opening ${page.url()}`);
    return { context, model, real };
  } catch (error) {
    await context.close();
    throw error;
  }
}
test('Left at the first story step leaves its picture, URL and settle count unchanged', options, async () => {
  const {context, model, real} = await openPlayer('oauth-pkce', {
    values: [undefined], viewport: {width: 200, height: 400},
  });
  try {
    await fc.asyncModelRun(() => ({model, real}), [Key('ArrowLeft'), Key('ArrowLeft')]);
    assert.equal(model.settles, 1);
    assert.equal(model.entries.length, 1);
  } finally {
    await context.close();
  }
});
test('Next view uses each detail view’s scale after a comparison opening', options, async () => {
  const {context, model, real} = await openPlayer('oauth-pkce', {
    values: ['yes'], viewport: {width: 308, height: 400},
  });
  try {
    await fc.asyncModelRun(() => ({model, real}), [Next]);
    const {w, h} = await stageSize(real), tour = await tourOf(model, w, h);
    assert.ok(tour.length > 1 && tour[0]!.k !== tour[1]!.k, 'the fixture changes scale between the opening and first detail view');
    await fc.asyncModelRun(() => ({model, real}), [OverviewButton]);
  } finally {
    await context.close();
  }
});

// oauth-pkce's cases have different step lists (only "yes" has an attack), the case the player finds hardest.
for (const [name, runs, maxCommands] of [['oauth-pkce', 10, 40]] as const)
  test(
    `player (${name}): any sequence of reader actions keeps the URL, step list, caption, controls, zoom and history in step with the model`,
    options,
    async () => {
      const p = projects.get(name)!;
      await fc.assert(
        fc.asyncProperty(initialArb(p), fc.commands(commandArbs(p), commandOptions(maxCommands)), async (initial, cmds) => {
          const { context, model, real } = await openPlayer(name, initial);
          try {
            await fc.asyncModelRun(() => ({ model, real }), cmds);
          } finally {
            await context.close();
          }
          // Each case leaves the browser as it found it, so a leak fails here rather than crashing a later case.
          assert.equal(browser.contexts().length, 0, 'browser contexts left open after a case');
        }),
        params(runs),
      );
    },
  );

test('phone tour metadata follows resizing while the current zoom and step stay put', options, async () => {
  for (const width of [200, 632]) for (const step of ['reader-bind', 'secret']) {
    const {context, model, real} = await openPlayer('oauth-pkce', {values: [undefined], step, viewport: {width, height: 400}});
    try {
      const commands = width === 632
        ? [Resize(200, 400), DoubleClick(0, 0), OverviewButton]
        : [Resize(632, 400), Resize(200, 400), OverviewButton];
      await fc.asyncModelRun(() => ({model, real}), commands);
      assert.equal(current(model).step, step);
    } finally { await context.close(); }
  }
});

test(
  'player: from ?attacker=yes&step=attack, choosing "no" falls back to the first step with a notice; Back restores the attack step',
  options,
  async () => {
    const { context, model, real } = await openPlayer('oauth-pkce', { values: ['yes'], step: 'attack', viewport: { width: 700, height: 900 } });
    try {
      await fc.asyncModelRun(() => ({ model, real }), [ChooseCase(0, 1), Back, CopyLink]);
      // Every command ran (a command whose precondition fails is skipped silently), and verify() held after each.
      const first = stepsOf(model.project, { attacker: 'no' })[0]!.step;
      assert.deepEqual(model.entries.map((e) => [e.values.attacker, e.step]), [['yes', 'attack'], ['no', first]]);
      assert.equal(model.index, 0, 'Back returned to the first entry');
      assert.equal(model.notice, 'Link copied.');
    } finally {
      await context.close();
    }
  },
);

/** Open a player page with the settle and attach counters installed. */
async function counted(context: import('playwright-core').BrowserContext, url: string) {
  await context.addInitScript(() => {
    const w = window as unknown as { __settles: number; __attaches: number; __last: unknown };
    w.__settles = 0;
    w.__attaches = 0;
    w.__last = null;
    document.addEventListener('rayner:step', (e) => {
      w.__settles++;
      w.__last = (e as CustomEvent).detail;
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('[data-ready=true]');
  return { page, errors };
}
/** Quiet: nothing loading, no animation playing, and no step settled for `ms`. */
async function quiet(page: Page, ms = 300) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    assert.ok(Date.now() < deadline, `reader did not become quiet within 30 seconds: ${page.url()}`);
    const n = await page.evaluate(() => (window as unknown as { __settles: number }).__settles);
    await page.waitForFunction(
      () =>
        !document.getElementById('content')!.classList.contains('loading') &&
        !!document.querySelector('.stepper') &&
        !document.querySelector('.stage[aria-busy=true]'),
      undefined,
      { timeout: Math.max(1, deadline - Date.now()) },
    );
    await page.waitForTimeout(ms);
    if ((await page.evaluate(() => (window as unknown as { __settles: number }).__settles)) === n) return;
  }
}
// The picture on the stage, not one still fading out under reduced motion.
const stagePicture = (page: Page) => page.locator('.stage').evaluate((s) => s.querySelector('svg:not(.leaving)')?.outerHTML);
const caseQuery = (p: Project, values: Settings, step: string) => {
  const q = new URLSearchParams();
  for (const s of settingsOfProject(p)) q.set(s.id, values[s.id]!);
  q.set('step', step);
  return q.toString();
};

// Phone close-ups (app/embed-closeup.ts). On a 390 px page each step opens on the close-up
// Node works out for it, whether reached by a link or by Next with motion on, and the two
// rest on the same picture; on a desktop page no step is zoomed.
test(
  'phone close-ups: at 390 × 844 every step opens on its close-up, by link or by Next with motion; at 1280 × 900 none is zoomed',
  options,
  async () => {
    for (const name of ['mr-cache', 'exgit', 'oauth-pkce']) {
      const p = projects.get(name)!;
      // mr-cache's two cases, exgit's first and PKCE's with the attacker (issue #21): diagram, code and card changes.
      const cases = name === 'mr-cache' ? p.variants : name === 'exgit' ? p.variants.slice(0, 1) : p.variants.filter((v) => v.values.attacker === 'yes');
      for (const v of cases) {
        const list = v.trace.steps,
          layouts = await stepLayouts(v.Scene);
        const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
        const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
        try {
          const a = await counted(phone, `${embed}/${name}.html?${caseQuery(p, v.values, list[0]!.step)}`);
          const d = await counted(desk, `${embed}/${name}.html?${caseQuery(p, v.values, list[0]!.step)}`);
          for (let i = 0; i < list.length; i++) {
            const step = list[i]!.step;
            if (i > 0) {
              for (const page of [a.page, d.page]) {
                if (neighbour(stepsOf(p, v.values), i - 1, 1) === i)
                  await page.locator('.stepper button[aria-label="Next step"]').click();
                else {
                  // Enter the source path explicitly; its remaining Next
                  // transitions retain the original full-step coverage.
                  const target = page.locator(`.steps button[data-step="${step}"]`);
                  const rail = page.locator('details.rail:not([open]) > summary');
                  if (await rail.count()) await rail.click();
                  if (!await target.isVisible())
                    await page.locator('.supporting:not([open]) > summary').click();
                  await target.click();
                }
              }
            }
            await quiet(a.page);
            await quiet(d.page);
            const size = await a.page.locator('.stage').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
            assert.ok(size.w < NARROW_PX);
            const tour = closeUps(layouts.get(step), size.w, size.h), want = tour[0]!;
            const t = await settledZoom(a.page);
            const where = `${name} ${JSON.stringify(v.values)} ${step}`;
            if (want.k === 1) assert.equal(t, null, where);
            else
              assert.ok(
                t && Math.abs(t.k - want.k) < 1e-4 * want.k && Math.abs(t.x - want.x) < 0.01 && Math.abs(t.y - want.y) < 0.01,
                `${where}: painted ${JSON.stringify(t)}, close-up ${JSON.stringify(want)}`,
              );
            assert.equal(await a.page.locator('.overview').isVisible(), tour.length > 1 && want.k > 1, `${where}: overview needs another view`);
            // Hold still: the picture Next rests on is the picture a link to the step shows, close-up and all.
            const rested = await stagePicture(a.page);
            const b = await phone.newPage();
            await b.goto(`${embed}/${name}.html?${caseQuery(p, v.values, step)}`);
            await b.waitForSelector('[data-ready=true]');
            await quiet(b);
            assert.equal(await stagePicture(b), rested, `${where}: Next and a link rest on different pictures`);
            await b.close();
            // Desktop: unchanged, the whole picture at every step, no overview, no close-up control.
            assert.equal(zoomOf(await paintedView(d.page)), null, where);
            assert.equal(await d.page.locator('.overview').isHidden(), true);
            assert.equal(await d.page.locator('button[aria-label="Close-up of each step"]').isHidden(), true);
          }
          assert.deepEqual([...a.errors, ...d.errors], []);
        } finally {
          await phone.close();
          await desk.close();
        }
      }
    }
  },
);

// Issue #21: at 390 × 844, PKCE's `authorize` caption says the verifier stays with the client
// and is not sent, as the note under the request says, and the first step's caption describes deriving the
// challenge; both were close-ups the reader had to hunt for (7th of 7, 4th of 6). Next view
// now goes first to what the step emphasised, so one press, by touch or by keyboard, shows each.
test('phone: one press of Next view shows what PKCE\'s captions point at, emphasised close-ups first', options, async () => {
  const p = projects.get('oauth-pkce')!,
    v = p.variants.find((c) => c.values.attacker === 'yes')!,
    layouts = await stepLayouts(v.Scene);
  const evidence: Record<string, Box> = {
    secret: await restingBox(v.Scene, 'secret', (scene) => wordsOutsideCards(scene, 'code_verifier', 'SHA-256')),
    authorize: await restingBox(v.Scene, 'authorize', (scene) => labelsSaying(scene, 'verifier not sent')),
  };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'no-preference' });
  try {
    const { page, errors } = await counted(context, `${embed}/oauth-pkce.html?attacker=yes&step=secret`);
    await quiet(page);
    const { w, h } = await page.locator('.stage').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
    const count = page.locator('.view-controls>span'),
      nextView = page.getByRole('button', { name: 'Next view', exact: true });
    const near = (a: ReturnType<typeof zoomOf>, b: { k: number; x: number; y: number }) =>
      !!a && Math.abs(a.k - b.k) < 1e-4 * b.k && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
    const shows = async (box: Box) => {
      const z = await settledZoom(page),
        view = z && viewBox(z, w, h);
      return !!view && box[0] >= view[0] - 1e-3 && box[2] <= view[2] + 1e-3 && box[1] >= view[1] - 1e-3 && box[3] <= view[3] + 1e-3;
    };
    for (const [i, step] of ['secret', 'authorize'].entries()) {
      if (i > 0) {
        // Next, with motion: it moves to the next step, as before.
        await page.locator('.stepper').getByRole('button', { name: 'Next step', exact: true }).click();
        await page.waitForURL(/step=authorize/);
        await quiet(page);
      }
      const tour = closeUps(layouts.get(step), w, h);
      assert.ok(near(await settledZoom(page), tour[0]!), `${step} opens on its first close-up`);
      assert.equal(await count.innerText(), `View 1 of ${tour.length}`);
      // What the caption points at is in the opening close-up, or one press away.
      const atOnce = await shows(evidence[step]!);
      // One press, a tap on the first step and the keyboard on the second, moves to the next close-up.
      if (i === 0) await nextView.tap();
      else {
        await nextView.focus();
        await page.keyboard.press('Enter');
      }
      await until(async () => near(zoomOf(await paintedView(page)), tour[1]!), `${step}: view 2`);
      assert.equal(await count.innerText(), `View 2 of ${tour.length}`);
      assert.equal(new URL(page.url()).searchParams.get('step'), step, 'Next view keeps the step');
      assert.ok(atOnce || (await shows(evidence[step]!)), `${step}: view 1 or 2 shows ${JSON.stringify(evidence[step])}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

// Regression (ledger P5): Next used to stop the animation where the caption hold
// begins, before anything a step adds after its last play(), so the picture the
// reader rested on differed from the one a link to that step shows.
test(
  'player, motion on: after Next settles, the stage shows exactly the picture a link to that step shows',
  options,
  async () => {
    const all = ['oauth-pkce', 'exgit', 'mr-cache'].flatMap((name) =>
      projects.get(name)!.variants.flatMap((v) =>
        stepsOf(projects.get(name)!, v.values).flatMap((_, i, list) => neighbour(list, i, 1) !== i ? [{name, values: v.values, i}] : []),
      ),
    );
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...all), async ({ name, values, i }) => {
        const p = projects.get(name)!,
          list = stepsOf(p, values);
        const context = await browser.newContext({ reducedMotion: 'no-preference' });
        try {
          const a = await counted(context, `${embed}/${name}.html?${caseQuery(p, values, list[i]!.step)}`);
          await a.page.locator('.stepper button[aria-label="Next step"]').click();
          await a.page.waitForFunction(() => (window as unknown as { __settles: number }).__settles >= 2, undefined, {
            timeout: 30_000,
          });
          await quiet(a.page);
          const b = await counted(context, `${embed}/${name}.html?${caseQuery(p, values, list[neighbour(list, i, 1)]!.step)}`);
          assert.equal(new URL(a.page.url()).searchParams.get('step'), list[neighbour(list, i, 1)]!.step);
          assert.equal(await stagePicture(a.page), await stagePicture(b.page), `${name} ${JSON.stringify(values)} ${list[i]!.step} → Next`);
          assert.deepEqual([...a.errors, ...b.errors], []);
        } finally {
          await context.close();
        }
      }),
      params(5),
    );
  },
);

// Next pressed while a step plays sends the playing run on to the next step, undrawn,
// instead of replaying the scene from its start; it must still rest on the link's picture.
test(
  'player, motion on: Next pressed mid-motion rests on exactly the picture a link to the step after shows',
  options,
  async () => {
    const all = ['oauth-pkce', 'exgit'].flatMap((name) =>
      projects.get(name)!.variants.slice(0, 1).flatMap((v) =>
        stepsOf(projects.get(name)!, v.values).flatMap((_, i, list) => {const first=neighbour(list,i,1), second=neighbour(list,first,1);return first!==i&&second!==first?[{name,values:v.values,i}]:[];}),
      ),
    );
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...all), fc.constantFrom(60, 250, 600), async ({ name, values, i }, after) => {
        const p = projects.get(name)!,
          list = stepsOf(p, values);
        const context = await browser.newContext({ reducedMotion: 'no-preference' });
        try {
          const a = await counted(context, `${embed}/${name}.html?${caseQuery(p, values, list[i]!.step)}`);
          await quiet(a.page);
          await a.page.locator('.stepper button[aria-label="Next step"]').click();
          await a.page.waitForTimeout(after);
          await a.page.locator('.stepper button[aria-label="Next step"]').click();
          await a.page.waitForFunction((step) => (window as unknown as { __last: { step: string } | null }).__last?.step === step, list[neighbour(list, neighbour(list, i, 1), 1)]!.step, {
            timeout: 30_000,
          });
          await quiet(a.page);
          const b = await counted(context, `${embed}/${name}.html?${caseQuery(p, values, list[neighbour(list, neighbour(list, i, 1), 1)]!.step)}`);
          const where = `${name} ${list[i]!.step} → Next, ${after} ms, Next`;
          assert.equal(new URL(a.page.url()).searchParams.get('step'), list[neighbour(list, neighbour(list, i, 1), 1)]!.step, where);
          assert.equal(await stagePicture(a.page), await stagePicture(b.page), where);
          assert.deepEqual([...a.errors, ...b.errors], []);
        } finally {
          await context.close();
        }
      }),
      params(6),
    );
  },
);

// Every scene run draws into an SVG root the page creates, and a kept picture is a copy
// (cloneNode creates nothing). So when a stage picture was created tells whether the
// player re-ran the scene for it: Next should play a run prepared while the reader was
// on the previous step, and a step seen before should come back as a copy.
test(
  'player, motion on: Next plays a run prepared before the tap, and a revisited step is a copy, not a re-run',
  options,
  async () => {
    const name = 'oauth-pkce',
      p = projects.get(name)!,
      v = p.variants[0]!,
      lists = [v.trace.steps.filter(s => s.meta.detail !== true), v.trace.steps.filter(s => s.meta.detail === true)];
    for (const list of lists) {
    assert.ok(list.length >= 2);
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    try {
      await context.addInitScript(() => {
        const born = new WeakMap<Node, number>(),
          w = window as unknown as { __shown: Array<{ at: number; born: number | null }> };
        w.__shown = [];
        const create = Document.prototype.createElementNS;
        Document.prototype.createElementNS = function (this: Document, ...args: Parameters<typeof create>) {
          const node = create.apply(this, args);
          born.set(node, performance.now());
          return node;
        } as typeof create;
        new MutationObserver((records) => {
          for (const r of records)
            if ((r.target as Element).matches?.('.player .stage'))
              for (const n of r.addedNodes) if (n.nodeName === 'svg') w.__shown.push({ at: performance.now(), born: born.get(n) ?? null });
        }).observe(document, { childList: true, subtree: true });
      });
      const { page, errors } = await counted(context, `${embed}/${name}.html?${caseQuery(p, v.values, list[0]!.step)}`);
      /** Run `act`, wait for the player to settle, and return the stage pictures shown meanwhile. */
      const shownDuring = async (act: () => Promise<void>) => {
        await quiet(page);
        const [t, n] = await page.evaluate(() => [performance.now(), (window as unknown as { __settles: number }).__settles]);
        await act();
        await page.waitForFunction((n) => (window as unknown as { __settles: number }).__settles > n, n, { timeout: 30_000 });
        const shown = await page.evaluate((t) => (window as unknown as { __shown: Array<{ at: number; born: number | null }> }).__shown.filter((s) => s.at > t), t);
        return { t, shown };
      };
      const next = await shownDuring(() => page.locator('.stepper button[aria-label="Next step"]').click());
      assert.ok(next.shown.length >= 1, 'Next showed a picture');
      assert.ok(next.shown[0]!.born !== null && next.shown[0]!.born < next.t, `Next's first picture was drawn after the tap: ${JSON.stringify(next)}`);
      for (const i of [0, 1]) {
        const back = await shownDuring(() => page.locator(`.steps button[data-step="${list[i]!.step}"]`).click());
        assert.ok(back.shown.length >= 1, `step ${list[i]!.step} showed a picture`);
        assert.equal(back.shown.at(-1)!.born, null, `step ${list[i]!.step} was drawn again, not copied: ${JSON.stringify(back)}`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
    }
  },
);

// Commands fired in a burst, without waiting for the player: case changes race
// navigation while a new case's trace is still being computed.
type Burst = { kind: 'case'; setting: number; option: number } | { kind: 'next' | 'prev' | 'back' | 'forward' | 'left' | 'right' } | { kind: 'step'; i: number };
const burstArb = (p: Project) =>
  fc.array(
    fc.record({
      action: fc.oneof(
        fc.record({ kind: fc.constant('case' as const), setting: fc.nat({ max: Math.max(0, settingsOfProject(p).length - 1) }), option: fc.nat({ max: 2 }) }),
        fc.record({ kind: fc.constantFrom('next' as const, 'prev' as const, 'back' as const, 'forward' as const, 'left' as const, 'right' as const) }),
        fc.record({ kind: fc.constant('step' as const), i: fc.nat({ max: 7 }) }),
      ),
      // Same task, next microtask-free turn, or a short pause.
      gap: fc.constantFrom(0, 1, 5, 20, 60),
    }),
    { minLength: 1, maxLength: 12 },
  );
for (const name of ['oauth-pkce'] as const)
  test(
    `player (${name}): any burst of case changes and navigation, unawaited, ends with the URL, choice, list, caption and picture all on one case and step`,
    options,
    async () => {
      const p = projects.get(name)!,
        ids = settingsOfProject(p).map((s) => s.id);
      await fc.assert(
        fc.asyncProperty(burstArb(p), async (burst) => {
          const context = await browser.newContext({ reducedMotion: 'reduce' });
          try {
            const { page, errors } = await counted(context, `${embed}/${name}.html`);
            await page.evaluate(
              async ({ burst, settings }) => {
                const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
                // At rest on the last step Next is Start again, named otherwise: no Next step to press, as when it was disabled.
                const button = (n: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${n}"]`);
                const key = (k: string) =>
                  document.getElementById('content')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
                // Back must not leave the player's document: count Backs not yet committed.
                const nav = (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation;
                let queued = 0,
                  seenIndex = nav.currentEntry.index;
                for (const { action: a, gap } of burst) {
                  if (nav.currentEntry.index !== seenIndex) [queued, seenIndex] = [0, nav.currentEntry.index];
                  if (a.kind === 'case') {
                    const s = settings[a.setting];
                    const input = s && document.querySelector<HTMLInputElement>(`input[name="${s.id}"][value="${s.options[a.option % s.options.length]}"]`);
                    input?.click();
                  } else if (a.kind === 'next') button('Next step')?.click();
                  else if (a.kind === 'prev') button('Previous step')!.click();
                  else if (a.kind === 'back') {
                    if (nav.currentEntry.index - queued > 0) {
                      queued++;
                      history.back();
                    }
                  }
                  else if (a.kind === 'forward') history.forward();
                  else if (a.kind === 'left') key('ArrowLeft');
                  else if (a.kind === 'right') key('ArrowRight');
                  else if (a.kind === 'step') document.querySelectorAll<HTMLButtonElement>('.steps button')[a.i]?.click();
                  if (gap) await pause(gap);
                }
              },
              {
                burst: burst as { action: Burst; gap: number }[],
                settings: settingsOfProject(p).map((s) => ({ id: s.id, options: s.options.map((o) => o.value) })),
              },
            );
            await quiet(page);
            const seen = await page.evaluate(observe, ids);
            const values = Object.fromEntries(ids.map((id) => [id, seen.urlCase[id]!])) as Settings;
            const list = stepsOf(p, values),
              at = list.findIndex((s) => s.step === seen.urlStep);
            assert.ok(at >= 0, `URL step ${seen.urlStep} is not a step of ${JSON.stringify(values)}`);
            assert.deepEqual(
              {
                checked: seen.checked,
                list: seen.list,
                current: seen.current,
                caption: seen.caption,
                last: seen.last,
                errors,
              },
              {
                checked: seen.urlCase,
                list: presentedSteps(list).map((s) => s.step),
                current: [seen.urlStep],
                caption: list[at]!.caption,
                last: { step: seen.urlStep, settings: seen.urlCase },
                errors: [],
              },
            );
            // The picture is that step's resting frame: what a fresh link to it shows.
            const fresh = await counted(context, `${embed}/${name}.html?${caseQuery(p, values, seen.urlStep!)}`);
            assert.equal(await stagePicture(page), await stagePicture(fresh.page), 'stage picture');
          } finally {
            await context.close();
          }
        }),
        params(12),
      );
    },
  );

test(
  'player: controls and keys used before the first case has loaded raise no errors and leave the requested step showing',
  options,
  async () => {
    const name = 'oauth-pkce',
      p = projects.get(name)!;
    const early = fc.array(fc.constantFrom('Next step', 'Previous step', 'Whole picture', 'Copy link', 'Zoom in', 'Zoom out', 'ArrowRight', 'ArrowLeft', '+', '0'), {
      minLength: 1,
      maxLength: 8,
    });
    await fc.assert(
      fc.asyncProperty(early, fc.constantFrom(...stepsOf(p, resolveSettings(p.Scene)).map((s) => s.step)), async (actions, step) => {
        const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
        try {
          // As soon as the controls exist, before the first trace is ready, use them.
          await context.addInitScript((actions: string[]) => {
            const w = window as unknown as { __early: number };
            w.__early = 0;
            const observer = new MutationObserver(() => {
              if (!document.querySelector('button[aria-label="Next step"]')) return;
              observer.disconnect();
              for (const a of actions) {
                const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${a}"]`);
                if (b) b.click();
                else document.getElementById('content')!.dispatchEvent(new KeyboardEvent('keydown', { key: a, bubbles: true }));
                w.__early++;
              }
            });
            observer.observe(document, { childList: true, subtree: true });
          }, actions);
          const { page, errors } = await counted(context, `${embed}/${name}.html?step=${step}`);
          await quiet(page);
          assert.equal(await page.evaluate(() => (window as unknown as { __early: number }).__early), actions.length);
          assert.deepEqual(errors, []);
          // Nothing could move before the trace existed, so the deep link's step is showing.
          assert.equal(new URL(page.url()).searchParams.get('step'), step);
        } finally {
          await context.close();
        }
      }),
      {...params(10), examples: [[['Previous step', 'ArrowLeft', 'Next step'], 'reader-bind']]},
    );
  },
);

// ---------------------------------------------------------------------------
// reportHeight, in real cross-origin frames. Each frame's `parent` is wrapped
// (it is a [Replaceable] window attribute) so every postMessage the child makes
// is recorded with its target origin, including any the browser would drop.
interface Post {
  msg: { type?: unknown; version?: unknown; height?: unknown };
  origin: string;
}
async function recordPosts(context: import('playwright-core').BrowserContext) {
  await context.addInitScript(() => {
    if (window.parent === window) return;
    const real = window.parent,
      posts: { msg: unknown; origin: string }[] = [];
    (window as unknown as { __posts: typeof posts }).__posts = posts;
    (window as unknown as { parent: unknown }).parent = {
      postMessage(msg: unknown, origin: string) {
        posts.push({ msg: JSON.parse(JSON.stringify(msg)), origin });
        real.postMessage(msg, origin);
      },
    };
  });
}
const postsOf = (frame: Frame) => frame.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
type HeightAction =
  | { kind: 'transcript' | 'next' | 'prev' | 'away' | 'back' }
  | { kind: 'case'; option: number }
  | { kind: 'resize'; width: number; height: number };
const heightActions = fc.array(
  fc.oneof(
    fc.record({ kind: fc.constantFrom('transcript' as const, 'next' as const, 'prev' as const, 'away' as const, 'back' as const) }),
    fc.record({ kind: fc.constant('case' as const), option: fc.nat({ max: 2 }) }),
    fc.record({ kind: fc.constant('resize' as const), width: fc.integer({ min: 200, max: 1600 }), height: fc.integer({ min: 300, max: 1200 }) }),
  ),
  { minLength: 1, maxLength: 10 },
);
/** Act inside the frame through the DOM, so nothing scrolls the host as a Playwright click would. */
async function heightAct(page: Page, frame: Frame, a: HeightAction) {
  if (a.kind === 'resize') return page.setViewportSize({ width: a.width, height: a.height });
  if (a.kind === 'away') return page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  if (a.kind === 'back') return page.evaluate(() => scrollTo(0, 0));
  await frame.evaluate((a) => {
    if (a.kind === 'transcript') document.querySelector<HTMLElement>('.transcript > summary')!.click();
    // On the last step Next is Start again, named otherwise; pressing nothing there is as before.
    else if (a.kind === 'next') document.querySelector<HTMLButtonElement>('button[aria-label="Next step"]')?.click();
    else if (a.kind === 'prev') document.querySelector<HTMLButtonElement>('button[aria-label="Previous step"]')!.click();
    else if (a.kind === 'case') {
      const inputs = document.querySelectorAll<HTMLInputElement>('.case input');
      inputs[a.option % inputs.length]?.click();
    }
  }, a);
}
/** The frame's last posted height, its content root's height and the host's iframe height, once they agree (or after 5 s). */
async function heightsSettle(page: Page, frame: Frame) {
  let last: { posted: unknown; content: number; iframe: string } | undefined;
  for (const until = Date.now() + 5000; Date.now() < until; await page.waitForTimeout(50)) {
    const { posted, content } = await frame.evaluate(() => ({
      // The resize messages; the frame also reports each settled step (specs/player-guidance.md G4).
      posted: (window as unknown as { __posts: Post[] }).__posts.filter((p) => p.msg.type === 'rayner:resize').at(-1)?.msg.height,
      content: Math.ceil(document.getElementById('content')!.getBoundingClientRect().height),
    }));
    const iframe = await page.locator('iframe').evaluate((f) => (f as HTMLIFrameElement).style.height);
    last = { posted, content, iframe };
    if (posted === content && iframe === content + 'px') return last;
  }
  return last!;
}
test(
  'reportHeight: after any mix of transcript, case, step, viewport and scroll changes, the last posted height equals the content root\'s height, every resize message is a new height the host accepts, and every other message is a step report it accepts',
  options,
  async () => {
    const { resizeHeight, stepDetail } = await import('../app/embed-protocol.ts');
    await fc.assert(
      fc.asyncProperty(heightActions, async (actions) => {
        hostBody = `<!doctype html><style>body{margin:0}</style>${loader('a', 'oauth-pkce')}<div style="height:4000px"></div>`;
        const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 700, height: 800 } });
        try {
          await recordPosts(context);
          const page = await context.newPage();
          await page.goto(host);
          const frame = await readyFrame(page, 'oauth-pkce');
          for (const a of actions) {
            await heightAct(page, frame, a);
            // An offscreen cross-origin frame may not render, so it can only be held to this once visible.
            const visible = await page.locator('iframe').evaluate((f) => {
              const r = f.getBoundingClientRect();
              return r.bottom > 0 && r.top < innerHeight;
            });
            if (visible) {
              const h = await heightsSettle(page, frame);
              assert.deepEqual(h, { posted: h.content, content: h.content, iframe: h.content + 'px' }, `after ${JSON.stringify(a)}`);
            }
          }
          await heightAct(page, frame, { kind: 'back' });
          const h = await heightsSettle(page, frame);
          assert.deepEqual(h, { posted: h.content, content: h.content, iframe: h.content + 'px' }, 'back in view');
          const all = await postsOf(frame),
            posts = all.filter((p) => p.msg.type === 'rayner:resize'),
            source = {} as MessageEventSource;
          // Every other message is a step report the loader accepts, to the same origin.
          for (const p of all.filter((p) => p.msg.type !== 'rayner:resize'))
            assert.ok(p.origin === host && stepDetail({ origin: host, source, data: p.msg }, host, source), JSON.stringify(p));
          for (const [i, p] of posts.entries()) {
            assert.equal(resizeHeight({ origin: host, source, data: p.msg }, host, source), p.msg.height, JSON.stringify(p));
            if (i) assert.notEqual(p.msg.height, posts[i - 1]!.msg.height, `posts ${i - 1} and ${i} repeat a height`);
          }
        } finally {
          await context.close();
        }
      }),
      params(10),
    );
  },
);

/**
 * parentOrigin values labelled by construction, not by the page's own check: exact origins (the
 * host's, others as URL gives them, an IPv6 one), near misses the docs reject, arbitrary text that
 * cannot be an HTTP(S) origin, and no parentOrigin at all.
 */
const parentOriginArb = (hostOrigin: string) =>
  fc.oneof(
    fc.oneof(fc.constant(hostOrigin), fc.webUrl().map((u) => new URL(u).origin), fc.constant('http://[::1]')).map((value) => ({ value, exact: true })),
    fc
      .oneof(
        fc.constantFrom(
          '*',
          'null',
          '',
          ' ',
          hostOrigin + '/',
          hostOrigin + '/path',
          hostOrigin + '?q',
          hostOrigin + '#h',
          ' ' + hostOrigin,
          hostOrigin + ' ',
          hostOrigin.toUpperCase(),
          hostOrigin.replace('http:', 'HTTP:'),
          hostOrigin.replace('http://', 'http://user:pw@'),
          'http://127.0.0.1:80',
          'https://example.com:443',
          'file://',
          'data:text/html,x',
          'javascript:alert(1)',
          'ws://127.0.0.1',
        ),
        fc.string({ unit: 'binary' }).filter((v) => !/^https?:/i.test(v)),
      )
      .map((value) => ({ value, exact: false })),
    fc.constant({ value: undefined, exact: false }),
  );
test(
  'framed with any parentOrigin: messages go to exactly that origin when it is an exact HTTP(S) origin and nowhere otherwise; the footer\'s "Open the explainer" link shows with or without parentOrigin and opens this step and case without it',
  options,
  async () => {
    await fc.assert(
      fc.asyncProperty(parentOriginArb(host), fc.boolean(), async ({ value, exact }, toggle) => {
        const src = `${embed}/oauth-pkce.html${value === undefined ? '' : '?' + new URLSearchParams({ parentOrigin: value })}`;
        hostBody = `<!doctype html><iframe title="t" src="${src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="width:600px;height:640px;border:0"></iframe>`;
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        try {
          await recordPosts(context);
          const page = await context.newPage();
          await page.goto(host);
          const frame = await readyFrame(page, 'oauth-pkce');
          if (toggle) await frame.evaluate(() => document.querySelector<HTMLElement>('.transcript > summary')!.click());
          await page.waitForTimeout(100);
          const posts = await postsOf(frame);
          assert.deepEqual([...new Set(posts.map((p) => p.origin))], exact ? [value] : [], `parentOrigin ${JSON.stringify(value)}`);
          // specs/player-tile.md T3: in any frame the footer's way out opens this page at the reader's step
          // and case, in a new tab, without parentOrigin.
          const out = await frame.evaluate(() => ({
            links: [...document.querySelectorAll<HTMLAnchorElement>('.player > .foot a.open')].map((a) => ({ href: a.href, target: a.target, text: a.textContent })),
            page: location.origin + location.pathname,
            step: document.querySelector<HTMLElement>('.steps [aria-current=step]')?.dataset.step,
            attacker: document.querySelector<HTMLInputElement>('input[name=attacker]:checked')?.value,
          }));
          assert.equal(out.links.length, 1, `parentOrigin ${JSON.stringify(value)}`);
          const href = new URL(out.links[0]!.href);
          assert.deepEqual(
            { path: href.origin + href.pathname, step: href.searchParams.get('step'), attacker: href.searchParams.get('attacker'), parentOrigin: href.searchParams.has('parentOrigin'), target: out.links[0]!.target, text: out.links[0]!.text },
            { path: out.page, step: out.step, attacker: out.attacker, parentOrigin: false, target: '_blank', text: 'Open the explainer' },
            `parentOrigin ${JSON.stringify(value)}`,
          );
          assert.ok(out.step && out.attacker, `the player shows a step and a case: ${JSON.stringify(out)}`);
        } finally {
          await context.close();
        }
      }),
      {
        ...params(16),
        // Always: the host itself, its nearest miss (a trailing slash), and no parentOrigin.
        examples: [
          [{ value: host, exact: true }, false],
          [{ value: host + '/', exact: false }, false],
          [{ value: undefined, exact: false }, false],
        ],
      },
    );
  },
);

// #21: readable labels are insufficient when a caption's evidence is in another view.
// Exercise the visible route to that evidence, rather than only asserting the zoom scale.
test('PKCE mobile views expose the derivation and the unsent verifier without advancing the step', options, async () => {
  const project = projects.get('oauth-pkce')!;
  for (const variant of project.variants) {
    const targets = new Map<string, number[][]>();
    await new variant.Scene({
      async frame() {},
      async stepEnd(scene, step) {
        if (!['secret', 'authorize'].includes(step.name)) return;
        const found: number[][] = [];
        const walk = (m: import('../src/index.ts').Mobject) => {
          const label = labelOf(m);
          // The unsent verifier is said in the authorize message's note ("verifier not sent").
          if (label && (step.name === 'secret' ? ['code_verifier', 'code_challenge'].includes(label.text) : label.text.includes('not sent'))) {
            const box = m.box();
            if (box) found.push(toView(box, scene.frame.box()!));
          }
          for (const child of m.children) walk(child);
        };
        for (const m of scene.mobjects) walk(m);
        targets.set(step.name, found);
      },
    }, { skipUntil: Infinity }).run();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: variant.values.attacker === 'yes' ? 'no-preference' : 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(`${embed}/oauth-pkce.html?attacker=${variant.values.attacker}&step=secret`);
      await page.waitForSelector('[data-ready=true]');
      for (const step of ['secret', 'authorize']) {
        if (step === 'authorize') await page.locator('.stepper').getByRole('button', { name: 'Next step', exact: true }).click();
        await quiet(page);
        assert.equal(new URL(page.url()).searchParams.get('step'), step);
        assert.ok(await page.locator('.view-help').isVisible());
        assert.equal(await page.getByRole('button', {name: 'Next view', exact: true}).getAttribute('aria-describedby'),
          await page.locator('.view-help').getAttribute('id'), 'view navigation announces how it differs from step navigation');
        assert.match(await page.locator('.view-help').innerText(), /Next step continues the explanation/);
        const size = await page.locator('.stage').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
        const count = Number((await page.locator('.view-controls>span').innerText()).match(/of (\d+)/)![1]);
        assert.ok(count > 1);
        const evidence = targets.get(step)!;
        assert.ok(evidence.length > 0, `${step}: the fixture must contain the named evidence`);
        const seen = new Set<number>();
        for (let i = 0; i < count; i++) {
          assert.equal(await page.locator('.view-controls>span').innerText(), `View ${i + 1} of ${count}`);
          const zoom = await settledZoom(page);
          assert.ok(zoom, 'the view is zoomed');
          const visible = viewBox(zoom, size.w, size.h);
          for (const [j, box] of evidence.entries()) {
            // Include the full referenced label, not only its centre. The viewBox
            // serializer rounds by 0.001 SVG units (0.000001 scene units).
            const slack = 1e-6;
            if (box[0]! >= visible[0] - slack && box[2]! <= visible[2] + slack &&
                box[1]! >= visible[1] - slack && box[3]! <= visible[3] + slack) seen.add(j);
          }
          const control = page.getByRole('button', { name: 'Next view', exact: true });
          const rect = await control.boundingBox();
          assert.ok(rect && rect.height >= 44, 'touch target is at least 44 px tall');
          await control.focus();
          await page.keyboard.press('Enter');
          await settledZoom(page);
          assert.equal(new URL(page.url()).searchParams.get('step'), step, 'view navigation keeps the step');
        }
        assert.equal(seen.size, evidence.length, `${step}: every referenced label is reachable`);
      }
      await page.getByRole('button', { name: 'Whole picture', exact: true }).click();
      await settledZoom(page);
      assert.ok(await page.locator('.view-controls').isVisible());
      assert.ok(await page.getByRole('button', { name: 'Whole picture', exact: true }).isHidden(), 'Whole picture shows only while zoomed');
      assert.equal(zoomOf(await paintedView(page)), null);
    } finally { await context.close(); }
  }
});


test('the PKCE attack opens with the stolen-code, guessed-verifier and rejection arrows visible on a phone', options, async () => {
  const variant = projects.get('oauth-pkce')!.variants.find((v) => v.values.attacker === 'yes')!;
  const ids = ['message:S->X#0', 'message:X->S#0', 'message:S->X#1'];
  const boxes = await restingBox(variant.Scene, 'attack', (scene) => {
    const arrows = scene.familyMembers().filter((m) => ids.includes(m.key ?? ''));
    assert.equal(arrows.length, 3, 'all three narrative arrows must exist');
    return arrows;
  });
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    try {
      await page.goto(`${embed}/oauth-pkce.html?attacker=yes&step=attack`);
      await page.waitForSelector('[data-ready=true]');
      await quiet(page);
      const stageRect = await page.locator('.stage').boundingBox();
      const mapRect = await page.locator('.overview').boundingBox();
      assert.ok(stageRect);
      assert.equal(await page.locator('.overview').count(), 1);
      assert.ok(await page.locator('.overview').isHidden() || (mapRect && mapRect.y >= stageRect.y + stageRect.height), 'an absent or below-picture map leaves every attack arrow unobscured');
      const seen = await page.locator('.stage svg:not(.leaving)').evaluate((svg, b) => {
        const matrix = (svg as SVGSVGElement).getScreenCTM()!;
        const stage = svg.parentElement!.getBoundingClientRect();
        const a = new DOMPoint(b[0] * 1000, -b[3] * 1000).matrixTransform(matrix);
        const z = new DOMPoint(b[2] * 1000, -b[1] * 1000).matrixTransform(matrix);
        return { actual: [a.x, a.y, z.x, z.y], viewport: [stage.left, stage.top, stage.right, stage.bottom] };
      }, boxes);
      const [l, t, r, b] = seen.actual, [vl, vt, vr, vb] = seen.viewport;
      assert.ok(l! >= vl! - 1 && t! >= vt! - 1 && r! <= vr! + 1 && b! <= vb! + 1,
        `width ${width}: opening must contain the complete attack, not an unrelated card: ${JSON.stringify(seen)}`);
      assert.equal(await page.locator('[aria-current=step]').first().getAttribute('data-step'), 'attack');
    } finally { await page.close(); }
  }
});

test('source tours show the token-cap calculation and terminal rejection in every case', options, async () => {
  const {reviewClaims} = await import('../tools/lib/explain-review-scene.ts');
  const {storyFrames,reviewStoryVariant,inspectStoryFrame,covered,STORY_CLAIMS} = await import('../tools/lib/explain-story-review.ts');
  const roles = {
    'token-bucket': ['request:R9','arrival:R9','request:R10','arrival:R10','balance:refill:R10',
      'balance:found:R10','balance:spend:R10','balance:cap','balance:label','balance:value'],
    'state-machine': ['reducer:idle:CONNECT','reducer:connecting:OPENED','reducer:connecting:ERROR',
      'reducer:open:CLOSE','reducer:throw','reducer:throw-box','closed','session:ring:closed',
      'State','session:state','Event','session:event','Returns','session:returns'],
  };
  const page = await browser.newPage();
  let cases=0,stepWidths=0,labelChecks=0;
  try {
    for(const id of ['token-bucket','state-machine'] as const){
      const project = projects.get(id) ?? await collectProject(`scenes/explainers/${id}`,{write:false});
      assert.deepEqual(project.variants.map(v=>v.values),id==='token-bucket'?
        [{rate:'1'},{rate:'2'},{rate:'4'}]:[{events:'success'},{events:'failure'}]);
      if(!projects.has(id))await buildExplainer(project,join(folder,`${id}.html`));
      const sourceStep = id==='token-bucket'?'later':'terminal';
      const companion = await reviewClaims(project);
      assert.deepEqual(companion.filter(c=>c.step===sourceStep).flatMap(c=>c.targets.map(t=>'key' in t?t.key:t.text)),roles[id]);
      const claims = await reviewClaims(project,undefined,STORY_CLAIMS[id]);
      for(const variant of project.variants){
        let nativeChecked=false;
        await new variant.Scene({async frame(){},async stepEnd(scene,step){
          if(step.name!==sourceStep)return;
          const members=scene.familyMembers();
          const keyed=(key:string)=>{
            const found=members.filter(m=>m.key===key);
            assert.equal(found.length,1,`unique native role ${key}`);return found[0]!;
          };
          const text=(key:string,value:string)=>{
            const m=keyed(key);assert.ok(m instanceof Text);assert.equal(m.text,value);
          };
          if(id==='token-bucket'){
            const rate=variant.values.rate!, found={1:1,2:2,4:5}[rate as '1'|'2'|'4']!,
              after={1:0,2:1,4:4}[rate as '1'|'2'|'4']!;
            text('balance:cap','  tokens = min(5,');text('balance:label','Tokens left');
            text('balance:value',String(after));text('arrival:R9','t = 1');text('arrival:R10','t = 2');
            assert.deepEqual(keyed('request:R10').family().filter((m):m is Text=>m instanceof Text).map(m=>m.text),['R10','200']);
            const dot=keyed('balance:found:R10').center(),drop=keyed('balance:spend:R10').box()!;
            assert.ok(Math.abs(dot[0]+0.56)<1e-6&&Math.abs(dot[1]-(-3.87+found*4.44/5))<1e-6);
            assert.ok(Math.abs(drop[1]-(-3.87+after*4.44/5))<1e-6&&Math.abs(drop[3]-dot[1])<1e-6);
            assert.equal(scene.state.tokens,after);
          }else{
            for(const [key,value] of [
              ['idle:CONNECT',"  'idle:CONNECT':      'connecting',"],
              ['connecting:OPENED',"  'connecting:OPENED': 'open',"],
              ['connecting:ERROR',"  'connecting:ERROR':  'closed',"],
              ['open:CLOSE',"  'open:CLOSE':        'closed',"],
              ['throw','  if (!result) throw new InvalidTransition();'],
            ])text(`reducer:${key}`,value!);
            text('session:state','closed');text('session:event','OPENED');text('session:returns','InvalidTransition');
            const ring=keyed('session:ring:closed').box()!,closed=keyed('closed').box()!;
            assert.ok(ring[0]<=closed[0]&&ring[1]<=closed[1]&&ring[2]>=closed[2]&&ring[3]>=closed[3]);
            assert.equal(scene.state.session,'closed');assert.equal(scene.state.terminal,true);
          }
          nativeChecked=true;
        }},{skipUntil:Infinity}).run();
        assert.equal(nativeChecked,true);
        // Keep the production reviewer: every main and source step, both
        // widths, all reachable tour stops, plus the independent 320px openings.
        const rows=await reviewStoryVariant(page,`${embed}/${id}.html`,variant,claims);
        assert.deepEqual(rows.map(r=>[r.step,r.width]),[390,1180].flatMap(width=>variant.trace.steps.map(s=>[s.step,width])));
        for(const row of rows.filter(r=>r.step===sourceStep))assert.ok(roles[id].every(role=>row.targets.includes(role)));
        stepWidths+=rows.length;
        const frame=(await storyFrames(variant.Scene,claims)).get(sourceStep)!;
        const indices=new Set(frame.targets.filter(t=>roles[id].includes(t.name)).flatMap(t=>t.indices));
        const labels=frame.labels.filter(label=>label.indices.some(index=>indices.has(index)));
        assert.equal(labels.length,id==='token-bucket'?9:12,'exact caption-label inventory');
        const readable=new Set<number>();
        await page.setViewportSize({width:390,height:844});
        await page.goto(`${embed}/${id}.html?${new URLSearchParams({...variant.values,step:sourceStep})}`);
        await page.waitForFunction(step=>(window as unknown as {raynerReviewStep?:string}).raynerReviewStep===step&&
          !document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'),sourceStep);
        const visited=new Set<string>();
        for(let n=0;n<=frame.records.length;n++){
          const seen=await inspectStoryFrame(page,frame);
          assert.ok(seen.viewBox,'the served native SVG has a viewBox');
          if(visited.has(seen.viewBox))break;visited.add(seen.viewBox);
          for(const [i,label] of labels.entries()){
            const ink=label.indices.map(index=>seen.ink.find(p=>p.index===index)!);
            if(ink.every(p=>p.visible&&p.complete&&covered(p.box,[seen.viewport]))){
              const pixels=label.size*Math.min(...ink.map(p=>p.scale));
              assert.ok(pixels>=12-1e-6,`${id}/${JSON.stringify(variant.values)}: ${label.text} reads at ${pixels}px`);
              readable.add(i);
            }
          }
          const next=page.locator('.view-controls > button').first();
          if(!await next.isVisible()||!await next.isEnabled())break;
          await next.click();await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
        }
        assert.equal(readable.size,labels.length,'every named source label has a complete readable tour stop');
        labelChecks+=readable.size;cases++;
      }
    }
  }finally{await page.close();}
  assert.equal(cases,5);assert.equal(stepWidths,68);assert.equal(labelChecks,51);
});

test('both pen drawings retain every construction mark and its readable count through source tours', options, async () => {
  const {reviewClaims} = await import('../tools/lib/explain-review-scene.ts');
  const {storyFrames,reviewStoryVariant,inspectStoryFrame,covered,STORY_CLAIMS} = await import('../tools/lib/explain-story-review.ts');
  const project=await collectProject('scenes/explainers/pen-and-pencil',{write:false});
  assert.deepEqual(project.variants.map(v=>v.values),[{hand:'first'},{hand:'second'}]);
  assert.deepEqual(await reviewClaims(project),[{step:'marks',targets:[
    {key:'construction:marks',paint:'stroke'},{key:'construction:tally'},
  ]}]);
  await buildExplainer(project,join(folder,'pen-and-pencil.html'));
  const claims=await reviewClaims(project,undefined,STORY_CLAIMS['pen-and-pencil']);
  const page=await browser.newPage();
  let layout:number[][]|undefined,cases=0,stepWidths=0,readableCounts=0;
  try{
    for(const variant of project.variants){
      let strokes=0,wordBoxes=0;
      await new variant.Scene({async frame(){},async stepEnd(scene,step){
        if(step.name!=='marks')return;
        const members=scene.familyMembers(),marks=members.filter(m=>m.key==='construction:marks'),
          tallies=members.filter(m=>m.key==='construction:tally');
        assert.equal(marks.length,1);assert.equal(tallies.length,1);
        assert.deepEqual(scene.state.marks,{outlines:40,filled:13,words:8});
        assert.deepEqual(tallies[0]!.family().filter((m):m is Text=>m instanceof Text).map(m=>m.text),
          ['40 outlines · 13 filled shapes · 8 words']);
        // Each period has four plank sides, four event sides, a ring, string,
        // dot and two reserved word boxes. The final stroke traces the rail.
        const paths=marks[0]!.children;
        assert.equal(paths.length,53);
        const boxes=paths.map(m=>{
          assert.ok(m instanceof VMobject);assert.equal(m.subpaths.length,1);
          assert.equal(m.style.stroke,'#5b8fd0');assert.equal(m.style.strokeOpacity,0.85);
          assert.ok(m.style.strokeWidth>0);assert.equal(m.style.fill,'none');
          assert.equal(m.style.drawFraction??1,1);assert.ok(m.style.opacity>0.99);strokes++;return m.box()!;
        });
        const union=(bs:Box[]):Box=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),
          Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
        const centers:number[]=[];
        for(let period=0;period<4;period++){
          const first=period*13;
          for(const [side,word] of [[0,11],[4,12]]){
            const outer=union(boxes.slice(first+side!,first+side!+4)),inner=boxes[first+word!]!;
            assert.ok(inner[0]>=outer[0]&&inner[1]>=outer[1]&&inner[2]<=outer[2]&&inner[3]<=outer[3]);
            wordBoxes++;
          }
          const ring=boxes[first+8]!,dot=boxes[first+10]!;
          assert.ok(dot[0]>ring[0]&&dot[1]>ring[1]&&dot[2]<ring[2]&&dot[3]<ring[3]);
          centers.push((ring[0]+ring[2])/2);
        }
        assert.ok(centers.slice(1).every((x,i)=>x>centers[i]!));
        const rail=boxes[52]!;
        for(let period=0;period<4;period++){
          const ring=boxes[period*13+8]!;
          assert.ok(rail[0]<=ring[2]&&rail[2]>=ring[0]&&rail[1]<=ring[3]&&rail[3]>=ring[1],
            'the rail meets each laid-out marker ring');
        }
        const points=paths.map(m=>Array.from((m as VMobject).subpaths[0]!));
        if(layout)assert.deepEqual(points,layout,'changing the hand keeps all laid-out marks fixed');else layout=points;
      }},{skipUntil:Infinity}).run();
      assert.equal(strokes,53);assert.equal(wordBoxes,8);
      const rows=await reviewStoryVariant(page,`${embed}/pen-and-pencil.html`,variant,claims);
      assert.deepEqual(rows.map(r=>[r.step,r.width]),[390,1180].flatMap(width=>variant.trace.steps.map(s=>[s.step,width])));
      for(const row of rows.filter(r=>r.step==='marks'))
        assert.ok(row.targets.includes('construction:marks')&&row.targets.includes('construction:tally'));
      stepWidths+=rows.length;
      const frame=(await storyFrames(variant.Scene,claims)).get('marks')!,
        target=frame.targets.find(t=>t.name==='construction:marks')!,tally=frame.targets.find(t=>t.name==='construction:tally')!;
      assert.equal(target.indices.length,53,'all meaningful construction strokes must reach paint review');
      const labels=frame.labels.filter(l=>l.indices.some(i=>tally.indices.includes(i)));
      assert.equal(labels.length,1);
      await page.setViewportSize({width:390,height:844});
      await page.goto(`${embed}/pen-and-pencil.html?${new URLSearchParams({...variant.values,step:'marks'})}`);
      await page.waitForFunction(()=>(window as unknown as {raynerReviewStep?:string}).raynerReviewStep==='marks'&&
        !document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
      const visited=new Set<string>();let readable=false;
      for(let n=0;n<=frame.records.length;n++){
        const seen=await inspectStoryFrame(page,frame);assert.ok(seen.viewBox);
        if(visited.has(seen.viewBox))break;visited.add(seen.viewBox);
        const ink=labels[0]!.indices.map(i=>seen.ink.find(p=>p.index===i)!);
        if(ink.every(p=>p.visible&&p.complete&&covered(p.box,[seen.viewport]))){
          const pixels=labels[0]!.size*Math.min(...ink.map(p=>p.scale));
          assert.ok(pixels>=12-1e-6,`${variant.values.hand}: construction count reads at ${pixels}px`);readable=true;
        }
        const next=page.locator('.view-controls > button').first();
        if(!await next.isVisible()||!await next.isEnabled())break;
        await next.click();await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
      }
      assert.equal(readable,true);readableCounts++;cases++;
    }
  }finally{await page.close();}
  assert.equal(cases,2);assert.equal(stepWidths,32);assert.equal(readableCounts,2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { reviewSubjects, reviewScene } from '../../tools/lib/explain-review-scene.ts';
import { storyFrames } from '../../tools/lib/explain-story-review.ts';

const source = `import{Scene,Text,FadeIn}from'rayner';import{stage}from'rayner/explain';export default class Example extends Scene{static meta={id:'outside-author',title:'Outside author'};static settings=[{id:'case',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];async construct(){const s=stage(this,{heading:false});await this.step('one',{caption:'A visible answer.'});await this.play(new FadeIn(new Text('Answer',{color:s.look.ink})));}}`;
test('author-side claims reject unknown scenarios, steps, malformed targets and missing explicit files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-claims-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    assert.deepEqual(await reviewSubjects(project), []);
    await assert.rejects(reviewSubjects(project, claims), { code: 'ENOENT' });
    const valid = { step: 'one', opening: true, settings: { case: 'b' }, targets: [{ text: 'Answer' }] };
    await writeFile(claims, JSON.stringify({ version: 2, subjects: [valid] }));
    assert.deepEqual(await reviewSubjects(project), [valid]);
    for (const invalid of [{ ...valid, settings: { case: 'missing' } }, { ...valid, step: 'absent' }, { ...valid, targets: [] }, { ...valid, targets: [{ text: 'Answer', key: 'ambiguous' }] }, { ...valid, opening: 'yes' }]) {
      await writeFile(claims, JSON.stringify({ version: 2, subjects: [invalid] }));
      await assert.rejects(reviewSubjects(project));
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('an outside author reviews every served scenario and width; a false caption claim fails closed', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for the served-reader boundary' }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-author-review-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json'), output = join(folder, 'review');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    await writeFile(claims, JSON.stringify({ version: 2, subjects: [{ step: 'one', opening: true, targets: [{ text: 'Answer' }] }] }));
    const published = join(folder, 'public', 'answer.html');
    const result = await reviewScene(project, output, undefined, published);
    assert.equal(result.artifact, published);
    const { createHash } = await import('node:crypto');
    const artifact = await readFile(result.artifact);
    assert.equal(createHash('sha256').update(artifact).digest('hex'), result.artifactHash);
    assert.ok((await readFile(result.artifact + '.headers.json', 'utf8')).includes('Content-Security-Policy'));
    assert.ok((await readFile(join(folder, 'public', 'loader.js'), 'utf8')).length);
    assert.equal(result.scenarios, 2);
    assert.equal(result.stepWidths, 4);
    assert.deepEqual(result.results.map(c => c.steps.map(s => s.width)), [[390, 1180], [390, 1180]]);
    assert.deepEqual(result.consoleErrors, []);
    assert.deepEqual(result.runtimeConnections, []);
    await writeFile(claims, JSON.stringify({ version: 2, subjects: [{ step: 'one', targets: [{ text: 'Missing answer' }] }] }));
    await assert.rejects(reviewScene(project, output), /story target Missing answer is missing/);
    await assert.rejects(readFile(join(output, 'review.json')), { code: 'ENOENT' });
    assert.deepEqual(await readFile(published), artifact, 'a failed review preserves the last reviewed page');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('companion claims bind to actual scene ink', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-catalog-claims-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    const visible = { step: 'one', targets: [{ text: 'Answer' }] };
    const missing = { step: 'one', targets: [{ text: 'Missing subject' }] };
    await writeFile(claims, JSON.stringify({ version: 2, subjects: [missing] }));
    await assert.rejects(storyFrames(project.scenarios[0]!.Scene, await reviewSubjects(project)), /story target Missing subject is missing/);
    await writeFile(claims, JSON.stringify({ version: 2, subjects: [visible] }));
    await storyFrames(project.scenarios[0]!.Scene, await reviewSubjects(project));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('trust-proxy range comparisons retain all factual subjects and review every list request at both widths', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for range comparison tours' }, async () => {
  const { ROOT } = await import('../../tools/lib/explain-project.ts');
  const { buildExplainer } = await import('../../tools/lib/explain-build.ts');
  const { serve } = await import('../../tools/lib/explain-serve.ts');
  const { launch } = await import('../../tools/lib/browser.ts');
  const { reviewStoryScenario} = await import('../../tools/lib/explain-story-review.ts');
  const folder = await mkdtemp(join(tmpdir(), 'rayner-trust-ranges-'));
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const project = await collectProject(join(ROOT, 'scenes/explainers/trust-proxy'), { write: false });
    assert.equal(project.scenarios.length, 12);
    const claims = await reviewSubjects(project);
    await buildExplainer(project, join(folder, 'scene.html'));
    server = await serve(folder, 0, 'scene.html');
    browser = await launch();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [index, scenario] of project.scenarios.entries()) {
      const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([key, value]) => scenario.values[key] === value));
      const frames = await storyFrames(scenario.Scene, applicable);
      assert.ok(frames.get('ranges'));
      if (scenario.values.trust !== 'list') continue;
      const output = join(folder, String(index));
      const { mkdir } = await import('node:fs/promises');
      await mkdir(output);
      const reviews = await reviewStoryScenario(page, server.url + '/scene.html', scenario, claims, output);
      assert.deepEqual(reviews.filter(r => r.step === 'ranges').map(r => r.width), [390, 1180]);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server?.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('trust-proxy range subjects contain both settings and all six independently pinned answers in every scenario', async () => {
  const { ROOT } = await import('../../tools/lib/explain-project.ts');

  const { Text } = await import('../../src/index.ts');
  const project = await collectProject(join(ROOT, 'scenes/explainers/trust-proxy'), { write: false });
  const claims = await reviewSubjects(project);
  // The twelve Express answers are independently pinned in explain-trust-proxy.test.ts.
  // Keep literal card expectations here: two renderers sharing TABLE cannot prove these facts.
  const answers: Record<string, string[]> = {
    true: ['203.0.113.7 right', '1.2.3.4 wrong', '1.2.3.4 wrong'],
    '1': ['192.0.2.10 wrong', '192.0.2.10 wrong', '198.51.100.9 right'],
    '2': ['203.0.113.7 right', '198.51.100.9 right', '1.2.3.4 wrong'],
    list: ['203.0.113.7 right', '198.51.100.9 right', '198.51.100.9 right'],
  };
  const titles: Record<string, string> = { true: 'trust proxy true', '1': 'trust proxy 1', '2': 'trust proxy 2', list: "trust proxy '10.0.0.0/8, 192.0.2.0/24'" };
  for (const scenario of project.scenarios) {
    const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([key, value]) => scenario.values[key] === value));
    const targets = (await storyFrames(scenario.Scene, applicable)).get('ranges')!.targets.map(t => t.name);
    for (const key of ['ranges-current', 'ranges-alternative', 'service:edge', 'service:balancer']) assert.ok(targets.includes(key));
    let checked = false;
    await new scenario.Scene({ skipUntil: Infinity, async frame() {}, async stepEnd(scene, step) {
      if (step.name !== 'ranges') return;
      checked = true;
      for (const [key, setting] of [['ranges-current', scenario.values.trust], ['ranges-alternative', scenario.values.trust === 'list' ? '2' : 'list']]) {
        const card = scene.familyMembers().find(m => m.key === key)!;
        assert.ok(card, key);
        const texts = card.family().filter((m): m is InstanceType<typeof Text> => m instanceof Text).map(m => m.text.replace(/\s+/g, ' '));
        assert.ok(texts.includes(titles[setting!]!), `${key} setting: ${texts.join('; ')}`);
        for (const answer of answers[setting!]!) assert.ok(texts.includes(answer), `${key}: ${answer}`);
      }
    } }).run();
    assert.ok(checked);
  }
});


test('dictionary review retains six claim sets and checks four main openings plus two reference steps', async () => {
  const {ROOT} = await import('../../tools/lib/explain-project.ts');
  const {narrowOpeningPlan} = await import('../../tools/lib/explain-story-review.ts');
  const project = await collectProject(join(ROOT, 'scenes/explainers/python-dict'), {write: false});
  const claims = await reviewSubjects(project);
  assert.equal(claims.length, 6);
  for (const scenario of project.scenarios) {
    const openings = await narrowOpeningPlan(scenario, claims);
    assert.deepEqual(openings.filter(o => o.reviewed).map(o => o.step),
      ['question', 'broken', 'marker', 'missing']);
    assert.deepEqual(openings.filter(o => !o.reviewed).map(o => [o.step, o.reason]),
      [['hash', 'detail-step'], ['collision', 'detail-step']]);
  }
});

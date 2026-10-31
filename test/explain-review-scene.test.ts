import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectProject } from '../tools/lib/explain-project.ts';
import { reviewClaims, reviewScene } from '../tools/lib/explain-review-scene.ts';
import { storyFrames } from '../tools/lib/explain-story-review.ts';

const source = `import{Scene,Text,FadeIn}from'rayner';import{stage}from'rayner/explain';export default class Example extends Scene{static meta={id:'outside-author',title:'Outside author'};static settings=[{id:'case',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];async construct(){const s=stage(this,{heading:false});await this.step('one',{caption:'A visible answer.'});await this.play(new FadeIn(new Text('Answer',{color:s.palette.ink})));}}`;
test('author-side claims reject unknown cases, steps, malformed targets and missing explicit files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-claims-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    assert.deepEqual(await reviewClaims(project), []);
    await assert.rejects(reviewClaims(project, claims), { code: 'ENOENT' });
    const valid = { step: 'one', opening: true, settings: { case: 'b' }, targets: [{ text: 'Answer' }] };
    await writeFile(claims, JSON.stringify({ version: 1, claims: [valid] }));
    assert.deepEqual(await reviewClaims(project), [valid]);
    for (const invalid of [{ ...valid, settings: { case: 'missing' } }, { ...valid, step: 'absent' }, { ...valid, targets: [] }, { ...valid, targets: [{ text: 'Answer', key: 'ambiguous' }] }, { ...valid, opening: 'yes' }]) {
      await writeFile(claims, JSON.stringify({ version: 1, claims: [invalid] }));
      await assert.rejects(reviewClaims(project));
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('an outside author reviews every served case and width; a false caption claim fails closed', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for the served-reader boundary' }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-author-review-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json'), output = join(folder, 'review');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    await writeFile(claims, JSON.stringify({ version: 1, claims: [{ step: 'one', opening: true, targets: [{ text: 'Answer' }] }] }));
    const published = join(folder, 'public', 'answer.html');
    const result = await reviewScene(project, output, undefined, published);
    assert.equal(result.artifact, published);
    const { createHash } = await import('node:crypto');
    const artifact = await readFile(result.artifact);
    assert.equal(createHash('sha256').update(artifact).digest('hex'), result.artifactHash);
    assert.ok((await readFile(result.artifact + '.headers.json', 'utf8')).includes('Content-Security-Policy'));
    assert.ok((await readFile(join(folder, 'public', 'loader.js'), 'utf8')).length);
    assert.equal(result.cases, 2);
    assert.equal(result.stepWidths, 4);
    assert.deepEqual(result.results.map(c => c.steps.map(s => s.width)), [[390, 1180], [390, 1180]]);
    assert.deepEqual(result.consoleErrors, []);
    assert.deepEqual(result.runtimeConnections, []);
    await writeFile(claims, JSON.stringify({ version: 1, claims: [{ step: 'one', targets: [{ text: 'Missing answer' }] }] }));
    await assert.rejects(reviewScene(project, output), /story target Missing answer is missing/);
    await assert.rejects(readFile(join(output, 'review.json')), { code: 'ENOENT' });
    assert.deepEqual(await readFile(published), artifact, 'a failed review preserves the last reviewed page');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('catalog subjects and companion claims both bind to actual scene ink', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-catalog-claims-'));
  try {
    const file = join(folder, 'scene.ts'), claims = join(folder, 'scene.review.json');
    await writeFile(file, source);
    const project = await collectProject(file, { write: false });
    const visible = { step: 'one', targets: [{ text: 'Answer' }] };
    const missing = { step: 'one', targets: [{ text: 'Missing subject' }] };
    await writeFile(claims, JSON.stringify({ version: 1, claims: [missing] }));
    await assert.rejects(storyFrames(project.variants[0]!.Scene, await reviewClaims(project, undefined, [visible])), /story target Missing subject is missing/);
    await writeFile(claims, JSON.stringify({ version: 1, claims: [visible] }));
    await assert.rejects(storyFrames(project.variants[0]!.Scene, await reviewClaims(project, undefined, [missing])), /story target Missing subject is missing/);
    await storyFrames(project.variants[0]!.Scene, await reviewClaims(project, undefined, [visible]));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('trust-proxy range comparisons retain all factual subjects and review every list request at both widths', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for range comparison tours' }, async () => {
  const { ROOT } = await import('../tools/lib/explain-project.ts');
  const { buildExplainer } = await import('../tools/lib/explain-build.ts');
  const { serve } = await import('../tools/lib/explain-serve.ts');
  const { launch } = await import('../tools/lib/browser.ts');
  const { reviewStoryVariant, STORY_CLAIMS } = await import('../tools/lib/explain-story-review.ts');
  const folder = await mkdtemp(join(tmpdir(), 'rayner-trust-ranges-'));
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const project = await collectProject(join(ROOT, 'scenes/explainers/trust-proxy'), { write: false });
    assert.equal(project.variants.length, 12);
    const claims = await reviewClaims(project, undefined, STORY_CLAIMS['trust-proxy']);
    await buildExplainer(project, join(folder, 'scene.html'));
    server = await serve(folder, 0, 'scene.html');
    browser = await launch();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [index, variant] of project.variants.entries()) {
      const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([key, value]) => variant.values[key] === value));
      const frames = await storyFrames(variant.Scene, applicable);
      assert.ok(frames.get('ranges'));
      if (variant.values.trust !== 'list') continue;
      const output = join(folder, String(index));
      const { mkdir } = await import('node:fs/promises');
      await mkdir(output);
      const reviews = await reviewStoryVariant(page, server.url + '/scene.html', variant, claims, output);
      assert.deepEqual(reviews.filter(r => r.step === 'ranges').map(r => r.width), [390, 1180]);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server?.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('trust-proxy range subjects contain both settings and all six independently pinned answers in every case', async () => {
  const { ROOT } = await import('../tools/lib/explain-project.ts');
  const { STORY_CLAIMS } = await import('../tools/lib/explain-story-review.ts');
  const { Text } = await import('../src/index.ts');
  const project = await collectProject(join(ROOT, 'scenes/explainers/trust-proxy'), { write: false });
  const claims = await reviewClaims(project, undefined, STORY_CLAIMS['trust-proxy']);
  // The twelve Express answers are independently pinned in explain-trust-proxy.test.ts.
  // Keep literal card expectations here: two renderers sharing TABLE cannot prove these facts.
  const answers: Record<string, string[]> = {
    true: ['203.0.113.7 right', '1.2.3.4 wrong', '1.2.3.4 wrong'],
    '1': ['192.0.2.10 wrong', '192.0.2.10 wrong', '198.51.100.9 right'],
    '2': ['203.0.113.7 right', '198.51.100.9 right', '1.2.3.4 wrong'],
    list: ['203.0.113.7 right', '198.51.100.9 right', '198.51.100.9 right'],
  };
  const titles: Record<string, string> = { true: 'trust proxy true', '1': 'trust proxy 1', '2': 'trust proxy 2', list: "trust proxy '10.0.0.0/8, 192.0.2.0/24'" };
  for (const variant of project.variants) {
    const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([key, value]) => variant.values[key] === value));
    const targets = (await storyFrames(variant.Scene, applicable)).get('ranges')!.targets.map(t => t.name);
    for (const key of ['ranges-current', 'ranges-alternative', 'service:edge', 'service:balancer']) assert.ok(targets.includes(key));
    let checked = false;
    await new variant.Scene({ async frame() {}, async stepEnd(scene, step) {
      if (step.name !== 'ranges') return;
      checked = true;
      for (const [key, setting] of [['ranges-current', variant.values.trust], ['ranges-alternative', variant.values.trust === 'list' ? '2' : 'list']]) {
        const card = scene.familyMembers().find(m => m.key === key)!;
        assert.ok(card, key);
        const texts = card.family().filter((m): m is InstanceType<typeof Text> => m instanceof Text).map(m => m.text.replace(/\s+/g, ' '));
        assert.ok(texts.includes(titles[setting!]!), `${key} setting: ${texts.join('; ')}`);
        for (const answer of answers[setting!]!) assert.ok(texts.includes(answer), `${key}: ${answer}`);
      }
    } }, { skipUntil: Infinity }).run();
    assert.ok(checked);
  }
});

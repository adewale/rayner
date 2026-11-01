import { buildInputs } from '../tools/lib/build-inputs.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fc, params } from './lib/pbt.ts';
import { reviewScope, reviewCases, mergeStoryReviews, reviewCodeHash, readStoryPlan } from '../tools/lib/explain-review-plan.ts';
import type { PlannedCase, ReviewReceipt } from '../tools/lib/explain-review-plan.ts';

test('story shard arguments accept complete integer scopes and reject malformed selections', () => {
  assert.deepEqual(reviewScope([]), { part: 1, total: 1 });
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100 }), fc.nat(100), (total, n) => {
      const part = (n % total) + 1;
      assert.deepEqual(reviewScope(['--shard', `${part}/${total}`]), { part, total });
    }),
    params(100),
  );
  for (const arg of ['0/3', '4/3', '1/0', '-1/3', '1.5/3', '1/3x', '1/9007199254740992', '1/3/4', ' 1/3'])
    assert.throws(() => reviewScope(['--shard', arg]), /usage|invalid/);
  assert.throws(() => reviewScope(['--unknown', '1/3']), /usage/);
  assert.throws(() => reviewScope(['--shard', '1/3', 'extra']), /usage/);
});
const narrowObligations = (steps: string[]) => steps.map(step => ({step, reviewed: true as const, targets: ['visible subject'], labels: ['Subject label']}));
function receipts(expected: PlannedCase[], total: number): ReviewReceipt[] {
  const parts: ReviewReceipt[] = Array.from({ length: total }, (_, i) => ({
    scope: { part: i + 1, total },
    collectionChecks: i === 0,
    catalogHash: 'catalog',
    reviewCodeHash: 'code',
    cases: 0,
    stepWidths: 0,
    results: [],
    consoleErrors: [],
    runtimeConnections: [],
  }));
  for (const p of parts) for (const c of reviewCases(expected, p.scope)) {
    p.results.push({
      scene: c.scene,
      settings: c.settings,
      steps: [390, 1180].flatMap((width) =>
        c.steps.map((step) => ({ step, width, views: 1, targets: ['visible subject'],
          ...(width === 390 ? {openingAt320: {reviewed: true as const, width: 320 as const, height: 568 as const,
            targets: ['visible subject'], labels: ['Subject label'], minimumLabelPx: 14}} : {}),
        })),
      ),
    });
  }
  for (const p of parts) {
    p.cases = p.results.length;
    p.stepWidths = p.results.reduce((n, c) => n + c.steps.length, 0);
  }
  return parts;
}
test('merging story shards preserves every case, final step and width across generated inventories', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 5, maxLength: 20 }),
      fc.integer({ min: 1, max: 5 }),
      (counts, total) => {
        const expected = counts.map((n, i) => {
          const steps = Array.from({ length: n }, (_, j) => `step-${j}`);
          return {scene: `scene-${i}`, settings: {case: String(i)}, steps, narrowOpenings: narrowObligations(steps)};
        });
        const merged = mergeStoryReviews(receipts(expected, total).reverse(), expected, 'catalog', 'code');
        assert.deepEqual(
          merged.results.map((c) => [c.scene, c.settings]),
          expected.map((c) => [c.scene, c.settings]),
        );
        assert.equal(merged.cases, counts.length);
        assert.equal(merged.stepWidths, 2 * counts.reduce((a, b) => a + b, 0));
      },
    ),
    params(300),
  );
});
test('a passing story result requires all matching shards with complete nonempty subject inventories', () => {
  const expected = Array.from({ length: 6 }, (_, i) => ({
    scene: `scene-${i}`,
    settings: { case: String(i) },
    steps: ['first', 'final'],
    narrowOpenings: narrowObligations(['first', 'final']),
  }));
  const empty = [{ scene: 'empty', settings: {}, steps: [], narrowOpenings: [] }];
  assert.throws(() => mergeStoryReviews(receipts(empty, 1), empty, 'catalog', 'code'), /at least one step/);
  const good = receipts(expected, 3);
  assert.equal(mergeStoryReviews(good, expected, 'catalog', 'code').stepWidths, 24);
  const defects: Record<string, (p: ReviewReceipt[]) => void> = {
    'missing shared checks': p => { p[0]!.collectionChecks = false; },
    'duplicate shared checks': p => { p[1]!.collectionChecks = true; },
    'missing shard': (p) => {
      p.pop();
    },
    'duplicate shard': (p) => {
      p[1] = p[0]!;
    },
    'missing case': (p) => {
      p[0]!.results.pop();
    },
    'duplicate case': (p) => {
      p[0]!.results[1] = p[0]!.results[0]!;
    },
    'missing final step': (p) => {
      p[0]!.results[0]!.steps.pop();
    },
    'missing desktop': (p) => {
      p[0]!.results[0]!.steps[2]!.width = 390;
    },
    'no subject': (p) => {
      p[0]!.results[0]!.steps[0]!.targets = [];
    },
    'missing narrow opening': (p) => {
      delete p[0]!.results[0]!.steps[0]!.openingAt320;
    },
    'narrow subject absent': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: [], labels: ['Subject label'], minimumLabelPx: 14};
    },
    'narrow labels too small': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: ['visible subject'], labels: ['Subject label'], minimumLabelPx: 11.9};
    },
    'false missing-claim exclusion': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: false, reason: 'no-opening-claim'};
    },
    'false detail exclusion': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: false, reason: 'detail-step'};
    },
    'null narrow font minimum': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: ['visible subject'], labels: ['Subject label'], minimumLabelPx: null};
    },
    'missing narrow label': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: ['visible subject'], labels: [], minimumLabelPx: 14};
    },
    'missing narrow font minimum': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: ['visible subject'], labels: ['Subject label']} as never;
    },
    'duplicate narrow receipt': (p) => {
      p[0]!.results[0]!.steps[2]!.openingAt320 = {reviewed: false, reason: 'detail-step'};
    },
    'invalid narrow exclusion': (p) => {
      p[0]!.results[0]!.steps[0]!.openingAt320 = {reviewed: false, reason: 'unknown'} as never;
    },
    'stale catalog': (p) => {
      p[0]!.catalogHash = 'old';
    },
    'stale reviewer': (p) => {
      p[0]!.reviewCodeHash = 'old';
    },
    'console error': (p) => {
      p[0]!.consoleErrors.push('broken');
    },
    'external connection': (p) => {
      p[0]!.runtimeConnections.push('remote');
    },
  };
  for (const [name, defect] of Object.entries(defects)) {
    const parts = structuredClone(good);
    defect(parts);
    assert.throws(() => mergeStoryReviews(parts, expected, 'catalog', 'code'), {code:'ERR_ASSERTION'}, name);
  }
});

test('story receipts expire when caption claims, served runtime or review dependencies change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rayner-review-fingerprint-'));
  try {
    for (const directory of ['src', 'explain', 'integrations', 'app', 'tools', 'vendor'])
      await mkdir(join(root, directory), {recursive: true});
    const runtimeFiles = [
      'app/embed-style.ts', 'app/embed.css', 'app/embed.ts',
      'explain/stage.ts', 'explain/settings.ts',
      'tools/lib/explain-build.ts', 'tools/lib/explain-project.ts',
    ];
    for (const file of [
      'package.json', 'LICENSE', ...runtimeFiles,
      'tools/explain-review.ts', 'tools/explain-review-merge.ts',
      'tools/lib/explain-story-review.ts', 'tools/lib/explain-raster.ts', 'tools/lib/explain-review-scene.ts',
      'tools/lib/explain-review-plan.ts', 'tools/lib/explain-serve.ts', 'tools/lib/explain-reader-shell.ts', 'tools/lib/explain-check.ts',
    ]) {
      await mkdir(dirname(join(root, file)), {recursive: true});
      await copyFile(new URL('../' + file, import.meta.url), join(root, file));
    }
    const withoutClaims = await reviewCodeHash(root);
    const claimsFile = join(root, 'scenes/explainers/example/scene.review.json');
    const original = JSON.stringify({version: 1, claims: [{step: 'first', targets: [{text: 'Visible subject'}]}]});
    await mkdir(dirname(claimsFile), {recursive: true});
    await writeFile(claimsFile, original);
    const current = await reviewCodeHash(root);
    assert.notEqual(current, withoutClaims, 'adding companion expectations must invalidate previous review');
    const expected = Array.from({length: 3}, (_, i) => ({scene: `scene-${i}`, settings: {}, steps: ['first', 'final'], narrowOpenings: narrowObligations(['first', 'final'])}));
    const old = receipts(expected, 3);
    for (const part of old) part.reviewCodeHash = current;
    const merge = async () => mergeStoryReviews(old, expected, 'catalog', await reviewCodeHash(root));
    assert.equal((await merge()).cases, 3, 'unchanged claims and implementation retain valid receipts');
    await writeFile(claimsFile, original.replace('Visible subject', 'A newly required subject'));
    await assert.rejects(merge(), /stale review implementation/, 'an edited expectation cannot reuse an old passing receipt');
    await writeFile(claimsFile, original);
    assert.equal(await reviewCodeHash(root), current);
    const added = join(root, 'scenes/explainers/second/scene.review.json');
    await mkdir(dirname(added), {recursive: true});
    await writeFile(added, original);
    await assert.rejects(merge(), /stale review implementation/, 'identical bytes at a new companion path also add expectations');
    await unlink(added);
    assert.equal(await reviewCodeHash(root), current);
    await unlink(claimsFile);
    await assert.rejects(merge(), /stale review implementation/, 'deleted expectations cannot reuse old receipts');
    await writeFile(claimsFile, original);
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs/notes.md'), 'Unrelated documentation changes.');
    assert.equal(await reviewCodeHash(root), current, 'unrelated prose does not invalidate paint review');
    for (const file of runtimeFiles) {
      const path = join(root, file), bytes = await readFile(path);
      await writeFile(path, Buffer.concat([bytes, Buffer.from('\n/* changed served artifact */\n')]));
      await assert.rejects(merge(), /stale review implementation/, `${file} cannot reuse prior served receipts`);
      await writeFile(path, bytes);
      assert.equal(await reviewCodeHash(root), current, `${file}: restoring the inputs restores the fingerprint`);
    }
    const newHelper = join(root, 'app/new-player-helper.ts');
    await writeFile(newHelper, 'export const changedPlayer = true;\n');
    await assert.rejects(merge(), /stale review implementation/, 'new player helpers join the fingerprint automatically');
    await unlink(newHelper);
    assert.equal(await reviewCodeHash(root), current);
    const renderingHash = (await buildInputs(root)).hash;
    const reviewer = join(root, 'tools/lib/explain-story-review.ts'), reviewerBytes = await readFile(reviewer);
    await writeFile(reviewer, Buffer.concat([reviewerBytes, Buffer.from('\n// changed reviewer only\n')]));
    assert.equal((await buildInputs(root)).hash, renderingHash, 'reviewer changes reuse unchanged built pages');
    await assert.rejects(merge(), /stale review implementation/, 'reviewer changes still require new review');
    await writeFile(reviewer, reviewerBytes);
    const loader = join(root, 'tools/lib/explain-review-scene.ts');
    const loaderBytes = await readFile(loader);
    await writeFile(loader, Buffer.concat([loaderBytes, Buffer.from('\n// changed claim loading\n')]));
    await assert.rejects(merge(), /stale review implementation/, 'the claim loader remains part of the fingerprint');
    await writeFile(loader, loaderBytes);
    const raster = join(root, 'tools/lib/explain-raster.ts');
    const rasterBytes = await readFile(raster);
    await writeFile(raster, Buffer.concat([rasterBytes, Buffer.from('\n// changed native rasterization\n')]));
    await assert.rejects(merge(), /stale review implementation/, 'native composite evidence depends on the rasterizer');
    await writeFile(raster, rasterBytes);
    assert.equal((await merge()).cases, 3);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('the built catalog supplies exact narrow-opening obligations; receipts cannot invent exclusions or omit wordless results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rayner-narrow-plan-'));
  try {
    await mkdir(join(root, 'example'));
    const narrowOpenings = [
      {step: 'picture', reviewed: true as const, targets: ['shape'], labels: []},
      {step: 'details', reviewed: false as const, reason: 'detail-step' as const},
    ];
    const scene = {id: 'example', cases: [{}], narrowOpenings: [{settings: {}, steps: narrowOpenings}]};
    const writeCatalog = (s: unknown) => writeFile(join(root, 'evidence.json'), JSON.stringify({scenes: [s]}));
    await writeFile(join(root, 'example/describe.json'), JSON.stringify({cases: [{values: {}, steps: [{step: 'picture'}, {step: 'details'}]}]}));
    await writeCatalog(scene);
    await assert.rejects(readStoryPlan(root, ['fixture', 'missing']), /complete source scene inventory/);
    const plan = await readStoryPlan(root);
    assert.deepEqual(plan.cases, [{scene: 'example', settings: {}, steps: ['picture', 'details'], narrowOpenings}]);
    const parts = receipts(plan.cases, 1);
    const rows = parts[0]!.results[0]!.steps;
    rows[0]!.openingAt320 = {reviewed: true, width: 320, height: 568, targets: ['shape'], labels: [], minimumLabelPx: null};
    rows[1]!.openingAt320 = {reviewed: false, reason: 'detail-step'};
    assert.equal(mergeStoryReviews(parts, plan.cases, 'catalog', 'code').cases, 1);
    rows[1]!.openingAt320 = {reviewed: false, reason: 'no-opening-claim'};
    assert.throws(() => mergeStoryReviews(parts, plan.cases, 'catalog', 'code'), /exclusion changed/);
    const broken = structuredClone(scene);
    broken.narrowOpenings[0]!.steps.pop();
    await writeCatalog(broken);
    await assert.rejects(readStoryPlan(root), /exact narrow-opening step inventory/);
    const {narrowOpenings: removed, ...oldCatalog} = scene;
    await writeCatalog(oldCatalog);
    await assert.rejects(readStoryPlan(root), /without a narrow-opening inventory/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('scene sharding preserves all cases once and keeps a scene on one owner', () => {
  fc.assert(fc.property(fc.array(fc.array(fc.integer({min: 1, max: 10}), {minLength: 1, maxLength: 5}), {minLength: 3, maxLength: 16}), fc.integer({min: 1, max: 5}), (scenes, total) => {
    const cases = scenes.flatMap((counts, i) => counts.map((count, j) => {
      const steps = Array.from({length: count}, (_, k) => `step-${k}`);
      return {scene: `scene-${i}`, settings: {case: String(j)}, steps, narrowOpenings: narrowObligations(steps)};
    }));
    const before = structuredClone(cases);
    const parts = Array.from({length: total}, (_, i) => reviewCases(cases, {part: i + 1, total}));
    assert.equal(parts.flat().length, cases.length);
    assert.deepEqual(new Set(parts.flat()), new Set(cases));
    for (const scene of new Set(cases.map(c => c.scene)))
      assert.equal(parts.filter(part => part.some(c => c.scene === scene)).length, 1);
    assert.deepEqual(cases, before);
    const cost = (items: PlannedCase[]) => items.reduce((sum, c) => sum + c.steps.length * 3, 0);
    const loads = parts.map(cost), heaviest = Math.max(...scenes.map((_, i) => cost(cases.filter(c => c.scene === `scene-${i}`))));
    assert.ok(Math.max(...loads) - Math.min(...loads) <= heaviest);
  }), params(100));
  const cases = ['a', 'b', 'c', 'a'].map(scene => ({scene, settings: {}, steps: ['first'], narrowOpenings: narrowObligations(['first'])}));
  assert.deepEqual(reviewCases(cases, {part: 1, total: 2}).map(c => c.scene), ['a', 'a']);
  assert.deepEqual(reviewCases(cases, {part: 2, total: 2}).map(c => c.scene), ['b', 'c']);
});

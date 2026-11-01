import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { buildInputs } from './build-inputs.ts';

export interface ReviewScope {
  part: number;
  total: number;
}
export interface PlannedCase {
  scene: string;
  settings: Record<string, string>;
  steps: string[];
  narrowOpenings: NarrowOpeningObligation[];
}
export interface ReviewedCase {
  scene: string;
  settings: Record<string, string>;
  steps: { step: string; width: number; views: number; targets: string[]; openingAt320?: NarrowOpeningReview }[];
}
export type NarrowOpeningObligation =
  | { step: string; reviewed: true; targets: string[]; labels: string[] }
  | { step: string; reviewed: false; reason: 'detail-step' | 'no-opening-claim' };
export type NarrowOpeningReview =
  | { reviewed: true; width: 320; height: 568; targets: string[]; labels: string[]; minimumLabelPx: number | null }
  | { reviewed: false; reason: 'detail-step' | 'no-opening-claim' };
function validateNarrowObligations(obligations: NarrowOpeningObligation[], steps: string[], scene: string) {
  assert.ok(Array.isArray(obligations), `${scene}: missing built narrow-opening obligations`);
  assert.deepEqual(
    obligations.map((o) => o.step),
    steps,
    `${scene}: exact narrow-opening step inventory`,
  );
  for (const obligation of obligations) {
    assert.equal(typeof obligation.reviewed, 'boolean', `${scene}: invalid narrow-opening obligation`);
    if (obligation.reviewed) {
      assert.ok(
        Array.isArray(obligation.targets) &&
          obligation.targets.length &&
          obligation.targets.every((t) => typeof t === 'string' && t.trim()),
        `${scene}: invalid narrow-opening subjects`,
      );
      assert.ok(
        Array.isArray(obligation.labels) && obligation.labels.every((t) => typeof t === 'string' && t.trim()),
        `${scene}: invalid narrow-opening labels`,
      );
    } else {
      assert.ok(
        obligation.reason === 'detail-step' || obligation.reason === 'no-opening-claim',
        `${scene}: invalid narrow-opening exclusion`,
      );
    }
  }
}
export interface ReviewReceipt {
  scope: ReviewScope;
  collectionChecks: boolean;
  catalogHash: string;
  reviewCodeHash: string;
  cases: number;
  stepWidths: number;
  results: ReviewedCase[];
  consoleErrors: string[];
  runtimeConnections: string[];
}
export function reviewScope(args: readonly string[]): ReviewScope {
  if (!args.length) return { part: 1, total: 1 };
  const match = args.length === 2 && args[0] === '--shard' && /^([1-9]\d*)\/([1-9]\d*)$/.exec(args[1]!);
  assert.ok(match, 'usage: demos:review [--shard part/total]');
  const part = Number(match[1]),
    total = Number(match[2]);
  assert.ok(Number.isSafeInteger(part) && Number.isSafeInteger(total) && part <= total, 'invalid story shard');
  return { part, total };
}
/** Assign each whole scene once, balancing its independently built step inventory. */
export function reviewCases(cases: PlannedCase[], scope: ReviewScope): PlannedCase[] {
  const weights = new Map<string, number>();
  for (const c of cases) weights.set(c.scene, (weights.get(c.scene) ?? 0) +
    Math.max(1, c.steps.length * 2 + c.narrowOpenings.filter(o => o.reviewed).length));
  const loads = Array<number>(scope.total).fill(0), owners = new Map<string, number>();
  for (const [scene, weight] of [...weights].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const part = loads.indexOf(Math.min(...loads));
    owners.set(scene, part + 1);
    loads[part]! += weight;
  }
  return cases.filter(c => owners.get(c.scene) === scope.part);
}
export async function readStoryPlan(directory: string, expectedScenes?: readonly string[]) {
  const raw = await readFile(join(directory, 'evidence.json'), 'utf8');
  const catalog = JSON.parse(raw) as {
    scenes: {
      id: string;
      cases: Record<string, string>[];
      narrowOpenings: { settings: Record<string, string>; steps: NarrowOpeningObligation[] }[];
    }[];
  };
  const cases: PlannedCase[] = [];
  if (expectedScenes) assert.deepEqual(catalog.scenes.map(scene => scene.id), expectedScenes, 'complete source scene inventory');
  for (const scene of catalog.scenes) {
    const description = JSON.parse(await readFile(join(directory, scene.id, 'describe.json'), 'utf8')) as {
      cases: { values: Record<string, string>; steps: { step: string }[] }[];
    };
    assert.deepEqual(
      description.cases.map((c) => c.values),
      scene.cases,
      `${scene.id}: description/case inventory differs`,
    );
    assert.ok(Array.isArray(scene.narrowOpenings), `${scene.id}: rebuild catalog without a narrow-opening inventory`);
    assert.deepEqual(
      scene.narrowOpenings.map((c) => c.settings),
      scene.cases,
      `${scene.id}: exact narrow-opening case inventory`,
    );
    for (const [index, c] of description.cases.entries())
      validateNarrowObligations(
        scene.narrowOpenings[index]!.steps,
        c.steps.map((s) => s.step),
        scene.id,
      );
    cases.push(
      ...description.cases.map((c, index) => ({
        scene: scene.id,
        settings: c.values,
        steps: c.steps.map((s) => s.step),
        narrowOpenings: scene.narrowOpenings[index]!.steps,
      })),
    );
  }
  return { scenes: catalog.scenes.map(scene => scene.id), cases, catalogHash: createHash('sha256').update(raw).digest('hex') };
}
export async function reviewCodeHash(root: string, buildHash?: string) {
  const files = [
    'tools/explain-review.ts',
    'tools/explain-review-merge.ts',
    'tools/lib/explain-story-review.ts',
    'tools/lib/explain-raster.ts',
    'tools/lib/explain-review-scene.ts',
    'tools/lib/explain-review-plan.ts',
    'tools/lib/explain-serve.ts',
    'tools/lib/explain-reader-shell.ts',
    'tools/lib/explain-check.ts',
  ];
  if (import.meta.url.endsWith('.js')) {
    // Installed tools are bundled; individual source module paths do not exist.
    files.length = 0;
    for (const entry of await readdir(join(root, 'dist/tools'), { recursive: true, withFileTypes: true }))
      if (entry.isFile()) files.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  // Companion claims are review inputs even though they do not change the
  // runtime scene or catalog evidence. Old shards must not vouch for new claims.
  const sceneRoot = join(root, 'scenes/explainers');
  const entries = await readdir(sceneRoot, { recursive: true, withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  for (const entry of entries)
    if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.review.json'))
      files.push('scenes/explainers/' + relative(sceneRoot, join(entry.parentPath, entry.name)).split(sep).join('/'));
  const inputs = await Promise.all(
    files.sort().map(async (file) => ({
      file,
      sha256: createHash('sha256')
        .update(await readFile(join(root, file)))
        .digest('hex'),
    })),
  );
  // The caption inventory does not change for player-only edits. Bind the same
  // complete runtime/build inputs as the artifacts so old shards cannot vouch
  // for changed CSS, player helpers or page generation.
  return createHash('sha256')
    .update(JSON.stringify({ inputs, buildHash: buildHash ?? (await buildInputs(root)).hash }))
    .digest('hex');
}
export function validateReviewedCases(actual: ReviewedCase[], expected: PlannedCase[]) {
  assert.deepEqual(
    actual.map(({ scene, settings }) => ({ scene, settings })),
    expected.map(({ scene, settings }) => ({ scene, settings })),
    'exact case inventory',
  );
  for (const [i, c] of actual.entries()) {
    assert.ok(expected[i]!.steps.length, `${c.scene}: a story needs at least one step`);
    assert.deepEqual(
      c.steps.map(({ step, width }) => ({ step, width })),
      [390, 1180].flatMap((width) => expected[i]!.steps.map((step) => ({ step, width }))),
      `${c.scene}: exact step/width inventory`,
    );
    assert.ok(
      c.steps.every((s) => s.targets.length > 0 && s.views >= 1),
      `${c.scene}: each step needs a verified subject and reader view`,
    );
    const obligations = expected[i]!.narrowOpenings;
    validateNarrowObligations(obligations, expected[i]!.steps, c.scene);
    for (const step of c.steps) {
      if (step.width !== 390) {
        assert.equal(step.openingAt320, undefined, `${c.scene}/${step.step}: duplicate narrow-opening receipt`);
        continue;
      }
      const opening = step.openingAt320;
      assert.ok(
        opening && typeof opening.reviewed === 'boolean',
        `${c.scene}/${step.step}: missing narrow-opening receipt`,
      );
      const obligation = obligations.find((o) => o.step === step.step)!;
      assert.equal(opening.reviewed, obligation.reviewed, `${c.scene}/${step.step}: narrow-opening obligation changed`);
      if (opening.reviewed) {
        assert.ok(obligation.reviewed);
        assert.deepEqual(opening.targets, obligation.targets, `${c.scene}/${step.step}: exact narrow-opening subjects`);
        assert.deepEqual(opening.labels, obligation.labels, `${c.scene}/${step.step}: exact narrow-opening labels`);
        assert.equal(opening.width, 320);
        assert.equal(opening.height, 568);
        assert.ok(
          Array.isArray(opening.targets) &&
            opening.targets.length > 0 &&
            opening.targets.every((t) => typeof t === 'string' && t.trim()),
          `${c.scene}/${step.step}: narrow opening needs actual subjects`,
        );
        assert.ok(
          obligation.labels.length
            ? Number.isFinite(opening.minimumLabelPx) && opening.minimumLabelPx! >= 12 - 1e-6
            : opening.minimumLabelPx === null,
          `${c.scene}/${step.step}: narrow-opening labels must reach 12px`,
        );
      } else {
        assert.ok(!obligation.reviewed);
        assert.equal(opening.reason, obligation.reason, `${c.scene}/${step.step}: narrow-opening exclusion changed`);
        assert.ok(
          opening.reason === 'detail-step' || opening.reason === 'no-opening-claim',
          `${c.scene}/${step.step}: invalid narrow-opening exclusion`,
        );
      }
    }
  }
}
const caseKey = (c: { scene: string; settings: Record<string, string> }) =>
  JSON.stringify([c.scene, Object.entries(c.settings).sort()]);
export function mergeStoryReviews(
  parts: ReviewReceipt[],
  expected: PlannedCase[],
  catalogHash: string,
  codeHash: string,
): ReviewReceipt {
  assert.ok(parts.length, 'missing story shards');
  const total = parts[0]!.scope.total;
  assert.equal(parts.length, total, 'missing story shards');
  const ordered = [...parts].sort((a, b) => a.scope.part - b.scope.part);
  for (const [i, p] of ordered.entries()) {
    assert.deepEqual(p.scope, { part: i + 1, total }, 'exact shard inventory');
    assert.equal(p.catalogHash, catalogHash, 'stale catalog artifact');
    assert.equal(p.reviewCodeHash, codeHash, 'stale review implementation');
    assert.equal(p.cases, p.results.length);
    assert.equal(
      p.stepWidths,
      p.results.reduce((n, c) => n + c.steps.length, 0),
    );
    assert.deepEqual(p.consoleErrors, []);
    assert.deepEqual(p.runtimeConnections, []);
    assert.equal(p.collectionChecks, i === 0, 'shared collection checks belong to exactly the first shard');
    validateReviewedCases(
      p.results,
      reviewCases(expected, p.scope),
    );
  }
  const byKey = new Map(ordered.flatMap((p) => p.results).map((c) => [caseKey(c), c]));
  assert.equal(byKey.size, expected.length, 'missing or duplicate cases across shards');
  const results = expected.map((c) => byKey.get(caseKey(c))!);
  validateReviewedCases(results, expected);
  return {
    scope: { part: 1, total: 1 },
    collectionChecks: true,
    catalogHash,
    reviewCodeHash: codeHash,
    cases: results.length,
    stepWidths: results.reduce((n, c) => n + c.steps.length, 0),
    results,
    consoleErrors: [],
    runtimeConnections: [],
  };
}

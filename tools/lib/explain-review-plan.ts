import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import {catalogEvidence} from './explain-artifacts.ts';
import { buildInputs } from './build-inputs.ts';
import { READ_PX } from '../../app/embed-closeup.ts';

/** A planned label can round a few millionths of a CSS pixel in the browser's SVG matrix. */
export function readableOpeningLabel(pixels: number | null | undefined): boolean {
  return typeof pixels === 'number' && Number.isFinite(pixels) && pixels >= READ_PX - 1e-5;
}

/**
 * The most live states the review visits per live step, the farthest included; every state one
 * press away is visited however many there are (liveVisits in explain-live-review.ts).
 */
export const LIVE_STATES = 6;
/** The legibility floor for a live state's labels, as at a 1280 px stage: `rayner check`'s MIN_PX. */
export const LIVE_MIN_PX = 14;

/** One live state reviewed at one width (reviewLiveStates in explain-live-review.ts). */
export interface LiveStateReview {
  step: string;
  /** The events that reach it, from where the reader's events start. */
  sent: string[];
  width: number;
  /** The reader views inspected: the whole picture, then, on a phone, the step's close-ups. */
  views: number;
  /** What the events changed (emphasis, else changed artwork, else the machine's views), shown in those views. */
  targets: string[];
  /** Labels painted in the whole picture. */
  labels: number;
  /** The smallest of them as at a 1280 px stage (CSS pixels × 1280 / the stage's width): at least LIVE_MIN_PX. */
  minimumLabelPx1280: number | null;
  /** At 390 px, the smallest label of what the events changed at its best view (whole picture or close-up), in CSS pixels: at least READ_PX; null when they have none. */
  changedLabelPx?: number | null;
}

export interface ReviewScope {
  part: number;
  total: number;
}
export interface PlannedScenario {
  scene: string;
  settings: Record<string, string>;
  steps: string[];
  narrowOpenings: NarrowOpeningObligation[];
  /** The steps where a machine is live (each machine's `step` in the built description); absent when none. */
  live?: string[];
}
export interface ReviewedScenario {
  scene: string;
  settings: Record<string, string>;
  steps: { step: string; width: number; views: number; targets: string[]; openingAt320?: NarrowOpeningReview }[];
  /** The live states visited, each at both widths; absent when the scenario has no live step. */
  live?: LiveStateReview[];
}
export type NarrowOpeningObligation =
  | { step: string; reviewed: true; targets: string[]; labels: string[] }
  | { step: string; reviewed: false; reason: 'detail-step' | 'no-opening-subject' };
export type NarrowOpeningReview =
  | { reviewed: true; width: 320; height: 568; targets: string[]; labels: string[]; minimumLabelPx: number | null }
  | { reviewed: false; reason: 'detail-step' | 'no-opening-subject' };
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
        obligation.reason === 'detail-step' || obligation.reason === 'no-opening-subject',
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
  scenarios: number;
  stepWidths: number;
  /** Live states times widths: every visited live state at 390 and 1180 px. */
  liveStateWidths?: number;
  results: ReviewedScenario[];
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
export function reviewScenarios(scenarios: PlannedScenario[], scope: ReviewScope): PlannedScenario[] {
  const weights = new Map<string, number>();
  for (const c of scenarios) weights.set(c.scene, (weights.get(c.scene) ?? 0) +
    Math.max(1, c.steps.length * 2 + c.narrowOpenings.filter(o => o.reviewed).length + (c.live?.length ?? 0) * LIVE_STATES * 2));
  const loads = Array<number>(scope.total).fill(0), owners = new Map<string, number>();
  for (const [scene, weight] of [...weights].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const part = loads.indexOf(Math.min(...loads));
    owners.set(scene, part + 1);
    loads[part]! += weight;
  }
  return scenarios.filter(c => owners.get(c.scene) === scope.part);
}
export async function readStoryPlan(directory: string, expectedScenes?: readonly string[]) {
  const raw = await readFile(join(directory, 'evidence.json'), 'utf8');
  const catalog = catalogEvidence(JSON.parse(raw));
  const scenarios: PlannedScenario[] = [];
  if (expectedScenes) assert.deepEqual(catalog.scenes.map(scene => scene.id), expectedScenes, 'complete source scene inventory');
  for (const scene of catalog.scenes) {
    const description = JSON.parse(await readFile(join(directory, scene.id, 'describe.json'), 'utf8')) as {
      scenarios: { values: Record<string, string>; steps: { step: string }[]; machines?: { step?: string }[] }[];
    };
    assert.deepEqual(
      description.scenarios.map((c) => c.values),
      scene.scenarios,
      `${scene.id}: description/scenario inventory differs`,
    );
    assert.ok(Array.isArray(scene.narrowOpenings), `${scene.id}: rebuild catalog without a narrow-opening inventory`);
    const openings = scene.narrowOpenings;
    assert.deepEqual(
      openings.map((c) => c.settings),
      scene.scenarios,
      `${scene.id}: exact narrow-opening scenario inventory`,
    );
    for (const [index, c] of description.scenarios.entries())
      validateNarrowObligations(
        openings[index]!.steps,
        c.steps.map((s) => s.step),
        scene.id,
      );
    scenarios.push(
      ...description.scenarios.map((c, index) => {
        // Where machines are live: each at the step it last played in, once per step.
        const live = [...new Set((c.machines ?? []).flatMap((m) => (m.step ? [m.step] : [])))];
        return {
          scene: scene.id,
          settings: c.values,
          steps: c.steps.map((s) => s.step),
          narrowOpenings: openings[index]!.steps,
          ...(live.length ? { live } : {}),
        };
      }),
    );
  }
  return { scenes: catalog.scenes.map(scene => scene.id), scenarios, catalogHash: createHash('sha256').update(raw).digest('hex') };
}
export async function reviewCodeHash(root: string, buildHash?: string) {
  const files = [
    'tools/explain-review.ts',
    'tools/explain-review-merge.ts',
    'tools/lib/explain-story-review.ts',
    'tools/lib/explain-raster.ts',
    'tools/lib/explain-review-scene.ts',
    'tools/lib/explain-review-plan.ts',
    'tools/lib/explain-live-review.ts',
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
export function validateReviewedScenarios(actual: ReviewedScenario[], expected: PlannedScenario[]) {
  assert.deepEqual(
    actual.map(({ scene, settings }) => ({ scene, settings })),
    expected.map(({ scene, settings }) => ({ scene, settings })),
    'exact scenario inventory',
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
    validateLiveStates(c.live, expected[i]!.live ?? [], c.scene);
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
            ? readableOpeningLabel(opening.minimumLabelPx)
            : opening.minimumLabelPx === null,
          `${c.scene}/${step.step}: narrow-opening labels must reach 12px`,
        );
      } else {
        assert.ok(!obligation.reviewed);
        assert.equal(opening.reason, obligation.reason, `${c.scene}/${step.step}: narrow-opening exclusion changed`);
        assert.ok(
          opening.reason === 'detail-step' || opening.reason === 'no-opening-subject',
          `${c.scene}/${step.step}: invalid narrow-opening exclusion`,
        );
      }
    }
  }
}
/**
 * Every live step the built description names was visited, and nothing else: at least one state
 * each, every state at both widths, each with a subject shown in a reader view and labels at
 * least LIVE_MIN_PX as at a 1280 px stage, and at 390 px what the events changed reading at least
 * READ_PX at its best view.
 */
function validateLiveStates(live: LiveStateReview[] | undefined, steps: readonly string[], scene: string) {
  if (!steps.length) {
    assert.ok(!live?.length, `${scene}: live states reviewed where no machine is live`);
    return;
  }
  assert.ok(Array.isArray(live), `${scene}: missing live-state review`);
  assert.deepEqual([...new Set(live.map((s) => s.step))].sort(), [...steps].sort(), `${scene}: exact live-step inventory`);
  const at = (width: number) => live.filter((s) => s.width === width).map((s) => JSON.stringify([s.step, s.sent]));
  assert.ok(live.every((s) => s.width === 390 || s.width === 1180), `${scene}: live states are reviewed at 390 and 1180 px`);
  assert.deepEqual(at(390), at(1180), `${scene}: every live state at both widths`);
  assert.equal(new Set(at(390)).size, at(390).length, `${scene}: duplicate live state`);
  for (const s of live) {
    assert.ok(Array.isArray(s.sent) && s.sent.length > 0, `${scene}/${s.step}: a live state is reached by events`);
    assert.ok(s.targets.length > 0 && s.views >= 1, `${scene}/${s.step} after [${s.sent}]: needs a verified subject and reader view`);
    assert.ok(s.minimumLabelPx1280 === null ? s.labels === 0 : s.labels > 0 && s.minimumLabelPx1280 >= LIVE_MIN_PX - 1e-3,
      `${scene}/${s.step} after [${s.sent}]: live-state labels must reach ${LIVE_MIN_PX}px at a 1280 px stage`);
    if (s.width === 390)
      assert.ok(s.changedLabelPx === null || readableOpeningLabel(s.changedLabelPx),
        `${scene}/${s.step} after [${s.sent}]: what the events changed must read at ${READ_PX}px on a phone`);
  }
}
const scenarioKey = (c: { scene: string; settings: Record<string, string> }) =>
  JSON.stringify([c.scene, Object.entries(c.settings).sort()]);
export function mergeStoryReviews(
  parts: ReviewReceipt[],
  expected: PlannedScenario[],
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
    assert.equal(p.scenarios, p.results.length);
    assert.equal(
      p.stepWidths,
      p.results.reduce((n, c) => n + c.steps.length, 0),
    );
    assert.equal(p.liveStateWidths ?? 0, p.results.reduce((n, c) => n + (c.live?.length ?? 0), 0), 'live-state count');
    assert.deepEqual(p.consoleErrors, []);
    assert.deepEqual(p.runtimeConnections, []);
    assert.equal(p.collectionChecks, i === 0, 'shared collection checks belong to exactly the first shard');
    validateReviewedScenarios(
      p.results,
      reviewScenarios(expected, p.scope),
    );
  }
  const byKey = new Map(ordered.flatMap((p) => p.results).map((c) => [scenarioKey(c), c]));
  assert.equal(byKey.size, expected.length, 'missing or duplicate scenarios across shards');
  const results = expected.map((c) => byKey.get(scenarioKey(c))!);
  validateReviewedScenarios(results, expected);
  return {
    scope: { part: 1, total: 1 },
    collectionChecks: true,
    catalogHash,
    reviewCodeHash: codeHash,
    scenarios: results.length,
    stepWidths: results.reduce((n, c) => n + c.steps.length, 0),
    liveStateWidths: results.reduce((n, c) => n + (c.live?.length ?? 0), 0),
    results,
    consoleErrors: [],
    runtimeConnections: [],
  };
}

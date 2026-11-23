// Additive semantic observations. Frozen v2 targets and historical credit are never
// consumed or rewritten here. A relation is ratified separately from its detector
// representation, with exact native/review/measurement bytes and source/run binding.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalJson } from '../../src/internal.ts';
import { againstBaseline, type EntryResult, type Found } from './motion-corpus-lib.ts';
import { workerResult } from './motion-corpus.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';

export interface SemanticTarget {
  id: string; version: string; scenario: string;
  actor: string; victim: string; literal: string; event: string; phase: string;
  /** Exact observations mapped to this relation, never an arbitrary warning. */
  representations: {kind: string; path: string; subjects: string[]; victim: string; masks: string[]; requirement?: 'clear'; transition: string}[];
}
export const SEMANTIC_V3: readonly SemanticTarget[] = [
  {id: 'poppy-key-over-station-name', version: 'poppy-key-over-station-name@semantic-2026-11-22.1', scenario: '{"approve":"read-write"}',
    actor: 'agent:key:flight', victim: 'lane:sign-in:name', literal: 'Sign-in', event: 'sign-in', phase: 'inbound key move',
    representations: [{kind: 'motion contract', path: 'agent:key:flight', subjects: ['lane:sign-in:name'], victim: 'lane:sign-in:name', masks: ['agent:key:flight'], requirement: 'clear', transition: 'step "approve", event "sign-in"'}]},
  {id: 'refusals-key-over-lane-name', version: 'refusals-key-over-lane-name@semantic-2026-11-22.1', scenario: '{}',
    actor: 'agent:key:flight', victim: 'lane:api:name', literal: 'API', event: 'answer', phase: 'refreshed API key move',
    representations: [{kind: 'motion contract', path: 'agent:key:flight', subjects: ['lane:api:name'], victim: 'lane:api:name', masks: ['agent:key:flight'], requirement: 'clear', transition: 'step "slip", event "answer"'}]},
  {id: 'sign-in-poll-over-card', version: 'sign-in-poll-over-card@semantic-2026-11-22.1', scenario: '{"flow":"device"}',
    actor: 'poll', victim: 'card', literal: 'example.com', event: 'collect', phase: 'outgoing device poll move',
    representations: [{kind: 'covers', path: 'poll', subjects: ['example.com', 'card'], victim: 'card', masks: ['poll'], transition: 'step "ask", play 1, event 2'}]},
  {id: 'browser-forge-across-stage', version: 'browser-forge-across-stage@semantic-2026-11-22.1', scenario: '{"signin":"signed-in"}',
    actor: 'forged', victim: 'page:sid', literal: 'Yx2b7Q', event: 'forge', phase: 'forged slip move across SID value',
    representations: [{kind: 'covers', path: 'forged', subjects: ['Yx2b7Q', 'page:sid'], victim: 'page:sid', masks: ['forged'], transition: 'step "forge", play 3, event 1'}]},
];
export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const semanticDigest = (target: SemanticTarget) => digest(JSON.stringify(target));

/** Mapping keeps actor/victim orientation explicit. An occluded-words observation
 * would need its own exact, ratified representation; it is not accepted broadly. */
export function matchesSemantic(found: Found, target: SemanticTarget): boolean {
  const o = found.observation;
  return o?.type === 'finding' && found.scenario === target.scenario && target.representations.some(r =>
    o.kind === r.kind && o.path === r.path && o.transition === r.transition && o.victim === r.victim &&
    o.requirement === r.requirement && r.subjects.length === o.subjects.length && r.subjects.every(s => o.subjects.includes(s)) &&
    !!o.masks && r.masks.length === o.masks.length && r.masks.every(s => o.masks!.includes(s)));
}
export interface BoundArtifact {path: string; sha256: string}
export interface CaseReview {
  id: string; disposition: 'observed' | 'typed-prevention' | 'non-reproducing' | 'editorial' | 'unresolved';
  note: string; nativeWitnesses: BoundArtifact[];
  clause?: {actor: string; victim: string; event: string; phase: string; observed: string};
  prevention?: {event: string; name: string; message: string};
  blocker?: string;
  settings?: object; route?: {step: string; event: string};
  nativeFrameBindings?: NativeFrameBinding[];
}
export interface NativeFrameBinding {
  side: 'baseline' | 'variant'; sequence: number; absolute?: number; step?: string; phase?: string;
  frame?: number; asset?: string; receiptSha256?: string; pngSha256?: string;
  png?: BoundArtifact; wholeStagePixelsSha256?: string;
}
export interface SemanticApproval {
  version: string; targetSha256: string; actor: string; victim: string; literal: string;
  event: string; phase: string; note: string; nativeWitnesses: BoundArtifact[];
  caseId: string; route: {step: string; event: string}; scenario: object; witnessFrames: NativeFrameBinding[];
}
export interface SemanticRatification {
  schema: 1; sourceRevision: string; run: string; reviewer: string;
  review: BoundArtifact; capture: BoundArtifact; measurement: BoundArtifact;
  observations: SemanticApproval[];
}
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
async function bound(directory: string, artifact: BoundArtifact) {
  if (!artifact?.path?.trim() || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('semantic observation: invalid artifact binding');
  const bytes = await readFile(resolve(directory, artifact.path));
  if (digest(bytes) !== artifact.sha256) throw new Error(`semantic observation: changed artifact ${artifact.path}`);
  return bytes;
}
async function nativeWitness(directory: string, witness: BoundArtifact, capture: {nativeAssets?: string[]; cases?: {id: string; nativeAssets: string[]}[]}, id: string) {
  const bytes = await bound(directory, witness);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    !Array.isArray(capture.nativeAssets) || !capture.nativeAssets.includes(witness.sha256) ||
    !capture.cases?.some(c => c.id === id && c.nativeAssets.includes(witness.sha256)))
    throw new Error('semantic observation: native witness is outside the bound capture');
}

/** A picture is evidence only in its exact captured side and event ledger. A
 * baseline starting picture cannot certify a later variant trip. The native
 * ledger records the runtime scene phase; the independently saved clause names
 * the finer narrative phase, without pretending geometry can infer it. */
async function nativeFrames(directory: string, captureArtifact: BoundArtifact, capture: any, id: string,
  witnesses: BoundArtifact[], bindings: NativeFrameBinding[] | undefined, observed: boolean, scenario?: object) {
  const c = capture.cases?.find((row: {id: string}) => row.id === id);
  if (!c || !Array.isArray(bindings) || !bindings.length) throw new Error(`native frame binding missing for ${id}`);
  const captureDirectory = dirname(resolve(directory, captureArtifact.path));
  const sides = new Map<string, any>();
  for (const side of c.sides ?? []) {
    const bytes = await bound(captureDirectory, side.receipt), actual = JSON.parse(bytes.toString());
    if (actual.side !== side.side || actual.status !== side.status || !same(actual.route, c.route) ||
      !same(actual.mark, side.mark) || !same(actual.provenance, side.provenance) ||
      (scenario !== undefined && !same(actual.provenance?.settings, scenario))) throw new Error(`native side/route/scenario mismatch for ${id}`);
    sides.set(side.side, {actual, sha256: side.receipt.sha256});
  }
  if(sides.size!==2||!sides.has('baseline')||!sides.has('variant')||c.sides.length!==2) throw new Error(`native side inventory mismatch for ${id}`);
  let qualifyingVariant = false;
  const seen = new Set<string>();
  for (const binding of bindings) {
    const side = sides.get(binding.side), frame = side?.actual.frames?.[binding.sequence];
    const reference = c.sides.find((s: any) => s.side === binding.side)?.receipt;
    const sidePath = reference && resolve(captureDirectory, reference.path);
    const expectedPng = frame && sidePath && resolve(dirname(sidePath), frame.asset + '.png');
    const png = binding.png ?? witnesses.find(w => w.sha256 === binding.pngSha256 && resolve(directory, w.path) === expectedPng);
    const identity = `${binding.side}:${binding.sequence}`;
    if (!frame || !png || seen.has(identity) || !Number.isSafeInteger(binding.sequence) || binding.sequence < 0 || frame.sequence !== binding.sequence ||
      !Number.isSafeInteger(frame.absolute) ||
      binding.receiptSha256 !== side.sha256 || binding.absolute !== frame.absolute || binding.step !== frame.step || binding.asset !== frame.asset ||
      (binding.phase !== undefined && binding.phase !== frame.phase) || (binding.frame !== undefined && binding.frame !== frame.frame) ||
      (binding.wholeStagePixelsSha256 !== undefined && binding.wholeStagePixelsSha256 !== frame.pixels) ||
      (binding.pngSha256 !== undefined && binding.pngSha256 !== png.sha256) ||
      !witnesses.some(w => same(w, png))) throw new Error(`native side/frame/phase binding mismatch for ${id}`);
    seen.add(identity);
    // Match the actual file, not merely a same-case digest copied from elsewhere.
    if (resolve(directory, png.path) !== expectedPng) throw new Error(`native frame PNG role mismatch for ${id}`);
    await nativeWitness(directory, png, capture, id);
    const mark = side.actual.mark, steps = c.route.event === 'view.sync' ? mark?.before?.steps : [c.route.step];
    if (binding.side === 'variant' && c.status === 'complete' && side.actual.status === 'complete' && frame.phase === 'playing' &&
      frame.absolute > mark.origin && frame.absolute <= mark.end && steps?.includes(frame.step)) qualifyingVariant = true;
  }
  if (witnesses.some(w => !bindings.some(b => (b.png?.sha256 ?? b.pngSha256) === w.sha256))) throw new Error(`native witness lacks a frame binding for ${id}`);
  if (observed && !qualifyingVariant) throw new Error(`observed clause needs a completed variant event/phase frame for ${id}`);
}

/** Complete accounting is not an accuracy score or a claim to inspect every
 * frame. Every observed clause keeps its own actor/victim/event/phase, and an
 * unresolved case must name its concrete blocker instead of acquiring credit. */
export async function boundCaseReview(directory: string, reviewArtifact: BoundArtifact, captureArtifact: BoundArtifact) {
  const [reviewBytes, captureBytes] = await Promise.all([bound(directory, reviewArtifact), bound(directory, captureArtifact)]);
  const review = JSON.parse(reviewBytes.toString()) as {sourceRevision: string; run: string; reviewer: string; cases: CaseReview[]};
  const capture = JSON.parse(captureBytes.toString());
  if (!/^[a-f0-9]{40}$/.test(review.sourceRevision) || !review.run?.trim() || !review.reviewer?.trim() ||
    capture.sourceRevision !== review.sourceRevision || capture.run !== review.run) throw new Error('case review: source/run binding mismatch');
  if (!Array.isArray(review.cases) || review.cases.length !== CORPUS.length || new Set(review.cases.map(r => r.id)).size !== CORPUS.length ||
    review.cases.some(r => !CORPUS.some(c => c.id === r.id))) throw new Error('case review: incomplete unique 59-case inventory');
  const nonempty = (values: unknown[]) => values.every(v => typeof v === 'string' && v.trim());
  for (const row of review.cases) {
    if (!nonempty([row.note]) || !['observed','typed-prevention','non-reproducing','editorial','unresolved'].includes(row.disposition) ||
      !Array.isArray(row.nativeWitnesses) || (row.disposition !== 'unresolved' && !row.nativeWitnesses.length) ||
      (row.disposition === 'observed' && (!row.clause || !nonempty([row.clause.actor,row.clause.victim,row.clause.event,row.clause.phase,row.clause.observed]))) ||
      (row.disposition === 'typed-prevention' && (!row.prevention || !nonempty([row.prevention.event,row.prevention.name,row.prevention.message]))) ||
      (row.disposition === 'unresolved' && !nonempty([row.blocker]))) throw new Error(`case review: incomplete disposition for ${row.id}`);
    const captured = capture.cases?.find((c: {id: string}) => c.id === row.id);
    if(row.disposition!=='unresolved'&&!same(row.route,captured?.route)) throw new Error(`case review: route mismatch for ${row.id}`);
    if (row.disposition === 'observed' && captured?.route?.event !== row.clause!.event)
      throw new Error(`case review: observed event is outside the captured route for ${row.id}`);
    if (row.disposition === 'typed-prevention') {
      const variant = captured?.sides?.find((s: {side: string}) => s.side === 'variant'), guard = variant?.mark?.guard;
      if (captured?.status !== 'typed-refusal' || variant?.status !== 'typed-refusal' || !guard ||
        row.prevention!.event !== captured.route?.event || row.prevention!.name !== guard.name || row.prevention!.message !== guard.message)
        throw new Error(`case review: prevention is not the exact captured typed guard for ${row.id}`);
    }
    if (row.disposition !== 'unresolved') await nativeFrames(directory, captureArtifact, capture, row.id,
      row.nativeWitnesses, row.nativeFrameBindings, row.disposition === 'observed', row.settings);
  }
  return {sourceRevision: review.sourceRevision, run: review.run, reviewer: review.reviewer, cases: review.cases,
    counts: Object.fromEntries(['observed','typed-prevention','non-reproducing','editorial','unresolved'].map(kind => [kind, review.cases.filter(r => r.disposition === kind).length]))};
}
/** The review is an independently saved judgment, not a verdict inferred from a
 * detector rejection. These are completion attestations, not authentication of a
 * reviewer's identity or a cryptographic proof of prior filesystem state. */
export async function boundSemanticAssessment(directory: string, receipt: SemanticRatification, targets: readonly SemanticTarget[] = SEMANTIC_V3) {
  if (receipt.schema !== 1 || !/^[a-f0-9]{40}$/.test(receipt.sourceRevision) || !receipt.run?.trim() || !receipt.reviewer?.trim()) throw new Error('semantic observation: invalid source/run/reviewer');
  const [reviewBytes, captureBytes, measurementBytes] = await Promise.all([
    bound(directory, receipt.review), bound(directory, receipt.capture), bound(directory, receipt.measurement),
  ]);
  const review = JSON.parse(reviewBytes.toString()), capture = JSON.parse(captureBytes.toString()), measurement = JSON.parse(measurementBytes.toString());
  // Both independent review and measurement provenance must explicitly declare
  // the same source/run and exact bytes. Old/frozen files are never relabelled.
  if (review.sourceRevision !== receipt.sourceRevision || review.run !== receipt.run || review.reviewer !== receipt.reviewer ||
    capture.sourceRevision !== receipt.sourceRevision || capture.run !== receipt.run ||
    measurement.sourceRevision !== receipt.sourceRevision || measurement.run !== receipt.run ||
    measurement.comparison !== 'baseline-subtracted') throw new Error('semantic observation: source/run/measurement binding mismatch');
  // The measurement envelope's digest is over its separately retained worker
  // payload, avoiding a self-referential hash in the provenance envelope.
  const payloadBytes = await bound(directory, measurement.payload);
  if (measurement.payload.sha256 !== measurement.measurementSha256) throw new Error('semantic observation: measurement payload mismatch');
  const payload = JSON.parse(payloadBytes.toString());
  if (payload.comparison !== 'baseline-subtracted') throw new Error('semantic observation: payload is not baseline-subtracted');
  if (!Array.isArray(payload.results) || payload.results.length !== CORPUS.length ||
    new Set(payload.results.map((r: any) => r.id)).size !== CORPUS.length || payload.results.some((r: any) => !CORPUS.some(c => c.id === r.id)))
    throw new Error('semantic observation: incomplete worker inventory');
  const chapters = [...new Set(CORPUS.map(c => c.chapter))];
  if (!Array.isArray(payload.baselines) || payload.baselines.length !== chapters.length ||
    new Set(payload.baselines.map((r: any) => r.id)).size !== chapters.length ||
    payload.baselines.some((r: any) => !chapters.some(c => r.id === `base-${c}`))) throw new Error('semantic observation: incomplete baseline inventory');
  const baselines = new Map<string, EntryResult>(payload.baselines.map((r: any) => {
    const checked = workerResult(r.id, JSON.stringify(r), 0, null);
    if (checked.status !== 'complete' || checked.error || checked.findings.some(f => f.observation?.type === 'refusal')) throw new Error('semantic observation: baseline did not complete');
    return [r.id, checked] as const;
  }));
  const workers: EntryResult[] = payload.results.map((r: any) => {
    const checked = workerResult(r.id, JSON.stringify(r), 0, null), entry = CORPUS.find(c => c.id === r.id)!;
    if (checked.error) throw new Error(`semantic observation: invalid worker ${r.id}`);
    return againstBaseline(checked, baselines.get(`base-${entry.chapter}`), entry.expectedFinding, entry.expectedRefusal);
  });
  const reviewObservations = review.observations as SemanticApproval[];
  if (!Array.isArray(receipt.observations) || new Set(receipt.observations.map(o => o.version)).size !== receipt.observations.length ||
    !Array.isArray(reviewObservations) || new Set(reviewObservations.map(o => o.version)).size !== reviewObservations.length) throw new Error('semantic observation: duplicate or missing independent confirmations');
  for (const observation of receipt.observations) {
    const target = targets.find(t => t.version === observation.version);
    if (!target || semanticDigest(target) !== observation.targetSha256 ||
      !reviewObservations.some(r => same(r, observation)) ||
      ['actor', 'victim', 'literal', 'event', 'phase'].some(k => observation[k as 'actor'] !== target[k as 'actor']) ||
      !observation.note?.trim() || !observation.nativeWitnesses?.length) throw new Error(`semantic observation: unratified or different relation ${observation.version}`);
    const row = review.cases?.find((r: CaseReview) => r.id === target.id);
    if (observation.caseId !== target.id || !same(observation.scenario, JSON.parse(target.scenario)) ||
      row?.disposition !== 'observed' || !same(row.settings, observation.scenario) || !same(row.route, observation.route) ||
      !['actor','victim','literal','event','phase'].every(k => row.clause?.[k] === observation[k as 'actor']))
      throw new Error('semantic observation: approved case/scenario/relation mismatch');
    if (!capture.cases?.some((c: {id: string; route?: {event: string}}) => c.id === target.id && c.route?.event === target.event))
      throw new Error('semantic observation: event is outside the captured route');
    await nativeFrames(directory, receipt.capture, capture, target.id, observation.nativeWitnesses, observation.witnessFrames, true, observation.scenario);
  }
  return targets.map(target => {
    const ratified = receipt.observations.some(o => o.version === target.version), entries = workers.filter(r => r.id === target.id);
    const usable = entries.length === 1 && entries[0]!.status === 'complete' && !entries[0]!.error;
    return {id: target.id, version: target.version, sourceRevision: receipt.sourceRevision, run: receipt.run,
      actor: target.actor, victim: target.victim, literal: target.literal, event: target.event, phase: target.phase,
      ratified, status: !ratified ? 'unassessed' : !usable ? 'blocked-measurement' : entries[0]!.fresh.some(f => matchesSemantic(f, target)) ? 'semantic-target-match' : 'semantic-target-miss'};
  });
}

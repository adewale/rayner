// Additive semantic observations. Frozen v2 targets and historical credit are never
// consumed or rewritten here. A relation is ratified separately from its detector
// representation, with exact native/review/measurement bytes and source/run binding.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Found } from './motion-corpus-lib.ts';
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
}
export interface SemanticRatification {
  schema: 1; sourceRevision: string; run: string; reviewer: string;
  review: BoundArtifact; capture: BoundArtifact; measurement: BoundArtifact;
  observations: {version: string; targetSha256: string; actor: string; victim: string; literal: string;
    event: string; phase: string; note: string; nativeWitnesses: BoundArtifact[]}[];
}
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
    if (row.disposition === 'observed' && captured?.route?.event !== row.clause!.event)
      throw new Error(`case review: observed event is outside the captured route for ${row.id}`);
    if (row.disposition === 'typed-prevention') {
      const variant = captured?.sides?.find((s: {side: string}) => s.side === 'variant'), guard = variant?.mark?.guard;
      if (captured?.status !== 'typed-refusal' || variant?.status !== 'typed-refusal' || !guard ||
        row.prevention!.event !== captured.route?.event || row.prevention!.name !== guard.name || row.prevention!.message !== guard.message)
        throw new Error(`case review: prevention is not the exact captured typed guard for ${row.id}`);
    }
    await Promise.all(row.nativeWitnesses.map(w => nativeWitness(directory, w, capture, row.id)));
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
  const payload = JSON.parse(payloadBytes.toString()) as {results: {id: string; fresh: Found[]; status: string; error?: string}[]};
  if (!Array.isArray(payload.results) || payload.results.length !== CORPUS.length ||
    new Set(payload.results.map(r => r.id)).size !== CORPUS.length || payload.results.some(r => !CORPUS.some(c => c.id === r.id)))
    throw new Error('semantic observation: incomplete worker inventory');
  const workers = payload.results.map(r => workerResult(r.id, JSON.stringify(r), 0, null));
  const reviewObservations = review.observations as {version: string; targetSha256: string}[];
  if (!Array.isArray(receipt.observations) || new Set(receipt.observations.map(o => o.version)).size !== receipt.observations.length ||
    !Array.isArray(reviewObservations)) throw new Error('semantic observation: duplicate or missing independent confirmations');
  for (const observation of receipt.observations) {
    const target = targets.find(t => t.version === observation.version);
    if (!target || semanticDigest(target) !== observation.targetSha256 ||
      !reviewObservations.some(r => r.version === target.version && r.targetSha256 === observation.targetSha256) ||
      ['actor', 'victim', 'literal', 'event', 'phase'].some(k => observation[k as 'actor'] !== target[k as 'actor']) ||
      !observation.note?.trim() || !observation.nativeWitnesses?.length) throw new Error(`semantic observation: unratified or different relation ${observation.version}`);
    if (!capture.cases?.some((c: {id: string; route?: {event: string}}) => c.id === target.id && c.route?.event === target.event))
      throw new Error('semantic observation: event is outside the captured route');
    await Promise.all(observation.nativeWitnesses.map(w => nativeWitness(directory, w, capture, target.id)));
  }
  return targets.map(target => {
    const ratified = receipt.observations.some(o => o.version === target.version), entries = workers.filter(r => r.id === target.id);
    const usable = entries.length === 1 && entries[0]!.status === 'complete' && !entries[0]!.error;
    return {id: target.id, version: target.version, sourceRevision: receipt.sourceRevision, run: receipt.run,
      actor: target.actor, victim: target.victim, literal: target.literal, event: target.event, phase: target.phase,
      ratified, status: !ratified ? 'unassessed' : !usable ? 'blocked-measurement' : entries[0]!.fresh.some(f => matchesSemantic(f, target)) ? 'semantic-target-match' : 'semantic-target-miss'};
  });
}

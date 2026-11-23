// Additive semantic observations. Frozen v2 targets and historical credit are never
// consumed or rewritten here. A relation is ratified separately from its detector
// representation, with exact native/review/measurement bytes and source/run binding.
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
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
/** Preregistered separately before the next candidate's worker measurement.
 * This is the same poll/card/domain relation as v3, with an opt-in authored
 * reading obligation. It never replaces or retrospectively credits v3's miss. */
export const DOMAIN_CLEARANCE_V1: readonly SemanticTarget[] = [{
  id: 'sign-in-poll-over-card', version: 'sign-in-poll-over-card@domain-clearance-2026-11-23.1', scenario: '{"flow":"device"}',
  actor: 'poll', victim: 'card', literal: 'example.com', event: 'collect', phase: 'outgoing device poll move',
  representations: [{kind: 'motion contract', path: 'poll', subjects: ['card:domain'], victim: 'card:domain', masks: ['poll'],
    requirement: 'clear', transition: 'step "ask", event "collect"'}],
}];
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
  /** Omitted means the strongest claim: the entire captured route is identical.
   * A limited visual judgment must declare its scope and bind both event sides. */
  nonReproduction?: {basis: 'full-route-pixel-identity' | 'scoped-visual'; scope?: string};
  caseReceipt?: BoundArtifact; baselineReceipt?: BoundArtifact; variantReceipt?: BoundArtifact;
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

const artifactAt = (directory: string, a: BoundArtifact | undefined, b: BoundArtifact) =>
  !!a && a.sha256 === b.sha256 && resolve(directory, a.path) === resolve(directory, b.path);
function completeNativeClock(side: any): boolean {
  const {mark,frames}=side;
  // Some owner callbacks repeat an absolute frame at a step boundary. They may
  // repeat a clock, but cannot omit one or stop at a pre-event starting picture.
  return !!mark && Number.isSafeInteger(mark.origin) && Number.isSafeInteger(mark.end) && mark.end>=mark.origin &&
    Number.isFinite(mark.duration) && mark.duration>=0 && frames[0]?.absolute===mark.origin && frames.at(-1)?.absolute===mark.end &&
    new Set(frames.map((f:any)=>f.absolute)).size===mark.end-mark.origin+1 &&
    frames.every((f:any,i:number)=>i===0 || (f.absolute>=frames[i-1].absolute && f.absolute<=frames[i-1].absolute+1));
}
async function nativeProducer(directory: string, captureArtifact: BoundArtifact, capture: any) {
  const producer = JSON.parse((await bound(dirname(resolve(directory, captureArtifact.path)), capture.provenance)).toString());
  if (producer.revision !== capture.sourceRevision || (producer.run !== undefined && producer.run !== capture.run) ||
    !/^[a-f0-9]{64}$/.test(producer.driverSha256)) throw new Error('native producer source/run binding mismatch');
  return producer;
}

/** Read the producer's actual case and both immutable ledgers. Packet summaries
 * cannot override their source, route, model, status or clock. Old genuine runs
 * remain admissible: no comparison to today's implementation fingerprint. */
async function nativeCase(directory: string, captureArtifact: BoundArtifact, capture: any, id: string, scenario?: object) {
  const c = capture.cases?.find((row: {id: string}) => row.id === id);
  if (!c) throw new Error(`native case missing for ${id}`);
  const captureDirectory = dirname(resolve(directory, captureArtifact.path));
  const [producer, caseBytes] = await Promise.all([nativeProducer(directory, captureArtifact, capture), bound(captureDirectory, c.caseReceipt)]);
  // The producer emits one case root and two side files. A same-pixel side
  // from another run can have different semantic ownership; copied summaries
  // cannot detach it from the producer's actual files. Canonical file locations
  // also permit relative aliases and relocation of the intact archive.
  const producerDirectory = dirname(await realpath(resolve(captureDirectory, capture.provenance.path)));
  const caseFile = await realpath(resolve(captureDirectory, c.caseReceipt.path));
  if (caseFile !== resolve(producerDirectory, id, 'case.json')) throw new Error(`native producer/case file role mismatch for ${id}`);
  const caseDirectory = dirname(caseFile);
  const actualCase = JSON.parse(caseBytes.toString());
  if (actualCase.id !== id || actualCase.revision !== capture.sourceRevision || actualCase.captureDriverSha256 !== producer.driverSha256 ||
    !same(actualCase.route, c.route) || actualCase.status !== c.status)
    throw new Error(`native producer/case source/route/status binding mismatch for ${id}`);
  const sides = new Map<string, any>();
  for (const side of c.sides ?? []) {
    if (sides.has(side.side) || !['baseline','variant'].includes(side.side)) throw new Error(`native side inventory mismatch for ${id}`);
    const file = await realpath(resolve(captureDirectory, side.receipt.path));
    if (file !== resolve(caseDirectory, side.side, 'receipt.json')) throw new Error(`native producer/side file role mismatch for ${id}`);
    const bytes = await bound(captureDirectory, side.receipt), actual = JSON.parse(bytes.toString());
    if (actual.error ||
      actual.side !== side.side || actual.status !== side.status || actual.status !== actualCase[side.side]?.status ||
      !same(actual.route, c.route) || !same(actual.mark, side.mark) || !same(actual.reader, side.reader) ||
      !same(actual.provenance, side.provenance) || (scenario !== undefined && !same(actual.provenance?.settings, scenario)) ||
      !Array.isArray(actual.frames) || !actual.frames.length || actual.frameCount !== actual.frames.length ||
      actual.frameCount !== side.frameCount || actual.frameCount !== actualCase[side.side]?.frameCount ||
      actual.width !== 800 || actual.height !== 450 || actual.fps !== 30 ||
      actual.frames.some((f: any, i: number) => f.sequence !== i || !Number.isSafeInteger(f.absolute) || !Number.isSafeInteger(f.frame) ||
        !/^[a-f0-9]{64}$/.test(f.pixels) || !/^[a-f0-9]{64}$/.test(f.asset)) ||
      (actual.status === 'complete' && (actual.mark?.guard || !completeNativeClock(actual))))
      throw new Error(`native side/route/scenario/ledger mismatch for ${id}`);
    sides.set(side.side, {actual, sha256: side.receipt.sha256, file});
  }
  if(sides.size!==2||!sides.has('baseline')||!sides.has('variant')||c.sides.length!==2) throw new Error(`native side inventory mismatch for ${id}`);
  return {c, sides};
}

/** A picture is evidence only in its exact captured side and event ledger. A
 * baseline starting picture cannot certify a later variant trip. The native
 * ledger records the runtime scene phase; the independently saved clause names
 * the finer narrative phase, without pretending geometry can infer it. */
async function nativeFrames(directory: string, captureArtifact: BoundArtifact, capture: any, id: string,
  witnesses: BoundArtifact[], bindings: NativeFrameBinding[] | undefined, observed: boolean, scenario?: object) {
  if (!Array.isArray(bindings) || !bindings.length) throw new Error(`native frame binding missing for ${id}`);
  const {c, sides} = await nativeCase(directory, captureArtifact, capture, id, scenario);
  let qualifyingVariant = false;
  const eventSides = new Set<string>();
  const seen = new Set<string>();
  const citations = await Promise.all(witnesses.map(async witness => {
    await nativeWitness(directory, witness, capture, id);
    return {witness, file: await realpath(resolve(directory, witness.path))};
  }));
  const verifiedPngs = new Set<string>();
  for (const binding of bindings) {
    const side = sides.get(binding.side), frame = side?.actual.frames?.[binding.sequence];
    const sidePath = side?.file;
    const expectedPng = frame && sidePath && resolve(dirname(sidePath), frame.asset + '.png');
    const png = binding.png ?? citations.find(c => c.witness.sha256 === binding.pngSha256 && c.file === expectedPng)?.witness;
    const pngFile = png && await realpath(resolve(directory, png.path));
    const identity = `${binding.side}:${binding.sequence}`;
    if (!frame || !png || seen.has(identity) || !Number.isSafeInteger(binding.sequence) || binding.sequence < 0 || frame.sequence !== binding.sequence ||
      !Number.isSafeInteger(frame.absolute) ||
      binding.receiptSha256 !== side.sha256 || binding.absolute !== frame.absolute || binding.step !== frame.step || binding.asset !== frame.asset ||
      (binding.phase !== undefined && binding.phase !== frame.phase) || (binding.frame !== undefined && binding.frame !== frame.frame) ||
      (binding.wholeStagePixelsSha256 !== undefined && binding.wholeStagePixelsSha256 !== frame.pixels) ||
      (binding.pngSha256 !== undefined && binding.pngSha256 !== png.sha256) ||
      !citations.some(c => c.file === pngFile && c.witness.sha256 === png.sha256)) throw new Error(`native side/frame/phase binding mismatch for ${id}`);
    seen.add(identity);
    // Match the actual file, not merely a same-case digest copied from elsewhere.
    if (pngFile !== expectedPng) throw new Error(`native frame PNG role mismatch for ${id}`);
    await nativeWitness(directory, png, capture, id);
    verifiedPngs.add(canonicalJson([pngFile,png.sha256]));
    const mark = side.actual.mark, steps = c.route.event === 'view.sync' ? mark?.before?.steps : [c.route.step];
    if (side.actual.status === 'complete' && frame.phase === 'playing' && frame.absolute > mark.origin && frame.absolute <= mark.end && steps?.includes(frame.step)) {
      eventSides.add(binding.side);
      if (binding.side === 'variant' && c.status === 'complete') qualifyingVariant = true;
    }
  }
  if (citations.some(c => !verifiedPngs.has(canonicalJson([c.file,c.witness.sha256])))) throw new Error(`native witness lacks a frame binding for ${id}`);
  if (observed && !qualifyingVariant) throw new Error(`observed clause needs a completed variant event/phase frame for ${id}`);
  return {sides, eventSides};
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
  if (!artifactAt(directory, (review as any).capture, captureArtifact)) throw new Error('case review: approved capture binding mismatch');
  await nativeProducer(directory, captureArtifact, capture);
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
    const captureDirectory = dirname(resolve(directory, captureArtifact.path));
    for (const [approved, actual] of [[row.caseReceipt,captured?.caseReceipt],
      [row.baselineReceipt,captured?.sides?.find((s: any)=>s.side==='baseline')?.receipt],
      [row.variantReceipt,captured?.sides?.find((s: any)=>s.side==='variant')?.receipt]]) {
      if (approved && (!actual || !artifactAt(directory,approved,{...actual,path:resolve(captureDirectory,actual.path)})))
        throw new Error(`case review: approved case/side receipt binding mismatch for ${row.id}`);
    }
    if (row.disposition === 'observed' && captured?.route?.event !== row.clause!.event)
      throw new Error(`case review: observed event is outside the captured route for ${row.id}`);
    if (row.disposition === 'typed-prevention') {
      const variant = captured?.sides?.find((s: {side: string}) => s.side === 'variant'), guard = variant?.mark?.guard;
      if (captured?.status !== 'typed-refusal' || variant?.status !== 'typed-refusal' || !guard ||
        row.prevention!.event !== captured.route?.event || row.prevention!.name !== guard.name || row.prevention!.message !== guard.message)
        throw new Error(`case review: prevention is not the exact captured typed guard for ${row.id}`);
    }
    if (row.disposition !== 'unresolved') {
      if (!row.settings || typeof row.settings !== 'object') throw new Error(`case review: missing settings for ${row.id}`);
      const {sides,eventSides} = await nativeFrames(directory, captureArtifact, capture, row.id,
        row.nativeWitnesses, row.nativeFrameBindings, row.disposition === 'observed', row.settings);
      if (row.disposition === 'non-reproducing') {
        const basis = row.nonReproduction?.basis ?? 'full-route-pixel-identity';
        const a=sides.get('baseline').actual,b=sides.get('variant').actual;
        if (basis === 'full-route-pixel-identity') {
          const clocks = (s: any) => s.frames.map(({sequence,absolute,frame,step,phase,pixels}: any) => ({sequence,absolute,frame,step,phase,pixels}));
          if (a.status !== 'complete' || b.status !== 'complete' || !same(a.mark,b.mark) || !same(a.reader,b.reader) ||
            !same(clocks(a),clocks(b))) throw new Error(`case review: full-route pixel identity mismatch for ${row.id}`);
        } else if (basis !== 'scoped-visual' || !row.nonReproduction?.scope?.trim() || eventSides.size !== 2)
          throw new Error(`case review: scoped non-reproduction needs both completed event sides for ${row.id}`);
      }
    }
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
  // Both public consumers must apply the same complete case/source/route rules.
  await boundCaseReview(directory, receipt.review, receipt.capture);
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
    if (checked.status === 'complete' && checked.findings.some(f => f.observation?.type === 'refusal'))
      throw new Error(`semantic observation: complete worker contains typed execution refusal ${r.id}`);
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

import type { Machine } from '../../explain/index.ts';
import { canonicalJson, cloneJson, jsonObject } from '../../src/internal.ts';

type AnyMachine = Machine<object, string>;
export interface PictureRoot {
  state: object;
  shown: Record<string, unknown>;
  /** Diagnostic prefix; reader tools pass only their actual offered root. */
  origin?: string;
}
interface Path { parent?: Path; event?: string }
export interface PictureOrigin extends Path {
  state: object;
  shown: Record<string, unknown>;
  origin: string;
}
export interface PictureEdge {
  from: PictureOrigin;
  event: string;
  outcome: ReturnType<AnyMachine['outcome']>;
  /** Absent when refused/beyond, or when the durable-state budget omitted the destination. */
  to?: PictureOrigin;
}

/** Materialize a representative legal history only when a renderer or diagnostic needs it. */
export function picturePath(at: Path): string[] {
  const path: string[] = [];
  for (let p: Path | undefined = at; p?.event !== undefined; p = p.parent) path.push(p.event);
  return path.reverse();
}

/**
 * Bounded durable states and their distinct incoming presentations. A result depends only on
 * its incoming model edge, so evaluate that edge once, never replay its entire history merely
 * to discover a picture. Parent links retain legal replay paths without quadratic path copies.
 * Each root gets the machine's declared state budget; presentation identity never consumes it.
 */
export function pictureInventory(machine: AnyMachine, roots: readonly PictureRoot[]) {
  const states = new Set<string>(), origins: PictureOrigin[] = [], edges: PictureEdge[] = [];
  const pictures = new Map<string, PictureOrigin>();
  const scheduled = new Set<PictureOrigin>();
  const modelEdges = new Map<string, {event: string; outcome: ReturnType<AnyMachine['outcome']>; result?: object}[]>();
  let complete = true;
  const outgoing = (state: object) => {
    const key = canonicalJson(state), cached = modelEdges.get(key);
    if (cached) return cached;
    const found = machine.spec.events.map(event => {
      const outcome = machine.outcome(state, event);
      const value = 'next' in outcome ? machine.spec.result?.({event, before: state, after: outcome.next}) : undefined;
      return {event, outcome, ...(value === undefined ? {} : {result: cloneJson(value, 'machine.result()', 'result')})};
    });
    modelEdges.set(key, found);
    return found;
  };
  const admit = (candidate: PictureOrigin) => {
    const key = canonicalJson({state: candidate.state, shown: candidate.shown});
    const known = pictures.get(key);
    if (known) return known;
    pictures.set(key, candidate); origins.push(candidate);
    return candidate;
  };
  for (const root of roots) {
    const seed: PictureOrigin = {state: root.state, shown: jsonObject(root.shown, 'machine presentation'), origin: root.origin ?? ''};
    const reached = new Map<string, PictureOrigin>([[canonicalJson(seed.state), seed]]), queue = [seed];
    const presented = (from: PictureOrigin, edge: ReturnType<typeof outgoing>[number]): PictureOrigin => {
      if (!('next' in edge.outcome)) throw new Error('a refused edge has no picture');
      const {result: previous, ...other} = seed.shown;
      const shown = machine.spec.result ? (edge.result === undefined ? other : {...other, result: edge.result}) : seed.shown;
      return {state: edge.outcome.next, shown, origin: seed.origin, parent: from, event: edge.event};
    };
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!;
      states.add(canonicalJson(from.state));
      for (const edge of outgoing(from.state)) {
        if (!('next' in edge.outcome)) continue;
        const key = canonicalJson(edge.outcome.next);
        if (reached.has(key)) continue;
        if (reached.size >= machine.spec.limit!) { complete = false; continue; }
        const next = presented(from, edge);
        reached.set(key, next); queue.push(next);
      }
    }
    // Admit the root and every incoming response, including self-loops and alternate routes
    // to an already admitted state. All paths are rooted in the caller's legal origin.
    const local = new Set<PictureOrigin>([admit(seed)]);
    for (const from of queue) for (const edge of outgoing(from.state))
      if ('next' in edge.outcome && reached.has(canonicalJson(edge.outcome.next))) local.add(admit(presented(from, edge)));
    for (const from of local) {
      // A duplicate root/picture is inspected once across origins too.
      if (scheduled.has(from)) continue;
      scheduled.add(from);
      for (const edge of outgoing(from.state)) {
        const to = 'next' in edge.outcome && reached.has(canonicalJson(edge.outcome.next)) ? admit(presented(from, edge)) : undefined;
        edges.push({from, event: edge.event, outcome: edge.outcome, ...(to ? {to} : {})});
      }
    }
  }
  return {states: states.size, origins, edges, complete};
}

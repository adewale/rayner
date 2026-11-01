// A small statechart interpreter, and the flattening that turns a statechart back into a state machine.
//
// Features: compound states (one active child, with an initial child), parallel states (every
// child region active at once), transitions declared on any state, innermost-first lookup, and
// shallow history. That is what the explainer teaches. Not modelled: guards, actions, delayed
// transitions, final states and actors; the page names them without simulating them.

export type Kind = 'atomic' | 'compound' | 'parallel';

export interface StateNode {
  id: string;
  parent: string | null;
  kind: Kind;
  /** Compound only: the child entered by default. */
  initial?: string;
  /** Compound only: remembers its last active child when it is exited. */
  history?: boolean;
}

export interface Edge {
  from: string;
  event: string;
  to: string;
  /** Enter `to` through its history (its remembered child) instead of its initial child. */
  viaHistory?: boolean;
}

export interface Chart {
  nodes: StateNode[];
  edges: Edge[];
  root: string;
  events: string[];
}

/** What is active: the leaves (atomic states), and what each history-bearing compound state last held. */
export interface Config {
  leaves: string[];
  memory: Record<string, string>;
}

const nodeOf = (chart: Chart, id: string): StateNode => {
  const n = chart.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No state ${id}`);
  return n;
};
export const childrenOf = (chart: Chart, id: string): string[] => chart.nodes.filter((n) => n.parent === id).map((n) => n.id);
/** A state's ancestors, nearest first. */
export const ancestorsOf = (chart: Chart, id: string): string[] => {
  const out: string[] = [];
  for (let p = nodeOf(chart, id).parent; p; p = nodeOf(chart, p).parent) out.push(p);
  return out;
};
const within = (chart: Chart, id: string, ancestor: string) => ancestorsOf(chart, id).includes(ancestor);

/** The leaves entered when `id` is entered: initial children, every region of a parallel state, or the remembered child. */
function enterLeaves(chart: Chart, id: string, memory: Record<string, string>, viaHistory: boolean): string[] {
  const n = nodeOf(chart, id);
  if (n.kind === 'atomic') return [id];
  if (n.kind === 'parallel') return childrenOf(chart, id).flatMap((c) => enterLeaves(chart, c, memory, false));
  const remembered = viaHistory && n.history ? memory[id] : undefined;
  return enterLeaves(chart, remembered ?? n.initial!, memory, false);
}

const canonical = (chart: Chart, leaves: string[], memory: Record<string, string>): Config => {
  const active = new Set(leaves.flatMap((l) => [l, ...ancestorsOf(chart, l)]));
  const kept: Record<string, string> = {};
  // A compound state that is active will overwrite its memory when it exits, so the memory is not part of the situation.
  for (const k of Object.keys(memory).sort()) if (!active.has(k)) kept[k] = memory[k]!;
  return { leaves: [...leaves].sort(), memory: kept };
};

export function initialConfig(chart: Chart): Config {
  return canonical(chart, enterLeaves(chart, chart.root, {}, false), {});
}

/** One leaf's search for a handler: the states asked, nearest first, and the edge that answered (if any). */
export interface Lookup {
  leaf: string;
  asked: string[];
  handler: Edge | null;
}

/** Ask the leaf, then its parent, then its grandparent, and stop at the first state with an arrow for the event. */
export function lookup(chart: Chart, config: Config, event: string): Lookup[] {
  return config.leaves.map((leaf) => {
    const asked: string[] = [];
    for (const s of [leaf, ...ancestorsOf(chart, leaf)]) {
      asked.push(s);
      const handler = chart.edges.find((e) => e.from === s && e.event === event) ?? null;
      if (handler) return { leaf, asked, handler };
    }
    return { leaf, asked, handler: null };
  });
}

export interface Step {
  config: Config;
  handled: boolean;
  lookups: Lookup[];
  /** The edges that fired (several leaves may find the same one). */
  fired: Edge[];
}

export function send(chart: Chart, config: Config, event: string): Step {
  const lookups = lookup(chart, config, event);
  const fired = [...new Set(lookups.flatMap((l) => (l.handler ? [l.handler] : [])))];
  if (!fired.length) return { config, handled: false, lookups, fired };
  let leaves = [...config.leaves];
  const memory = { ...config.memory };
  for (const e of fired) {
    // The domain is the nearest compound state above both ends: everything active inside it is exited.
    const up = ancestorsOf(chart, e.to);
    const domain = ancestorsOf(chart, e.from).find((a) => up.includes(a) && nodeOf(chart, a).kind === 'compound')!;
    const exited = leaves.filter((l) => within(chart, l, domain));
    for (const l of exited) for (const a of [l, ...ancestorsOf(chart, l)]) {
      if (a === domain) break;
      const n = nodeOf(chart, a);
      if (n.kind === 'compound' && n.history) {
        const child = [l, ...ancestorsOf(chart, l)].find((x) => nodeOf(chart, x).parent === a)!;
        memory[a] = child;
      }
    }
    leaves = leaves.filter((l) => !exited.includes(l));
    leaves.push(...enterLeaves(chart, e.to, memory, !!e.viaHistory));
  }
  return { config: canonical(chart, leaves, memory), handled: true, lookups, fired };
}

export const run = (chart: Chart, events: string[], from: Config = initialConfig(chart)): Config[] => {
  const out = [from];
  for (const e of events) out.push(send(chart, out.at(-1)!, e).config);
  return out;
};

// ---- flattening -----------------------------------------------------------------

export interface FlatState {
  id: string;
  leaves: string[];
  memory: Record<string, string>;
}
export interface FlatEdge {
  from: string;
  event: string;
  to: string;
}
export interface Flat {
  states: FlatState[];
  edges: FlatEdge[];
  initial: string;
}

const keyOf = (c: Config) => c.leaves.join('+') + (Object.keys(c.memory).length ? '~' + Object.entries(c.memory).map(([k, v]) => `${k}=${v}`).join(',') : '');

/** The state machine with one state per reachable situation and one arrow per (situation, event) that does something. */
export function flatten(chart: Chart): Flat {
  const start = initialConfig(chart);
  const seen = new Map<string, Config>([[keyOf(start), start]]);
  const queue = [start];
  const edges: FlatEdge[] = [];
  while (queue.length) {
    const c = queue.shift()!;
    for (const event of chart.events) {
      const step = send(chart, c, event);
      if (!step.handled) continue;
      const k = keyOf(step.config);
      if (!seen.has(k)) {
        seen.set(k, step.config);
        queue.push(step.config);
      }
      edges.push({ from: keyOf(c), event, to: k });
    }
  }
  return {
    states: [...seen].map(([id, c]) => ({ id, leaves: c.leaves, memory: c.memory })),
    edges,
    initial: keyOf(start),
  };
}

export const flatStep = (flat: Flat, state: string, event: string): string =>
  flat.edges.find((e) => e.from === state && e.event === event)?.to ?? state;

/** Send every event sequence up to `depth` through both, and count how many were compared; throws on the first disagreement. */
export function agree(chart: Chart, flat: Flat, depth: number): number {
  const states = new Map(flat.states.map((s) => [s.id, s]));
  let compared = 0;
  const walk = (c: Config, f: string, trail: string[]) => {
    const leaves = states.get(f)!.leaves.join('+');
    if (leaves !== c.leaves.join('+')) throw new Error(`Disagree after ${trail.join(' ')}: chart ${c.leaves} vs flat ${leaves}`);
    if (trail.length === depth) return;
    for (const e of chart.events) {
      compared++;
      walk(send(chart, c, e).config, flatStep(flat, f, e), [...trail, e]);
    }
  };
  walk(initialConfig(chart), flat.initial, []);
  return compared;
}

// ---- the two machines the page is about -----------------------------------------

const atomic = (id: string, parent: string): StateNode => ({ id, parent, kind: 'atomic' });

export type Button = 'power' | 'back';

/**
 * A coffee machine: idle, grinding, brewing, ready, then a new button.
 * `power`: POWER_OFF from every working state to off, POWER_ON back.
 * `back`: BACK steps one state back from every state but the first.
 * `history`: POWER_ON re-enters the working states through their history.
 */
export function coffee(button: Button, { history = false }: { history?: boolean } = {}): Chart {
  const base: Edge[] = [
    { from: 'idle', event: 'START', to: 'grinding' },
    { from: 'grinding', event: 'GROUND', to: 'brewing' },
    { from: 'brewing', event: 'BREWED', to: 'ready' },
    { from: 'ready', event: 'TAKE', to: 'idle' },
  ];
  if (button === 'power')
    return {
      root: 'machine',
      events: ['START', 'GROUND', 'BREWED', 'TAKE', 'POWER_OFF', 'POWER_ON'],
      nodes: [
        { id: 'machine', parent: null, kind: 'compound', initial: 'on' },
        { id: 'on', parent: 'machine', kind: 'compound', initial: 'idle', history },
        atomic('idle', 'on'),
        atomic('grinding', 'on'),
        atomic('brewing', 'on'),
        atomic('ready', 'on'),
        atomic('off', 'machine'),
      ],
      edges: [...base, { from: 'on', event: 'POWER_OFF', to: 'off' }, { from: 'off', event: 'POWER_ON', to: 'on', viaHistory: history }],
    };
  return {
    root: 'machine',
    events: ['START', 'GROUND', 'BREWED', 'TAKE', 'BACK'],
    nodes: [
      { id: 'machine', parent: null, kind: 'compound', initial: 'idle' },
      atomic('idle', 'machine'),
      atomic('grinding', 'machine'),
      atomic('brewing', 'machine'),
      atomic('ready', 'machine'),
    ],
    edges: [
      ...base,
      { from: 'grinding', event: 'BACK', to: 'idle' },
      { from: 'brewing', event: 'BACK', to: 'grinding' },
      { from: 'ready', event: 'BACK', to: 'brewing' },
    ],
  };
}

/** The coffee machine before any button is added: four states in a ring. */
export function coffeeRing(): Chart {
  return {
    root: 'machine',
    events: ['START', 'GROUND', 'BREWED', 'TAKE'],
    nodes: [
      { id: 'machine', parent: null, kind: 'compound', initial: 'idle' },
      atomic('idle', 'machine'),
      atomic('grinding', 'machine'),
      atomic('brewing', 'machine'),
      atomic('ready', 'machine'),
    ],
    edges: [
      { from: 'idle', event: 'START', to: 'grinding' },
      { from: 'grinding', event: 'GROUND', to: 'brewing' },
      { from: 'brewing', event: 'BREWED', to: 'ready' },
      { from: 'ready', event: 'TAKE', to: 'idle' },
    ],
  };
}

export const REGION_SPECS = [
  { id: 'playback', states: ['paused', 'playing'], to: ['PLAY', 'PAUSE'] },
  { id: 'sound', states: ['unmuted', 'muted'], to: ['MUTE', 'UNMUTE'] },
  { id: 'loop', states: ['once', 'looping'], to: ['LOOP_ON', 'LOOP_OFF'] },
] as const;

/**
 * A media player with `k` independent two-state regions: playback (paused or playing), sound (unmuted or muted),
 * and, for three, loop (once or loop). The flat player is not hand-written: it is `flatten` of this chart.
 */
export function player(k: 1 | 2 | 3): Chart {
  const specs = REGION_SPECS.slice(0, k);
  const nodes: StateNode[] = [{ id: 'player', parent: null, kind: 'parallel' }];
  const edges: Edge[] = [];
  const events: string[] = [];
  for (const r of specs) {
    nodes.push({ id: r.id, parent: 'player', kind: 'compound', initial: r.states[0] });
    for (const s of r.states) nodes.push(atomic(s, r.id));
  }
  for (const r of specs) {
    // The first event moves from the first state to the second; the other moves back.
    const [a, b] = r.states;
    const [into, back] = r.to;
    edges.push({ from: a, event: into, to: b }, { from: b, event: back, to: a });
    events.push(into, back);
  }
  return { nodes, edges, root: 'player', events };
}

/** Counts a reader can check against the drawing. */
export function counts(chart: Chart) {
  const flat = flatten(chart);
  return {
    chartStates: chart.nodes.filter((n) => n.kind === 'atomic').length,
    chartArrows: chart.edges.length,
    flatStates: flat.states.length,
    flatArrows: flat.edges.length,
  };
}

/** Flat versus parallel for `k` two-state regions, from the model: the series the growth step draws. */
export function growth(maxRegions: number) {
  const rows: { regions: number; flatStates: number; chartStates: number; flatArrows: number; chartArrows: number }[] = [];
  for (let k = 1; k <= maxRegions; k++) {
    const chart = regionsChart(k);
    const flat = flatten(chart);
    rows.push({ regions: k, flatStates: flat.states.length, chartStates: chart.nodes.filter((n) => n.kind === 'atomic').length, flatArrows: flat.edges.length, chartArrows: chart.edges.length });
  }
  return rows;
}

/** `k` regions, any k, for the growth series (the named regions are only defined up to three). */
function regionsChart(k: number): Chart {
  const nodes: StateNode[] = [{ id: 'p', parent: null, kind: 'parallel' }];
  const edges: Edge[] = [];
  const events: string[] = [];
  for (let i = 0; i < k; i++) {
    nodes.push({ id: `r${i}`, parent: 'p', kind: 'compound', initial: `a${i}` }, atomic(`a${i}`, `r${i}`), atomic(`b${i}`, `r${i}`));
    edges.push({ from: `a${i}`, event: `up${i}`, to: `b${i}` }, { from: `b${i}`, event: `down${i}`, to: `a${i}` });
    events.push(`up${i}`, `down${i}`);
  }
  return { nodes, edges, root: 'p', events };
}

/** The coffee machine with `n` working states in a ring: the series for the power button. */
export function powerScaling(maxStates: number) {
  const rows: { states: number; flatArrows: number; chartArrows: number }[] = [];
  for (let n = 2; n <= maxStates; n++) {
    const ids = Array.from({ length: n }, (_, i) => `s${i}`);
    const chart: Chart = {
      root: 'm',
      events: [...ids.map((_, i) => `e${i}`), 'OFF', 'ON'],
      nodes: [
        { id: 'm', parent: null, kind: 'compound', initial: 'on' },
        { id: 'on', parent: 'm', kind: 'compound', initial: 's0' },
        ...ids.map((id) => atomic(id, 'on')),
        atomic('off', 'm'),
      ],
      edges: [
        ...ids.map((id, i) => ({ from: id, event: `e${i}`, to: ids[(i + 1) % n]! })),
        { from: 'on', event: 'OFF', to: 'off' },
        { from: 'off', event: 'ON', to: 'on' },
      ],
    };
    rows.push({ states: n, flatArrows: flatten(chart).edges.length, chartArrows: chart.edges.length });
  }
  return rows;
}

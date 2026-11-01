// A small statechart model: nested states, regions, and flattening.
// The scene draws what this module answers; it states no count or path of its own.

/** An atomic state, a compound state (a box of states, one active), or a parallel state (regions, all active). */
export interface StateNode {
  id: string;
  /** Child states: one of them is active (compound), or every child is a region and all are active (parallel). */
  children?: StateNode[];
  parallel?: boolean;
  /** The child entered first in a compound state. Defaults to the first child. */
  initial?: string;
  /** Event -> id of the state it moves to. A target is an atomic state, or a state whose initial child is entered. */
  on?: Record<string, string>;
}

/** The ids of the active atomic states, sorted: the machine's configuration. */
export type Configuration = readonly string[];

const index = (root: StateNode): Map<string, StateNode> => {
  const map = new Map<string, StateNode>();
  const walk = (n: StateNode) => {
    if (map.has(n.id)) throw new Error(`duplicate state id ${n.id}`);
    map.set(n.id, n);
    n.children?.forEach(walk);
  };
  walk(root);
  return map;
};

const parents = (root: StateNode): Map<string, string> => {
  const map = new Map<string, string>();
  const walk = (n: StateNode) =>
    n.children?.forEach((c) => {
      map.set(c.id, n.id);
      walk(c);
    });
  walk(root);
  return map;
};

/** The atomic states entered when `n` is entered. */
function enter(n: StateNode): string[] {
  if (!n.children?.length) return [n.id];
  if (n.parallel) return n.children.flatMap(enter);
  const first = n.children.find((c) => c.id === n.initial) ?? n.children[0]!;
  return enter(first);
}

/** Sort ids into the order the chart is written, so a configuration reads region by region. */
const inChartOrder = (root: StateNode, ids: Iterable<string>): string[] => {
  const pos = [...index(root).keys()];
  return [...new Set(ids)].sort((a, b) => pos.indexOf(a) - pos.indexOf(b));
};

export const initialConfiguration = (root: StateNode): Configuration => inChartOrder(root, enter(root));

/** The states from an atomic state up to the root: the child first, then each parent. */
export function lineage(root: StateNode, atomic: string): string[] {
  const up = parents(root);
  const out = [atomic];
  for (let p = up.get(atomic); p !== undefined; p = up.get(p)) out.push(p);
  return out;
}

export interface Dispatch {
  event: string;
  /** For each active atomic state, the states asked in order (child first) and the one that handled the event. */
  asked: { from: string; path: string[]; handledBy: string | null; target: string | null }[];
  next: Configuration;
}

/** Send one event. Each active state asks itself, then its parent, then its parent's parent. Regions react independently. */
export function dispatch(root: StateNode, config: Configuration, event: string): Dispatch {
  const nodes = index(root),
    up = parents(root);
  let next = [...config];
  const asked: Dispatch['asked'] = [];
  for (const atomic of config) {
    const path: string[] = [];
    let handledBy: string | null = null,
      target: string | null = null;
    for (let id: string | undefined = atomic; id !== undefined; id = up.get(id)) {
      path.push(id);
      const t = nodes.get(id)!.on?.[event];
      if (t !== undefined) {
        handledBy = id;
        target = t;
        break;
      }
    }
    asked.push({ from: atomic, path, handledBy, target });
    if (handledBy === null || target === null) continue;
    // Leave every active state under the handler, then enter the target.
    const handler = nodes.get(handledBy)!;
    const under = new Set<string>();
    const collect = (n: StateNode) => {
      under.add(n.id);
      n.children?.forEach(collect);
    };
    collect(handler);
    next = next.filter((a) => !under.has(a));
    next.push(...enter(nodes.get(target)!));
  }
  return { event, asked, next: inChartOrder(root, next) };
}

export const run = (root: StateNode, events: readonly string[]): Configuration[] => {
  let config = initialConfiguration(root);
  const trace = [config];
  for (const e of events) {
    config = dispatch(root, config, e).next;
    trace.push(config);
  }
  return trace;
};

/** The ordinary state machine with the same behaviour: one state per reachable configuration. */
export interface FlatMachine {
  states: string[];
  /** Transitions between flat states, with the event on each. */
  transitions: { from: string; event: string; to: string }[];
  initial: string;
}

export const configName = (c: Configuration) => c.join(' + ');

export function flatten(root: StateNode): FlatMachine {
  const events = new Set<string>();
  index(root).forEach((n) => Object.keys(n.on ?? {}).forEach((e) => events.add(e)));
  const start = initialConfiguration(root);
  const seen = new Map<string, Configuration>([[configName(start), start]]);
  const transitions: FlatMachine['transitions'] = [];
  for (const queue = [start]; queue.length; ) {
    const c = queue.shift()!;
    for (const event of [...events].sort()) {
      const next = dispatch(root, c, event).next;
      if (configName(next) === configName(c)) continue;
      transitions.push({ from: configName(c), event, to: configName(next) });
      if (!seen.has(configName(next))) {
        seen.set(configName(next), next);
        queue.push(next);
      }
    }
  }
  return { states: [...seen.keys()], transitions, initial: configName(start) };
}

export const runFlat = (m: FlatMachine, events: readonly string[]): string[] => {
  let at = m.initial;
  const trace = [at];
  for (const e of events) {
    at = m.transitions.find((t) => t.from === at && t.event === e)?.to ?? at;
    trace.push(at);
  }
  return trace;
};

/** How many arrows carry `event` in the chart as drawn. */
export const declaredFor = (root: StateNode, event: string): number => {
  let n = 0;
  index(root).forEach((s) => (n += s.on && event in s.on ? 1 : 0));
  return n;
};

/** How many arrows carry `event` in the equivalent ordinary machine. */
export const flatFor = (m: FlatMachine, event: string): number => m.transitions.filter((t) => t.event === event).length;

/** States a person draws: every state except the root and the regions of a parallel state. */
export const drawnStates = (root: StateNode): number => {
  let n = 0;
  const walk = (node: StateNode, isRegion: boolean) => {
    if (node !== root && !isRegion) n += 1;
    node.children?.forEach((c) => walk(c, !!node.parallel));
  };
  walk(root, false);
  return n;
};

/** Arrows a person draws: one for each `on` entry in the chart. */
export const declaredTransitions = (root: StateNode): number => {
  let n = 0;
  index(root).forEach((s) => (n += Object.keys(s.on ?? {}).length));
  return n;
};

/** The two drawings side by side: what the ordinary machine needs against what the chart draws. */
export const sizes = (root: StateNode) => {
  const flat = flatten(root);
  return {
    flatStates: flat.states.length,
    flatArrows: flat.transitions.length,
    chartStates: drawnStates(root),
    chartArrows: declaredTransitions(root),
  };
};

/** Run every event sequence of `length` through the chart and its flattened machine: how many were tried, how many agreed. */
export function compareAll(root: StateNode, events: readonly string[], length: number): { tried: number; agreed: number } {
  const flat = flatten(root);
  let tried = 0,
    agreed = 0;
  const walk = (seq: string[]) => {
    if (seq.length === length) {
      tried += 1;
      const a = run(root, seq).map(configName),
        b = runFlat(flat, seq);
      if (a.every((c, i) => c === b[i])) agreed += 1;
      return;
    }
    for (const e of events) walk([...seq, e]);
  };
  walk([]);
  return { tried, agreed };
}

/** Every event name used in a chart, sorted. */
export const eventsOf = (root: StateNode): string[] => {
  const out = new Set<string>();
  index(root).forEach((n) => Object.keys(n.on ?? {}).forEach((e) => out.add(e)));
  return [...out].sort();
};

// ---- the charts the explainer draws ----

/** The coffee machine: four working states in a box called on, one POWER_OFF on the box, and the way back on. */
export const COFFEE_STATES = ['idle', 'grinding', 'brewing', 'ready'] as const;
/** The arrow that leaves each working state: the event, in the order the cycle runs. TAKE closes the loop. */
export const COFFEE_FLOW: Record<string, string> = { idle: 'SELECT', grinding: 'GROUND', brewing: 'BREWED', ready: 'TAKE' };
const coffeeCycle = (): StateNode[] => [
  { id: 'idle', on: { SELECT: 'grinding' } },
  { id: 'grinding', on: { GROUND: 'brewing' } },
  { id: 'brewing', on: { BREWED: 'ready' } },
  { id: 'ready', on: { TAKE: 'idle' } },
];
export const coffeeChart = (): StateNode => ({
  id: 'machine',
  initial: 'on',
  children: [
    { id: 'on', initial: 'idle', on: { POWER_OFF: 'off' }, children: coffeeCycle() },
    { id: 'off', on: { POWER_ON: 'on' } },
  ],
});

/** The same machine with a milk frother that can be switched on or off at any time: a second region inside the box. */
export const frotherChart = (): StateNode => ({
  id: 'machine',
  initial: 'on',
  children: [
    {
      id: 'on',
      parallel: true,
      on: { POWER_OFF: 'off' },
      children: [
        { id: 'cycle', initial: 'idle', children: coffeeCycle() },
        {
          id: 'frother',
          initial: 'froth off',
          children: [
            { id: 'froth off', on: { FROTH_ON: 'froth on' } },
            { id: 'froth on', on: { FROTH_OFF: 'froth off' } },
          ],
        },
      ],
    },
    { id: 'off', on: { POWER_ON: 'on' } },
  ],
});

/** A player with `features` independent on/off features. The first two are playback and volume. */
export const FEATURES = [
  { region: 'playback', on: 'playing', off: 'paused', toOff: 'PAUSE', toOn: 'PLAY' },
  { region: 'volume', on: 'unmuted', off: 'muted', toOff: 'MUTE', toOn: 'UNMUTE' },
  { region: 'captions', on: 'captions off', off: 'captions on', toOff: 'CAPTIONS_ON', toOn: 'CAPTIONS_OFF' },
  { region: 'repeat', on: 'once', off: 'repeating', toOff: 'REPEAT', toOn: 'ONCE' },
  { region: 'shuffle', on: 'in order', off: 'shuffled', toOff: 'SHUFFLE', toOn: 'ORDER' },
] as const;

export const playerChart = (features = 2): StateNode => ({
  id: 'player',
  parallel: true,
  children: FEATURES.slice(0, features).map((f) => ({
    id: f.region,
    initial: f.on,
    children: [
      { id: f.on, on: { [f.toOff]: f.off } },
      { id: f.off, on: { [f.toOn]: f.on } },
    ],
  })),
});

/** What the sizes come to as on/off features are added: flat states against states drawn in regions. */
export const growth = (features: number) => {
  const chart = playerChart(features);
  const flat = flatten(chart);
  return { features, flatStates: flat.states.length, regionStates: drawnStates(chart), flatArrows: flat.transitions.length, regionArrows: declaredTransitions(chart) };
};

/**
 * The two flags that stand in for playback, written all four ways. Only two rows name a state of the player.
 * Both true is impossible. Both false is not impossible, just unnamed: a stopped player is legitimate, and the flags cannot say it.
 */
export const FLAGS = [
  { isPlaying: true, isPaused: false },
  { isPlaying: false, isPaused: true },
  { isPlaying: true, isPaused: true },
  { isPlaying: false, isPaused: false },
].map((f) => ({
  ...f,
  verdict: (f.isPlaying && f.isPaused ? 'impossible' : f.isPlaying ? 'playing' : f.isPaused ? 'paused' : 'neither?') as 'impossible' | 'playing' | 'paused' | 'neither?',
}));

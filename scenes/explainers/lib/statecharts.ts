// A small statechart model: compound and parallel states with event transitions, run with the
// SCXML 1.0 selection rules this subset needs (W3C Recommendation, 2015, Appendix D). No guards,
// actions, history, final states or delays. tools/oracle/statecharts.ts runs the same charts
// through XState and test/statecharts.test.ts compares the two.

/** A state. `compound` is in exactly one child at a time; `parallel` is in every child at once. */
export interface StateNode {
  id: string;
  type: 'atomic' | 'compound' | 'parallel';
  /** The child a compound state enters when it is entered from outside. */
  initial?: string;
  children?: StateNode[];
  /** Event name to target state id. */
  on?: Record<string, string>;
}

/** One two-state control of the media player, which becomes one region inside `on`. */
export interface Control {
  region: string;
  /** The first state is the region's initial state. */
  states: readonly [string, string];
  /** The first event moves the first state to the second; the second moves it back. */
  events: readonly [string, string];
}

export const CONTROLS: readonly Control[] = [
  { region: 'playback', states: ['paused', 'playing'], events: ['PLAY', 'PAUSE'] },
  { region: 'volume', states: ['unmuted', 'muted'], events: ['MUTE', 'UNMUTE'] },
];

/** The events the explainer sends: on, play, mute, then off again. tools/oracle/statecharts.ts sends XState the same. */
export const FOLLOW: readonly string[] = ['POWER', 'PLAY', 'MUTE', 'POWER'];

const region = (c: Control): StateNode => ({
  id: c.region,
  type: 'compound',
  initial: c.states[0],
  children: [
    { id: c.states[0], type: 'atomic', on: { [c.events[0]]: c.states[1] } },
    { id: c.states[1], type: 'atomic', on: { [c.events[1]]: c.states[0] } },
  ],
});
const withPower = (on: StateNode): StateNode => ({
  id: 'player',
  type: 'compound',
  initial: 'off',
  children: [{ id: 'off', type: 'atomic', on: { POWER: 'on' } }, { ...on, id: 'on', on: { POWER: 'off' } }],
});

/**
 * The media player of "Statecharts in 2 minutes": off, and on holding `controls` controls, with POWER
 * written once, on `on`. With one control, `on` holds paused and playing directly; with two, `on` is
 * parallel and each control is a region.
 */
export function player(controls: number): StateNode {
  if (!Number.isInteger(controls) || controls < 1 || controls > CONTROLS.length)
    throw new RangeError(`controls must be 1 to ${CONTROLS.length}`);
  const used = CONTROLS.slice(0, controls);
  return withPower(controls === 1 ? region(used[0]!) : { id: 'on', type: 'parallel', children: used.map(region) });
}

/**
 * The same player when mute works only while playing: the volume states live inside playing, so
 * pausing leaves them and playing starts unmuted again. One PAUSE on playing covers both.
 */
export function muteWhilePlaying(): StateNode {
  const [playback, volume] = CONTROLS as [Control, Control];
  return withPower({
    id: 'on',
    type: 'compound',
    initial: playback.states[0],
    children: [
      { id: playback.states[0], type: 'atomic', on: { [playback.events[0]]: playback.states[1] } },
      { ...region(volume), id: playback.states[1], on: { [playback.events[1]]: playback.states[0] } },
    ],
  });
}

/**
 * The flat machine with one change: its combined states inside a box `on` that carries POWER once,
 * in place of each combined state's own POWER arrow to off. Every other transition is the flat one.
 */
export function boxed(chart: StateNode): StateNode {
  const flat = flatten(chart),
    combos = flat.states.filter((s) => s !== flat.initial);
  const powerOn = flat.transitions.find((t) => t.from === flat.initial && t.event === 'POWER')!;
  for (const c of combos)
    if (!flat.transitions.some((t) => t.from === c && t.event === 'POWER' && t.to === flat.initial))
      throw new Error(`${c} has no POWER arrow to ${flat.initial}`);
  return withPower({
    id: 'on',
    type: 'compound',
    initial: powerOn.to,
    children: combos.map((c) => ({
      id: c,
      type: 'atomic',
      on: Object.fromEntries(flat.transitions.filter((t) => t.from === c && t.to !== flat.initial).map((t) => [t.event, t.to])),
    })),
  });
}

interface Indexed {
  node: StateNode;
  parent: StateNode | null;
  /** Position in document order, for SCXML's ordering of states and transitions. */
  order: number;
}

function index(chart: StateNode): Map<string, Indexed> {
  const nodes = new Map<string, Indexed>();
  const visit = (node: StateNode, parent: StateNode | null) => {
    if (nodes.has(node.id)) throw new Error(`Duplicate state id ${node.id}`);
    nodes.set(node.id, { node, parent, order: nodes.size });
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(chart, null);
  for (const { node } of nodes.values()) {
    if (node.type === 'atomic' && node.children?.length) throw new Error(`${node.id}: atomic with children`);
    if (node.type !== 'atomic' && !node.children?.length) throw new Error(`${node.id}: no children`);
    if (node.type === 'compound' && !node.children!.some((c) => c.id === node.initial))
      throw new Error(`${node.id}: initial is not a child`);
    for (const [event, target] of Object.entries(node.on ?? {}))
      if (!nodes.has(target)) throw new Error(`${node.id}: ${event} targets unknown state ${target}`);
  }
  return nodes;
}

const ancestors = (nodes: Map<string, Indexed>, id: string): StateNode[] => {
  const out: StateNode[] = [];
  for (let p = nodes.get(id)!.parent; p; p = nodes.get(p.id)!.parent) out.push(p);
  return out;
};
const isDescendant = (nodes: Map<string, Indexed>, id: string, of: string) =>
  ancestors(nodes, id).some((a) => a.id === of);

/** The atomic states entered when `node` is entered with no target inside it. */
function enterDefault(node: StateNode): string[] {
  if (node.type === 'atomic') return [node.id];
  if (node.type === 'parallel') return node.children!.flatMap(enterDefault);
  return enterDefault(node.children!.find((c) => c.id === node.initial)!);
}

/** The SCXML transition domain of an external transition: the nearest compound state properly containing both ends. */
function domain(nodes: Map<string, Indexed>, source: string, target: string): StateNode {
  return ancestors(nodes, source).find((a) => a.type === 'compound' && (target === a.id ? false : isDescendant(nodes, target, a.id)))!;
}

/** The atomic states entered by a transition into `target` from inside `from`: target's defaults, and every region a parallel state on the way needs. */
function enterTarget(nodes: Map<string, Indexed>, target: string, from: StateNode): string[] {
  const entered = enterDefault(nodes.get(target)!.node);
  const path = [nodes.get(target)!.node, ...ancestors(nodes, target).filter((a) => isDescendant(nodes, a.id, from.id))];
  for (const p of path) {
    const parent = nodes.get(p.id)!.parent!;
    if (parent.type === 'parallel')
      for (const sibling of parent.children!) if (sibling.id !== p.id) entered.push(...enterDefault(sibling));
  }
  return entered;
}

/** A chart's configuration: its active atomic states, in document order. */
export type Configuration = string[];

export function initial(chart: StateNode): Configuration {
  const nodes = index(chart);
  return sortByOrder(nodes, enterDefault(chart));
}

/**
 * Every state a configuration is in, ancestors included, in document order: not the chart's root,
 * and not the regions a parallel state is divided into, which are drawn as partitions, not boxes.
 */
export function activeStates(chart: StateNode, config: Configuration): string[] {
  const nodes = index(chart);
  const all = config.flatMap((id) => [id, ...ancestors(nodes, id).map((a) => a.id)]);
  return sortByOrder(nodes, all).filter((id) => {
    const { parent } = nodes.get(id)!;
    return parent && parent.type !== 'parallel';
  });
}

const sortByOrder = (nodes: Map<string, Indexed>, ids: string[]) =>
  [...new Set(ids)].sort((a, b) => nodes.get(a)!.order - nodes.get(b)!.order);

export interface Step {
  event: string;
  /** Whether any active state, or an ancestor of one, has a transition for the event. */
  handled: boolean;
  /** The states whose transitions fired, in document order: a child's own transition, or the ancestor's that covers it. */
  sources: string[];
  /** The atomic states left and entered. */
  exited: string[];
  entered: string[];
  config: Configuration;
}

/**
 * Send one event. For each active atomic state, in document order, the transition is the one on
 * the state itself or else its nearest ancestor that has one (SCXML selectTransitions). Two
 * transitions whose exit sets overlap conflict; a descendant's transition preempts its ancestor's,
 * and otherwise the earlier one wins (removeConflictingTransitions). An unhandled event changes nothing.
 */
export function send(chart: StateNode, config: Configuration, event: string): Step {
  const nodes = index(chart);
  const selected: { source: string; target: string }[] = [];
  for (const id of config) {
    const source = [nodes.get(id)!.node, ...ancestors(nodes, id)].find((s) => s.on?.[event] !== undefined);
    if (source && !selected.some((t) => t.source === source.id)) selected.push({ source: source.id, target: source.on![event]! });
  }
  const exitSet = (t: { source: string; target: string }) => {
    const d = domain(nodes, t.source, t.target);
    return config.filter((id) => isDescendant(nodes, id, d.id));
  };
  const kept: typeof selected = [];
  for (const t of selected) {
    let preempted = false;
    for (const k of [...kept]) {
      if (!exitSet(t).some((id) => exitSet(k).includes(id))) continue;
      if (isDescendant(nodes, t.source, k.source)) kept.splice(kept.indexOf(k), 1);
      else preempted = true;
    }
    if (!preempted) kept.push(t);
  }
  if (!kept.length) return { event, handled: false, sources: [], exited: [], entered: [], config: [...config] };
  const exited = sortByOrder(nodes, kept.flatMap(exitSet));
  const entered = sortByOrder(nodes, kept.flatMap((t) => enterTarget(nodes, t.target, domain(nodes, t.source, t.target))));
  return {
    event,
    handled: true,
    sources: sortByOrder(nodes, kept.map((t) => t.source)),
    exited,
    entered,
    config: sortByOrder(nodes, [...config.filter((id) => !exited.includes(id)), ...entered]),
  };
}

/** Send events in turn from the initial configuration. */
export function run(chart: StateNode, events: readonly string[]): Step[] {
  let config = initial(chart);
  return events.map((event) => {
    const step = send(chart, config, event);
    config = step.config;
    return step;
  });
}

/** Every event any state in the chart handles, in document order. */
export function events(chart: StateNode): string[] {
  const out: string[] = [];
  for (const { node } of index(chart).values()) for (const e of Object.keys(node.on ?? {})) if (!out.includes(e)) out.push(e);
  return out;
}

/** The flat state that stands for a configuration: its atomic states joined. */
export const flatName = (config: Configuration) => config.join('_');

export interface FlatMachine {
  /** One state per reachable configuration, in breadth-first order from the initial one. */
  states: string[];
  initial: string;
  /** One transition per configuration and event that some active state handles. */
  transitions: { from: string; event: string; to: string }[];
  /** The configuration each state stands for. */
  configurations: Record<string, Configuration>;
}

/**
 * Flatten a statechart: explore every configuration reachable from the initial one, sending every
 * event the chart names, and record each handled event as a transition between configurations.
 */
export function flatten(chart: StateNode): FlatMachine {
  const alphabet = events(chart);
  const start = initial(chart);
  const queue = [start],
    seen = new Map([[flatName(start), start]]);
  const transitions: FlatMachine['transitions'] = [];
  while (queue.length) {
    const config = queue.shift()!;
    for (const event of alphabet) {
      const step = send(chart, config, event);
      if (!step.handled) continue;
      const to = flatName(step.config);
      if (!seen.has(to)) {
        seen.set(to, step.config);
        queue.push(step.config);
      }
      transitions.push({ from: flatName(config), event, to });
    }
  }
  return { states: [...seen.keys()], initial: flatName(start), transitions, configurations: Object.fromEntries(seen) };
}

export interface Counts {
  /** Named boxes: every state except the chart's root and the regions a parallel state is divided into. */
  states: number;
  /** Transitions written on states: one arrow per state and event. */
  transitions: number;
}

/** What the statechart draws. */
export function chartCounts(chart: StateNode): Counts {
  const nodes = [...index(chart).values()];
  return {
    states: nodes.filter(({ node, parent }) => parent && parent.type !== 'parallel').length,
    transitions: nodes.reduce((n, { node }) => n + Object.keys(node.on ?? {}).length, 0),
  };
}

/** What the flattened machine draws. */
export function flatCounts(flat: FlatMachine): Counts {
  return { states: flat.states.length, transitions: flat.transitions.length };
}

// XState's own answers for every chart the statecharts explainer draws, for test/statecharts.test.ts.
//   node tools/oracle/statecharts.ts <directory holding node_modules/xstate> [--check]
// Install the pinned release there first: npm install --prefix <directory> xstate@5.33.3
// It builds each chart in CHARTS (scenes/explainers/lib/statecharts.ts) as an XState machine, then
// explores it with XState alone: from the initial snapshot, every event XState says the machine
// takes, breadth first, recording each reachable configuration, what `can` reports and where each
// event leads. Rayner's model is not run here; the test compares it with this file.
// --check compares with the committed file instead of writing it.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { player, coffee, coffeeWithFrother, boxed, RUNS } from '../../scenes/explainers/lib/statecharts.ts';
import type { StateNode } from '../../scenes/explainers/lib/statecharts.ts';

export const XSTATE_VERSION = '5.33.3';
export const FIXTURE = new URL('../../test/fixtures/statecharts-xstate.json', import.meta.url);
/** Every chart the explainer draws, by name, with the events it sends that chart. */
export const CHARTS: Readonly<Record<string, { chart: StateNode; run: readonly string[] }>> = {
  coffee: { chart: coffee(), run: RUNS.coffee },
  player: { chart: player(2), run: RUNS.player },
  boxedPlayer: { chart: boxed(player(2)), run: RUNS.player },
  coffeeWithFrother: { chart: coffeeWithFrother(), run: RUNS.frother },
};

/** A chart XState explored: every reachable configuration and where each event it takes leads. */
export interface Explored {
  /** Every event the machine names, as XState lists them. */
  events: string[];
  initial: string[];
  /** Each reachable configuration's active atomic states, in the order XState's snapshot value lists them. */
  configurations: string[][];
  /** [configuration index, event, configuration index], one per event `can` accepts. */
  transitions: [number, string, number][];
}

export interface Expected {
  xstate: string;
  /** Each chart in CHARTS, explored, with its run sent in turn and the active atomic states after each event. */
  charts: Record<string, Explored & { follow: { event: string; can: boolean; config: string[] }[] }>;
  /** PREEMPT, where a child and its parent both handle GO. */
  preempt: Explored;
}

/** A child that handles GO itself, inside a parent that also handles GO: SCXML and XState pick the child's. */
export const PREEMPT: StateNode = {
  id: 'root', type: 'compound', initial: 'a',
  children: [
    { id: 'a', type: 'compound', initial: 'a1', on: { GO: 'b' }, children: [
      { id: 'a1', type: 'atomic', on: { GO: 'a2' } },
      { id: 'a2', type: 'atomic' },
    ] },
    { id: 'b', type: 'atomic' },
  ],
};

/** One chart node as XState machine config; every node gets its id, so targets resolve by `#id`. */
function toXState(node: StateNode): Record<string, unknown> {
  const config: Record<string, unknown> = { id: node.id };
  if (node.type === 'parallel') config.type = 'parallel';
  if (node.initial) config.initial = node.initial;
  if (node.on) config.on = Object.fromEntries(Object.entries(node.on).map(([e, t]) => [e, `#${t}`]));
  if (node.children) config.states = Object.fromEntries(node.children.map((c) => [c.id, toXState(c)]));
  return config;
}

/** The atomic state names in an XState snapshot value, in its own key order. */
function leaves(value: unknown): string[] {
  return typeof value === 'string' ? [value] : Object.values(value as Record<string, unknown>).flatMap(leaves);
}

export async function expected(xstateDir: string): Promise<Expected> {
  const require = createRequire(resolve(xstateDir, 'package.json'));
  const version = (require('xstate/package.json') as { version: string }).version;
  if (version !== XSTATE_VERSION) throw new Error(`Expected xstate ${XSTATE_VERSION}, found ${version}`);
  type Snapshot = { value: unknown; can(event: { type: string }): boolean };
  const x = require('xstate') as {
    createMachine(config: unknown): { events: string[] };
    initialTransition(machine: unknown): [Snapshot, unknown];
    transition(machine: unknown, snapshot: Snapshot, event: { type: string }): [Snapshot, unknown];
  };
  type Machine = { events: string[] };
  const explore = (chart: StateNode): Explored & { machine: Machine; start: Snapshot } => {
    const machine = x.createMachine({ ...toXState(chart), id: chart.id });
    const events = [...machine.events];
    const [start] = x.initialTransition(machine);
    const snapshots = [start],
      configurations = [leaves(start.value)],
      transitions: [number, string, number][] = [];
    const key = (c: string[]) => c.join(' ');
    for (let i = 0; i < snapshots.length; i++) {
      for (const type of events) {
        if (!snapshots[i]!.can({ type })) continue;
        const [next] = x.transition(machine, snapshots[i]!, { type });
        const config = leaves(next.value);
        let j = configurations.findIndex((c) => key(c) === key(config));
        if (j < 0) {
          j = configurations.push(config) - 1;
          snapshots.push(next);
        }
        transitions.push([i, type, j]);
      }
    }
    return { machine, start, events, initial: leaves(start.value), configurations, transitions };
  };
  const charts: Expected['charts'] = {};
  for (const [name, { chart, run }] of Object.entries(CHARTS)) {
    const { machine, start, ...explored } = explore(chart);
    let snapshot = start;
    const follow = run.map((type) => {
      const can = snapshot.can({ type });
      [snapshot] = x.transition(machine, snapshot, { type });
      return { event: type, can, config: leaves(snapshot.value) };
    });
    charts[name] = { ...explored, follow };
  }
  const { machine: _m, start: _s, ...preempt } = explore(PREEMPT);
  return { xstate: version, charts, preempt };
}

if (import.meta.main) {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) throw new Error('usage: node tools/oracle/statecharts.ts <directory holding node_modules/xstate> [--check]');
  const text = JSON.stringify(await expected(dir), null, 1) + '\n';
  if (flag === '--check') {
    if ((await readFile(FIXTURE, 'utf8')) !== text) throw new Error('test/fixtures/statecharts-xstate.json differs from XState');
    console.log('statecharts-xstate.json matches XState', XSTATE_VERSION);
  } else {
    await writeFile(FIXTURE, text);
    console.log('wrote', FIXTURE.pathname);
  }
}

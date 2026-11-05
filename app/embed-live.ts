// The live machine: a reader's events, sent to a scene's machine at the step it last played in.
//
// No DOM here, so Node runs it as the page does. The reader's state is the log of events they
// sent; a picture of it is the scene run again to the live step's resting picture, then the log
// played through `machine.send`, so a frame is still a function of time and a link with the log
// reopens the same picture. See docs/MACHINES.md, "The player".

import { machinesOf, NullSink, StopScene } from '../src/index.ts';
import type { Machine, Scene, SceneClass, SceneState, Sink } from '../src/index.ts';

type AnyMachine = Machine<object, string>;

/** The URL key that holds the reader's events, beside `step` (explain/settings.ts reserves it). */
export const SENT = 'sent';

/** A step where the reader can drive a machine: the machine's place in `machinesOf(scene)`, and the machine. */
export interface Live {
  index: number;
  machine: AnyMachine;
}

/**
 * Where a scene's machines are live: each machine at the step it last played in (`lastPlayedIn`),
 * which is the stage `rayner check` explores it on. A machine that never played is live nowhere;
 * when two machines last played in one step, the later one made is live there.
 */
export function liveSteps(scene: Scene<any>): Map<string, Live> {
  const live = new Map<string, Live>();
  for (const [index, machine] of machinesOf(scene).entries())
    if (machine.lastPlayedIn !== null) live.set(machine.lastPlayedIn, { index, machine });
  return live;
}

/** What one event does from a state, for a button: its kind and the reason the reader is told. */
export type EventOutcome = { event: string; label: string; kind: 'next' } | { event: string; label: string; kind: 'refused' | 'beyond'; reason: string | null };

/** An event's button label: the machine's label for it, else the event itself. */
export const eventLabel = (machine: AnyMachine, event: string): string => machine.spec.labels?.[event] ?? event;

/** Every event of `machine` from `state`, in the machine's order, as its buttons show it. */
export function outcomes(machine: AnyMachine, state: object): EventOutcome[] {
  return machine.spec.events.map((event) => {
    const o = machine.outcome(state, event), label = eventLabel(machine, event);
    return 'next' in o ? { event, label, kind: 'next' as const }
      : 'beyond' in o ? { event, label, kind: 'beyond' as const, reason: o.beyond }
        : { event, label, kind: 'refused' as const, reason: o.refused };
  });
}

/**
 * The longest prefix of `log` the machine accepts from `start`, the state after each kept event,
 * and the first event it stops at, if any: an event the machine does not have, one it refuses,
 * or one beyond the story. A link's log is checked here before anything is drawn.
 */
export function acceptedLog(machine: AnyMachine, start: object, log: readonly string[]): {
  kept: string[];
  states: object[];
  stopped?: { event: string; kind: 'unknown' | 'refused' | 'beyond'; reason: string | null };
} {
  const kept: string[] = [], states: object[] = [start];
  for (const event of log) {
    if (!machine.spec.events.includes(event)) return { kept, states, stopped: { event, kind: 'unknown', reason: null } };
    const o = machine.outcome(states.at(-1)!, event);
    if ('beyond' in o) return { kept, states, stopped: { event, kind: 'beyond', reason: o.beyond } };
    if ('refused' in o) return { kept, states, stopped: { event, kind: 'refused', reason: o.refused } };
    kept.push(event);
    states.push(o.next);
  }
  return { kept, states };
}

/** A log as the URL writes it: events joined by commas, each escaped, with spaces as `+` and colons kept. */
export function encodeLog(log: readonly string[]): string {
  return log.map((e) => encodeURIComponent(e).replaceAll('%20', '+').replaceAll('%3A', ':')).join(',');
}
/** The log a URL's (already decoded) `sent` value holds; empty for none. */
export function decodeLog(value: string | null): string[] {
  return value ? value.split(',') : [];
}

/**
 * Where a reader's log starts: where the step leaves the machine (`rest`), or, when no event can
 * go anywhere from there (the step played every event the story has), the machine's own start,
 * so the reader can send the events again in their own order.
 */
export type LogStart = 'rest' | 'start';
/** Where the log starts for a machine whose state at the step's resting picture is `rest`; null when no event goes anywhere from either. */
export function logStart(machine: AnyMachine, rest: object): { from: LogStart; state: object } | null {
  const moves = (state: object) => machine.spec.events.some((e) => 'next' in machine.outcome(state, e));
  if (moves(rest)) return { from: 'rest', state: rest };
  const start = JSON.parse(JSON.stringify(machine.spec.start)) as object;
  return moves(start) ? { from: 'start', state: start } : null;
}

/** The step a live run stops in: its name, and when its picture stops changing (`hold`, else its end). */
export interface LiveStepTimes {
  step: string;
  t1?: number | null;
  hold?: number | null;
}

export interface LiveRun {
  scene: Scene<any>;
  machine: AnyMachine;
  /** The scene's state at the step's resting picture (JSON). */
  rest: object;
  /** What the scene shows after the log (`describeShown()`), for the stage's description. */
  shown: SceneState;
}

/**
 * Run `Source` to the resting picture of `step`, where machine `index` is live, then play `log`
 * through `machine.send` (from the machine's start, its views redrawn there, when `from` is
 * 'start' and the log is not empty), every frame skipped; `sink` then draws the picture the log lands on.
 * With `animate`, the last event plays through that sink instead, frame by frame from the picture
 * before it (drawn at dt 0, after which `onStart` is called), and then lands. `onRest` sees the
 * scene at the step's resting picture, before any event (the review compares a state with it).
 *
 * The run stops in the live step as soon as its picture stops changing: at the end of the play or
 * wait that reaches the step's hold (or its end), or as the step ends. Code a scene runs between
 * its last play and its next step never runs, so it cannot change the stage the reader drives.
 * The machine plays under what the scene showed when it played (`playedUnder`), as exploration
 * draws it. A log the machine does not accept throws, as `send` does.
 */
export async function runLive(
  Source: SceneClass,
  times: LiveStepTimes,
  index: number,
  log: readonly string[],
  { sink, animate, onStart, onRest, from = 'rest' }: { sink?: Sink; animate?: Sink; onStart?: () => void; onRest?: (scene: Scene<any>) => void; from?: LogStart } = {},
): Promise<LiveRun> {
  const end = times.hold ?? times.t1 ?? Infinity;
  let result: LiveRun | undefined;
  const Base = Source as unknown as new (sink: Sink, opts?: { skipUntil?: number }) => Scene<any>;
  class Live extends Base {
    reached = false;
    async reach(): Promise<void> {
      this.reached = true;
      const machine = machinesOf(this)[index];
      if (!machine) throw new Error(`No machine ${index} was made by the step "${times.step}"; a scene must make the same machines each run`);
      if (machine.playedUnder && JSON.stringify(machine.playedUnder) !== JSON.stringify(this.shown)) this.shown = machine.playedUnder;
      const rest = JSON.parse(JSON.stringify(this.state)) as object;
      onRest?.(this);
      // From the machine's start: its views redrawn there, in place, as exploration draws a state.
      if (from === 'start' && log.length) {
        this.state = JSON.parse(JSON.stringify(machine.spec.start)) as object;
        for (const view of machine.spec.views) view.rebuild();
      }
      for (const [i, event] of log.entries()) {
        if (animate && i === log.length - 1) {
          this.sink = animate;
          this.skipUntil = 0;
          await animate.frame(this, 0);
          onStart?.();
        }
        await this.play(machine.send(event));
      }
      const drawn = animate ?? sink;
      if (drawn) await drawn.frame(this, 0);
      result = { scene: this, machine, rest, shown: this.describeShown() };
      throw new StopScene();
    }
    private due(): boolean {
      // Within half a frame: a trace rounds its times.
      return !this.reached && this.currentStep?.path === times.step && this.time + 0.5 / this.fps >= end;
    }
    override async play(...args: Parameters<Scene['play']>): Promise<void> {
      await super.play(...args);
      if (this.due()) await this.reach();
    }
    override async wait(seconds?: number): Promise<void> {
      await super.wait(seconds);
      if (this.due()) await this.reach();
    }
    override async endCurrentStep(): Promise<void> {
      if (!this.reached && this.currentStep?.path === times.step) await this.reach();
      return super.endCurrentStep();
    }
  }
  await new Live(new NullSink(), { skipUntil: Infinity }).run();
  if (!result) throw new Error(`The scene never reached the step "${times.step}"`);
  return result;
}

type Entry = { what: string; marked?: Record<string, string[]>; items?: string[] };
/**
 * What an event changed of the picture, in words: each described thing whose description differs
 * from the one in the same place before (its words and its emphasised parts), joined. Empty when
 * no description changed. What a screen reader hears after an event, rather than the whole picture.
 */
export function pictureChange(before: unknown, after: unknown): string {
  const entries = (shown: unknown): Entry[] => (shown as { picture?: { entries?: Entry[] } } | undefined)?.picture?.entries ?? [];
  const was = entries(before);
  return entries(after)
    .filter((e, i) => JSON.stringify(e) !== JSON.stringify(was[i]))
    .map((e) => [e.what, ...Object.entries(e.marked ?? {}).flatMap(([word, names]) => names.map((n) => `${n} (${word})`))].join(', ').replace(/[.;,]+$/, ''))
    .join('; ');
}

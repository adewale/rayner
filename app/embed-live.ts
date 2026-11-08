// The live machine: a reader's events, sent to a scene's machine at the step it last played in.
//
// No DOM here, so Node runs it as the page does. The reader's state is the log of events they
// sent; a picture of it is the scene run again to the live step's resting picture, then the log
// played through `machine.send`, so a frame is still a function of time and a link with the log
// reopens the same picture. See docs/MACHINES.md, "The player".

import { NullSink, StopScene } from '../src/output.ts';
import { machinesOf } from '../explain/machine.ts';
import type { Scene, SceneClass, SceneState, Sink } from '../src/index.ts';
import type { Machine } from '../explain/machine.ts';
import { PAGE_QUERY } from '../explain/settings.ts';

type AnyMachine = Machine<object, string>;

/** The URL key that holds the reader's events, beside `step` (explain/settings.ts PAGE_QUERY). */
export const SENT = PAGE_QUERY.sent;

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
  /** What the scene shows after the log (`shownJson()`), for the stage's description. */
  shown: SceneState;
  /** With `keep`, the run held at this picture, to play the reader's next event from it. */
  session?: LiveSession;
}

/** How a kept run's next event is drawn: as `runLive` draws a log's last event. */
export interface LiveDraw {
  sink?: Sink;
  animate?: Sink;
  onStart?: () => void;
}
/**
 * A live run held at the picture its log lands on (`runLive` with `keep`). `send` plays one more
 * event from there, as a fresh run of the longer log would play its last event, without running
 * the scene to the step again. A send that fails (a sink aborted mid-play, say) closes the
 * session, since its scene may have stopped part-way; start a fresh run then.
 */
export interface LiveSession {
  /** The events played so far, from where the log starts. */
  readonly log: readonly string[];
  /** False once closed or failed. */
  readonly open: boolean;
  /** True while a send plays. */
  readonly busy: boolean;
  send(event: string, draw?: LiveDraw): Promise<LiveRun>;
  close(): void;
}

/**
 * Run `Source` to the resting picture of `step`, where machine `index` is live, then play `log`
 * through `machine.send` (from the machine's start, its views redrawn there, when `from` is
 * 'start' and the log is not empty), every frame skipped; `sink` then draws the picture the log lands on.
 * With `animate`, the last event plays through that sink instead, frame by frame from the picture
 * before it (drawn at dt 0, after which `onStart` is called), and then lands. `onRest` sees the
 * scene at the step's resting picture, before any event (the review compares a state with it).
 * With `keep`, the run is held at the picture the log lands on, as the result's `session`.
 *
 * The run stops in the live step as soon as its picture stops changing: at the end of the play or
 * wait that reaches the step's hold (or its end), or as the step ends. Code a scene runs between
 * its last play and its next step never runs, so it cannot change the stage the reader drives.
 * The machine plays under what the scene showed when it last played (`playedUnder`), as exploration
 * draws it. A log the machine does not accept throws, as `send` does.
 */
export async function runLive(
  Source: SceneClass,
  times: LiveStepTimes,
  index: number,
  log: readonly string[],
  { sink, animate, onStart, onRest, from = 'rest', keep = false }: LiveDraw & { onRest?: (scene: Scene<any>) => void; from?: LogStart; keep?: boolean } = {},
): Promise<LiveRun> {
  const end = times.hold ?? times.t1 ?? Infinity;
  let result: LiveRun | undefined;
  // A kept run waits in the step for the next event; `wake` hands it one, or null to stop.
  type Command = { event: string; draw: LiveDraw; done: (run: LiveRun) => void; failed: (error: unknown) => void };
  let wake: ((command: Command | null) => void) | null = null, held!: () => void;
  const holding = new Promise<void>((resolve) => (held = resolve));
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
      result = { scene: this, machine, rest, shown: this.shownJson() };
      if (!keep) throw new StopScene();
      const kept = (result.session = session(log));
      // A session closed while it played lets the run end once that play is done.
      while (kept.open) {
        const command = await new Promise<Command | null>((resolve) => {
          wake = resolve;
          held();
        });
        if (!command) break;
        const { event, draw } = command;
        try {
          // As a fresh run plays a log's last event: animated from the picture now, or skipped, then drawn.
          if (draw.animate) {
            this.sink = draw.animate;
            this.skipUntil = 0;
            await draw.animate.frame(this, 0);
            draw.onStart?.();
          } else {
            this.sink = new NullSink();
            this.skipUntil = Infinity;
          }
          await this.play(machine.send(event));
          const landing = draw.animate ?? draw.sink;
          if (landing) await landing.frame(this, 0);
          command.done({ scene: this, machine, rest, shown: this.shownJson() });
        } catch (error) {
          command.failed(error);
          break;
        }
      }
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
  function session(played: readonly string[]): LiveSession {
    const s = {
      log: [...played] as readonly string[],
      open: true,
      busy: false,
      send(event: string, draw: LiveDraw = {}): Promise<LiveRun> {
        if (!s.open || s.busy || !wake) return Promise.reject(new Error('This live session is closed or busy; start a fresh run'));
        s.busy = true;
        const go = wake;
        wake = null;
        return new Promise<LiveRun>((done, failed) => go({ event, draw, done, failed })).then(
          (run) => { s.busy = false; s.log = [...s.log, event]; return run; },
          (error: unknown) => { s.busy = false; s.open = false; throw error; },
        );
      },
      close() {
        s.open = false;
        const go = wake;
        wake = null;
        go?.(null);
      },
    };
    return s;
  }
  const running = new Live(new NullSink(), { skipUntil: Infinity }).run();
  if (keep) {
    // The run stays in the step; it is enough that it got there.
    void running.catch(() => {});
    await Promise.race([holding, running]);
  } else await running;
  if (!result) throw new Error(`The scene never reached the step "${times.step}"`);
  return result;
}


/**
 * The reader's exploration of the step on show: none, or live at a step (`now`: the step, its
 * machine and where its log starts) with the events sent there (`log`) and the run held at their
 * picture (`session`, null when none is held). The player keeps one such value; `explore` is its
 * only transition, and `exploreAndClose` the one the player applies.
 */
export type Exploration<N> = { kind: 'none' } | { kind: 'live'; now: N; log: readonly string[]; session: LiveSession | null };
/**
 * What changes the exploration: the reader sends an event, takes the last one back (`undo`), takes
 * them all back (`reset`), a step opens live with a log (`link`, a link's kept events or none),
 * a run is held at the log's picture (`held`), or the reader leaves the step (`leave`: another
 * step, Next, another scenario).
 */
export type ExploreAction<N> =
  | { kind: 'send'; event: string }
  | { kind: 'undo' }
  | { kind: 'reset' }
  | { kind: 'link'; now: N; log: readonly string[] }
  | { kind: 'held'; session: LiveSession }
  | { kind: 'leave' };

const sameLog = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((e, i) => e === b[i]);

/**
 * The exploration after `action`. A held run stays only while it can play the reader's next event:
 * a send keeps it when it is idle at the log before the event, and every other change drops it
 * (Undo and Reset go back past its picture; a send while it still plays, an animated landing cut
 * short, starts a fresh run). A run held for a log other than the one on show is not taken.
 * Sending, Undo and Reset when nothing is live, and Undo and Reset with nothing sent, change nothing.
 */
export function explore<N>(live: Exploration<N>, action: ExploreAction<N>): Exploration<N> {
  switch (action.kind) {
    case 'leave':
      return { kind: 'none' };
    case 'link':
      return { kind: 'live', now: action.now, log: [...action.log], session: null };
  }
  if (live.kind === 'none') return live;
  switch (action.kind) {
    case 'send': {
      const s = live.session,
        keep = s && s.open && !s.busy && sameLog(s.log, live.log) ? s : null;
      return { ...live, log: [...live.log, action.event], session: keep };
    }
    case 'undo':
      return live.log.length ? { ...live, log: live.log.slice(0, -1), session: null } : live;
    case 'reset':
      return live.log.length ? { ...live, log: [], session: null } : live;
    case 'held':
      return action.session.open && sameLog(action.session.log, live.log) ? { ...live, session: action.session } : live;
  }
}

/**
 * `explore`, then close every held run the result does not hold: the one held before, and one
 * handed in that was not taken. Each closed run's scene, paused in the step with its mobjects and
 * its suspended `construct`, can then be collected.
 */
export function exploreAndClose<N>(live: Exploration<N>, action: ExploreAction<N>): Exploration<N> {
  const next = explore(live, action),
    kept = next.kind === 'live' ? next.session : null;
  for (const s of [live.kind === 'live' ? live.session : null, action.kind === 'held' ? action.session : null])
    if (s && s !== kept) s.close();
  return next;
}

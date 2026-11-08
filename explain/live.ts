// A live step: where a scene's machine is live, and a run of the scene to that step with a reader's
// events played on it.
//
// No DOM here, so the command and the tests run it as the page does. A picture of a reader's log is
// the scene run again to the live step's end, then the log played through `machine.send`, so a
// frame is still a function of time and a link with the log reopens the same picture. `rayner check`
// explores a machine from the same run, so the state a reader's events start from is the state check
// explored. See docs/MACHINES.md, "The player".

import type { Scene, SceneClass, SceneState, Sink } from '../src/scene.ts';
import { canonicalJson } from '../src/json.ts';
import { machinesOf } from './machine.ts';
import type { Machine } from './machine.ts';

type AnyMachine = Machine<object, string>;

/**
 * Which machine is live at a step, as JSON: its place in `machinesOf(scene)` and its identity (its
 * events, start and views' keys). The build ships the default scenario's places to the page.
 */
export interface LivePlace {
  index: number;
  identity: string;
}
/** A step where the reader can drive a machine: its place, and the machine. */
export interface Live extends LivePlace {
  machine: AnyMachine;
}

/**
 * Where a scene's machines are live: each machine, with its place in `machinesOf(scene)`, by the
 * step it last played in (`lastPlayedIn`), which is the stage `rayner check` explores it on. A
 * machine that never played is live nowhere; when two machines last played in one step, the later
 * one made is live there.
 */
export function liveSteps(scene: Scene<any>): Map<string, Live> {
  const live = new Map<string, Live>();
  for (const [index, machine] of machinesOf(scene).entries())
    if (machine.lastPlayedIn !== null) live.set(machine.lastPlayedIn, { index, identity: machine.identity, machine });
  return live;
}

/**
 * The machine at `place` in a run that reached `step`, refused unless it has the place's identity:
 * a scene must make the same machines on every run, or the reader would drive another machine than
 * the one the page was built for and check explored.
 */
export function liveMachine(scene: Scene<any>, step: string | null, place: LivePlace): AnyMachine {
  const machine = machinesOf(scene)[place.index];
  if (!machine || machine.identity !== place.identity)
    throw new Error(`runLive(): the run${step === null ? '' : ` to ${JSON.stringify(step)}`} made different machines; a scene must make the same machines on every run`);
  return machine;
}

/**
 * Where a reader's log starts: where the step leaves the machine (`rest`, the state as the step
 * ends), or, when no event can go anywhere from there (the step played every event the story has),
 * the machine's own start, so the reader can send the events again in their own order.
 */
export type LogStart = 'rest' | 'start';
/** Where the log starts for a machine whose state as the step ends is `rest`; null when no event goes anywhere from either. */
export function logStart(machine: AnyMachine, rest: object): { from: LogStart; state: object } | null {
  const moves = (state: object) => machine.spec.events.some((e) => 'next' in machine.outcome(state, e));
  if (moves(rest)) return { from: 'rest', state: rest };
  const start = JSON.parse(JSON.stringify(machine.spec.start)) as object;
  return moves(start) ? { from: 'start', state: start } : null;
}

/**
 * Where a reader's log starts at `step`, where the machine at `place` is live: `Source` run to the
 * step's end (`runLive`, with no log), and `logStart` of the run's machine there. `base` is null when
 * no event moves the machine from either. The player, the build, the review and the cost
 * measurement all start the reader here.
 */
export async function liveBase(Source: SceneClass, step: string, place: LivePlace): Promise<{ machine: AnyMachine; base: { from: LogStart; state: object } | null }> {
  const { machine, rest } = await runLive(Source, step, place, []);
  return { machine, base: logStart(machine, rest) };
}

/**
 * What `explore` is handed at the live step's end (`runLive` with `explore`): the scene, which may
 * still play there, the live machine, and `draw`, which hands the frames that follow to a sink,
 * every one drawn, or with none skips them again.
 */
export type LiveExplore = (scene: Scene<any>, machine: AnyMachine, draw: (to?: Sink) => void) => Promise<void>;

export interface LiveRun {
  scene: Scene<any>;
  machine: AnyMachine;
  /** The scene's state as the live step ends, before any event (JSON): where the reader's log starts from. */
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
 * The one sink a live run's scene draws into, which the run points elsewhere: it skips every frame
 * (`skipUntil`, which the scene reads) until an event is to be animated, then hands that event's
 * frames to the sink that animates it. So the run switches what is drawn without writing the
 * scene's own sink or skip time. Step boundaries are not passed on: the run stops as its step ends.
 * `rayner check` draws through one too, to play the transitions of a machine that never played.
 */
export class LiveSink implements Sink {
  skipUntil = Infinity;
  private to: Sink | null = null;
  /** Hand the frames that follow to `to`, every one drawn; or, with none, skip them. */
  draw(to: Sink | undefined): void {
    this.to = to ?? null;
    this.skipUntil = to ? 0 : Infinity;
  }
  async frame(scene: Scene, dt: number): Promise<void> { await this.to?.frame(scene, dt); }
}

/**
 * Run `Source` to the end of `step`, where the machine at `place` is live, then play `log` through
 * `machine.send` (from the machine's start, its views redrawn there, when `from` is 'start' and the
 * log is not empty), every frame skipped; `sink` then draws the picture the log lands on.
 * With `animate`, the last event plays through that sink instead, frame by frame from the picture
 * before it (drawn at dt 0, after which `onStart` is called), and then lands. `onRest` sees the
 * scene as the step ends, before any event (the review compares a state with it).
 * With `keep`, the run is held at the picture the log lands on, as the result's `session`.
 *
 * The run stops as the step ends (`Scene.stopAt`): after its end listeners and caption hold, with
 * the code the scene runs after the step's last play run, so the scene is as the trace's `after`
 * records it, and `rayner check` explores the machine from that same run. Its picture is the step's
 * resting picture, the one a link shows (check holds a step's picture still from its still frame to
 * its end). The scene is then stopped for good (`phase` is `'stopped'`).
 * The machine is the run's machine at `place.index`, refused unless it has `place.identity`
 * (`liveMachine`), so the reader never drives another. It plays under what the scene showed when it
 * last played (`playedUnder`), as exploration draws it. A log the machine does not accept throws, as
 * `send` does.
 * With `explore`, the run calls it there once the log has played and been drawn, before a kept run
 * holds (see LiveExplore): `rayner check` explores the machine in it, playing each transition in a
 * play of the scene, as a reader's event plays.
 */
export async function runLive(
  Source: SceneClass,
  step: string,
  place: LivePlace,
  log: readonly string[],
  { sink, animate, onStart, onRest, from = 'rest', keep = false, explore }: LiveDraw & { onRest?: (scene: Scene<any>) => void; from?: LogStart; keep?: boolean; explore?: LiveExplore } = {},
): Promise<LiveRun> {
  let result: LiveRun | undefined;
  // A kept run waits in the step for the next event; `wake` hands it one, or null to stop.
  type Command = { event: string; draw: LiveDraw; done: (run: LiveRun) => void; failed: (error: unknown) => void };
  let wake: ((command: Command | null) => void) | null = null, held!: () => void;
  const holding = new Promise<void>((resolve) => (held = resolve));
  // Run there as a seek does, every frame skipped; the scene stops itself as the step ends, and
  // plays the log there (see Scene.stopAt).
  const out = new LiveSink();
  const scene = new Source(out) as Scene<any>;
  scene.stopAt(step, async (at) => {
    const machine = liveMachine(at, step, place);
    if (machine.playedUnder && canonicalJson(machine.playedUnder) !== canonicalJson(at.shown)) at.shown = machine.playedUnder;
    const rest = JSON.parse(JSON.stringify(at.state)) as object;
    onRest?.(at);
    // From the machine's start: its views redrawn there, in place, as exploration draws a state.
    if (from === 'start' && log.length) {
      at.state = JSON.parse(JSON.stringify(machine.spec.start)) as object;
      for (const view of machine.spec.views) view.rebuild();
    }
    for (const [i, event] of log.entries()) {
      if (animate && i === log.length - 1) {
        out.draw(animate);
        await animate.frame(at, 0);
        onStart?.();
      }
      await at.play(machine.send(event));
    }
    const drawn = animate ?? sink;
    if (drawn) await drawn.frame(at, 0);
    result = { scene: at, machine, rest, shown: at.shownJson() };
    if (explore) {
      try { await explore(at, machine, (to) => out.draw(to)); } finally { out.draw(undefined); }
    }
    if (!keep) return;
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
        out.draw(draw.animate);
        if (draw.animate) {
          await draw.animate.frame(at, 0);
          draw.onStart?.();
        }
        await at.play(machine.send(event));
        const landing = draw.animate ?? draw.sink;
        if (landing) await landing.frame(at, 0);
        command.done({ scene: at, machine, rest, shown: at.shownJson() });
      } catch (error) {
        command.failed(error);
        break;
      }
    }
  });
  function session(played: readonly string[]): LiveSession {
    const s = {
      log: [...played] as readonly string[],
      open: true,
      busy: false,
      send(event: string, draw: LiveDraw = {}): Promise<LiveRun> {
        if (!s.open || s.busy || !wake) return Promise.reject(new Error('session.send(): this live session is closed or busy; start a fresh run'));
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
  const running = scene.run();
  if (keep) {
    // The run stays in the step; it is enough that it got there.
    void running.catch(() => {});
    await Promise.race([holding, running]);
  } else await running;
  if (!result) throw new RangeError(`runLive(): the scene never reached the step ${JSON.stringify(step)}; give a step the scene's run reaches`);
  return result;
}

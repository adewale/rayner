// An invariant of the picture, checked on every frame: the supported way to say what must stay
// true while things move, and a sink of your own that checks it, as `rayner check` does. The same dot
// goes half way round a circle twice: sampled from its angle it stays on the circle; morphed between
// its two ends it cuts across, and the invariant names the frames where it does.
import { Scene, Circle, Dot, Transform, linear, keyed } from 'rayner';
import { view } from 'rayner/explain';
import type { SceneClass, Sink } from 'rayner';

const RADIUS = 2;

/** The dot half way round the circle, one way or the other, holding on every frame that it stays on it. */
function orbit(turn: 'sampled' | 'morphed'): SceneClass {
  return class Orbit extends Scene<{ angle: number }, {}> {
    override async construct() {
      const dotAt = (angle: number) => keyed(new Dot({ radius: 0.12 }).moveTo([RADIUS * Math.cos(angle), RADIUS * Math.sin(angle)]), 'orbit:dot');
      // Sampled, the dot is a view of the angle in the state; morphed, a dot moved from end to end.
      this.state = { angle: 0 };
      const sampled = turn === 'sampled' ? view(this, (st) => dotAt(st.angle), { place: false }) : null;
      const dot = sampled ?? dotAt(0);
      this.add(new Circle({ radius: RADIUS }), dot);
      // Read by key, changing nothing: a message when it fails, true when it held, nothing
      // when the part is not there to check. An invariant that never holds is reported as vacuous.
      this.addInvariant('the dot stays on its circle', (scene) => {
        const dot = scene.find('orbit:dot');
        if (!dot) return;
        const [x, y] = dot.center();
        const off = Math.abs(Math.hypot(x, y) - RADIUS);
        return off <= 1e-3 || `the dot is ${off.toFixed(3)} off its circle`;
      });
      await this.step('turn');
      const turning = { runTime: 1, rateFunc: linear };
      await this.play(sampled ? sampled.tween((t) => ({ angle: Math.PI * t }), turning) : new Transform(dot, dot.copy().moveTo([-RADIUS, 0]), turning));
      await this.step('result', { caption: turn === 'sampled' ? 'Evaluated from its angle, the dot stayed on the circle.' : 'Morphed between its ends, the dot cut across the circle.' });
      await this.wait(0.2);
    }
  };
}
export const SampledOrbit = orbit('sampled');
export const MorphedOrbit = orbit('morphed');
export default SampledOrbit;

/** One frame on which an invariant did not hold: what it said, and where in the run. */
export interface InvariantFailure {
  invariant: string;
  /** The step running, or null before the first. */
  step: string | null;
  frame: number;
  t: number;
  message: string;
}

/**
 * Play a scene in full and return every frame an invariant failed on, how many frames each was
 * checked and held on, and those that never held: they found nothing to check. The sink is the
 * pattern for a check of your own: it reads the scene on every frame (`scene.invariants`, each a
 * function of the scene) and changes nothing, then hands the frame on to `inner`, so the same run
 * can also render, trace or sample motion. By default `inner` draws nothing. It sets no
 * `skipUntil`, so every frame is computed and checked.
 */
export async function invariantFailures(SceneClass: SceneClass, inner: Sink = { skipUntil: Infinity, async frame() {} }): Promise<{ failures: InvariantFailure[]; checked: Record<string, number>; held: Record<string, number>; vacuous: string[] }> {
  const failures: InvariantFailure[] = [], checked = new Map<string, number>(), held = new Map<string, number>();
  const count = (tally: Map<string, number>, name: string) => tally.set(name, (tally.get(name) ?? 0) + 1);
  const sink: Sink = {
    async frame(scene, dt) {
      for (const [invariant, holds] of scene.invariants) {
        count(checked, invariant);
        let result: unknown;
        // A check that throws fails with what it threw.
        try { result = holds(scene); } catch (e) { result = `threw ${e instanceof Error ? e.message : String(e)}`; }
        if (typeof result === 'string') failures.push({ invariant, step: scene.currentStep?.name ?? null, frame: scene.frameCount, t: scene.time, message: result });
        else if (result === true) count(held, invariant);
      }
      await inner.frame(scene, dt);
    },
    async stepBegin(scene, step) { await inner.stepBegin?.(scene, step); },
    async stepEnd(scene, step) { await inner.stepEnd?.(scene, step); },
  };
  await new SceneClass(sink).run();
  return {
    failures, checked: Object.fromEntries(checked), held: Object.fromEntries(held),
    vacuous: [...checked.keys()].filter((name) => !held.get(name)),
  };
}

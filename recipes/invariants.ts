// An invariant of the picture, checked on every frame: the supported way to say what must stay
// true while things move, and a sink that checks it. The same dot goes half way round a circle
// twice: sampled from its angle it stays on the circle; morphed between its two ends it cuts
// across, and the invariant names the frames where it does.
import { Scene, Circle, Dot, Transform, linear, keyed } from 'rayner';
import { view } from 'rayner/explain';
import { NullSink } from 'rayner/output';
import { InvariantSink } from 'rayner/testing';
import type { SceneClass, Sink } from 'rayner';
import type { InvariantFailure } from 'rayner/testing';

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

/**
 * Play a scene in full and return every frame an invariant failed on, with how many frames
 * each was checked on. InvariantSink hands each frame on to `inner`, so the same run can
 * also render, trace or sample motion: this is how `rayner check` runs it beside its own sink.
 */
export async function invariantFailures(SceneClass: SceneClass, inner: Sink = new NullSink()): Promise<{ failures: InvariantFailure[]; checked: Record<string, number>; held: Record<string, number>; vacuous: string[] }> {
  const sink = new InvariantSink(inner);
  await new SceneClass(sink).run();
  return { failures: sink.failures, checked: Object.fromEntries(sink.checked), held: Object.fromEntries(sink.held), vacuous: sink.vacuous() };
}

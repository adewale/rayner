import assert from 'node:assert/strict';
import { TraceSink } from '../../src/trace.ts';
import type { Scene, SceneClass, SceneState, Step } from '../../src/scene.ts';
import type { Mobject } from '../../src/mobject.ts';
import { viewMismatch } from '../../src/view.ts';
import type { View } from '../../src/view.ts';

/** A trace sink that also checks, at the end of every step, the View against the state just traced. */
class ShownSink extends TraceSink {
  /** Per step: null before the View exists, else viewMismatch's answer (null when they agree). */
  checks: Array<{ mismatch: string | null } | null> = [];
  pick: (scene: Scene) => View | null | undefined;
  draw?: (state: SceneState) => Mobject;
  constructor(pick: (scene: Scene) => View | null | undefined, draw?: (state: SceneState) => Mobject) { super(); this.pick = pick; this.draw = draw; }
  override async stepEnd(scene: Scene, s: Step): Promise<void> {
    await super.stepEnd(scene, s);
    const v = this.pick(scene);
    if (!v) { this.checks.push(null); return; }
    const draw = this.draw ?? v.draw;
    // The state this step's trace entry records as `after`
    this.checks.push({ mismatch: viewMismatch(v, this.events.at(-1)!.state, draw) });
  }
}

/**
 * Named pattern, picture side: at the end of every step, the View `pick`
 * finds shows what `draw` (default: the View's own) makes of that step's
 * traced `after` state (viewMismatch). The state side is assertStepState / the
 * fidelity replays; this says the picture tells the same story. Returns the
 * number of steps checked (steps before the View exists are skipped).
 */
export async function assertViewFollowsState(
  SceneClass: SceneClass,
  pick: (scene: Scene) => View | null | undefined,
  draw?: (state: SceneState) => Mobject,
): Promise<number> {
  const sink = new ShownSink(pick, draw);
  const scene = new SceneClass(sink, { skipUntil: Infinity });
  await scene.run();
  const steps = sink.steps();
  let checked = 0;
  steps.forEach((s, i) => {
    const c = sink.checks[i];
    if (!c) return;
    assert.equal(c.mismatch, null, `step "${s.step}": ${c.mismatch}`);
    checked++;
  });
  assert.ok(checked > 0, 'the View existed at the end of some step');
  return checked;
}

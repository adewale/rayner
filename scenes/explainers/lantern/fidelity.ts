import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { smooth } from '../../../src/index.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { walks }: FidelityRun): Promise<void> {
  assert.ok(walks.some((w) => w.from === 'Clock' && w.to === 'Browser'));
  assert.ok(walks.some((w) => w.from === 'Clock' && w.to === 'Trace'));
  // Independent expectation for the tiny scene: a 0.5 s fade (frames 1-15), then a 1 s move
  // (frames 16-45). Blending matches playback at every frame; the nudge moves once per
  // computed frame, so playback has made 15 nudges at t = 1 s and the seek has made one, and
  // only the fade's frames and the move's first frame match.
  const nudge = values.motion === 'nudge';
  assertStepState(trace, 'seek', {
    seek: {
      ...(trace.steps.find((s) => s.step === 'seek')!.after!.seek as object),
      motion: values.motion,
      match: !nudge,
      playedMoves: nudge ? 15 : 0,
      seekedMoves: nudge ? 1 : 0,
    },
  });
  assertStepState(trace, 'check', { check: { frames: 45, matched: { blend: 45, nudge: 16 } } });
  // The timeline plots the dot's x at every frame, played and seeked. Independently: still at
  // -6 through the fade; then played, blending eases from -6 to 6 by smooth((f - 15) / 30) and
  // the nudge adds 0.4 per frame; seeked, blending lands where playback is and the nudge has
  // made its one step, to -5.6, at every frame of the move.
  const x = (v: number) => +v.toFixed(3) + 0;
  const frames = Array.from({ length: 45 }, (_, i) => i + 1);
  const blended = frames.map((f) => x(f <= 15 ? -6 : -6 + 12 * smooth((f - 15) / 30)));
  assertStepState(trace, 'timeline', {
    timeline: {
      frames: 45,
      moveStarts: 16,
      played: { blend: blended, nudge: frames.map((f) => x(f <= 15 ? -6 : -6 + 0.4 * (f - 15))) },
      seeked: { blend: blended, nudge: frames.map((f) => x(f <= 15 ? -6 : -5.6)) },
    },
  });
}

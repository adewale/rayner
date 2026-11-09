import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../explain/testing.ts';
import { WORLD, TITLE, HAND, timelineFacts, hershey } from './model.ts';

/** Counts come from the world's text, letters from Hershey Simplex; no scenery on owned paper; ink stays near its marks. */
export function check(trace: Trace): void {
  const facts = timelineFacts(WORLD);
  assertStepState(trace, 'text', { periods: facts.length });
  const after = (step: string) => trace.steps.find((s) => s.step === step)!.after;
  const marks = after('marks').marks as { words: number };
  assert.equal(marks.words, facts.reduce((n, f) => n + 1 + f.events.length, 0));
  const strayBound = HAND.tremor * Math.SQRT2 * 2;
  assert.ok((after('hand').hand as { stray: number }).stray <= strayBound);
  // The scenery is drawn with the plate, around the chart's owned paper.
  assertStepState(trace, 'plate', {
    scene: { layers: ['hills', 'sea', 'rock', 'lighthouse', 'beam', 'gulls'], trespass: 0 },
  });
  // The failure and the fix, from the same hand: boxes a free hand places drift apart between two
  // seeds by far more than two drawings that trace one fixed route ever differ.
  const drift = after('reader-drift') as { apart: number[] };
  const fixed = after('reader-separate') as { stray: number; between: number };
  assert.ok(fixed.stray <= strayBound && fixed.between <= 2 * strayBound);
  assert.ok(Math.max(...drift.apart) > 50 * fixed.between, `drift ${drift.apart} against ${fixed.between}`);
  const plate = after('plate').plate as { objects: number; stray: number; letters: number };
  assert.equal(plate.objects, facts.length * 3 + 1);
  assert.ok(plate.stray <= strayBound, `stray ${plate.stray}`);
  // The ending: the same free hand on the real plate leaves words outside the boxes it draws round them,
  // and its boxes drift by far more than two traced drawings ever differ.
  const free = after('freehand').freehand as { misses: number; words: number; maxOff: number };
  assert.equal(free.words, marks.words);
  assert.ok(free.misses >= 1 && free.misses <= free.words, `misses ${free.misses}`);
  assert.ok(free.maxOff > 50 * fixed.between, `free-hand drift ${free.maxOff} against ${fixed.between}`);
  const words = [...facts.flatMap((f) => [f.period, ...f.events]), TITLE];
  assert.equal(plate.letters, words.reduce((n, w) => n + hershey(w).strokes.length, 0));
}

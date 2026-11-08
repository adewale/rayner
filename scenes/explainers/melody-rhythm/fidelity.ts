import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import {assertStepState} from '../../../test/lib/explainer-state.ts';
import {musicStory} from './model.ts';
import type {Timing} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model.
    assert.equal(step.after.phase,undefined,`melody-rhythm/${step.step}: no phase in the model`);
  }
  // One tempo, 96 BPM: the tempo setting changed no conclusion and is gone.
  assert.equal(values.tempo,undefined);
  const m=musicStory(values.timing as Timing,96);
  for(const step of trace.steps) {
    const clips=step.step==='rhythm'?m.flat:m.clips;
    assertStepState(trace,step.step,{clips,bpm:m.bpm,beatMs:m.beatMs,timing:m.timing,movedStarts:m.movedStarts,movedDurations:m.movedDurations,
      crossing:clips[1]!.notes.filter(n=>n.at<4&&n.at+n.duration>4)});
    assert.deepEqual(step.meta.audio,{clips},'played notes and drawn notes must use the same score');
  }
  
}

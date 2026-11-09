import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import {assertStepState} from '../../../test/lib/explainer-state.ts';
import {assertSteps,idsOf} from '../../../test/lib/steps.ts';
import {gitStory,currentFiles,moveMainToFeature} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  // git-branches shows the label-only move (lost) only in the diverged history; in the linear one that move is the fast-forward.
  // The steps each check below reads, predictions included, in story order; other steps may come and go.
  assertSteps(trace,values.history==='diverged'?['question','lost','merge','countercase']:['question','merge','countercase']);
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model.
    assert.equal(step.after.chapter,undefined,`git-branches/${step.step}: no chapter in the model`);
  }
  const advanced=values.history==='diverged',frames=gitStory(advanced);
  // The opening question shows the history just before the merge (the old main and predict steps);
  // the branch-basics steps start, branch, feature and switch were folded into its caption.
  for(const [i,name] of [[4,'question'],[5,'merge']] as const)
    assertStepState(trace,name,{advanced,frame:frames[i],files:currentFiles(frames[i]!)});
  assert.equal(idsOf(trace).includes('lost'),advanced,'the label-only move is shown only in the diverged history');
  if(advanced) {
    const moved=moveMainToFeature(frames[4]!);
    assertStepState(trace,'lost',{advanced,frame:moved,files:currentFiles(moved),lost:['C']});
  }
  const other=gitStory(!advanced).at(-1)!;
  assertStepState(trace,'countercase',{advanced:!advanced,frame:other,files:currentFiles(other)});
  
}

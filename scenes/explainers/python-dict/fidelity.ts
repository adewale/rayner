import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import {assertStepState} from '../../../test/lib/explainer-state.ts';
import {assertSteps} from '../../../test/lib/steps.ts';
import {dictStory} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  // The steps each check below reads, predictions included, in story order; other steps may come and go.
  assertSteps(trace,['question','broken','marker','missing','hash','collision']);
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model.
    assert.equal((step.after as {phase?:unknown}).phase,undefined,`python-dict/${step.step}: no phase in the model`);
  }
  const key=Number(values.key),m=dictStory(key);
  // The question step now carries the old lookup step's state: the intact dict and d[key]'s result.
  for(const name of ['question','hash']) assertStepState(trace,name,{key,dict:m.original,result:m.before});
  assertStepState(trace,'collision',{dict:m.original,result:dictStory(16).before});
  assertStepState(trace,'broken',{dict:m.wrong,result:m.broken,policy:'incorrect-clear'});
  assertStepState(trace,'marker',{dict:m.correct,result:m.repaired});
  assertStepState(trace,'missing',{dict:m.correct,result:m.missing});
  assert.match(String(trace.steps.find(s=>s.step==='broken')!.meta.caption),/Suppose deletion/);
  // broken, marker and missing are played by the dict machines: the events each step sent, through the model.
  const replayed=(step:string)=>(trace.steps.find(s=>s.step===step)!.evidence??[]).filter(e=>e.kind==='event').map(e=>e.event);
  assert.deepEqual(replayed('broken'),['del d[0]',`d[${key}]`]);
  assert.deepEqual(replayed('marker'),['del d[0]',`d[${key}]`]);
  assert.deepEqual(replayed('missing'),['d[24]']);
  assertStepState(trace,'broken',{op:'lookup'});
  assertStepState(trace,'missing',{op:'lookup',policy:'CPython marker'});
  // The arrows under the slot row: each step's route, read slot by slot. Absent 24 hops D, 8 and 16, stops at
  // never-used slot 7, and flies over never-used slots 2 to 5 without reading them.
  assertStepState(trace,'broken',{route:{hops:[{slot:0,reads:'never used',then:'stop'}],passedOver:[]}});
  assertStepState(trace,'missing',{route:{hops:[{slot:0,reads:'D',then:'on'},{slot:1,reads:8,then:'on'},{slot:6,reads:16,then:'on'},{slot:7,reads:'never used',then:'stop'}],passedOver:[2,3,4,5]}});
  assertStepState(trace,'marker',{route:{hops:key===8
    ?[{slot:0,reads:'D',then:'on'},{slot:1,reads:8,then:'found'}]
    :[{slot:0,reads:'D',then:'on'},{slot:1,reads:8,then:'on'},{slot:6,reads:16,then:'found'}],passedOver:key===8?[]:[2,3,4,5]}});
  assertStepState(trace,'collision',{route:{hops:[{slot:0,reads:0,then:'on'},{slot:1,reads:8,then:'on'},{slot:6,reads:16,then:'found'}],passedOver:[2,3,4,5]}});
  
}

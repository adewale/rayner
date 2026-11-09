import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import {bloomStory,saturation} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  // The steps each check below reads, predictions included, in story order; other steps may come and go.
  assertSteps(trace,['question','insert','shared','absent','present','predict','false-positive','pipeline','full']);
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model.
    assert.equal(step.after.phase,undefined,`bloom-filter/${step.step}: no phase in the model`);
  }
  const m=bloomStory(Number(values.bits) as 16|32);
  assertStepState(trace,'question',{bits:Array(m.size).fill(0),stored:[]});
  assertStepState(trace,'insert',{bits:m.first,stored:['cat']});
  for(const name of ['shared','absent','present','predict','false-positive','pipeline']) assertStepState(trace,name,{bits:m.bits,stored:m.words});
  for(const [i,name] of ['absent','present','false-positive'].entries()) assertStepState(trace,name,{query:m.queries[i]});
  // wolf passes 16 bits on cat's and dog's bits and fails 32, so it costs a read only at 16.
  assertStepState(trace,'pipeline',{queries:m.queries,exactLookups:m.size===16?2:1,setBits:m.setBits,passChance:m.passChance,sampleSize:10000,sampleFalsePositives:m.sampleFalsePositives});
  // The fills are the model's owners: none before cat, cat's bits after it, then both names'.
  assertStepState(trace,'question',{owners:Array.from({length:m.size},()=>[])});
  assertStepState(trace,'insert',{owners:m.owners.map(o=>o.filter(w=>w==='cat'))});
  for(const name of ['shared','absent','present','predict','false-positive','pipeline']) assertStepState(trace,name,{owners:m.owners});
  for(const name of ['predict','false-positive']) assertStepState(trace,name,{query:m.queries[2]});
  assert.ok(String(trace.steps.find(s=>s.step==='false-positive')!.meta.caption).includes(m.queries[2]!.word));
  assert.match(String(trace.steps.find(s=>s.step==='false-positive')!.meta.title),m.size===16?/maybe/i:/definitely not/i);
  // The last step keeps taking names until the row is full: every bit 1, every lookup and sample name maybe.
  const full=saturation(m.size);
  assertStepState(trace,'full',{bits:Array(m.size).fill(1),stored:full.words,owners:full.owners,trail:full.trail,lookups:[true,true,true],sampleSize:10000,samplePass:10000});
  
}

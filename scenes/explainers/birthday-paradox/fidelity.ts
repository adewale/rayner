import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../explain/testing.ts';
import {birthdayStory,birthdayChance,pairCount} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model.
    assert.equal(step.after.phase,undefined,`birthday-paradox/${step.step}: no phase in the model`);
  }
  const m=birthdayStory(Number(values.people));
  // The room the reader scans, then the same room with its repeated dates and the 1,000-room sample.
  assertStepState(trace,'room',{people:m.people,sample:m.sample.first,dates:m.dates});
  const {first:_,...sample}=m.sample;
  assertStepState(trace,'chance',{sample,chance:m.chance,shared:m.shared});
  // One marked person's comparisons (the old marked-person question) and every pair in the room.
  assertStepState(trace,'you',{others:m.people-1,one:birthdayChance(m.people,'one'),evenOthers:253});
  assertStepState(trace,'pairs',{pairs:m.people*(m.people-1)/2,others:m.people-1,chance:birthdayChance(m.people,'any'),even:23,evenPairs:253});
  // The red lines in the web are the room's own matches, the same people the chance step outlines.
  assertStepState(trace,'pairs',{matchedPairs:m.matchedPairs});
  assert.ok(trace.steps.findIndex(s=>s.step==='exact')<trace.steps.findIndex(s=>s.step==='estimate'),'the exact count comes before the shortcut that is measured against it');
  // The doubling the pairs caption quotes: five people make ten pairs, ten make 45. The growth step it replaced is gone.
  assertStepState(trace,'pairs',{doubling:[5,10].map(n=>({people:n,pairs:pairCount(n),chance:birthdayChance(n,'any')}))});
  assert.ok(!trace.steps.some(s=>s.step==='growth'));
  assertStepState(trace,'estimate',{pairs:m.pairs,shortcut:1-(364/365)**m.pairs,chance:m.chance});
  assertStepState(trace,'exact',{factors:m.factors,noMatch:m.noMatch,chance:m.chance,occupied:m.people-1});
  // The figures readers quote: 50.7% for any pair among 23, 5.9% for matching one marked person among 23, 11.7% among 10.
  const caption=(name:string)=>String(trace.steps.find(s=>s.step===name)!.meta.caption);
  const shown={10:{any:'11.7%',one:'2.4%'},23:{any:'50.7%',one:'5.9%'},40:{any:'89.1%',one:'10.1%'}}[m.people]!;
  assert.ok(caption('chance').includes(`the exact chance is ${shown.any}`));
  assert.ok(caption('you').includes(`shares your birthday is only ${shown.one}`));
  
}

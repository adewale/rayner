import assert from 'node:assert/strict';
import type {Trace} from '../../../src/trace.ts';
import {assertStepState} from '../explainer-state.ts';
import {dictStory} from '../../../scenes/explainers/lib/python-dict.ts';
import {bloomStory} from '../../../scenes/explainers/lib/bloom-filter.ts';
import {gitStory,currentFiles} from '../../../scenes/explainers/lib/git-branches.ts';
import {monty,montyExample,threeDoorWorlds} from '../../../scenes/explainers/lib/monty-hall.ts';
import type {Host} from '../../../scenes/explainers/lib/monty-hall.ts';
import {birthdayStory} from '../../../scenes/explainers/lib/birthday-paradox.ts';
import type {BirthdayQuestion} from '../../../scenes/explainers/lib/birthday-paradox.ts';
import {musicStory} from '../../../scenes/explainers/lib/melody-rhythm.ts';
import type {Timing} from '../../../scenes/explainers/lib/melody-rhythm.ts';

/** Models have native/exhaustive oracles in learning-models.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(id:string,values:Record<string,string>,trace:Trace) {
  const expected:Record<string,number>={'python-dict':8,'bloom-filter':9,'git-branches':8,'monty-hall':8,'birthday-paradox':8,'melody-rhythm':8};
  assert.equal(trace.steps.length,expected[id],`${id}: count the full lesson, including predictions`);
  for(const step of trace.steps) {
    assertStepState(trace,step.step,{phase:step.step});
  }
  if(id==='python-dict') {
    const key=Number(values.key),m=dictStory(key);
    for(const name of ['question','hash','lookup']) assertStepState(trace,name,{key,dict:m.original,result:m.before});
    assertStepState(trace,'collision',{dict:m.original,result:dictStory(16).before});
    assertStepState(trace,'broken',{dict:m.wrong,result:m.broken,policy:'incorrect-clear'});
    assertStepState(trace,'marker',{dict:m.correct,result:m.repaired});
    assertStepState(trace,'missing',{dict:m.correct,result:m.missing});
    assert.match(String(trace.steps.find(s=>s.step==='broken')!.meta.caption),/Suppose deletion/);
  } else if(id==='bloom-filter') {
    const m=bloomStory(Number(values.bits) as 16|32);
    assertStepState(trace,'question',{bits:Array(m.size).fill(0),stored:[]});
    assertStepState(trace,'insert',{bits:m.first,stored:['cat']});
    for(const name of ['shared','absent','present','false-positive','pipeline']) assertStepState(trace,name,{bits:m.bits,stored:m.words});
    for(const [i,name] of ['absent','present','false-positive'].entries()) assertStepState(trace,name,{query:m.queries[i]});
    assertStepState(trace,'pipeline',{queries:m.queries,exactLookups:2,sampleSize:100,sampleFalsePositives:m.sampleFalsePositives});
    assert.ok(String(trace.steps.find(s=>s.step==='false-positive')!.meta.caption).includes(m.queries[2]!.word));
  } else if(id==='git-branches') {
    const advanced=values.history==='diverged',frames=gitStory(advanced);
    for(const [i,name] of ['start','branch','feature','switch','main','merge'].entries())
      assertStepState(trace,name,{advanced,frame:frames[i],files:currentFiles(frames[i]!)});
    const other=gitStory(!advanced).at(-1)!;
    assertStepState(trace,'countercase',{advanced:!advanced,frame:other,files:currentFiles(other)});
  } else if(id==='monty-hall') {
    const host=values.host as Host,choice='ABC'.indexOf(values.choice!),example=montyExample(choice,values.strategy as 'stay'|'switch');
    for(const name of ['choice','host','reveal']) assertStepState(trace,name,{example,host,revealed:name==='reveal'});
    assertStepState(trace,'worlds',{choice,host,worlds:threeDoorWorlds(choice,host),odds:monty(3,host)});
    assertStepState(trace,'odds',{odds:monty(3,host)});assertStepState(trace,'many',{odds:monty(100,host)});
    assertStepState(trace,'rules',{informed:monty(3,'informed'),random:monty(3,'random')});
    if(host==='random') assert.match(String(trace.steps[1]!.meta.caption),/happened to reveal a goat/);
    assert.ok(String(trace.steps.find(s=>s.step==='reveal')!.meta.caption).includes(`you ${example.won?'win':'lose'}`));
  } else if(id==='birthday-paradox') {
    const m=birthdayStory(Number(values.people),values.question as BirthdayQuestion);
    assertStepState(trace,'question',{people:m.people,question:m.question,sample:m.sample.first});
    assertStepState(trace,'pairs',{examples:[2,3,5].map(n=>({people:n,comparisons:m.question==='any'?n*(n-1)/2:n-1}))});
    assertStepState(trace,'count',{comparisons:m.comparisons});
    assertStepState(trace,'avoid',{factors:m.factors,noMatch:m.noMatch});
    assertStepState(trace,'chance',{chance:m.chance,noMatch:m.noMatch});
    const {first:_,...sample}=m.sample;
    assertStepState(trace,'sample',{sample,chance:m.chance});
    assertStepState(trace,'questions',{any:m.any,one:m.one,anyPairs:m.people*(m.people-1)/2,onePairs:m.people-1});
  } else if(id==='melody-rhythm') {
    const m=musicStory(values.timing as Timing,Number(values.tempo));
    for(const step of trace.steps) {
      const clips=step.step==='rhythm'?m.flat:m.clips;
      assertStepState(trace,step.step,{clips,bpm:m.bpm,timing:m.timing,movedStarts:m.movedStarts,movedDurations:m.movedDurations,
        crossing:clips[1]!.notes.filter(n=>n.at<4&&n.at+n.duration>4)});
      assert.deepEqual(step.meta.audio,{clips},'played notes and drawn notes must use the same score');
    }
  } else assert.fail(`No learning fidelity checker for ${id}`);
}

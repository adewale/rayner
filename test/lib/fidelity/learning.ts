import assert from 'node:assert/strict';
import type {Trace} from '../../../src/trace.ts';
import {assertStepState} from '../explainer-state.ts';
import {dictStory} from '../../../scenes/explainers/lib/python-dict.ts';
import {bloomStory,saturation} from '../../../scenes/explainers/lib/bloom-filter.ts';
import {gitStory,currentFiles,moveMainToFeature} from '../../../scenes/explainers/lib/git-branches.ts';
import {monty,montyExample,threeDoorWorlds,threeDoorCells,oddsAfter} from '../../../scenes/explainers/lib/monty-hall.ts';
import type {Host} from '../../../scenes/explainers/lib/monty-hall.ts';
import {birthdayStory,birthdayChance,pairCount} from '../../../scenes/explainers/lib/birthday-paradox.ts';
import {musicStory} from '../../../scenes/explainers/lib/melody-rhythm.ts';
import type {Timing} from '../../../scenes/explainers/lib/melody-rhythm.ts';

/** Models have native/exhaustive oracles in learning-models.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(id:string,values:Record<string,string>,trace:Trace) {
  // git-branches shows the label-only move (lost) only in the diverged history; in the linear one that move is the fast-forward.
  const expected:Record<string,number>={'python-dict':6,'bloom-filter':9,'git-branches':values.history==='diverged'?4:3,'monty-hall':4,'birthday-paradox':7,'melody-rhythm':6};
  assert.equal(trace.steps.length,expected[id],`${id}: count the full lesson, including predictions`);
  for(const step of trace.steps) {
    assertStepState(trace,step.step,{phase:step.step});
  }
  if(id==='python-dict') {
    const key=Number(values.key),m=dictStory(key);
    // The question step now carries the old lookup step's state: the intact dict and d[key]'s result.
    for(const name of ['question','hash']) assertStepState(trace,name,{key,dict:m.original,result:m.before});
    assertStepState(trace,'collision',{dict:m.original,result:dictStory(16).before});
    assertStepState(trace,'broken',{dict:m.wrong,result:m.broken,policy:'incorrect-clear'});
    assertStepState(trace,'marker',{dict:m.correct,result:m.repaired});
    assertStepState(trace,'missing',{dict:m.correct,result:m.missing});
    assert.match(String(trace.steps.find(s=>s.step==='broken')!.meta.caption),/Suppose deletion/);
  } else if(id==='bloom-filter') {
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
  } else if(id==='git-branches') {
    const advanced=values.history==='diverged',frames=gitStory(advanced);
    // The opening question shows the history just before the merge (the old main and predict steps);
    // the branch-basics steps start, branch, feature and switch were folded into its caption.
    for(const [i,name] of [[4,'question'],[5,'merge']] as const)
      assertStepState(trace,name,{advanced,frame:frames[i],files:currentFiles(frames[i]!)});
    assert.deepEqual(trace.steps.map(s=>s.step),advanced?['question','lost','merge','countercase']:['question','merge','countercase']);
    if(advanced) {
      const moved=moveMainToFeature(frames[4]!);
      assertStepState(trace,'lost',{advanced,frame:moved,files:currentFiles(moved),lost:['C']});
    }
    const other=gitStory(!advanced).at(-1)!;
    assertStepState(trace,'countercase',{advanced:!advanced,frame:other,files:currentFiles(other)});
  } else if(id==='monty-hall') {
    const host=values.host as Host,choice=0,example=montyExample(choice,'switch');
    // The round (the old choice and host steps, merged) and the prediction show the same doors, car unrevealed.
    for(const name of ['choice','predict']) assertStepState(trace,name,{example,host,revealed:false});
    const cells={informed:threeDoorCells(choice,'informed'),random:threeDoorCells(choice,'random')};
    const opened='ABC'[example.opened]!;
    // The first strip already counts only the rounds that show a goat behind the opened door (the old rules step).
    assertStepState(trace,'odds',{odds:monty(3,host),cells:cells[host],opened,seen:oddsAfter(choice,host,opened)});
    assertStepState(trace,'worlds',{choice,host,worlds:threeDoorWorlds(choice,host),odds:monty(3,host)});
    // Whichever host is in play, the count sets both hosts' rows side by side.
    assertStepState(trace,'worlds',{informedWorlds:threeDoorWorlds(choice,'informed'),randomWorlds:threeDoorWorlds(choice,'random'),cells});
    assertStepState(trace,'worlds',{opened,informed:monty(3,'informed'),random:monty(3,'random'),cells,
      seen:{informed:oddsAfter(choice,'informed',opened),random:oddsAfter(choice,'random',opened)}});
    // The 100-door step is gone: its numbers are now only in a check question, from monty(100, 'random').
    if(host==='random') assert.match(String(trace.steps[0]!.meta.caption),/happened to reveal a goat/);
    // The reveal step, and with it the strategy setting and one round's win or loss, is gone.
    assert.ok(!trace.steps.some(s=>s.step==='reveal'||s.step==='many'||s.step==='rules'));
  } else if(id==='birthday-paradox') {
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
    // Two, three and five people make one, three and ten pairs.
    assert.deepEqual((trace.steps.find(s=>s.step==='growth')!.after!.growth as {pairs:number}[]).slice(0,3).map(r=>r.pairs),[1,3,10]);
    assertStepState(trace,'growth',{growth:[2,3,5,10,23,40].map(n=>({people:n,pairs:pairCount(n),chance:birthdayChance(n,'any')}))});
    assertStepState(trace,'estimate',{pairs:m.pairs,shortcut:1-(364/365)**m.pairs,chance:m.chance});
    assertStepState(trace,'exact',{factors:m.factors,noMatch:m.noMatch,chance:m.chance,occupied:m.people-1});
    // The figures readers quote: 50.7% for any pair among 23, 5.9% for matching one marked person among 23, 11.7% among 10.
    const caption=(name:string)=>String(trace.steps.find(s=>s.step===name)!.meta.caption);
    const shown={10:{any:'11.7%',one:'2.4%'},23:{any:'50.7%',one:'5.9%'},40:{any:'89.1%',one:'10.1%'}}[m.people]!;
    assert.ok(caption('chance').includes(`the exact chance is ${shown.any}`));
    assert.ok(caption('you').includes(`shares your birthday is only ${shown.one}`));
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

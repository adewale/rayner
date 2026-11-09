import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import {monty,montyExample,threeDoorWorlds,threeDoorCells,oddsAfter,roundStart,roundNext} from './model.ts';
import type {Host,Round,RoundEvent} from './model.ts';

/** The model has native/exhaustive oracles in model.test.ts. This boundary
 * proves each authored setting puts those answers in its completed steps. */
export function check(trace:Trace,values:Record<string,string>) {
  // The steps each check below reads, predictions included, in story order; other steps may come and go.
  assertSteps(trace,['choice','predict','rounds','odds','worlds']);
  for(const step of trace.steps) {
    // Which picture is showing is not part of the model; monty-hall names it in shown.
    assert.equal(step.after.chapter,undefined,`monty-hall/${step.step}: no chapter in the model`);
    assert.equal(step.shown?.chapter,step.step,`monty-hall/${step.step}: shown names the picture`);
  }
  const host=values.host as Host,choice=0,example=montyExample(choice,'switch');
  // The round (the old choice and host steps, merged) and the prediction show the same doors, car unrevealed:
  // the round machine's state after you pick A and the host opens B to a goat, replayed through the model.
  const round=[`pick A`,`open ${'ABC'[example.opened]}: goat`].reduce<Round>((r,e)=>roundNext(r,e as RoundEvent) as Round,roundStart(host));
  assert.deepEqual(round,{host,pick:example.choice,opened:example.opened,shows:'goat',decision:null,car:null});
  for(const name of ['choice','predict']) assertStepState(trace,name,{...round});
  const cells={informed:threeDoorCells(choice,'informed'),random:threeDoorCells(choice,'random')};
  const opened='ABC'[example.opened]!;
  // The first strip lays out every round for the host in play; the next counts only the rounds that show a goat behind the opened door.
  assertStepState(trace,'rounds',{odds:monty(3,host),cells:cells[host]});
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
  
}

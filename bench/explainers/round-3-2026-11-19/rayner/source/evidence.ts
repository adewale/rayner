/** After `rayner describe scene.ts --out out/benchmark/description.json`, run:
 * node scenes/explainers/bench-statecharts-round3/evidence.ts out/benchmark
 * Assert each teaching state's model origin and retain a prose-only benchmark transcript. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { graph, run, start, name, type Chart } from './model.ts';
const folder=process.argv[2]??'out/benchmark';
const d=JSON.parse(readFileSync(join(folder,'description.json'),'utf8'));
const expected:Record<string,{chart:Chart;events:string[]}>={
 coffee:{chart:'parent',events:['POWER_ON']},
 power:{chart:'coffee',events:['POWER_ON']},
 missed:{chart:'missing',events:['POWER_ON','START','GROUND','POWER_OFF']},
 parent:{chart:'parent',events:['POWER_ON']},
 'brew-live':{chart:'parent',events:['POWER_ON','START','GROUND']},
 combinations:{chart:'player',events:[]},
 regions:{chart:'player',events:['PLAY','MUTE']},
 third:{chart:'player',events:['PLAY','MUTE']},
 'same-behavior':{chart:'player',events:['PLAY','MUTE','PAUSE']},
 compose:{chart:'player-on',events:['POWER_ON']},
 'place-frother':{chart:'frother',events:['POWER_ON']},
 frother:{chart:'frother',events:['POWER_ON','START','FROTH']},
 'own-power':{chart:'independent',events:[]},
 'own-answer':{chart:'independent',events:['FROTH']},
 steam:{chart:'steam',events:['POWER_ON','START','GROUND']},
 'steam-answer':{chart:'steam',events:['POWER_ON','START','GROUND']},
 'try-frother':{chart:'frother',events:['POWER_ON','START','FROTH']},
};
assert.equal(d.id,'bench-statecharts-round3');assert.equal(d.scenarios.length,1);
const steps=d.scenarios[0].steps;
assert.deepEqual(steps.map((s:any)=>s.step),Object.keys(expected));
for(const s of steps) {
 const e=expected[s.step]!;
 assert.equal(s.state.chart,e.chart,s.step);
 assert.deepEqual(s.state.config,run(e.chart,e.events),s.step);
 assert.ok(graph(e.chart).states.some(c=>name(c)===name(s.state.config)),s.step);
 if(s.events) assert.deepEqual(s.events,e.events,s.step);
 if(s.state.flat) assert.deepEqual(s.state.flat,s.state.config,s.step);
}
assert.deepEqual(d.scenarios[0].machines.map((m:any)=>m.step),['brew-live','same-behavior','try-frother']);
assert.equal(d.questions.length,3);
writeFileSync(join(folder,'transcript.json'),JSON.stringify({title:d.title,steps:steps.map(({title,line,caption}:any)=>({title,line,caption}))},null,2)+'\n');
console.log(`Fidelity passed: ${steps.length} ordered teaching states agree with model runs; 3 scripted machines verified. Transcript contains title and ordered visible title/line/caption only.`);

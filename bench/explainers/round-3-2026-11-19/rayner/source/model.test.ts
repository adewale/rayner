import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { graph, start, send, events, run, name, featureCounts, flatPlayerNext, transfer, structured, type Chart } from './model.ts';
const oracle=JSON.parse(readFileSync(new URL('./fixtures/statecharts-xstate.json',import.meta.url),'utf8'));
test('recorded XState 5.33.3 graphs match all configurations, transitions and handled events',()=>{
 assert.equal(oracle.version,'5.33.3');
 for(const [key,value] of Object.entries(oracle.charts)) {
  const chart=key as Chart, ref=value as any;
  assert.deepEqual(start(chart),ref.start);
  assert.deepEqual(graph(chart).states.map(name).sort(),ref.states.map(name).sort());
  for(const t of ref.transitions) assert.deepEqual(send(chart,t.from,t.event),{config:t.to,handled:t.handled},`${chart}: ${name(t.from)} + ${t.event}`);
 }
});
test('scripted runs and generated sequences agree with recorded XState',()=>{
 for(const [key,value] of Object.entries(oracle.charts)) {
  const chart=key as Chart, ref=value as any;
  let seed=19;
  for(let trial=0;trial<100;trial++) {
   let c=start(chart), expected=ref.start;
   for(let i=0;i<35;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const event=events(chart)[seed%events(chart).length]!;
    expected=ref.transitions.find((t:any)=>name(t.from)===name(expected)&&t.event===event).to;
    c=send(chart,c,event).config; assert.deepEqual(c,expected);
   }
  }
 }
 assert.deepEqual(run('parent',['POWER_ON','START','GROUND']),['brewing']);
 assert.deepEqual(run('frother',['POWER_ON','START','FROTH']),['grinding','frothing']);
});
test('flat and regional players have identical event traces',()=>{
 let c=start('player'),flat=start('player'),seed=7;
 for(let i=0;i<1500;i++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;const e=events('player')[seed%4]!;c=send('player',c,e).config;flat=flatPlayerNext(flat,e);assert.deepEqual(flat,c);}
 assert.deepEqual(run('player',['PLAY','MUTE','PAUSE','UNMUTE']),['paused','sound']);
});
test('binary feature counts enumerate the full product through five features',()=>{
 for(let n=1;n<=5;n++) {
  const names=new Set<string>(),edges=new Set<string>();
  for(let bits=0;bits<2**n;bits++) { names.add(bits.toString(2).padStart(n,'0'));for(let bit=0;bit<n;bit++) edges.add(`${bits}:${bit}:${bits^(1<<bit)}`); }
  const counts=featureCounts(n);assert.equal(counts.flatStates,names.size);assert.equal(counts.flatArrows,edges.size);assert.equal(counts.chartStates,2*n);assert.equal(counts.chartArrows,2*n);
 }
});
test('transfer answers, transition counts and reset behavior are model-derived',()=>{
 assert.equal(transfer.inside,9);assert.equal(transfer.outside,10);assert.equal(transfer.steam,6);
 assert.deepEqual([...transfer.steamNames].sort(),['off','idle','grinding','brewing · still','brewing · frothing','ready'].sort());
 assert.equal(graph('steam').edges.length,13);assert.equal(structured.steam.arrows,8);
 assert.equal(graph('frother').edges.length,25);assert.equal(graph('independent').edges.length,28);
 assert.equal(graph('parent').edges.length,9);assert.equal(graph('player').edges.length,8);assert.equal(graph('player-on').edges.length,13);
 assert.deepEqual(run('frother',['POWER_OFF','POWER_ON'],['grinding','frothing']),['idle','still']);
 assert.deepEqual(run('steam',['POWER_ON','START','GROUND','FROTH','POURED']),['ready']);
 assert.deepEqual(run('independent',['FROTH','POWER_ON','POWER_OFF']),['off','frothing']);
 assert.deepEqual(send('missing',['brewing'],'POWER_OFF'),{config:['brewing'],handled:false});
});

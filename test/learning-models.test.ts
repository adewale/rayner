import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fc,params} from './lib/pbt.ts';
import {isRefusal} from '../src/index.ts';
import {dictionary,deleteFirst,lookup,probeSlots,route,dictStory,dictStart,dictNext,DICT_EVENTS,EMPTY,DELETED} from '../scenes/explainers/lib/python-dict.ts';
import type {DictState,DictEvent} from '../scenes/explainers/lib/python-dict.ts';
import {fnv1a,locations,makeFilter,membership,bloomStory,saturation} from '../scenes/explainers/lib/bloom-filter.ts';
import {gitStory,currentFiles,history,moveMainToFeature,unreachable} from '../scenes/explainers/lib/git-branches.ts';
import {monty,threeDoorWorlds,montyExample,threeDoorCells,oddsAfter,roundStart,roundNext,roundDoor,roundResult,ROUND_EVENTS} from '../scenes/explainers/lib/monty-hall.ts';
import type {Round,RoundEvent} from '../scenes/explainers/lib/monty-hall.ts';
import {birthdayChance,birthdaySample,matches,birthdayStory,evenOdds,pairCount,pairShortcut,dateOf} from '../scenes/explainers/lib/birthday-paradox.ts';
import BirthdayParadox,{ANSWER as birthdayAnswer} from '../scenes/explainers/birthday-paradox/scene.ts';
import {phrase,musicStory,beatMs} from '../scenes/explainers/lib/melody-rhythm.ts';
import MelodyRhythm from '../scenes/explainers/melody-rhythm/scene.ts';
import {stepAudio} from '../explain/audio.ts';
const utf16=fc.array(fc.integer({min:0,max:65535}),{maxLength:100}).map(units=>String.fromCharCode(...units));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/learning-models.json',import.meta.url),'utf8'));
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-14,`${a} != ${b}`);

test('dictionary slots and deleted entries match captured CPython 3.12 storage',()=>{
  assert.equal(fixture.python,'3.12.14');
  assert.deepEqual(dictionary(),fixture.dict.original);
  assert.deepEqual(deleteFirst('marker'),fixture.dict.deleted);
  for(const [key,value] of Object.entries(fixture.dict.lookups)) assert.equal(lookup(deleteFirst('marker'),Number(key)).value,value);
  for(const key of [8,16]) {
    assert.equal(lookup(deleteFirst('clear'),key).found,false,'deliberately wrong clearing breaks the lookup');
    assert.equal(lookup(deleteFirst('marker'),key).found,true);
  }
  fc.assert(fc.property(fc.integer({min:0,max:0x7fffffff}),key=>{
    const reference=new Map([[8,'pear'],[16,'plum']]);
    assert.equal(lookup(deleteFirst('marker'),key).value,reference.get(key)??null);
    assert.equal(new Set(probeSlots(key).slice(-8)).size,8,'zero-perturb tail covers all eight slots');
    assert.equal(probeSlots(key)[0],key%8,'an eight-slot index starts at the hash\'s low three bits');
  }),params());
});

test('a middle deletion needs the marker too, and absent lookups need unused space', async () => {
  for (const marker of [EMPTY, DELETED]) {
    const table = dictionary();
    table.indices[1] = marker;
    table.entries[1] = { key: null, value: null };
    const result = lookup(table, 16);
    assert.equal(result.found, marker === DELETED);
    assert.deepEqual(result.slots, marker === DELETED ? [0, 1, 6] : [0, 1]);
  }
  const full = deleteFirst('marker');
  full.indices = full.indices.map(index => index === EMPTY ? DELETED : index);
  assert.throws(() => lookup(full, 24), /needs an unused slot/);
  const { collectProject } = await import('../tools/lib/explain-project.ts');
  const project = await collectProject('scenes/explainers/python-dict', { write: false });
  for (const scenario of project.scenarios) {
    assert.equal(scenario.trace.steps.length, 6, 'hash and probe-path reference steps remain available');
    assert.deepEqual(scenario.trace.steps.filter(step => step.meta.kind !== 'detail').map(step => step.step), ['question', 'broken', 'marker', 'missing']);
  }
});

test('a probe route reads each visited slot in turn: taken and D send it on, a never-used slot stops it', () => {
  const m = dictStory(8);
  // Absent key 24 hops 0 > 1 > 6 > 7: D, key 8 and key 16 send it on, and never-used slot 7 stops it.
  assert.deepEqual(route(m.correct, m.missing), {
    hops: [{slot: 0, reads: 'D', then: 'on'}, {slot: 1, reads: 8, then: 'on'}, {slot: 6, reads: 16, then: 'on'}, {slot: 7, reads: 'never used', then: 'stop'}],
    passedOver: [2, 3, 4, 5],
  });
  // Key 24 is not among the stored keys, and D never matches: deleted key 0 is not found through it.
  assert.deepEqual(dictionary().entries.map(e => e.key), [0, 8, 16]);
  assert.equal(lookup(m.correct, 0).found, false);
  // Cleared slot 0 stops the search for 8 where it starts; the marker sends it on to pear's slot.
  assert.deepEqual(route(m.wrong, m.broken), {hops: [{slot: 0, reads: 'never used', then: 'stop'}], passedOver: []});
  assert.deepEqual(route(m.correct, m.repaired), {hops: [{slot: 0, reads: 'D', then: 'on'}, {slot: 1, reads: 8, then: 'found'}], passedOver: []});
  // For any key, in each table: the hops are the lookup's slots, every hop but the last goes on, and
  // a slot the route flies over between two hops is never used and never read.
  fc.assert(fc.property(fc.integer({min: 0, max: 0x7fffffff}), fc.constantFrom(dictionary(), deleteFirst('marker'), deleteFirst('clear')), (key, table) => {
    const result = lookup(table, key), r = route(table, result);
    assert.deepEqual(r.hops.map(h => h.slot), result.slots);
    assert.ok(r.hops.slice(0, -1).every(h => h.then === 'on' && h.reads !== 'never used'));
    assert.equal(r.hops.at(-1)!.then, result.found ? 'found' : 'stop');
    if (!result.found) assert.equal(r.hops.at(-1)!.reads, 'never used', 'a search that does not find its key stops at a never-used slot');
    for (const slot of r.passedOver) {
      assert.equal(table.indices[slot], EMPTY);
      assert.ok(!result.slots.includes(slot));
    }
  }), params());
});

test('the dict machine deletes and looks up as a Python dict does: a missing key is a result, a deletion it cannot find is refused', () => {
  // del d[0] writes D where 0's search found it and empties its entry: the captured CPython storage.
  const step = (state: DictState, event: DictEvent) => { const next = dictNext(state, event); return isRefusal(next) ? undefined : next; };
  const deleted = step(dictStart('CPython marker'), 'del d[0]')!;
  assert.deepEqual(deleted.dict, deleteFirst('marker'));
  assert.deepEqual([deleted.op, deleted.result!.slots], ['del', [0]]);
  // A lookup of a key that is not there is an answer, not a refusal; a second del d[0] is refused, with Python's reason.
  assert.deepEqual(step(deleted, 'd[24]')!.result, lookup(deleteFirst('marker'), 24));
  assert.equal(step(deleted, 'del d[0]'), undefined);
  assert.deepEqual({...dictNext(deleted, 'del d[0]')}, {reason: 'the search for 0 stops at never-used slot 7, so del d[0] raises KeyError and changes nothing'});
  // The counterfactual loses 8: after emptying slot 0 its search stops there, so it can neither find nor delete it.
  const cleared = step(dictStart('incorrect-clear'), 'del d[0]')!;
  assert.deepEqual(cleared.dict, deleteFirst('clear'));
  assert.deepEqual({...dictNext(cleared, 'del d[8]')}, {reason: 'the search for 8 stops at never-used slot 0, so del d[8] raises KeyError and changes nothing'});
  // Against a Map, for any sequence of events: CPython's marker dict answers every lookup as the Map does and refuses
  // exactly the deletions the Map cannot make; every state keeps an unused slot, so every search can stop.
  fc.assert(fc.property(fc.array(fc.constantFrom(...DICT_EVENTS), {maxLength: 12}), events => {
    const reference = new Map<number, string>([[0, 'apple'], [8, 'pear'], [16, 'plum']]);
    let state = dictStart('CPython marker');
    for (const event of events) {
      const key = Number(/\[(\d+)\]/.exec(event)![1]), next = step(state, event);
      if (event.startsWith('del ')) {
        assert.equal(next === undefined, !reference.has(key), event);
        reference.delete(key);
      } else assert.equal(next!.result!.value, reference.get(key) ?? null, event);
      state = next ?? state;
      assert.ok(state.dict.indices.includes(EMPTY));
    }
  }), params());
});

test('native CPython storage and exact arithmetic reproduce the recorded vectors',t=>{
  const version=spawnSync('python3',['-c','import sys; print(".".join(map(str,sys.version_info[:2])))'],{encoding:'utf8'});
  if(version.status!==0||version.stdout.trim()!=='3.12') {t.skip('64-bit CPython 3.12 is required for the native storage oracle');return;}
  const now=JSON.parse(execFileSync('python3',['tools/oracle/learning_models.py'],{encoding:'utf8'}));
  delete now.python; const {python:_,...expected}=fixture;
  assert.deepEqual(now,expected);
});

test('FNV-1a matches published vectors, independent integer arithmetic and UTF-8 vectors',()=>{
  assert.equal(fnv1a(''),0x811c9dc5);assert.equal(fnv1a('a'),0xe40c292c);
  assert.equal(fnv1a('foobar'),0xbf9cf968);assert.equal(fnv1a('hello'),0x4f9f2cab);
  for(const [word,hash] of Object.entries(fixture.fnv)) assert.equal(fnv1a(word),hash);
  fc.assert(fc.property(utf16,word=>{
    let h=2166136261n;
    for(const b of Buffer.from(word)) h=((h^BigInt(b))*16777619n)%4294967296n;
    assert.equal(fnv1a(word),Number(h));
  }),params());
});

test('insert-only filters never reject an inserted word; concrete false positives still need storage',()=>{
  fc.assert(fc.property(fc.array(utf16,{maxLength:30}),fc.integer({min:8,max:512}),(words,size)=>{
    const bits=makeFilter(words,size);
    assert.equal(bits.length,size);
    for(const word of words) assert.equal(membership(bits,word),true);
    const selected=new Set(words.flatMap(word=>locations(word,size)));
    assert.deepEqual(bits,Array.from({length:size},(_,i)=>Number(selected.has(i))));
  }),params(500));
  for(const size of [16,32] as const) {
    for(const [word,positions] of Object.entries(fixture.bloom[size].locations)) assert.deepEqual(locations(word,size),positions);
    const m=bloomStory(size);
    // The same untaken wolf is a false positive at 16 bits and a definite no at 32.
    assert.deepEqual(m.queries.map(q=>q.word),['owl','cat','wolf']);
    assert.deepEqual(m.queries.map(q=>[q.maybe,q.stored]),[[false,false],[true,true],[size===16,false]]);
    assert.equal(m.exactLookups,size===16?2:1);assert.equal(m.queries.length,3);
    assert.equal(m.words.includes(m.queries[2]!.word),false);
    for(const q of m.queries) assert.deepEqual(q.locations,fixture.bloom[size].locations[q.word]);
    // Each bit's owners are exactly the stored words whose oracle locations include it.
    assert.deepEqual(m.owners,Array.from({length:size},(_,i)=>m.words.filter(w=>fixture.bloom[size].locations[w].includes(i))));
    // A sample name passes only if its three bits are set: the sample's rate sits near (set/size)³, and none of it is taken.
    assert.equal(m.setBits,m.owners.filter(o=>o.length>0).length);
    assert.equal(m.passChance,(m.setBits/size)**3);
    assert.ok(m.sampleFalsePositives/m.sampleSize < m.passChance);
    assert.ok(Math.abs(m.sampleFalsePositives/m.sampleSize-m.passChance)<0.2*m.passChance,`${m.sampleFalsePositives}/${m.sampleSize} vs ${m.passChance}`);
  }
  // At this sample size the 16-bit row passes several times as many untaken names as the 32-bit one.
  assert.ok(bloomStory(16).sampleFalsePositives>3*bloomStory(32).sampleFalsePositives);
  // Check 1: taking eel (23, 20 and 1 at 32 bits) fills wolf's missing bit 23, while owl keeps two 0 bits.
  assert.deepEqual(locations('eel',32),[23,20,1]);
  const withEel=makeFilter(['cat','dog','eel'],32);
  assert.equal(membership(withEel,'wolf'),true);assert.equal(membership(withEel,'owl'),false);
  // The full row: names keep coming until no bit is 0; each name only adds bits, and then every name passes.
  for(const size of [16,32] as const) {
    const full=saturation(size);
    assert.deepEqual(full.words.slice(0,2),['cat','dog']);
    assert.equal(full.trail.at(-1)!.setBits,size);assert.ok(full.trail.slice(0,-1).every(t=>t.setBits<size),'stops at the first full row');
    for(let i=1;i<full.trail.length;i++) assert.ok(full.trail[i]!.setBits>=full.trail[i-1]!.setBits);
    assert.equal(full.trail.length,full.words.length-1);
    assert.deepEqual(full.bits,Array(size).fill(1));
    assert.deepEqual(full.lookups,[true,true,true]);assert.equal(full.samplePass,full.sampleSize);
    assert.equal(full.words.some(w=>(['owl','wolf'] as string[]).includes(w)),false);
  }
  assert.equal(saturation(16).words.length,12);assert.equal(saturation(32).words.length,45);
  // Check 2: clearing dog's bits at 16 bits clears cat's shared bit 1 too, so a taken cat gets "definitely not";
  // at 32 bits dog shares no bit with cat, so cat still gets maybe.
  for(const size of [16,32] as const) {
    const bits=makeFilter(['cat','dog'],size);
    for(const i of locations('dog',size)) bits[i]=0;
    assert.equal(membership(bits,'cat'),size===32);
  }
});

// The scene's rules for every name, not only its three lookups: a name gets through only when all
// three of its bits are set; taking names only fills the row; and a full row says maybe to every name.
test('a name gets through only when all three of its bits are set, the row only fills, and a full row says maybe to every name',()=>{
  fc.assert(fc.property(fc.array(utf16,{maxLength:30}),utf16,fc.integer({min:8,max:512}),(words,probe,size)=>{
    const bits=makeFilter(words,size);
    assert.equal(membership(bits,probe),locations(probe,size).every(i=>bits[i]===1),'maybe exactly when all three bits are 1');
    // Each name taken keeps every bit already set.
    for(let k=1;k<=words.length;k++) {
      const before=makeFilter(words.slice(0,k-1),size),after=makeFilter(words.slice(0,k),size);
      assert.ok(before.every((b,i)=>b<=after[i]!),`taking ${JSON.stringify(words[k-1])} cleared a bit`);
    }
    assert.equal(membership(Array(size).fill(1),probe),true,'a full row says maybe');
  }),params(300));
  // The scene's two full rows: every one of the sample's untaken names, and any other name, gets maybe.
  for(const size of [16,32] as const) {
    const full=saturation(size);
    fc.assert(fc.property(utf16,word=>membership(full.bits,word)),params(200));
  }
});

test('branch labels, parents and checked-out files match real Git through both merge histories',()=>{
  for(const advanced of [false,true]) {
    const dir=mkdtempSync(join(tmpdir(),'rayner-git-lesson-'));
    const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
    const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
    const contents=(file:string)=>{try{return readFileSync(join(dir,file),'utf8').trim();}catch{return null;}};
    try {
      git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
      const frames=gitStory(advanced);
      const compare=(i:number)=>{
        const expected=frames[i]!;
        assert.equal(git('branch','--show-current'),expected.head);
        assert.equal(git('log','-1','--format=%s','main'),expected.main);
        assert.equal(git('log','-1','--format=%s'),expected.current);
        if(expected.feature) assert.equal(git('log','-1','--format=%s','feature'),expected.feature);
        else assert.equal(git('branch','--list','feature'),'');
        const actual=git('log','--all','--format=%H %s').split('\n').map(row=>row.split(' '));
        const names=new Map(actual.map(([sha,name])=>[sha!,name!]));
        assert.equal(actual.length,expected.commits.length);
        for(const c of expected.commits) {
          const sha=actual.find(([,name])=>name===c.id)![0]!;
          assert.deepEqual(git('show','-s','--format=%P',sha).split(' ').filter(Boolean).map(p=>names.get(p)),c.parents);
        }
        assert.deepEqual({colour:contents('colour.txt'),title:contents('title.txt')},currentFiles(expected));
      };
      compare(0);git('branch','feature');compare(1);
      git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');compare(2);
      git('switch','-q','main');compare(3);
      if(advanced){writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');}compare(4);
      git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','-m','M','feature');compare(5);
      assert.equal(frames[5]!.merge,advanced?'commit':'fast-forward');
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test('moving only the main label to feature drops C exactly when real Git would leave it on no branch',()=>{
  for(const advanced of [false,true]) {
    const dir=mkdtempSync(join(tmpdir(),'rayner-git-label-'));
    const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
    const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
    const contents=(file:string)=>{try{return readFileSync(join(dir,file),'utf8').trim();}catch{return null;}};
    try {
      git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
      git('branch','feature');git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');
      git('switch','-q','main');
      if(advanced){writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');}
      const before=gitStory(advanced)[4]!,names=new Map(git('log','--all','--format=%H %s').split('\n').map(row=>row.split(' ') as [string,string]));
      const subjects=(rev:string)=>git('rev-list',rev).split('\n').map(sha=>names.get(sha)!).sort();
      assert.deepEqual(subjects('feature'),history(before,'B').sort(),'B’s history');
      assert.deepEqual(subjects('main'),history(before,before.main).sort(),'main’s history before the move');
      const shaOf=new Map([...names].map(([sha,name])=>[name,sha]));
      // The label-only move: point main (checked out) at feature's commit.
      git('reset','-q','--hard','feature');
      const moved=moveMainToFeature(before);
      assert.equal(git('log','-1','--format=%s','main'),moved.main);
      assert.equal(git('log','-1','--format=%s'),moved.current);
      assert.deepEqual({colour:contents('colour.txt'),title:contents('title.txt')},currentFiles(moved));
      const orphans=[...shaOf].filter(([,sha])=>git('branch','--contains',sha)==='').map(([name])=>name).sort();
      assert.deepEqual(orphans,unreachable(moved),'commits no branch reaches after the move');
      assert.deepEqual(unreachable(moved),advanced?['C']:[]);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test('after M, real Git repeats a merge without changes, reverses it by fast-forward, and honours --no-ff',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rayner-git-back-'));
  const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
  const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
  try {
    git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
    git('branch','feature');git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');
    git('switch','-q','main');writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');
    git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','-m','M','feature');
    const merged=gitStory(true)[5]!;
    assert.ok(history(merged,merged.main).includes(merged.feature!),'feature’s commit is in M’s history');
    const mergedSha=git('rev-parse','main'),featureSha=git('rev-parse','feature');
    assert.match(git('-c','merge.ff=true','merge','--no-edit','feature'),/Already up to date/);
    assert.equal(git('rev-parse','main'),mergedSha,'merging an ancestor again leaves main at M');
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length),'repeated merge creates nothing');
    git('switch','-q','feature');
    git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','main');
    assert.equal(git('log','-1','--format=%s','feature'),'M');
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length),'no new commit');
    // Return to the same B -> M relation and request a merge commit explicitly.
    git('reset','-q','--hard',featureSha);
    git('-c','commit.gpgsign=false','merge','--no-ff','--no-edit','-m','forced','main');
    assert.deepEqual(git('show','-s','--format=%P','feature').split(' '),[featureSha,mergedSha]);
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length+1),'--no-ff makes a commit despite the possible fast-forward');
    assert.equal(readFileSync(join(dir,'colour.txt'),'utf8').trim(),'green');
    assert.equal(readFileSync(join(dir,'title.txt'),'utf8').trim(),'Home');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

// Enumerate prize and remaining-door choices directly. An informed host keeps
// the prize when it is unchosen; a random host chooses a remaining door uniformly.
test('host-conditioned odds and displayed rows match complete physical worlds',()=>{
  for(let n=3;n<=25;n++) for(const host of ['informed','random'] as const) {
    let stay=0,swap=0,continues=0;
    for(let prize=0;prize<n;prize++) for(let other=1;other<n;other++) {
      if(host==='informed'&&prize!==0) {swap++;continues++;}
      else if(prize===0) {stay++;continues++;}
      else if(other===prize) {swap++;continues++;}
    }
    const m=monty(n,host);
    close(m.stayChance,stay/continues);close(m.switchChance,swap/continues);close(m.continuationChance,continues/(n*(n-1)));
  }
  close(monty(100,'informed').switchChance,.99);close(monty(100,'random').continuationChance,.02);
  for(const choice of [0,1,2]) for(const host of ['informed','random'] as const) {
    const worlds=threeDoorWorlds(choice,host);
    // Independently open physical doors, then inspect the chosen and remaining
    // doors. Aggregate only the informed host's equivalent goat openings.
    const expected:{prize:string;opened:string;stay:string;swap:string}[]=[];
    for(let prize=0;prize<3;prize++) {
      const openings:{door:string;stay:string;swap:string}[]=[];
      for(let opened=0;opened<3;opened++) {
        if(opened===choice||(host==='informed'&&opened===prize)) continue;
        let remaining=-1;
        for(let door=0;door<3;door++) if(door!==choice&&door!==opened) remaining=door;
        const ended=opened===prize;
        openings.push({door:'ABC'[opened]!,
          stay:ended?'ends':choice===prize?'win':'lose',
          swap:ended?'ends':remaining===prize?'win':'lose'});
      }
      if(host==='informed') {
        assert.ok(openings.length>0);
        const {stay,swap}=openings[0]!;
        assert.ok(openings.every(o=>o.stay===stay&&o.swap===swap));
        expected.push({prize:'ABC'[prize]!,opened:openings.map(o=>o.door).join(' or '),stay,swap});
      } else for(const opening of openings) expected.push({prize:'ABC'[prize]!,
        opened:`${opening.door}: ${opening.door==='ABC'[prize]?'car':'goat'}`,
        stay:opening.stay,swap:opening.swap});
    }
    assert.deepEqual(worlds,expected,`every displayed ${host} host row with initial door ${'ABC'[choice]}`);
    assert.equal(worlds.length,host==='informed'?3:6);
    assert.equal(worlds.filter(w=>w.stay==='win').length,host==='informed'?1:2);
    assert.equal(worlds.filter(w=>w.swap==='win').length,2);
    assert.equal(worlds.filter(w=>w.stay==='ends').length,host==='informed'?0:2);
    for(const strategy of ['stay','switch'] as const) {
      const e=montyExample(choice,strategy);
      assert.notEqual(e.opened,e.prize);assert.notEqual(e.opened,choice);
      assert.equal(e.final,strategy==='stay'?choice:e.offered);assert.equal(e.won,e.final===e.prize);
    }
  }
});

test('each round’s chance and the odds after a seen door match a host simulated door by door',()=>{
  // Independently: weight each (car, opened) pair by 1/3 for the car times the host's chance of
  // opening that door, in integer twelfths, so only the final ratios are floats.
  for(const choice of [0,1,2]) for(const host of ['informed','random','leftmost','coin'] as const) {
    const twelfths=new Map<string,number>();
    for(let prize=0;prize<3;prize++) {
      const unchosen=[0,1,2].filter(d=>d!==choice);
      // The coin host may open the car (heads) only when the first pick is wrong.
      const allowed=host==='random'||(host==='coin'&&prize!==choice)?unchosen:unchosen.filter(d=>d!==prize);
      const picks=host==='leftmost'?[Math.min(...allowed)]:allowed;
      for(const d of picks) twelfths.set('ABC'[prize]!+'ABC'[d]!,4/picks.length);
    }
    const cells=threeDoorCells(choice,host);
    assert.equal(cells.length,twelfths.size,`${host} host, pick ${'ABC'[choice]}: one cell per possible round`);
    assert.equal(cells.reduce((n,c)=>n+c.sixths,0),6);
    for(const c of cells) {
      assert.equal(c.sixths*2,twelfths.get(c.prize+c.opened),`${host}: ${c.prize}${c.opened}`);
      const left='ABC'[[0,1,2].find(d=>d!==choice&&'ABC'[d]!==c.opened)!]!;
      assert.equal(c.shows,c.opened===c.prize?'car':'goat');
      assert.equal(c.swap,c.shows==='car'?'ends':left===c.prize?'win':'lose');
      assert.equal(c.stay,c.shows==='car'?'ends':'ABC'[choice]===c.prize?'win':'lose');
    }
    for(const opened of [0,1,2].filter(d=>d!==choice).map(d=>'ABC'[d]!)) {
      let stay=0,swap=0;
      for(const [round,w] of twelfths) if(round[1]===opened&&round[0]!==opened) {
        if(round[0]==='ABC'[choice]) stay+=w; else swap+=w;
      }
      if(stay+swap===0) { assert.throws(()=>oddsAfter(choice,host,opened),/never shows a goat/); continue; }
      const o=oddsAfter(choice,host,opened);
      close(o.switchChance,swap/(stay+swap));close(o.stayChance,stay/(stay+swap));
    }
  }
  // The values the scene and its check questions state.
  for(const choice of [0,1,2]) for(const opened of [0,1,2].filter(d=>d!==choice).map(d=>'ABC'[d]!)) {
    close(oddsAfter(choice,'informed',opened).switchChance,2/3);
    close(oddsAfter(choice,'random',opened).switchChance,1/2);
  }
  close(oddsAfter(0,'leftmost','C').switchChance,1);close(oddsAfter(0,'leftmost','B').switchChance,1/2);
  close(monty(4,'informed').switchChance,3/4);close(monty(100,'random').switchChance,1/2);
  // Check 2's coin-tossed host, by Bayes: (1/2·1/3 + 1/2·1/6) / (1/2·1/2 + 1/2·1/3) = 3/5, from the sixths the scene sums.
  {
    const i=oddsAfter(0,'informed','B'),r=oddsAfter(0,'random','B');
    close((i.swapSixths+r.swapSixths)/(i.sixths+r.sixths),3/5);
  }
  // Check 1: the coin host knows where the car is, yet his rounds are the random host's, cell for cell.
  for(const choice of [0,1,2]) assert.deepEqual(threeDoorCells(choice,'coin'),threeDoorCells(choice,'random'));
  close(oddsAfter(0,'coin','B').switchChance,1/2);
  // Check 2: the car behind A 40% of the time, B and C 30% each. By Bayes, with the pick A and B opened:
  // host who knows, stay .4·½ against switch .3·1; random host, stay .4·½ against switch .3·½.
  close(oddsAfter(0,'informed','B',[4,3,3]).switchChance,.3/(.2+.3));
  close(oddsAfter(0,'random','B',[4,3,3]).switchChance,.15/(.2+.15));
  for(const c of threeDoorCells(0,'informed',[4,3,3])) if(c.prize==='C') assert.equal(c.opened,'B');
  assert.throws(()=>threeDoorCells(0,'informed',[1,-1,1]),/non-negative/);
  assert.throws(()=>threeDoorCells(0,'psychic' as never),/Unknown host rule/);
});

// The scene's sentences about each host's rule, over every first pick: with the car behind one
// unchosen door, the host who knows always opens the other one, the only goat left to him; the
// random host opens that door in only half of those rounds and the car in the rest; and the host
// who knows never opens the car.
test('the host who knows always opens the only goat left when your pick is wrong, and the random host opens it in only half those rounds',()=>{
  for(const choice of [0,1,2]) for(const prize of [0,1,2].filter(d=>d!==choice)) {
    const goat=[0,1,2].find(d=>d!==choice&&d!==prize)!,car='ABC'[prize]!,other='ABC'[goat]!;
    const round=(host:'informed'|'random')=>threeDoorCells(choice,host).filter(c=>c.prize===car);
    assert.deepEqual(round('informed').map(c=>[c.opened,c.shows,c.sixths]),[[other,'goat',2]],`host who knows, pick ${'ABC'[choice]}, car ${car}`);
    assert.deepEqual(round('random').map(c=>[c.opened,c.shows,c.sixths]).sort(),[[car,'car',1],[other,'goat',1]].sort(),`random host, pick ${'ABC'[choice]}, car ${car}`);
  }
  for(const choice of [0,1,2]) for(const prior of [[1,1,1],[4,3,3],[1,0,5]])
    assert.ok(threeDoorCells(choice,'informed',prior).every(c=>c.shows==='goat'),'the host who knows never opens the car');
});

// The round machine the doors step plays: every legal round it reaches, walked event by event, is a
// cell of the strip, and each cell is reached, with the same winner for staying and for switching.
test('every round the round machine can play is a cell of the strip, with the strip’s winner',()=>{
  for(const host of ['informed','random'] as const) {
    let states=0;
    const seen=new Set<string>(),ended:Round[]=[];
    const queue:Round[]=[roundStart(host)];
    while(queue.length) {
      const r=queue.shift()!,key=JSON.stringify(r);
      if(seen.has(key)) continue;
      seen.add(key);states++;
      if(r.car!==null) ended.push(r);
      for(const e of ROUND_EVENTS) {
        const next=roundNext(r,e);
        if(isRefusal(next)) continue;
        // The rules' refusals: he never opens your door, and the host who knows never opens the car.
        if(e.startsWith('open')) { assert.notEqual(next.opened,r.pick); if(host==='informed') assert.equal(next.shows,'goat'); }
        queue.push(next);
      }
    }
    assert.equal(states,host==='informed'?46:52);
    assert.ok(ROUND_EVENTS.every(e=>isRefusal(roundNext(roundStart(host),e))||e.startsWith('pick')),'nothing but a pick starts a round');
    for(const choice of [0,1,2]) {
      const mine=ended.filter(r=>r.pick===choice);
      const cells=threeDoorCells(choice,host).map(c=>JSON.stringify([c.prize,c.opened,c.shows]));
      assert.deepEqual([...new Set(mine.map(r=>JSON.stringify(['ABC'[r.car!],'ABC'[r.opened!],r.shows])))].sort(),[...cells].sort(),`${host}, pick ${'ABC'[choice]}`);
      for(const r of mine) {
        const cell=threeDoorCells(choice,host).find(c=>c.prize==='ABC'[r.car!]&&c.opened==='ABC'[r.opened!])!;
        const said=roundResult(r)==='over'?'ends':roundResult(r);
        assert.equal(said,r.decision==='switch'?cell.swap:cell.stay,JSON.stringify(r));
        if(r.decision==='switch') assert.notEqual(roundDoor(r),r.pick);
      }
    }
  }
});

// Each refusal names the rule that forbids the move, in the reader's words.
test('the round machine says which rule refuses a move',()=>{
  const why=(host:'informed'|'random',events:RoundEvent[],event:RoundEvent)=>{
    const r=events.reduce<Round>((at,e)=>roundNext(at,e) as Round,roundStart(host)),refused=roundNext(r,event);
    return isRefusal(refused)?refused.reason:undefined;
  };
  assert.equal(why('informed',[],'open B: goat'),'the host opens a door only after you pick one');
  assert.equal(why('informed',[],'stay'),'you stay or switch once the host has opened a door');
  assert.equal(why('informed',[],'car behind A'),'the car is shown once you have stayed or switched');
  assert.equal(why('informed',['pick A'],'pick B'),'you picked door A already, and you pick once');
  assert.equal(why('informed',['pick A'],'open A: goat'),'door A is yours, and the host never opens your door');
  assert.equal(why('informed',['pick A'],'open B: car'),'the host knows where the car is, and never opens its door');
  assert.equal(why('random',['pick A'],'open B: car'),undefined);
  assert.equal(why('informed',['pick A','open B: goat'],'open C: goat'),'the host opened door B already, and he opens one door');
  assert.equal(why('informed',['pick A','open B: goat','stay'],'switch'),'you chose to stay already');
  assert.equal(why('informed',['pick A','open B: goat','stay'],'car behind B'),'door B is open and shows a goat');
  assert.equal(why('informed',['pick A','open B: goat','stay','car behind C'],'car behind A'),'the car was shown behind door C already');
  assert.equal(why('random',['pick A','open B: car'],'switch'),'the host showed the car behind door B, so the round is over');
  assert.equal(why('random',['pick A','open B: car'],'car behind C'),'the car was shown behind door B already');
});

test('birthday formulas match exhaustive small calendars and independent exact Python fractions',()=>{
  for(let days=1;days<=5;days++) for(let people=1;people<=5;people++) {
    let any=0,one=0;
    const total=days**people;
    for(let world=0;world<total;world++) {
      let v=world;const dates=Array.from({length:people},()=>{const d=v%days;v=Math.floor(v/days);return d;});
      let collision=false;
      for(let a=0;a<people;a++) for(let b=a+1;b<people;b++) if(dates[a]===dates[b]) collision=true;
      const marked=dates.slice(1).some(d=>d===dates[0]);
      any+=Number(collision);one+=Number(marked);
      assert.equal(matches(dates,'any'),collision);assert.equal(matches(dates,'one'),marked);
    }
    close(birthdayChance(people,'any',days),any/total);close(birthdayChance(people,'one',days),one/total);
  }
  for(const people of [10,23,40,50]) for(const q of ['any','one'] as const) {
    const f=fixture.birthdays[`${people}:${q}`];
    close(birthdayChance(people,q),f.chance);assert.deepEqual(birthdaySample(people,q),f.sample);
  }
  fc.assert(fc.property(fc.integer({min:1,max:999}),fc.integer({min:1,max:1000}),(people,days)=>{
    for(const q of ['any','one'] as const) {
      const p=birthdayChance(people,q,days),next=birthdayChance(people+1,q,days);
      assert.ok(p>=0&&p<=1&&next>=p-1e-14);
    }
    assert.ok(birthdayChance(people,'any',days)>=birthdayChance(people,'one',days)-1e-14);
  }),params());
  close(birthdayChance(23,'any'),.5072972343239854);close(birthdayChance(23,'one'),.058571325264343);
});

test('the birthday story: thresholds, pairs, the shortcut, dates, and the answer and check questions it asks',()=>{
  // 23 people for an even chance of any match; 254 for someone matching one person, who then has 253 others.
  assert.equal(evenOdds('any'),23);assert.equal(evenOdds('one'),254);
  assert.ok(birthdayChance(22,'any')<.5&&birthdayChance(23,'any')>=.5);
  assert.ok(birthdayChance(253,'one')<.5&&birthdayChance(254,'one')>=.5);
  assert.equal(pairCount(23),253);
  for(let n=1;n<=60;n++){
    let pairs=0;for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)pairs++;
    assert.equal(pairCount(n),pairs);
    // The shortcut is exact for comparisons against one fixed birthday.
    close(pairShortcut(n-1),birthdayChance(n,'one'));
  }
  assert.equal(birthdayAnswer,`A room of ${evenOdds('any')} people gives a better than even chance that two share a birthday, because ${evenOdds('any')} people make ${pairCount(evenOdds('any'))} pairs, each a chance to match`);
  assert.equal(BirthdayParadox.meta.answer,birthdayAnswer);
  // Dates of a 365-day year, checked against the calendar of a non-leap year.
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for(let day=1;day<=365;day++){
    const d=new Date(Date.UTC(2023,0,day));
    assert.equal(dateOf(day),`${d.getUTCDate()} ${months[d.getUTCMonth()]}`);
  }
  assert.throws(()=>dateOf(366));
  const room=birthdayStory(23);
  assert.deepEqual(room.shared,[{day:116,date:'26 Apr',people:2},{day:31,date:'31 Jan',people:2}]);
  assert.equal((100*room.shortcut).toFixed(2),'50.05');assert.equal((100*room.chance).toFixed(2),'50.73');
  assert.deepEqual(birthdayStory(10).shared,[]);
  // The pairs step draws the room's matched pairs: one pair per repeated date in the rooms of 23 and 40, none in the room of 10.
  for(const n of [10,23,40]){
    const story=birthdayStory(n);
    assert.equal(story.matchedPairs.length,story.shared.reduce((sum,d)=>sum+pairCount(d.people),0));
    for(const [i,j] of story.matchedPairs) assert.ok(i<j&&story.sample.first[i]===story.sample.first[j]);
    // The estimate step says the pair shortcut is within a percentage point of the exact chance.
    assert.ok(story.chance-story.shortcut>0&&story.chance-story.shortcut<.01);
    // It also says the shortcut is the chance of sharing one birthday with as many other people as the room has pairs.
    close(story.shortcut,birthdayChance(story.pairs+1,'one'));
  }
  assert.equal(room.matchedPairs.length,2);
  // Transfer exercises: two rooms of 23 merged, and a 100-day year.
  assert.equal(pairCount(46),1035);assert.equal(pairCount(46)-2*pairCount(23),23*23);assert.ok(23*23>2*pairCount(23));
  assert.equal(evenOdds('any',100),13);assert.equal(pairCount(13),78);
  assert.equal((100*birthdayChance(13,'any',100)).toFixed(1),'55.7');assert.equal((100*birthdayChance(12,'any',100)).toFixed(1),'49.7');
  assert.equal(evenOdds('one',100)-1,69);close(pairShortcut(69,100),birthdayChance(70,'one',100));
  assert.equal((100*birthdayChance(70,'one',100)).toFixed(1),'50.0');assert.equal((100*birthdayChance(69,'one',100)).toFixed(1),'49.5');
  const [merged,calendar]=BirthdayParadox.meta.checks;
  assert.match(merged!.answer, /529 new pairs/);
  assert.match(merged!.answer, /1,035 pairs, compared with 506/);
  assert.match(calendar!.answer, /13 people suffice/);
  assert.match(calendar!.answer, /55.7%/);
  assert.match(calendar!.answer, /12 people.*49.7%/);

});

test('the music comparison preserves pitches and total beats while moving exactly two starts and durations',()=>{
  const expected=[60,62,64,67,64,62,60,60];
  assert.deepEqual(phrase('straight').map(n=>n.midi),expected);
  assert.deepEqual(phrase('syncopated').map(n=>n.at),[0,1,2,3.5,4.5,5,6,7]);
  assert.deepEqual(phrase('syncopated').map(n=>n.duration),[1,1,1.5,1,.5,1,1,1]);
  // A tempo no scenario shows (no longer a check question; the claim stands): G starts half a beat, 375 ms, before the bar line at 80 BPM...
  assert.equal((4-phrase('syncopated')[3]!.at)*beatMs(80),375);
  // ...and G sounds for one beat, 750 ms, half of it on each side of the bar line.
  {const g=phrase('syncopated')[3]!;assert.equal(g.duration*beatMs(80),750);assert.equal((4-g.at)*beatMs(80),(g.at+g.duration-4)*beatMs(80));}
  // The first check's version C, which no case shows: D cut to half a beat, the next E held 1.5, so beat 3 (index 2) gets no new start and nothing crosses the bar line.
  {const durations=[1,.5,1.5,1,1,1,1,1];let at=0;const c=durations.map(duration=>{const n={at,duration};at+=duration;return n;});
    assert.deepEqual(c.map(n=>n.at),[0,1,1.5,3,4,5,6,7]);assert.ok(!c.some(n=>n.at===2)&&c.some(n=>n.at<2&&n.at+n.duration>2));
    assert.ok(!c.some(n=>n.at<4&&n.at+n.duration>4));assert.match(MelodyRhythm.meta.checks[0]!.answer,/^Beat 3 of bar 1/);}
  // A half-beat rest in place of the longer E (no longer a check question; the claim stands): G still starts at 3.5 and holds across beat 4 (the bar line).
  {const g={at:2+1+.5,duration:1};assert.equal(g.at,phrase('syncopated')[3]!.at);assert.ok(g.at<4&&g.at+g.duration>4);}
  // The second check: B counted in threes, bar lines at beats 3 and 6. The first E (index 2) holds across the line at 3, G starts
  // half a beat after it, and the line at 6, the seventh beat, opens with a C.
  {const b=phrase('syncopated'),across=(t:number)=>b.filter(n=>n.at<t&&n.at+n.duration>t);
    assert.deepEqual(across(3),[b[2]]);assert.equal(b[2]!.midi,64);assert.equal(b[2]!.at,2);assert.equal(b[3]!.at,3.5);
    assert.deepEqual(across(6),[]);assert.deepEqual(b.filter(n=>n.at===6).map(n=>n.midi),[60]);
    assert.match(MelodyRhythm.meta.checks[1]!.answer,/^The first E\. It starts on beat 3 of bar 1 .* brings a C that starts exactly there\.$/);}
  // The third check: the E after G at a full beat, later notes straight after it. D and both Cs start at 5.5, 6.5 and 7.5,
  // none on a beat of bar 2, and the last C ends at 8.5, half a beat past the end of bar 2.
  {const durations=phrase('syncopated').map((n,i)=>i===4?1:n.duration);let at=0;const v=durations.map(duration=>{const n={at,duration};at+=duration;return n;});
    assert.deepEqual(v.slice(5).map(n=>n.at),[5.5,6.5,7.5]);assert.ok(!v.some(n=>n.at>=4&&n.at<8&&Number.isInteger(n.at)));
    assert.equal(v.at(-1)!.at+v.at(-1)!.duration,8.5);assert.match(MelodyRhythm.meta.checks[2]!.answer,/^None\. D and both Cs/);}
  for(const timing of ['straight','syncopated'] as const) for(const bpm of [96,120]) {
    const m=musicStory(timing,bpm);
    assert.equal(m.movedStarts,timing==='straight'?0:2);assert.equal(m.movedDurations,m.movedStarts);
    assert.deepEqual(m.crossing,timing==='straight'?[]:[{midi:67,at:3.5,duration:1}]);
    // The first E, G and the E after it: two lengths and two starts, by index.
    assert.deepEqual(m.changed,timing==='straight'?[]:[2,3,4]);
    assert.equal(m.beatMs,{96:625,120:500}[bpm]);
    for(const clip of m.clips) {
      assert.deepEqual(clip.notes.map(n=>n.midi),expected);
      assert.equal(clip.notes.at(-1)!.at+clip.notes.at(-1)!.duration,8);
      assert.equal(stepAudio({clips:[clip]})!.clips[0],clip);
    }
    for(const [i,clip] of m.flat.entries()) {
      assert.deepEqual(clip.notes.map(n=>n.midi),Array(8).fill(60));
      assert.deepEqual(clip.notes.map(({at,duration})=>({at,duration})),m.clips[i]!.notes.map(({at,duration})=>({at,duration})));
    }
  }
});

test('every melody scenario at both tempos: A starts a note on every beat, the shifted B starts none on the 1 of bar 2, the control B starts every note on a beat',()=>{
  for(const timing of ['straight','syncopated'] as const) for(const bpm of [96,120]) {
    const m=musicStory(timing,bpm);
    // The pitched score and the all-C score of the rhythm step.
    for(const [score,clips] of [['pitched',m.clips],['flat',m.flat]] as const) {
      const at=`${timing} at ${bpm} BPM, ${score}`,a=clips[0]!.notes,b=clips[1]!.notes;
      // A: a new note on each of the eight clicks, the 1 of bar 2 (beat 4) among them.
      assert.deepEqual(a.map(n=>n.at),[0,1,2,3,4,5,6,7],at);
      const onTheOne=b.filter(n=>n.at===4),across=b.filter(n=>n.at<4&&n.at+n.duration>4);
      if(timing==='syncopated') {
        // The shifted B: nothing starts on the 1 of bar 2, one note holds across the bar line, and some starts fall between beats.
        assert.deepEqual(onTheOne,[],at);assert.equal(across.length,1,at);
        assert.ok(b.some(n=>!Number.isInteger(n.at)),at);
        if(score==='pitched') assert.equal(across[0]!.midi,67,`${at}: the note across the bar line is G`);
      } else {
        // The control B: A's starts and lengths, every start on a beat, nothing across the bar line.
        assert.deepEqual(b.map(({at,duration})=>({at,duration})),a.map(({at,duration})=>({at,duration})),at);
        assert.ok(b.every(n=>Number.isInteger(n.at)),at);assert.deepEqual(across,[],at);
      }
    }
  }
});

test('audio metadata rejects malformed serialized inputs rather than scheduling unbounded sound',()=>{
  assert.equal(stepAudio(undefined),null);
  const valid=()=>({clips:[{id:'a',label:'A',bpm:96,beats:8,notes:[{midi:60,at:0,duration:1}],plot:[0,0,8,4]}]});
  for(const bad of [null,{},false,{clips:[]},{clips:Array(1)}, {clips:Array(5).fill(valid().clips[0])}]) assert.throws(()=>stepAudio(bad),/Invalid step audio/);
  const mutations:((v:any)=>void)[]=[
    v=>v.clips.push(v.clips[0]),v=>v.clips[0].id='A',v=>v.clips[0].label=' ',
    v=>v.clips[0].bpm=NaN,v=>v.clips[0].bpm=241,v=>v.clips[0].beats=Infinity,
    v=>v.clips[0].notes[0].midi=128,v=>v.clips[0].notes[0].midi=60.5,
    v=>v.clips[0].notes[0].at=-1,v=>v.clips[0].notes[0].duration=0,
    v=>v.clips[0].notes[0].duration=9,v=>v.clips[0].plot=null,v=>v.clips[0].plot=Array(4),
    v=>v.clips[0].plot=[0,0,Infinity,4],v=>v.clips[0].plot=[0,0,0,4],
  ];
  for(const mutate of mutations) {const v=valid();mutate(v);assert.throws(()=>stepAudio(v),/Invalid step audio/);}
});

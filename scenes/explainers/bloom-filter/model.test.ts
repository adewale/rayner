import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { listed } from '../lib/format.ts';
import { CLEARED, EEL } from './answers.ts';
import { readFileSync } from 'node:fs';
import { fc, params } from '../lib/pbt.ts';
import { fnv1a, locations, makeFilter, membership, bloomStory, saturation } from './model.ts';

test('the check answers’ words: eel’s bits are 23, 20 and 1, and clearing dog refuses cat at 16 bits only', () => {
  // The first answer's words name eel's bits: 23 now from eel, and eel set bit 20.
  assert.equal(listed(EEL.at), '23, 20 and 1');
  // The answer's words take the verdicts as given: cat refused at 16 bits, still maybe at 32.
  assert.deepEqual(CLEARED.map((c) => c.cat), [false, true]);
});

const utf16=fc.array(fc.integer({min:0,max:65535}),{maxLength:100}).map(units=>String.fromCharCode(...units));

const fixture=JSON.parse(readFileSync(new URL('./fixtures/fnv.json',import.meta.url),'utf8'));

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

test('native CPython storage and exact arithmetic reproduce the recorded vectors',t=>{
  const version=spawnSync('python3',['-c','import sys; print(".".join(map(str,sys.version_info[:2])))'],{encoding:'utf8'});
  if(version.status!==0||version.stdout.trim()!=='3.12') {t.skip('64-bit CPython 3.12 is required for the native storage oracle');return;}
  const now=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./oracle/fnv.py',import.meta.url))],{encoding:'utf8'}));
  delete now.python; const {python:_,...expected}=fixture;
  assert.deepEqual(now,expected);
});

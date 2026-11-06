import { test } from 'node:test';
import { isRefusal } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fc, params } from '../lib/pbt.ts';
import { dictionary, deleteFirst, lookup, probeSlots, route, dictStory, dictStart, dictNext, DICT_EVENTS, EMPTY, DELETED } from './model.ts';
import type { DictState, DictEvent } from './model.ts';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/cpython-dict.json',import.meta.url),'utf8'));

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
  const now=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./oracle/cpython_dict.py',import.meta.url))],{encoding:'utf8'}));
  delete now.python; const {python:_,...expected}=fixture;
  assert.deepEqual(now,expected);
});

// Its scene half, the story's steps, is in scene.test.ts.
test('a middle deletion needs the marker too, and absent lookups need unused space', () => {
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
});

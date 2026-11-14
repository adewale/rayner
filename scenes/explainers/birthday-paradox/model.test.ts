import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fc, params } from '../lib/pbt.ts';
import { birthdayChance, birthdaySample, matches } from './model.ts';
import { skipOracle } from '../lib/oracle.ts';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/birthdays.json',import.meta.url),'utf8'));

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-14,`${a} != ${b}`);

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

test('native CPython storage and exact arithmetic reproduce the recorded vectors',t=>{
  const version=spawnSync('python3',['-c','import sys; print(".".join(map(str,sys.version_info[:2])))'],{encoding:'utf8'});
  if(skipOracle(t,(version.status!==0||version.stdout.trim()!=='3.12')&&'64-bit CPython 3.12 is required for the native storage oracle')) return;
  const now=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./oracle/birthdays.py',import.meta.url))],{encoding:'utf8'}));
  delete now.python; const {python:_,...expected}=fixture;
  assert.deepEqual(now,expected);
});

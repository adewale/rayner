import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phrase, musicStory, beatMs } from './model.ts';
import MelodyRhythm from './scene.ts';
import { readFileSync } from 'node:fs';
import { withIntent } from '../../../explain/testing.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { loadProject } from '../../../explain/testing.ts';
import { Text, Rectangle } from '../../../src/index.ts';

// The scene's metadata with its script's intent adopted, as the command adopts it.
const scriptMeta = withIntent(MelodyRhythm, readFileSync('scenes/explainers/melody-rhythm/script.md', 'utf8'), 'scenes/explainers/melody-rhythm/script.md').meta as ExplainerMeta;

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
    assert.ok(!c.some(n=>n.at<4&&n.at+n.duration>4));assert.match(scriptMeta.questions![0]!.answer,/^Beat 3 of bar 1/);}
  // A half-beat rest in place of the longer E (no longer a check question; the claim stands): G still starts at 3.5 and holds across beat 4 (the bar line).
  {const g={at:2+1+.5,duration:1};assert.equal(g.at,phrase('syncopated')[3]!.at);assert.ok(g.at<4&&g.at+g.duration>4);}
  // The second check: B counted in threes, bar lines at beats 3 and 6. The first E (index 2) holds across the line at 3, G starts
  // half a beat after it, and the line at 6, the seventh beat, opens with a C.
  {const b=phrase('syncopated'),across=(t:number)=>b.filter(n=>n.at<t&&n.at+n.duration>t);
    assert.deepEqual(across(3),[b[2]]);assert.equal(b[2]!.midi,64);assert.equal(b[2]!.at,2);assert.equal(b[3]!.at,3.5);
    assert.deepEqual(across(6),[]);assert.deepEqual(b.filter(n=>n.at===6).map(n=>n.midi),[60]);
    assert.match(scriptMeta.questions![1]!.answer,/^The first E\. It starts on beat 3 of bar 1 .* brings a C that starts exactly there\.$/);}
  // The third check: the E after G at a full beat, later notes straight after it. D and both Cs start at 5.5, 6.5 and 7.5,
  // none on a beat of bar 2, and the last C ends at 8.5, half a beat past the end of bar 2.
  {const durations=phrase('syncopated').map((n,i)=>i===4?1:n.duration);let at=0;const v=durations.map(duration=>{const n={at,duration};at+=duration;return n;});
    assert.deepEqual(v.slice(5).map(n=>n.at),[5.5,6.5,7.5]);assert.ok(!v.some(n=>n.at>=4&&n.at<8&&Number.isInteger(n.at)));
    assert.equal(v.at(-1)!.at+v.at(-1)!.duration,8.5);assert.match(scriptMeta.questions![2]!.answer,/^None\. D and both Cs/);}
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
    }
    for(const [i,clip] of m.flat.entries()) {
      assert.deepEqual(clip.notes.map(n=>n.midi),Array(8).fill(60));
      assert.deepEqual(clip.notes.map(({at,duration})=>({at,duration})),m.clips[i]!.notes.map(({at,duration})=>({at,duration})));
    }
  }
});

test('both piano rolls put every played pitch, onset and duration at its stated score coordinates', async () => {
  const p = await loadProject(MelodyRhythm, 'scenes/explainers/melody-rhythm');
  // Two versions of B; the tempo setting, which changed no picture's notes, is gone.
  assert.equal(p.scenarios.length, 2);
  let pictures = 0,
    notes = 0;
  for (const scenario of p.scenarios)
    await new scenario.Scene(
      {
        skipUntil: Infinity,
        async frame() {},
        async stepEnd(scene, step) {
          const flat = step.name === 'rhythm';
          for (const [lane, id] of ['a', 'b'].entries()) {
            const shifted = id === 'b' && scenario.values.timing === 'syncopated';
            const starts = shifted ? [0, 1, 2, 3.5, 4.5, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
            const duration = shifted ? [1, 1, 1.5, 1, 0.5, 1, 1, 1] : Array(8).fill(1);
            const names = flat ? Array(8).fill('C') : ['C', 'D', 'E', 'G', 'E', 'D', 'C', 'C'];
            const heights = flat ? Array(8).fill(0) : [0, 0.5, 1, 1.5, 1, 0.5, 0, 0];
            for (let i = 0; i < 8; i++) {
              const group = scene.familyMembers().find((m) => m.key === `note-${id}-${i}`);
              assert.ok(group, `${step.name}: missing note ${id}/${i}`);
              const rect = group.family().find((m) => m instanceof Rectangle),
                text = group.family().find((m) => m instanceof Text);
              assert.ok(rect instanceof Rectangle && text instanceof Text);
              const [x, y] = rect.center();
              assert.ok(Math.abs(x - (-6 + (starts[i]! + duration[i]! / 2) * 1.65)) < 1e-5);
              assert.ok(Math.abs(y - ((lane === 0 ? 0.25 : -2.5) + heights[i]!)) < 1e-5);
              assert.ok(Math.abs(rect.width() - (duration[i]! * 1.65 - 0.08)) < 1e-5);
              assert.equal(text.text, names[i]);
              notes++;
            }
          }
          pictures++;
        },
      },
    ).run();
  // Four steps in each of two scenarios, sixteen notes a picture (timing merged into bar, phrase cut).
  assert.equal(pictures, 8);
  assert.equal(notes, 128);
});

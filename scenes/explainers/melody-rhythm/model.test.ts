import { test } from 'node:test';
import assert from 'node:assert/strict';
import { musicStory } from './model.ts';

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

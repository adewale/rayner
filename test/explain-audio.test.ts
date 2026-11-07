import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepAudio } from '../explain/audio.ts';

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

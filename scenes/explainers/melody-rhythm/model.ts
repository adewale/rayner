import type { AudioClip, ScoreNote } from '../../../explain/score.ts';
// Two versions of one eight-note tune, C D E G E D C C, in beats: A starts a note on every beat; the
// syncopated B lengthens the first E to one and a half beats and shortens the E after G to half a beat,
// so G starts halfway through beat 4 and holds across the bar line. What it leaves out: two bars of four
// beats, four pitches and half-beat durations only, no rests, accents, swing or articulation, one
// loudness, and 96 or 120 BPM. Playback is an unaccented Web Audio oscillator. The score is computed and
// checked; no listening study establishes how strongly a listener hears the syncopation.
export type Timing = 'syncopated' | 'straight';
export const PITCHES = [60,62,64,67,64,62,60,60] as const;
export const NOTE_NAMES: Record<number,string> = {60:'C',62:'D',64:'E',67:'G'};
export function phrase(timing: Timing, flat = false): ScoreNote[] {
  if (timing !== 'syncopated' && timing !== 'straight') throw new Error('Unknown rhythm');
  const durations=timing==='straight' ? Array(8).fill(1) : [1,1,1.5,1,0.5,1,1,1];
  let at=0;
  return PITCHES.map((midi,i)=>{const n={midi:flat ? 60 : midi,at,duration:durations[i]!};at+=n.duration;return n;});
}
/** How long one beat lasts at a tempo: the score is in beats, the sound in milliseconds. */
export const beatMs = (bpm: number) => 60000 / bpm;
export function musicClips(timing: Timing, bpm: number, flat = false): AudioClip[] {
  if (![96,120].includes(bpm)) throw new Error('Use 96 or 120 BPM in this lesson');
  return [
    {id:'a',label:'Play A: even beats',bpm,beats:8,notes:phrase('straight',flat),plot:[-6,-0.1,7.2,2.2]},
    {id:'b',label:timing==='syncopated' ? 'Play B: shifted timing' : 'Play B: even beats',bpm,beats:8,notes:phrase(timing,flat),plot:[-6,-2.85,7.2,-0.35]},
  ];
}
export function musicStory(timing: Timing, bpm: number) {
  const clips=musicClips(timing,bpm), a=clips[0]!.notes,b=clips[1]!.notes;
  return {timing,bpm,clips,flat:musicClips(timing,bpm,true),
    movedStarts:b.filter((n,i)=>n.at!==a[i]!.at).length,
    movedDurations:b.filter((n,i)=>n.duration!==a[i]!.duration).length,
    crossing:b.filter(n=>n.at<4 && n.at+n.duration>4),
    // Notes of B whose start or length differs from A's, by index.
    changed:b.flatMap((n,i)=>n.at!==a[i]!.at||n.duration!==a[i]!.duration ? [i] : []),
    beatMs:beatMs(bpm)};
}

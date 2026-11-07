/** A portable, locally synthesised note. Positions and durations use beats. */
export interface ScoreNote {midi: number; at: number; duration: number}
export interface AudioClip {
  id: string; label: string; bpm: number; beats: number; notes: readonly ScoreNote[];
  /** A score rectangle in scene coordinates; the playhead follows this same beat axis. */
  plot?: readonly [left: number, bottom: number, right: number, top: number];
}
export interface StepAudio {clips: readonly AudioClip[]}
/** Validate the serialized authoring boundary before a build or playback. */
export function stepAudio(value: unknown): StepAudio | null {
  if (value === undefined) return null;
  const fail=(): never=>{throw new TypeError('this.step(): its audio is invalid; use one to four labelled clips with distinct lowercase ids, 40–240 BPM, at most 64 beats and 256 MIDI notes that end within the clip');};
  if (!value || typeof value !== 'object' || !Array.isArray((value as StepAudio).clips)) return fail();
  const clips=(value as StepAudio).clips;
  if (!clips.length || clips.length>4) return fail();
  const ids=new Set<string>();
  for (const clip of clips) {
    if (!clip || typeof clip !== 'object' || typeof clip.id!=='string' || !/^[a-z][a-z0-9-]*$/.test(clip.id) || ids.has(clip.id) ||
        typeof clip.label!=='string' || !clip.label.trim() || clip.label.length>100 ||
        !Number.isFinite(clip.bpm) || clip.bpm<40 || clip.bpm>240 ||
        !Number.isFinite(clip.beats) || clip.beats<=0 || clip.beats>64 || !Array.isArray(clip.notes) || clip.notes.length>256) return fail();
    ids.add(clip.id);
    for (const n of clip.notes) if (!n || !Number.isInteger(n.midi) || n.midi<0 || n.midi>127 ||
      !Number.isFinite(n.at) || n.at<0 || !Number.isFinite(n.duration) || n.duration<=0 || n.at+n.duration>clip.beats+1e-9) return fail();
    if (clip.plot !== undefined && (!Array.isArray(clip.plot) || clip.plot.length!==4 || !Array.from(clip.plot).every(Number.isFinite) ||
      clip.plot[0]>=clip.plot[2] || clip.plot[1]>=clip.plot[3])) return fail();
  }
  return value as StepAudio;
}

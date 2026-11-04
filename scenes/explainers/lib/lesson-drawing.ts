import { Scene, Group, Text, jsonObject } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import type {StepAudio} from '../../../explain/audio.ts';
import type { Stage } from '../../../explain/index.ts';
// The drawing kit is published as rayner/drawing; the collection's scenes keep importing it from here.
export { keyed, label, tile, segment, dot, table, stat, flow, bars } from '../../../explain/drawing.ts';
export type { TableColumns } from '../../../explain/drawing.ts';

export interface LessonFrame {
  id: string;
  title: string;
  line: string;
  caption: string;
  state: Record<string, unknown>;
  draw: (s: Stage) => Group;
  audio?: StepAudio;
  detail?: boolean;
}
export type NarrativeFrame = Omit<LessonFrame, 'state'>;

/** Present the common caption, drawing, readable subjects and description sequence. */
export async function presentFrame(scene: Scene, s: Stage, frame: NarrativeFrame, setState: () => void, reader = false) {
  await scene.step(frame.id, {title: frame.title, line: frame.line, caption: frame.caption,
    ...(frame.audio ? {audio: frame.audio} : {}), ...(frame.detail ? {detail: true} : {}), ...(reader ? {reader: true} : {})});
  await s.clear({runTime: 0.18});
  setState();
  const drawing = frame.draw(s);
  if (reader) drawing.key = 'reader-picture';
  s.reading(drawing);
  const words = drawing.family().filter((m): m is Text => m instanceof Text).map(t => t.text).filter(Boolean);
  await s.enter(drawing, {runTime: reader ? 0.25 : 0.24, describe: words.join('. ')});
}

export async function lesson(scene: Scene, frames: readonly LessonFrame[], style = 'github-light') {
  const s = stage(scene, {style, headingSize: 0.6});
  for (const frame of frames) await presentFrame(scene, s, frame, () => {
    scene.state = {...jsonObject(frame.state, 'lesson state'), phase: frame.id};
  });
}

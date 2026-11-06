import { Group, Rectangle, Circle } from '../../../src/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { label, segment } from '../../../explain/drawing.ts';
import { NOTE_NAMES } from './model.ts';

/** What a step's score outlines, marks and says. */
export interface Look {
  /** No beat lines, beat numbers or bar labels: the opening, before the pulse is counted. */
  bare?: boolean;
  /** Every beat line drawn strong, for the step about the pulse. */
  pulse?: boolean;
  /** The 1 that opens each bar drawn large, in the emphasis colour: the strong beat. */
  accent?: boolean;
  /** Notes outlined in red, as `${clip id}-${index}`. */
  marked?: readonly string[];
  /** Notes outlined boldly in the emphasis colour, as `${clip id}-${index}`. */
  lit?: readonly string[];
  /** A dot under each note's start: emphasis on a beat, red between beats. */
  onsets?: boolean;
  /** Words under the score in place of the two bar labels. */
  footer?: string;
}
const X0 = -6,
  DX = (7.2 - X0) / 8;
/**
 * The two piano rolls, A above B: left to right is time, height is pitch and width is how long a note
 * sounds, with a line on every beat (the bar line strong) and the beat numbers over A.
 */
export function scorePicture(s: Stage, clips: AudioClip[], look: Look = {}) {
  const figure = new Group();
  figure.key = 'music-score';
  clips.forEach((clip, lane) => {
    const base = lane === 0 ? 0.25 : -2.5,
      top = base + 1.5;
    const row = new Group(label(lane === 0 ? 'A' : 'B', -7.05, base + 0.7, s.palette.ink, 0.7));
    row.key = `score-${clip.id}`;
    if (!look.bare)
    for (let beat = 0; beat <= 8; beat++)
      row.add(
        segment(
          [X0 + beat * DX, base - 0.3],
          [X0 + beat * DX, top + 0.25],
          beat === 4 || look.pulse ? s.emphasis : s.soft,
          beat === 4 ? 0.04 : look.pulse ? 0.035 : 0.012,
        ),
      );
    if (lane === 0 && !look.bare)
      for (let beat = 0; beat < 8; beat++) {
        const strong = look.accent && beat % 4 === 0;
        row.add(
          label(String((beat % 4) + 1), X0 + beat * DX, top + 0.8, strong ? s.emphasis : s.soft, strong ? 0.95 : 0.7, `beat-${beat}`),
        );
      }
    clip.notes.forEach((note, i) => {
      const y = base + [60, 62, 64, 67].indexOf(note.midi) * 0.5,
        x = X0 + (note.at + note.duration / 2) * DX;
      const marked = look.marked?.includes(`${clip.id}-${i}`),
        lit = look.lit?.includes(`${clip.id}-${i}`);
      const rect = new Rectangle({
        width: note.duration * DX - 0.08,
        height: 0.7,
        fill: s.palette.paper,
        stroke: marked ? s.bad : s.emphasis,
        strokeWidth: marked || lit ? 0.065 : 0.03,
      }).moveTo([x, y]);
      const g = new Group(rect, label(NOTE_NAMES[note.midi]!, x, y, s.palette.ink, 0.7));
      g.key = `note-${clip.id}-${i}`;
      row.add(g);
      if (look.onsets) {
        const onBeat = Number.isInteger(note.at);
        const dot = new Circle({ radius: 0.1, fill: onBeat ? s.emphasis : s.bad, stroke: 'none' }).moveTo([
          X0 + note.at * DX,
          base - 0.55,
        ]);
        dot.key = `onset-${clip.id}-${i}`;
        row.add(dot);
      }
    });
    figure.add(row);
  });
  // One footer line for every step, clear of B's notes and of its onset dots.
  const y = -3.75;
  if (look.footer) figure.add(label(look.footer, 0.6, y, s.soft, 0.66, 'score-footer'));
  else figure.add(label('Bar 1: four beats', -2.7, y, s.soft, 0.7), label('Bar 2: four beats', 4.0, y, s.soft, 0.7));
  return figure;
}

import { Group, Rectangle, Circle, keyed } from '../../../src/index.ts';
import type { AudioClip } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
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
  keyed(figure, 'music-score');
  clips.forEach((clip, lane) => {
    const base = lane === 0 ? 0.25 : -2.5,
      top = base + 1.5;
    const row = new Group(label(s, lane === 0 ? 'A' : 'B', { at: [-7.05, base + 0.7], size: 0.7 }));
    keyed(row, `score-${clip.id}`);
    if (!look.bare)
    for (let beat = 0; beat <= 8; beat++)
      row.add(
        segment(s, [X0 + beat * DX, base - 0.3], [X0 + beat * DX, top + 0.25], {
          color: beat === 4 || look.pulse ? s.look.emphasis : s.look.soft,
          strokeWidth: beat === 4 ? 0.04 : look.pulse ? 0.035 : 0.012,
        }),
      );
    if (lane === 0 && !look.bare)
      for (let beat = 0; beat < 8; beat++) {
        const strong = look.accent && beat % 4 === 0;
        row.add(
          label(s, String((beat % 4) + 1), { at: [X0 + beat * DX, top + 0.8], color: strong ? s.look.emphasis : s.look.soft, size: strong ? 0.95 : 0.7, key: `beat-${beat}` }),
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
        fill: s.look.paper,
        stroke: marked ? s.look.bad : s.look.emphasis,
        strokeWidth: marked || lit ? 0.065 : 0.03,
      }).moveTo([x, y]);
      const g = new Group(rect, label(s, NOTE_NAMES[note.midi]!, { at: [x, y], size: 0.7 }));
      keyed(g, `note-${clip.id}-${i}`);
      row.add(g);
      if (look.onsets) {
        const onBeat = Number.isInteger(note.at);
        const dot = new Circle({ radius: 0.1, fill: onBeat ? s.look.emphasis : s.look.bad, stroke: 'none' }).moveTo([
          X0 + note.at * DX,
          base - 0.55,
        ]);
        keyed(dot, `onset-${clip.id}-${i}`);
        row.add(dot);
      }
    });
    figure.add(row);
  });
  // One footer line for every step, clear of B's notes and of its onset dots.
  const y = -3.75;
  if (look.footer) figure.add(label(s, look.footer, { at: [0.6, y], color: s.look.soft, size: 0.66, key: 'score-footer' }));
  else figure.add(label(s, 'Bar 1: four beats', { at: [-2.7, y], color: s.look.soft, size: 0.7 }), label(s, 'Bar 2: four beats', { at: [4.0, y], color: s.look.soft, size: 0.7 }));
  return figure;
}

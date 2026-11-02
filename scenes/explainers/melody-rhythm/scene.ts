import { Scene, Group, Rectangle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { musicStory, NOTE_NAMES } from '../lib/melody-rhythm.ts';
import type { Timing } from '../lib/melody-rhythm.ts';
import { lesson, label, segment } from '../lib/lesson-drawing.ts';

interface Look {
  /** Every beat line drawn strong, for the step about the pulse. */
  pulse?: boolean;
  /** Notes outlined in red, as `${clip id}-${index}`. */
  marked?: readonly string[];
  /** Words under the score in place of the two bar labels. */
  footer?: string;
}
function scorePicture(s: Stage, clips: AudioClip[], look: Look = {}) {
  const figure = new Group();
  figure.key = 'music-score';
  clips.forEach((clip, lane) => {
    const base = lane === 0 ? 0.25 : -2.75,
      top = base + 1.5,
      x0 = -6,
      x1 = 7.2,
      dx = (x1 - x0) / 8;
    const row = new Group(label(lane === 0 ? 'A' : 'B', -7.05, base + 0.7, s.palette.ink, 0.7));
    row.key = `score-${clip.id}`;
    for (let beat = 0; beat <= 8; beat++)
      row.add(
        segment(
          [x0 + beat * dx, base - 0.3],
          [x0 + beat * dx, top + 0.25],
          beat === 4 || look.pulse ? s.emphasis : s.soft,
          beat === 4 ? 0.04 : look.pulse ? 0.035 : 0.012,
        ),
      );
    if (lane === 0)
      for (let beat = 0; beat < 8; beat++)
        row.add(label(String((beat % 4) + 1), x0 + beat * dx, top + 0.8, s.soft, 0.7, `beat-${beat}`));
    clip.notes.forEach((note, i) => {
      const y = base + [60, 62, 64, 67].indexOf(note.midi) * 0.5,
        x = x0 + (note.at + note.duration / 2) * dx;
      const marked = look.marked?.includes(`${clip.id}-${i}`);
      const rect = new Rectangle({
        width: note.duration * dx - 0.08,
        height: 0.7,
        fill: s.palette.paper,
        stroke: marked ? s.bad : s.emphasis,
        strokeWidth: marked ? 0.055 : 0.03,
      }).moveTo([x, y]);
      const g = new Group(rect, label(NOTE_NAMES[note.midi]!, x, y, s.palette.ink, 0.7));
      g.key = `note-${clip.id}-${i}`;
      row.add(g);
    });
    figure.add(row);
  });
  if (look.footer) figure.add(label(look.footer, 0.6, -3.6, s.soft, 0.7, 'score-footer'));
  else
    figure.add(label('Bar 1: four beats', -2.7, -3.6, s.soft, 0.7), label('Bar 2: four beats', 4.0, -3.6, s.soft, 0.7));
  return figure;
}
/** Milliseconds as a reader would say them: 312.5, 625. */
const ms = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ms`;

export default class MelodyRhythm extends Scene {
  static meta = {
    id: 'melody-rhythm',
    title: 'What happens when a note starts before the bar line?',
    sources: [
      'https://learningmusic.ableton.com/make-beats/make-beats.html',
      'https://learningmusic.ableton.com/melodies/melodies.html',
      'https://openmusictheory.github.io/syncopation.html',
      'https://www.w3.org/TR/2021/REC-webaudio-20210617/#OscillatorNode',
    ],
    // The script's answer and check questions (script.md); check holds the bar step to stating the answer.
    answer: 'When a note starts before the bar line and holds across it, the strongest beat gets no new note',
    checks: [
      {
        question: 'In the shifted version of B, where does G start, and what is sounding on beat 1 of bar 2?',
        answer: 'Halfway through beat 4 of bar 1, half a beat before the bar line. G is still sounding on beat 1, so no new note starts there; the next E starts half a beat later.',
      },
      {
        question: 'Which two notes of B change length, and why must both change?',
        answer: 'The first E is held for one and a half beats, which pushes G half a beat later. The E after G is cut to half a beat, so D starts on beat 2 of bar 2 again and the phrase still fills eight beats.',
      },
      {
        question: 'At 120 BPM, how long before the bar line does B’s G start, and is it still syncopated?',
        answer: '250 ms, half of a 500 ms beat. Yes: it still starts half a beat before beat 1 and holds through it. The tempo changes the milliseconds, not where the note falls against the beat.',
      },
    ],
  };
  static settings = [
    {
      id: 'timing',
      label: 'Version B',
      default: 'syncopated',
      options: [
        { value: 'syncopated', label: 'Shift two note starts' },
        { value: 'straight', label: 'Keep the same timing as A' },
      ],
    },
    {
      id: 'tempo',
      label: 'Tempo',
      default: '96',
      options: [
        { value: '96', label: '96 BPM' },
        { value: '120', label: '120 BPM' },
      ],
    },
  ];
  override async construct() {
    const v = settingsOf(this),
      m = musicStory(v.timing as Timing, Number(v.tempo)),
      different = m.movedStarts > 0,
      other = musicStory(m.timing, m.bpm === 96 ? 120 : 96);
    const g = m.clips[1]!.notes[3]!,
      lead = 4 - g.at,
      half = m.beatMs / 2;
    const answer = 'When a note starts before the bar line and holds across it, the strongest beat gets no new note.';
    const steps = [
      {
        id: 'listen',
        title: 'A and B: the same eight notes, in the same order',
        line: different ? 'Listen to both. Predict: where does B part from A?' : 'Listen to both: in this case B is the control.',
        caption: `Each rectangle is a note: left to right is time, counted in beats, height is pitch and width is how long it sounds. Both versions play C D E G E D C C on the same instrument at ${m.bpm} BPM, over two bars of four beats; the strong line marks where bar 2 begins.${different ? '' : ' Here B’s starts and lengths match A’s exactly; the shifted version of B moves two of them.'}`,
        clips: m.clips,
        look: {},
      },
      {
        id: 'pulse',
        title: 'Count 1 2 3 4: the 1 after the bar line is the strongest beat',
        line: 'Predict: in B, which note starts on that beat?',
        caption: `The pulse clicks once per beat, with a different click on each bar’s first beat. Every note in A starts on a click, and the 1 that opens bar 2 is the beat a listener leans on most. In A, E starts exactly there.`,
        clips: m.clips,
        look: { pulse: true },
      },
      {
        id: 'bar',
        title: different
          ? 'Answer: none. G started half a beat before the bar line'
          : 'Answer: E, on the beat. Nothing crosses the bar line',
        line: different
          ? 'The red outline: G starts halfway through beat 4 and holds through beat 1.'
          : 'The red outline: G ends exactly as bar 2 begins.',
        caption: different
          ? `In B, G starts halfway through beat 4, ${ms(lead * m.beatMs)} before the bar line at ${m.bpm} BPM, and is still sounding when bar 2’s first beat arrives; E follows half a beat later. ${answer} A note that starts on a weak part of the beat, where a strong beat would carry it, is syncopation.`
          : `In this control case G fills beat 4 and ends at the bar line, and E starts on beat 1 of bar 2, as in A. ${answer} The shifted version of B does that; this one does not.`,
        clips: m.clips,
        look: { marked: ['b-3'] },
      },
      {
        id: 'rhythm',
        title: different ? 'With every pitch C, B still skips beat 1' : 'With every pitch C, A and B play one rhythm',
        line: 'Same starts and lengths, one pitch: what is left is timing.',
        caption: different
          ? 'Every note now plays C, and each version keeps its own starts and lengths. B still has no note starting on beat 1 of bar 2, so the effect comes from timing alone, not from the climb to G.'
          : 'Every note now plays C, and each version keeps its own starts and lengths. With the pitches gone, A and B play the identical rhythm, every note on a beat.',
        clips: m.flat,
        look: {},
      },
      {
        id: 'timing',
        title: different
          ? `Two lengths change, so ${['no', 'one', 'two', 'three'][m.movedStarts] ?? m.movedStarts} starts move`
          : 'No start moves and no length changes',
        line: different
          ? 'B holds the first E longer, then cuts the next E short.'
          : 'A and B share every start and length.',
        caption: different
          ? `B holds the first E for one and a half beats instead of one, which pushes G half a beat later. The E after G lasts half a beat, so D starts on beat 2 of bar 2, as in A, and the rest lines up again. At ${m.bpm} BPM half a beat is ${ms(half)}; at ${other.bpm} BPM it would be ${ms(other.beatMs / 2)}, and G would still start half a beat before the bar line. The score is counted in beats, so the tempo changes the milliseconds, not the picture.`
          : `B has not moved any start or changed any length, so its piano roll matches A’s. At ${m.bpm} BPM a beat is ${ms(m.beatMs)}; at ${other.bpm} BPM it would be ${ms(other.beatMs)}, and every note would still start on a beat.`,
        clips: m.clips,
        look: {
          marked: m.changed.map((i) => `b-${i}`),
          footer: different ? `At ${m.bpm} BPM, half a beat is ${ms(half)}` : `At ${m.bpm} BPM, one beat is ${ms(m.beatMs)}`,
        },
      },
      {
        id: 'phrase',
        title: different ? 'The same tune, placed differently against the beat' : 'Matching pitches and timing give the same phrase',
        line: 'Both versions use the same instrument, loudness and tempo.',
        caption: different
          ? `A and B keep all eight notes, their order, instrument, loudness and tempo. Changing two lengths moved where the tune meets the beat around the bar line, and left the rise and fall of the melody as it was. Play them again and listen to bar 2 begin.`
          : 'All pitches, their order, starts and lengths match, so A and B play the same phrase. Choose “Shift two note starts” to hear a note start before the bar line.',
        clips: m.clips,
        look: {},
      },
    ];
    await lesson(
      this,
      steps.map(({ clips, look, ...step }) => ({
        ...step,
        state: {
          timing: m.timing,
          bpm: m.bpm,
          clips,
          movedStarts: m.movedStarts,
          movedDurations: m.movedDurations,
          crossing: clips[1]!.notes.filter((n) => n.at < 4 && n.at + n.duration > 4),
        },
        audio: { clips },
        draw: (s: Stage) => scorePicture(s, clips, look),
      })),
      'nord',
    );
  }
}

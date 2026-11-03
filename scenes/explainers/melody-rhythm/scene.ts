import { Scene, Group, Rectangle, Circle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { musicStory, NOTE_NAMES } from '../lib/melody-rhythm.ts';
import type { Timing } from '../lib/melody-rhythm.ts';
import { lesson, label, segment } from '../lib/lesson-drawing.ts';

interface Look {
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
function scorePicture(s: Stage, clips: AudioClip[], look: Look = {}) {
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
/** Milliseconds as a reader would say them: 312.5, 625. */
const ms = (n: number) => String(Math.round(n * 10) / 10);

export default class MelodyRhythm extends Scene {
  static meta = {
    id: 'melody-rhythm',
    title: 'Why does one version of a tune sound off the beat?',
    sources: [
      'https://learningmusic.ableton.com/make-beats/make-beats.html',
      'https://learningmusic.ableton.com/melodies/melodies.html',
      'https://openmusictheory.github.io/syncopation.html',
      'https://www.w3.org/TR/2021/REC-webaudio-20210617/#OscillatorNode',
    ],
    // The script's answer and check questions (script.md); check holds the bar step to stating the answer.
    answer: 'The shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note',
    checks: [
      {
        question:
          'A version C starts from A, cuts the first D to half a beat and holds the E after it for one and a half beats, so G is back on beat 4. Which beat now brings no new note, and does any note cross the bar line?',
        answer:
          'Beat 3 of bar 1: E starts halfway through beat 2 and is still sounding on beat 3. Nothing crosses the bar line, so the 1 of bar 2 brings E, as in A.',
      },
      {
        question:
          'Count B in threes instead, 1 2 3 1 2 3, so a bar line falls after every third beat. Which note now holds across a bar line, and does the 1 of bar 3 bring a new note?',
        answer:
          'The first E. It starts on beat 3 of bar 1 and lasts one and a half beats, so it is still sounding when bar 2 begins, and G starts half a beat into bar 2. The 1 of bar 3, the seventh beat, brings a C that starts exactly there.',
      },
      {
        question:
          'Suppose the E after G lasted a full beat, as in A, with every later note following straight after it. Which notes of bar 2 would start on a beat?',
        answer:
          'None. D and both Cs would each start half a beat late, halfway through beats 2, 3 and 4, and the last C would run half a beat past the end of bar 2. Cutting that E to half a beat is what lets B land back on the beat.',
      },
    ],
    // Sentences about every note or every beat, held at both tempos and in both versions of B.
    claims: [
      {
        says: 'a new note starts on every click',
        test: 'test/learning-models.test.ts: A starts a note on every beat',
      },
      {
        says: 'B still skips the 1',
        test: 'test/learning-models.test.ts: the shifted B starts none on the 1 of bar 2',
      },
      {
        says: 'keeps its own starts and lengths',
        test: 'test/learning-models.test.ts: the music comparison preserves pitches and total beats',
      },
      {
        says: 'A and B play one rhythm',
        test: 'test/learning-models.test.ts: the control B starts every note on a beat',
      },
      {
        says: 'every start on a beat',
        test: 'test/learning-models.test.ts: the control B starts every note on a beat',
      },
      {
        says: 'Only that version starts G late enough',
        test: 'test/learning-models.test.ts: the shifted B starts none on the 1 of bar 2',
      },
    ],
  };
  static settings = [
    {
      id: 'timing',
      label: 'Version B',
      default: 'syncopated',
      options: [
        { value: 'syncopated', label: 'Start two notes half a beat later' },
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
      different = m.movedStarts > 0;
    // B's notes that start on bar 2's 1, by index: none when G holds across the bar line.
    const onTheOne = (clip: AudioClip) => clip.notes.flatMap((n, i) => (n.at === 4 ? [`${clip.id}-${i}`] : []));
    const answer = 'The shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note.';
    const steps = [
      {
        id: 'listen',
        title: 'Eight notes in one order: which version sounds off the beat?',
        line: different ? 'Listen to both. Predict: where does B pull against the beat?' : 'Listen to both: in this case B is the control.',
        caption: `Each rectangle is a note: left to right is time, height is pitch and width is how long it sounds. Both versions play C D E G E D C C on the same instrument at ${m.bpm} BPM. ${different ? 'Play A, then B. Does one of them seem to pull against the beat somewhere? Where?' : 'Here B’s starts and lengths match A’s exactly; the shifted version of B starts two notes half a beat later.'}`,
        clips: m.clips,
        look: { bare: true, footer: 'Left to right: time. Higher: a higher pitch.' },
      },
      {
        id: 'pulse',
        title: 'Count 1 2 3 4: the 1 that opens each bar is the strong beat',
        line: 'Predict: in B, which note starts on the 1 of bar 2?',
        caption: `Count along with the clicks: 1 2 3 4, then again. Each large 1 opens a bar and gets a different click. In A a new note starts on every click. At the start of bar 2 it is E, outlined in the picture. Which note starts there in B?`,
        clips: m.clips,
        look: { pulse: true, accent: true, lit: ['a-0', ...onTheOne(m.clips[0]!)], footer: 'Large 1: the strong beat that opens each bar' },
      },
      {
        id: 'bar',
        title: different ? 'In B, no new note starts on the 1 of bar 2' : 'E starts on the 1 in both versions; nothing crosses the bar line',
        line: different
          ? 'The red outline is G, the note still sounding when bar 2 begins.'
          : 'The red outline: G ends exactly as bar 2 begins.',
        caption: different
          ? `B lengthens the first E, delaying G; shortening the E after G puts D back on beat 2. ${answer} This shift from strong beats to weaker parts is syncopation. At ${m.bpm} BPM a beat lasts ${ms(m.beatMs)} ms, so G starts ${ms(m.beatMs / 2)} ms before the bar line; the other tempo changes that gap but keeps G halfway through beat 4.`
          : `Here B has A’s starts and lengths. G ends at the bar line and E starts on the 1, so this control has no shifted starts. The other version of B differs at exactly this bar line. ${answer} Only that version starts G late enough to hold it across the bar line.`,
        clips: m.clips,
        look: {
          accent: true,
          marked: ['b-3'],
          lit: [...onTheOne(m.clips[0]!), ...onTheOne(m.clips[1]!)],
          footer: different ? 'G starts mid-beat 4 and holds over the 1' : 'G ends at the bar line; E starts on the 1',
        },
      },
      {
        id: 'rhythm',
        title: different ? 'With every pitch C, B still skips the 1' : 'With every pitch C, A and B play one rhythm',
        line: 'Each version keeps its own starts and lengths; only the pitches go.',
        caption: different
          ? 'Could the climb to G be what sounds off? Each version keeps its own starts and lengths, but all pitches are now C. Red dots mark starts between beats. Listen again: with the climb to G gone, B still holds a note across the bar line instead of starting one on the 1. Removing the melody leaves the timing difference intact. The score shows that difference; how strongly you hear its pull can vary.'
          : 'Every note now plays C, and each version keeps its own starts and lengths; a dot under each note marks where it starts. With the pitches gone, A and B play the identical rhythm, every start on a beat. Choose “Start two notes half a beat later” to hear a note hold across the bar line.',
        clips: m.flat,
        look: {
          accent: true,
          onsets: true,
          footer: different ? 'Every pitch C. Red dot: a start between beats' : 'Every pitch C. Blue dot: a start on a beat',
        },
      },
    ];
    await lesson(
      this,
      steps.map(({ clips, look, ...step }) => ({
        ...step,
        state: {
          timing: m.timing,
          bpm: m.bpm,
          beatMs: m.beatMs,
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

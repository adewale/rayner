import { Scene, Group, Rectangle, Circle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { musicStory, NOTE_NAMES } from '../lib/melody-rhythm.ts';
import type { Timing } from '../lib/melody-rhythm.ts';
import { lesson, label, segment } from '../lib/lesson-drawing.ts';

interface Look {
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
    const base = lane === 0 ? 0.25 : -2.75,
      top = base + 1.5;
    const row = new Group(label(lane === 0 ? 'A' : 'B', -7.05, base + 0.7, s.palette.ink, 0.7));
    row.key = `score-${clip.id}`;
    for (let beat = 0; beat <= 8; beat++)
      row.add(
        segment(
          [X0 + beat * DX, base - 0.3],
          [X0 + beat * DX, top + 0.25],
          beat === 4 || look.pulse ? s.emphasis : s.soft,
          beat === 4 ? 0.04 : look.pulse ? 0.035 : 0.012,
        ),
      );
    if (lane === 0)
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
  const y = look.onsets ? -3.85 : -3.6;
  if (look.footer) figure.add(label(look.footer, 0.6, y, s.soft, 0.66, 'score-footer'));
  else figure.add(label('Bar 1: four beats', -2.7, y, s.soft, 0.7), label('Bar 2: four beats', 4.0, y, s.soft, 0.7));
  return figure;
}
/** Milliseconds as a reader would say them: 312.5, 625. */
const ms = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ms`;

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
          'Another version keeps the first E at one beat and leaves half a beat of silence before G, which still lasts one beat, with the rest as in B. Does the 1 of bar 2 bring a new note?',
        answer:
          'No. G still starts halfway through beat 4 and is sounding when the 1 arrives. What matters is where G starts and that it holds across the bar line, whether a longer E or a rest fills the gap before it.',
      },
      {
        question: 'Play B at 80 BPM. How long before the bar line does G start, and for how many milliseconds does it sound?',
        answer:
          '375 ms: a beat lasts 750 ms at 80 BPM, and G starts half a beat before the bar line. It sounds for one beat, 750 ms, of which 375 ms fall in each bar.',
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
    const g = m.clips[1]!.notes[3]!,
      lead = 4 - g.at,
      half = m.beatMs / 2;
    // B's notes that start on bar 2's 1, by index: none when G holds across the bar line.
    const onTheOne = (clip: AudioClip) => clip.notes.flatMap((n, i) => (n.at === 4 ? [`${clip.id}-${i}`] : []));
    const answer = 'The shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note.';
    const steps = [
      {
        id: 'listen',
        title: 'Eight notes in one order: which version sounds off the beat?',
        line: different ? 'Listen to both. Predict: where does B pull against the beat?' : 'Listen to both: in this case B is the control.',
        caption: `Each rectangle is a note: left to right is time, counted in beats, height is pitch and width is how long it sounds. Both versions play C D E G E D C C on the same instrument at ${m.bpm} BPM, over two bars of four beats; the strong line marks where bar 2 begins. ${different ? 'Play A, then B. Does one of them seem to pull against the beat somewhere? Where?' : 'Here B’s starts and lengths match A’s exactly; the shifted version of B moves two starts later.'}`,
        clips: m.clips,
        look: {},
      },
      {
        id: 'pulse',
        title: 'Count 1 2 3 4: the 1 that opens each bar is the strong beat',
        line: 'Predict: in B, which note starts on the 1 of bar 2?',
        caption: `The pulse clicks once per beat, with a different click on each bar’s first beat; the large 1s mark those strong beats. A listener expects the 1 that opens bar 2 to bring a new note, and in A it does: E starts exactly there, as C did at the start of bar 1. Both are outlined. Every note in A starts on a click.`,
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
          ? `G starts ${ms(lead * m.beatMs)} before the bar line at ${m.bpm} BPM, later than A’s G, and is still sounding when the 1 arrives; E follows half a beat after the 1. ${answer} Musicians call this syncopation: a note that would normally start on a strong beat starts on a weak part of a beat instead. Here that note is E, which A starts on the 1.`
          : `In this control case G fills beat 4 and ends at the bar line, and E starts on the 1 of bar 2, as in A, so neither version sounds off the beat. ${answer} Only that version starts G late enough to hold it across the bar line.`,
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
          ? 'Every note now plays C, and each version keeps its own starts and lengths. With the climb to G gone, B still has no note starting on the 1 of bar 2, so the off-beat feel comes from timing alone.'
          : 'Every note now plays C, and each version keeps its own starts and lengths. With the pitches gone, A and B play the identical rhythm, every note on a beat.',
        clips: m.flat,
        look: {
          accent: true,
          footer: different ? 'Every pitch C: B still has no new note on the 1' : 'Every pitch C: one rhythm, all on the beat',
        },
      },
      {
        id: 'timing',
        title: different
          ? 'B holds the first E longer and cuts the next E short'
          : 'No start moves and no length changes',
        line: different
          ? `${m.movedStarts === 2 ? 'Two' : m.movedStarts} notes start half a beat later than in A; D is back on beat 2.`
          : 'A and B share every start and length.',
        caption: different
          ? `B holds the first E for one and a half beats instead of one, so G and the E after it each start half a beat later than in A. That E lasts half a beat, so D starts on beat 2 of bar 2, as in A, and the remaining notes line up again. At ${m.bpm} BPM a beat lasts ${ms(m.beatMs)}, so G starts ${ms(half)} before the bar line. The piano roll is counted in beats, so it looks the same at any tempo; a faster or slower tempo changes only the milliseconds.`
          : `B has not moved any start or changed any length, so its piano roll matches A’s. At ${m.bpm} BPM a beat lasts ${ms(m.beatMs)}, and at any tempo every note starts on a beat.`,
        clips: m.clips,
        look: {
          accent: true,
          marked: m.changed.map((i) => `b-${i}`),
          footer: different ? 'First E held 1½ beats; the next E cut to ½' : 'Every note in both versions lasts one beat',
        },
      },
      {
        id: 'phrase',
        title: different ? 'Two of B’s starts fall between beats, either side of the bar line' : 'Matching pitches and timing give the same phrase',
        line: different ? 'A dot marks each start; red dots fall between beats.' : 'A dot marks each start; every one falls on a beat.',
        caption: different
          ? 'A and B keep all eight notes, their order, instrument, loudness and tempo, and the rise and fall of the melody. Every start in A falls on a beat. In B, G starts on the half beat before the bar line and E on the half beat after it, so the 1 of bar 2 passes under the held G.'
          : 'All pitches, their order, starts and lengths match, so A and B play the same phrase, and every start falls on a beat. Choose “Start two notes half a beat later” to hear a note hold across the bar line.',
        clips: m.clips,
        look: {
          accent: true,
          onsets: true,
          footer: different ? 'Blue dot: on a beat. Red dot: between beats' : 'Blue dot: on a beat',
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

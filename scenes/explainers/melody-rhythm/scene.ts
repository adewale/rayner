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
    title: 'Why does one version of a tune lean forward?',
    sources: [
      'https://learningmusic.ableton.com/make-beats/make-beats.html',
      'https://learningmusic.ableton.com/melodies/melodies.html',
      'https://openmusictheory.github.io/syncopation.html',
      'https://www.w3.org/TR/2021/REC-webaudio-20210617/#OscillatorNode',
    ],
    // The script's answer and check questions (script.md); check holds the bar step to stating the answer.
    answer: 'A tune leans forward when a note starts before the bar line and holds across it, so the strongest beat gets no new note',
    checks: [
      {
        question: 'Where does the shifted version of B lean forward, and why does the 1 of bar 2 bring no new note?',
        answer:
          'At the bar line. G starts halfway through beat 4 of bar 1, half a beat early, and is still sounding when the 1 arrives, so nothing new starts on the strongest beat; the next E starts half a beat later.',
      },
      {
        question: 'Which two notes of B change length, and why must both change?',
        answer:
          'The first E is held for one and a half beats, which pushes G half a beat later. The E after G is cut to half a beat, so D starts on beat 2 of bar 2 again and the phrase still fills eight beats.',
      },
      {
        question: 'Play B at 80 BPM. How long before the bar line does G start, and does the piano roll change?',
        answer:
          '375 ms: a beat lasts 750 ms at 80 BPM, and G starts half a beat early. The piano roll does not change, because it is counted in beats; only the milliseconds do.',
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
      different = m.movedStarts > 0;
    const g = m.clips[1]!.notes[3]!,
      lead = 4 - g.at,
      half = m.beatMs / 2;
    // B's notes that start on bar 2's 1, by index: none when G holds across the bar line.
    const onTheOne = (clip: AudioClip) => clip.notes.flatMap((n, i) => (n.at === 4 ? [`${clip.id}-${i}`] : []));
    const answer = 'A tune leans forward when a note starts before the bar line and holds across it, so the strongest beat gets no new note.';
    const steps = [
      {
        id: 'listen',
        title: 'Same notes, same order: which version leans forward?',
        line: different ? 'Listen to both. Predict: where does B push ahead of A?' : 'Listen to both: in this case B is the control.',
        caption: `Each rectangle is a note: left to right is time, counted in beats, height is pitch and width is how long it sounds. Both versions play C D E G E D C C on the same instrument at ${m.bpm} BPM, over two bars of four beats; the strong line marks where bar 2 begins. ${different ? 'Play A, then B. Does one of them seem to push ahead somewhere? Where?' : 'Here B’s starts and lengths match A’s exactly; the shifted version of B moves two of them.'}`,
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
          ? 'The red outline: G starts halfway through beat 4 and holds through the 1.'
          : 'The red outline: G ends exactly as bar 2 begins.',
        caption: different
          ? `G starts ${ms(lead * m.beatMs)} before the bar line at ${m.bpm} BPM and is still sounding when the 1 arrives; E follows half a beat later. That early G is where B leans forward. ${answer} Musicians call this syncopation: a note that would normally start on a strong beat starts on a weak part of a beat instead.`
          : `In this control case G fills beat 4 and ends at the bar line, and E starts on the 1 of bar 2, as in A, so neither version leans forward. ${answer} Only the shifted version of B starts G early enough to hold it across the bar line.`,
        clips: m.clips,
        look: {
          accent: true,
          marked: ['b-3'],
          lit: [...onTheOne(m.clips[0]!), ...onTheOne(m.clips[1]!)],
          footer: different ? 'G starts ½ beat early and holds over the 1' : 'G ends at the bar line; E starts on the 1',
        },
      },
      {
        id: 'rhythm',
        title: different ? 'With every pitch C, B still skips the 1' : 'With every pitch C, A and B play one rhythm',
        line: 'Same starts and lengths, one pitch: what is left is timing.',
        caption: different
          ? 'Every note now plays C, and each version keeps its own starts and lengths. With the climb to G gone, B still has no note starting on the 1 of bar 2, so the lean comes from timing alone.'
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
          ? `Two lengths change, so ${['no', 'one', 'two', 'three'][m.movedStarts] ?? m.movedStarts} starts move`
          : 'No start moves and no length changes',
        line: different ? 'B holds the first E longer, then cuts the next E short.' : 'A and B share every start and length.',
        caption: different
          ? `B holds the first E for one and a half beats instead of one, which pushes G half a beat later. The E after G lasts half a beat, so D starts on beat 2 of bar 2, as in A, and the rest lines up again. At ${m.bpm} BPM a beat lasts ${ms(m.beatMs)}, so G starts ${ms(half)} before the bar line. The score is counted in beats, so at any tempo G starts half a beat early and the picture stays the same; only the milliseconds change.`
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
        title: different ? 'The same tune, half a beat early at the bar line' : 'Matching pitches and timing give the same phrase',
        line: different ? 'A dot marks each start; red dots fall between beats.' : 'A dot marks each start; every one falls on a beat.',
        caption: different
          ? 'A and B keep all eight notes, their order, instrument, loudness and tempo, and the rise and fall of the melody. Every start in A falls on a beat. In B two starts fall between beats, either side of the bar line, so the melody reaches bar 2 ahead of the beat and leaves its 1 to the held G. Play them again and listen for the lean into bar 2.'
          : 'All pitches, their order, starts and lengths match, so A and B play the same phrase, and every start falls on a beat. Choose “Shift two note starts” to hear a note start before the bar line.',
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

import { Scene } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { musicStory } from './model.ts';
import type { Timing } from './model.ts';
import { scorePicture } from './picture.ts';
import type { Look } from './picture.ts';

/** What a step's score is drawn from: its clips, and how many of B's starts moved. */
interface Music { clips: AudioClip[]; movedStarts: number }
/**
 * The one tempo. A second tempo used to be a setting, but it changed no conclusion: G starts halfway
 * through beat 4 at any tempo, and only the milliseconds moved.
 */
const BPM = 96;

export default class MelodyRhythm extends Scene {
  static meta = {
    id: 'melody-rhythm',
    sources: [
      'https://learningmusic.ableton.com/make-beats/make-beats.html',
      'https://learningmusic.ableton.com/melodies/melodies.html',
      'https://openmusictheory.github.io/syncopation.html',
      'https://www.w3.org/TR/2021/REC-webaudio-20210617/#OscillatorNode',
    ],
    // Sentences about every note or every beat, held in both versions of B (and by the tests at two tempos).
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
  ];
  override async construct() {
    const v = settingsOf(this),
      m = musicStory(v.timing as Timing, BPM),
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
        look: (): Look => ({ bare: true, footer: 'Left to right: time. Higher: a higher pitch.' }),
      },
      {
        id: 'pulse',
        title: 'Count 1 2 3 4: the 1 that opens each bar is the strong beat',
        line: 'Predict: in B, which note starts on the 1 of bar 2?',
        caption: `Count along with the clicks: 1 2 3 4, then again. Each large 1 opens a bar and gets a different click. In A a new note starts on every click. At the start of bar 2 it is E, outlined in the picture. Which note starts there in B?`,
        clips: m.clips,
        look: (st: Music): Look => ({ pulse: true, accent: true, lit: ['a-0', ...onTheOne(st.clips[0]!)], footer: 'Large 1: the strong beat that opens each bar' }),
      },
      {
        id: 'bar',
        title: different ? 'In B, no new note starts on the 1 of bar 2' : 'E starts on the 1 in both versions; nothing crosses the bar line',
        line: different
          ? 'Red outline: G, the note still sounding when bar 2 begins.'
          : 'Red outline: G, which ends exactly as bar 2 begins.',
        caption: different
          ? `B lengthens the first E, delaying G; shortening the E after G puts D back on beat 2. ${answer} This shift from strong beats to weaker parts is syncopation.`
          : `Here B has A’s starts and lengths. G ends at the bar line and E starts on the 1, so this control has no shifted starts. ${answer} Only that version starts G late enough to hold it across the bar line.`,
        clips: m.clips,
        look: (st: Music): Look => ({
          accent: true,
          marked: ['b-3'],
          lit: [...onTheOne(st.clips[0]!), ...onTheOne(st.clips[1]!)],
          footer: st.movedStarts > 0 ? 'G starts mid-beat 4 and holds over the 1' : 'G ends at the bar line; E starts on the 1',
        }),
      },
      {
        id: 'rhythm',
        title: different ? 'With every pitch C, B still skips the 1' : 'With every pitch C, A and B play one rhythm',
        line: 'Each version keeps its own starts and lengths; only the pitches go.',
        caption: different
          ? 'Could the climb to G be what sounds off? Each version keeps its own starts and lengths, but all pitches are now C. Red dots mark starts between beats. Listen again: with the climb to G gone, B still holds a note across the bar line instead of starting one on the 1. Removing the melody leaves the timing difference intact. The score shows that difference; how strongly you hear its pull can vary.'
          : 'Every note now plays C, and each version keeps its own starts and lengths; a dot under each note marks where it starts. With the pitches gone, A and B play the identical rhythm, every start on a beat. Choose “Start two notes half a beat later” to hear a note hold across the bar line.',
        clips: m.flat,
        look: (st: Music): Look => ({
          accent: true,
          onsets: true,
          footer: st.movedStarts > 0 ? 'Every pitch C. Red dot: a start between beats' : 'Every pitch C. Blue dot: a start on a beat',
        }),
      },
    ];
    await stage(this, { style: 'nord', headingSize: 0.6 }).steps(
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
        // The score from the step's own clips; what it outlines and says, from them and whether B moved any start.
        draw: (st: Music, s: Stage) => scorePicture(s, st.clips, look(st)),
      })),
    );
  }
}

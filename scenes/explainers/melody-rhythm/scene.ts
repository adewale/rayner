import { Scene, Group, Rectangle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { AudioClip, Stage } from '../../../explain/index.ts';
import { musicStory, NOTE_NAMES } from '../lib/melody-rhythm.ts';
import type { Timing } from '../lib/melody-rhythm.ts';
import { lesson, label, segment } from '../lib/lesson-drawing.ts';

function scorePicture(s: Stage, clips: AudioClip[], phase: number) {
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
          beat === 4 || phase === 1 ? s.emphasis : s.soft,
          beat === 4 ? 0.04 : phase === 1 ? 0.035 : 0.012,
        ),
      );
    if (lane === 0)
      for (let beat = 0; beat < 8; beat++)
        row.add(label(String((beat % 4) + 1), x0 + beat * dx, top + 0.8, s.soft, 0.7, `beat-${beat}`));
    clip.notes.forEach((note, i) => {
      const y = base + [60, 62, 64, 67].indexOf(note.midi) * 0.5,
        x = x0 + (note.at + note.duration / 2) * dx;
      const marked = (phase === 5 && lane === 1 && i === 3) || (phase === 4 && (i === 3 || i === 4));
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
  figure.add(label('Bar 1: four beats', -2.7, -3.6, s.soft, 0.7), label('Bar 2: four beats', 4.0, -3.6, s.soft, 0.7));
  return figure;
}
export default class MelodyRhythm extends Scene {
  static meta = {
    id: 'melody-rhythm',
    title: 'How do melody and rhythm shape a phrase?',
    sources: [
      'https://learningmusic.ableton.com/make-beats/make-beats.html',
      'https://learningmusic.ableton.com/melodies/melodies.html',
      'https://www.w3.org/TR/2021/REC-webaudio-20210617/#OscillatorNode',
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
    const titles = [
      'Compare A and B',
      'The grid supplies a steady pulse',
      'Keep the timing and flatten the pitches',
      'Restore the rising and falling pitches',
      different ? 'Two note starts change' : 'The two versions keep identical timing',
      different ? 'G crosses the strong bar boundary' : 'G ends at the bar boundary',
      different ? 'Timing changes the heard phrase' : 'Matching pitches and timing give the same phrase',
    ];
    const lines = [
      'Compare the note positions and lengths in A and B.',
      'Each bar contains four beats; horizontal position is time.',
      'Every event is C; starts and durations are retained.',
      'The original pitch order returns without moving the events.',
      different
        ? 'The pitch sequence stays C D E G E D C C.'
        : 'A and B share the same pitch order, starts and durations.',
      different ? 'The red outline marks G crossing into bar 2.' : 'The red outline marks G ending as bar 2 starts.',
      'Both versions use the same instrument, loudness and tempo.',
    ];
    const captions = [
      different
        ? 'A and B use the same eight notes in the same pitch order. Two note starts and two durations differ. Listen to both, or compare the horizontal positions and lengths of their rectangles.'
        : 'A and B use identical pitches, starts and durations. This control case gives the same phrase twice; the shifted-timing setting changes the comparison.',
      `The eight-beat phrase occupies two bars of four beats at ${m.bpm} BPM. During playback, the playhead follows the same beat positions used to schedule the sound. A rectangle’s vertical position gives pitch; its width gives duration.`,
      'All events now play C, while each version keeps its own note starts and durations. Removing the rising and falling pitch pattern makes the timing easier to hear.',
      'The pitch order C D E G E D C C returns. Those rises and falls now combine with the timing pattern to make the heard phrase.',
      different
        ? 'Version A starts each note on a beat. In B, G starts half a beat before the second bar and the following E starts half a beat into that bar. The pitch order stays fixed.'
        : 'Version B has not moved any note starts or changed any durations. Its piano roll coincides with A’s timing, so this setting supplies a comparison with no rhythmic change.',
      different
        ? 'B’s G begins between beats and continues across the first beat of bar 2. Its onset falls before that strong beat, while its duration carries it through the beat.'
        : 'In this straight-timing case, G occupies the last beat of bar 1 and ends at its boundary. A new E begins on the first beat of bar 2; no note is held across that boundary.',
      different
        ? 'The two versions preserve all eight notes, their pitch order, instrument, loudness and tempo. Moving two starts and changing two durations changes how that pitch contour meets the beat.'
        : 'All pitches, their order, starts and durations match. With the same instrument, loudness and tempo, A and B produce the same phrase. Select shifted timing to compare the rhythmic change.',
    ];
    const frames = titles.map((title, i) => {
      const clips = i === 2 ? m.flat : m.clips;
      return {
        id: ['listen', 'pulse', 'rhythm', 'contour', 'timing', 'bar', 'phrase'][i]!,
        title,
        line: lines[i]!,
        caption: captions[i]!,
        state: {
          timing: m.timing,
          bpm: m.bpm,
          clips,
          movedStarts: m.movedStarts,
          movedDurations: m.movedDurations,
          crossing: clips[1]!.notes.filter((n) => n.at < 4 && n.at + n.duration > 4),
        },
        audio: { clips },
        draw: (s: Stage) => scorePicture(s, clips, i),
      };
    });
    frames.splice(5, 0, {
      ...frames[3]!,
      id: 'predict',
      title: 'Which note is sounding as bar 2 starts?',
      line: 'Follow the strong vertical bar line through A and B.',
      caption:
        'Trace the rectangles across the boundary into bar 2, or listen to both versions. Which note is already sounding in B at that boundary? The unchanged-timing setting provides a control.',
      draw: (s: Stage) => scorePicture(s, m.clips, 3),
    });
    await lesson(this, frames, 'nord');
  }
}

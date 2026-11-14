import { Scene, Group, Text, FadeIn, FadeOut, SurroundingRectangle, TransformMatching, matchByKey, keyed } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, answerOf, having } from '../../../explain/index.ts';
import type { Stage, ExplainerMeta } from '../../../explain/index.ts';
import { bars, table } from '../../../explain/drawing.ts';
import { WORDS, apart, clusters, cutStory, lengths, word } from './model.ts';
import type { LengthState } from './model.ts';
import { CELL, byteBoxes, cell, cells, grouped, names, spread, words } from './picture.ts';
import { numberWord } from '../lib/format.ts';

const count = (n: number) => numberWord(n);
const Count = (n: number) => numberWord(n, { capital: true });

export default class StringLength extends Scene<LengthState, {}> {
  static meta = {
    // Devanagari, Hebrew, Arabic and Chinese are drawn from their own faces, and bold from real Bold cuts.
    lettering: { scripts: ['Deva', 'Hebr', 'Arab', 'Hani'], styles: ['bold'] },
    textContext: 'explicit' as const,
    sources: [
      'https://www.unicode.org/reports/tr29/tr29-47.html#Grapheme_Cluster_Boundary_Rules',
      'https://www.rfc-editor.org/rfc/rfc3629#section-3',
      'https://docs.python.org/3.12/library/stdtypes.html#str',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter',
    ],
    claims: [
      { says: 'including every Devanagari letter', test: 'model.test.ts: the model’s bytes are TextEncoder’s' },
      { says: 'Only hello has one length', shown: true as const },
    ],
  } satisfies ExplainerMeta;

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const hi = apart(word('namaste').text), he = apart(word('shalom').text);
    const base = (w: typeof hi) => ({ text: w.text, bytes: w.bytes, points: w.points, characters: w.characters });
    const shown = (w: typeof hi) => w.parts.map((p) => ({ hex: p.hex, bytes: p.bytes.map((b) => b.toString(16).toUpperCase()), cluster: p.cluster }));
    const fade = (...mobs: Mobject[]) => mobs.map((m) => new FadeOut(m, { runTime: 0.3 }));
    const big = (text: string, at: [number, number], size = 1.3) => new Text(text, { fontSize: size, color: s.look.ink, shaping: this.textShaping }).moveTo(at);

    // 1. The question, and the three answers side by side on one scale.
    await s.steps([
      {
        id: 'question',
        title: `One word, three lengths: ${hi.bytes}, ${hi.points} and ${hi.characters}`,
        line: 'A form allows ten characters. Is this word too long?',
        caption: `A sign-up form limits a name to ten characters, and someone types ${hi.text}, namaste. How long is that? It depends on what is counted: ${hi.bytes} bytes, ${hi.points} code points, or the ${hi.characters} characters a reader sees. None of the three is wrong. ${answerOf(this)}. The next steps take the word apart to find each number.`,
        state: { ...base(hi), view: 'whole' } as LengthState,
        draw: (st: LengthState, s: Stage) => {
          const chart = bars(s, [
            { label: 'Bytes, in UTF-8', value: st.bytes, display: String(st.bytes) },
            { label: 'Code points', value: st.points, display: String(st.points) },
            { label: 'Characters a reader sees', value: st.characters, display: String(st.characters) },
          ], st.bytes, { key: 'lengths' });
          chart.scale(0.86).moveTo([2.75, -0.35]);
          return new Group(
            keyed(new Text(st.text, { fontSize: 1.35, color: s.look.ink, shaping: s.scene.textShaping }).moveTo([-5.15, 0.6]), 'word'),
            words(s, 'namaste: a greeting', [-5.15, -0.6], { soft: true }),
            chart,
          );
        },
      },
    ]);

    // 2. The code points: one cell each, with its number and what it is.
    await this.step('points', {
      title: `${Count(hi.points)} code points: the numbered parts the word is stored as`,
      line: 'Each cell is one code point; U+0928 is its number in Unicode.',
      caption: `To a program, text is a list of code points, numbers that Unicode assigns to letters and marks: U+0928 is the letter na. This word needs ${count(hi.points)}. Four are letters. One, U+094D, is a joiner: it tells the letter before it to fuse with the next. The last is a vowel mark that sits on a letter. The dotted ring stands for the letter a mark would sit on. Python’s len() counts these: ${hi.points}.`,
    });
    await s.clear({ runTime: 0.2 });
    this.state = { ...base(hi), view: 'points', shown: shown(hi) };
    const apartX = spread(hi.parts.length, 2.35), row = cells(s, hi, apartX, 1.7, 'cp');
    const named = names(s, hi, apartX, 0.45, 'cp');
    // The caption's dotted ring, said on the stage too.
    named.add(words(s, 'Dotted ring: the letter a mark or a joiner sits on', [0, -1.05], { soft: true }));
    // The row enters as one group, cell after cell, so that the regrouping later moves this group's own cells.
    await this.play(new FadeIn(row, { runTime: 1.4, lagRatio: 0.12 }));
    s.keep(row, { describe: () => (this.state.view === 'characters'
      ? `The same ${count(hi.points)} cells, drawn together where they make one character: ${hi.read.map((c) => clusters(c)[0]!.length).join(', ')} cells`
      : `${Count(hi.points)} cells, one for each code point of ${hi.text}`) });
    await s.enter(named, { describe: `Under each cell its code point and what it is: ${hi.parts.map((p) => `${p.hex} ${p.kind}`).join(', ')}` });

    // 3. The bytes: each code point's UTF-8, with the first one's in use.
    await this.step('bytes', {
      title: `${Count(hi.bytes)} bytes: UTF-8 writes each of these code points as three`,
      line: 'Bytes are what a file, a column or a packet holds.',
      caption: `To store or send the word, each code point is written as bytes. UTF-8 uses one byte for the first 128 code points, which cover English, two for the next couple of thousand, and three for the tens of thousands after those, including every Devanagari letter. So the first code point, ${hi.parts[0]!.hex}, becomes ${hi.parts[0]!.bytes.map((b) => b.toString(16).toUpperCase()).join(' ')}, and the ${count(hi.points)} code points become ${hi.bytes} bytes. A limit set in bytes is the tightest of the three.`,
    });
    this.state = { ...base(hi), view: 'bytes', shown: shown(hi) };
    const stored = byteBoxes(s, hi, apartX, -1.95, 'cp', 0);
    await s.enter(stored, { describe: `Under each code point its three UTF-8 bytes, first byte on top; the first, ${hi.parts[0]!.hex}, is ${hi.parts[0]!.bytes.map((b) => b.toString(16).toUpperCase()).join(' ')}` });

    // 4. The characters: the same cells, regrouped by key into what a reader sees.
    await this.step('characters', {
      title: `${Count(hi.characters)} characters: a mark or a joined letter belongs to the letter before`,
      line: 'What a reader sees, and a cursor steps over, as one: a grapheme cluster.',
      caption: `A reader sees ${count(hi.characters)} things in this word. The joiner fuses two letters into one shape and the vowel mark rides on it, so the last four code points are drawn as one shape and selected as a single character, ${hi.read.at(-1)}. Unicode calls such a unit a grapheme cluster and gives rules for finding one. Counted this way the word is ${hi.characters} long, and it fits the form with room to spare.`,
    });
    this.state = { ...base(hi), view: 'characters', shown: shown(hi) };
    await this.play(...fade(named, stored));
    const closeX = grouped(hi, 1.3), together = cells(s, hi, closeX, 0.2, 'cp');
    // The cells are keyed by their place in the word, so each travels to its place in its character.
    await this.play(new TransformMatching(row, together, { key: matchByKey(), runTime: 1.3 }));
    s.keep(together, { describe: `The same ${count(hi.points)} cells, drawn together where they make one character: ${hi.read.map((c) => clusters(c)[0]!.length).join(', ')} cells` });
    const frames = hi.read.map((_, k) => {
      const mine = hi.parts.filter((p) => p.cluster === k), x0 = closeX[mine[0]!.index]! - CELL / 2, x1 = closeX[mine.at(-1)!.index]! + CELL / 2;
      return keyed(new SurroundingRectangle([x0, 0.2 - CELL / 2, x1, 0.2 + CELL / 2], { buff: 0.14, cornerRadius: 0.2, stroke: s.look.emphasis, strokeWidth: 0.06 }), `character:${k}`);
    });
    const read = hi.read.map((c, k) => {
      const mine = hi.parts.filter((p) => p.cluster === k);
      return keyed(big(c, [(closeX[mine[0]!.index]! + closeX[mine.at(-1)!.index]!) / 2, 2.15]), `read:${k}`);
    });
    const tally = hi.read.map((c, k) => {
      const mine = hi.parts.filter((p) => p.cluster === k);
      return words(s, String(mine.length), [(closeX[mine[0]!.index]! + closeX[mine.at(-1)!.index]!) / 2, -1.3], { size: 0.8, bold: true });
    });
    tally.push(words(s, 'code points in each character', [0, -2.2], { soft: true }));
    await s.enter(...frames, ...read, ...tally, { describe: `Each character as a reader sees it, over the code points that make it: ${hi.read.map((c, k) => `${c} from ${hi.parts.filter((p) => p.cluster === k).length}`).join(', ')}` });

    // 5. Another word, and a prediction: its characters are shown, its code points are not yet.
    const heX = spread(he.read.length, 2.6, true);
    await this.step('predict', {
      title: `Shalom has ${count(he.characters)} characters. How many code points?`,
      line: `Predict: ${he.characters}, ${he.points} or ${he.bytes}?`,
      caption: `Another greeting: shalom, in Hebrew, written with its vowel points, the dots and dashes above and below the letters. A reader sees ${count(he.characters)} characters, read from the right. Before the next step takes the word apart: how many code points will Python’s len() count?`,
      // The reader commits before the cells split; the answer is the model's count.
      predict: { options: [String(he.characters), String(he.points), String(he.bytes)], answer: String(he.points) },
    });
    await s.clear({ runTime: 0.2 });
    this.state = { ...base(he), view: 'characters' };
    const heWord = keyed(big(he.text, [0, 2.3], 1.35), 'word');
    const heRead = new Group(...he.read.map((c, k) => cell(s, c, [heX[k]!, 0.2], `he:character:${k}`)));
    const heNote = words(s, 'shalom: a greeting, read from the right', [0, -1.25], { soft: true });
    await s.enter(heWord, heRead, heNote, { describe: () => `${he.text}, shalom, and its ${count(he.characters)} characters in cells, read from the right` });

    // 6. The answer: every code point in its own cell, the vowel points among them.
    const marks = he.parts.filter((p) => p.kind !== 'letter').length, plain = lengths(he.parts.filter((p) => p.kind === 'letter').map((p) => p.char).join(''));
    await this.step('hebrew', {
      title: `${Count(he.points)}: ${count(marks)} of them are vowel points`,
      line: `${he.characters} characters, ${he.points} code points, ${he.bytes} bytes.`,
      caption: `Each vowel point is a code point of its own. The first letter carries two and the third carries one, so ${count(he.characters)} characters are ${he.points} code points, and at two bytes each in UTF-8, ${he.bytes} bytes. Written without its points, as everyday Hebrew usually is, the same word is ${plain.points} code points and ${plain.bytes} bytes. Its length to a reader has not changed: still ${plain.characters} characters.`,
    });
    this.state = { ...base(he), view: 'points', shown: shown(he) };
    const hePointsX = spread(he.parts.length, 2.2, true), heRow = cells(s, he, hePointsX, 0.2, 'he:cp'), heNamed = names(s, he, hePointsX, -1.05, 'he:cp');
    await this.play(...fade(heRead, heNote));
    await this.play(new FadeIn(heRow, { runTime: 1.4, lagRatio: 0.12 }));
    s.keep(heRow, { describe: `${Count(he.points)} cells, one for each code point of ${he.text}, from the right` });
    await s.enter(heNamed, { describe: `Under each cell its code point and what it is: ${he.parts.map((p) => `${p.hex} ${p.kind}`).join(', ')}` });

    // 7 and 8. Five greetings side by side, then the cut: where a limit lands inside a character.
    const rows = WORDS.map((w) => ({ id: w.id, text: w.text, ...lengths(w.text) }));
    const cuts = ([['bytes', 10], ['points', 4], ['characters', 2]] as const).map(([unit, n]) => cutStory(hi.text, n, unit));
    await s.steps([
      {
        id: 'table',
        title: 'Five greetings, three counts each',
        line: 'Only hello has one length.',
        caption: `The same three counts for five greetings. hello is ${rows[0]!.bytes} by any of them, which is why code that confuses them passes its tests in English. Chinese has no marks, so code points and characters agree, but each character takes three bytes. Hebrew and Arabic carry vowel marks as extra code points. Hindi fuses letters. The further a script is from one letter, one code point, one byte, the further its counts drift apart.`,
        state: { ...base(hi), view: 'whole', table: rows } as LengthState,
        draw: (st: LengthState, s: Stage) =>
          new Group(table(s, ['In', 'Word', 'Bytes', 'Code points', 'Characters'],
            having(st, 'table').table.map((r) => ({ key: r.id, cells: [WORDS.find((w) => w.id === r.id)!.script, r.text, r.bytes, r.points, r.characters] })),
            { key: 'greetings', columns: { left: -7, right: 7 }, at: [0, 2.5], gap: 1.05, size: 0.62 })),
      },
      {
        id: 'cut',
        title: 'Cut by bytes or code points and a character can be cut in half',
        line: 'To shorten text for a reader, cut between characters.',
        caption: `The form’s limit has to cut somewhere. Keep ${cuts[0]!.n} bytes and the fourth code point is split, so it goes: three bare letters are left, and the last character has lost its joined letter and its vowel. Keep ${cuts[1]!.n} code points and the word ends on a joiner with nothing to join, a stray stroke under the last letter. Keep ${cuts[2]!.n} characters and both are whole. Store and send bytes; count and cut what people read in characters.`,
        state: { ...base(hi), view: 'whole', cuts } as LengthState,
        draw: (st: LengthState, s: Stage) =>
          new Group(...having(st, 'cuts').cuts.flatMap((c, i) => {
            const y = 1.9 - i * 2.1, unit = { bytes: 'bytes', points: 'code points', characters: 'characters' }[c.unit];
            return [
              words(s, `The first ${c.n} ${unit}`, [0, y + 0.36]).moveTo([-7.2, y + 0.36], [-1, 0]),
              words(s, { whole: 'whole characters', joiner: 'ends on a joiner', short: 'the last character is cut short' }[c.ends], [0, y - 0.36], { soft: true }).moveTo([-7.2, y - 0.36], [-1, 0]),
              keyed(new Text(c.text, { fontSize: 1.3, color: s.look.ink, shaping: s.scene.textShaping }).moveTo([3.6, y]), `cut:${c.unit}`),
            ];
          })),
      },
    ]);
  }
}

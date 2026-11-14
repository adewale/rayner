// Two predictions, each answer computed from a one-line model: one revealed by the next step, one
// by a named later step. The reader tests (test/browser/explain-predict.test.ts) choose an option and
// read the reveal, standalone, framed and on a phone; the transcript test reads the built page.
import { Scene, Text } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';

/** The model: whether n is even, and how many times it halves before it is odd. */
const parity = (n: number) => (n % 2 === 0 ? 'Even' : 'Odd');
const halvings = (n: number): number => (n % 2 === 0 ? 1 + halvings(n / 2) : 0);

export default class Prediction extends Scene {
  static meta = { id: 'prediction', title: 'Predictions' };
  static settings = [{ id: 'n', label: 'Number', default: '12', options: [{ value: '12', label: '12' }, { value: '7', label: '7' }] }];
  override async construct() {
    const n = Number(settingsOf(this).n), s = stage(this);
    const say = async (words: string) => {
      await s.clear();
      await s.enter(new Text(words, { fontSize: 0.8, color: s.look.ink }), { describe: words });
    };
    await this.step('ask', { title: 'Even or odd?', line: `Predict: is ${n} even or odd?`, caption: 'Choose before the answer.', predict: { options: ['Even', 'Odd'], answer: parity(n) } });
    await say(`${n}`);
    await this.step('answer', { title: 'The answer', caption: `${n} is ${parity(n).toLowerCase()}.` });
    await say(parity(n));
    await this.step('second', {
      title: 'Halving',
      caption: 'How often does it halve?',
      predict: { prompt: `How many times does ${n} halve before it is odd?`, options: ['0', '1', '2', '3'], answer: String(halvings(n)), reveal: 'end' },
    });
    await say(`${n} ÷ 2`);
    await this.step('pause', { title: 'A pause', caption: 'Not yet.' });
    await say('…');
    await this.step('end', { title: 'The count', caption: `${n} halves ${halvings(n)} times.` });
    await say(`${halvings(n)}`);
  }
}

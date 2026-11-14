import { Scene, Group, ArcBetweenPoints, Brace, MathTex, Create, FadeIn, MoveAlongPath, TransformFromCopy, TransformMatchingText, keyed } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { stage, settingsOf, answerOf, having } from '../../../explain/index.ts';
import type { Stage, ExplainerMeta, Setting } from '../../../explain/index.ts';
import { table } from '../../../explain/drawing.ts';
import { SUMS, others, sumStory } from './model.ts';
import type { SumState } from './model.ts';
import { DIGITS, LINE_Y, digitsAt, drawLine, flag, ring, square, startAt, stored } from './picture.ts';

const CHOICE = { 'two-tenths': '0.1+0.2', 'three-tenths': '0.1+0.3' } as const;
/** A fraction of a gap, in words: the model's places are fifths and halves here. */
const fraction = (x: number) => ({ 0.2: 'a fifth', 0.4: 'two fifths', 0.5: 'half', 0.6: 'three fifths', 0.8: 'four fifths' })[Math.round(x * 10) / 10] ?? `${x.toFixed(2)}`;

export default class FloatSum extends Scene<SumState, {}> {
  static meta = {
    // The fraction a double holds, and the gap between doubles, are typeset once by rayner snapshots.
    lettering: { math: true },
    sources: [
      'https://docs.python.org/3.12/tutorial/floatingpoint.html',
      'https://tc39.es/ecma262/2024/#sec-numeric-types-number-add',
      'https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html',
    ],
    claims: [
      { says: 'every language that uses the processor’s own floating-point numbers', test: 'model.test.ts: the exact sum of two doubles, rounded to the nearest with ties to even, is what CPython’s float addition gives' },
      { says: 'A tie always goes to the tick whose last binary digit is 0', test: 'model.test.ts: exactly halfway between two doubles, the one whose last bit is 0 is chosen' },
      { says: 'only 0.5 + 0.25 is exact', test: 'model.test.ts: the last step’s sums' },
      { says: 'Printing does not show every digit a double holds', test: 'model.test.ts: a typed decimal is stored as the double JavaScript reads it as, and prints back as the shortest decimal that names it' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    { id: 'sum', label: 'Sum', default: 'two-tenths', options: [{ value: 'two-tenths', label: '0.1 + 0.2' }, { value: 'three-tenths', label: '0.1 + 0.3' }] },
  ] satisfies readonly Setting[];

  override async construct() {
    const s = stage(this, { style: 'nord', headingSize: 0.6 });
    const m = sumStory(SUMS[CHOICE[settingsOf(this).sum as keyof typeof CHOICE]]);
    const { a, b, expected } = m, sum = `${a} + ${b}`;
    const base: SumState = { a, b, expected, equal: m.equal, prints: m.prints, expectedPrints: m.expectedPrints, stored: [], ticks: [] };
    const kept = m.stored.map(({ typed, double }) => ({ typed, double }));
    const ticks = m.ticks.map((t) => t.double), prints = m.ticks.map((t) => t.prints);
    const [first, , third] = m.stored as [(typeof m.stored)[0], (typeof m.stored)[0], (typeof m.stored)[0]];
    const sides = m.stored.map((v) => (v.high ? 'a little high' : 'a little low'));
    const upper = m.rounded.chosen === m.rounded.above;

    // 1. The result that needs explaining, as a language prints it.
    await s.steps([
      {
        id: 'surprise',
        title: m.equal ? `${sum} == ${expected} is true, but not because the sum is exact` : `${sum} is not ${expected}`,
        line: `What a language prints for ${sum}, for ${expected}, and for whether they are equal.`,
        caption: m.equal
          ? `Ask JavaScript or Python whether ${sum} equals ${expected} and it says true, yet 0.1 + 0.2 == 0.3 is false in the same languages. Neither answer is a bug, and every language that uses the processor’s own floating-point numbers gives both. The numbers the machine adds are not quite the ones typed, and the sum is rounded once more. Here the rounding happens to land where ${expected} is kept.`
          : `Ask JavaScript or Python for ${sum} and it prints ${m.prints}; ask whether that equals ${expected} and it says false. Nothing is broken: every language that uses the processor’s own floating-point numbers says false too. The numbers the machine adds are not quite the ones typed, and the sum is rounded once more.`,
        state: base,
        draw: (st: SumState, s: Stage) =>
          new Group(table(s, ['You type', 'It prints'], [
            { key: 'sum', cells: [`${st.a} + ${st.b}`, st.prints] },
            { key: 'expected', cells: [st.expected, st.expectedPrints] },
            { key: 'equal', cells: [`${st.a} + ${st.b} == ${st.expected}`, String(st.equal)] },
          ], { key: 'printed', columns: { left: -6.9, gap: 1 }, at: [0, 1.9], gap: 1.2, size: 0.64 })),
      },
    ]);

    // 2. What is kept for a typed decimal: the digits grow out of the ones typed.
    await this.step('stored', {
      title: `${a} is kept as a nearby fraction, ${sides[0]}`,
      line: 'A double is a whole number over a power of two.',
      caption: `A double, the machine’s number, holds a whole number divided by a power of two. One tenth is not such a fraction, just as one third has no finite decimal, so the machine keeps the nearest one it can: ${first.fraction.num} over 2 to the power ${first.fraction.power}, ${sides[0]}. ${b} is kept ${sides[1]} and ${expected} ${sides[2]}. ${answerOf(this)}.`,
    });
    await s.clear({ runTime: 0.2 });
    this.state = { ...base, stored: kept };
    const rowY = [1.9, 1.05, 0.2] as const, left = -7.1;
    const typedFirst = startAt(s, a, [left, rowY[0]], { size: DIGITS, mono: true });
    const head = startAt(s, 'Typed, then what is kept, digit for digit', [left, 2.7], { soft: true });
    await s.enter(typedFirst, head);
    // The typed digits stay where they are and the digits the machine keeps grow out of them.
    const keptFirst = keyed(digitsAt(s, first.digits, [left, rowY[0]]), 'kept:0');
    await this.play(new TransformMatchingText(typedFirst, keptFirst, { runTime: 1.4 }));
    s.keep(keptFirst);
    const rest = m.stored.slice(1).map((v, i) => keyed(digitsAt(s, v.digits, [left, rowY[i + 1]!]), `kept:${i + 1}`));
    const notes = m.stored.map((v, i) => startAt(s, v.high ? 'high' : 'low', [5.2, rowY[i]!], { soft: true }));
    await s.enter(...rest, ...notes, { runTime: 0.5 });
    const said = startAt(s, `${a} is kept as exactly`, [left, -1.7]);
    const kept0 = keyed(new MathTex(`\\frac{${first.fraction.num}}{2^{${first.fraction.power}}}`, { display: true, fontSize: 0.95, color: s.look.ink, shaping: this.textShaping }), 'fraction');
    kept0.moveTo([said.box()![2] + 0.4, -1.7], [-1, 0]);
    await s.enter(said, kept0, { describe: `${a} is kept as exactly ${first.fraction.num} over 2 to the power ${first.fraction.power}` });

    // 3. The doubles as points on a line, with the typed decimal between two of them.
    await this.step('line', {
      title: `${expected} falls in a gap between two doubles`,
      line: 'Ticks are doubles; between two ticks there is nothing to keep.',
      caption: `Three neighbouring doubles near ${expected}, drawn as ticks. Between ticks there is no number the machine can hold, and the gap here is 2 to the power minus ${m.gap.power}, about ${m.gapDigits.slice(0, 20)}. The ring marks ${expected} exactly as typed: it falls ${fraction(m.expectedAt % 1)} of the way across a gap, so it is kept as the nearer tick, the dot.`,
    });
    await s.clear({ runTime: 0.2 });
    this.state = { ...base, stored: kept, ticks, expectedAt: m.expectedAt, expectedTick: m.expectedTick };
    const { line, marks, labels } = drawLine(s, prints);
    const at = (place: number): Vec => line.n2p(place);
    // The gap, braced, with its width at the brace's tip: the last gap on the line, clear of the marks.
    const last = m.ticks.length - 1, gapBox = [at(last - 1)[0], LINE_Y - 0.1, at(last)[0], LINE_Y + 0.1] as const;
    const brace = keyed(new Brace([...gapBox], [0, 1], { stroke: s.look.soft, strokeWidth: 0.04 }), 'gap:brace');
    const width = keyed(new MathTex(`2^{-${m.gap.power}}`, { fontSize: 0.9, color: s.look.ink, shaping: this.textShaping }), 'gap:width');
    brace.putAtTip(width, 0.16);
    await s.enter(line, marks, labels, { describe: `A number line with ${m.ticks.length} ticks, each a double; the first two are named by what they print as, ${prints[0]} and ${prints[1]}` });
    await s.enter(brace, width, { describe: `A brace over one gap between ticks: 2 to the power minus ${m.gap.power}` });
    const typedMark = keyed(ring(s, at(m.expectedAt)), 'mark:typed');
    const typedFlag = flag(s, `${expected}, as typed`, typedMark, m.expectedAt <= m.sumAt ? 'left' : 'right');
    await s.enter(typedMark, typedFlag, { describe: `A ring at ${expected} exactly as typed, ${fraction(m.expectedAt % 1)} of the way across a gap` });
    // The typed value stays where it is; a copy of its mark settles on the nearer double.
    const keptMark = keyed(stored(s, at(m.expectedTick)), 'mark:kept');
    await this.play(new TransformFromCopy(typedMark, keptMark, { runTime: 0.9 }));
    s.keep(keptMark, { describe: `A dot on the tick ${expected} is kept as, the one that prints as ${prints[m.expectedTick]}` });

    // 4. The exact sum of the two kept numbers, and the question.
    await this.step('predict', {
      title: 'The exact sum falls in the same gap. Which tick will it be kept as?',
      line: `Predict: the same double as ${expected}, or a different one?`,
      caption: `Now add the two numbers the machine kept for ${a} and ${b}, exactly, with no rounding. The result, the square, is not a double either: it falls ${m.rounded.where === 'tie' ? 'exactly halfway between two ticks' : `${fraction(m.rounded.along)} of the way across a gap`}. The machine has to keep one of the two. Will it be the tick ${expected} was kept as?`,
      // The reader commits before the sum is rounded; the answer is the model's.
      predict: { options: [`The same double as ${expected}`, 'A different double'], answer: m.equal ? `The same double as ${expected}` : 'A different double' },
    });
    this.state = { ...base, stored: kept, ticks, expectedAt: m.expectedAt, expectedTick: m.expectedTick, sumAt: m.sumAt, sumTick: null };
    const sumMark = keyed(square(s, at(m.sumAt)), 'mark:sum');
    const sumFlag = flag(s, `${sum}, exactly`, sumMark, m.expectedAt <= m.sumAt ? 'right' : 'left');
    await s.enter(sumMark, sumFlag, { describe: () => `A square for the exact sum of the two kept numbers, ${Math.abs(sumMark.center()[0] - at(m.sumAt)[0]) < 1e-6 ? `${m.rounded.where === 'tie' ? 'exactly halfway between two ticks' : 'between two ticks'}` : `moved onto the tick that prints as ${m.prints}`}` });

    // 5. The rounding: the sum hops to the tick it is kept as.
    await this.step('round', {
      title: m.equal ? `The sum is rounded ${upper ? 'up' : 'down'}, onto the double ${expected} is kept as` : `The sum is rounded ${upper ? 'up' : 'down'}, one double past ${expected}’s`,
      line: m.equal ? `The same tick: ${sum} == ${expected} is true.` : `Two different ticks: ${sum} == ${expected} is false.`,
      caption: m.equal
        ? `A tie always goes to the tick whose last binary digit is 0, here the ${upper ? 'upper' : 'lower'} one. That is the tick ${expected} was kept as, so the machine holds one and the same double for both, and == compares doubles: true. Neither ${a}, ${b}, ${expected} nor the sum is exactly what was typed; the two roundings met.`
        : `A tie always goes to the tick whose last binary digit is 0, here the ${upper ? 'upper' : 'lower'} one. ${expected} was kept as the ${upper ? 'lower' : 'upper'} tick. So the machine holds two different doubles, one gap apart, and == compares doubles: false. Typing ${expected} rounded one way, and adding rounded the other.`,
    });
    this.state = { ...base, stored: kept, ticks, expectedAt: m.expectedAt, expectedTick: m.expectedTick, sumAt: m.sumAt, sumTick: m.sumTick };
    // A hop along an arc over the line, from where the exact sum lies to the tick it is kept as.
    const hop = new ArcBetweenPoints(at(m.sumAt), at(m.sumTick), { angle: upper ? -2.2 : 2.2, stroke: s.look.soft, strokeWidth: 0.04 });
    s.keep(keyed(hop, 'hop'), { describe: `An arc from the exact sum to the tick that prints as ${m.prints}` });
    await this.play(new Create(hop, { runTime: 0.5 }));
    await this.play(new MoveAlongPath(sumMark, hop, { runTime: 0.9 }));

    // 6. Why it prints what it prints: the shortest decimal that names the double.
    await this.step('print', {
      title: `The sum prints as ${m.prints}, the shortest name of its double`,
      line: 'Printing shows the fewest digits that tell a double from its neighbours.',
      caption: m.equal
        ? `Printing does not show every digit a double holds. It shows the shortest decimal that reads back as the same double and no other. The sum’s double is the one ${expected} is kept as, so both print as ${m.prints}, and the digits after it stay hidden.`
        : `Printing does not show every digit a double holds. It shows the shortest decimal that reads back as the same double and no other. For the double ${expected} is kept as, that is ${m.expectedPrints}. The sum’s double is its neighbour, and nothing shorter than ${m.prints} names it without naming another. The extra digits were there all along; they show when two neighbours must be told apart.`,
    });
    await s.clear({ runTime: 0.2 });
    const digitsX = -2.9, rows = [2.2, 1.3, -0.3, -1.2] as const;
    const sumDigits = m.ticks[m.sumTick]!.digits, expectedDigits = third.digits;
    const longSum = keyed(digitsAt(s, sumDigits, [digitsX, rows[0]]), 'sum:kept');
    const longExpected = keyed(digitsAt(s, expectedDigits, [digitsX, rows[2]]), 'expected:kept');
    const names = ['Sum, kept', 'Sum, printed', `${expected}, kept`, `${expected}, printed`].map((t, i) => startAt(s, t, [left, rows[i]!], { soft: true }));
    await s.enter(longSum, longExpected, names[0]!, names[2]!);
    // A copy of the kept digits travels down a row: the digits the print keeps move, the rest fade.
    const shorten = (long: typeof longSum, short: string, y: number, key: string) => {
      const from = long.copy(), to = keyed(startAt(s, short, [digitsX, y], { size: DIGITS, mono: true, bold: true }), key);
      this.add(from);
      return { play: new TransformMatchingText(from, to, { runTime: 1.2 }), to };
    };
    const shortSum = shorten(longSum, m.prints, rows[1], 'sum:printed'), shortExpected = shorten(longExpected, m.expectedPrints, rows[3], 'expected:printed');
    await this.play(shortSum.play, shortExpected.play, new FadeIn(names[1]!, { runTime: 0.6 }), new FadeIn(names[3]!, { runTime: 0.6 }));
    s.keep(shortSum.to, shortExpected.to, names[1]!, names[3]!);

    // 7. Other sums: which way the last rounding goes decides what a reader sees.
    const list = others();
    await s.steps([
      {
        id: 'others',
        title: 'Whether a sum looks right depends on where it falls',
        line: 'Four sums, what each prints as, and whether that is the decimal expected.',
        caption: `Sums of decimals go through the same two roundings; what differs is where the exact sum falls between two doubles. ${list[1]!.sum} rounds onto the double for ${list[1]!.expected}, ${list[2]!.sum} rounds to the double below the one for ${list[2]!.expected}, and only ${list[3]!.sum} is exact, because halves and quarters are whole numbers over a power of two. So do not test sums of decimals with ==: compare within a tolerance, or count in whole units such as cents.`,
        state: { ...base, stored: kept, ticks, others: list } as SumState,
        draw: (st: SumState, s: Stage) =>
          new Group(table(s, ['Sum', 'Prints as', 'Against'], having(st, 'others').others.map((o) => ({ key: o.sum.replace(/[^0-9]+/g, '-'), cells: [o.sum, o.prints, `${o.equal ? 'equals' : 'not'} ${o.expected}`] })),
            { key: 'others', columns: { left: -7.1, gap: 0.7 }, at: [0, 2.3], gap: 1.15, size: 0.58 })),
      },
    ]);
  }
}

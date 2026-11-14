// The float-sum explainer's model: what a 64-bit binary floating-point number (an IEEE 754 double,
// the number type of JavaScript and of Python's float) stores for a decimal, and what adding two of
// them gives. Every value is exact: a double is a whole number over a power of two, held here as a
// BigInt numerator and the power, so nothing in the model is itself rounded.
// Its limits: positive, finite, normal doubles only (no zero, negatives, subnormals, infinities or
// NaN); addition only, in the default rounding mode, round to nearest with ties to the even
// neighbour; the decimal a language prints is the shortest one that reads back as the same double,
// which is what JavaScript and Python 3 print, not what every language prints.

/** An exact value: `num / 2 ** power`. */
export interface Exact { num: bigint; power: number }

/** The exact value of a positive normal double, in lowest terms: an odd numerator, or power 0. */
export function exact(x: number): Exact {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('exact(): the model covers positive finite doubles');
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0), biased = Number((bits >> 52n) & 0x7ffn);
  if (biased === 0) throw new RangeError('exact(): the model leaves out subnormal doubles');
  // 1.fraction × 2^(biased − 1023): the 52 fraction bits and the hidden leading 1, as one whole number.
  return lowest({ num: (bits & ((1n << 52n) - 1n)) | (1n << 52n), power: 1075 - biased });
}

/** The same value with every shared factor of two taken out, and never a negative power. */
export function lowest({ num, power }: Exact): Exact {
  while (power > 0 && num % 2n === 0n) { num /= 2n; power--; }
  return power < 0 ? { num: num << BigInt(-power), power: 0 } : { num, power };
}

/** An exact value written out in decimal, every digit. A fraction over a power of two always ends. */
export function decimal({ num, power }: Exact): string {
  if (power === 0) return num.toString();
  // n / 2^p = n × 5^p / 10^p.
  const digits = (num * 5n ** BigInt(power)).toString().padStart(power + 1, '0');
  return `${digits.slice(0, -power)}.${digits.slice(-power)}`;
}

/** The exact sum of two exact values. */
export function add(a: Exact, b: Exact): Exact {
  const power = Math.max(a.power, b.power);
  return lowest({ num: (a.num << BigInt(power - a.power)) + (b.num << BigInt(power - b.power)), power });
}

/** Whether two exact values are equal. */
export const same = (a: Exact, b: Exact): boolean => { const x = lowest(a), y = lowest(b); return x.num === y.num && x.power === y.power; };

/** The double one step above a positive normal double, and the one below. */
export function neighbours(x: number): { below: number; above: number } {
  const view = new DataView(new ArrayBuffer(8));
  const step = (by: bigint) => { view.setFloat64(0, x); view.setBigUint64(0, view.getBigUint64(0) + by); return view.getFloat64(0); };
  return { below: step(-1n), above: step(1n) };
}

/** How a value sits between the two doubles around it, and which it rounds to. */
export interface Rounding {
  /** The double at or below the value, and the next one up. */
  below: number; above: number;
  /** How far the value is from `below` to `above`: 0 on `below`, 0.5 halfway (as the nearest double; `where` is the exact comparison). */
  along: number;
  /** `exact` when the value is a double already; else which neighbour is nearer, or `tie` when it is exactly halfway. */
  where: 'exact' | 'below' | 'above' | 'tie';
  /** The double it rounds to: the nearer one, and at a tie the one whose last bit is 0. */
  chosen: number;
}

/**
 * Round the positive fraction n / d to a double: to the nearest, and at a tie to the even one.
 * Whole-number arithmetic throughout, so the comparison with halfway is exact.
 */
export function roundRatio(n: bigint, d: bigint): Rounding {
  if (n <= 0n || d <= 0n) throw new RangeError('roundRatio(): the model covers positive values');
  const bits = (x: bigint) => x.toString(2).length;
  // The value lies in [2^e, 2^(e+1)); doubles there are 2^(e−52) apart.
  let e = bits(n) - bits(d);
  if (e >= 0 ? n < d << BigInt(e) : n << BigInt(-e) < d) e--;
  if (e < -1022 || e > 1023) throw new RangeError('roundRatio(): the model covers normal doubles');
  // Count whole gaps: scaled = floor(n / d ÷ 2^(e−52)), with `rest` of a gap of `gap` left over.
  const s = 52 - e, top = s >= 0 ? n << BigInt(s) : n, gap = s >= 0 ? d : d << BigInt(-s);
  const scaled = top / gap, rest = top - scaled * gap;
  // `scaled` is below 2^53, so it and the power of two that scales it are exact numbers.
  const below = Number(scaled) * 2 ** (e - 52), above = Number(scaled + 1n) * 2 ** (e - 52);
  const where = rest === 0n ? 'exact' : rest * 2n < gap ? 'below' : rest * 2n > gap ? 'above' : 'tie';
  const chosen = where === 'exact' || where === 'below' ? below : where === 'above' ? above : scaled % 2n === 0n ? below : above;
  // The place as a number: rest / gap to 80 binary places, which Number() then rounds to the nearest double.
  const along = Number(((rest << 80n) + gap / 2n) / gap) / 2 ** 80;
  return { below, above, along, where, chosen };
}

/** Round an exact value (a sum of doubles) to a double. */
export const round = ({ num, power }: Exact): Rounding => roundRatio(num, 1n << BigInt(power));

/** A decimal literal, such as "0.1", as a whole number over a power of ten: `num / 10 ** places`. */
export function typed(literal: string): { num: bigint; places: number } {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(literal);
  if (!m) throw new RangeError(`typed(): ${JSON.stringify(literal)} is not a plain decimal`);
  return { num: BigInt(m[1]! + (m[2] ?? '')), places: (m[2] ?? '').length };
}

/** How a typed decimal sits between the doubles around it, and the double it is stored as. */
export function store(literal: string): Rounding {
  const { num, places } = typed(literal);
  return roundRatio(num, 10n ** BigInt(places));
}

/** The shortest decimal that reads back as exactly this double: what JavaScript and Python print for it. */
export function shortest(x: number): string {
  for (let digits = 1; digits <= 17; digits++) {
    const s = x.toPrecision(digits);
    if (Number(s) === x) return String(Number(s));
  }
  throw new Error(`shortest(): ${x} does not round-trip in 17 digits`);
}

/** A decimal cut to `places` digits after the point, with an ellipsis when digits were dropped. */
export const cut = (digits: string, places: number): string => {
  const [whole, rest = ''] = digits.split('.');
  return rest.length > places ? `${whole}.${rest.slice(0, places)}…` : digits;
};

/** One sum the page can show: the two decimals typed, and the decimal a reader expects. */
export interface Sum { a: string; b: string; expected: string }
export const SUMS = {
  '0.1+0.2': { a: '0.1', b: '0.2', expected: '0.3' },
  '0.1+0.3': { a: '0.1', b: '0.3', expected: '0.4' },
} as const satisfies Record<string, Sum>;
export type SumId = keyof typeof SUMS;

/** Everything the page says about one sum, from the functions above. */
export function sumStory({ a, b, expected }: Sum) {
  const sa = store(a), sb = store(b), se = store(expected);
  const total = add(exact(sa.chosen), exact(sb.chosen)), rounded = round(total);
  // The line the page draws: the doubles from the lowest in play to one above the highest, a gap apart.
  const lowest = Math.min(se.below, rounded.below), highest = Math.max(se.above, rounded.above);
  const ticks = [lowest];
  while (ticks.at(-1)! <= highest) ticks.push(neighbours(ticks.at(-1)!).above);
  const gap = exact(neighbours(se.chosen).above - se.chosen);
  const place = (r: Rounding) => ticks.indexOf(r.below) + r.along;
  return {
    a, b, expected,
    /** Each typed decimal as stored: the double, its exact digits, and it as a fraction over a power of two. */
    stored: [sa, sb, se].map((r, i) => ({ typed: [a, b, expected][i]!, double: r.chosen, digits: decimal(exact(r.chosen)), fraction: exact(r.chosen), high: r.chosen === r.above && r.where !== 'exact', exact: r.where === 'exact' })),
    /** The exact sum of the two stored numbers, every digit, and how it sits between two doubles. */
    total: decimal(total), rounded,
    /** The doubles the line shows, lowest first, each with its exact digits and what it prints as. */
    ticks: ticks.map((t) => ({ double: t, digits: decimal(exact(t)), prints: shortest(t) })),
    /** Places along that line, in gaps from the first tick: the expected decimal, the exact sum, and the ticks each ends on. */
    expectedAt: place(se), expectedTick: ticks.indexOf(se.chosen),
    sumAt: place(rounded), sumTick: ticks.indexOf(rounded.chosen),
    /** The gap between neighbouring doubles here, exact. */
    gap, gapDigits: decimal(gap),
    /** What the machine has for the sum, what it prints, and whether it equals the stored expected decimal. */
    sum: rounded.chosen, prints: shortest(rounded.chosen), expectedPrints: shortest(se.chosen), equal: rounded.chosen === se.chosen,
  };
}
export type SumStory = ReturnType<typeof sumStory>;

/** A step's model: the sum, and as much of its story as the step has reached. */
export interface SumState {
  a: string; b: string; expected: string;
  /** Whether the machine's sum equals its stored expected decimal, and what each prints as. */
  equal: boolean; prints: string; expectedPrints: string;
  /** The typed decimals shown stored so far, each with its double. */
  stored: { typed: string; double: number }[];
  /** The doubles on the line, and where the marks are, in gaps from the first tick. */
  ticks: number[];
  expectedAt?: number; expectedTick?: number;
  sumAt?: number; sumTick?: number | null;
  /** The other sums the last step lists. */
  others?: { sum: string; prints: string; expected: string; equal: boolean; where: Rounding['where'] }[];
}

/** The sums the last step compares: each printed, and whether it equals its expected decimal. */
export const OTHERS: readonly Sum[] = [SUMS['0.1+0.2'], SUMS['0.1+0.3'], { a: '0.1', b: '0.7', expected: '0.8' }, { a: '0.5', b: '0.25', expected: '0.75' }];
export const others = () => OTHERS.map((sum) => {
  const m = sumStory(sum);
  return { sum: `${sum.a} + ${sum.b}`, prints: m.prints, expected: sum.expected, equal: m.equal, where: m.rounded.where };
});

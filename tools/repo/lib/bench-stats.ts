// The arithmetic behind `npm run bench` (tools/repo/bench.ts), kept apart so the tests can hold
// it to its decisions: windows over what the page recorded, and whether HEAD is slower.

/** Middle value; the mean of the two middle ones for an even count. Does not reorder `xs`. */
export function median(xs: readonly number[]): number {
  if (!xs.every(Number.isFinite)) throw new RangeError('median needs finite samples');
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b),
    m = s.length >> 1;
  if (s.length % 2) return s[m]!;
  const a = s[m - 1]!, b = s[m]!;
  if (Object.is(a, b)) return a;
  // Add before halving when possible so subnormals are not lost. If the sum
  // overflows, both operands are large enough that halving them is exact.
  const sum = a + b;
  return Number.isFinite(sum) ? sum / 2 : a / 2 + b / 2;
}

/** Validate an elapsed-time observation window, including a zero-width one. */
function windowBounds(from: number, to: number): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from) throw new RangeError('window needs finite nonnegative ordered bounds');
}
function time(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('trace needs finite nonnegative times');
}

/**
 * Experienced blocking portion inside [from,to]: intersect each task's interval
 * after its first 50ms with the window, including tasks started before it.
 * This is a clipped interaction-window metric, not navigation Total Blocking Time.
 */
export function blocking(tasks: readonly (readonly [start: number, duration: number])[], from: number, to: number): number {
  windowBounds(from, to);
  let sum = 0;
  for (const [start, duration] of tasks) {
    time(start); time(duration);
    // Translate the window to task-local elapsed time before clipping. Adding a
    // short duration to a large absolute origin can round away its excess.
    sum += Math.max(0, Math.min(to - start, duration) - Math.max(from - start, 50));
  }
  return sum;
}

/** Longest wait in [from,to], including both boundary tails; no frames means the whole window. */
export function longestGap(frames: readonly number[], from: number, to: number): number {
  windowBounds(from, to);
  let gap = 0, last = from, previous = -Infinity;
  for (const t of frames) {
    time(t);
    if (t < previous) throw new RangeError('frames must be chronological');
    previous = t;
    if (t < from || t > to) continue;
    gap = Math.max(gap, t - last);
    last = t;
  }
  return Math.max(gap, to - last);
}

/**
 * Which build goes first in repetition `rep`: base, head, then head, base, and so on, so
 * whatever drifts through a run (another job on the machine, a warming cache) lands on both.
 */
export const order = (rep: number): readonly ['base', 'head'] | readonly ['head', 'base'] =>
  rep % 2 ? (['head', 'base'] as const) : (['base', 'head'] as const);

/** How much slower is a regression: more than `rel` of BASE's median and more than `floor` ms. */
export type Rule = { rel: number; floor: number };

/** The share of interleaved pairs in which HEAD must be the slower one before a gap counts. */
export const PAIRS = 0.7;
/** Fewer pairs than this are shown but not judged: one disturbed pair would be a third of three. */
export const MIN_PAIRS = 5;

export type Comparison = {
  base: number;
  head: number;
  delta: number;
  /** Of the pairs measured back to back, the share in which HEAD took longer. */
  slower: number;
  /** Whether enough valid pairs were collected to make a decision. */
  judged: boolean;
  regressed: boolean;
};

/**
 * BASE against HEAD for one metric, from samples taken in interleaved pairs (`base[i]` beside
 * `head[i]`). Regressed means HEAD's median is slower by more than the rule allows, relative
 * and absolute both, and HEAD was the slower one in at least PAIRS of at least MIN_PAIRS
 * pairs: a median moved by a few disturbed samples is not a regression, nor is a consistent 1 ms.
 */
export function compare(base: readonly number[], head: readonly number[], rule: Rule): Comparison {
  if (base.length !== head.length || !base.length) throw new Error('compare needs the same number of samples on both sides');
  if (![...base, ...head, rule.rel, rule.floor].every((v) => Number.isFinite(v) && v >= 0)) throw new RangeError('compare needs finite nonnegative timings and rule values');
  const b = median(base),
    h = median(head),
    delta = h - b;
  const slower = head.filter((v, i) => v > base[i]!).length / head.length;
  const judged = head.length >= MIN_PAIRS;
  const regressed = judged && delta > rule.floor && delta > rule.rel * b && slower >= PAIRS;
  return { base: b, head: h, delta, slower, judged, regressed };
}

/**
 * A metric fails the gate only if it regressed on the first measurement and again on a second,
 * separate one (Lantern's reproduced regression): a busy minute on a shared machine can make
 * one round look slow, rarely two. Either supplied unjudged round is inconclusive,
 * even if the first was nonregressed. A missing second round after a judged
 * regression is instead not reproduced: no confirming measurement was supplied.
 */
export function verdict(first: Comparison, again?: Comparison): 'ok' | 'not reproduced' | 'regression' | 'inconclusive' {
  if (!first.judged || (again && !again.judged)) return 'inconclusive';
  if (!first.regressed) return 'ok';
  return again?.regressed ? 'regression' : 'not reproduced';
}

/** Largest layout-shift score observed in either measurement round; every score must be valid. */
export function worstShift(first: readonly number[], again: readonly number[] = []): number {
  if (!first.length && !again.length) throw new RangeError('layout shift needs at least one score');
  let worst = 0;
  for (const round of [first, again]) for (const score of round) {
    if (!Number.isFinite(score) || score < 0) throw new RangeError('layout shift scores must be finite and nonnegative');
    if (score > worst) worst = score;
  }
  return worst;
}

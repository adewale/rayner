// A toy of the metaphor in Dimitri Glazkov's essay "Machine Thinking" (20 January 2025): thinking as
// a ball rolling down a bumpy slope whose shape is a mind's mental models. It models the metaphor,
// not brains and not language models. What it leaves out: real terrains have many dimensions, not
// four spots in a row; a person's feelings, energy and habits are each reduced to one number added to
// or taken from a spot's height; and "the machine" is any process that moves when it is run.

/** The four ideas on the slope, from the question at the top to the lowest ground. */
export const IDEAS = ['Why so late?', 'Tight plans', 'Work harder', "I'm the cause"] as const;
export type Idea = (typeof IDEAS)[number];
/** The lowest idea on the slope: the answer the question is rolling toward. */
export const ANSWER = 3;
/** The slope both balls are thrown onto: each idea's height, highest first. */
export const SLOPE: readonly number[] = [6, 4.6, 3.4, 1.2];
/** How much a painful feeling raises an idea's ground, as the person feels it. */
export const PAIN = 4;
/** How much lower a spot is after the person's ball has rolled across it. */
export const GROOVE = 0.6;
/** How many times the machine is run per throw: one push each. */
export const RUN = 3;

/** How admitting the answer feels to the person thinking. */
export type Feeling = 'painful' | 'neutral';

/** One ball on its own copy of the slope. */
export type Ball = {
  /** The spot the ball is on. */
  at: number;
  /** Every spot it has been on this throw, in order. */
  path: number[];
  /** Its slope's heights, which only the person's ball wears down. */
  heights: number[];
  /** Why it stopped, once it has. */
  stopped: string | null;
  /** How many times it has been pushed this throw (the machine only). */
  pushes: number;
  /** Where the ball is drawn while it rolls, as a fractional spot; absent when it rests on `at`. Only the scene sets it. */
  pos?: number;
};

export type State = {
  feeling: Feeling;
  /** Which throw this is: 1, then 2 once both balls are thrown again. */
  throw: number;
  /** The person's ball, on top. */
  you: Ball;
  /** The machine's ball, below. */
  machine: Ball;
};

const ball = (heights: readonly number[]): Ball => ({ at: 0, path: [0], heights: [...heights], stopped: null, pushes: 0 });

export const start = (feeling: Feeling): State => ({ feeling, throw: 1, you: ball(SLOPE), machine: ball(SLOPE) });

/** The height of spot `i` as the person feels it: its ground, raised by pain at a painful answer. */
export const felt = (heights: readonly number[], feeling: Feeling, i: number) =>
  heights[i]! + (i === ANSWER && feeling === 'painful' ? PAIN : 0);

/** The neighbouring spots of `i`. */
const beside = (i: number, n: number) => [i - 1, i + 1].filter((j) => j >= 0 && j < n);

/**
 * The person's ball, one roll on: pulled downhill (homeostasis, the pull to save energy), it moves to
 * whichever neighbour feels lowest, and only if that is lower than where it is. Otherwise it stops.
 */
export function rollYou(b: Ball, feeling: Feeling): Ball {
  if (b.stopped) return b;
  const f = (i: number) => felt(b.heights, feeling, i);
  const lowest = beside(b.at, b.heights.length).reduce((a, c) => (f(c) < f(a) ? c : a));
  if (f(lowest) >= f(b.at)) return { ...b, stopped: 'nothing beside it feels lower' };
  return { ...b, at: lowest, path: [...b.path, lowest] };
}

/**
 * The machine's ball, one push on: it moves because it is run, not because it is pulled, to the
 * neighbour with the lowest ground it has not yet visited, uphill or down. Feelings are not part of
 * the ground it reads. It stops when its run of pushes ends.
 */
export function pushMachine(b: Ball, run = RUN): Ball {
  if (b.stopped) return b;
  if (b.pushes >= run) return { ...b, stopped: 'its run ended' };
  const fresh = beside(b.at, b.heights.length).filter((j) => !b.path.includes(j));
  const to = fresh.length ? fresh.reduce((a, c) => (b.heights[c]! < b.heights[a]! ? c : a)) : b.at;
  return { ...b, at: to, path: to === b.at ? b.path : [...b.path, to], pushes: b.pushes + 1 };
}

/** Every position of the person's ball over one throw, the first where it starts, the last stopped. */
export function throwYou(b: Ball, feeling: Feeling): Ball[] {
  const out = [b];
  while (!out.at(-1)!.stopped) out.push(rollYou(out.at(-1)!, feeling));
  return out;
}

/** Every position of the machine's ball over one run, the first where it starts, the last stopped. */
export function throwMachine(b: Ball, run = RUN): Ball[] {
  const out = [b];
  while (!out.at(-1)!.stopped) out.push(pushMachine(out.at(-1)!, run));
  return out;
}

/** What the machine says about the idea it lands on: a feeling it can describe, from the words it learned. */
export const machineSays = (at: number, feeling: Feeling) =>
  at === ANSWER ? (feeling === 'painful' ? 'Its words: this would hurt to admit' : 'Its words: this is fine to admit') : null;

/** The person's slope after a throw: every spot the ball crossed is a groove lower. */
export const carve = (b: Ball): number[] => b.heights.map((h, i) => (b.path.includes(i) ? Math.round((h - GROOVE) * 10) / 10 : h));

/** The ground the person's stopped ball would have to climb to reach the answer, as it feels (0 when it is there). */
export const riseToAnswer = (b: Ball, feeling: Feeling) =>
  b.at === ANSWER ? 0 : Math.round((felt(b.heights, feeling, b.at + 1) - b.heights[b.at]!) * 10) / 10;

/** Both balls back at the top for the next throw: the person's slope grooved, the machine's as it was. */
export const throwAgain = (st: State): State => ({
  ...st,
  throw: st.throw + 1,
  you: ball(carve(st.you)),
  machine: ball(st.machine.heights),
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import {
  ANSWER, GROOVE, IDEAS, PAIN, RUN, SLOPE, carve, felt, machineSays, riseToAnswer, start, throwAgain, throwMachine, throwYou,
  type Feeling,
} from './model.ts';

// The model is checked against the essay it pictures: each claim in fixtures/essay-claims.json,
// quoted from Dimitri Glazkov's "Machine Thinking", names the test below that holds the model to it.
// The essay is read, not run, so the grade is "read".
const essay = JSON.parse(readFileSync(new URL('./fixtures/essay-claims.json', import.meta.url), 'utf8')) as {
  claims: { id: string; says: string; test: string }[];
};
const FEELINGS: Feeling[] = ['painful', 'neutral'];
const slopes = fc.array(fc.integer({ min: 0, max: 80 }).map((n) => n / 10), { minLength: 3, maxLength: 7 });

test('every claim quoted from the essay names a test in this file', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  assert.equal(essay.claims.length, 6);
  for (const c of essay.claims) assert.ok(source.includes(`${c.test}'`) || source.includes(`${c.test}"`), `${c.id}: no test named "${c.test}"`);
});

test("the person's ball only rolls to lower felt ground, and stops where nothing beside it is lower", () => {
  fc.assert(fc.property(slopes, fc.constantFrom(...FEELINGS), (heights, feeling) => {
    const rolls = throwYou({ at: 0, path: [0], heights, stopped: null, pushes: 0 }, feeling);
    for (let k = 1; k < rolls.length; k++) {
      const [a, b] = [rolls[k - 1]!, rolls[k]!];
      if (b.at !== a.at) assert.ok(felt(heights, feeling, b.at) < felt(heights, feeling, a.at));
    }
    const last = rolls.at(-1)!;
    for (const j of [last.at - 1, last.at + 1].filter((j) => j >= 0 && j < heights.length))
      assert.ok(felt(heights, feeling, j) >= felt(heights, feeling, last.at));
  }));
});

test("a painful answer keeps the person's ball away; a neutral one does not", () => {
  const painful = throwYou(start('painful').you, 'painful').at(-1)!;
  const neutral = throwYou(start('neutral').you, 'neutral').at(-1)!;
  assert.equal(IDEAS[painful.at], 'Work harder');
  assert.ok(!painful.path.includes(ANSWER));
  assert.equal(neutral.at, ANSWER);
  // The answer is lower ground than where the person stops: only the pain keeps them off it.
  assert.ok(SLOPE[ANSWER]! < SLOPE[painful.at]!);
  assert.ok(SLOPE[ANSWER]! + PAIN > SLOPE[painful.at]!);
  assert.equal(riseToAnswer(painful, 'painful'), 1.8);
});

test("the machine's ball moves when it is run, uphill or down, and stops when its run ends", () => {
  // Over a ridge: the person's ball stops before it; the machine's is pushed over it.
  const ridge = [5, 3, 4.5, 1];
  const you = throwYou({ at: 0, path: [0], heights: ridge, stopped: null, pushes: 0 }, 'neutral').at(-1)!;
  const machine = throwMachine({ at: 0, path: [0], heights: ridge, stopped: null, pushes: 0 }).at(-1)!;
  assert.equal(you.at, 1);
  assert.deepEqual(machine.path, [0, 1, 2, 3]);
  fc.assert(fc.property(slopes, fc.integer({ min: 1, max: 6 }), (heights, run) => {
    const last = throwMachine({ at: 0, path: [0], heights, stopped: null, pushes: 0 }, run).at(-1)!;
    assert.equal(last.pushes, run);
    assert.equal(last.stopped, 'its run ended');
  }));
  assert.equal(throwMachine(start('painful').machine).at(-1)!.pushes, RUN);
});

test('the feeling changes what the machine says, never where its ball goes', () => {
  const [p, n] = FEELINGS.map((f) => throwMachine(start(f).machine).at(-1)!);
  assert.deepEqual(p!.path, n!.path);
  assert.equal(p!.at, ANSWER);
  assert.notEqual(machineSays(p!.at, 'painful'), machineSays(n!.at, 'neutral'));
});

test("a throw wears grooves into the person's slope and leaves the machine's as it was", () => {
  for (const feeling of FEELINGS) {
    let st = start(feeling);
    st = { ...st, you: throwYou(st.you, feeling).at(-1)!, machine: throwMachine(st.machine).at(-1)! };
    const after = throwAgain(st);
    for (let i = 0; i < SLOPE.length; i++)
      assert.equal(after.you.heights[i], st.you.path.includes(i) ? Math.round((SLOPE[i]! - GROOVE) * 10) / 10 : SLOPE[i]);
    assert.deepEqual(after.machine.heights, SLOPE);
    assert.deepEqual(throwMachine(after.machine).at(-1)!.path, st.machine.path);
  }
  // The painful case: the groove deepens where the person stopped, so the rise to the answer grows.
  const first = throwYou(start('painful').you, 'painful').at(-1)!;
  const second = throwYou({ ...start('painful').you, heights: carve(first) }, 'painful').at(-1)!;
  assert.equal(second.at, first.at);
  assert.equal(riseToAnswer(second, 'painful'), 2.4);
});

test('when the answer does not hurt, both balls end on it', () => {
  const st = start('neutral');
  assert.equal(throwYou(st.you, 'neutral').at(-1)!.at, ANSWER);
  assert.equal(throwMachine(st.machine).at(-1)!.at, ANSWER);
});

// A step's prediction (meta.predict, explain/script.ts): the answer is one of its options, a later
// step on the reading path reveals it, and the transcript asks before it answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictionsOf, PREDICTION_OPTIONS_MAX } from '../explain/script.ts';

const step = (name: string, meta: Record<string, unknown> = {}) => ({ step: name, meta });
const ask = (predict: unknown, ...rest: ReturnType<typeof step>[]) => [step('ask', { title: 'Ask', predict }), step('answer', { title: 'Answer' }), ...rest];

test('a prediction resolves its answer by text or index and is revealed by the next step by default', () => {
  assert.deepEqual(predictionsOf(ask({ options: ['Maybe', 'Definitely not'], answer: 'Definitely not' })), {
    predictions: [{ step: 'ask', at: 0, options: ['Maybe', 'Definitely not'], answer: 1, reveal: 'answer', revealAt: 1 }],
    problems: [],
  });
  const byIndex = predictionsOf(ask({ prompt: ' Which? ', options: ['a', 'b', 'c'], answer: 2 }));
  assert.deepEqual(byIndex.problems, []);
  assert.equal(byIndex.predictions[0]!.answer, 2);
  assert.equal(byIndex.predictions[0]!.prompt, 'Which?');
  // A step without predict asks nothing.
  assert.deepEqual(predictionsOf([step('a'), step('b')]), { predictions: [], problems: [] });
});

test('an answer that is not one of the options fails, naming the step and the options', () => {
  const [problem] = predictionsOf(ask({ options: ['Maybe', 'Definitely not'], answer: 'Yes' })).problems;
  assert.match(problem!, /step "ask": meta\.predict has the answer "Yes", which is not one of its options \["Maybe","Definitely not"\]/);
  for (const answer of [2, -1, 0.5, null, undefined, ['Maybe']])
    assert.match(predictionsOf(ask({ options: ['Maybe', 'Definitely not'], answer })).problems[0]!, /not one of its options/, String(answer));
});

test('options must be two to six distinct texts, and only the documented keys are taken', () => {
  for (const options of [[], ['only'], 'Maybe', ['a', ''], ['a', 3], Array.from({ length: PREDICTION_OPTIONS_MAX + 1 }, (_, i) => `o${i}`)])
    assert.match(predictionsOf(ask({ options, answer: 0 })).problems[0]!, /two to 6 options/, JSON.stringify(options));
  assert.match(predictionsOf(ask({ options: ['Maybe', ' maybe '], answer: 0 })).problems[0]!, /same option twice/);
  assert.match(predictionsOf(ask({ options: ['a', 'b'], answer: 0, answers: 1 })).problems[0]!, /has "answers"; its keys are prompt, options, answer, reveal/);
  assert.match(predictionsOf(ask({ options: ['a', 'b'], answer: 0, prompt: 7 })).problems[0]!, /prompt that is not text/);
  for (const bad of ['Maybe', ['a', 'b'], null]) assert.match(predictionsOf(ask(bad)).problems[0]!, /must be \{ options, answer/);
});

test('a later step must reveal it: the next step on the reading path, or a named later one', () => {
  // The last step has nothing after it.
  assert.match(predictionsOf([step('a'), step('last', { predict: { options: ['a', 'b'], answer: 0 } })]).problems[0]!, /no later step to reveal its answer/);
  // By default a story step is revealed by the next story step, skipping detail steps as Next does.
  const skipping = predictionsOf([step('ask', { predict: { options: ['a', 'b'], answer: 0 } }), step('ref', { kind: 'detail' }), step('then')]);
  assert.deepEqual(skipping.predictions.map((p) => [p.reveal, p.revealAt]), [['then', 2]]);
  assert.match(predictionsOf([step('ask', { predict: { options: ['a', 'b'], answer: 0 } }), step('ref', { kind: 'detail' })]).problems[0]!, /no later step/);
  // A named reveal: later, in the scenario, and on the path the question is on.
  const named = predictionsOf(ask({ options: ['a', 'b'], answer: 0, reveal: 'end' }, step('end')));
  assert.deepEqual(named.predictions.map((p) => [p.reveal, p.revealAt]), [['end', 2]]);
  assert.match(predictionsOf(ask({ options: ['a', 'b'], answer: 0, reveal: 'missing' })).problems[0]!, /names reveal "missing", which is not a step of this scenario/);
  assert.match(predictionsOf([step('before'), ...ask({ options: ['a', 'b'], answer: 0, reveal: 'before' })]).problems[0]!, /comes before the question/);
  assert.match(predictionsOf(ask({ options: ['a', 'b'], answer: 0, reveal: 'ask' })).problems[0]!, /comes before the question/);
  assert.match(predictionsOf(ask({ options: ['a', 'b'], answer: 0, reveal: 'ref' }, step('ref', { kind: 'detail' }))).problems[0]!, /a detail step Next never reaches/);
});

test('every prediction of a scenario is checked, and the ones that work are still resolved beside a failing one', () => {
  const steps = [
    step('one', { predict: { options: ['a', 'b'], answer: 'a' } }),
    step('two', { predict: { options: ['a', 'b'], answer: 'c' } }),
    step('three'),
  ];
  const { predictions, problems } = predictionsOf(steps);
  assert.deepEqual(predictions.map((p) => p.step), ['one']);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /^step "two"/);
});

test('the transcript, which a reader without JavaScript reads, asks with the options on the asking step and answers only on the revealing one', async () => {
  const { collectProject } = await import('../tools/lib/explain-project.ts');
  const { buildExplainer } = await import('../tools/lib/explain-build.ts');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = await mkdtemp(join(tmpdir(), 'rayner-predict-'));
  try {
    const { html } = await buildExplainer(await collectProject('test/fixtures/prediction', { write: false }), join(folder, 'prediction.html'));
    // Each scenario's section, each step's item, in order.
    const section = (n: string) => html.match(new RegExp(`<section data-scenario="n=${n}">(.*?)</section>`))![1]!;
    for (const [n, parity, halvings] of [['12', 'Even', '2'], ['7', 'Odd', '0']] as const) {
      const items = [...section(n).matchAll(/<li><(?:a|span)[^>]*>(.*?)<\/(?:a|span)>(.*?)(?=<li><(?:a|span)|<\/ol>)/g)].map((m) => ({ title: m[1], body: m[2]! }));
      assert.deepEqual(items.map((i) => i.title), ['Even or odd?', 'The answer', 'Halving', 'A pause', 'The count']);
      assert.match(items[0]!.body, /<div class="predict-question"><p><strong>Your prediction<\/strong><\/p><ul><li>Even<\/li><li>Odd<\/li><\/ul><\/div>/);
      assert.doesNotMatch(items[0]!.body, /The answer is/);
      assert.match(items[1]!.body, new RegExp(`<p class="predict-answer">The answer is “${parity}”\\.</p>`));
      assert.match(items[2]!.body, new RegExp(`<strong>How many times does ${n} halve before it is odd\\?</strong></p><ul><li>0</li><li>1</li><li>2</li><li>3</li></ul>`));
      assert.doesNotMatch(items[2]!.body + items[3]!.body, /predict-answer/);
      assert.match(items[4]!.body, new RegExp(`<p class="predict-answer"><strong>How many times does ${n} halve before it is odd\\?</strong> The answer is “${halvings}”\\.</p>`));
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

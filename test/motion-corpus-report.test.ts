import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { againstBaseline, type EntryResult, type Found } from '../tools/repo/motion-corpus-lib.ts';
import { recall, runCorpus } from '../tools/repo/motion-corpus.ts';

const observation = (segment: string, path: string, t: number): Found => ({
  scenario: '{}',
  line: `${segment}: flicker: part “title” (${path}) at ${t} s went away and came back`,
});

function result(id: string, findings: Found[] = []): EntryResult {
  return { id, caught: findings.length > 0, findings, fresh: findings, ms: 0 };
}

test('the baseline removes a shifted finding on the same part and retains findings in another transition or part', () => {
  const before = observation('press: open: gate', 'ledger (old)/title', 0.4);
  const shifted = observation('press: open: gate', 'ledger (old)/title', 0.6);
  const elsewhere = observation('press: open: gate', 'panel/title', 0.6);
  const later = observation('step "open", play 2', 'ledger/title', 0.6);
  const baseline = result('base-chapter', [before]);
  const variant = result('variant', [shifted, elsewhere, later]);
  assert.deepEqual(againstBaseline(variant, baseline).fresh, [elsewhere, later]);
  assert.equal(againstBaseline(result('variant', [shifted]), baseline).caught, false);
});

test('a failed baseline or variant preserves its observations and cannot produce a score', () => {
  const entry = CORPUS[0]!;
  const variant = result(entry.id, [observation('send', 'ledger/title', 0.4)]);
  for (const failed of [
    againstBaseline(variant, { ...result('base-chapter'), error: 'font could not load' }),
    againstBaseline(variant, result('base-chapter', [{ scenario: 'during authored replay', line: 'duration guard: machine.send("send"): authored transition lasts 3.000 s' }])),
    againstBaseline({ ...variant, error: 'replay interrupted' }, result('base-chapter')),
  ]) {
    assert.equal(failed.caught, false);
    assert.deepEqual(failed.fresh, []);
    assert.deepEqual(failed.findings, variant.findings);
    assert.throws(() => recall([entry], [failed]), /cannot score corpus/);
  }
});

test('credit for the device poll requires fresh observed occlusion of the company name by that poll in a collect transition', () => {
  const entry = CORPUS.find(e => e.id === 'sign-in-poll-over-card')!;
  assert.ok(entry.expectedFinding);
  const scenario = '{"flow":"device"}';
  const label = '“Example Company” stays readable by opacity but “poll”, an opaque foreground shape, hides 2 glyphs for 0.10 s';
  const story = `step "ask", play 1, event 2: occluded words: part “card” at 0.900 s ${label}; fix: move the foreground`;
  const press = story.replace('step "ask", play 1, event 2', 'after ask, collect');
  const baseline = result('base-chapter', [{ scenario, line: press.replace('“poll”', '“receipt”') }]);
  const matching = [{ scenario, line: story }, { scenario, line: press }];
  const unrelated = [
    { scenario, line: 'duration guard: machine.send("collect"): authored transition lasts 3.000 s' },
    { scenario, line: press.replace('occluded words', 'flicker') },
    { scenario, line: press.replace('after ask, collect', 'after collect, ask') },
    { scenario, line: press.replace('part “card”', 'part “receipt”') },
    { scenario, line: press.replace('“Example Company”', '“another name”') },
    { scenario, line: press.replace('“poll”', '“tag”') + ' “poll”' }, // A suggested fix cannot earn credit.
    { scenario: '{"flow":"direct"}', line: press },
  ];
  const raw = result(entry.id, unrelated);
  assert.equal(recall([entry], [raw]).caught, 0, 'an unrelated rejection cannot inflate the score');
  const missed = againstBaseline(raw, baseline, entry.expectedFinding);
  assert.equal(missed.caught, false);
  assert.deepEqual(missed.fresh, unrelated);
  assert.deepEqual(missed.attributed, []);
  const caught = againstBaseline(result(entry.id, [...unrelated, ...matching]), baseline, entry.expectedFinding);
  assert.deepEqual(caught.attributed, matching);
  assert.equal(recall([entry], [caught]).caught, 1);
  const seen = againstBaseline(result(entry.id, matching), result('base-chapter', matching), entry.expectedFinding);
  assert.equal(recall([entry], [seen]).caught, 0);
});

test('a report counts the requested identities and rejects missing, duplicate or unexpected rows', () => {
  const first = CORPUS[0]!, second = CORPUS.find(e => e.kind !== first.kind)!;
  const missed = result(first.id), caught = result(second.id, [observation('send', 'ledger/title', 0.4)]);
  const score = recall([first, second], [caught, missed]);
  assert.equal(score.caught, 1);
  assert.equal(score.of, 2);
  assert.deepEqual(score.byKind[first.kind], { caught: 0, of: 1 });
  assert.deepEqual(score.byKind[second.kind], { caught: 1, of: 1 });
  for (const invalid of [[missed], [missed, missed], [missed, result('outside-corpus')]])
    assert.throws(() => recall([first, second], invalid), /cannot score corpus/);
  assert.throws(() => recall([first, first], [missed, missed]), /cannot score corpus/);
});

test('the reconstructed people slide earns credit for its observed tag crossing in the reask step', () => {
  const entry = CORPUS.find(e => e.id === 'sign-in-ask-people-slide')!;
  assert.ok(entry.expectedFinding);
  const scenario = '{"flow":"direct"}';
  const line = 'step "reask", play 1, event 1: occluded words: part “page:orders:write:line” at 3.100 s ' +
    '“Exchange items” stays readable by opacity but “tag”, an opaque foreground shape, covers at least 90% of 6 glyph boxes for 0.43 s';
  const match = { scenario, line };
  const unrelated = [
    { scenario, line: line.replace('occluded words', 'jump') },
    { scenario, line: line.replace('“tag”', '“agent:station”') },
    { scenario, line: line.replace('“Exchange items”', '“password”') },
    { scenario, line: line.replace('play 1, event 1', 'play 1, event 2') },
    { scenario, line: line.replace('page:orders:write:line', 'page:hint') },
    { scenario: '{"flow":"device"}', line },
    { scenario, line: 'duration guard: machine.send("ask"): authored transition lasts 4.800 s' },
  ];
  const wrong = result(entry.id, unrelated);
  assert.equal(recall([entry], [wrong]).caught, 0);
  assert.equal(againstBaseline(wrong, result('base-chapter'), entry.expectedFinding).caught, false);
  const caught = againstBaseline(result(entry.id, [...unrelated, match]), result('base-chapter'), entry.expectedFinding);
  assert.deepEqual(caught.attributed, [match]);
  assert.equal(recall([entry], [caught]).caught, 1);
  assert.equal(againstBaseline(caught, result('base-chapter', [match]), entry.expectedFinding).caught, false);
});

test('the fast variant-only run identifies that it omitted comparison scenes', async () => {
  assert.equal((await runCorpus([], { bases: false })).comparison, 'variants-only');
  assert.equal((await runCorpus([])).comparison, 'baseline-subtracted');
  await assert.rejects(runCorpus([], { jobs: 0 }), /jobs must be a positive integer/);
});

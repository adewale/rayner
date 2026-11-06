import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimsReport, checkClaimsMeta, sentences } from '../explain/claims.ts';
import { declaredClaimProblems } from '../tools/lib/explain-check.ts';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const step = (step: string, caption: string, title = '', line = '') => ({ step, meta: { title, line, caption } });

test('all declared phrases in one sentence are stated, including overlapping phrases', () => {
  const claims = ['Every input', 'always yields one output', 'Every input always'].map(says => ({ says, shown: true }));
  const report = claimsReport({ claims }, [step('one', 'Every input always yields one output.')]);
  assert.deepEqual(report.stated, claims.map(c => c.says));
});

test('claim evidence resolves in an external author project and requires a node:test declaration', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-claims-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'tests'));
  const file = join(directory, 'tests/model.test.ts');
  const claim = { says: 'Every input', test: 'tests/model.test.ts: backs the claim' };
  for (const source of [
    '// backs the claim',
    "const name = 'backs the claim';",
    "import test from 'node:test'; test('backs the claim', {});",
    "import test from 'node:test'; test.skip('backs the claim', () => {});",
    "import {test} from 'node:test'; test('backs the claim', {skip: true}, () => {});",
    "import {it} from 'node:test'; it('backs the claim', {todo: 'later'}, () => {});",
    "import {test,describe} from 'node:test'; describe.skip('suite', () => { test('backs the claim', () => {}); });",
    "import {test,suite as group} from 'node:test'; group('suite', {skip:true}, () => { test('backs the claim', () => {}); });",
    "function test() {} test('backs the claim', () => {});",
    "import test from 'node:test'; const x = 'the'; test(`backs ${x} claim`, () => {});",
  ]) {
    await writeFile(file, source);
    assert.match((await declaredClaimProblems([claim], [claim.says], directory)).join(), /there is none/, source);
  }
  for (const source of [
    "import test from 'node:test'; test('model backs the claim', () => {});",
    "import test from 'node:test'; test.only('model backs the claim', () => {});",
    "import {it as check} from 'node:test'; check('model backs the claim', () => {});",
    "import * as tests from 'node:test'; tests.test('model backs the claim', {skip:false}, () => {});",
    "import test from 'node:test'; for (const id of ['fork']) test(`${id}: model backs the claim`, () => {});",
  ]) {
    await writeFile(file, source);
    assert.deepEqual(await declaredClaimProblems([claim], [claim.says], directory), [], source);
  }
});

test('sentences split where one ends and the next begins, and keep decimals and abbreviations whole', () => {
  assert.deepEqual(sentences('London gets 16.4 h. Every place gets 12 h at the equinoxes! Why?'), ['London gets 16.4 h.', 'Every place gets 12 h at the equinoxes!', 'Why?']);
  assert.deepEqual(sentences(''), []);
});

test('a sentence with a scope word is reported, and backed only by a declared claim whose phrase it contains', () => {
  const steps = [
    step('one', 'The machine stays in brewing. No reachable state is in two regions’ states at once, so playing and paused never hold together.'),
    step('two', 'Every new feature doubles the flat machine. Only the drawing changes. All four boxes are drawn.'),
  ];
  const meta = { claims: [{ says: 'playing and paused never hold together', test: 'test/statecharts.test.ts: a region is in at most one state' }] };
  const r = claimsReport(meta, steps);
  assert.deepEqual(
    r.scope.map((s) => [s.step, !!s.backedBy]),
    [['one', true], ['two', false], ['two', false]],
  );
  assert.equal(r.unbacked, 2);
  assert.deepEqual(r.stated, ['playing and paused never hold together']);
  // A sentence that speaks only of its own picture can be marked shown.
  assert.equal(claimsReport({ claims: [...meta.claims, { says: 'only the drawing changes', shown: true }] }, steps).scope.find((s) => s.sentence.startsWith('Only'))?.backedBy, 'shown');
  // Without claims, every scope sentence is unbacked; a sentence without a scope word ("All four boxes") is not reported.
  assert.equal(claimsReport(undefined, steps).unbacked, 3);
  assert.equal(claimsReport(undefined, [step('x', 'The dot moves right.')]).scope.length, 0);
});

test('code names that reach the words are reported once, at the step that first uses them', () => {
  const r = claimsReport(undefined, [
    step('a', 'int() reads field 6, and the edge A->C#0 is unlabelled.', 'Why skipUntil matters'),
    step('b', 'Again int() and decomposition_mapping, then `renderAt`.'),
  ]);
  assert.deepEqual(r.code, [
    { token: 'skipUntil', step: 'a' },
    { token: 'int()', step: 'a' },
    { token: 'A->C#0', step: 'a' },
    { token: 'decomposition_mapping', step: 'b' },
    { token: '`renderAt`', step: 'b' },
  ]);
});

test('claims need a phrase and a test named as "file: part of its name"', () => {
  assert.deepEqual(checkClaimsMeta(undefined), []);
  assert.throws(() => checkClaimsMeta({ claims: 'x' }), /list/);
  assert.throws(() => checkClaimsMeta({ claims: [{ says: '', test: 'test/a.test.ts: b' }] }), /no says/);
  assert.throws(() => checkClaimsMeta({ claims: [{ says: 'x', test: 'somewhere' }] }), /needs test/);
  assert.deepEqual(checkClaimsMeta({ claims: [{ says: 'every round in the strip', shown: true }] }), [{ says: 'every round in the strip', shown: true }]);
});

test('check fails a declared claim no scenario states, or one whose test is not there', async () => {
  const real = { says: 'never hold together', test: 'test/statecharts.test.ts: a region is in at most one state' };
  assert.deepEqual(await declaredClaimProblems([real], ['never hold together']), []);
  assert.match((await declaredClaimProblems([real], []))[0]!, /no step states/);
  assert.match((await declaredClaimProblems([{ ...real, test: 'test/none.test.ts: x' }], [real.says])).join(), /not there/);
  assert.match((await declaredClaimProblems([{ ...real, test: 'test/statecharts.test.ts: no such test' }], [real.says])).join(), /there is none/);
  assert.deepEqual(await declaredClaimProblems([{ says: 'every round', shown: true }], ['every round']), []);
  // A test beside the scene is named from its folder; one from where check runs still resolves there.
  const folder = 'scenes/explainers/state-machine';
  const beside = { says: 'closed rejects', test: 'model.test.ts: both session histories come from the reducer' };
  assert.deepEqual(await declaredClaimProblems([beside], [beside.says], process.cwd(), folder), []);
  assert.match((await declaredClaimProblems([beside], [beside.says])).join(), /not there/, 'without the folder, model.test.ts is looked for where check runs');
  assert.deepEqual(await declaredClaimProblems([{ ...beside, test: `${folder}/model.test.ts: both session histories` }], [beside.says], process.cwd(), folder), []);
});

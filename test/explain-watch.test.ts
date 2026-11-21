// meta.watch: the state an author names for readers, and what each step changed of it
// (player-guidance G1). One formatter serves the player, the transcript, describe
// and check; these tests hold it to independently written expectations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fc, params } from './lib/pbt.ts';
import type { ExplainerMeta } from '../explain/settings.ts';
const modelWatch = (fields: Record<string, string>): NonNullable<ExplainerMeta['watch']> => Object.entries(fields).map(([key, label]) => ({ source: 'model', key, label }));
import { checkWatch, watchedReadings, watchedValue } from '../explain/trace.ts';
import { writeNumber } from '../explain/words.ts';
import { chromeFor, watchText } from '../app/embed-strings.ts';
import { describeExplainer } from '../explain/testing.ts';
import { playerTrace } from '../app/embed-trace.ts';
import type { ExplainerClass } from '../explain/index.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';
import { checkProject } from '../tools/lib/explain-check.ts';
import TokenBucket from '../scenes/explainers/token-bucket/scene.ts';

const NB = ' ';
let folder: string;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'rayner-watch-'));
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});

test('a watched value reads as a reader reads it: every kind of value, in English and French', () => {
  // Numbers: at most two decimals, grouped as the language groups them.
  assert.equal(watchedValue(5), '5');
  assert.equal(watchedValue(0), '0');
  assert.equal(watchedValue(1.236), '1.24');
  assert.equal(watchedValue(-3.5), '-3.5');
  assert.equal(watchedValue(1234.5678), '1,234.57');
  assert.equal(watchedValue(1234.5678, 'fr'), `1${NB}234,57`);
  assert.equal(watchedValue(65673.88, 'fr'), `65${NB}673,88`);
  assert.equal(watchedValue(2.5, 'fr'), '2,5');
  // A language with no description words here, or no language at all, gets its number as English writes it.
  assert.equal(watchedValue(1234.5, 'not a tag!'), '1,234.5');
  assert.equal(watchedValue(1234.5, 'de'), '1,234.5');
  assert.equal(watchedValue(-0.001), '0', 'a value that rounds to zero has no sign');
  assert.equal(watchedValue(1.005), '1.01', 'rounded on the shortest decimal form, as written');
  assert.equal(watchedValue(9.999), '10');
  assert.equal(watchedValue(2.5e-7), '0');
  assert.equal(watchedValue(1e21), '1,000,000,000,000,000,000,000');
  // Strings: as written up to 24 characters; longer ones end in an ellipsis at 24.
  assert.equal(watchedValue('every request'), 'every request');
  assert.equal(watchedValue('x'.repeat(24)), 'x'.repeat(24));
  assert.equal(watchedValue('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnopqrstuvw…');
  assert.equal([...watchedValue('abcdefghijklmnopqrstuvwxyz')!].length, 24);
  // Cut by character, never inside one: 30 emoji keep 23 whole ones.
  assert.equal(watchedValue('😀'.repeat(30)), '😀'.repeat(23) + '…');
  assert.equal(watchedValue(''), '');
  // Booleans: the language's yes and no, the chrome's words.
  assert.equal(watchedValue(true), 'yes');
  assert.equal(watchedValue(false), 'no');
  assert.equal(watchedValue(true, 'fr'), 'oui');
  assert.equal(watchedValue(false, 'fr-CA'), 'non');
  assert.deepEqual([chromeFor('en').yes, chromeFor('en').no, chromeFor('fr').yes, chromeFor('fr').no], ['yes', 'no', 'oui', 'non']);
  // Lists of numbers, strings or booleans: each item as above, at most four, then how many more.
  assert.equal(watchedValue(['R6', 'R7', 'R9']), 'R6, R7, R9');
  assert.equal(watchedValue([1.5, 2, 3, 4]), '1.5, 2, 3, 4');
  assert.equal(watchedValue([1, 2, 3, 4, 5, 6]), '1, 2, 3, 4 +2');
  assert.equal(watchedValue([true, 'a', 1000.123]), 'yes, a, 1,000.12');
  assert.equal(watchedValue([1000.5, false], 'fr'), `1${NB}000,5, non`);
  // No value: null, undefined, and an empty list read as nothing.
  for (const v of [null, undefined, []]) assert.equal(watchedValue(v), '', JSON.stringify(v));
  // Anything else cannot be said briefly: null, and the key is skipped.
  for (const v of [{ a: 1 }, [{ a: 1 }], [[1]], [1, null], {}, [undefined]]) assert.equal(watchedValue(v), null, JSON.stringify(v));
});

test('writeNumber writes numbers as Intl does in Node for English and French, but from the repository\'s own table, the same in every engine', () => {
  // Intl here is the oracle for the table; the browser's Intl, which writes French groups with
  // another space in some engines, never runs, so a page and its transcript agree.
  const number = fc.oneof(
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.integer({ min: -1e9, max: 1e9 }).map((k) => k / 1000),
    fc.integer({ min: -1e7, max: 1e7 }).map((k) => k / 200),
    fc.integer().map((k) => k * 1e12),
  );
  fc.assert(fc.property(number, fc.constantFrom('en', 'fr'), fc.nat({ max: 20 }), (n, lang, digits) => {
    const intl = new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);
    // Intl writes "-0" for a negative value that rounds to zero; the repository writes "0".
    assert.equal(writeNumber(n, lang, digits), intl === '-0' ? '0' : intl, `${n} in ${lang} with ${digits} decimals`);
  }), params(2000));
  assert.equal(writeNumber(1791.5, 'fr'), `1${NB}791,5`);
  assert.equal(writeNumber(1791.5, 'fr-CA'), `1${NB}791,5`);
  assert.equal(writeNumber(Infinity), 'Infinity');
});

test('a list of any length reads as at most four items, then the count of the rest', () => {
  const item = fc.oneof(fc.integer({ min: -1000, max: 1000 }), fc.constantFrom('a', 'b', 'R6'), fc.boolean());
  fc.assert(
    fc.property(fc.array(item, { maxLength: 12 }), (items) => {
      const said = watchedValue(items)!;
      if (!items.length) return said === '';
      const shown = items.slice(0, 4).map((v) => watchedValue(v)).join(', ');
      return said === (items.length > 4 ? `${shown} +${items.length - 4}` : shown);
    }),
    params(300),
  );
});

test('watchedReadings: keys whose JSON changed, in declaration order, at most four, with appear, change and removal', () => {
  const watch = [{ source: 'model', key: "a", label: 'A' }, { source: 'model', key: "b", label: '  B  ' }, { source: 'model', key: "c", label: 'C' }, { source: 'model', key: "d", label: 'D' }, { source: 'model', key: "e", label: 'E' }, { source: 'model', key: "f", label: 'F' }] as const;
  // Declaration order, not the state's: f first in the state, last in `watch`.
  const step = { before: { f: 1, a: 1, b: 'x', c: true }, after: { f: 2, a: 2, c: false, d: [1, 2], e: 9 } };
  assert.deepEqual(watchedReadings(step, watch), [
    { kind: 'change', label: 'A', before: '1', after: '2' },
    // A key that disappears has no after; its label is trimmed.
    { kind: 'change', label: 'B', before: 'x' },
    { kind: 'change', label: 'C', before: 'yes', after: 'no' },
    // A key that appears has no before.
    { kind: 'change', label: 'D', after: '1, 2' },
  ]);
  assert.deepEqual(watchedReadings(step, watch, 'fr')[2], { kind: 'change', label: 'C', before: 'oui', after: 'non' });
  // Unchanged values, unwatched keys and a scene with no watch show nothing.
  assert.deepEqual(watchedReadings({ before: { a: 1, z: 1 }, after: { a: 1, z: 2 } }, modelWatch({ a: 'A' })), []);
  assert.deepEqual(watchedReadings(step, undefined), []);
  assert.deepEqual(watchedReadings({ before: { a: 1 }, after: {} }, modelWatch({ a: 'A' })), [{ kind: 'change', label: 'A', before: '1' }]);
  // Values that read the same are no change to a reader; nor is null to absent or [] to absent.
  assert.deepEqual(watchedReadings({ before: { a: 0.001, b: null, c: [] }, after: { a: 0.002 } }, modelWatch({ a: 'A', b: 'B', c: 'C' })), []);
  // An object is skipped and reported; the others still show.
  const unformatted: string[] = [];
  assert.deepEqual(watchedReadings({ before: { o: { x: 1 }, n: 1 }, after: { o: { x: 2 }, n: 2 } }, modelWatch({ o: 'O', n: 'N' }), 'en', unformatted), [
    { kind: 'change', label: 'N', before: '1', after: '2' },
  ]);
  assert.deepEqual(unformatted, ['model.o']);
  // An object whose keys were written in another order is unchanged: not a change, not unformatted.
  const reordered: string[] = [];
  assert.deepEqual(watchedReadings({ before: { o: { x: 1, y: 2 } }, after: { o: { y: 2, x: 1 } } }, modelWatch({ o: 'O' }), 'en', reordered), []);
  assert.deepEqual(reordered, []);
});

test('a change reads "Label: before → after", "Label: after" or "Label: removed", with French typography in French', () => {
  const en = chromeFor('en'),
    fr = chromeFor('fr');
  assert.equal(watchText(en, { kind: 'change', label: 'Tokens', before: '5', after: '0' }), 'Tokens: 5 → 0');
  assert.equal(watchText(en, { kind: 'change', label: 'Tokens', after: '5' }), 'Tokens: 5');
  assert.equal(watchText(en, { kind: 'change', label: 'Tokens', before: '5' }), 'Tokens: removed');
  assert.equal(watchText(fr, { kind: 'change', label: 'Parts', before: '2', after: '2,5' }), `Parts${NB}: 2 → 2,5`);
  assert.equal(watchText(fr, { kind: 'change', label: 'Parts', before: '2' }), `Parts${NB}: supprimé`);
  assert.equal(en.changes('Tokens: 5 → 0', 'Allowed: 0 → 5'), 'What changed: Tokens: 5 → 0; Allowed: 0 → 5');
  assert.equal(fr.changes(`Parts${NB}: 2`, `Quotient${NB}: 1`), `Ce qui a changé${NB}: Parts${NB}: 2${NB}; Quotient${NB}: 1`);
  assert.deepEqual([en.changed, fr.changed], ['What changed', 'Ce qui a changé']);
});

test('checkWatch validates sources, literal keys, unique reader labels, limits and own-property presence', () => {
  const scenarios = [[{ before: {}, after: { tokens: 5 } }, { before: { tokens: 5 }, after: { tokens: 0, gone: 1 } }]];
  checkWatch(undefined, scenarios);
  checkWatch(modelWatch({ initial: 'Initial' }), [[{ before: { initial: 1 }, after: {}, state: {} }]]);
  assert.throws(() => checkWatch(modelWatch({ specimen: 'Specimen' }), [[{ before: {}, after: {}, state: { specimen: 1 } }]]), /model\."specimen".*never present/);
  checkWatch(modelWatch({ tokens: 'Tokens', gone: 'Gone' }), scenarios);
  assert.throws(() => checkWatch(modelWatch({ nope: 'Nope' }), scenarios), /model\."nope".*never present/);
  assert.throws(() => checkWatch(modelWatch({ tokens: '   ' }), scenarios), /model\."tokens" an empty label/);
  assert.throws(() => checkWatch([{ source: 'model', key: 'tokens', label: 5 }], scenarios), /an empty label/);
  assert.throws(() => checkWatch(modelWatch({ '': 'Empty' }), scenarios), /an empty key/);
  assert.throws(() => checkWatch(['tokens'], scenarios), /only source, key and label/);
  assert.throws(() => checkWatch('tokens', scenarios), /ordered list/);
  assert.throws(() => checkWatch({ tokens: 'Tokens' }, scenarios), /ordered list/);
  assert.throws(() => checkWatch([{ source: 'bogus', key: 'tokens', label: 'Tokens' }], scenarios), /source must be/);
  assert.throws(() => checkWatch([Object.create({ source: 'model', key: 'tokens', label: 'Tokens' })], scenarios), /only source, key and label/);
  assert.throws(() => checkWatch([...modelWatch({ tokens: 'Tokens' }), ...modelWatch({ tokens: 'Again' })], scenarios), /selects.*twice/);
  assert.throws(() => checkWatch(modelWatch({ tokens: 'Same', gone: ' Same ' }), scenarios), /labels must distinguish/);
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, `K${i}`]));
  assert.throws(() => checkWatch(modelWatch(nine), [[{ before: {}, after: nine }]]), /names 9 keys; name at most 8/);
  const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, `K${i}`]));
  checkWatch(modelWatch(eight), [[{ before: {}, after: eight }]]);
});

// A two-scenario scene whose state differs by scenario: `only` exists only in the "b" scenario.
const scene = (watch: string) =>
  `import{Scene,Text}from'rayner';import{stage,settingsOf}from'rayner/explain';export default class W extends Scene{static meta={id:'watch',title:'Watch',watch:${watch}};static settings=[{id:'c',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];async construct(){const s=stage(this);await this.step('one',{title:'One',caption:'One.'});await s.enter(new Text('one'));this.state.count=1;this.state.box={x:1};await this.step('two',{title:'Two',caption:'Two.'});await s.enter(new Text('two').moveTo([0,-1]));this.state.count=2;this.state.box={x:2};if(settingsOf(this).c==='b')this.state.only=true;}}`;
async function collect(name: string, watch: string) {
  const file = join(folder, name + '.ts');
  await writeFile(file, scene(watch));
  return collectProject(file, { write: false });
}

test('collection refuses an unknown watched key, naming it, and accepts a key present in only one scenario', async () => {
  await assert.rejects(collect('unknown', `[{source:'model',key:'count',label:'Count'},{source:'model',key:'missing',label:'Missing'}]`), /meta\.watch: it names model\."missing", which is never present at any step of any scenario/);
  await assert.rejects(collect('blank', `[{source:'model',key:'count',label:' '}]`), /meta\.watch: it gives model\."count" an empty label/);
  const p = await collect('ok', `[{source:'model',key:'count',label:'Count'},{source:'model',key:'only',label:'Only'}]`);
  assert.deepEqual(p.Scene.meta?.watch, modelWatch({ count: 'Count', only: 'Only' }));
});

test('collection accepts a watched model key beside consecutive staged specimens', async () => {
  const file = join(folder, 'hidden.ts');
  await writeFile(file, `import { Scene, Text } from 'rayner';
import { stage } from 'rayner/explain';
export default class Hidden extends Scene {
  static meta = { watch:[{source:'model',key:'completed',label:'Completed'}] };
  async construct() {
    this.onStepEnd(() => { this.state.completed = true; });
    await stage(this).steps(['one', 'two'].map((id, count) => ({
      id, title: id, line: 'A count.', caption: 'A local count.',
      state: { count }, draw: st => new Text(String(st.count)),
    })));
  }
}`);
  const project = await collectProject(file, { write: false });
  assert.equal(project.scenarios[0]!.trace.steps[0]!.after.completed, true);
});

test('the transcript says what each step changed after its caption, and check reports changes and unformatted keys', async () => {
  const p = await collect('report', `[{source:'model',key:'count',label:'Count'},{source:'model',key:'box',label:'Box'},{source:'model',key:'only',label:'Only'}]`);
  const { html } = await buildExplainer(p, join(folder, 'report.html'));
  assert.ok(html.includes('<p>One.</p><p>What changed: Count: 1</p>'), 'step one');
  assert.ok(html.includes('<p>Two.</p><p>What changed: Count: 1 → 2</p>'), 'step two, scenario a');
  assert.ok(html.includes('<p>Two.</p><p>What changed: Count: 1 → 2; Only: yes</p>'), 'step two, scenario b');
  const report = (await checkProject(p, join(folder, 'report-check'))) as { scenarios: { settings: Record<string, string>; watch: unknown }[] };
  const b = report.scenarios.find((v) => v.settings.c === 'b')!;
  assert.deepEqual(b.watch, [
    { step: 'one', changes: [{ kind: 'change', label: 'Count', after: '1' }], unformatted: ['model.box'] },
    { step: 'two', changes: [{ kind: 'change', label: 'Count', before: '1', after: '2' }, { kind: 'change', label: 'Only', after: 'yes' }], unformatted: ['model.box'] },
  ]);
  assert.deepEqual(JSON.parse(await readFile(join(folder, 'report-check', 'report.json'), 'utf8')).scenarios[1].watch, b.watch);
});

test('a scene without watch has no "What changed" in its transcript and no watch in its check report', async () => {
  const file = join(folder, 'none.ts');
  await writeFile(file, scene('undefined').replace(',watch:undefined', ''));
  const p = await collectProject(file, { write: false });
  const { html } = await buildExplainer(p, join(folder, 'none.html'));
  // The bundle carries the words; the transcript has no such line.
  assert.ok(!html.includes('<p>What changed'));
  const report = (await checkProject(p, join(folder, 'none-check'))) as { scenarios: Record<string, unknown>[] };
  assert.ok(report.scenarios.every((v) => !('watch' in v)));
  const d = await describeExplainer(p.Scene, { drawings: false });
  assert.ok(d.scenarios.every((c) => c.steps.every((s) => !('watched' in s))));
});

test('token-bucket\'s burst step: Tokens left 5 → 0, Accepted 0 → 5 and Rejected R6, in describe and the transcript', async () => {
  const d = await describeExplainer(TokenBucket as ExplainerClass, { drawings: false });
  assert.equal(d.schema, 1);
  for (const c of d.scenarios) {
    const burst = c.steps.find((s) => s.step === 'burst')!;
    assert.deepEqual(burst.watched, [
      { kind: 'change', label: 'Tokens left', before: '5', after: '0' },
      { kind: 'change', label: 'Accepted', before: '0', after: '5' },
      { kind: 'change', label: 'Rejected', after: 'R6' },
    ], JSON.stringify(c.values));
    // Every step says it, from the same function: the last step changes nothing watched.
    assert.deepEqual(c.steps.at(-1)!.watched, []);
    assert.deepEqual(c.steps[0]!.watched, [], 'the initialized model does not appear as a change in the first step');
  }
  const p = await collectProject('scenes/explainers/token-bucket', { write: false });
  const { html } = await buildExplainer(p, join(folder, 'token-bucket.html'));
  const said = [...html.matchAll(/<p>(What changed: [^<]*)<\/p>/g)].map((m) => m[1]);
  // Three steps of each scenario change watched values; initialization precedes frame zero.
  assert.equal(said.length, 9);
  assert.equal(said.filter((s) => s === 'What changed: Tokens left: 5 → 0; Accepted: 0 → 5; Rejected: R6').length, 3);
});


test('model watches agree in describe, player, transcript and check beside a conflicting local specimen', async () => {
  const file = join(folder, 'mixed.ts');
  await writeFile(file, `import { Scene, Text } from 'rayner';
import { stage } from 'rayner/explain';
export default class Mixed extends Scene {
  static meta = { watch:[{source:'model',key:'count',label:'Requests accepted'}] };
  state = { count: 7 };
  async construct() {
    const s = stage(this);
    await s.steps([{ id: 'example', title: 'An example', line: 'Local count.', caption: 'A local specimen.',
      state: { count: 100 }, draw: st => new Text(String(st.count)) }]);
    await this.step('model', { title: 'The model changes', caption: 'One more request is accepted.' });
    this.state.count++;
    await s.enter(new Text('Accepted ' + this.state.count).moveTo([0, -1]));
  }
}`);
  const project = await collectProject(file, { write: false });
  const trace = project.scenarios[0]!.trace;
  const expected = [[], [{ kind: 'change', label: 'Requests accepted', before: '7', after: '8' }]];
  const description = (await describeExplainer(project.Scene)).scenarios[0]!;
  assert.deepEqual(description.steps.map(s => s.watched), expected);
  assert.deepEqual(trace.steps.map(s => [s.before.count, s.after.count]), [[7, 7], [7, 8]]);
  assert.deepEqual(description.steps.map(s => s.state.count), [100, 8], 'describe keeps its explicit specimen projection');
  const player = playerTrace(trace, project.Scene.meta?.watch);
  assert.deepEqual(player.steps.map(s => (s.watched ?? [])), expected);
  const { html } = await buildExplainer(project, join(folder, 'mixed.html'));
  assert.ok(html.includes('<p>What changed: Requests accepted: 7 → 8</p>'));
  assert.ok(!html.includes('<p>What changed: Requests accepted: removed</p>'));
  const report = await checkProject(project, join(folder, 'mixed-check')) as { scenarios: { watch: { changes: unknown }[] }[] };
  assert.deepEqual(report.scenarios[0]!.watch.map(s => s.changes), expected);
});


test('watched JSON names never read inherited object members on appearance or removal', () => {
  for (const key of ['constructor', 'toString', 'valueOf', '__proto__']) {
    const value = Object.fromEntries([[key, 'ready']]);
    const watch = Object.fromEntries([[key, 'Value']]);
    assert.deepEqual(watchedReadings({ before: {}, after: value }, modelWatch(watch)), [{ kind: 'change', label: 'Value', after: 'ready' }]);
    assert.deepEqual(watchedReadings({ before: value, after: {} }, modelWatch(watch)), [{ kind: 'change', label: 'Value', before: 'ready' }]);
  }
});

test('qualified watches preserve four owners of the same key and never invent specimen transitions', () => {
  const watch = [
    { source: 'model', key: 'tokens', label: 'Accepted' },
    { source: 'local', key: 'tokens', label: 'Specimen' },
    { source: 'shown', key: 'tokens', label: 'Highlighted' },
    { source: 'derived', key: 'tokens', label: 'Measured' },
  ] as const;
  const first = { before: { tokens: 7 }, after: { tokens: 8 }, state: { tokens: 100 }, shown: { tokens: false }, derived: { tokens: ['R1'] } };
  checkWatch(watch, [[first]]);
  assert.deepEqual(watchedReadings(first, watch), [
    { kind: 'change', label: 'Accepted', before: '7', after: '8' },
    { kind: 'value', label: 'Specimen', value: '100' },
    { kind: 'value', label: 'Highlighted', value: 'no' },
    { kind: 'value', label: 'Measured', value: 'R1' },
  ]);
  const next = { before: { tokens: 8 }, after: { tokens: 8 }, state: { tokens: 200 } };
  assert.deepEqual(watchedReadings(next, watch), [{ kind: 'value', label: 'Specimen', value: '200' }]);
  assert.deepEqual(watchedReadings({ before: { tokens: 8 }, after: { tokens: 9 } }, watch), [
    { kind: 'change', label: 'Accepted', before: '8', after: '9' },
  ], 'leaving a specimen does not remove a persistent model value or fabricate a specimen delta');
});

test('qualified selection uses literal own keys, respects one display cap, and names unformatted owners', () => {
  const inherited = Object.create({ field: 'inherited' }) as Record<string, unknown>;
  const step = { before: {}, after: { field: 'model', 'a.b': 3, a: { b: 9 } }, state: inherited,
    shown: { empty: null, flag: true }, derived: { blob: { many: 'diagnostics' } } };
  const watch = [
    { source: 'local', key: 'field', label: 'Local' },
    { source: 'derived', key: 'blob', label: 'Details' },
    { source: 'model', key: 'a.b', label: 'Literal' },
    { source: 'shown', key: 'empty', label: 'Empty' },
    { source: 'shown', key: 'flag', label: 'Flag' },
  ] as const;
  const skipped: string[] = [];
  assert.deepEqual(watchedReadings(step, watch, 'fr', skipped), [
    { kind: 'change', label: 'Literal', after: '3' },
    { kind: 'value', label: 'Empty', value: '—' },
    { kind: 'value', label: 'Flag', value: 'oui' },
  ]);
  assert.deepEqual(skipped, ['derived.blob']);
  for (const key of ['constructor', '__proto__', 'toString']) {
    const own = Object.fromEntries([[key, 0]]);
    assert.deepEqual(watchedReadings({ before: {}, after: {}, shown: own }, [{ source: 'shown', key, label: 'Own value' }]), [{ kind: 'value', label: 'Own value', value: '0' }]);
    assert.deepEqual(watchedReadings({ before: {}, after: {}, shown: {} }, [{ source: 'shown', key, label: 'Own value' }]), []);
  }
});

test('qualified watch projection keeps independently generated same-key values in their owners', () => {
  const watch = [
    { source: 'model', key: 'n', label: 'Model' }, { source: 'local', key: 'n', label: 'Local' },
    { source: 'shown', key: 'n', label: 'Shown' }, { source: 'derived', key: 'n', label: 'Derived' },
  ] as const;
  fc.assert(fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer(), fc.boolean(), fc.string({ maxLength: 20 }), (model, local, shown, derived) => {
    const rows = watchedReadings({ before: { n: model }, after: { n: model + 1 }, state: { n: local }, shown: { n: shown }, derived: { n: derived } }, watch);
    assert.deepEqual(rows, [
      { kind: 'change', label: 'Model', before: writeNumber(model, 'en', 2), after: writeNumber(model + 1, 'en', 2) },
      { kind: 'value', label: 'Local', value: writeNumber(local, 'en', 2) },
      { kind: 'value', label: 'Shown', value: shown ? 'yes' : 'no' },
      { kind: 'value', label: 'Derived', value: derived || '—' },
    ]);
  }), params(300));
});

test('mixed readouts use a neutral localized heading and ship only selected formatted values', async () => {
  const file = join(folder, 'qualified.ts');
  await writeFile(file, `import {Scene,Text} from 'rayner';import {stage} from 'rayner/explain';
export default class Qualified extends Scene {
 state={n:7};shown={n:false};static meta={lang:'fr',watch:[{source:'model',key:'n',label:'Modèle'},{source:'local',key:'n',label:'Exemple'},{source:'shown',key:'n',label:'Surligné'},{source:'derived',key:'n',label:'Mesuré'}]};
 async construct(){const s=stage(this);this.addJson(()=>({n:42,privateNotes:'never ship'}));await s.steps([{id:'one',title:'Un exemple',line:'Un compteur.',caption:'Un exemple distinct.',state:{n:100},draw:st=>new Text(String(st.n))}]);this.state.n=8;}
}`);
  const p = await collectProject(file, { write: false }), step = p.scenarios[0]!.trace.steps[0]!;
  const expected = [
    {kind:'change',label:'Modèle',before:'7',after:'8'}, {kind:'value',label:'Exemple',value:'100'},
    {kind:'value',label:'Surligné',value:'non'}, {kind:'value',label:'Mesuré',value:'42'},
  ];
  const description = (await describeExplainer(p.Scene)).scenarios[0]!.steps[0]!;
  assert.deepEqual(description.watched, expected);
  const page = playerTrace(p.scenarios[0]!.trace, p.Scene.meta?.watch, 'fr');
  assert.deepEqual(page.steps[0]!.watched, expected);
  assert.ok(!JSON.stringify(page).includes('privateNotes'));
  for (const key of ['before','after','state','shown']) assert.ok(!Object.hasOwn(page.steps[0]!, key));
  assert.deepEqual(watchedReadings(step, p.Scene.meta?.watch, 'fr'), expected);
  const { html } = await buildExplainer(p, join(folder, 'qualified.html'));
  assert.ok(html.includes('À cette étape'), 'current observations do not claim every row changed');
  const report = await checkProject(p, join(folder,'qualified-check')) as {scenarios:{watch:{changes:unknown}[]}[]};
  assert.deepEqual(report.scenarios[0]!.watch[0]!.changes, expected);
});

test('direct public description rejects arbitrary source channels even for an empty scene', async () => {
  const { Scene } = await import('../src/index.ts');
  let constructed = false;
  class Invalid extends Scene {
    static meta = { watch: [{ source: 'meta', key: 'privateTeachingNote', label: 'Readout' }] };
    override async construct() { constructed = true; await this.step('one', { privateTeachingNote: 'not a source' }); }
  }
  await assert.rejects(describeExplainer(Invalid as unknown as ExplainerClass), /source must be model, local, shown or derived/);
  assert.equal(constructed, false);
  class Empty extends Scene { static meta = Invalid.meta; }
  await assert.rejects(describeExplainer(Empty as unknown as ExplainerClass), /source must be model, local, shown or derived/);
  assert.throws(() => watchedReadings({before:{},after:{},meta:{privateTeachingNote:'not a source'}} as never,
    Invalid.meta.watch as never), /source must be model, local, shown or derived/);
});

test('an empty kept log resets on its first event and matches a fresh start-origin replay and readouts', async () => {
  const { Scene } = await import('../src/index.ts');
  const { stage, view, Machine, refuse } = await import('../explain/index.ts');
  const { card } = await import('../explain/drawing.ts');
  const { traceRun } = await import('../src/trace.ts');
  const { runLive, liveSteps } = await import('../explain/live.ts');
  class Finished extends Scene {
    override state = { n: 2 };
    static meta = { watch: [{source:'model',key:'n',label:'Number'},{source:'derived',key:'doubled',label:'Doubled'}] } as const;
    override async construct() {
      const s = stage(this), drawing = s.drawing;
      this.addJson(() => ({doubled:this.state.n*2}));
      await this.step('finished', {caption:'The counter reached two.'});
      const picture = view(this, st => card(drawing, [['Number',st.n]], {size:.65}));
      const machine = new Machine(this, {start:{n:0},events:['up'],next: st => st.n<2?{n:st.n+1}:refuse('finished'),views:[picture],runTime:.08});
      await s.enter(picture); machine.offer();
    }
  }
  const {scene} = await traceRun(Finished), place = liveSteps(scene).get('finished')!;
  const kept = await runLive(Finished,'finished',place,[],{from:'start',keep:true});
  try {
    assert.deepEqual(kept.scene.state,{n:2},'an empty log retains the historic resting picture');
    const one = await kept.session!.send('up');
    const fresh = await runLive(Finished,'finished',place,['up'],{from:'start'});
    assert.deepEqual(one.scene.state,{n:1});
    assert.deepEqual(one.scene.state,fresh.scene.state);
    assert.deepEqual(one.watched,[{kind:'change',label:'Number',before:'0',after:'1'},{kind:'value',label:'Doubled',value:'2'}]);
    assert.deepEqual(one.watched,fresh.watched);
    const two = await kept.session!.send('up');
    const replay = await runLive(Finished,'finished',place,['up','up'],{from:'start'});
    assert.deepEqual(two.scene.state,replay.scene.state);
    assert.deepEqual(two.watched,replay.watched);
  } finally {kept.session!.close();}
});

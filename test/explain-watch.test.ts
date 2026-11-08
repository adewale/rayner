// meta.watch: the state an author names for readers, and what each step changed of it
// (player-guidance G1). One formatter serves the player, the transcript, describe
// and check; these tests hold it to independently written expectations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fc, params } from './lib/pbt.ts';
import { checkWatch, watchedChanges, watchedValue } from '../explain/trace.ts';
import { chromeFor, changeText } from '../app/embed-strings.ts';
import { describeExplainer } from '../explain/testing.ts';
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
  // A tag Intl refuses still gets its number, as English writes it.
  assert.equal(watchedValue(1234.5, 'not a tag!'), '1,234.5');
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

test('watchedChanges: keys whose JSON changed, in declaration order, at most four, with appear, change and removal', () => {
  const watch = { a: 'A', b: '  B  ', c: 'C', d: 'D', e: 'E', f: 'F' };
  // Declaration order, not the state's: f first in the state, last in `watch`.
  const step = { before: { f: 1, a: 1, b: 'x', c: true }, after: { f: 2, a: 2, c: false, d: [1, 2], e: 9 } };
  assert.deepEqual(watchedChanges(step, watch), [
    { label: 'A', before: '1', after: '2' },
    // A key that disappears has no after; its label is trimmed.
    { label: 'B', before: 'x' },
    { label: 'C', before: 'yes', after: 'no' },
    // A key that appears has no before.
    { label: 'D', after: '1, 2' },
  ]);
  assert.deepEqual(watchedChanges(step, watch, 'fr')[2], { label: 'C', before: 'oui', after: 'non' });
  // Unchanged values, unwatched keys and a scene with no watch show nothing.
  assert.deepEqual(watchedChanges({ before: { a: 1, z: 1 }, after: { a: 1, z: 2 } }, { a: 'A' }), []);
  assert.deepEqual(watchedChanges(step, undefined), []);
  assert.deepEqual(watchedChanges({ before: { a: 1 } }, { a: 'A' }), [{ label: 'A', before: '1' }]);
  // Values that read the same are no change to a reader; nor is null to absent or [] to absent.
  assert.deepEqual(watchedChanges({ before: { a: 0.001, b: null, c: [] }, after: { a: 0.002 } }, { a: 'A', b: 'B', c: 'C' }), []);
  // An object is skipped and reported; the others still show.
  const unformatted: string[] = [];
  assert.deepEqual(watchedChanges({ before: { o: { x: 1 }, n: 1 }, after: { o: { x: 2 }, n: 2 } }, { o: 'O', n: 'N' }, 'en', unformatted), [
    { label: 'N', before: '1', after: '2' },
  ]);
  assert.deepEqual(unformatted, ['o']);
  // An object whose keys were written in another order is unchanged: not a change, not unformatted.
  const reordered: string[] = [];
  assert.deepEqual(watchedChanges({ before: { o: { x: 1, y: 2 } }, after: { o: { y: 2, x: 1 } } }, { o: 'O' }, 'en', reordered), []);
  assert.deepEqual(reordered, []);
});

test('a change reads "Label: before → after", "Label: after" or "Label: removed", with French typography in French', () => {
  const en = chromeFor('en'),
    fr = chromeFor('fr');
  assert.equal(changeText(en, { label: 'Tokens', before: '5', after: '0' }), 'Tokens: 5 → 0');
  assert.equal(changeText(en, { label: 'Tokens', after: '5' }), 'Tokens: 5');
  assert.equal(changeText(en, { label: 'Tokens', before: '5' }), 'Tokens: removed');
  assert.equal(changeText(fr, { label: 'Parts', before: '2', after: '2,5' }), `Parts${NB}: 2 → 2,5`);
  assert.equal(changeText(fr, { label: 'Parts', before: '2' }), `Parts${NB}: supprimé`);
  assert.equal(en.changes('Tokens: 5 → 0', 'Allowed: 0 → 5'), 'What changed: Tokens: 5 → 0; Allowed: 0 → 5');
  assert.equal(fr.changes(`Parts${NB}: 2`, `Quotient${NB}: 1`), `Ce qui a changé${NB}: Parts${NB}: 2${NB}; Quotient${NB}: 1`);
  assert.deepEqual([en.changed, fr.changed], ['What changed', 'Ce qui a changé']);
});

test('checkWatch refuses a watch that cannot work and names the problem', () => {
  const steps = [{ before: {}, after: { tokens: 5 } }, { before: { tokens: 5 }, after: { tokens: 0, gone: 1 } }];
  checkWatch(undefined, steps);
  checkWatch({ tokens: 'Tokens', gone: 'Gone' }, steps);
  assert.throws(() => checkWatch({ nope: 'Nope' }, steps), /meta\.watch: it names "nope", which is never in the scene's state/);
  assert.throws(() => checkWatch({ tokens: '   ' }, steps), /meta\.watch: it gives "tokens" an empty label/);
  assert.throws(() => checkWatch({ tokens: 5 }, steps), /an empty label/);
  assert.throws(() => checkWatch({ '': 'Empty' }, steps), /meta\.watch: it has an empty key/);
  assert.throws(() => checkWatch(['tokens'], steps), /must be a record/);
  assert.throws(() => checkWatch('tokens', steps), /must be a record/);
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, `K${i}`]));
  assert.throws(() => checkWatch(nine, [{ before: {}, after: nine }]), /it names 9 keys; name at most 8/);
  const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, `K${i}`]));
  checkWatch(eight, [{ before: {}, after: eight }]);
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
  await assert.rejects(collect('unknown', `{count:'Count',missing:'Missing'}`), /meta\.watch: it names "missing", which is never in the scene's state at any step of any scenario/);
  await assert.rejects(collect('blank', `{count:' '}`), /meta\.watch: it gives "count" an empty label/);
  const p = await collect('ok', `{count:'Count',only:'Only'}`);
  assert.deepEqual(p.Scene.meta?.watch, { count: 'Count', only: 'Only' });
});

test('the transcript says what each step changed after its caption, and check reports changes and unformatted keys', async () => {
  const p = await collect('report', `{count:'Count',box:'Box',only:'Only'}`);
  const { html } = await buildExplainer(p, join(folder, 'report.html'));
  assert.ok(html.includes('<p>One.</p><p>What changed: Count: 1</p>'), 'step one');
  assert.ok(html.includes('<p>Two.</p><p>What changed: Count: 1 → 2</p>'), 'step two, scenario a');
  assert.ok(html.includes('<p>Two.</p><p>What changed: Count: 1 → 2; Only: yes</p>'), 'step two, scenario b');
  const report = (await checkProject(p, join(folder, 'report-check'))) as { scenarios: { settings: Record<string, string>; watch: unknown }[] };
  const b = report.scenarios.find((v) => v.settings.c === 'b')!;
  assert.deepEqual(b.watch, [
    { step: 'one', changes: [{ label: 'Count', after: '1' }], unformatted: ['box'] },
    { step: 'two', changes: [{ label: 'Count', before: '1', after: '2' }, { label: 'Only', after: 'yes' }], unformatted: ['box'] },
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
      { label: 'Tokens left', before: '5', after: '0' },
      { label: 'Accepted', before: '0', after: '5' },
      { label: 'Rejected', after: 'R6' },
    ], JSON.stringify(c.values));
    // Every step says it, from the same function: the last step changes nothing watched.
    assert.deepEqual(c.steps.at(-1)!.watched, []);
  }
  const p = await collectProject('scenes/explainers/token-bucket', { write: false });
  const { html } = await buildExplainer(p, join(folder, 'token-bucket.html'));
  const said = [...html.matchAll(/<p>(What changed: [^<]*)<\/p>/g)].map((m) => m[1]);
  // Four steps of each of the three scenarios change something watched; the comparison does not.
  assert.equal(said.length, 12);
  assert.equal(said.filter((s) => s === 'What changed: Tokens left: 5 → 0; Accepted: 0 → 5; Rejected: R6').length, 3);
});

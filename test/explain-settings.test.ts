import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { traceScene } from '../explain/testing.ts';
import { resolveSettings, settingsOf } from '../explain/index.ts';
import { scenariosOf, withSettings, scenarioName } from '../explain/testing.ts';
import type { Setting, ExplainerMeta, ExplainerClass } from '../explain/index.ts';
import { checkExplainerMeta, isIdentifier } from '../explain/settings.ts';
import { shareable } from '../app/embed-share.ts';
import { fc, params } from './lib/pbt.ts';

class Example extends Scene {
  static settings = [
    {
      id: 'case',
      label: 'Case',
      default: 'a',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
    {
      id: 'rate',
      label: 'Rate',
      default: '1',
      options: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
      ],
    },
  ];
  override async construct() {
    await this.step('choice');
    this.state = { ...settingsOf(this) };
  }
}
test('every scenario traced at once sees its own settings, an unbound scene its defaults, and each scenario has its reader-facing name', async () => {
  const traces = await Promise.all(scenariosOf(Example).map((v) => traceScene(withSettings(Example, v))));
  assert.deepEqual(
    traces.map((t) => t.steps[0]!.after),
    [
      { case: 'a', rate: '1' },
      { case: 'a', rate: '2' },
      { case: 'b', rate: '1' },
      { case: 'b', rate: '2' },
    ],
  );
  assert.deepEqual({ ...settingsOf(new Example(new NullSink())) }, { case: 'a', rate: '1' });
  assert.equal(scenarioName(Example, { case: 'b', rate: '2' }), 'Case: B · Rate: Two');
  assert.equal(scenarioName(Scene, {}), '');
});
// ---- properties ------------------------------------------------------------------
const RESERVED = ['step', 'sent', 'parentOrigin', 'theme'];
/** Ids from the documented pattern, including every inherited Object.prototype name that matches it. */
const settingId = fc.oneof(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,8}$/),
  fc.constantFrom('constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', 'Step', 'THEME', 'a-', 'a_'),
).filter((id) => !RESERVED.includes(id));
const optionValue = fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom('', ' ', '__proto__', 'constructor', 'é'));
const setting: fc.Arbitrary<Setting> = fc
  .tuple(settingId, fc.uniqueArray(optionValue, { minLength: 1, maxLength: 4 }), fc.nat())
  .map(([id, values, d]) => ({ id, label: id, default: values[d % values.length]!, options: values.map((value) => ({ value, label: value })) }));
const declarations = fc.uniqueArray(setting, { maxLength: 4, selector: (s) => s.id });
const product = (settings: readonly Setting[]) => settings.reduce((n, s) => n * s.options.length, 1);
const classOf = (settings: readonly Setting[]) =>
  class extends Scene {
    static settings = settings;
  };
/** A selection: a declared option for some of the settings, as an own-keyed object (as URL parsing builds). */
const selection = (settings: readonly Setting[]) =>
  fc.tuple(...settings.map((s) => fc.option(fc.constantFrom(...s.options.map((o) => o.value)), { nil: undefined }))).map((picks) =>
    Object.fromEntries(settings.flatMap((s, i) => (picks[i] === undefined ? [] : [[s.id, picks[i]!]]))),
  );
const none = fc.constant({} as Record<string, string>);
const declared = declarations.chain((settings) => fc.tuple(fc.constant(settings), settings.length ? selection(settings) : none));

test('resolveSettings gives every declared setting its selected value, or its default', () => {
  fc.assert(
    fc.property(declared, ([settings, values]) => {
      const result = resolveSettings(classOf(settings), values);
      assert.deepEqual({ ...result }, Object.fromEntries(settings.map((s) => [s.id, Object.hasOwn(values, s.id) ? values[s.id] : s.default])));
      assert.ok(Object.isFrozen(result));
    }),
    params(),
  );
});

test('resolveSettings refuses an unknown setting id', () => {
  fc.assert(
    fc.property(declared, fc.string(), fc.string(), ([settings, values], id, value) => {
      fc.pre(!settings.some((s) => s.id === id));
      assert.throws(() => resolveSettings(classOf(settings), { ...values, ...Object.fromEntries([[id, value]]) }), /^RangeError: resolveSettings\(\): the scene has no setting/);
    }),
    params(),
  );
});

test('resolveSettings refuses a value that is not one of the options', () => {
  fc.assert(
    fc.property(declarations.filter((d) => d.length > 0), fc.nat(), fc.string(), (settings, k, value) => {
      const s = settings[k % settings.length]!;
      fc.pre(!s.options.some((o) => o.value === value));
      assert.throws(() => resolveSettings(classOf(settings), Object.fromEntries([[s.id, value]])), /^RangeError: resolveSettings\(\): .* is not an option of the setting/);
    }),
    params(),
  );
});

test('declarations with an invalid, reserved or duplicate id, or bad options, are refused', () => {
  const broken = fc.oneof(
    setting.chain((s) => fc.oneof(fc.string(), fc.constantFrom(...RESERVED, '1a', '-a', '_a', 'a b', '')).filter((id) => !/^[a-z][a-z0-9_-]*$/i.test(id) || RESERVED.includes(id)).map((id) => [{ ...s, id }])),
    setting.map((s) => [s, { ...s, label: 'again' }]),
    setting.map((s) => [{ ...s, options: [] }]),
    setting.map((s) => [{ ...s, options: [...s.options, s.options[0]!] }]),
    setting.chain((s) => fc.string().filter((d) => !s.options.some((o) => o.value === d)).map((d) => [{ ...s, default: d }])),
  );
  fc.assert(
    fc.property(declarations, broken, fc.nat(), (good, bad, at) => {
      const all = [...good.filter((g) => !bad.some((b) => b.id === g.id))];
      all.splice(at % (all.length + 1), 0, ...bad);
      assert.throws(() => resolveSettings(classOf(all)), /^Error: static settings: /);
    }),
    params(),
  );
});


test('scenariosOf lists every scenario once, in declaration order with the last setting changing fastest, each a valid selection', () => {
  fc.assert(
    fc.property(declarations, (settings) => {
      const S = classOf(settings);
      const scenarios = scenariosOf(S, Infinity);
      assert.equal(scenarios.length, product(settings));
      // Each scenario as the option positions it picks: strictly increasing, read as a number, means every scenario once, in order.
      const digits = scenarios.map((v) => settings.map((s) => s.options.findIndex((o) => o.value === v[s.id])));
      for (const d of digits) assert.ok(d.every((i) => i >= 0));
      for (let k = 1; k < digits.length; k++) {
        const [a, b] = [digits[k - 1]!, digits[k]!];
        const first = a.findIndex((x, i) => x !== b[i]);
        assert.ok(first >= 0 && a[first]! < b[first]!, `${JSON.stringify(a)} then ${JSON.stringify(b)}`);
      }
      for (const v of scenarios) assert.deepEqual({ ...resolveSettings(S, v) }, { ...v });
    }),
    params(),
  );
});

test('scenariosOf refuses exactly when the product exceeds the limit', () => {
  fc.assert(
    fc.property(declarations, fc.oneof(fc.nat({ max: 300 }), fc.constantFrom(NaN, Infinity, -1, 0)), (settings, limit) => {
      const S = classOf(settings);
      if (product(settings) <= limit) assert.equal(scenariosOf(S, limit).length, product(settings));
      else assert.throws(() => scenariosOf(S, limit), /^RangeError: static settings: they make \d+ scenarios, more than/);
    }),
    params(),
  );
});

test('withSettings binds per class, visible from any constructor, without touching the source', async () => {
  await fc.assert(
    fc.asyncProperty(declared, async ([settings, values]) => {
      let early: unknown = null;
      const Source = classOf(settings);
      const before = JSON.stringify(Source.settings);
      const Bound = withSettings(Source, values);
      class Reader extends Bound {
        seen = settingsOf(this);
        constructor(...args: ConstructorParameters<import('../src/index.ts').SceneClass>) {
          super(...args);
          early = settingsOf(this);
        }
      }
      const r = new Reader(new NullSink());
      const expected = { ...resolveSettings(Source, values) };
      assert.deepEqual({ ...(early as object) }, expected);
      assert.deepEqual({ ...r.seen }, expected);
      assert.deepEqual({ ...settingsOf(new Source(new NullSink())) }, { ...resolveSettings(Source) });
      assert.equal(JSON.stringify(Source.settings), before);
    }),
    params(),
  );
});

test('the innermost withSettings binding wins, and two bindings never share state', () => {
  fc.assert(
    fc.property(declarations.chain((s) => fc.tuple(fc.constant(s), s.length ? selection(s) : none, s.length ? selection(s) : none)), ([settings, a, b]) => {
      const S = classOf(settings);
      const A = withSettings(S, a),
        AB = withSettings(A, b);
      assert.deepEqual({ ...settingsOf(new AB(new NullSink())) }, { ...resolveSettings(S, b) });
      assert.deepEqual({ ...settingsOf(new A(new NullSink())) }, { ...resolveSettings(S, a) });
    }),
    params(),
  );
});

test('static meta takes the keys ExplainerMeta names, and refuses any other, naming it and the keys it takes', () => {
  const full: ExplainerMeta = {
    id: 'a', title: 'A', lang: 'en', sources: [], lettering: { scripts: ['Grek'] }, textContext: 'explicit', scenarioNavigation: 'first',
    player: { accent: true, paper: true, corners: 'square', minStageWidth: 800, outline: true }, watch: { n: 'N' },
    answer: 'Yes', questions: [{ question: 'Q?', answer: 'A' }], checkedAgainst: 'model.test.ts', claims: [{ says: 'x', shown: true }],
  };
  checkExplainerMeta(full);
  checkExplainerMeta(undefined);
  checkExplainerMeta({});
  // Built apart from the declaration, where the type does not reach: the check still names the key.
  const built = (): object => ({ title: 'A', soruces: ['https://example.com'] });
  assert.throws(() => checkExplainerMeta(built()), /^TypeError: static meta: "soruces" is not a key/);
  assert.throws(() => checkExplainerMeta({ titel: 'A', lnag: 'fr' }), /static meta: "titel", "lnag" are not keys it takes/);
  assert.throws(() => checkExplainerMeta({ player: { acent: true } }), /^TypeError: meta\.player: "acent" is not a key/);
  for (const bad of [null, 4, 'meta', []]) assert.throws(() => checkExplainerMeta(bad), /static meta: it must be an object/);
  assert.throws(() => checkExplainerMeta({ player: true }), /meta\.player: it must be an object/);
  // A key inherited through the prototype is not the scene's: only own keys are read.
  checkExplainerMeta(Object.create({ titel: 'A' }));
});

test('one validator for the names a link carries or a file is named by: events, meta.id and shareable steps', () => {
  // An event: any words without a comma, since a link joins the events a reader sent with commas.
  for (const ok of ['push', 'start A', 'A lands', 'Lamp lit', 'é:1']) assert.ok(isIdentifier('event', ok), ok);
  for (const bad of ['', '  ', 'a,b', 3]) assert.ok(!isIdentifier('event', bad), JSON.stringify(bad));
  // meta.id: one safe path segment, in lower case, and no name Windows keeps for a device.
  for (const ok of ['seasons', 'lru-mru', 'a-1', '2password', 'console', 'com10', 'nul-pointer']) assert.ok(isIdentifier('id', ok), ok);
  for (const bad of ['', '../x', 'a/b', '.hidden', 'a b', 'x.html', '-x', 'é', 'a_1', 'My_Scene', 'Push', 'con', 'NUL', 'Aux', 'prn', 'com1', 'LPT9'])
    assert.ok(!isIdentifier('id', bad), bad);
  // A step with a share page: letters, digits, - and _, and no device name.
  for (const ok of ['push', 'Push-2', 'a_b', 'connect']) assert.ok(isIdentifier('step', ok), ok);
  for (const bad of ['', 'a b', 'a/b', 'é', 'con', 'Nul', 'com3']) assert.ok(!isIdentifier('step', bad), bad);
  // The player's share check and the site's are this validator.
  for (const name of ['push', 'a b', '../x']) assert.equal(shareable(name), isIdentifier('step', name));
  // meta.id is checked with the rest of static meta.
  assert.throws(() => checkExplainerMeta({ id: '../escape' }), /^RangeError: meta\.id: "\.\.\/escape" is not a page id/);
  assert.throws(() => checkExplainerMeta({ id: 'con' }), /^RangeError: meta\.id: "con" is not a page id/);
  assert.throws(() => checkExplainerMeta({ id: 'My_Scene' }), /^RangeError: meta\.id: "My_Scene" is not a page id/);
  assert.throws(() => checkExplainerMeta({ id: 'a/b' }), /^RangeError: meta\.id: "a\/b" is not a page id/);
  assert.throws(() => checkExplainerMeta({ id: 7 }), /^TypeError: meta\.id: it must be a string/);
  checkExplainerMeta({ id: 'seasons' });
});

test('every explainer and tutorial scene declares a static meta that collection takes', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = join(import.meta.dirname, '..', 'scenes');
  for (const group of ['explainers', 'tutorial'])
    for (const id of readdirSync(join(root, group))) {
      const file = join(root, group, id, 'scene.ts');
      if (!existsSync(file)) continue;
      const Explainer = (await import(file)).default as ExplainerClass;
      checkExplainerMeta(Explainer.meta);
    }
});

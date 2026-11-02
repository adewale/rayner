// The host-page API's messages (specs/player-guidance.md G4), in Node: which step reports the
// loader accepts, which goto requests the page accepts, and from whom. The real cross-origin
// behaviour is tested in test/browser/explain-embed.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { GOTO_TYPE, STEP_TYPE, gotoMessage, gotoRequest, stepDetail, stepMessage } from '../app/embed-protocol.ts';

const ORIGIN = 'https://explainers.example';
const parent = { name: 'parent' } as unknown as MessageEventSource,
  other = { name: 'other' } as unknown as MessageEventSource;
const from = (data: unknown, origin = ORIGIN, source: MessageEventSource | null = parent) => ({ data, origin, source });

const word = fc.string({ minLength: 0, maxLength: 12 });
const settings = fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), word, { maxKeys: 4, noNullPrototype: true });
const detail = fc
  .record({ total: fc.integer({ min: 1, max: 500 }), step: word, settings })
  .chain((d) => fc.record({ index: fc.integer({ min: 0, max: d.total - 1 }) }).map(({ index }) => ({ ...d, index })));

test('a step report round-trips: the page posts type, version 1, the step, its index of the total and the settings, and nothing else', () => {
  fc.assert(
    fc.property(detail, (d) => {
      const message = stepMessage(d);
      assert.deepEqual(Object.keys(message).sort(), ['index', 'settings', 'step', 'total', 'type', 'version']);
      assert.equal(message.type, STEP_TYPE);
      assert.equal(message.version, 1);
      // A structured clone is what crosses the frame.
      assert.deepEqual(stepDetail(from(structuredClone(message)), ORIGIN, parent), d);
    }),
    params(300),
  );
});

test('the loader accepts a step report only from the artifact origin and that iframe\'s window', () => {
  const ok = stepMessage({ step: 'request', index: 3, total: 4, settings: { request: 'miss' } });
  assert.deepEqual(stepDetail(from(ok), ORIGIN, parent), { step: 'request', index: 3, total: 4, settings: { request: 'miss' } });
  assert.equal(stepDetail(from(ok, 'https://evil.example'), ORIGIN, parent), null);
  assert.equal(stepDetail(from(ok, ORIGIN, other), ORIGIN, parent), null);
  assert.equal(stepDetail(from(ok, ORIGIN, null), ORIGIN, parent), null);
  // Before the frame has a window there is no source to match.
  assert.equal(stepDetail(from(ok), ORIGIN, null), null);
});

test('the loader refuses a malformed step report', () => {
  const good = { type: STEP_TYPE, version: 1, step: 'a', index: 0, total: 2, settings: {} };
  for (const bad of [
    null, 'rayner:step', 42, [],
    { ...good, type: 'rayner:resize' },
    { ...good, version: 2 },
    { ...good, version: '1' },
    { ...good, step: 7 },
    { ...good, index: -1 },
    { ...good, index: 2 },
    { ...good, index: 0.5 },
    { ...good, total: 0 },
    { ...good, total: Infinity },
    { ...good, settings: null },
    { ...good, settings: ['a'] },
    { ...good, settings: { a: 1 } },
    { type: STEP_TYPE, version: 1, index: 0, total: 1, settings: {} },
  ])
    assert.equal(stepDetail(from(bad), ORIGIN, parent), null, JSON.stringify(bad));
});

test('a goto request round-trips with or without a step and settings, from the parent at the parent origin only', () => {
  fc.assert(
    fc.property(fc.option(word, { nil: undefined }), fc.option(settings, { nil: undefined }), (step, values) => {
      const message = gotoMessage(step, values);
      assert.equal(message.type, GOTO_TYPE);
      assert.equal(message.version, 1);
      // Only what was given is sent.
      assert.deepEqual(Object.keys(message).sort(), ['type', 'version', ...(step === undefined ? [] : ['step']), ...(values === undefined ? [] : ['settings'])].sort());
      const want = { ...(step === undefined ? {} : { step }), ...(values === undefined ? {} : { settings: values }) };
      assert.deepEqual(gotoRequest(from(structuredClone(message)), ORIGIN, parent), want);
      assert.equal(gotoRequest(from(message, 'https://other.example'), ORIGIN, parent), null);
      assert.equal(gotoRequest(from(message, ORIGIN, other), ORIGIN, parent), null);
    }),
    params(300),
  );
});

test('the page refuses a malformed goto request', () => {
  for (const bad of [
    null, undefined, 'rayner:goto', [], {},
    { type: GOTO_TYPE },
    { type: GOTO_TYPE, version: 2 },
    { type: STEP_TYPE, version: 1 },
    { type: GOTO_TYPE, version: 1, step: 3 },
    { type: GOTO_TYPE, version: 1, step: null },
    { type: GOTO_TYPE, version: 1, settings: 'request=miss' },
    { type: GOTO_TYPE, version: 1, settings: ['miss'] },
    { type: GOTO_TYPE, version: 1, settings: { request: 1 } },
    { type: GOTO_TYPE, version: 1, settings: null },
  ])
    assert.equal(gotoRequest(from(bad), ORIGIN, parent), null, JSON.stringify(bad));
  // A setting named like an Object property is a key like any other, never the prototype.
  const odd = JSON.parse('{"type":"rayner:goto","version":1,"settings":{"__proto__":"x","constructor":"y"}}');
  const request = gotoRequest(from(odd), ORIGIN, parent)!;
  assert.deepEqual(Object.entries(request.settings!), [['__proto__', 'x'], ['constructor', 'y']]);
  assert.equal(Object.getPrototypeOf(request.settings), Object.prototype);
});

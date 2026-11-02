// Property tests for the embed protocol (app/embed-protocol.ts) in Node: which
// origins count as exact, which messages the host accepts, and, on fake browser
// globals, which heights reportHeight sends, to whom, and when it stops. The
// real cross-origin behaviour is tested in test/browser/explain-embed.test.ts.
// Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { reportHeight, exactHttpOrigin, resizeHeight } from '../app/embed-protocol.ts';

type Listener = () => void;
/** Install a fake framed (or top-level) window; returns the triggers and the recorded posts. */
function fakeWindow(search: string, framed: boolean) {
  const g = globalThis as unknown as Record<string, unknown>;
  const posts: { msg: { type: unknown; version: unknown; height: number }; origin: string }[] = [];
  const doc: Record<string, Listener[]> = {},
    win: Record<string, Listener[]> = {};
  let observed: Listener | null = null;
  const on = (map: Record<string, Listener[]>) => (name: string, f: Listener) => (map[name] ??= []).push(f);
  const off = (map: Record<string, Listener[]>) => (name: string, f: Listener) => {
    map[name] = (map[name] ?? []).filter((x) => x !== f);
  };
  g.location = { search };
  g.window = g;
  g.parent = framed ? { postMessage: (msg: never, origin: string) => posts.push({ msg, origin }) } : g;
  g.addEventListener = on(win);
  g.removeEventListener = off(win);
  g.document = { addEventListener: on(doc), removeEventListener: off(doc) };
  g.ResizeObserver = class {
    constructor(cb: Listener) {
      observed = cb;
    }
    observe() {}
    disconnect() {
      observed = null;
    }
  };
  return {
    posts,
    resize: () => observed?.(),
    step: () => (doc['rayner:step'] ?? []).forEach((f) => f()),
    load: () => (win.load ?? []).forEach((f) => f()),
  };
}
// Measured heights: the full double domain (NaN, ±Infinity, negatives, fractions, huge).
const height = fc.oneof(fc.double(), fc.double({ min: 0, max: 200_000, noNaN: true }), fc.integer({ min: 0, max: 100_001 }));
const trigger = fc.constantFrom('resize' as const, 'step' as const, 'load' as const);
const events = fc.array(fc.tuple(height, trigger), { maxLength: 40 });
const origin = fc.webUrl().map((u) => new URL(u).origin);

/** What the host should receive for these measurements: each in-range height rounded up, once per change. */
function expectedPosts(measured: number[]): number[] {
  const posts: number[] = [];
  for (const h of measured.map(Math.ceil).filter((c) => c >= 1 && c <= 100000)) if (posts.at(-1) !== h) posts.push(h);
  return posts;
}

test('reportHeight: posts each new in-range height, rounded up, once, to exactly the parentOrigin, in a message the host accepts', () => {
  fc.assert(
    fc.property(origin, height, events, (o, first, list) => {
      const w = fakeWindow('?' + new URLSearchParams({ parentOrigin: o }), true);
      let h = first;
      reportHeight({ getBoundingClientRect: () => ({ height: h }) } as HTMLElement);
      for (const [next, how] of list) {
        h = next;
        w[how]();
      }
      // The first measurement is taken on the call itself, then one per trigger.
      assert.deepEqual(w.posts.map((p) => p.msg.height), expectedPosts([first, ...list.map(([next]) => next)]));
      const source = {} as MessageEventSource;
      for (const p of w.posts) {
        assert.equal(p.origin, o);
        assert.equal(resizeHeight({ origin: o, source, data: p.msg }, o, source), p.msg.height);
      }
    }),
    params(),
  );
});

test('reportHeight: sends exactly when framed and parentOrigin is an exact HTTP(S) origin', () => {
  // Labelled by construction, not by exactHttpOrigin: an origin as URL gives it, or a near miss of one.
  const nearMiss = fc.oneof(
    fc.string({ unit: 'binary' }).filter((v) => !/^https?:/i.test(v)),
    origin.chain((o) =>
      fc.constantFrom(o + '/', o + '/p', o + '?q', o + '#h', ' ' + o, o + ' ', o.toUpperCase(), o.replace('://', '://user:pw@'), o.replace(/^https?:/, 'ftp:'), '*', 'null'),
    ),
  );
  const parentOrigin = fc.oneof(
    origin.map((v) => ({ value: v as string | undefined, exact: true })),
    nearMiss.map((v) => ({ value: v as string | undefined, exact: false })),
    fc.constant({ value: undefined, exact: false }),
  );
  fc.assert(
    fc.property(parentOrigin, fc.boolean(), events, ({ value, exact }, framed, list) => {
      const w = fakeWindow(value === undefined ? '' : '?' + new URLSearchParams({ parentOrigin: value }), framed);
      let h = 10;
      reportHeight({ getBoundingClientRect: () => ({ height: h }) } as HTMLElement);
      for (const [next, how] of list) {
        h = next;
        w[how]();
      }
      // The first measurement (10 px) is always in range, so an allowed sender has posted it.
      assert.equal(w.posts.length > 0, framed && exact, JSON.stringify(value));
    }),
    params(),
  );
});

test('reportHeight: after the returned dispose, no resize, step or load sends anything', () => {
  fc.assert(
    fc.property(origin, events, events, (o, before, after) => {
      const w = fakeWindow('?' + new URLSearchParams({ parentOrigin: o }), true);
      let h = 1;
      const dispose = reportHeight({ getBoundingClientRect: () => ({ height: h }) } as HTMLElement);
      for (const [next, how] of before) {
        h = next;
        w[how]();
      }
      const sent = w.posts.length;
      dispose();
      for (const [next, how] of after) {
        h = next;
        w[how]();
      }
      assert.equal(w.posts.length, sent);
    }),
    params(),
  );
});

// ---- exactHttpOrigin and resizeHeight ----------------------------------------------

const httpOrigin = fc.webUrl({ validSchemes: ['http', 'https'] }).map((u) => new URL(u).origin);

test('exactHttpOrigin returns its input or null, and only an http(s) origin', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' }), fc.webUrl(), httpOrigin, fc.webUrl({ validSchemes: ['ftp', 'file', 'data', 'javascript'] })), (value) => {
      const out = exactHttpOrigin(value);
      if (out == null) return;
      assert.equal(out, value);
      assert.equal(new URL(value).origin, value);
      assert.match(new URL(value).protocol, /^https?:$/);
    }),
    params(),
  );
});

test('exactHttpOrigin accepts every exact http(s) origin', () => {
  fc.assert(fc.property(httpOrigin, (origin) => assert.equal(exactHttpOrigin(origin), origin)), params());
});

test('exactHttpOrigin refuses an origin with a path, query, fragment, credentials, case change or padding', () => {
  fc.assert(
    fc.property(
      httpOrigin,
      fc.oneof(
        fc.constantFrom('/', '/x', '?', '?q=1', '#', '#f', ' ', '\n', '\t'),
        fc.webPath().filter((p) => p.length > 0),
      ),
      fc.constantFrom('suffix', 'prefix', 'userinfo', 'upper'),
      (origin, extra, how) => {
        let value: string;
        if (how === 'suffix') value = origin + extra;
        else if (how === 'prefix') value = ' ' + origin;
        else if (how === 'userinfo') value = origin.replace('://', '://user:pw@');
        else {
          value = origin.toUpperCase();
          fc.pre(value !== origin);
        }
        assert.equal(exactHttpOrigin(value), null, value);
      },
    ),
    params(),
  );
});

const source = {} as MessageEventSource,
  otherSource = {} as MessageEventSource;
const anyHeight = fc.oneof(
  fc.integer({ min: -10, max: 100010 }),
  fc.double(),
  fc.constantFrom(1, 100000, 0, -0, 100001, 0.5, NaN, Infinity, -Infinity),
  fc.constantFrom('742', 5n, new Number(5), null, undefined, {}, []),
);
const resizeData = fc.oneof(
  fc.record({ type: fc.constantFrom('rayner:resize', 'other', ''), version: fc.constantFrom(1, 2, '1', 0), height: anyHeight }),
  fc.record({ type: fc.constant('rayner:resize'), version: fc.constant(1), height: anyHeight }),
  fc.anything(),
);

test('resizeHeight accepts exactly the documented message from exactly the framed child', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('same', 'other'),
      fc.constantFrom('same', 'other', 'null'),
      resizeData,
      httpOrigin,
      (o, s, data, origin) => {
        const event = { origin: o === 'same' ? origin : origin + '.evil', source: s === 'same' ? source : s === 'other' ? otherSource : null, data };
        const d = data as Record<string, unknown> | null;
        const ok =
          o === 'same' &&
          s === 'same' &&
          !!d &&
          typeof d === 'object' &&
          d.type === 'rayner:resize' &&
          d.version === 1 &&
          typeof d.height === 'number' &&
          Number.isInteger(d.height) &&
          d.height >= 1 &&
          d.height <= 100000;
        assert.equal(resizeHeight(event, origin, s === 'null' ? null : source), ok ? d!.height : null);
      },
    ),
    params(),
  );
});

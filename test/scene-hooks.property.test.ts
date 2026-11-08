// Property tests for src/scene.ts's helper hooks (onStep, addJson,
// stateJson) and caption holds (Step.hold, captionWpm). Counts: test/lib/pbt.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Rectangle, FadeIn } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { traceScene } from '../explain/testing.ts';
import type { Step, Sink } from '../src/index.ts';
import { fc, params } from './lib/pbt.ts';

const caption = fc.oneof(
  fc.constantFrom('', ' ', '\n\t ', 'one', 'two words'),
  fc.array(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 60 }).chain((ws) => fc.constantFrom(' ', '  ', '\n', ' ').map((g) => ws.join(g))),
);
const stepPlan = fc.record({
  caption: fc.option(caption, { nil: undefined }),
  motion: fc.option(fc.double({ min: 0.01, max: 4, noNaN: true }), { nil: undefined }),
  wait: fc.option(fc.double({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
});
const plan = fc.record({ fps: fc.oneof(fc.constantFrom(24, 30, 60), fc.integer({ min: 1, max: 120 })), steps: fc.array(stepPlan, { minLength: 1, maxLength: 4 }) });
type Plan = typeof plan extends fc.Arbitrary<infer T> ? T : never;
const words = (c: string) => (c.trim() ? c.trim().split(/\s+/).length : 0);

/** Run a plan; return its steps, and the motion time each step played before any hold. */
async function run(p: Plan, skipUntil = Infinity) {
  const motion: number[] = [];
  class Planned extends Scene {
    override async construct() {
      for (const [i, s] of p.steps.entries()) {
        await this.step('s' + i, s.caption === undefined ? {} : { caption: s.caption });
        const t0 = this.time;
        if (s.motion) await this.play(new FadeIn(new Rectangle({ width: 1, height: 1 })), { runTime: s.motion });
        if (s.wait) await this.wait(s.wait);
        motion.push(this.time - t0);
      }
    }
  }
  const scene = await new Planned(new NullSink(), { fps: p.fps, skipUntil }).run();
  return { steps: scene.steps, motion, end: scene.time };
}

// The documented reading pace (docs/REFERENCE.md, Scene): 160 words a minute.
const WPM = 160;

test('a captioned step lasts at least its reading time at 160 words a minute', async () => {
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const { steps } = await run(p);
      steps.forEach((s, i) => {
        const c = p.steps[i]!.caption;
        if (typeof c === 'string') assert.ok(s.t1! - s.t0 >= (words(c) / WPM) * 60 - 1e-9, `${s.name}: ${s.t1! - s.t0}s for ${words(c)} words`);
      });
    }),
    params(300),
  );
});

test('the hold follows Scene.captionWpm: 12 words at 120 a minute hold 6 s, and Infinity holds nothing', async () => {
  const words12 = 'one two three four five six seven eight nine ten eleven twelve';
  class S extends Scene { override async construct() { await this.step('a', { caption: words12 }); await this.wait(0.1); await this.step('b'); } }
  const saved = Scene.captionWpm;
  try {
    for (const [wpm, t1] of [[120, 6], [Infinity, 0.1]] as const) {
      Scene.captionWpm = wpm;
      const scene = await new S(new NullSink(), { fps: 10 }).run();
      assert.ok(Math.abs(scene.steps[0]!.t1! - t1) < 1e-6, `${wpm} wpm: held to ${scene.steps[0]!.t1}s`);
    }
  } finally { Scene.captionWpm = saved; }
});

test('a caption hold adds at most one frame beyond the reading time', async () => {
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const { steps, motion } = await run(p);
      steps.forEach((s, i) => {
        const c = p.steps[i]!.caption;
        const need = typeof c === 'string' ? (words(c) / WPM) * 60 : 0;
        assert.ok(s.t1! - s.t0 < Math.max(need, motion[i]!) + 1 / p.fps + 1e-9);
      });
    }),
    params(300),
  );
});

test('a hold is recorded exactly when the step waited for its caption, and lies inside the step', async () => {
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const { steps, motion } = await run(p);
      steps.forEach((s, i) => {
        const held = s.t1! - s.t0 > motion[i]! + 1e-9;
        assert.equal(s.hold != null, held, `${s.name}`);
        if (s.hold != null) assert.ok(s.t0 <= s.hold && s.hold < s.t1!);
      });
    }),
    params(300),
  );
});

test('a caption with no words needs no hold', async () => {
  await fc.assert(
    fc.asyncProperty(plan, fc.constantFrom('', ' ', '\t\n', '   '), async (p, blank) => {
      const { steps, motion } = await run({ ...p, steps: p.steps.map((s) => ({ ...s, caption: blank })) });
      steps.forEach((s, i) => {
        assert.equal(s.hold, undefined);
        assert.ok(Math.abs(s.t1! - s.t0 - motion[i]!) < 1e-9);
      });
    }),
    params(300),
  );
});

test('holds are the same whether the run is played or skipped', async () => {
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const [a, b] = [await run(p, 0), await run(p, Infinity)];
      assert.deepEqual(b.steps.map((s) => [s.t0, s.t1, s.hold, s.frame0, s.frame1]), a.steps.map((s) => [s.t0, s.t1, s.hold, s.frame0, s.frame1]));
    }),
    params(300),
  );
});

test("a trace carries each step's boundaries and hold, to the millisecond, as the run recorded them", async () => {
  // The player stops at a step's hold and video waits there for the caption: both read it from the trace.
  const ms = (x: number) => Math.round(x * 1000) / 1000;
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const { steps } = await run(p);
      class Planned extends Scene {
        override async construct() {
          for (const [i, s] of p.steps.entries()) {
            await this.step('s' + i, s.caption === undefined ? {} : { caption: s.caption });
            if (s.motion) await this.play(new FadeIn(new Rectangle({ width: 1, height: 1 })), { runTime: s.motion });
            if (s.wait) await this.wait(s.wait);
          }
        }
      }
      const trace = await traceScene(Planned, { fps: p.fps });
      assert.deepEqual(
        trace.steps.map((r) => [r.step, r.t0, r.frame0, r.t1, r.frame1, r.hold]),
        steps.map((s) => [s.name, ms(s.t0), s.frame0, ms(s.t1!), s.frame1, s.hold == null ? undefined : ms(s.hold)]),
      );
    }),
    params(300),
  );
});

test('steps tile the timeline: each ends where the next begins, and the last ends the scene', async () => {
  await fc.assert(
    fc.asyncProperty(plan, async (p) => {
      const { steps, end } = await run(p);
      for (let i = 0; i + 1 < steps.length; i++) {
        assert.equal(steps[i]!.t1, steps[i + 1]!.t0);
        assert.equal(steps[i]!.frame1, steps[i + 1]!.frame0);
      }
      assert.equal(steps.at(-1)!.t1, end);
    }),
    params(300),
  );
});

// ---- onStep ----------------------------------------------------------------------

const ops = fc.array(
  fc.oneof(
    fc.record({ k: fc.constant('add' as const), fn: fc.nat({ max: 2 }) }),
    fc.record({ k: fc.constant('remove' as const), handle: fc.nat({ max: 8 }) }),
    fc.record({ k: fc.constant('step' as const) }),
  ),
  { maxLength: 20 },
);

test('each onStep registration runs once per step, in order, after the sink, until its own remover', async () => {
  await fc.assert(
    fc.asyncProperty(ops, async (sequence) => {
      const heard: string[] = [];
      const fns = [0, 1, 2].map((n) => (s: Step) => void heard.push(`${n}@${s.name}`));
      const sink: Sink = {
        async frame() {},
        async stepBegin(_scene, s) {
          heard.push(`sink@${s.name}`);
        },
      };
      const expected: string[] = [];
      class Hooks extends Scene {
        override async construct() {
          const live: { fn: number; off: () => void; on: boolean }[] = [];
          let n = 0;
          for (const op of sequence) {
            if (op.k === 'add') live.push({ fn: op.fn, off: this.onStep(fns[op.fn]!), on: true });
            else if (op.k === 'remove') {
              const r = live[op.handle % Math.max(1, live.length)];
              if (r) {
                r.off();
                r.on = false;
              }
            } else {
              const name = 's' + n++;
              expected.push(`sink@${name}`, ...live.filter((r) => r.on).map((r) => `${r.fn}@${name}`));
              await this.step(name);
            }
          }
        }
      }
      await new Hooks(sink).run();
      assert.deepEqual(heard, expected);
    }),
    params(),
  );
});

test('a listener removed during a step does not run for it, and one added during it waits for the next', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 2, max: 6 }), fc.nat(), fc.nat(), fc.boolean(), async (count, who, victim, adds) => {
      const heard: string[] = [];
      class Hooks extends Scene {
        override async construct() {
          const offs: (() => void)[] = [];
          for (let i = 0; i < count; i++)
            offs.push(
              this.onStep((s) => {
                heard.push(`${i}@${s.name}`);
                if (s.name === 'a' && i === who % count) {
                  offs[victim % count]!();
                  if (adds) this.onStep((t) => void heard.push(`new@${t.name}`));
                }
              }),
            );
          await this.step('a');
          await this.step('b');
        }
      }
      await new Hooks(new NullSink()).run();
      const [w, v] = [who % count, victim % count];
      const a = Array.from({ length: count }, (_, i) => i).filter((i) => !(i === v && v > w));
      const b = Array.from({ length: count }, (_, i) => i).filter((i) => i !== v);
      assert.deepEqual(heard, [...a.map((i) => `${i}@a`), ...b.map((i) => `${i}@b`), ...(adds ? ['new@b'] : [])]);
    }),
    params(),
  );
});

// ---- stateJson / addJson ---------------------------------------------------------

const key = fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom('__proto__', 'constructor', 'walks', 'toString'));
const json = fc.dictionary(key, fc.jsonValue({ maxDepth: 2 }), { maxKeys: 5 });
/** A JSON copy with every key kept as an own key, as JSON.parse gives. */
const own = (o: object) => JSON.parse(JSON.stringify(o));
/** A JSON value with its keys sorted, to compare two values whatever their key order. */
const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('stateJson is the state merged, left to right, with each live addJson part, every key kept; a key written twice with two values throws', () => {
  fc.assert(
    fc.property(json, fc.array(fc.tuple(json, fc.boolean()), { maxLength: 4 }), (state, parts) => {
      const scene = new Scene(new NullSink());
      scene.state = own(state);
      const offs = parts.map(([d]) => scene.addJson(() => own(d)));
      parts.forEach(([, drop], i) => drop && offs[i]!());
      const expected: Record<string, unknown> = {};
      let clash: { key: string; part: boolean } | null = null;
      const put = (o: Record<string, unknown>, part: boolean) => {
        for (const [k, v] of Object.entries(o)) {
          if (Object.hasOwn(expected, k) && JSON.stringify(sorted(expected[k])) !== JSON.stringify(sorted(v))) clash ??= { key: k, part: parts.length > 0 && part && fromPart.has(k) };
          if (part) fromPart.add(k);
          Object.defineProperty(expected, k, { value: v, enumerable: true, writable: true, configurable: true });
        }
      };
      const fromPart = new Set<string>();
      put(own(state), false);
      for (const [d, drop] of parts) if (!drop) put(own(d), true);
      if (clash) {
        const { key: k, part } = clash;
        assert.throws(() => scene.stateJson(), part
          ? new RegExp(`^Error: this\\.addJson\\(\\): two parts write the key ${escape(JSON.stringify(k))} into this\\.state with different values`)
          : new RegExp(`^Error: this\\.state: the key ${escape(JSON.stringify(k))} is also written by a helper`));
        return;
      }
      const got = scene.stateJson();
      assert.deepEqual(Object.entries(got), Object.entries(expected));
      assert.equal(Object.getPrototypeOf(got), Object.prototype);
    }),
    params(),
  );
});

test('a helper\'s key refused in the scene\'s own state: an author\'s walks is never replaced by recorded walks', () => {
  const scene = new Scene(new NullSink());
  // The helper restates its own key with the same value: allowed.
  scene.state = { walks: [1] };
  const off = scene.addJson(() => ({ walks: [1] }));
  assert.deepEqual(scene.stateJson(), { walks: [1] });
  off();
  // Another value under the same key is the author's key colliding with the helper's.
  scene.addJson(() => ({ walks: [2] }));
  assert.throws(() => scene.stateJson(), /^Error: this\.state: the key "walks" is also written by a helper, with another value; rename the scene's key/);
  scene.state = {};
  scene.addJson(() => ({ walks: [3] }));
  assert.throws(() => scene.stateJson(), /^Error: this\.addJson\(\): two parts write the key "walks" into this\.state with different values/);
  // Into what is shown, the same rule.
  const shown = new Scene(new NullSink());
  shown.shown = { picture: 'mine' };
  shown.addJson(() => ({ picture: { entries: [] } }), 'shown');
  assert.throws(() => shown.shownJson(), /^Error: this\.shown: the key "picture" is also written by a helper/);
});

test('stateJson returns a copy: changing it leaves the state alone', () => {
  fc.assert(
    fc.property(json, (state) => {
      const scene = new Scene(new NullSink());
      scene.state = own(state);
      const before = JSON.stringify(scene.state);
      const d = scene.stateJson();
      for (const k of Object.keys(d)) d[k] = 'changed';
      assert.equal(JSON.stringify(scene.state), before);
    }),
    params(),
  );
});

test('registering the same addJson part twice and removing one leaves the other', () => {
  fc.assert(
    fc.property(json, fc.nat({ max: 1 }), (d, which) => {
      const scene = new Scene(new NullSink());
      const f = () => own(d);
      const offs = [scene.addJson(f), scene.addJson(f)];
      offs[which]!();
      assert.deepEqual(Object.entries(scene.stateJson()), Object.entries(own(d)));
    }),
    params(),
  );
});

test('an addJson part that does not return an object is refused with a clear error', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constantFrom(undefined, null), fc.integer(), fc.string(), fc.array(fc.integer())), (bad) => {
      const scene = new Scene(new NullSink());
      scene.addJson(() => bad as never);
      assert.throws(() => scene.stateJson(), /must return a JSON object/);
    }),
    params(),
  );
});

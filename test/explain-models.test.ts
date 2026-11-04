import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  sha256,
  pkceChallenge,
  reduceSession,
  TokenBucket,
  RingBuffer,
  Full,
  ringStory,
  exec,
  sunlight,
  daylightYear,
  noonShare,
  noonPatch,
  sunDistance,
} from '../scenes/explainers/lib/models.ts';
import { find, closeness, distance, run, ITEMS } from '../scenes/explainers/lib/2password.ts';
import { Repo, AUTHOR } from '../scenes/explainers/lib/git.ts';
import { assertViewFollowsState } from './lib/view-fidelity.ts';
import type { View } from '../src/index.ts';
import { withSettings } from '../explain/index.ts';
import { loadFonts } from '../src/index.ts';
import TokenBucketExplainer from '../scenes/explainers/token-bucket/scene.ts';

test('SHA-256 and PKCE agree with independent crypto and the RFC 7636 vector', () => {
  const checkHash = (input: string) => {
    const expected = createHash('sha256').update(input).digest();
    assert.deepEqual(Buffer.from(sha256(input)), expected);
    assert.equal(pkceChallenge(input), expected.toString('base64url'));
  };
  // Independent UTF-8 hashing at SHA's one/two-block padding boundaries, with
  // NUL, non-BMP characters and lone surrogates handled by TextEncoder/Node.
  for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128]) checkHash('x'.repeat(size));
  for (const text of ['\0', 'é中文😀', '\ud800', '\udfff']) checkHash(text);
  const utf16 = fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 192 })
    .map((units) => String.fromCharCode(...units));
  fc.assert(fc.property(utf16, checkHash), params(300));
  assert.equal(
    pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
test('both session histories come from the reducer; closed rejects all modeled events', () => {
  for (const events of [
    ['CONNECT', 'OPENED', 'CLOSE'],
    ['CONNECT', 'ERROR'],
  ])
    assert.equal(events.reduce(reduceSession, 'idle'), 'closed');
  const transitions: Record<string, Record<string, string>> = {
    idle: { CONNECT: 'connecting' }, connecting: { OPENED: 'open', ERROR: 'closed' }, open: { CLOSE: 'closed' }, closed: {},
  };
  for (const [state, allowed] of Object.entries(transitions)) for (const event of ['CONNECT', 'OPENED', 'CLOSE', 'ERROR']) {
    if (Object.hasOwn(allowed, event)) assert.equal(reduceSession(state, event), allowed[event]);
    else assert.throws(() => reduceSession(state, event), /InvalidTransition/);
  }
});
test('rate changes alter real decisions while balances stay inside capacity', () => {
  const successes = [];
  for (const rate of [1, 2, 4]) {
    const bucket = new TokenBucket(rate);
    const results = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 2].map((now) => {
      const ok = bucket.allow(now);
      assert.ok(bucket.tokens >= 0 && bucket.tokens <= 5);
      return ok;
    });
    assert.deepEqual(results.slice(0, 6), [true, true, true, true, true, false]);
    successes.push(results.filter(Boolean).length);
  }
  assert.deepEqual(successes, [7, 8, 9]);
});
test('token-bucket: the explainer schedule gets the answers golang.org/x/time/rate gives', () => {
  // tools/oracle/token-bucket runs rate.NewLimiter(r, 5).AllowN(t, 1) on this schedule.
  const oracle = JSON.parse(readFileSync(new URL('./fixtures/token-bucket-xtime.json', import.meta.url), 'utf8')) as {
    module: string; burst: number; schedule: number[]; runs: Record<string, { at: number; status: number; tokens: number }[]>;
  };
  assert.equal(oracle.module, 'golang.org/x/time v0.15.0');
  assert.deepEqual(oracle.schedule, [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5]);
  assert.deepEqual(Object.keys(oracle.runs).sort(), ['1', '2', '4']);
  for (const [rate, calls] of Object.entries(oracle.runs)) {
    const bucket = new TokenBucket(Number(rate), oracle.burst);
    assert.deepEqual(
      oracle.schedule.map((at) => ({ at, status: bucket.allow(at) ? 200 : 429, tokens: bucket.tokens })),
      calls,
      `rate ${rate}`,
    );
  }
  // The long wait is clipped by the cap at 2 and 4 tokens a second, not at 1.
  assert.deepEqual(Object.values(oracle.runs).map((c) => c.at(-1)!.tokens), [3, 4, 4]);
});
test('token buckets match an independent quarter-token ledger at varied rates and capacities', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 16 }), fc.integer({ min: 1, max: 24 }),
    fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 80 }),
    (rate, capacity, elapsedTicks) => {
      const bucket = new TokenBucket(rate, capacity);
      // One tick is a quarter second; reference credits are quarter-tokens.
      // Integer accounting makes repeated timestamps and exact refill edges exact.
      let credits = capacity * 4;
      let ticks = 0;
      for (const elapsed of elapsedTicks) {
        ticks += elapsed;
        credits += elapsed * rate;
        if (credits > capacity * 4) credits = capacity * 4;
        const accepted = credits >= 4;
        if (accepted) credits -= 4;
        assert.equal(bucket.allow(ticks / 4), accepted);
        assert.equal(bucket.tokens, credits / 4);
        assert.equal(bucket.lastRefill, ticks / 4);
      }
    },
  ), params(300));
});
test('token-bucket: the state readout shows scene.state at the end of every step, at every rate', async () => {
  await loadFonts();
  for (const rate of ['1', '2', '4']) {
    const checked = await assertViewFollowsState(
      withSettings(TokenBucketExplainer, { rate }),
      (scene) => (scene as unknown as { readout: View | null }).readout,
    );
    assert.equal(checked, 5, `rate ${rate}: the readout is checked at all five steps`);
  }
});
test('ring wraps into freed slots and Full changes no state', () => {
  assert.deepEqual(ringStory('wrap').at(-1)!.result, { head: 2, tail: 2, length: 5, data: [6, 7, 3, 4, 5] });
  const full = ringStory('full');
  assert.deepEqual(full[5]!.result, full[4]!.result);
  assert.deepEqual(full[6]!.result, full[4]!.result);
  assert.equal(full[5]!.error, 'Full');
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 24 }),
    fc.array(fc.oneof(fc.constant({ kind: 'pop' as const }), fc.integer().map((value) => ({ kind: 'push' as const, value }))), { maxLength: 80 }),
    (capacity, commands) => {
      const ring = new RingBuffer<number>(capacity);
      const reference: number[] = [];
      for (const command of commands) {
        const before = ring.snapshot();
        if (command.kind === 'pop') {
          if (reference.length) assert.equal(ring.pop(), reference.shift());
          else {
            assert.throws(() => ring.pop(), /^Error: Empty$/);
            assert.deepEqual(ring.snapshot(), before);
          }
        } else if (reference.length === capacity) {
          assert.throws(() => ring.push(command.value), Full);
          assert.deepEqual(ring.snapshot(), before);
        } else {
          ring.push(command.value);
          reference.push(command.value);
        }
        assert.equal(ring.length, reference.length);
        assert.ok(ring.head >= 0 && ring.head < capacity && ring.tail >= 0 && ring.tail < capacity);
        assert.deepEqual(Array.from({ length: ring.length }, (_, i) => ring.data[(ring.head + i) % capacity]), reference);
      }
      // Drain even traces ending in pushes, so the tail's complete FIFO order is observed.
      while (reference.length) assert.equal(ring.pop(), reference.shift());
      assert.throws(() => ring.pop(), /^Error: Empty$/);
    },
  ), params(300));
});
test('shell execution returns a new filesystem and never mutates its input', () => {
  const original = { fs: {}, steps: 0 };
  const next = exec(
    original,
    [
      ['echo', 'hello'],
      ['tr', 'a-z', 'A-Z'],
    ],
    'shout.txt',
  );
  assert.deepEqual(original, { fs: {}, steps: 0 });
  assert.equal(next.shell.fs['shout.txt'], 'HELLO\n');
  assert.equal(next.stdout, '');
  assert.equal(exec(original, [['cat', 'shout.txt']]).stdout, '');
  assert.equal(exec(next.shell, [['cat', 'shout.txt']]).stdout, 'HELLO\n');
});
test('property: exec leaves any shell it is given unchanged and puts a redirect’s write only in the shell it returns', () => {
  const name = fc.constantFrom('a.txt', 'b.txt', 'shout.txt');
  const stage = fc.oneof(
    fc.tuple(fc.constant('echo'), fc.string({ maxLength: 6 })),
    fc.constant(['tr', 'a-z', 'A-Z'] as const),
    fc.tuple(fc.constant('cat'), name),
  );
  fc.assert(fc.property(
    fc.dictionary(name, fc.string({ maxLength: 6 })),
    fc.nat(5),
    fc.array(stage, { minLength: 1, maxLength: 4 }),
    fc.option(name, { nil: undefined }),
    (files, steps, stages, redirect) => {
      const shell = { fs: { ...files }, steps },
        before = structuredClone(shell);
      const run = exec(shell, stages, redirect);
      assert.deepEqual(shell, before);
      if (redirect) {
        assert.equal(run.stdout, '');
        assert.ok(redirect in run.shell.fs);
      }
      for (const f of Object.keys(run.shell.fs)) if (f !== redirect) assert.equal(run.shell.fs[f], shell.fs[f]);
    },
  ), params(300));
});
test('noon sunlight per square metre is sin of the noon altitude, and the orbit is about 3.4% farther in July', () => {
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const share = noonShare(latitude, declination), altitude = sunlight(latitude, declination).altitude;
      assert.ok(share >= 0 && share <= 1);
      // A beam one metre across at right angles to the rays lights 1 / sin(altitude) metres of level ground.
      if (altitude > 0) assert.ok(Math.abs(share - 1 / (1 / Math.sin((altitude * Math.PI) / 180))) < 1e-12);
      else assert.equal(share, 0);
    },
  ), params(300));
  // By hand: London's June noon Sun at 61.94° gives sin 61.94° = 0.882; December's 15.06° gives 0.260.
  assert.ok(Math.abs(noonShare(51.5, 23.44) - 0.882) < 0.001);
  assert.ok(Math.abs(noonShare(51.5, -23.44) - 0.26) < 0.001);
  assert.equal(noonShare(69.65, -23.44), 0);
  // Wikipedia's R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g: 0.98329 AU at perihelion (g = 0) and
  // 1.01671 AU half a year later (g = 180°), 3.4% farther, so sunlight is (1.01671 / 0.98329)² = 1.069 times stronger in January.
  assert.ok(Math.abs(sunDistance(2) - 0.98329) < 1e-9);
  assert.ok(Math.abs(sunDistance(2 + 365 / 2) - 1.01671) < 1e-9);
  const days = Array.from({ length: 365 }, (_, d) => sunDistance(d));
  assert.equal(days.indexOf(Math.min(...days)), 2, 'nearest in early January');
  assert.ok([184, 185].includes(days.indexOf(Math.max(...days))), 'farthest in early July');
  assert.ok(Math.abs(sunDistance(2 + 365 / 2) / sunDistance(2) - 1.034) < 0.001);
});
test('a noon beam one metre across lights the stretch of level ground its two edge rays meet, and none when the Sun is down', () => {
  const rad = Math.PI / 180;
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const altitude = sunlight(latitude, declination).altitude, patch = noonPatch(latitude, declination);
      if (altitude <= 0) return assert.equal(patch, null);
      // Geometry, not the formula: one edge ray lands at the origin, travelling (cos a, −sin a); the other runs
      // parallel, one metre away at right angles, through (sin a, cos a). Where it meets the ground, y = 0.
      const a = altitude * rad, t = Math.cos(a) / Math.sin(a);
      const x = Math.sin(a) + t * Math.cos(a);
      assert.ok(patch !== null && Math.abs(patch - x) < 1e-9 * Math.max(1, x), `${latitude}, ${declination}: ${patch} against ${x}`);
      assert.ok(patch >= 1 - 1e-12, 'no patch is shorter than the beam is wide');
      assert.ok(Math.abs(patch * noonShare(latitude, declination) - 1) < 1e-9, 'the share per m² is one over the patch');
    },
  ), params(300));
  // London: 1.13 m in June against 3.85 m in December, 3.4 times as long; Tromsø's December noon Sun is down;
  // Quito's June and December patches are one length.
  assert.equal(noonPatch(51.5, 23.44)!.toFixed(2), '1.13');
  assert.equal(noonPatch(51.5, -23.44)!.toFixed(2), '3.85');
  assert.equal((noonPatch(51.5, -23.44)! / noonPatch(51.5, 23.44)!).toFixed(1), '3.4');
  assert.equal(noonPatch(69.65, -23.44), null);
  assert.equal(noonPatch(0, 23.44), noonPatch(0, -23.44));
});
test('sunlight follows the sunrise equation: bounded, hemisphere-symmetric, polar extremes and mid-latitude hours', () => {
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const value = sunlight(latitude, declination);
      assert.ok(Number.isFinite(value.daylight) && value.daylight >= 0 && value.daylight <= 24);
      assert.ok(Math.abs(value.daylight - sunlight(-latitude, -declination).daylight) < 1e-10);
      // Opposite seasons partition one rotation, including polar day/night.
      assert.ok(Math.abs(value.daylight + sunlight(latitude, -declination).daylight - 24) < 1e-10);
      assert.equal(value.altitude, 90 - Math.abs(latitude - declination));
    },
  ), params(300));
  assert.equal(sunlight(69.65, 23.44).daylight, 24);
  assert.equal(sunlight(69.65, -23.44).daylight, 0);
  assert.deepEqual(daylightYear(0), Array(12).fill(12));
  // By hand from cos ω = −tan φ · tan δ, hours = ω / 7.5°: at φ = 51.5°, tan φ · tan 23.44° = 1.2572 × 0.4336
  // = 0.5451, so ω = acos(−0.5451) = 123.03° and the day is 16.40 h; in December it is 24 − 16.40 = 7.60 h.
  assert.ok(Math.abs(sunlight(51.5, 23.44).daylight - 16.4) < 0.01);
  assert.ok(Math.abs(sunlight(51.5, -23.44).daylight - 7.6) < 0.01);
  assert.ok(sunlight(-33.87, 23.44).daylight < 12);
  // Mid-month declinations, δ = −23.44° × cos(360° × (day + 10) / 365): 15 June (day 165) puts the
  // Arctic Circle in full day and 15 December (day 348) in full night; at 65°N on 15 December
  // δ = −23.27°, so ω = acos(2.1445 × 0.4301) = 22.71° and the day is 3.0 h.
  assert.equal(daylightYear(69.65)[5], 24);
  assert.equal(daylightYear(69.65)[11], 0);
  assert.equal(daylightYear(65)[11], 3);
  // Near the equinox δ moves fastest, so this pins the day offset: on 15 March (day 73) δ = −3.32°,
  // ω = acos(2.1445 × 0.0580) = 82.86° and the day at 65°N is 11.0 h (a day's shift gives 11.2).
  assert.equal(daylightYear(65)[2], 11);
});
test('on the equator the day–night line cuts the circle in half: 12 hours at every declination and on every day of the year', () => {
  // The seasons page says the equator's circle is always cut in half; it draws only the two solstices.
  fc.assert(fc.property(
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (declination) => assert.ok(Math.abs(sunlight(0, declination).daylight - 12) < 1e-12, `${declination}°`),
  ), params(300));
  // daylightYear's declination, δ = −23.44° × cos(360° × (day + 10) / 365), on each of the 365 days.
  const declination = (day: number) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
  for (let day = 0; day < 365; day++) assert.ok(Math.abs(sunlight(0, declination(day)).daylight - 12) < 1e-12, `day ${day}`);
  assert.deepEqual(daylightYear(0), Array(12).fill(12));
});
test('blob ids are SHA-1 of the typed bytes, across the hash\'s padding boundaries and in UTF-8', () => {
  // With the 8-byte header "blob NN\0", 47, 48 and 56 bytes of content make 55, 56 and 64-byte
  // messages, SHA-1's one- and two-block padding edges.
  for (const content of ['', 'a', 'é', 'x'.repeat(47), 'x'.repeat(48), 'x'.repeat(56), 'x'.repeat(120), 'naïve 中文\n'.repeat(9)]) {
    const bytes = Buffer.from(content, 'utf8');
    const expected = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
    assert.equal(new Repo().blob(content), expected, JSON.stringify(content));
  }
});
test('both git cases hash the exact typed bytes used by the Git CLI', () => {
  for (const change of ['add', 'edit']) {
    const repo = new Repo(),
      hello = repo.blob('hello\n'),
      t1 = repo.tree([['100644', 'hello.txt', hello]]),
      c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' }),
      next = repo.blob(change === 'add' ? 'world\n' : 'hello again\n'),
      t2 = repo.tree(
        change === 'add'
          ? [
              ['100644', 'hello.txt', hello],
              ['100644', 'world.txt', next],
            ]
          : [['100644', 'hello.txt', next]],
      );
    repo.commit({ tree: t2, parents: [c1], author: AUTHOR, message: 'second\n' });
    for (const [id, obj] of Object.entries(repo.objects))
      assert.equal(
        execFileSync('git', ['hash-object', '-t', obj.type, '--stdin'], {
          input: obj.bytes,
          encoding: 'utf8',
        }).trim(),
        id,
      );
  }
});
// Expected values are the assertions in 2password's test/find.test.ts, which uses the same three items.
test('2password find port gives upstream test answers', () => {
  assert.deepEqual(find(['database', 'cloud api', 'cloud']).matches, [
    {
      ref: 'op://Personal/Cloud API/credential',
      title: 'Cloud API',
      kind: 'api-credential',
      queries: ['cloud api', 'cloud'],
    },
    { ref: 'op://Work/Cloud Login/password', title: 'Cloud Login', kind: 'login', queries: ['cloud'] },
    { ref: 'op://Work/Database/password', title: 'Database', kind: 'database', queries: ['database'] },
  ]);
  const miss = find(['databse', 'nothing like this']);
  assert.deepEqual(miss.fetched, ['Database']);
  assert.deepEqual(miss.matches, []);
  assert.deepEqual(miss.suggestions, [
    { query: 'databse', ref: 'op://Work/Database/password', title: 'Database', kind: 'database' },
  ]);
  assert.deepEqual(find(['database']).matches, [
    { ref: 'op://Work/Database/password', title: 'Database', kind: 'database' },
  ]);
  // By hand: one insertion turns databse into database (1 − 1/8); Cloud API's best word, api, is 6 edits away (1 − 6/7).
  assert.equal(distance('databse', 'database'), 1);
  assert.equal(closeness(['databse'], 'Database'), 0.875);
  assert.equal(closeness(['databse'], 'Cloud API'), 1 - 6 / 7);
  assert.equal(closeness(['databse'], 'Cloud Login'), 0);
  assert.equal(closeness(['opnai', 'key'], 'OpenAI API Key'), (1 - 1 / 6 + 1) / 2);
  assert.ok(!JSON.stringify(find(['cloud', 'databse'])).includes('secret-'));
});
test('2password find returns references and no field value, and compares queries with titles alone', () => {
  const queries = [['cloud api', 'databse'], ['cloud'], ['cloud key'], ['clod api'], ['database', 'nothing like this']];
  const values = ITEMS.flatMap((i) => i.fields.map((f) => f.value));
  // Every value the vault holds is absent from every answer find prints.
  for (const q of queries) {
    const printed = JSON.stringify(find(q));
    for (const v of values) assert.ok(!printed.includes(v), `${q.join(', ')} printed ${v}`);
  }
  // Changing every secret changes no answer: only titles decide what comes back.
  const changed = ITEMS.map((i) => ({ ...i, fields: i.fields.map((f) => ({ ...f, value: `${i.title} other secret` })) }));
  for (const q of queries) assert.deepEqual(find(q, changed), find(q));
});
test('2password run strips the service token only when op holds one', () => {
  const ref = { API_KEY: 'op://Personal/Cloud API/credential' };
  const service = run('service', ref, ['app']),
    desktop = run('desktop', ref, ['app']);
  assert.deepEqual(service.argv, ['op', 'run', '--', 'env', '-u', 'OP_SERVICE_ACCOUNT_TOKEN', 'app']);
  assert.deepEqual(desktop.argv, ['op', 'run', '--', 'app']);
  assert.ok('OP_SERVICE_ACCOUNT_TOKEN' in service.opEnv);
  for (const r of [service, desktop])
    assert.deepEqual(r.childEnv, { PATH: '/usr/bin', API_KEY: 'secret-cloud-api' });
});

// Picture side of the fidelity pattern for state-machine and ring-buffer: each View of scene.state
// (state-machine's Session card; ring-buffer's readout, card values and waiting push argument)
// shows, at the end of every step of every case, exactly what that step's traced state renders.
// Imports are aliased so that blocks like this one can sit side by side in this file.
import { collectProject as collectViewProject } from '../tools/lib/explain-project.ts';
import { assertViewFollowsState as viewFollowsState } from './lib/view-fidelity.ts';
import { loadFonts as loadViewFonts } from '../src/index.ts';
import type { Scene as ViewScene, View as StateView } from '../src/index.ts';
import { withSettings as viewSettings } from '../explain/index.ts';
import RingBufferExplainer from '../scenes/explainers/ring-buffer/scene.ts';
test('state-machine: its Session card shows the traced state at every step, in every case', async () => {
  const project = await collectViewProject('scenes/explainers/state-machine', { write: false });
  for (const theCase of project.cases) {
    const checked = await viewFollowsState(
      theCase.Scene,
      (scene) => (scene as unknown as { readout?: StateView }).readout,
    );
    const expected=theCase.values.events==='success'?['machine','connect','opened','close','terminal']:['machine','connect','error','terminal'];
    assert.deepEqual(theCase.trace.steps.filter(s=>s.meta.kind === 'detail').map(s=>s.step),expected);
    assert.equal(checked, expected.length, `${JSON.stringify(theCase.values)}: the Session card is checked at every program-walkthrough step`);
  }
});
test('ring-buffer views show the traced state at every step, in both cases', async () => {
  await loadViewFonts();
  for (const operations of ['wrap', 'full']) {
    const Ring = viewSettings(RingBufferExplainer, { operations });
    for (const name of ['ring', 'readout', 'results'] as const) {
      const pick = (scene: ViewScene) => (scene as unknown as Record<typeof name, StateView | undefined>)[name];
      assert.equal(await viewFollowsState(Ring, pick), 4, `${operations}: ${name} checked at all four steps`);
    }
  }
});

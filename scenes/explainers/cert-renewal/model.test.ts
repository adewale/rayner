import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { BACKDATE, BR_PHASES, DAY, EMISSION, FIXED_INTERVAL, LE_DATES, LIFETIMES, LIMIT, RUN_EVERY, YEAR, ariRuns, ariSummary, ariTime, ariWindow, defaultRenewalOffset, maybeSpend, orderAllowed, spendAtIssue, dueByDefault, dueByInterval, dueOffset, issue, shouldRenew, simulate, summarize } from './model.ts';
import type { LifetimeKey, Rule } from './model.ts';

const hours = (ms: number) => ms / 3600e3;

const lifetime = fc.integer({ min: 1, max: 400 * 24 });

test('the default renewal time matches certbot’s own test vectors', () => {
  // certbot v5.8.0 renewal_test.py:272–280: certificates issued 2025-03-12 00:00 for 8 and 18 days.
  const issued = Date.UTC(2025, 2, 12);
  for (const [lifetimeDays, expected] of [
    [8, Date.UTC(2025, 2, 16)],
    [18, Date.UTC(2025, 2, 24)],
  ] as const)
    assert.equal(defaultRenewalOffset(lifetimeDays * DAY), hours(expected - issued), `${lifetimeDays}-day certificate`);
  // The switch is "lifetime < 10 days" (renewal.py:426): exactly ten days takes two thirds.
  assert.equal(defaultRenewalOffset(10 * DAY), (10 * DAY * 2) / 3);
  assert.equal(defaultRenewalOffset(10 * DAY - 1 / 3600), (10 * DAY - 1 / 3600) / 2);
});

test('renew_before_expiry and the default agree with certbot’s 7-day certificate vectors', () => {
  // certbot v5.8.0 renewal_test.py:295 and 356–385 (no ARI answer): a 7-day certificate from
  // 2014-12-11 22:34:45 UTC. Interval strings are in hours; null is "unset", so the default applies.
  const notBefore = hours(Date.UTC(2014, 11, 11, 22, 34, 45)),
    notAfter = notBefore + 7 * DAY;
  const at = (unix: number) => unix / 3600;
  const vectors: [number, number | null, boolean][] = [
    [1418472000, 168, true],
    [1418472000, null, false],
    [1418472000, 96, false],
    [1418472000, 48, false],
    [1418760000, null, true],
    [1418760000, 24, false],
    [1241179200, 8, false],
    [1241179200, 48, false],
    [1241179200, 960, false],
    [1420070400, 0, true],
    [1420070400, 10 / 3600, true],
    [1420070400, 10 / 60, true],
    [1420070400, 1680, true],
  ];
  for (const [now, interval, expected] of vectors)
    assert.equal(
      interval == null ? dueByDefault(notBefore, notAfter, at(now)) : dueByInterval(notAfter, at(now), interval),
      expected,
      `at ${now} with ${interval ?? 'no'} interval`,
    );
});

test('Certbot 3.3’s 30-day rule renews strictly inside 30 days of expiry', () => {
  // certbot v3.3.0 constants.py:155 "30 days"; storage.py:1010 `if expiry < add_time_interval(now, interval)`.
  assert.equal(FIXED_INTERVAL, 30 * DAY);
  const c = { issued: 0, notBefore: 0, notAfter: 90 * DAY };
  assert.equal(shouldRenew('fixed30', c, 60 * DAY), false, 'exactly 30 days left is not yet due');
  assert.equal(shouldRenew('fixed30', c, 60 * DAY + 1 / 3600), true);
  // For 90-day certificates two thirds is the same moment, which is why 4.1 changed nothing there.
  assert.equal(shouldRenew('fraction', c, 60 * DAY), false);
  assert.equal(shouldRenew('fraction', c, 60 * DAY + 1 / 3600), true);
});

test('Let’s Encrypt’s validity window: backdated 58.5 minutes, one second short', () => {
  // boulder 4e1779d issuance/cert.go:127–135 with maxValidityBackdate 1h5m (test/config/ca.json:58);
  // ten production certificates on 2026-10-25 lasted 90 days less one second, with SCTs 58.46–58.54 min after notBefore.
  const c = issue(100, 90 * DAY);
  assert.equal(Math.round((100 - c.notBefore) * 3600), 58.5 * 60);
  assert.equal(Math.round((c.notAfter - c.notBefore) * 3600), 90 * 86400 - 1);
  assert.equal(BACKDATE, 0.975);
});

test('the explainer’s eight scenarios', () => {
  const expect: Record<LifetimeKey, Record<Rule, [number, number, number]>> = {
    // [run that renews, hours after issue; renewals in 365 days; refused in 365 days]
    '90d': { fraction: [60 * DAY, 6, 0], fixed30: [60 * DAY, 6, 0] },
    '64d': { fraction: [43 * DAY, 8, 0], fixed30: [34 * DAY, 10, 0] },
    '45d': { fraction: [30 * DAY, 12, 0], fixed30: [15 * DAY, 24, 0] },
    '160h': { fraction: [84, 104, 0], fixed30: [12, 264, 465] },
  };
  for (const key of Object.keys(expect) as LifetimeKey[])
    for (const rule of ['fraction', 'fixed30'] as Rule[]) {
      const s = summarize(rule, key),
        [renewsAt, renewals, refused] = expect[key][rule];
      assert.deepEqual([s.renewsAt, s.renewalsPerYear, s.refusedPerYear], [renewsAt, renewals, refused], `${key} ${rule}`);
    }
  // The title's claim: the 30-day rule renews 45-day certificates twice as often as the default.
  assert.equal(summarize('fixed30', '45d').renewalsPerYear, 2 * summarize('fraction', '45d').renewalsPerYear);
});

test('the margin view: 30 days back from expiry lands before issue only for certificates of 30 days or less', () => {
  // Worked by hand from notAfter = notBefore + lifetime − 1 s: the due point is lifetime − 720 h − 1 s after notBefore.
  const second = 1 / 3600,
    close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  close(dueOffset('fixed30', LIFETIMES['90d'].hours), 2160 - 720 - second);
  close(dueOffset('fixed30', LIFETIMES['64d'].hours), 1536 - 720 - second);
  close(dueOffset('fixed30', LIFETIMES['45d'].hours), 1080 - 720 - second);
  // The margin view's 160-hour row: 560 hours, 23.3 days, before notBefore, so due from issue.
  close(dueOffset('fixed30', LIFETIMES['160h'].hours), 160 - 720 - second);
  assert.equal((560 / DAY).toFixed(1), '23.3');
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 400 * DAY }), (lifetime) => {
      const c = issue(0, lifetime),
        before = dueOffset('fixed30', lifetime) < 0;
      assert.equal(before, lifetime <= FIXED_INTERVAL);
      // Before issue means the first run already finds it due.
      if (before) assert.equal(shouldRenew('fixed30', c, RUN_EVERY), true);
    }),
    params(200),
  );
});

test('Boulder’s GCRA, against its own TestDecide vector', () => {
  // boulder 4e1779d ratelimits/gcra_test.go:13–60: burst 10, one per second, clock at 0.
  const limit = { emissionS: 1, burst: 10 };
  let d = maybeSpend(null, 0, limit);
  assert.deepEqual(d, { allowed: true, tat: 1, retryInS: 0 }, 'resetIn 1 s');
  d = maybeSpend(d.tat, 0, limit, 9);
  assert.deepEqual(d, { allowed: true, tat: 10, retryInS: 0 }, 'new TAT 10 s ahead');
  const denied = maybeSpend(d.tat, 0, limit);
  assert.deepEqual(denied, { allowed: false, tat: 10, retryInS: 1 }, 'retryIn 1 s, bucket unchanged');
  assert.deepEqual(maybeSpend(denied.tat, 1, limit), { allowed: true, tat: 11, retryInS: 0 }, 'after waiting retryIn');
});

test('the exact-set limit: 5 per 168 hours is one token every 33.6 hours', () => {
  // limit.go:93–97: emissionInterval = period / count; docs/rate-limits.md:145–149 round it to 34.
  assert.deepEqual(LIMIT, { burst: 5, count: 5, periodHours: 168 });
  assert.equal(EMISSION, 33.6);
  // A fresh bucket takes five at once, then refuses the sixth for 33.6 hours.
  let tat: number | null = null;
  for (let i = 0; i < 5; i++) {
    assert.ok(orderAllowed(tat, 0), `order ${i + 1}`);
    tat = spendAtIssue(tat, 0);
  }
  assert.equal(tat, 5 * 33.6 * 3600);
  assert.equal(orderAllowed(tat, 0), false);
  assert.equal(maybeSpend(tat, 0).retryInS, 33.6 * 3600);
  assert.equal(orderAllowed(tat, 33.6 * 3600 - 1), false);
  assert.equal(orderAllowed(tat, 33.6 * 3600), true);
  // An order that names its predecessor inside the window skips the check (wfe.go:2297, 2488),
  // and its certificate's spend is best effort: with no room left it spends nothing (limiter.go:298).
  assert.equal(orderAllowed(tat, 0, true), true);
  assert.equal(spendAtIssue(tat, 0), tat);
});

test('the 160-hour, 30-day case: seven certificates in three days, then one per 24 or 36 hours', () => {
  // Worked by hand: after k issues from hour 0 the TAT is 33.6k hours, and a run at t passes
  // when 33.6(k + 1) − 168 ≤ t. k = 7 needs t ≥ 100.8, so 84 and 96 are refused and 108 issues.
  const run = simulate('fixed30', LIFETIMES['160h'].hours, 10 * DAY + 1);
  assert.deepEqual(run.issued, [0, 12, 24, 36, 48, 60, 72, 108, 144, 168, 204, 240]);
  assert.deepEqual(run.refused, [84, 96, 120, 132, 156, 180, 192, 216, 228]);
});

test('Boulder’s ARI window, worked from RenewalInfoSimple', () => {
  // core/objects.go:454–468. 45 days: validity from issuance = 3,888,000 − 3,510 s = 3,884,490 s;
  // ideal = notBefore + 3,887,999 − 1,294,830; margin 38,844.9 s; ends truncated to the second.
  const sec = (h: number) => Math.round(h * 3600);
  let c = issue(0, 45 * DAY),
    w = ariWindow(c);
  assert.deepEqual([sec(w.start - c.notBefore), sec(w.end - c.notBefore)], [2_554_324, 2_632_013]);
  // 160 hours is under ten days, so the ideal is half way: 575,999 − 286,245; margin 5,724.9 s.
  c = issue(0, 160);
  w = ariWindow(c);
  assert.deepEqual([sec(w.start - c.notBefore), sec(w.end - c.notBefore)], [284_029, 295_478]);
});

test('the ARI window matches Let’s Encrypt’s live answers', () => {
  // GET https://acme-v02.api.letsencrypt.org/acme/renewal-info/<AKI>.<serial> on 2026-10-25,
  // for the certificate each site served that day: [site, notBefore, notAfter, start, end].
  const live: [string, string, string, string, string][] = [
    ['caddyserver.com', '2026-10-12T12:02:35Z', '2027-01-10T12:02:34Z', '2026-12-10T14:46:39Z', '2026-12-12T09:57:28Z'],
    ['certbot.eff.org', '2026-10-22T20:00:53Z', '2027-01-20T20:00:52Z', '2026-12-20T22:44:57Z', '2026-12-22T17:55:47Z'],
    ['community.letsencrypt.org', '2026-10-17T00:01:41Z', '2027-01-15T00:01:40Z', '2026-12-15T02:45:45Z', '2026-12-16T21:56:35Z'],
    ['eff.org', '2026-10-01T18:44:08Z', '2026-12-30T18:44:07Z', '2026-11-29T21:28:12Z', '2026-12-01T16:39:02Z'],
    ['kernel.org', '2026-10-14T10:52:45Z', '2027-01-12T10:52:44Z', '2026-12-12T13:36:49Z', '2026-12-14T08:47:39Z'],
    ['letsdebug.net', '2026-09-30T08:56:16Z', '2026-12-29T08:56:15Z', '2026-11-28T11:40:20Z', '2026-11-30T06:51:10Z'],
    ['letsencrypt.org', '2026-09-04T14:34:32Z', '2026-12-03T14:34:31Z', '2026-11-02T17:18:36Z', '2026-11-04T12:29:25Z'],
    ['valid-isrgrootx1.letsencrypt.org', '2026-10-21T17:38:33Z', '2027-01-19T17:38:32Z', '2026-12-19T20:22:37Z', '2026-12-21T15:33:27Z'],
    ['valid-isrgrootx2.letsencrypt.org', '2026-10-15T17:38:33Z', '2027-01-13T17:38:32Z', '2026-12-13T20:22:37Z', '2026-12-15T15:33:26Z'],
    ['www.debian.org', '2026-10-01T00:37:05Z', '2026-12-30T00:37:04Z', '2026-11-29T03:21:09Z', '2026-11-30T22:31:58Z'],
  ];
  const s = (iso: string) => Date.parse(iso) / 1000;
  for (const [site, nb, na, start, end] of live) {
    // Each lasts 90 days less one second.
    assert.equal(s(na) - s(nb), 90 * 86400 - 1, site);
    const c = issue(0, 90 * DAY),
      w = ariWindow(c),
      off = (h: number) => Math.round((h - c.notBefore) * 3600);
    // The model issues at notBefore + 58.5 min exactly; the real instant is up to a second
    // later, which can move an end one second later, never earlier.
    assert.equal(s(start) - s(nb) - off(w.start), 0, `${site} start`);
    assert.ok([0, 1].includes(s(end) - s(nb) - off(w.end)), `${site} end`);
  }
});

test('Certbot’s ARI runs: the run at t renews with chance (t − start) / (end − start)', () => {
  // client.py:365–368 draws uniformly in the window at each run; renewal.py:466 renews if now is past it.
  const a = ariSummary('fraction', '45d');
  assert.deepEqual(a.runs.map((r) => r.at), [720, 732]);
  // Window in run hours: 2,550,814 s to 2,628,503 s after the issuing run.
  assert.ok(Math.abs(a.runs[0]!.p - (720 * 3600 - 2_550_814) / (2_628_503 - 2_550_814)) < 1e-12);
  assert.deepEqual(a.perYear, [11, 12]);
  // The 30-day setting fires at day 15, long before the window: ARI changes nothing.
  assert.deepEqual(ariSummary('fixed30', '45d').runs, [{ at: 360, p: 1 }]);
  // For 90 days the window opens before the 30-day point, so the setting is not always first.
  assert.deepEqual(ariSummary('fixed30', '90d').runs.map((r) => r.at), [1428, 1440]);
  // 160 hours: the window (hours 77.9 to 81.1 after the run) holds no run, so hour 84 renews.
  assert.deepEqual(ariSummary('fraction', '160h').runs, [{ at: 84, p: 1 }]);
});

test('the Baseline Requirements and Let’s Encrypt tables as published', () => {
  // BR 2.3.1 §6.3.2 table, docs/BR.md:2192–2197.
  assert.deepEqual(
    BR_PHASES.map((p) => [p.from, p.before, p.days]),
    [
      [null, '2026-03-15', 398],
      ['2026-03-15', '2027-03-15', 200],
      ['2027-03-15', '2029-03-15', 100],
      ['2029-03-15', null, 47],
    ],
  );
  // Each phase starts where the last ended.
  for (let i = 1; i < BR_PHASES.length; i++) assert.equal(BR_PHASES[i]!.from, BR_PHASES[i - 1]!.before);
  // letsencrypt.org/2025/12/02/from-90-to-45, lines 23–25.
  assert.deepEqual(
    LE_DATES.map((d) => [d.date, d.profile, d.days]),
    [
      ['2026-05-13', 'tlsserver', 45],
      ['2027-02-10', 'classic', 64],
      ['2028-02-16', 'classic', 45],
    ],
  );
  // Every Let's Encrypt lifetime here fits the cap in force on its date.
  for (const d of LE_DATES) {
    const cap = BR_PHASES.find((p) => (p.from == null || p.from <= d.date) && (p.before == null || d.date < p.before))!;
    assert.ok(d.days <= cap.days, d.date);
  }
});

test('property: renewal comes before expiry, with a third (or half) of the lifetime left', () => {
  fc.assert(
    fc.property(lifetime, (L) => {
      const c = issue(0, L),
        life = c.notAfter - c.notBefore;
      const left = c.notAfter - (c.notBefore + defaultRenewalOffset(life));
      assert.ok(Math.abs(left - (life < 10 * DAY ? life / 2 : life / 3)) < 1e-9);
      // From the shortest profile (160 hours) up, each certificate is replaced before it expires:
      // the twice-daily run reaches the due time, and renewals stay under the rate limit's refill.
      if (L >= 160) {
        const { issued } = simulate('fraction', L, 3 * L);
        for (let i = 1; i < issued.length; i++) assert.ok(issued[i]! - issued[i - 1]! < L, `${L}: gap ${issued[i]! - issued[i - 1]!}`);
      }
    }),
    params(300),
  );
});

test('property: the 30-day rule renews at least as often as the default exactly when the lifetime is at most 90 days', () => {
  fc.assert(
    fc.property(fc.integer({ min: 31 * 24, max: 200 * 24 }), (L) => {
      const a = simulate('fixed30', L, YEAR).issued.length,
        b = simulate('fraction', L, YEAR).issued.length;
      if (L <= 90 * DAY) assert.ok(a >= b, `${L / DAY} days: ${a} < ${b}`);
      else assert.ok(a <= b, `${L / DAY} days: ${a} > ${b}`);
    }),
    params(200),
  );
});

test('property: no stretch of w hours issues more than the burst plus w / 33.6', () => {
  fc.assert(
    fc.property(lifetime, fc.constantFrom<Rule>('fraction', 'fixed30'), fc.integer({ min: 1, max: 60 }), (L, rule, span) => {
      const { issued } = simulate(rule, L, 60 * DAY),
        window = span * RUN_EVERY;
      for (const start of issued) {
        const inside = issued.filter((t) => t >= start && t < start + window).length;
        assert.ok(inside <= LIMIT.burst + window / EMISSION + 1e-9, `${inside} in ${window} h`);
      }
    }),
    params(200),
  );
});

test('property: the GCRA never lets more than burst + w / emission through in w seconds, and a refusal changes nothing', () => {
  const limit = { emissionS: 7, burst: 3 };
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 60 }), (steps) => {
      let tat: number | null = null,
        now = 0;
      const passed: number[] = [];
      for (const step of steps) {
        now += step;
        const d = maybeSpend(tat, now, limit);
        if (d.allowed) {
          passed.push(now);
          tat = d.tat;
        } else assert.equal(d.tat, tat, 'a refusal leaves the bucket alone');
      }
      for (const a of passed)
        for (const b of passed)
          if (b >= a) {
            const inside = passed.filter((t) => t >= a && t <= b).length;
            assert.ok(inside <= limit.burst + (b - a) / limit.emissionS, `${inside} in [${a}, ${b}]`);
          }
    }),
    params(300),
  );
});

test('property: a Certbot draw always lands in the window, and the run it picks is one ariRuns lists', () => {
  const keys = Object.keys(LIFETIMES) as LifetimeKey[];
  fc.assert(
    fc.property(
      fc.constantFrom(...keys),
      fc.constantFrom<Rule>('fraction', 'fixed30'),
      fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), { minLength: 400, maxLength: 400 }),
      (key, rule, draws) => {
        const c = issue(0, LIFETIMES[key].hours),
          w = ariWindow(c),
          runs = ariRuns(rule, c);
        let picked: number | null = null;
        for (let i = 0, t = RUN_EVERY; picked == null && i < draws.length; i++, t += RUN_EVERY) {
          const at = ariTime(w, draws[i]!);
          // random.uniform(a, b) may return b (Python docs), so the window is closed.
          assert.ok(at >= w.start && at <= w.end, `${at} outside [${w.start}, ${w.end}]`);
          if (t > at || (rule === 'fixed30' && shouldRenew('fixed30', c, t))) picked = t;
        }
        assert.ok(picked != null && runs.some((r) => r.run === picked), `${key} ${rule}: run ${picked}`);
        // The chances of the listed runs add up to one.
        assert.ok(Math.abs(runs.reduce((sum, r) => sum + r.p, 0) - 1) < 1e-9);
      },
    ),
    params(300),
  );
});

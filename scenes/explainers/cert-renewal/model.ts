// When Certbot renews a certificate, under two rules, run by a twice-daily timer against
// Let's Encrypt's per-identifier-set rate limit. Pure TypeScript: the scene and the tests
// both read their numbers from here. Times are hours after the first certificate's notBefore.
//
// Its limits: the timer runs every twelve hours; certificate timestamps, backdating and limit
// recovery come from the pinned Certbot and Boulder sources. An explicit stored renew_before_expiry
// takes precedence over the 4.1 default. The rate-limit exemption needs both a replacement
// identifier and an order inside the predecessor's ARI window, and the modelled Certbot 5.8 orders
// carry no identifier. The ARI window is modelled around the due fraction from Boulder's rule, with
// repeated random draws; it is not a captured CA response. BR_PHASES and LE_DATES are the published
// schedules, context for the arithmetic, not a live policy lookup. Counts are consequences of these
// timings, not forecasts for a deployed installation.

export const DAY = 24;
export const YEAR = 365 * DAY;

/**
 * Certificate lifetimes the explainer offers, with where each comes from.
 * - 90 days: Let's Encrypt's classic profile today (docs/profiles.md, "Validity Period | 90 days").
 * - 64 days: classic from 2027-02-10; 45 days: tlsserver since 2026-05-13 and classic from
 *   2028-02-16 (letsencrypt.org/2025/12/02/from-90-to-45, lines 23–25).
 * - 160 hours: the shortlived profile (docs/profiles.md, "Validity Period | 160 hours").
 */
export const LIFETIMES = {
  '90d': { hours: 90 * DAY, label: '90 days' },
  '64d': { hours: 64 * DAY, label: '64 days' },
  '45d': { hours: 45 * DAY, label: '45 days' },
  '160h': { hours: 160, label: '160 hours' },
} as const;
export type LifetimeKey = keyof typeof LIFETIMES;

/**
 * - `fraction`: Certbot 4.1.0 and later with no renew_before_expiry and no ARI answer
 *   (certbot v5.8.0, src/certbot/_internal/renewal.py:425–429 and 484–487).
 * - `fixed30`: renew when notAfter < now + 30 days. Certbot 3.3.0 did this for every
 *   certificate (storage.py:1005–1010, constants.py:155); 4.1.0 and later do it when the
 *   renewal config sets renew_before_expiry = 30 days (renewal.py:475–482).
 * Why 4.1 and not 4.0, which the CHANGELOG and docs name: 4.0.0 read the setting through
 * config_with_defaults (storage.py:485), which merges RENEWER_DEFAULTS' "30 days" into every
 * lineage, so for lifetimes up to 90 days the 30-day test still fired first. Commit 3cbe1288c
 * ("Clean up renew_before_expiry default behavior", first in v4.1.0) removed that merge.
 */
export type Rule = 'fraction' | 'fixed30';
export const FIXED_INTERVAL = 30 * DAY;

/** Certbot's `_default_renewal_time` offset from notBefore: half the lifetime under 10 days, else two thirds. */
export function defaultRenewalOffset(lifetimeHours: number): number {
  // renewal.py:426: `if lifetime.total_seconds() < 10 * 86400`
  return lifetimeHours * 3600 < 10 * 86400 ? lifetimeHours / 2 : (lifetimeHours * 2) / 3;
}

/** Hours after notBefore at which the rule says "renew", for a certificate of this nominal lifetime. Negative: from issue. */
export function dueOffset(rule: Rule, lifetimeHours: number): number {
  const c = issue(0, lifetimeHours);
  return dueAt(rule, c) - c.notBefore;
}

/** renew_before_expiry: renew when notAfter < now + interval (3.3.0 storage.py:1010; 5.8.0 renewal.py:478). */
export function dueByInterval(notAfter: number, now: number, intervalHours: number): boolean {
  return notAfter < now + intervalHours;
}
/** The default since 4.1: renew when now > _default_renewal_time (5.8.0 renewal.py:484–487). */
export function dueByDefault(notBefore: number, notAfter: number, now: number): boolean {
  return now > notBefore + defaultRenewalOffset(notAfter - notBefore);
}

/** The documented cron line runs `certbot renew` at 00:00 and 12:00 (using.rst:965, "0 0,12 * * *"). */
export const RUN_EVERY = 12;

/**
 * Let's Encrypt's validity window for a certificate issued at `issued`. Boulder's
 * GenerateValidity (letsencrypt/boulder 4e1779d, issuance/cert.go:127–135) backdates notBefore
 * by 0.9 × maxValidityBackdate, truncated to the second, and ends one second short of the
 * profile's validity, because the last second counts. Boulder's own configs set
 * maxValidityBackdate to 1h5m (test/config/ca.json:58), which gives 58.5 minutes; Let's
 * Encrypt does not publish its production config, but production certificates show the same
 * number. Ten certificates fetched on 2026-10-25 (letsencrypt.org, eff.org, kernel.org,
 * www.debian.org and six more, issuers YE1, YE2, YR1, YR2) all last exactly 90 days less
 * one second, and their embedded SCT timestamps fall 58.46 to 58.54 minutes after notBefore.
 * Let's Encrypt's live ARI answers for those certificates (ariWindow, below) agree.
 */
export const BACKDATE = 0.9 * (65 / 60);
export const SECOND = 1 / 3600;
export interface Cert {
  issued: number;
  notBefore: number;
  notAfter: number;
}
export function issue(issued: number, lifetimeHours: number): Cert {
  const notBefore = issued - BACKDATE;
  return { issued, notBefore, notAfter: notBefore + lifetimeHours - SECOND };
}
/** The instant after which the rule says "renew". */
export function dueAt(rule: Rule, c: Cert): number {
  return rule === 'fraction' ? c.notBefore + defaultRenewalOffset(c.notAfter - c.notBefore) : c.notAfter - FIXED_INTERVAL;
}
/** One run of `certbot renew` at `now`, with no ARI answer. */
export function shouldRenew(rule: Rule, c: Cert, now: number): boolean {
  return rule === 'fraction' ? dueByDefault(c.notBefore, c.notAfter, now) : dueByInterval(c.notAfter, now, FIXED_INTERVAL);
}

/**
 * Let's Encrypt's "New Certificates per Exact Set of Identifiers", as Boulder enforces it
 * (letsencrypt/boulder 4e1779d, ratelimits/). The docs give 5 certificates per 7 days
 * (letsencrypt/website e336493, content/en/docs/rate-limits.md:145–149); Let's Encrypt
 * does not publish its production limit file,
 * so the burst, count and period below are read from the docs. A limit's emission interval
 * is period / count (limit.go:93–97): 168 h / 5 = 33.6 hours. The docs round it to 34,
 * as they round 168 h / 50 = 201.6 minutes to 202 for the per-domain limit.
 */
export const LIMIT = { burst: 5, count: 5, periodHours: 7 * DAY } as const;
/** Hours per token: 33.6. */
export const EMISSION = LIMIT.periodHours / LIMIT.count;
const EMISSION_S = (LIMIT.periodHours * 3600) / LIMIT.count;
const toS = (hours: number) => Math.round(hours * 3600);

/** A limit as Boulder precomputes it (limit.go:93–97), in seconds. */
export interface Gcra {
  emissionS: number;
  burst: number;
}
export const FQDN_SET: Gcra = { emissionS: EMISSION_S, burst: LIMIT.burst };

/**
 * Boulder's GCRA (gcra.go:12–60, maybeSpend), in whole seconds. A bucket is stored as its
 * theoretical arrival time `tat`; null is a bucket that does not exist yet, which reads as
 * full. A request costing n is allowed when now ≥ max(now, tat) + n × emission − burst ×
 * emission. A denial leaves the bucket as it was and says how long until it would pass.
 */
export function maybeSpend(
  tat: number | null,
  nowS: number,
  limit: Gcra = FQDN_SET,
  cost = 1,
): { allowed: boolean; tat: number | null; retryInS: number } {
  const from = tat == null ? nowS : Math.max(nowS, tat),
    next = from + limit.emissionS * cost,
    difference = nowS - (next - limit.emissionS * limit.burst);
  return difference < 0 ? { allowed: false, tat, retryInS: -difference } : { allowed: true, tat: next, retryInS: 0 };
}

/**
 * A new order's check against the limit. The WFE checks the exact-set bucket with a
 * check-only transaction (transaction.go:631–641, called from NewOrderLimitTransactions at
 * 664–701), so a refused order spends nothing. An order whose `replaces` names a certificate
 * of the same account, not replaced before, and arrives inside that certificate's ARI window
 * skips every new-order limit (wfe2/wfe.go:2258–2297 and 2488). Repeating the same names
 * within 120 days (wfe.go:2455–2470) exempts an order only from the per-account and
 * per-domain limits, not this one.
 */
export function orderAllowed(tat: number | null, nowS: number, ariExempt = false): boolean {
  return ariExempt || maybeSpend(tat, nowS).allowed;
}

/**
 * Issuing spends the token: the RA's countCertificateIssued (ra/ra.go:1255–1279) sends a
 * spend-only transaction, best effort, so it spends only if the bucket has room
 * (limiter.go:298) and never refuses. An ARI-exempt order still spends here.
 */
export function spendAtIssue(tat: number | null, nowS: number): number | null {
  return maybeSpend(tat, nowS).tat;
}

/**
 * Let's Encrypt's ARI answer for a certificate: Boulder's RenewalInfoSimple
 * (core/objects.go:449–468), reached through determineARIWindow (wfe2/wfe.go:2197–2240)
 * for a certificate that is neither revoked nor named in an incident. It takes the
 * validity from issuance (the CA's clock, ca/ca.go:449) to one second past notAfter, puts
 * the ideal time a third of that before the end (half for under ten days) and opens a
 * window 1% of the validity either side, truncated to the second. In nanoseconds, as Go does.
 * Issuance is taken as notBefore + 58.5 minutes exactly; the real instant is up to a second
 * later, since notBefore is truncated, and moves each end up to 0.35 s later. Against Let's
 * Encrypt's live answers for ten certificates on 2026-10-25, every start matched to the
 * second and every end matched or came one second later.
 */
export function ariWindow(c: Cert): { start: number; end: number } {
  const ns = 1_000_000_000n,
    issued = BigInt(toS(c.issued)) * ns,
    expires = BigInt(toS(c.notAfter)) * ns;
  const validity = expires + ns - issued,
    offset = validity < 10n * 86_400n * ns ? validity / 2n : validity / 3n,
    ideal = expires - offset,
    margin = validity / 100n;
  const toHours = (t: bigint) => Number((t - (((t % ns) + ns) % ns)) / ns) / 3600;
  return { start: toHours(ideal - margin), end: toHours(ideal + margin) };
}

/**
 * The runs that may renew `c` when every run gets an ARI answer, with the chance of each.
 * Certbot 4.1 and later fetch the answer whenever the stored Retry-After has passed
 * (certbot v5.8.0 renewal.py:378–392); Let's Encrypt sends 6 hours ± 20%
 * (wfe2/wfe.go:2827, 2841–2846), less than the 12 hours between runs, so every run asks.
 * Each fetch draws a fresh uniform time in the window (acme client.py:363–368) and the run
 * renews if now is past it (renewal.py:466), so a run at t renews with chance
 * (t − start) / (end − start) if no earlier run did. Under the 30-day rule a set
 * renew_before_expiry still renews on its own (renewal.py:475–482).
 */
export function ariRuns(rule: Rule, c: Cert): { run: number; p: number }[] {
  const { start, end } = ariWindow(c),
    out: { run: number; p: number }[] = [];
  let left = 1;
  for (let t = c.issued + RUN_EVERY; left > 0; t += RUN_EVERY) {
    const p = rule === 'fixed30' && dueByInterval(c.notAfter, t, FIXED_INTERVAL) ? 1 : Math.min(1, Math.max(0, (t - start) / (end - start)));
    if (p > 0) out.push({ run: t, p: left * p });
    left *= 1 - p;
  }
  return out;
}

/** A uniform draw `u` in [0, 1] placed in the window, as client.py:365–368 does; Python's random.uniform may return either end. */
export function ariTime(w: { start: number; end: number }, u: number): number {
  return w.start + u * (w.end - w.start);
}

export interface Run {
  /** Hours of the runs that issued a certificate; the first is hour 0. */
  readonly issued: number[];
  /** Hours of the runs whose renewal the limit refused. */
  readonly refused: number[];
}

/**
 * Issue a certificate at hour 0, then run `certbot renew` every RUN_EVERY hours until
 * `horizon` (exclusive). A renewal the limit refuses leaves the current certificate in
 * place, costs nothing, and the next run tries again. Certbot 5.8.0 sends no `replaces`
 * in its new order (acme/src/acme/client.py:115–135, identifiers and profile only), so no
 * renewal is ARI-exempt. With `ari`, every run gets an ARI answer and each certificate is
 * renewed at the earliest or the latest run `ariRuns` allows.
 */
export function simulate(rule: Rule, lifetimeHours: number, horizon: number, ari?: 'earliest' | 'latest'): Run {
  let current = issue(0, lifetimeHours),
    tat = spendAtIssue(null, 0);
  const issued = [0],
    refused: number[] = [];
  const target = (c: Cert) => {
    const runs = ariRuns(rule, c);
    return (ari === 'earliest' ? runs[0] : runs[runs.length - 1])!.run;
  };
  let due = ari ? target(current) : 0;
  for (let now = RUN_EVERY; now < horizon; now += RUN_EVERY) {
    if (ari ? now < due : !shouldRenew(rule, current, now)) continue;
    if (!orderAllowed(tat, toS(now))) {
      refused.push(now);
      continue;
    }
    tat = spendAtIssue(tat, toS(now));
    issued.push(now);
    current = issue(now, lifetimeHours);
    if (ari) due = target(current);
  }
  return { issued, refused };
}

export interface ScenarioSummary {
  lifetime: number;
  /** Hours after notBefore when the rule says "renew", clamped to 0 ("from issue"). */
  due: number;
  /** Hours after the issuing run of the first run that renews (ignoring the limit). */
  renewsAt: number;
  /** Hours from falling due to notAfter: the time left to retry a failed renewal. */
  slack: number;
  /** Runs inside that time: chances to renew if each run fails. */
  retries: number;
  /** Renewals in the 365 days after the first certificate (the first is not counted). */
  renewalsPerYear: number;
  /** Renewals the limit refused in those 365 days. */
  refusedPerYear: number;
  /** The first refused renewal, or null. */
  firstRefused: number | null;
}

export function summarize(rule: Rule, key: LifetimeKey): ScenarioSummary {
  const lifetime = LIFETIMES[key].hours,
    c = issue(0, lifetime),
    due = Math.max(c.notBefore, dueAt(rule, c));
  let renewsAt = RUN_EVERY;
  while (!shouldRenew(rule, c, renewsAt)) renewsAt += RUN_EVERY;
  const year = simulate(rule, lifetime, YEAR);
  let retries = 0;
  for (let t = RUN_EVERY; t < c.notAfter; t += RUN_EVERY) if (t > due) retries++;
  // Rounded to the second, the model's resolution: the backdate and the last second are exact.
  const round = (h: number) => Math.round(h * 3600) / 3600;
  return {
    lifetime,
    due: round(due - c.notBefore),
    renewsAt,
    slack: round(c.notAfter - due),
    retries,
    renewalsPerYear: year.issued.length - 1,
    refusedPerYear: year.refused.length,
    firstRefused: year.refused[0] ?? null,
  };
}

export interface AriSummary {
  /** Let's Encrypt's window, hours after notBefore. */
  start: number;
  end: number;
  /** Runs that may renew, hours after the issuing run, with the chance of each. */
  runs: { at: number; p: number }[];
  /** Renewals in 365 days if every certificate renews at its latest and at its earliest run. */
  perYear: [number, number];
}

/** What changes for this lifetime and rule when every run gets Let's Encrypt's ARI answer. */
export function ariSummary(rule: Rule, key: LifetimeKey): AriSummary {
  const lifetime = LIFETIMES[key].hours,
    c = issue(0, lifetime),
    w = ariWindow(c);
  const round = (h: number) => Math.round(h * 3600) / 3600;
  return {
    start: round(w.start - c.notBefore),
    end: round(w.end - c.notBefore),
    runs: ariRuns(rule, c).map((r) => ({ at: r.run, p: r.p })),
    perYear: [simulate(rule, lifetime, YEAR, 'latest').issued.length - 1, simulate(rule, lifetime, YEAR, 'earliest').issued.length - 1],
  };
}

/** The window the year step draws: a year, or two weeks for 160-hour certificates. */
export function windowFor(key: LifetimeKey): number {
  return key === '160h' ? 14 * DAY : YEAR;
}

/**
 * Maximum validity periods, Baseline Requirements 2.3.1 §6.3.2
 * (cabforum/servercert docs/BR.md:2183–2199).
 */
export const BR_PHASES = [
  { from: null, before: '2026-03-15', days: 398 },
  { from: '2026-03-15', before: '2027-03-15', days: 200 },
  { from: '2027-03-15', before: '2029-03-15', days: 100 },
  { from: '2029-03-15', before: null, days: 47 },
] as const;

/** Let's Encrypt's schedule (letsencrypt.org/2025/12/02/from-90-to-45, lines 23–25). */
export const LE_DATES = [
  { date: '2026-05-13', profile: 'tlsserver', days: 45 },
  { date: '2027-02-10', profile: 'classic', days: 64 },
  { date: '2028-02-16', profile: 'classic', days: 45 },
] as const;

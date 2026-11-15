// The oracle, copied from scenes/explainers/cert-renewal/model.test.ts, where each value is recorded or
// published: Certbot v5.8.0's own test vectors (renewal_test.py:272-280), Boulder's hand-worked
// RenewalInfoSimple windows (core/objects.go:454-468), the ARI windows Let's Encrypt served on 2026-10-25 for
// ten 90-day certificates, the hand-worked 160-hour sequence under the exact-set limit, and the Baseline
// Requirements and Let's Encrypt lifetime tables. The method-only page draws its ARI step and its policy
// timelines from these values, and method.test.ts requires the model to agree with them.

/** Certbot 5.8.0: a certificate issued 2025-03-12 00:00 UTC for 8 and 18 days renews on these dates. */
export const CERTBOT_DEFAULT = [
  { lifetimeDays: 8, renewsUtc: '2025-03-16T00:00:00Z' },
  { lifetimeDays: 18, renewsUtc: '2025-03-24T00:00:00Z' },
] as const;

/** Boulder's window, seconds after notBefore: 45 days and 160 hours (worked by hand from RenewalInfoSimple). */
export const BOULDER_WINDOW_S = { '45d': [2_554_324, 2_632_013], '160h': [284_029, 295_478] } as const;

/** GET .../renewal-info/<AKI>.<serial> on 2026-10-25: [site, notBefore, notAfter, window start, window end]. */
export const LIVE_ARI: readonly (readonly [string, string, string, string, string])[] = [
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

/** 160-hour certificates under a 30-day setting, runs every 12 hours from hour 0, over 10 days: issued and refused runs. */
export const SHORT_SEQUENCE = {
  issued: [0, 12, 24, 36, 48, 60, 72, 108, 144, 168, 204, 240],
  refused: [84, 96, 120, 132, 156, 180, 192, 216, 228],
} as const;

/** Baseline Requirements 2.3.1 section 6.3.2 and Let's Encrypt's announced schedule. */
export const BR = [
  { from: null, days: 398 },
  { from: '2026-03-15', days: 200 },
  { from: '2027-03-15', days: 100 },
  { from: '2029-03-15', days: 47 },
] as const;
export const LETS_ENCRYPT = [
  { date: '2026-05-13', profile: 'tlsserver', days: 45 },
  { date: '2027-02-10', profile: 'classic', days: 64 },
  { date: '2028-02-16', profile: 'classic', days: 45 },
] as const;

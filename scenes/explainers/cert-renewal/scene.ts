import { Scene, Group, Line, Rectangle, Text, FadeOut } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  BACKDATE,
  BR_PHASES,
  DAY,
  EMISSION,
  LE_DATES,
  LIFETIMES,
  LIMIT,
  FIXED_INTERVAL,
  RUN_EVERY,
  YEAR,
  ariSummary,
  dueAt,
  dueByInterval,
  dueOffset,
  issue,
  simulate,
  summarize,
  windowFor,
} from '../lib/cert-renewal.ts';
import type { LifetimeKey, Rule } from '../lib/cert-renewal.ts';

const STYLE = 'excalidraw';
const RULES: Record<Rule, { name: string; short: string }> = {
  fraction: { name: 'Certbot 4.1+ default', short: 'the default rule' },
  fixed30: { name: '30 days before expiry', short: 'the 30-day rule' },
};

// Baseline Requirements 2.3.1 §6.3.2, docs/BR.md:2183–2199 (cabforum/servercert 3574ae8).
const BR_SOURCE = [
  'timeline',
  '  title Longest a public TLS certificate may last',
  `  Before ${BR_PHASES[1].from} : ${BR_PHASES[0].days} days`,
  ...BR_PHASES.slice(1).map((p) => `  ${p.from} : ${p.days} days`),
].join('\n');
// Let's Encrypt, "Decreasing Certificate Lifetimes to 45 Days", lines 23–25; the last period stays the BR's.
const LE_EVENTS = LE_DATES.map((d) => `${d.profile} profile, ${d.days} days`);
const LE_SOURCE = [
  'timeline',
  '  title Let’s Encrypt’s certificate lifetimes',
  ...LE_DATES.map((d, i) => `  ${d.date} : ${LE_EVENTS[i]}`),
  `  ${BR_PHASES[3].from} : every public CA, ${BR_PHASES[3].days} days at most`,
].join('\n');
const LE_OPS = [
  { kind: 'set_title', title: 'Let’s Encrypt’s certificate lifetimes' },
  ...LE_DATES.flatMap((d, i) => [
    { kind: 'set_period_label', sectionIndex: 0, periodIndex: i, label: d.date },
    { kind: 'set_event_text', sectionIndex: 0, periodIndex: i, eventIndex: 0, text: LE_EVENTS[i]! },
  ]),
  {
    kind: 'set_event_text',
    sectionIndex: 0,
    periodIndex: 3,
    eventIndex: 0,
    text: `every public CA, ${BR_PHASES[3].days} days at most`,
  },
];

// certbot v3.3.0, certbot/certbot/_internal/storage.py:1005–1013, logging left out;
// constants.py:154–156 holds the default.
const OLD_CODE = [
  '# certbot 3.3.0, storage.py:1005–1013, should_autorenew',
  '# constants.py: RENEWER_DEFAULTS = {"renew_before_expiry": "30 days"}',
  'default_interval = constants.RENEWER_DEFAULTS["renew_before_expiry"]',
  'interval = self.configuration.get("renew_before_expiry", default_interval)',
  'expiry = crypto_util.notAfter(self.version(',
  '    "cert", self.latest_common_version()))',
  'now = datetime.datetime.now(pytz.UTC)',
  'if expiry < add_time_interval(now, interval):',
  '    return True',
];
// certbot v5.8.0, certbot/src/certbot/_internal/renewal.py:474–487 (should_autorenew, logging and the notAfter lookup left out) with
// _default_renewal_time (425–429) written in place of its call; the same since 4.1.0.
const NEW_CODE = [
  '# certbot 5.8.0, renewal.py:474–487, _default_renewal_time inlined',
  'config_interval = lineage.configuration.get("renew_before_expiry")',
  'if config_interval is not None:',
  '    if notAfter < storage.add_time_interval(now, config_interval):',
  '        return True',
  'elif renewal_time is None:  # no ARI answer',
  '    if lifetime.total_seconds() < 10 * 86400:',
  '        default_rt = not_before + lifetime / 2',
  '    else:',
  '        default_rt = not_before + lifetime * 2 / 3',
  '    if now > default_rt:',
  '        return True',
];
// certbot v5.8.0: acme/src/acme/client.py:363–368 (ClientV2.renewal_time, which
// _ari_renewal_time calls at renewal.py:392) and renewal.py:462–482 (should_autorenew,
// logging, the OCSP check and the notAfter lookup left out).
const ARI_CODE = [
  '# certbot 5.8.0, acme client.py:363–368, each time it asks',
  'start = renewal_info.suggested_window.start',
  'end = renewal_info.suggested_window.end',
  'delta_seconds = (end - start).total_seconds()',
  'random_seconds = random.uniform(0, delta_seconds)',
  'random_time = start + datetime.timedelta(seconds=random_seconds)',
  '# renewal.py:462–482, should_autorenew',
  'renewal_time = _ari_renewal_time(lineage, cert_pem, ari_clients)',
  'if renewal_time and now > renewal_time:',
  '    return True',
  'if config_interval is not None:',
  '    if notAfter < storage.add_time_interval(now, config_interval):',
  '        return True',
];
// letsencrypt/boulder 4e1779d, wfe2/wfe.go:2290–2297 (validateReplacementOrder) and
// 2487–2489 (NewOrder); comments shortened.
const EXEMPT_CODE = [
  '// boulder wfe2/wfe.go:2290–2297, validateReplacementOrder',
  '// exempt only if it replaces a certificate and is inside its window',
  'renewalInfo, err := wfe.determineARIWindow(ctx, replaces)',
  'return replaces, renewalInfo.SuggestedWindow.IsWithin(wfe.clk.Now()), nil',
  '// wfe2/wfe.go:2487–2489, NewOrder',
  'if !isARIRenewal {',
  '    refundLimits, err = wfe.checkNewOrderLimits(ctx, acct.ID, idents, isRenewal)',
];

/** Gantt dates: hour 0 is the first certificate's notBefore, 1 March 2028 00:00 UTC. */
const BASE = Date.UTC(2028, 2, 1);
const stamp = (hours: number) => new Date(BASE + hours * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
interface Bar {
  label: string;
  id: string;
  start: number;
  hours: number;
}
const gantt = (sections: [string, Bar[]][], axis: string) =>
  [
    'gantt',
    '  dateFormat YYYY-MM-DD HH:mm',
    `  axisFormat ${axis}`,
    ...sections.flatMap(([name, bars]) => [
      `  section ${name}`,
      ...bars.map((t) => `    ${t.label} :${t.id}, ${stamp(t.start)}, ${t.hours}h`),
    ]),
  ].join('\n');
const days = (hours: number) => +(hours / DAY).toFixed(1);
/** "day 30.5", or "hour 84" for certificates shorter than ten days. */
const at = (hours: number, short: boolean) => (short ? `hour ${Math.round(hours)}` : `day ${days(hours)}`);
const length = (hours: number, short: boolean) => (short ? `${Math.round(hours)} hours` : `${days(hours)} days`);
const upper = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** The script's one-sentence answer (meta.answer), which the new-rule step states. */
const ANSWER = 'renew at a share of the certificate’s life, not a fixed time before expiry';
/** The check answers' numbers, from the model: lifetimes and settings no scenario offers. */
const CHECK = (() => {
  // A 20-day certificate, shorter than the 30-day margin but longer than ten days.
  const twenty = 20 * DAY,
    year = (r: Rule) => simulate(r, twenty, YEAR),
    c20 = issue(0, twenty);
  const shortLived = summarize('fixed30', '160h');
  // A 45-day certificate with renew_before_expiry set to 10 days: the first run inside 10 days of expiry renews.
  const c45 = issue(0, LIFETIMES['45d'].hours),
    interval = 10 * DAY;
  let tenDay = RUN_EVERY;
  while (!dueByInterval(c45.notAfter, tenDay, interval)) tenDay += RUN_EVERY;
  let tenDayRetries = 0;
  for (let t = tenDay; t < c45.notAfter; t += RUN_EVERY) tenDayRetries++;
  return {
    twenty: {
      fixed: { renewals: year('fixed30').issued.length - 1, refused: year('fixed30').refused.length, first: year('fixed30').refused[0] },
      share: { due: dueAt('fraction', c20) - c20.notBefore, renewals: year('fraction').issued.length - 1 },
      sameAsShort: year('fixed30').issued.length - 1 === shortLived.renewalsPerYear && year('fixed30').refused.length === shortLived.refusedPerYear,
    },
    tenDay: { at: tenDay, retries: tenDayRetries, fraction: summarize('fraction', '45d') },
  };
})();

export default class CertRenewalExplainer extends Scene {
  static meta = {
    id: 'cert-renewal',
    title: 'When should a short-lived certificate renew?',
    sources: [
      'https://github.com/cabforum/servercert/blob/3574ae809e5f909b58ee4c26b7bac4a3b9e78421/docs/BR.md#632-certificate-operational-periods-and-key-pair-usage-periods',
      'https://letsencrypt.org/2025/12/02/from-90-to-45/',
      'https://letsencrypt.org/docs/profiles/',
      'https://letsencrypt.org/docs/rate-limits/',
      'https://github.com/letsencrypt/website/blob/e336493f1d4110a0cc7c539097c455a6efcaff29/content/en/docs/rate-limits.md',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/issuance/cert.go#L125-L136',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/test/config/ca.json#L58',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/ratelimits/gcra.go#L9-L60',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/ratelimits/limit.go#L93-L97',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/ratelimits/transaction.go#L628-L701',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/ratelimits/limiter.go#L263-L360',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/ra/ra.go#L1251-L1279',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/wfe2/wfe.go#L2197-L2298',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/wfe2/wfe.go#L2446-L2500',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/wfe2/wfe.go#L2801-L2847',
      'https://github.com/letsencrypt/boulder/blob/4e1779d21f9a2b504f8a4e5f1865e8c631777922/core/objects.go#L430-L468',
      'https://www.rfc-editor.org/rfc/rfc9773.html#section-4.2',
      'https://github.com/certbot/certbot/blob/v3.3.0/certbot/certbot/_internal/storage.py#L1005-L1013',
      'https://github.com/certbot/certbot/blob/v5.8.0/certbot/src/certbot/_internal/renewal.py#L413-L489',
      'https://github.com/certbot/certbot/blob/v5.8.0/certbot/src/certbot/_internal/tests/renewal_test.py#L272-L280',
      'https://github.com/certbot/certbot/commit/3cbe1288c90e856e32e719e410147d12b7de1545',
      'https://github.com/certbot/certbot/blob/v5.8.0/certbot/CHANGELOG.md',
      'https://github.com/certbot/certbot/blob/v5.8.0/certbot/docs/using.rst',
      'https://github.com/certbot/certbot/blob/v5.8.0/acme/src/acme/client.py#L115-L135',
      'https://github.com/certbot/certbot/blob/v5.8.0/acme/src/acme/client.py#L307-L371',
    ],
    // The script's answer and check questions (script.md); the new-rule step states the answer.
    answer: ANSWER,
    // Sentences that reach past the strips on screen, and the test that holds each against the model.
    claims: [
      { says: 'every run renews until', test: 'test/explain-cert-renewal.test.ts: the 160-hour, 30-day case' },
      { says: 'renewing at every run', test: 'test/explain-cert-renewal.test.ts: the 160-hour, 30-day case' },
      { says: 'renews at every run until', test: 'test/explain-cert-renewal.test.ts: the 160-hour, 30-day case' },
      { says: 'every run tries to renew', test: 'test/explain-cert-renewal.test.ts: the 160-hour, 30-day case' },
      { says: 'allows 5 certificates for the same names in 7 days', test: 'test/explain-cert-renewal.test.ts: the exact-set limit' },
      { says: '5 per 7 days', test: 'test/explain-cert-renewal.test.ts: the exact-set limit' },
      { says: 'check only for an order that names the certificate it replaces', test: 'test/explain-cert-renewal.test.ts: the exact-set limit' },
    ],
    checks: [
      {
        question: 'A CA issues 20-day certificates, and Certbot keeps renew_before_expiry at 30 days. How many certificates does it get in a year, and how many would the 4.1 default get?',
        answer: `With the 30-day setting, ${CHECK.twenty.fixed.renewals} renewed and ${CHECK.twenty.fixed.refused} runs refused, the first at hour ${CHECK.twenty.fixed.first}${CHECK.twenty.sameAsShort ? ', exactly as for 160-hour certificates' : ''}: any certificate shorter than 30 days is due from issue, so every run asks until the limit refuses. The default renews two thirds of the way through, since 20 days is not under ten: at day ${days(CHECK.twenty.share.due)}, ${CHECK.twenty.share.renewals} times a year.`,
      },
      {
        question: 'For 45-day certificates, someone sets renew_before_expiry to 10 days. When does Certbot 4.1 renew, and how long is left to retry?',
        answer: `At day ${days(CHECK.tenDay.at)}, the first twice-daily run within 10 days of expiry, leaving ${CHECK.tenDay.retries} runs to retry. The setting replaces the default rather than adding to it: without it Certbot would renew at day ${days(CHECK.tenDay.fraction.due)} with ${CHECK.tenDay.fraction.retries} runs to spare.`,
      },
      {
        question: 'A client renews at a random time inside Let’s Encrypt’s ARI window. Is that order exempt from the 5-in-7-days limit?',
        answer: 'Not by its timing alone. Boulder exempts an order only when it names the certificate it replaces and arrives inside that certificate’s window. Certbot 5.8’s orders name no predecessor, so they are counted even when they follow the window.',
      },
    ],
  };
  static settings = [
    {
      id: 'lifetime',
      label: 'Certificate lifetime',
      default: '160h',
      options: (Object.keys(LIFETIMES) as LifetimeKey[]).map((k) => ({ value: k, label: LIFETIMES[k].label })),
    },
    {
      id: 'rule',
      label: 'Renewal rule',
      default: 'fixed30',
      options: (Object.keys(RULES) as Rule[]).map((k) => ({ value: k, label: RULES[k].name })),
    },
  ];
  override async construct() {
    const values = settingsOf(this),
      key = values.lifetime as LifetimeKey,
      rule = values.rule as Rule,
      other: Rule = rule === 'fraction' ? 'fixed30' : 'fraction',
      life = LIFETIMES[key],
      short = key === '160h',
      s = stage(this, { style: STYLE, headingSize: 0.6 });
    const mine = summarize(rule, key),
      theirs = summarize(other, key),
      byRule = { [rule]: mine, [other]: theirs } as Record<Rule, typeof mine>;
    const window = windowFor(key),
      span = short ? 'two weeks' : 'a year',
      perWindow = (r: Rule) => simulate(r, life.hours, window);

    // ------------------------------------------------------------------ limit
    const adjective = life.label.replace(/ (day|hour)s$/, '-$1');
    await this.step('limit', {
      title: 'Public certificates shrink from 398 days to 47',
      line: `${BR_PHASES[0].days} days, then ${BR_PHASES[1].days} from ${BR_PHASES[1].from.slice(0, 4)}, ${BR_PHASES[2].days} from ${BR_PHASES[2].from.slice(0, 4)} and ${BR_PHASES[3].days} from ${BR_PHASES[3].from.slice(0, 4)}.`,
      caption: `The CA/Browser Forum caps how long a public TLS certificate may last: ${BR_PHASES[0].days} days until 15 March 2026, ${BR_PHASES[1].days} from then, ${BR_PHASES[2].days} from March 2027 and ${BR_PHASES[3].days} from March 2029. A renewal margin that used to occupy a small part of the lifetime can now exceed the whole lifetime. What should a job do when its certificate lasts less than the configured margin?`,
    });
    await s.clear();
    const line = await s.show({ source: BR_SOURCE }, { box: regionBox('full', { top: 3.1 }) });
    this.state.limits = BR_PHASES.map((p) => p.days);

    // ------------------------------------------------------------ letsencrypt
    await this.step('letsencrypt', {
      title: 'Let’s Encrypt’s default reaches 45 days in 2028',
      line: `The classic profile: 90 days, then ${LE_DATES[1].days} from ${LE_DATES[1].date.slice(0, 4)} and ${LE_DATES[2].days} from ${LE_DATES[2].date.slice(0, 4)}.`,
      caption:
        'The same timeline, edited to Let’s Encrypt’s schedule. The opt-in tlsserver profile has issued 45-day certificates since May 2026; the default classic profile moves from 90 days to 64 in February 2027 and to 45 in February 2028. Its opt-in shortlived profile issues 160-hour certificates.',
    });
    await line.morph({ source: LE_SOURCE }, { ops: LE_OPS });
    await line.dim(['period:period-2']);
    this.state.letsEncrypt = LE_DATES.map((d) => [d.date, d.profile, d.days]);

    // --------------------------------------------------------------- old-rule
    const ninety = summarize('fixed30', '90d');
    const oneRenewal = gantt(
      [
        [
          'One 90-day certificate',
          [
            { label: 'First', id: 'c1', start: 0, hours: LIFETIMES['90d'].hours },
            { label: 'Replacement', id: 'c2', start: ninety.renewsAt, hours: LIFETIMES['90d'].hours },
          ],
        ],
      ],
      '%d %b',
    );
    await this.step('old-rule', {
      title: 'Certbot 3.3 renews 30 days before expiry',
      line:
        key === '90d'
          ? `Predict: what share of a 90-day life has passed at day ${days(ninety.renewsAt)}?`
          : `Predict: when does a 30-day margin renew a ${adjective} certificate?`,
      caption: `Certbot 3.3 renews when the certificate expires within renew_before_expiry, 30 days unless the renewal file sets it. Let’s Encrypt dates a certificate ${+(BACKDATE * 60).toFixed(1)} minutes before it issues it, so a 90-day one falls due just before the twice-daily run at day ${days(ninety.renewsAt)}, which replaces it.`,
    });
    await s.clear();
    const chart = await s.show({ source: oneRenewal }, { box: regionBox('top', { bottom: -0.25 }) });
    const code = await s.code(OLD_CODE, { at: regionBox('full', { top: -0.35 }), fontSize: 0.2 });
    await code.focus([2, 3]);
    await chart.note('task:c2', `replaced at day ${days(ninety.renewsAt)}`, { side: 'right' });
    this.state.oldRule = { due: ninety.due, renewsAt: ninety.renewsAt };

    // ----------------------------------------------------------------- margin
    let marginPicture: Group | undefined;
    // The cause behind old-rule's answer: a 90-day certificate and this scenario's, drawn to one time scale and lined up
    // at expiry, each with the 30-day rule's due point counted back from its expiry. Where that point lies left of a
    // bar, the certificate is due from issue.
    const percent = (x: number) => `${Math.round(x * 100)}%`;
    const rows = [...new Set<LifetimeKey>(['90d', key])].map((k) => ({
      lifetime: k,
      hours: LIFETIMES[k].hours,
      due: dueOffset('fixed30', LIFETIMES[k].hours),
      share: FIXED_INTERVAL / LIFETIMES[k].hours,
    }));
    const fixedHere = rows.at(-1)!,
      renewsHere = summarize('fixed30', key).renewsAt;
    const named = (k: LifetimeKey) => `${LIFETIMES[k].label.replace(/ (day|hour)s$/, '-$1')} certificate`;
    // Where the due point falls, in the words each row prints and the caption says.
    const marginWords = (r: (typeof rows)[number]) =>
      r.due < 0 ? `due ${days(-r.due)} days before issue` : `due at day ${days(r.due)}`;
    const ofLife = (share: number, k: LifetimeKey) => {
      const life = `a ${LIFETIMES[k].label.replace(/ (day|hour)s$/, '-$1')} life`;
      return share >= 1 ? `${+share.toFixed(1)} times ${life}` : `${percent(share)} of ${life}`;
    };
    const lifeLeft = (share: number) =>
      Math.abs(share - 1 / 3) < 1e-9 ? 'a third' : Math.abs(share - 2 / 3) < 1e-9 ? 'two thirds' : percent(share);
    await this.step('margin', {
      title:
        fixedHere.due < 0
          ? `Answer: 30 days before expiry is ${days(-fixedHere.due)} days before issue`
          : `Answer: 30 days before expiry is day ${days(fixedHere.due)}, ${percent(1 - fixedHere.share)} of the way through`,
      line:
        fixedHere.due < 0
          ? `So it is due from issue, and the first run, at hour ${renewsHere}, renews it.`
          : `The rule counts 30 days back from expiry: ${percent(fixedHere.share)} of a ${adjective} life.`,
      caption: `Each bar is one certificate, from issue to expiry, drawn to one time scale and lined up at expiry. The highlighted line is the 30-day test: renew once expiry is less than 30 days away. The red tick marks where that test starts to pass: 30 days before the right-hand end of each bar. On a 90-day certificate that is day ${days(rows[0]!.due)}, with ${lifeLeft(rows[0]!.share)} of its life left. ${
        key === '90d'
          ? 'A ninety-day lifetime is what the 30-day margin was written for.'
          : fixedHere.due < 0
            ? `A ${named(key)} is shorter than the margin: its due point falls ${Math.round(-fixedHere.due)} hours, ${days(-fixedHere.due)} days, before it was issued. It is due from the moment it exists, so the first twice-daily run, at hour ${renewsHere}, replaces it, and the replacement is due from issue too.`
            : `A ${named(key)} falls due at day ${days(fixedHere.due)}, with ${lifeLeft(fixedHere.share)} of its life left.`
      }`,
    });
    await chart.hide();
    await code.focus([7, 8]);
    {
      // The rows are the phone's opening, so their words are large enough to read when the rows fill a narrow stage;
      // the words left of the bars, each row's share of its life, wait for the close-up tour.
      const XE = 6.5,
        perHour = 7.2 / LIFETIMES['90d'].hours,
        xOf = (fromExpiry: number) => XE + fromExpiry * perHour,
        size = 0.32,
        ink = s.palette.ink;
      const row = (r: (typeof rows)[number], y: number) => {
        const left = xOf(-r.hours),
          dueX = xOf(-FIXED_INTERVAL),
          yb = y - 0.4;
        const bar = new Rectangle({
          width: XE - left,
          height: 0.34,
          fill: s.emphasis,
          fillOpacity: 0.2,
          stroke: s.emphasis,
          strokeWidth: 0.025,
        }).moveTo([(left + XE) / 2, y]);
        const name = new Text(named(r.lifetime), { fontSize: size, color: ink, weight: 'bold', anchor: 'end' }).moveTo(
          [XE, y + 0.5],
          [1, 0],
        );
        const bracket = new Group(
          new Line([dueX, yb], [XE, yb], { stroke: s.bad, strokeWidth: 0.03 }),
          new Line([XE, yb - 0.08], [XE, yb + 0.08], { stroke: s.bad, strokeWidth: 0.03 }),
          new Line([dueX, y + 0.2], [dueX, yb - 0.08], { stroke: s.bad, strokeWidth: 0.04 }),
          new Text('30 days', { fontSize: size, color: s.bad }).moveTo([(dueX + XE) / 2, yb - 0.33]),
          new Text(marginWords(r), { fontSize: size, color: s.bad, anchor: 'end' }).moveTo([dueX - 0.15, yb], [1, 0]),
        );
        const g = new Group(bar, name, bracket);
        g.key = `margin:${r.lifetime}`;
        return g;
      };
      const ys = rows.length === 1 ? [1.6] : [2.45, 0.78];
      const subjects = rows.map((r, i) => row(r, ys[i]!));
      const shares = rows.map((r, i) =>
        new Text(`30 days is ${ofLife(r.share, r.lifetime)}`, {
          fontSize: 0.24,
          color: s.soft,
          anchor: 'end',
        }).moveTo([xOf(-LIFETIMES['90d'].hours) - 0.35, ys[i]!], [1, 0]),
      );
      const picture = new Group(...subjects, ...shares);
      picture.key = 'margin';
      await s.enter(picture, {
        describe: () =>
          `${rows.length === 1 ? 'One certificate' : 'Two certificates'} drawn to one time scale and lined up at expiry, each with a red 30-day bracket counted back from its right-hand end: ${rows
            .map((r) => `a ${named(r.lifetime)}, ${marginWords(r)}, 30 days being ${ofLife(r.share, r.lifetime)}`)
            .join('; ')}.`,
      });
      s.reading(...subjects);
      marginPicture = picture;
    }
    this.state.margin = {
      rows: rows.map(({ lifetime, hours, due, share }) => ({ lifetime, hours, due, share })),
      renewsAt: renewsHere,
    };

    // --------------------------------------------------------------- new-rule
    const payoff =
      byRule.fixed30.due === 0
        ? `Thirty days is longer than a ${adjective} certificate’s whole life, so under the old rule every run tries to renew; the new one waits until ${at(byRule.fraction.due, short)}.`
        : byRule.fixed30.due === byRule.fraction.due
          ? `On a ${adjective} certificate both fall due at ${at(byRule.fraction.due, short)}.`
          : `On a ${adjective} certificate the old rule falls due at ${at(byRule.fixed30.due, short)}, the new one at ${at(byRule.fraction.due, short)}.`;
    // The scenario's own lifetime, with the replacement each rule makes: the answer to the old-rule step's prediction.
    const share = short ? 'half' : 'two thirds',
      both = byRule.fixed30.renewsAt === byRule.fraction.renewsAt,
      // The default's due time, and the run that renews when that run comes noticeably later.
      byRun =
        byRule.fraction.renewsAt + BACKDATE - byRule.fraction.due >= 1
          ? `, renewed by the run at ${at(byRule.fraction.renewsAt, short)}`
          : '';
    const replacements = gantt(
      [
        [
          `One ${adjective} certificate`,
          [
            { label: 'First', id: 'c1', start: 0, hours: life.hours },
            { label: `30-day rule, ${at(byRule.fixed30.renewsAt, short)}`, id: 'fixed30', start: byRule.fixed30.renewsAt, hours: life.hours },
            { label: `Default, ${at(byRule.fraction.renewsAt, short)}`, id: 'fraction', start: byRule.fraction.renewsAt, hours: life.hours },
          ],
        ],
      ],
      '%d %b',
    );
    await this.step('new-rule', {
      title: `Certbot 4.1 renews ${short ? 'half way' : 'two thirds of the way'} through a ${adjective} certificate`,
      line: both
        ? `${upper(share)} of ${life.label} is ${at(byRule.fraction.due, short)}, where the 30-day rule renews too.`
        : `${upper(share)} of ${life.label} is ${at(byRule.fraction.due, short)}${byRun}; the 30-day rule renews at ${at(byRule.fixed30.renewsAt, short)}.`,
      caption: `Certbot 4.1 changed the rule: ${ANSWER}. With renew_before_expiry unset, it renews two thirds of the way through, or half way under ten days, unless the CA sends an ARI answer, a renewal window of its own (RFC 9773). A fraction scales with the lifetime; a fixed number of days does not. ${payoff}`,
    });
    // The margin picture gives way to the replacements each rule makes, in the chart's place above the code.
    await this.play(new FadeOut(marginPicture!, { runTime: 0.3 }));
    const replaced = await s.show({ source: replacements }, { box: regionBox('top', { bottom: -0.25 }) });
    await code.morph(NEW_CODE);
    await code.focus([6, 9]);
    // Each replacement's row names its rule and when it starts; the chosen rule's row is marked.
    await replaced.mark([`task:${rule}`], { as: 'the chosen rule' });
    this.state.newRule = {
      lifetime: key,
      fixed30: { due: byRule.fixed30.due, renewsAt: byRule.fixed30.renewsAt },
      fraction: { due: byRule.fraction.due, renewsAt: byRule.fraction.renewsAt },
    };

    // ------------------------------------------------------------------- year
    // A strip per rule: a tick at each certificate's issue, a red mark at each refused run.
    // (A gantt of overlapping certificates piles their labels into the label column.)
    const count = (r: Rule) => perWindow(r).issued.length - 1;
    const dueWords = (r: Rule) => {
      const c = byRule[r];
      if (r === 'fixed30' && c.due === 0) return 'due from issue, since 30 days is longer than its life';
      return r === 'fraction'
        ? `due at ${at(c.due, short)}, ${short ? 'half' : 'two thirds'} of ${life.label}`
        : `due at ${at(c.due, short)}, 30 days before expiry`;
    };
    // The run that renews, said by its distance from the moment the certificate fell due.
    const replacedBy = (r: Rule) => {
      const c = byRule[r],
        gap = c.renewsAt + BACKDATE - c.due;
      return r === 'fixed30' && c.due === 0
        ? 'the next twice-daily run'
        : gap < 1
          ? 'the next twice-daily run, under an hour later,'
          : `the next twice-daily run, at ${at(c.renewsAt, short)},`;
    };
    const X0 = -6.6,
      X1 = 6.0,
      xOf = (hours: number) => X0 + ((X1 - X0) * hours) / window;
    const ink = s.palette.ink;
    const axisMarks = (() => {
      const marks: [number, string][] = [];
      if (short) for (let d = 0; d <= 14; d += 2) marks.push([d * DAY, stamp(d * DAY).slice(8, 10) + ' Mar']);
      else
        for (let m = 0; m <= 12; m += 1) {
          const hours = (Date.UTC(2028, 2 + m, 1) - BASE) / 3600e3;
          if (hours <= window) marks.push([hours, new Date(BASE + hours * 3600e3).toUTCString().slice(8, 11)]);
        }
      return marks;
    })();
    const AXIS_Y = -1.9;
    const axisLine = new Group(
      new Line([X0, AXIS_Y], [X1, AXIS_Y], { stroke: s.soft, strokeWidth: 0.02 }),
      ...axisMarks.flatMap(([h, label]) => [
        new Line([xOf(h), AXIS_Y], [xOf(h), AXIS_Y - 0.1], { stroke: s.soft, strokeWidth: 0.02 }),
        new Text(label, { fontSize: 0.22, color: s.soft }).moveTo([xOf(h), AXIS_Y - 0.32]),
      ]),
    );
    const strip = (r: Rule, y: number) => {
      const run = perWindow(r);
      // The first certificate is grey; each later tick is a renewal.
      const ticks = run.issued.map((t, i) =>
        new Rectangle({ width: 0.07, height: 0.62, fill: i ? s.emphasis : s.soft, stroke: 'none' }).moveTo([xOf(t), y]),
      );
      const refusals = run.refused.map((t) =>
        new Rectangle({ width: 0.07, height: 0.26, fill: s.bad, stroke: 'none' }).moveTo([xOf(t), y - 0.52]),
      );
      const base = new Line([X0, y - 0.31], [X1, y - 0.31], { stroke: s.soft, strokeWidth: 0.015 });
      const name = new Text(RULES[r].name, { fontSize: 0.26, color: ink, weight: 'bold', anchor: 'start' }).moveTo(
        [X0, y + 0.62],
        [-1, 0],
      );
      const total = new Text(`${run.issued.length - 1}`, { fontSize: 0.4, color: ink, weight: 'bold' }).moveTo([
        X1 + 0.75,
        y + 0.12,
      ]);
      const unit = new Group(
        new Text('renewals', { fontSize: 0.2, color: s.soft }).moveTo([X1 + 0.75, y - 0.25]),
        ...(run.refused.length
          ? [new Text(`${run.refused.length} refused`, { fontSize: 0.2, color: s.bad }).moveTo([X1 + 0.75, y - 0.55])]
          : []),
      );
      return new Group(base, ...ticks, ...refusals, name, total, unit);
    };
    const words = (r: Rule) => {
      const run = perWindow(r);
      const renewals = run.issued.slice(1);
      return `${RULES[r].name}: a first certificate on 1 March, then ${renewals.length} renewals in ${span}, at ${renewals
        .slice(0, 3)
        .map((t) => at(t, short))
        .join(', ')}${renewals.length > 3 ? ' and so on' : ''}${
        run.refused.length ? `; ${run.refused.length} runs refused, the first at hour ${run.refused[0]}` : ''
      }`;
    };
    const limitedGaps = (() => {
      const run = perWindow(rule),
        after = run.issued.filter((t) => run.refused.length && t > run.refused[0]!);
      const lengths = after.slice(1).map((t, i) => t - after[i]!);
      return lengths.length ? [Math.min(...lengths), Math.max(...lengths)] : null;
    })();
    await this.step('year', {
      title: `${life.label} under ${RULES[rule].short}: ${count(rule)} renewals in ${span}`,
      line:
        limitedGaps && mine.firstRefused != null
          ? `Every run renews until hour ${mine.firstRefused}; then most are refused (red).`
          : `Each certificate is ${dueWords(rule)}.`,
      caption: `Each blue tick is a renewal, over ${span} from a first certificate on 1 March 2028. Under ${RULES[rule].short} a certificate is ${dueWords(rule)}, ${
        limitedGaps && mine.firstRefused != null
          ? `so even a fresh replacement is already due under the same rule. Every run renews until, at hour ${mine.firstRefused}, Let’s Encrypt starts refusing most runs (red). Later ticks are ${limitedGaps[0]} to ${limitedGaps[1]} hours apart.`
          : `and ${replacedBy(rule)} replaces it.`
      }`,
    });
    await s.clear();
    const upperStrip = strip(rule, 1.2);
    await s.enter(axisLine, upperStrip, {
      describe: () => `A ${span} axis from 1 March 2028 with one strip of ticks. ${words(rule)}`,
    });
    this.state.year = {
      rule,
      issued: perWindow(rule).issued,
      refused: perWindow(rule).refused,
      renewalsPerYear: mine.renewalsPerYear,
    };

    // ------------------------------------------------------------- other-rule
    const f30 = byRule.fixed30,
      frac = byRule.fraction,
      ratio = f30.renewalsPerYear / frac.renewalsPerYear;
    const same = f30.renewalsPerYear === frac.renewalsPerYear,
      compare = ratio === 2 ? 'twice as often' : `${ratio.toFixed(1)} times as often`;
    const otherOutcome =
      theirs.firstRefused != null
        ? `every run renews until, at hour ${theirs.firstRefused}, Let’s Encrypt starts refusing most runs (red)`
        : `${replacedBy(other)} replaces it`;
    await this.step('other-rule', {
      title: same
        ? `${RULES[other].name}: the same ${count(other)} renewals`
        : `${RULES[other].name}: ${count(other)} renewals instead`,
      line: same
        ? `Over 365 days both rules renew ${f30.renewalsPerYear} times.`
        : `In 365 days: ${f30.renewalsPerYear} under ${RULES.fixed30.short}, ${frac.renewalsPerYear} under ${RULES.fraction.short}.`,
      caption: `The lower strip is the same ${short ? 'two weeks' : 'year'} under ${RULES[other].short}: a certificate is ${dueWords(other)}, and ${otherOutcome}. ${
        same
          ? `Over 365 days both rules renew ${f30.renewalsPerYear} times.`
          : `Over 365 days ${RULES.fixed30.short} renews ${f30.renewalsPerYear} times and ${RULES.fraction.short} ${frac.renewalsPerYear}: ${compare}.`
      }`,
    });
    const lowerStrip = strip(other, -0.55);
    await s.enter(lowerStrip, { describe: () => `A second strip. ${words(other)}` });
    // The step compares the two rules, so a phone's tour reads both strips, not only the new one.
    s.reading(upperStrip, lowerStrip);
    this.state.otherRule = {
      rule: other,
      issued: perWindow(other).issued,
      refused: perWindow(other).refused,
      renewalsPerYear: theirs.renewalsPerYear,
    };

    // ------------------------------------------------------------------ slack
    const limited = rule === 'fixed30' && mine.firstRefused != null;
    await this.step('slack', {
      title: limited
        ? `Renewing at every run, Let’s Encrypt refuses at hour ${mine.firstRefused}`
        : `A failed renewal leaves ${length(mine.slack, short)} to retry`,
      line: limited
        ? `${LIMIT.burst} per 7 days, one back every ${EMISSION} h; ${mine.refusedPerYear} refused in 365 days.`
        : `Room for ${mine.retries} twice-daily runs; ${RULES[other].short} leaves ${length(theirs.slack, short)}.`,
      caption: limited
        ? `Let’s Encrypt allows ${LIMIT.burst} certificates for the same names in 7 days and gives one back every ${EMISSION} hours. After ${perWindow(rule).issued.filter((t) => t < mine.firstRefused!).length - 1} renewals the run at hour ${mine.firstRefused} is refused; in 365 days ${mine.refusedPerYear} runs are refused and ${mine.renewalsPerYear} renew.`
        : `When a renewal falls due the certificate still has ${length(mine.slack, short)} to run, time for ${mine.retries} twice-daily runs to try again if the CA or the challenge fails. ${upper(RULES[other].short)} leaves ${length(theirs.slack, short)}${theirs.firstRefused != null ? `, but renews at every run until Let’s Encrypt refuses it at hour ${theirs.firstRefused}` : ''}.`,
    });
    await s.clear();
    const windows = gantt(
      [
        [
          `One ${adjective} certificate`,
          [
            { label: 'Valid', id: 'life', start: 0, hours: life.hours },
            ...(['fraction', 'fixed30'] as Rule[]).map((r) => ({
              label: `Retry window, ${RULES[r].short}`,
              id: r,
              start: Math.round(byRule[r].due),
              hours: life.hours - Math.round(byRule[r].due),
            })),
          ],
        ],
      ],
      '%d %b',
    );
    const margin = await s.show({ source: windows }, { box: 'full' });
    await margin.mark([`task:${rule}`], { as: 'the chosen rule' });
    // Each retry window says what it leaves, just left of its bar, in the row it belongs to.
    // A task's first child is its bar; its row label travels with it.
    const bar = (r: Rule) => margin.get(`task:${r}`).children[0]!.box()!;
    const chartLeft = margin.get('task:life').children[0]!.box()![0];
    // Left of the bar when the row has room for the words, otherwise under the chart.
    const say = (r: Rule, text: string) => {
      const b = bar(r),
        room = b[0] - chartLeft > new Text(text, { fontSize: 0.22 }).width() + 0.4;
      return s.callout(
        b,
        text,
        room
          ? { side: 'left', gap: 0.2, color: s.emphasis, size: 0.22 }
          : { side: 'below', gap: 0.8, color: s.emphasis, size: 0.22 },
      );
    };
    // Renewing at every run, the 30-day rule's window is the whole life, so its words go under the chart.
    if (limited) {
      // The callout points at the hour of the first refusal on the 30-day rule's bar.
      const b = bar(rule),
        from = Math.round(byRule[rule].due),
        x = b[0] + ((mine.firstRefused! - from) / (life.hours - from)) * (b[2] - b[0]);
      await s.callout(
        [x, b[1]],
        `refused at hour ${mine.firstRefused}; ${mine.refusedPerYear} refused, ${mine.renewalsPerYear} renewed in 365 days`,
        {
          side: 'below',
          gap: 0.8,
          color: s.emphasis,
          size: 0.22,
        },
      );
    } else
      for (const [r, m] of [
        [rule, mine],
        [other, theirs],
      ] as const)
        await say(r, `${length(m.slack, short)} to retry, ${m.retries} runs`);
    this.state.slack = {
      fraction: frac.slack,
      fixed30: f30.slack,
      retries: mine.retries,
      firstRefused: mine.firstRefused,
      refused: mine.refusedPerYear,
    };

    // --------------------------------------------------------------- replaces
    await this.step('replaces', {
      title: 'Certbot’s renewals still count against the limit',
      line: 'Certbot’s order names no predecessor, so the limit check runs.',
      caption: `Boulder skips the ${LIMIT.burst}-in-7-days check only for an order that names the certificate it replaces and arrives inside that certificate’s ARI window. Certbot 5.8’s order carries identifiers and a profile and names no predecessor, so its renewals are checked. The renewal window and this exemption are different: following the window does not itself name the replaced certificate. A refused order costs nothing; an issued certificate takes a token.`,
    });
    await s.clear();
    await s.code(EXEMPT_CODE, { at: regionBox('full', { bottom: -1.3 }), fontSize: 0.22 });
    await s.card(
      [
        ['Names its predecessor, inside the window', 'no limit check'],
        ['Anything else, Certbot 5.8 included', `${LIMIT.burst} per 7 days`],
        ['Refused order', 'costs no token'],
        ['Issued certificate', 'takes a token if one is left'],
      ],
      { at: regionBox('full', { top: -1.5 }), width: 11 },
    );
    this.state.replaces = { replacesSent: false, burst: LIMIT.burst, emissionHours: EMISSION };

    // -------------------------------------------------------------------- ari
    // The window and the runs come from Boulder's RenewalInfoSimple and Certbot's draw (lib/cert-renewal.ts).
    const ari = ariSummary(rule, key),
      when = (h: number) => (short ? `hour ${h.toFixed(1)}` : `day ${days(h)}`),
      pct = (p: number) => (p < 0.005 ? 'under 1%' : `${Math.round(p * 100)}%`),
      runList = ari.runs.map((r) => `${at(r.at, short)} (${pct(r.p)})`),
      // The card says the unit once: "day 42 (<1%), 42.5 (39%), …".
      runCard = ari.runs
        .map(
          (r, i) =>
            `${i ? '' : short ? 'hour ' : 'day '}${short ? Math.round(r.at) : days(r.at)} (${r.p < 0.005 ? '<1%' : pct(r.p)})`,
        )
        .join(', '),
      listed =
        runList.length > 1 ? `${runList.slice(0, -1).join(', ')} or ${runList[runList.length - 1]}` : runList[0]!;
    // Under the 30-day rule a set renew_before_expiry can fire before the window opens.
    const settingFirst = rule === 'fixed30' && ari.runs.length === 1 && ari.runs[0]!.at + BACKDATE < ari.start;
    const [fewest, most] = ari.perYear,
      yearly = fewest === most ? `${fewest}` : `${fewest} ${most - fewest === 1 ? 'or' : 'to'} ${most}`;
    await this.step('ari', {
      title: `Let’s Encrypt’s ARI window: ${when(ari.start)} to ${when(ari.end)}`,
      line: settingFirst
        ? `The 30-day setting renews at ${at(ari.runs[0]!.at, short)}, before the window opens.`
        : ari.runs.length === 1 && ari.runs[0]!.at + BACKDATE >= ari.end
          ? `No run falls inside it; the next run, at ${at(ari.runs[0]!.at, short)}, renews.`
          : `Each run draws a random time in it; ${yearly} renewals in 365 days.`,
      caption: `Certbot 4.1 and later ask Let’s Encrypt when to renew; its ARI answer is a window 1% of the life either side of ${short ? 'half way' : 'two thirds'}. ${
        settingFirst
          ? `The 30-day setting still renews on its own, at ${at(ari.runs[0]!.at, short)}, before the window opens, so the answer changes nothing until the setting is removed.`
          : ari.runs.length === 1 && ari.runs[0]!.at + BACKDATE >= ari.end
            ? `No run falls inside it, so the first run after it, at ${at(ari.runs[0]!.at, short)}, renews.`
            : `Each run draws a random time in it and renews once that time has passed: ${listed}.`
      }`,
    });
    await s.clear();
    const ariCode = await s.code(ARI_CODE, { at: regionBox('full', { bottom: -1.0 }), fontSize: 0.22 });
    await ariCode.focus(settingFirst ? [10, 12] : [4, 9], { as: settingFirst ? 'the setting first' : 'a fresh draw' });
    await s.card(
      [
        ['Window', `${when(ari.start)} to ${when(ari.end)}`],
        ['Runs that renew', runCard],
        ['Renewals in 365 days', `${yearly} (${mine.renewalsPerYear} with no answer)`],
      ],
      { at: regionBox('full', { top: -1.25 }), width: 11 },
    );
    this.state.ari = { start: ari.start, end: ari.end, runs: ari.runs, perYear: ari.perYear };
  }
}

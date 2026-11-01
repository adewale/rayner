import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/cert-renewal.ts';
import { Scene, Group, Line, Rectangle, Text } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  BACKDATE,
  BR_PHASES,
  DAY,
  EMISSION,
  LE_DATES,
  LIFETIMES,
  LIMIT,
  RUN_EVERY,
  ariSummary,
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
  };
  static settings = [
    {
      id: 'lifetime',
      label: 'Certificate lifetime',
      default: '45d',
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
    await readerFirst(this, s, readerFrames(key, rule));
    await this.step('limit', {
      detail: true,
      title: 'Public certificates shrink from 398 days to 47',
      line: `${BR_PHASES[0].days} days, then ${BR_PHASES[1].days} from ${BR_PHASES[1].from.slice(0, 4)}, ${BR_PHASES[2].days} from ${BR_PHASES[2].from.slice(0, 4)} and ${BR_PHASES[3].days} from ${BR_PHASES[3].from.slice(0, 4)}.`,
      caption: `The CA/Browser Forum’s Baseline Requirements cap how long a publicly trusted TLS certificate may be valid. The cap was ${BR_PHASES[0].days} days until 15 March 2026 and ${BR_PHASES[1].days} days from then. It falls to ${BR_PHASES[2].days} days in March 2027 and to ${BR_PHASES[3].days} in March 2029. When the lifetime shrinks, does a rule that renews 30 days before expiry still leave enough time between certificates? We will compare it with a rule tied to the certificate’s lifetime.`,
    });
    await s.clear();
    const line = await s.show({ source: BR_SOURCE }, { box: regionBox('full', { top: 3.1 }) });
    this.state.limits = BR_PHASES.map((p) => p.days);

    // ------------------------------------------------------------ letsencrypt
    await this.step('letsencrypt', {
      detail: true,
      title: 'Let’s Encrypt’s default reaches 45 days in 2028',
      line: `The classic profile: 90 days, then ${LE_DATES[1].days} from ${LE_DATES[1].date.slice(0, 4)} and ${LE_DATES[2].days} from ${LE_DATES[2].date.slice(0, 4)}.`,
      caption:
        'The same timeline, edited to Let’s Encrypt’s schedule. Its opt-in tlsserver profile has issued 45-day certificates since May 2026. The default classic profile issues 90-day certificates until February 2027, then 64-day ones, and 45-day ones from February 2028, a year before the 47-day cap.',
    });
    await line.morph({ source: LE_SOURCE }, { ops: LE_OPS });
    await line.dim(['period:period-2']);
    this.state.letsEncrypt = LE_DATES.map((d) => [d.date, d.profile, d.days]);

    // --------------------------------------------------------------- old-rule
    const ninety = summarize('fixed30', '90d'),
      ninetyNew = summarize('fraction', '90d');
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
      detail: true,
      title: 'Certbot 3.3 renews 30 days before expiry',
      line: `A 90-day certificate is replaced by the run at day ${days(ninety.renewsAt)}.`,
      caption: `Certbot 3.3 renews when the certificate expires within renew_before_expiry, 30 days unless the renewal file sets it. Let’s Encrypt dates a certificate 58.5 minutes before it issues it, so a 90-day one falls due just before the run at day ${days(ninety.renewsAt)}, which replaces it.`,
    });
    await s.clear();
    const chart = await s.show({ source: oneRenewal }, { box: regionBox('top', { bottom: 0.0 }) });
    const code = await s.code(OLD_CODE, { at: regionBox('full', { top: -0.1 }), fontSize: 0.21 });
    await code.focus([2, 3]);
    await chart.note('task:c2', `replaced at day ${days(ninety.renewsAt)}`, { side: 'right' });
    this.state.oldRule = { due: ninety.due, renewsAt: ninety.renewsAt };

    // --------------------------------------------------------------- new-rule
    await this.step('new-rule', {
      detail: true,
      title: 'Certbot 4.1 renews two thirds of the way through',
      line: `Two thirds of 90 days is day ${days(ninetyNew.due)}; the replacement does not move.`,
      caption: `Since 4.1, with renew_before_expiry unset and no ARI answer, Certbot renews two thirds of the way through a certificate’s life, or half way for certificates shorter than ten days. Two thirds of 90 days is day ${days(ninetyNew.due)}, the day the old rule chose, so for 90-day certificates nothing moved.`,
    });
    await chart.clearNotes();
    await code.morph(NEW_CODE);
    await code.focus([6, 9]);
    await chart.note('task:c2', `day ${days(ninetyNew.renewsAt)} under both`, { side: 'right' });
    this.state.newRule = { due: ninetyNew.due, renewsAt: ninetyNew.renewsAt };

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
      detail: true,
      title: `${life.label} under ${RULES[rule].short}: ${count(rule)} renewals in ${span}`,
      line:
        limitedGaps && mine.firstRefused != null
          ? `Every run renews until hour ${mine.firstRefused}; then most are refused (red).`
          : `Each certificate is ${dueWords(rule)}.`,
      caption: `Each blue tick is a renewal, over ${span} from a first certificate on 1 March 2028. Under ${RULES[rule].short} a certificate is ${dueWords(rule)}, ${
        limitedGaps && mine.firstRefused != null
          ? `so every run renews until, at hour ${mine.firstRefused}, Let’s Encrypt starts refusing most runs (red). Later ticks are ${limitedGaps[0]} to ${limitedGaps[1]} hours apart.`
          : `and ${replacedBy(rule)} replaces it.`
      }`,
    });
    await s.clear();
    await s.enter(axisLine, strip(rule, 1.2), {
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
    await this.step('other-rule', {
      detail: true,
      title: same
        ? `${RULES[other].name}: the same ${count(other)} renewals`
        : `${RULES[other].name}: ${count(other)} renewals instead`,
      line: same
        ? `Over 365 days both rules renew ${f30.renewalsPerYear} times.`
        : `In 365 days: ${f30.renewalsPerYear} under ${RULES.fixed30.short}, ${frac.renewalsPerYear} under ${RULES.fraction.short}.`,
      caption: `The lower strip is the same ${short ? 'two weeks' : 'year'} under ${RULES[other].short}: a certificate is ${dueWords(other)}, and ${replacedBy(other)} replaces it. ${
        same
          ? `Over 365 days both rules renew ${f30.renewalsPerYear} times.`
          : `Over 365 days ${RULES.fixed30.short} renews ${f30.renewalsPerYear} times and ${RULES.fraction.short} ${frac.renewalsPerYear}: ${compare}.`
      }`,
    });
    await s.enter(strip(other, -0.55), { describe: () => `A second strip. ${words(other)}` });
    this.state.otherRule = {
      rule: other,
      issued: perWindow(other).issued,
      refused: perWindow(other).refused,
      renewalsPerYear: theirs.renewalsPerYear,
    };

    // ------------------------------------------------------------------ slack
    const limited = rule === 'fixed30' && mine.firstRefused != null;
    await this.step('slack', {
      detail: true,
      title: limited
        ? `Renewing at every run, Let’s Encrypt refuses at hour ${mine.firstRefused}`
        : `A failed renewal leaves ${length(mine.slack, short)} to retry`,
      line: limited
        ? `${LIMIT.burst} per 7 days, one back every ${EMISSION} h; ${mine.refusedPerYear} refused in 365 days.`
        : `Room for ${mine.retries} twice-daily runs; ${RULES[other].short} leaves ${length(theirs.slack, short)}.`,
      caption: limited
        ? `Every run renews, and Let’s Encrypt allows 5 certificates for the same names in 7 days, giving one back every ${EMISSION} hours. After ${perWindow(rule).issued.filter((t) => t < mine.firstRefused!).length - 1} renewals the run at hour ${mine.firstRefused} is refused. In 365 days ${mine.refusedPerYear} attempts are refused and ${mine.renewalsPerYear} succeed.`
        : `When a renewal falls due the certificate still has ${length(mine.slack, short)} to run, time for ${mine.retries} twice-daily runs to try again if the CA or the challenge fails. ${upper(RULES[other].short)} leaves ${length(theirs.slack, short)}.`,
    });
    await s.clear();
    const adjective = life.label.replace(/ (day|hour)s$/, '-$1');
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
      detail: true,
      title: `Let’s Encrypt’s ARI window: ${when(ari.start)} to ${when(ari.end)}`,
      line: settingFirst
        ? `The 30-day setting renews at ${at(ari.runs[0]!.at, short)}, before the window opens.`
        : ari.runs.length === 1 && ari.runs[0]!.at + BACKDATE >= ari.end
          ? `No run falls inside it; the next run, at ${at(ari.runs[0]!.at, short)}, renews.`
          : `Each run draws a random time in it; ${yearly} renewals in 365 days.`,
      caption: `Certbot 4.1 and later ask Let’s Encrypt when to renew; the answer is a window 1% of the life either side of ${short ? 'half way' : 'two thirds'}. ${
        settingFirst
          ? `The 30-day setting still renews on its own, at ${at(ari.runs[0]!.at, short)}, before the window opens, so the answer changes nothing.`
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

    // --------------------------------------------------------------- replaces
    await this.step('replaces', {
      detail: true,
      title: 'Certbot’s renewals still count against the limit',
      line: 'Certbot’s order names no predecessor, so the limit check runs.',
      caption:
        'More frequent renewals matter if they consume an issuance limit. Boulder skips the 5-in-7-days check only for an order that names the certificate it replaces and arrives inside that certificate’s window. Certbot 5.8’s order carries identifiers and a profile, nothing more, so every renewal is checked. A refused order costs nothing; an issued certificate takes a token.',
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
  }
}

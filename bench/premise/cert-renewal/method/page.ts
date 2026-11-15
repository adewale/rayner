// The method-only cert-renewal page: the same script intent and model as scenes/explainers/cert-renewal,
// with no engine. Every picture is a pure function from state to an SVG string; every step is a pure function
// from (lifetime, rule) to { title, caption, svg }. main.ts wires them to the shared shell.
import { DAY, EMISSION, LIFETIMES, LIMIT, RUN_EVERY, ariSummary, defaultRenewalOffset, dueOffset, simulate, summarize, windowFor } from '../../../../scenes/explainers/cert-renewal/model.ts';
import type { LifetimeKey, Rule } from '../../../../scenes/explainers/cert-renewal/model.ts';
import { questions } from '../../../../scenes/explainers/cert-renewal/answers.ts';
import { C, W, line, rect, svg, swatch, text } from '../../draw.ts';
import { BR, LETS_ENCRYPT, LIVE_ARI } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}
export const KEYS = Object.keys(LIFETIMES) as LifetimeKey[];
export const DEFAULT: { lifetime: LifetimeKey; rule: Rule } = { lifetime: '160h', rule: 'fixed30' };
export const RULE_NAME: Record<Rule, string> = { fraction: 'Certbot 4.1+ default', fixed30: '30 days before expiry' };
const days = (h: number) => +(h / DAY).toFixed(1);
const short = (k: LifetimeKey) => LIFETIMES[k].hours < 10 * DAY;
/** "day 42.7" or "hour 80": the unit the page uses for this lifetime. */
const at = (k: LifetimeKey, h: number) => (short(k) ? `hour ${+h.toFixed(1)}` : `day ${days(h)}`);
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** "90-day", "160-hour": the lifetime as an adjective. */
const adj = (k: LifetimeKey) => LIFETIMES[k].label.replace(/ days$/, '-day').replace(/ hours$/, '-hour');
const other = (r: Rule): Rule => (r === 'fraction' ? 'fixed30' : 'fraction');

// ------------------------------------------------------------------ pictures: state in, SVG out
/** A timeline of maximum lifetimes: each phase a bar as tall as its days. */
export function policySvg(phases: { label: string; days: number }[], title: string, note: string): string {
  const x0 = 8,
    w = (W - 16) / phases.length,
    base = 200,
    scale = 160 / 398;
  let body = text(8, 16, title, { size: 12.5, weight: '600' });
  phases.forEach((p, i) => {
    const h = p.days * scale;
    body += rect(x0 + i * w + 6, base - h, w - 12, h, C.a, { stroke: C.line });
    body += text(x0 + i * w + w / 2, base - h - 6, `${p.days} days`, { size: 13, anchor: 'middle', weight: '600' });
    body += text(x0 + i * w + w / 2, base + 18, p.label, { size: 12, anchor: 'middle' });
  });
  body += text(8, base + 40, note, { size: 11.5, fill: C.soft });
  return svg(base + 48, body, `${title}: ${phases.map((p) => `${p.days} days ${p.label}`).join(', ')}`);
}

/** Four certificates lined up at expiry, the 30-day line, and where each rule falls due. */
export function marginSvg(key: LifetimeKey, show: 'fixed' | 'both'): string {
  const span = 90 * DAY + 30 * DAY,
    x = (h: number) => 8 + ((h + 30 * DAY) / span) * (W - 70);
  const expiry = 90 * DAY;
  let body = text(8, 16, 'Each bar: issue to expiry, lined up at expiry', { size: 12.5, weight: '600' });
  const cut = expiry - 30 * DAY;
  KEYS.forEach((k, i) => {
    const L = LIFETIMES[k].hours,
      y = 32 + i * 34;
    body += rect(x(expiry - L), y, x(expiry) - x(expiry - L), 20, k === key ? C.b : '#f8e1bd', { stroke: k === key ? C.ink : C.line, sw: k === key ? 1.5 : 1 });
    body += text(W - 8, y + 15, LIFETIMES[k].label, { size: 12, anchor: 'end', weight: k === key ? '600' : undefined });
    if (show === 'both') {
      const due = expiry - L + defaultRenewalOffset(L);
      body += `<path d="M${x(due)},${y - 3} l5,-6 h-10 z" fill="${C.good}"/>`;
    }
    const fixedDue = Math.max(expiry - L, cut);
    body += `<path d="M${x(fixedDue)},${y + 23} l5,6 h-10 z" fill="${C.bad}"/>`;
  });
  body += line(x(cut), 26, x(cut), 32 + KEYS.length * 34, { stroke: C.bad, sw: 1.5, dash: true });
  body += text(x(cut) + 4, 32 + KEYS.length * 34 + 12, '30 days before expiry', { size: 12, fill: C.bad });
  let h = 32 + KEYS.length * 34 + 22;
  body += swatch(8, h, C.bad, '▼ 30-day rule falls due');
  if (show === 'both') body += swatch(200, h, C.good, '▲ Certbot 4.1 default');
  h += 20;
  return svg(h, body, `Lifetimes lined up at expiry; the 30-day rule and ${show === 'both' ? 'the default' : 'no other rule'} marked`);
}

/** Issuances (tall ticks) and refusals (short ticks) over the year step's window, for one rule. */
function strip(y: number, key: LifetimeKey, rule: Rule, label: string): string {
  const win = windowFor(key),
    run = simulate(rule, LIFETIMES[key].hours, win);
  const x = (h: number) => 8 + (h / win) * (W - 16);
  let body = text(8, y, `${label}: ${run.issued.length - 1} renewals${run.refused.length ? `, ${run.refused.length} refused` : ''}`, { size: 12.5, weight: '600' });
  body += line(8, y + 30, W - 8, y + 30, { stroke: C.line });
  for (const t of run.issued) body += line(x(t), y + 10, x(t), y + 30, { stroke: C.ink, sw: 1.5 });
  for (const t of run.refused) body += line(x(t), y + 32, x(t), y + 40, { stroke: C.bad, sw: 1.5 });
  return body;
}
export function yearSvg(key: LifetimeKey, rule: Rule, both: boolean): string {
  let body = strip(16, key, rule, RULE_NAME[rule]);
  let h = 64;
  if (both) {
    body += strip(h + 16, key, other(rule), RULE_NAME[other(rule)]);
    h += 64;
  }
  body += text(8, h + 4, key === '160h' ? 'Two weeks from a first certificate; runs every 12 hours.' : 'One year from a first certificate; runs every 12 hours.', { size: 11.5, fill: C.soft });
  return svg(h + 12, body, `Renewals over ${key === '160h' ? 'two weeks' : 'a year'} for ${LIFETIMES[key].label}`);
}

/** From the moment a renewal falls due to expiry, with the runs that could retry. */
export function slackSvg(key: LifetimeKey, rule: Rule): string {
  const s = summarize(rule, key),
    L = s.lifetime;
  const x = (h: number) => 8 + (h / L) * (W - 16);
  let body = text(8, 16, `${LIFETIMES[key].label}, ${RULE_NAME[rule]}`, { size: 12.5, weight: '600' });
  body += rect(8, 30, W - 16, 22, '#f8e1bd', { stroke: C.line });
  body += rect(x(s.due), 30, x(L) - x(s.due), 22, C.goodFill, { stroke: C.good });
  for (let t = RUN_EVERY; t < L; t += RUN_EVERY) if (t > s.due) body += line(x(t), 54, x(t), 62, { stroke: C.ink });
  body += text(x(s.due), 80, `due at ${at(key, s.due)}`, { size: 12, anchor: s.due > L * 0.7 ? 'end' : 'start' });
  body += text(8, 102, `${short(key) ? `${+s.slack.toFixed(1)} hours` : `${days(s.slack)} days`} left, ${s.retries} runs to retry`, { size: 12.5 });
  return svg(112, body, `A renewal falls due at ${at(key, s.due)} with ${s.retries} runs left`);
}

/** The exact-set limit: tokens, the burst and the refill. */
export function limitSvg(key: LifetimeKey): string {
  const run = simulate('fixed30', LIFETIMES[key].hours, 10 * DAY + 1);
  const x = (h: number) => 8 + (h / (10 * DAY)) * (W - 16);
  let body = text(8, 16, `${LIMIT.count} certificates per ${LIMIT.periodHours / DAY} days for the same names; one back every ${EMISSION} hours`, { size: 12, weight: '600' });
  body += line(8, 60, W - 8, 60, { stroke: C.line });
  for (const t of run.issued) body += line(x(t), 36, x(t), 60, { stroke: C.ink, sw: 1.5 });
  for (const t of run.refused) body += line(x(t), 62, x(t), 72, { stroke: C.bad, sw: 1.5 });
  body += swatch(8, 84, C.ink, `issued (${run.issued.length})`) + swatch(130, 84, C.bad, `refused (${run.refused.length})`);
  body += text(8, 116, 'First ten days, runs every 12 hours.', { size: 11.5, fill: C.soft });
  return svg(124, body, `Under the limit: issued at hours ${run.issued.join(', ')}; refused at ${run.refused.join(', ')}`);
}

/** The new order Certbot sends, against what Boulder needs to skip the limit. */
export function replacesSvg(): string {
  let body = text(8, 16, 'Certbot 5.8’s new order', { size: 12.5, weight: '600' });
  body += rect(8, 26, 180, 84, '#fafafa', { stroke: C.line, rx: 6 });
  body += text(20, 50, 'identifiers ✓', { size: 13, mono: true }) + text(20, 72, 'profile ✓', { size: 13, mono: true }) + text(20, 94, 'replaces —', { size: 13, mono: true, fill: C.bad });
  body += text(212, 16, 'Boulder skips the limit only if', { size: 12.5, weight: '600' });
  body += text(212, 44, '1. replaces names the', { size: 12.5 }) + text(212, 62, 'certificate it replaces, and', { size: 12.5 });
  body += text(212, 84, '2. the order arrives inside', { size: 12.5 }) + text(212, 102, 'that certificate’s ARI window', { size: 12.5 });
  body += text(8, 134, 'No predecessor named, so every Certbot renewal is checked against the limit.', { size: 12, fill: C.soft });
  return svg(144, body, 'Certbot’s order names no predecessor, so Boulder checks the limit');
}

/** Let's Encrypt's ARI window and the runs that may fall in it; for 90 days the recorded live windows too. */
export function ariSvg(key: LifetimeKey, rule: Rule): string {
  const a = ariSummary(rule, key);
  const lo = Math.min(a.start, ...a.runs.map((r) => r.at)) - 24,
    hi = Math.max(a.end, ...a.runs.map((r) => r.at)) + 24;
  const x = (h: number) => 8 + ((h - lo) / (hi - lo)) * (W - 16);
  let body = text(8, 16, `ARI window for ${LIFETIMES[key].label}: ${at(key, a.start)} to ${at(key, a.end)}`, { size: 12.5, weight: '600' });
  body += rect(x(a.start), 30, x(a.end) - x(a.start), 26, C.goodFill, { stroke: C.good });
  for (const r of a.runs) {
    body += line(x(r.at), 26, x(r.at), 62, { stroke: C.ink, sw: 1.5 });
    body += text(x(r.at), 78, r.p < 0.01 ? '<1%' : pct(r.p), { size: 12, anchor: 'middle', mono: true });
  }
  let h = 92;
  body += text(8, h, `Runs that may renew, with the chance each is the one${rule === 'fixed30' ? ' (the 30-day setting renews on its own)' : ''}.`, { size: 11.5, fill: C.soft });
  if (key === '90d') {
    const s = (iso: string) => Date.parse(iso) / 1000;
    const starts = LIVE_ARI.map((r) => (s(r[3]) - s(r[1])) / 86400),
      ends = LIVE_ARI.map((r) => (s(r[4]) - s(r[1])) / 86400);
    h += 22;
    const span = (xs: number[]) => (Math.min(...xs).toFixed(2) === Math.max(...xs).toFixed(2) ? Math.min(...xs).toFixed(2) : `${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}`);
    body += text(8, h, `Recorded 2026-10-25, ten live 90-day certificates: every window`, { size: 12 });
    body += text(8, h + 18, `opens at day ${span(starts)} and closes at day ${span(ends)} after notBefore.`, { size: 12 });
    h += 18;
  }
  return svg(h + 10, body, `ARI window ${a.start} to ${a.end} hours; runs ${a.runs.map((r) => r.at).join(', ')}`);
}

// ------------------------------------------------------------------ the steps
export function steps(key: LifetimeKey, rule: Rule): Step[] {
  const L = LIFETIMES[key].hours,
    label = LIFETIMES[key].label;
  const fixed = summarize('fixed30', key),
    share = summarize('fraction', key),
    mine = summarize(rule, key),
    theirs = summarize(other(rule), key);
  const fixedOffset = dueOffset('fixed30', L);
  const out: Step[] = [];

  out.push({
    id: 'limit',
    title: 'Public certificates shrink from 398 days to 47',
    caption: `The CA/Browser Forum's Baseline Requirements cap a public TLS certificate's lifetime: ${BR[0].days} days before ${BR[1].from}, ${BR[1].days} from then, ${BR[2].days} from ${BR[2].from} and ${BR[3].days} from ${BR[3].from}. A renewal margin that was a small part of a long lifetime can become longer than the whole lifetime. What should a renewal job do then?`,
    svg: policySvg(BR.map((p) => ({ label: p.from ? `from ${p.from.slice(0, 7)}` : 'until 2026-03', days: p.days })), 'Maximum lifetime of a public TLS certificate', 'Baseline Requirements 2.3.1, section 6.3.2.'),
  });
  out.push({
    id: 'letsencrypt',
    title: 'Let’s Encrypt’s default reaches 45 days in 2028',
    caption: `Let's Encrypt's opt-in tlsserver profile has issued ${LETS_ENCRYPT[0].days}-day certificates since ${LETS_ENCRYPT[0].date}. Its default classic profile goes from 90 days to ${LETS_ENCRYPT[1].days} on ${LETS_ENCRYPT[1].date} and to ${LETS_ENCRYPT[2].days} on ${LETS_ENCRYPT[2].date}. Its opt-in shortlived profile issues 160-hour certificates.`,
    svg: policySvg([{ label: 'classic today', days: 90 }, ...LETS_ENCRYPT.map((d) => ({ label: `${d.profile} ${d.date.slice(0, 7)}`, days: d.days }))], 'Let’s Encrypt lifetimes', 'Let’s Encrypt’s announced schedule; shortlived (160 hours) not drawn.'),
  });
  out.push({
    id: 'old-rule',
    title: 'Certbot 3.3 renews 30 days before expiry',
    caption: `Certbot 3.3 renews when the certificate expires within renew_before_expiry, 30 days unless the renewal file sets another value. Its documented cron line runs certbot renew twice a day. Let's Encrypt backdates notBefore by 58.5 minutes, so a 90-day certificate falls due just before the run at day 60. Predict: when does a 30-day margin renew a ${adj(key)} certificate?`,
    svg: marginSvg(key, 'fixed'),
  });
  out.push({
    id: 'margin',
    title: fixedOffset < 0 ? `Answer: 30 days before expiry is ${days(-fixedOffset)} days before issue` : `Answer: 30 days before expiry is day ${Math.round(days(fixedOffset))}, ${pct(fixedOffset / L)} of the way through`,
    caption: fixedOffset < 0
      ? `A ${adj(key)} certificate is shorter than the 30-day margin: the margin begins ${Math.round(-fixedOffset)} hours before it is issued, so every certificate, even a fresh replacement, is due from issue, and the first run, at hour ${fixed.renewsAt}, renews it.`
      : `Counting 30 days back from expiry, a ${adj(key)} certificate falls due at day ${Math.round(days(fixedOffset))}, with ${pct(1 - fixedOffset / L)} of its life left. On a 90-day certificate that is day 60, a third left: the lifetime the 30-day margin was written for.`,
    svg: marginSvg(key, 'fixed'),
  });
  out.push({
    id: 'new-rule',
    title: `Certbot 4.1 renews ${short(key) ? 'half way' : 'two thirds of the way'} through a ${adj(key)} certificate`,
    caption: `Certbot 4.1 renews at a share of the life instead: with renew_before_expiry unset, two thirds of the way through, or half way for certificates under ten days, unless the CA's ARI answer (RFC 9773) sets the window. On a ${adj(key)} certificate that is ${at(key, share.due)}${share.renewsAt !== Math.round(share.due) ? `, renewed by the run at ${at(key, share.renewsAt)}` : ''}; the 30-day rule renews at ${at(key, fixed.renewsAt)}.`,
    svg: marginSvg(key, 'both'),
  });
  const ratio = fixed.renewalsPerYear / share.renewalsPerYear;
  const win = windowFor(key),
    run = simulate(rule, L, win);
  out.push({
    id: 'year',
    title: `${label} under the ${rule === 'fraction' ? 'default rule' : '30-day rule'}: ${run.issued.length - 1} renewals in ${key === '160h' ? 'two weeks' : 'a year'}`,
    caption: rule === 'fixed30' && fixedOffset < 0
      ? `Every certificate is due from issue, so every twice-daily run renews until the run at hour ${fixed.firstRefused}, when Let's Encrypt's limit starts refusing most runs. After that, renewals come 24 to 36 hours apart.`
      : `Each certificate falls due at ${at(key, mine.due)} and the next twice-daily run, ${mine.renewsAt - mine.due < 1 ? 'under an hour later' : `at ${at(key, mine.renewsAt)}`}, replaces it.`,
    svg: yearSvg(key, rule, false),
  });
  out.push({
    id: 'other-rule',
    title: mine.renewalsPerYear === theirs.renewalsPerYear ? `${RULE_NAME[other(rule)]}: the same ${theirs.renewalsPerYear} a year` : `${RULE_NAME[other(rule)]}: ${theirs.renewalsPerYear} a year instead of ${mine.renewalsPerYear}`,
    caption: `Over 365 days the 30-day rule renews ${fixed.renewalsPerYear} times and the default ${share.renewalsPerYear}${ratio === 1 ? '' : `: ${ratio === 2 ? 'twice' : `${ratio.toFixed(1)} times`} as often`}${fixed.refusedPerYear ? `, and the limit refuses ${fixed.refusedPerYear} of the 30-day rule's runs` : ''}.`,
    svg: yearSvg(key, rule, true),
  });
  out.push(
    rule === 'fixed30' && fixedOffset < 0
      ? {
          id: 'slack',
          title: `Renewing at every run, Let’s Encrypt refuses at hour ${fixed.firstRefused}`,
          caption: `Let's Encrypt allows ${LIMIT.count} certificates for the same names in ${LIMIT.periodHours / DAY} days and gives one back every ${EMISSION} hours. After ${simulate('fixed30', L, fixed.firstRefused!).issued.length - 1} renewals the run at hour ${fixed.firstRefused} is refused; in 365 days ${fixed.refusedPerYear} runs are refused and ${fixed.renewalsPerYear} renew. A refused order costs nothing, and the certificate in place keeps working.`,
          svg: limitSvg(key),
        }
      : {
          id: 'slack',
          title: `A failed renewal leaves ${short(key) ? `${+mine.slack.toFixed(1)} hours` : `${days(mine.slack)} days`} to retry`,
          caption: `When the renewal falls due the certificate still has ${short(key) ? `${+mine.slack.toFixed(1)} hours` : `${days(mine.slack)} days`} to run: ${mine.retries} twice-daily runs to try again if the CA or the challenge fails. The ${rule === 'fraction' ? '30-day rule' : 'default rule'} leaves ${short(key) ? `${+theirs.slack.toFixed(1)} hours` : `${days(theirs.slack)} days`}${rule === 'fraction' && fixedOffset < 0 ? `, but renews at every run until Let's Encrypt refuses it at hour ${fixed.firstRefused}` : ''}.`,
          svg: slackSvg(key, rule),
        },
  );
  out.push({
    id: 'replaces',
    title: 'Certbot’s renewals still count against the limit',
    caption: `Boulder skips the ${LIMIT.count}-in-${LIMIT.periodHours / DAY}-days check only for an order that names the certificate it replaces and arrives inside that certificate's ARI window. Certbot 5.8's new order carries identifiers and a profile and names no predecessor, so its renewals are checked. A refused order spends nothing; an issued certificate spends a token.`,
    svg: replacesSvg(),
  });
  const a = ariSummary(rule, key);
  const fires = rule === 'fixed30' && a.runs.length === 1 && a.runs[0]!.p === 1 && a.runs[0]!.at < a.start;
  out.push({
    id: 'ari',
    title: `Let’s Encrypt’s ARI window: ${at(key, a.start)} to ${at(key, a.end)}`,
    caption: `Certbot 4.1 and later ask Let's Encrypt when to renew. Its answer is a window 1% of the lifetime either side of ${short(key) ? 'half way' : 'two thirds'}. ${fires ? `The 30-day setting still renews on its own, at ${at(key, a.runs[0]!.at)}, before the window opens, so the answer changes nothing until the setting is removed.` : a.runs.length === 1 ? `No run falls inside it, so the first run after it, at ${at(key, a.runs[0]!.at)}, renews.` : `Each run draws a random time in it and renews once that time has passed: ${a.runs.map((r) => `${at(key, r.at)} (${r.p < 0.01 ? 'under 1%' : pct(r.p)})`).join(', ')}; ${a.perYear[0] === a.perYear[1] ? a.perYear[0] : `${a.perYear[0]} or ${a.perYear[1]}`} renewals in 365 days.`}`,
    svg: ariSvg(key, rule),
  });
  return out;
}

export const CHECKS = [
  { q: 'A CA issues 20-day certificates, and Certbot keeps renew_before_expiry at 30 days. How many certificates does it get in a year, and how many would the 4.1 default get?', a: questions[1]() },
  { q: 'For 45-day certificates, someone sets renew_before_expiry to 10 days. When does Certbot 4.1 renew, and how long is left to retry?', a: questions[2]() },
  {
    q: 'A client renews at a random time inside Let’s Encrypt’s ARI window. Is that order exempt from the 5-in-7-days limit?',
    a: 'Not by its timing alone. Boulder exempts an order only when it names the certificate it replaces and arrives inside that certificate’s window. Certbot 5.8’s orders name no predecessor, so they are counted even when they follow the window.',
  },
];

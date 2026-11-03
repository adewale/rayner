import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { BR_PHASES, EMISSION, LE_DATES, LIFETIMES, LIMIT, ariSummary, simulate, summarize, windowFor } from '../../../scenes/explainers/lib/cert-renewal.ts';
import type { LifetimeKey, Rule } from '../../../scenes/explainers/lib/cert-renewal.ts';

/** Every case's step state equals the renewal model's answers for that lifetime and rule. */
export function check(trace: Trace, values: Record<string, string>): void {
  const key = values.lifetime as LifetimeKey,
    rule = values.rule as Rule,
    other: Rule = rule === 'fraction' ? 'fixed30' : 'fraction';
  assert.ok(key in LIFETIMES, `unknown lifetime ${key}`);
  const window = windowFor(key),
    run = (r: Rule) => simulate(r, LIFETIMES[key].hours, window);
  const mine = summarize(rule, key),
    theirs = summarize(other, key);

  assertStepState(trace, 'limit', { limits: BR_PHASES.map((p) => p.days) });
  assertStepState(trace, 'letsencrypt', { letsEncrypt: LE_DATES.map((d) => [d.date, d.profile, d.days]) });
  const old = summarize('fixed30', '90d'),
    fixed = summarize('fixed30', key),
    share = summarize('fraction', key);
  assertStepState(trace, 'old-rule', { oldRule: { due: old.due, renewsAt: old.renewsAt } });
  // The new-rule step draws this case's lifetime with the replacement each rule makes.
  assertStepState(trace, 'new-rule', {
    newRule: {
      lifetime: key,
      fixed30: { due: fixed.due, renewsAt: fixed.renewsAt },
      fraction: { due: share.due, renewsAt: share.renewsAt },
    },
  });
  assertStepState(trace, 'year', {
    year: { rule, issued: run(rule).issued, refused: run(rule).refused, renewalsPerYear: mine.renewalsPerYear },
  });
  assertStepState(trace, 'other-rule', {
    otherRule: { rule: other, issued: run(other).issued, refused: run(other).refused, renewalsPerYear: theirs.renewalsPerYear },
  });
  const byRule = { [rule]: mine, [other]: theirs } as Record<Rule, typeof mine>;
  assertStepState(trace, 'slack', {
    slack: {
      fraction: byRule.fraction.slack,
      fixed30: byRule.fixed30.slack,
      retries: mine.retries,
      firstRefused: mine.firstRefused,
      refused: mine.refusedPerYear,
    },
  });
  const ari = ariSummary(rule, key);
  assertStepState(trace, 'ari', { ari: { start: ari.start, end: ari.end, runs: ari.runs, perYear: ari.perYear } });
  assertStepState(trace, 'replaces', { replaces: { replacesSent: false, burst: LIMIT.burst, emissionHours: EMISSION } });

  // The headings say the model's counts.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  assert.ok(title('year').includes(`${run(rule).issued.length - 1} renewals`), title('year'));
  assert.ok(title('other-rule').includes(`${run(other).issued.length - 1} renewals`), title('other-rule'));
}

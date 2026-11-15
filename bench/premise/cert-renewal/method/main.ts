import { mount } from '../../shell.ts';
import { CHECKS, DEFAULT, KEYS, RULE_NAME, steps } from './page.ts';
import { LIFETIMES } from '../../../../scenes/explainers/cert-renewal/model.ts';
import type { LifetimeKey, Rule } from '../../../../scenes/explainers/cert-renewal/model.ts';

mount(document.getElementById('app')!, {
  settings: [
    { id: 'lifetime', label: 'Certificate lifetime', default: DEFAULT.lifetime, options: KEYS.map((k) => ({ value: k, label: LIFETIMES[k].label })) },
    { id: 'rule', label: 'Renewal rule', default: DEFAULT.rule, options: (['fraction', 'fixed30'] as Rule[]).map((r) => ({ value: r, label: RULE_NAME[r] })) },
  ],
  steps: (v) => steps(v.lifetime as LifetimeKey, v.rule as Rule),
  checks: CHECKS,
});

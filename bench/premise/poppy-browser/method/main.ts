import { mount } from '../../shell.ts';
import { CHECKS, LABEL, SETTING_KEYS, steps } from './page.ts';
import type { SettingKey } from './page.ts';

mount(document.getElementById('app')!, {
  settings: [{ id: 'signin', label: 'Your agent is', default: 'signed-in', options: SETTING_KEYS.map((k) => ({ value: k, label: LABEL[k] })) }],
  steps: (v) => steps(v.signin as SettingKey),
  checks: CHECKS,
});

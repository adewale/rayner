import { mount } from '../../shell.ts';
import { CHECKS, DEFAULT, SIZE_KEYS, steps } from './page.ts';
import type { Reserve } from './page.ts';
import { RESERVES, SIZES } from '../../../../scenes/explainers/ext4-space/model.ts';
import type { Size } from '../../../../scenes/explainers/ext4-space/model.ts';

mount(document.getElementById('app')!, {
  settings: [
    { id: 'size', label: 'Size', default: DEFAULT.size, options: SIZE_KEYS.map((k) => ({ value: k, label: SIZES[k].label })) },
    { id: 'reserve', label: 'Root reserve', default: String(DEFAULT.reserve), options: RESERVES.map((m) => ({ value: String(m), label: `-m ${m}${m === 5 ? ' (default)' : ''}` })) },
  ],
  steps: (v) => steps(v.size as Size, Number(v.reserve) as Reserve),
  checks: CHECKS,
});

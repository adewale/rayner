import { mount } from '../../shell.ts';
import { CHECKS, steps } from './page.ts';
import type { Column } from '../../../../scenes/explainers/pg-page/model.ts';

mount(document.getElementById('app')!, {
  settings: [
    {
      id: 'column',
      label: 'Column',
      default: 'int4',
      options: [
        { value: 'int4', label: 'int4' },
        { value: 'int8', label: 'int8 (bigint)' },
        { value: 'int4-text', label: 'int4 + text' },
      ],
    },
  ],
  steps: (v) => steps(v.column as Column),
  checks: CHECKS,
});

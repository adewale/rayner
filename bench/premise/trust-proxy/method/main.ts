import { mount } from '../../shell.ts';
import { CHECKS, DEFAULT, steps } from './page.ts';
import type { RequestKey, TrustKey } from '../../../../scenes/explainers/trust-proxy/model.ts';

mount(document.getElementById('app')!, {
  settings: [
    {
      id: 'trust',
      label: 'trust proxy',
      default: DEFAULT.trust,
      options: [
        { value: 'true', label: 'true' },
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: 'list', label: "'10.0.0.0/8, 192.0.2.0/24'" },
      ],
    },
    {
      id: 'request',
      label: 'Request',
      default: DEFAULT.request,
      options: [
        { value: 'client', label: 'Client via the CDN' },
        { value: 'forged', label: 'Attacker via the CDN' },
        { value: 'direct', label: 'Attacker, skipping the CDN' },
      ],
    },
  ],
  steps: (v) => steps(v.trust as TrustKey, v.request as RequestKey),
  checks: CHECKS.map((c) => ({ q: c.q, a: c.a })),
});

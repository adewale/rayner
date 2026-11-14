// The oracle: req.ip as real Express 5.3.0 (proxy-addr 2.0.8, forwarded 0.2.0) reported it, copied from
// scenes/explainers/trust-proxy/model.test.ts, where it was recorded on 2026-10-25 over a real HTTP
// connection on loopback with only the socket's remoteAddress stubbed (to the load balancer's 10.0.0.5).
// The method-only page draws its closing table from these values, not from the model, and method.test.ts
// requires the model to agree with them.
import type { RequestKey, TrustKey } from '../../../../scenes/explainers/trust-proxy/model.ts';

export const SOCKET = '10.0.0.5';

export const HEADER: Record<RequestKey, string> = {
  client: '203.0.113.7, 192.0.2.10',
  forged: '1.2.3.4, 198.51.100.9, 192.0.2.10',
  direct: '1.2.3.4, 198.51.100.9',
};

export const EXPRESS_IP: Record<TrustKey, Record<RequestKey, string>> = {
  true: { client: '203.0.113.7', forged: '1.2.3.4', direct: '1.2.3.4' },
  1: { client: '192.0.2.10', forged: '192.0.2.10', direct: '198.51.100.9' },
  2: { client: '203.0.113.7', forged: '198.51.100.9', direct: '1.2.3.4' },
  list: { client: '203.0.113.7', forged: '198.51.100.9', direct: '198.51.100.9' },
};

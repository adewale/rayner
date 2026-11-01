import { Group } from '../../../../src/index.ts';
import { REQUESTS, TRUSTS, atExpress, readAddresses, answer, TRUST_LABEL } from '../trust-proxy.ts';
import type { TrustKey, RequestKey } from '../trust-proxy.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(trustKey: TrustKey, requestKey: RequestKey): ReaderFrame[] {
  const r = REQUESTS[requestKey],
    got = atExpress(r),
    read = readAddresses(got.socket, got.xff, TRUSTS[trustKey]),
    out = answer(trustKey, requestKey);
  return [
    {
      id: 'reader-path',
      title: 'Whose address reaches Express?',
      line: `Trust setting: ${TRUST_LABEL[trustKey]}.`,
      caption: `The request crosses ${r.via.length} proxy hop${r.via.length === 1 ? '' : 's'} before Express. Its socket identifies the nearest peer. X-Forwarded-For carries earlier address claims, so trusting every entry can let an attacker choose req.ip.`,
      values: { requestKey, trustKey, socket: got.socket, xff: got.xff },
      draw: (s) =>
        new Group(
          flow(s, [r.sender.name, ...r.via.map((h) => h.name), 'Express']),
          label(`Socket peer: ${got.socket}`, 0, -1.4, s.palette.ink, 0.7),
          label('Read addresses from the nearest peer outward', 0, -3, s.soft, 0.65),
        ),
    },
    {
      id: 'reader-answer',
      title: 'Where does the trust walk stop?',
      line: 'Read the nearest address first.',
      caption: `Express skips trusted proxy addresses until it reaches an untrusted address or the list’s end. That address becomes req.ip: ${out.ip}, ${out.whose}. Later entries are unread. The last address is an endpoint, so it is not tested as another proxy. Trusting a hop count assumes every allowed route has that length.`,
      values: { read, answer: out },
      draw: (s) =>
        table(
          ['Order', 'Address', 'Decision'],
          read.map((v, i) => {
            const hop = [r.sender, ...r.via].find((h) => h.addr === v.addr);
            const role = hop?.id === 'balancer' ? 'LB' : hop?.id === 'edge' ? 'CDN' : (hop?.id ?? 'forged');
            return [`${i}: ${role}`, v.addr, v.verdict === 'answer' ? 'req.ip' : v.verdict];
          }),
          s,
          { xs: [-5.2, -0.7, 4.6], y: 2.7, gap: 1.45 },
        ),
    },
  ];
}

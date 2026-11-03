import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import {
  ADDR,
  MACHINES,
  REQUESTS,
  REQUEST_KEYS,
  TABLE,
  TRUSTS,
  TRUST_KEYS,
  arrivals,
  atExpress,
  compileTrust,
  forwarded,
  inRange,
  readAddresses,
  reqIp,
  reqIps,
  positions,
} from '../scenes/explainers/lib/trust-proxy.ts';
import type { Trust } from '../scenes/explainers/lib/trust-proxy.ts';

// Real Express 5.3.0 (proxy-addr 2.0.8, forwarded 0.2.0), run on 2026-10-25 over a real HTTP connection
// on loopback: `app.set('trust proxy', value)`, a handler answering { ip: req.ip, ips: req.ips }, and
// http.get with the X-Forwarded-For below. The only stubbed input was the socket's remoteAddress, set to
// the load balancer's 10.0.0.5 on each accepted connection. The list setting was the string
// '10.0.0.0/8, 192.0.2.0/24'; 'uniquelocal' is the preset 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
const SOCKET = '10.0.0.5';
const HEADER = {
  client: '203.0.113.7, 192.0.2.10',
  forged: '1.2.3.4, 198.51.100.9, 192.0.2.10',
  direct: '1.2.3.4, 198.51.100.9',
} as const;
const EXPRESS: Record<string, { trust: Trust; ip: Record<keyof typeof HEADER, string>; ips: Record<keyof typeof HEADER, string[]> }> = {
  true: {
    trust: true,
    ip: { client: '203.0.113.7', forged: '1.2.3.4', direct: '1.2.3.4' },
    ips: { client: ['203.0.113.7', '192.0.2.10'], forged: ['1.2.3.4', '198.51.100.9', '192.0.2.10'], direct: ['1.2.3.4', '198.51.100.9'] },
  },
  1: {
    trust: 1,
    ip: { client: '192.0.2.10', forged: '192.0.2.10', direct: '198.51.100.9' },
    ips: { client: ['192.0.2.10'], forged: ['192.0.2.10'], direct: ['198.51.100.9'] },
  },
  2: {
    trust: 2,
    ip: { client: '203.0.113.7', forged: '198.51.100.9', direct: '1.2.3.4' },
    ips: { client: ['203.0.113.7', '192.0.2.10'], forged: ['198.51.100.9', '192.0.2.10'], direct: ['1.2.3.4', '198.51.100.9'] },
  },
  list: {
    trust: ['10.0.0.0/8', '192.0.2.0/24'],
    ip: { client: '203.0.113.7', forged: '198.51.100.9', direct: '198.51.100.9' },
    ips: { client: ['203.0.113.7', '192.0.2.10'], forged: ['198.51.100.9', '192.0.2.10'], direct: ['198.51.100.9'] },
  },
  // The same run, for values the scene does not offer.
  false: { trust: false, ip: { client: SOCKET, forged: SOCKET, direct: SOCKET }, ips: { client: [], forged: [], direct: [] } },
  0: { trust: 0, ip: { client: SOCKET, forged: SOCKET, direct: SOCKET }, ips: { client: [], forged: [], direct: [] } },
  3: {
    trust: 3,
    ip: { client: '203.0.113.7', forged: '1.2.3.4', direct: '1.2.3.4' },
    ips: { client: ['203.0.113.7', '192.0.2.10'], forged: ['1.2.3.4', '198.51.100.9', '192.0.2.10'], direct: ['1.2.3.4', '198.51.100.9'] },
  },
  uniquelocal: {
    trust: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    ip: { client: '192.0.2.10', forged: '192.0.2.10', direct: '198.51.100.9' },
    ips: { client: ['192.0.2.10'], forged: ['192.0.2.10'], direct: ['198.51.100.9'] },
  },
};

test('the proxies’ appends give the headers the Express run received', () => {
  for (const key of REQUEST_KEYS) {
    const got = atExpress(REQUESTS[key]);
    assert.equal(got.socket, SOCKET, key);
    assert.equal(got.xff, HEADER[key], key);
  }
  // Hop by hop for the client: nothing, then the client's address, then the edge's appended.
  assert.deepEqual(
    arrivals(REQUESTS.client).map((a) => [a.at.id, a.socket, a.xff]),
    [
      ['edge', ADDR.client, null],
      ['balancer', ADDR.edge, ADDR.client],
      ['express', ADDR.balancer, `${ADDR.client}, ${ADDR.edge}`],
    ],
  );
});

test('req.ip and req.ips equal real Express 5.3.0 for every setting and request', () => {
  for (const [name, run] of Object.entries(EXPRESS))
    for (const key of REQUEST_KEYS) {
      assert.equal(reqIp(SOCKET, HEADER[key], run.trust), run.ip[key], `${name} ${key}`);
      assert.deepEqual(reqIps(SOCKET, HEADER[key], run.trust), run.ips[key], `${name} ${key} ips`);
    }
});

test('the scene’s table is the twelve Express answers', () => {
  for (const t of TRUST_KEYS) {
    assert.deepEqual(TRUSTS[t], EXPRESS[t]!.trust);
    for (const q of REQUEST_KEYS) assert.equal(TABLE[t][q].ip, EXPRESS[t]!.ip[q], `${t} ${q}`);
  }
  assert.deepEqual(
    TRUST_KEYS.map((t) => REQUEST_KEYS.map((q) => TABLE[t][q].outcome)),
    [
      ['sender', 'forged', 'forged'],
      ['proxy', 'proxy', 'sender'],
      ['sender', 'sender', 'forged'],
      ['sender', 'sender', 'sender'],
    ],
  );
});

test('forwarded reads the socket, then the header right to left, skipping spaces and empty entries', () => {
  assert.deepEqual(forwarded('10.0.0.5', null), ['10.0.0.5']);
  assert.deepEqual(forwarded('10.0.0.5', ' a ,b,, c'), ['10.0.0.5', 'c', 'b', 'a']);
});

test('inRange matches IPv4 prefixes', () => {
  assert.equal(inRange('10.0.0.5', '10.0.0.0/8'), true);
  assert.equal(inRange('11.0.0.5', '10.0.0.0/8'), false);
  assert.equal(inRange('192.0.2.10', '192.0.2.0/24'), true);
  assert.equal(inRange('192.0.3.10', '192.0.2.0/24'), false);
  assert.equal(inRange('172.31.255.255', '172.16.0.0/12'), true);
  assert.equal(inRange('172.32.0.0', '172.16.0.0/12'), false);
  assert.equal(inRange('1.2.3.4', '1.2.3.4'), true);
  assert.equal(inRange('1.2.3.5', '1.2.3.4'), false);
  assert.equal(inRange('200.1.1.1', '128.0.0.0/1'), true);
  assert.equal(inRange('not an ip', '0.0.0.0/1'), false);
  // proxy-addr 2.0.8 index.js:191 rejects range <= 0, despite CIDR's general /0 notation.
  assert.equal(inRange('203.0.113.7', '0.0.0.0/0'), false);
});

const octet = fc.integer({ min: 0, max: 255 });
const ip = fc.tuple(octet, octet, octet, octet).map((p) => p.join('.'));
const header = fc.array(ip, { minLength: 1, maxLength: 6 });

// proxy-addr 2.0.8 package.json pins ipaddr.js 1.9.1. Its own index.js:153-195
// requires decimal digits and range > 0 through 32. ipaddr.IPv4.parseCIDR permits
// /0, but Express uses proxy-addr's stricter configuration parser, not that API.
const ipv4Value = (address: string) => address.split('.').reduce((n, part) => n * 256 + Number(part), 0);
const inNetwork = (address: string, base: string, prefix: number) => {
  const size = 2 ** (32 - prefix);
  return Math.floor(ipv4Value(address) / size) === Math.floor(ipv4Value(base) / size);
};

test('IPv4 range membership follows independent network arithmetic; proxy-addr rejects prefix zero', () => {
  fc.assert(fc.property(ip, ip, fc.integer({ min: 0, max: 32 }), (address, base, prefix) => {
    const range = `${base}/${prefix}`;
    const expected = prefix !== 0 && inNetwork(address, base, prefix);
    assert.equal(inRange(address, range), expected);
    assert.equal(compileTrust([range])(address, 0), expected);
    // Matching the base forces the positive direction even for rare /32 matches.
    assert.equal(inRange(base, range), prefix !== 0);
    assert.equal(compileTrust([range])(base, 5), prefix !== 0);
  }), params(300));
});

test('malformed IPv4 ranges never trust an address, including through compileTrust', () => {
  const rejects = (base: string, prefix: string) => {
    const range = `${base}/${prefix}`;
    assert.equal(inRange(base, range), false, range);
    assert.equal(compileTrust([range])(base, 0), false, range);
    assert.deepEqual(readAddresses(base, '203.0.113.7', [range]), [
      { addr: base, index: 0, verdict: 'answer' },
      { addr: '203.0.113.7', index: 1, verdict: 'unread' },
    ]);
  };
  // Enumerate finite lexical classes; random sampling is for octets/fractions.
  for (const prefix of ['', ' ', '8e0', '+8', '-1', 'Infinity', 'NaN', '33', '8/garbage', '8/', '8junk']) rejects('10.1.2.3', prefix);
  fc.assert(fc.property(ip, fc.integer({ min: 0, max: 31 }), (base, n) => rejects(base, `${n}.5`)), params(200));
  for (const range of ['256.0.0.1/8', '10.0.0/8', '10.0.0.1//8']) {
    assert.equal(inRange('10.0.0.1', range), false, range);
    assert.equal(compileTrust([range])('10.0.0.1', 0), false, range);
  }
});

test('a hop count n answers the address at position n, or the last one', () => {
  fc.assert(
    fc.property(ip, fc.option(header, { nil: null }), fc.integer({ min: 0, max: 8 }), (socket, xs, n) => {
      const addrs = [socket, ...(xs ?? []).toReversed()];
      const last = Math.min(n, addrs.length - 1);
      assert.equal(reqIp(socket, xs ? xs.join(', ') : null, n), addrs[last]);
      assert.deepEqual(reqIps(socket, xs ? xs.join(', ') : null, n), addrs.slice(1, last + 1).reverse());
    }),
    params(),
  );
});

test('true answers the left-most entry (guide l.26), or the socket with no header', () => {
  fc.assert(
    fc.property(ip, fc.option(header, { nil: null }), (socket, xs) => {
      assert.equal(reqIp(socket, xs ? xs.join(', ') : null, true), xs ? xs[0] : socket);
    }),
    params(),
  );
});

test('an address list answers the nearest untrusted address (guide l.53)', () => {
  const ranges = ['10.0.0.0/8', '192.0.2.0/24'];
  const trusted = (a: string) => inNetwork(a, '10.0.0.0', 8) || inNetwork(a, '192.0.2.0', 24);
  // Exercise trusted runs as well as the usually-untrusted arbitrary socket.
  const mixedIp = fc.oneof(ip, fc.tuple(octet, octet, octet).map((p) => `10.${p.join('.')}`), octet.map((p) => `192.0.2.${p}`));
  fc.assert(
    fc.property(mixedIp, fc.option(fc.array(mixedIp, { minLength: 1, maxLength: 6 }), { nil: null }), (socket, xs) => {
      const xff = xs ? xs.join(', ') : null;
      const addrs = [socket, ...(xs ?? []).toReversed()];
      const firstUntrusted = addrs.slice(0, -1).findIndex((a) => !trusted(a));
      const last = firstUntrusted < 0 ? addrs.length - 1 : firstUntrusted;
      assert.equal(reqIp(socket, xff, ranges), addrs[last]);
      assert.deepEqual(reqIps(socket, xff, ranges), addrs.slice(1, last + 1).reverse());
      assert.deepEqual(readAddresses(socket, xff, ranges), addrs.map((addr, index) => ({
        addr, index, verdict: index < last ? 'trusted' : index === last ? 'answer' : 'unread',
      })));
      for (const address of addrs) assert.equal(compileTrust(ranges)(address, 0), trusted(address));
    }),
    params(),
  );
});

test('with 2, an attacker straight at the load balancer chooses req.ip; via the CDN, or with the list, it cannot', () => {
  fc.assert(
    fc.property(header, (written) => {
      const sent = written.join(', ');
      const direct = atExpress({ ...REQUESTS.direct, sent }),
        viaCdn = atExpress({ ...REQUESTS.forged, sent });
      // The right-most address the attacker wrote, whatever it is.
      assert.equal(reqIp(direct.socket, direct.xff, 2), written.at(-1));
      assert.equal(reqIp(viaCdn.socket, viaCdn.xff, 2), ADDR.attacker);
      assert.equal(reqIp(direct.socket, direct.xff, TRUSTS.list), ADDR.attacker);
      assert.equal(reqIp(viaCdn.socket, viaCdn.xff, TRUSTS.list), ADDR.attacker);
    }),
    params(),
  );
});

test('the routes view: a hop count trusts the same positions on both routes, the address list the same machines', () => {
  const who = (t: Trust, q: 'forged' | 'direct') => positions(REQUESTS[q], t).map((p) => [p.who, p.verdict]);
  // Counted from Express: the load balancer, then the CDN edge only on the long route, then the attacker and what it wrote.
  assert.deepEqual(who(2, 'forged'), [['balancer', 'trusted'], ['edge', 'trusted'], ['attacker', 'answer'], ['forged', 'unread']]);
  assert.deepEqual(who(2, 'direct'), [['balancer', 'trusted'], ['attacker', 'trusted'], ['forged', 'answer']]);
  assert.deepEqual(who(TRUSTS.list, 'forged'), [['balancer', 'trusted'], ['edge', 'trusted'], ['attacker', 'answer'], ['forged', 'unread']]);
  assert.deepEqual(who(TRUSTS.list, 'direct'), [['balancer', 'trusted'], ['attacker', 'answer'], ['forged', 'unread']]);
  for (const t of TRUST_KEYS)
    for (const q of REQUEST_KEYS) {
      const got = atExpress(REQUESTS[q]),
        ps = positions(REQUESTS[q], TRUSTS[t]);
      // The same addresses and verdicts as proxy-addr's read; each position's address is its machine's own.
      assert.deepEqual(ps.map((p) => ({ addr: p.addr, index: p.index, verdict: p.verdict })), readAddresses(got.socket, got.xff, TRUSTS[t]));
      for (const p of ps) assert.equal(p.addr, p.who === 'forged' ? ADDR.forged : (MACHINES as Record<string, { addr: string }>)[p.who]!.addr, `${t} ${q} ${p.index}`);
    }
  // Whatever the attacker writes: a count n trusts positions below n on either route; the list trusts only the two proxies.
  fc.assert(
    fc.property(header, fc.integer({ min: 0, max: 6 }), (written, n) => {
      const sent = written.join(', ');
      for (const q of ['forged', 'direct'] as const) {
        const ps = positions({ ...REQUESTS[q], sent }, n);
        assert.deepEqual(ps.filter((p) => p.verdict === 'trusted').map((p) => p.index), [...Array(Math.min(n, ps.length - 1)).keys()]);
        const byList = positions({ ...REQUESTS[q], sent }, TRUSTS.list).filter((p) => p.verdict === 'trusted').map((p) => p.who);
        assert.deepEqual(byList, q === 'forged' ? ['balancer', 'edge'] : ['balancer']);
      }
    }),
    params(),
  );
});

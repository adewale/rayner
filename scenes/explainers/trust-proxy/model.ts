// How Express 5 works out req.ip from the socket address and X-Forwarded-For, for a request that reaches
// the app through a CDN and a load balancer, or straight through the load balancer. Pure TypeScript with
// no Node APIs: the scene runs it in the page.
//
// Sources (each file was fetched at the pinned tag and compared byte for byte with the npm package):
//   expressjs/express v5.3.0 lib/request.js:340-343   req.ip = proxyaddr(this, app.get('trust proxy fn'))
//   expressjs/express v5.3.0 lib/application.js:99    this.set('trust proxy', false) is the default
//   expressjs/express v5.3.0 lib/application.js:370-371  setting 'trust proxy' stores compileTrust(val)
//   expressjs/express v5.3.0 lib/utils.js:194-214     compileTrust: true -> function(){ return true };
//                                                     a number n -> function(a, i){ return i < n };
//                                                     a string is split on commas, then proxyaddr.compile
//   jshttp/forwarded v0.2.0 index.js:24-36, 59-90     addrs = [socket.remoteAddress] then the
//                                                     X-Forwarded-For entries gathered right to left
//   jshttp/proxy-addr v2.0.8 index.js:55-75           alladdrs: for i < addrs.length - 1, stop after the
//                                                     first address the trust function rejects
//   jshttp/proxy-addr v2.0.8 index.js:222-235         proxyaddr returns the last address alladdrs kept
//   expressjs/expressjs.com 4ca3fa8 behind-proxies.mdx:26, 31, 53, 60, 63  the guide's description and warnings
//
// The model covers IPv4 addresses and IPv4 ranges only; proxy-addr also handles IPv6 and IPv4-mapped
// addresses, which no scenario here uses. Every proxy here appends the address it saw (arrivals() below);
// a proxy that replaces or strips X-Forwarded-For, or a network rule that keeps the internet away from the
// load balancer, changes which attacks reach the app, and neither is modelled. model.test.ts holds the twelve answers of real
// Express 5.3.0 and checks the model against them.

/** Documentation addresses (RFC 5737), except the load balancer's private one (RFC 1918). */
export const ADDR = {
  client: '203.0.113.7',
  attacker: '198.51.100.9',
  /** What the attacker writes in its own X-Forwarded-For. */
  forged: '1.2.3.4',
  edge: '192.0.2.10',
  balancer: '10.0.0.5',
} as const;

/** The address list the last setting trusts: the load balancer's network and the CDN edge's range. */
export const TRUSTED_RANGES = ['10.0.0.0/8', '192.0.2.0/24'] as const;

/** proxy-addr's trust argument as Express builds it: everything, the first n addresses, or address ranges. */
export type Trust = boolean | number | readonly string[];

export type TrustKey = 'true' | '1' | '2' | 'list';
export const TRUSTS: Record<TrustKey, Trust> = { true: true, 1: 1, 2: 2, list: TRUSTED_RANGES };
/** The setting as code: app.set('trust proxy', ...). */
export const TRUST_CODE: Record<TrustKey, string> = {
  true: 'true',
  1: '1',
  2: '2',
  list: `'${TRUSTED_RANGES.join(', ')}'`,
};
export const TRUST_LABEL: Record<TrustKey, string> = { true: 'true', 1: '1', 2: '2', list: 'Address list' };
export const TRUST_KEYS: readonly TrustKey[] = ['true', '1', '2', 'list'];

export type RequestKey = 'client' | 'forged' | 'direct';
export const REQUEST_KEYS: readonly RequestKey[] = ['client', 'forged', 'direct'];

/** A machine on a path: its diagram id, its name and its address. */
export interface Hop {
  id: 'client' | 'attacker' | 'edge' | 'balancer' | 'express';
  name: string;
  addr: string;
}
export const MACHINES: Record<Hop['id'], Hop> = {
  client: { id: 'client', name: 'client', addr: ADDR.client },
  attacker: { id: 'attacker', name: 'attacker', addr: ADDR.attacker },
  edge: { id: 'edge', name: 'CDN edge', addr: ADDR.edge },
  balancer: { id: 'balancer', name: 'load balancer', addr: ADDR.balancer },
  express: { id: 'express', name: 'Express', addr: '' },
};

export interface Request {
  key: RequestKey;
  label: string;
  /** Who sends it; their address is the right answer for req.ip. */
  sender: Hop;
  /** The X-Forwarded-For the sender writes itself, or null for none. */
  sent: string | null;
  /** The proxies in order, then Express. */
  via: readonly Hop[];
}
export const REQUESTS: Record<RequestKey, Request> = {
  client: { key: 'client', label: 'Client via the CDN', sender: MACHINES.client, sent: null, via: [MACHINES.edge, MACHINES.balancer] },
  forged: { key: 'forged', label: 'Attacker via the CDN', sender: MACHINES.attacker, sent: ADDR.forged, via: [MACHINES.edge, MACHINES.balancer] },
  direct: { key: 'direct', label: 'Attacker straight to the load balancer', sender: MACHINES.attacker, sent: ADDR.forged, via: [MACHINES.balancer] },
};

/** What one machine receives: the address of the socket it came in on and the header as it arrived. */
export interface Arrival {
  at: Hop;
  socket: string;
  xff: string | null;
}
/**
 * The request at each machine after the sender. The assumption, which Express's guide does not state:
 * each proxy appends the address its own connection came from to X-Forwarded-For before passing it on.
 */
export function arrivals(r: Request): Arrival[] {
  const out: Arrival[] = [];
  let from = r.sender,
    xff = r.sent;
  for (const at of [...r.via, MACHINES.express]) {
    out.push({ at, socket: from.addr, xff });
    if (at.id !== 'express') xff = xff ? `${xff}, ${from.addr}` : from.addr;
    from = at;
  }
  return out;
}
/** What Express itself receives. */
export const atExpress = (r: Request) => arrivals(r).at(-1)!;

/**
 * forwarded 0.2.0 index.js:24-36, 59-90: the socket address, then the header's entries from right to left.
 * The parser splits on commas and drops spaces around entries; empty entries are skipped.
 */
export function forwarded(socket: string, xff: string | null): string[] {
  const entries = (xff ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e !== '');
  return [socket, ...entries.reverse()];
}

const ipv4 = (s: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
};
/**
 * proxy-addr's IPv4 membership test: an address, or address/prefix (decimal 1–32).
 * proxy-addr 2.0.8 index.js:153–195 rejects /0 as well as malformed prefixes.
 * This predicate returns false for invalid ranges; proxy-addr's config parser throws.
 */
export function inRange(addr: string, range: string): boolean {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/([0-9]+))?$/.exec(range);
  if (!match) return false;
  const [, base, bits = '32'] = match;
  const a = ipv4(addr),
    b = ipv4(base!),
    n = Number(bits);
  if (a === null || b === null || !(n >= 1 && n <= 32)) return false;
  const mask = n === 32 ? 0xffffffff : (~(0xffffffff >>> n)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

/** utils.js:194-214 compileTrust, for the kinds of value this model covers. */
export function compileTrust(trust: Trust): (addr: string, i: number) => boolean {
  if (trust === true) return () => true;
  if (typeof trust === 'number') return (_a, i) => i < trust;
  if (trust === false) return () => false; // proxyaddr.compile([]) is trustNone
  return (a) => trust.some((r) => inRange(a, r));
}

export type Verdict = 'trusted' | 'answer' | 'unread';
/** One address in the order Express reads it, and what Express makes of it. */
export interface Reading {
  addr: string;
  /** 0 is the socket address; 1 the right-most X-Forwarded-For entry, and so on. */
  index: number;
  verdict: Verdict;
}
/**
 * proxy-addr index.js:55-75 (alladdrs) and 222-235 (proxyaddr): read the addresses in order, keep each one
 * the trust function accepts, stop at the first it rejects. The last address is never tested.
 */
export function readAddresses(socket: string, xff: string | null, trust: Trust): Reading[] {
  const addrs = forwarded(socket, xff);
  const ok = compileTrust(trust);
  let last = addrs.length - 1;
  for (let i = 0; i < addrs.length - 1; i++) {
    if (ok(addrs[i]!, i)) continue;
    last = i;
    break;
  }
  return addrs.map((addr, index) => ({ addr, index, verdict: index < last ? 'trusted' : index === last ? 'answer' : 'unread' }));
}
/** One address Express reads, with who it belongs to: a machine on the route, or an entry the attacker wrote. */
export interface Position extends Reading {
  who: Hop['id'] | 'forged';
}
/**
 * The routes view: the addresses Express reads for a request, each tied to its source by the route, not by
 * looking its address up. Counted from Express: the proxies nearest first (the last one's is the socket
 * address), then the sender, then whatever the sender wrote, right-most entry first.
 */
export function positions(r: Request, trust: Trust): Position[] {
  const got = atExpress(r);
  const written = forwarded('', r.sent).slice(1).map(() => 'forged' as const);
  const who: Position['who'][] = [...r.via.toReversed().map((h) => h.id), r.sender.id, ...written];
  return readAddresses(got.socket, got.xff, trust).map((reading, i) => ({ ...reading, who: who[i]! }));
}
/** req.ip. */
export function reqIp(socket: string, xff: string | null, trust: Trust): string {
  return readAddresses(socket, xff, trust).find((r) => r.verdict === 'answer')!.addr;
}
/** req.ips: the kept addresses, farthest first, without the socket address (request.js:357-366). */
export function reqIps(socket: string, xff: string | null, trust: Trust): string[] {
  if (trust === false) return [];
  return readAddresses(socket, xff, trust)
    .filter((r) => r.verdict !== 'unread')
    .map((r) => r.addr)
    .reverse()
    .slice(0, -1);
}

/** What req.ip turns out to be, against who really sent the request. */
export type Outcome = 'sender' | 'proxy' | 'forged';
export interface Answer {
  ip: string;
  outcome: Outcome;
  /** Who owns the address, in words: "the client", "the CDN edge", "an address the attacker wrote". */
  whose: string;
}
export function answer(trustKey: TrustKey, requestKey: RequestKey): Answer {
  const r = REQUESTS[requestKey],
    got = atExpress(r);
  const ip = reqIp(got.socket, got.xff, TRUSTS[trustKey]);
  if (ip === r.sender.addr) return { ip, outcome: 'sender', whose: `the ${r.sender.name}` };
  const proxy = r.via.find((h) => h.addr === ip);
  if (proxy) return { ip, outcome: 'proxy', whose: `the ${proxy.name}` };
  return { ip, outcome: 'forged', whose: 'an address the attacker wrote' };
}
/** All twelve answers, by setting then request. */
export const TABLE: Record<TrustKey, Record<RequestKey, Answer>> = Object.fromEntries(
  TRUST_KEYS.map((t) => [t, Object.fromEntries(REQUEST_KEYS.map((q) => [q, answer(t, q)]))]),
) as Record<TrustKey, Record<RequestKey, Answer>>;

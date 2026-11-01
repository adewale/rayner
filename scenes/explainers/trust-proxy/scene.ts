import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/trust-proxy.ts';
import { Scene, Text, Rectangle } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import type { Card } from '../../../explain/index.ts';
import {
  ADDR,
  MACHINES,
  REQUESTS,
  REQUEST_KEYS,
  TABLE,
  TRUSTED_RANGES,
  TRUSTS,
  TRUST_CODE,
  TRUST_KEYS,
  TRUST_LABEL,
  answer,
  arrivals,
  atExpress,
  inRange,
  readAddresses,
} from '../lib/trust-proxy.ts';
import type { Reading, RequestKey, TrustKey } from '../lib/trust-proxy.ts';

// Sources, each fetched at the pinned tag or commit; the lines each claim rests on are quoted in
// lib/trust-proxy.ts and beside the steps below. test/explain-trust-proxy.test.ts holds real Express
// 5.3.0's answers for every case.
const EXPRESS = 'https://github.com/expressjs/express/blob/v5.3.0/lib/';
const PROXY_ADDR = 'https://github.com/jshttp/proxy-addr/blob/v2.0.8/index.js';
const FORWARDED = 'https://github.com/jshttp/forwarded/blob/v0.2.0/index.js';
const GUIDE =
  'https://github.com/expressjs/expressjs.com/blob/4ca3fa8701629a4eb27c76a69aa6d6e294290b40/src/content/docs/en/5x/guide/behind-proxies.mdx';

const STYLE = 'pen-and-ink';

/**
 * The two ways in. Link descriptions name each end by its label ("Attacker → Load balancer"). Labels stay short and addresses stay in cards, so the labels reach 14 px
 * at a 1280 px stage; every link runs left to right except the attacker's two.
 */
const NETWORK = [
  'architecture-beta',
  '  group internet(internet)[Internet]',
  '  service client(internet)[Client] in internet',
  '  service attacker(internet)[Attacker] in internet',
  '  group cdn(cloud)[CDN]',
  '  service edge(server)[CDN edge] in cdn',
  '  group yours(cloud)[Your network]',
  '  service balancer(server)[Load balancer] in yours',
  '  service express(server)[Express] in yours',
  '  client:R --> L:edge',
  '  attacker:R --> B:edge',
  '  edge:R --> L:balancer',
  '  attacker:B --> B:balancer',
  '  balancer:R --> L:express',
].join('\n');
const PATH: Record<RequestKey, [string, string][]> = {
  client: [
    ['client', 'edge'],
    ['edge', 'balancer'],
    ['balancer', 'express'],
  ],
  forged: [
    ['attacker', 'edge'],
    ['edge', 'balancer'],
    ['balancer', 'express'],
  ],
  direct: [
    ['attacker', 'balancer'],
    ['balancer', 'express'],
  ],
};
const DIAGRAM: Box = regionBox('full', { bottom: -1.2 });
const BELOW: Box = [-7.55, -4.25, 7.55, -1.4];
const FULL: Box = regionBox('full');
const SIZE = 0.26;
const BIG = 0.32;

const REQUEST_LABEL: Record<RequestKey, string> = {
  client: 'Client via the CDN',
  forged: 'Attacker via the CDN',
  direct: 'Attacker, skipping the CDN',
};
const setting = (t: TrustKey) => (t === 'list' ? 'an address list' : TRUST_LABEL[t]);
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s[0]!.toLowerCase() + s.slice(1);
const NUMBER = ['none', 'one', 'two', 'three', 'four'] as const;
/** "one address", "two addresses". */
const count = (n: number, noun: string) => `${NUMBER[n] ?? n} ${n === 1 ? noun : `${noun}es`}`;
const OUTCOME = { sender: 'the real sender', proxy: 'the CDN edge', forged: 'written by the attacker' } as const;

/** Who an address in the header belongs to, in this story. */
function owner(addr: string, index: number): string {
  if (index === 0) return 'socket, load balancer';
  const m = Object.values(MACHINES).find((h) => h.addr === addr);
  return m ? m.name : 'written by the attacker';
}
const VERDICT_WORD = { trusted: 'trusted', answer: 'req.ip', unread: 'not read' } as const;
/** The addresses as Express reads them: "1. socket, load balancer" → "10.0.0.5  trusted". */
const readingRows = (rs: readonly Reading[]) =>
  rs.map((r) => [`${r.index + 1}. ${owner(r.addr, r.index)}`, `${r.addr}  ${VERDICT_WORD[r.verdict]}`] as const);
const answerLabel = (rs: readonly Reading[]) => {
  const r = rs.find((x) => x.verdict === 'answer')!;
  return `${r.index + 1}. ${owner(r.addr, r.index)}`;
};

export default class TrustProxyExplainer extends Scene {
  static meta = {
    id: 'trust-proxy',
    title: 'Which address should Express call the client?',
    sources: [
      GUIDE + '#L26-L31',
      GUIDE + '#L53',
      GUIDE + '#L60-L63',
      EXPRESS + 'utils.js#L194-L214',
      EXPRESS + 'request.js#L340-L343',
      EXPRESS + 'application.js#L370-L371',
      PROXY_ADDR + '#L55-L75',
      PROXY_ADDR + '#L222-L235',
      FORWARDED + '#L24-L36',
    ],
  };
  static settings = [
    {
      id: 'trust',
      label: 'trust proxy',
      default: '2',
      options: TRUST_KEYS.map((t) => ({ value: t, label: TRUST_LABEL[t] })),
    },
    {
      id: 'request',
      label: 'Request',
      default: 'direct',
      options: REQUEST_KEYS.map((q) => ({ value: q, label: REQUEST_LABEL[q] })),
    },
  ];

  override async construct() {
    const values = settingsOf(this),
      trustKey = values.trust as TrustKey,
      reqKey = values.request as RequestKey;
    const req = REQUESTS[reqKey],
      got = atExpress(req),
      trust = TRUSTS[trustKey],
      reading = readAddresses(got.socket, got.xff, trust),
      mine = answer(trustKey, reqKey);
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;

    /** Lines of text wrapped to a width, from a top-left corner down. */
    const wrap = (text: string, [x, y]: [number, number], width: number, size: number, color = ink) => {
      const out: Text[] = [];
      let line = '';
      const flush = () => {
        out.push(
          new Text(line, { fontSize: size, color, anchor: 'start' }).moveTo(
            [x, y - size * 0.6 - out.length * size * 1.5],
            [-1, 0],
          ),
        );
        line = '';
      };
      for (const w of text.split(' ')) {
        const next = line ? `${line} ${w}` : w;
        if (line && new Text(next, { fontSize: size }).width() > width) flush();
        line = line ? `${line} ${w}` : w;
      }
      flush();
      return out;
    };

    // ------------------------------------------------------------------ paths
    await readerFirst(this, s, readerFrames(trustKey, reqKey));
    await this.step('paths', {
      detail: true,
      title: 'Two ways into one app',
      line: 'The load balancer also accepts connections from the internet.',
      caption:
        'Requests are meant to reach Express through a CDN and then a load balancer, but the load balancer also accepts connections from the internet, so an attacker can skip the CDN. The addresses are examples. Assumed throughout: each proxy appends the address its connection came from to X-Forwarded-For. When the CDN is skipped, does Express report the sender’s address or one the attacker wrote? Follow the header entries to see how the trust setting decides.',
    });
    await s.clear();
    const d = await s.show({ source: NETWORK }, { box: DIAGRAM });
    const addresses = await s.card(
      [
        ['Client', ADDR.client],
        ['Attacker', ADDR.attacker],
        ['CDN edge', ADDR.edge],
        ['Load balancer', ADDR.balancer],
      ],
      { at: regionBox(BELOW, { right: -0.15 }), align: 'top', fontSize: SIZE, title: 'Addresses', enter: false },
    );
    const chosen = await s.card(
      [
        ['trust proxy setting', TRUST_CODE[trustKey]],
        ['Request followed', REQUEST_LABEL[reqKey]],
      ],
      { at: regionBox(BELOW, { left: 0.15 }), align: 'top', fontSize: SIZE, title: 'This case', enter: false },
    );
    // The proxies' behaviour is this explainer's assumption; Express's guide does not describe it.
    const assumed = wrap(
      'Assumed: each proxy appends the address its connection came from to X-Forwarded-For.',
      [chosen.box()![0] + 0.1, chosen.box()![1] - 0.2],
      chosen.box()![2] - chosen.box()![0] - 0.2,
      SIZE,
    );
    await s.enter(addresses, chosen, ...assumed);
    this.state.addresses = { ...ADDR };

    // ------------------------------------------------------------------ follow
    const hops = arrivals(req);
    const sent = req.sent ? `X-Forwarded-For: ${req.sent}` : 'no X-Forwarded-For';
    const entries = ['no', 'one', 'two', 'three', 'four'][got.xff ? got.xff.split(',').length : 0];
    await this.step('follow', {
      detail: true,
      title:
        reqKey === 'client'
          ? 'The client’s request gains one address at each proxy'
          : reqKey === 'forged'
            ? 'The attacker writes its own X-Forwarded-For and goes through the CDN'
            : 'The attacker writes its own X-Forwarded-For and skips the CDN',
      line:
        reqKey === 'direct'
          ? `One proxy, not two, appends: ${entries} entries reach Express.`
          : `Each of two proxies appends one: ${entries} entries reach Express.`,
      caption:
        reqKey === 'client'
          ? `The client sends ${sent}. The CDN edge appends the client’s address, ${ADDR.client}, and the load balancer appends the edge’s, ${ADDR.edge}. Express receives that header on a connection from the load balancer, so its socket address is ${ADDR.balancer}.`
          : reqKey === 'forged'
            ? `The attacker sends ${sent}, an address it made up. The CDN edge appends the attacker’s real address, ${ADDR.attacker}, and the load balancer appends the edge’s. Express receives ${entries} entries on a connection from the load balancer, ${ADDR.balancer}.`
            : `The attacker sends ${sent} straight to the load balancer, which appends the attacker’s real address, ${ADDR.attacker}. Express receives ${entries} entries, one fewer than through the CDN, on a connection from the load balancer, ${ADDR.balancer}.`,
    });
    await s.clearOverlays();
    await d.walk(PATH[reqKey], { trail: true });
    await s.card(
      [
        ...hops.map((h) => [`${capital(h.at.name)} receives`, h.xff ?? 'none'] as const),
        ['Express’s socket address', got.socket],
      ],
      { at: BELOW, fontSize: SIZE, title: 'X-Forwarded-For at each machine', width: 11 },
    );
    this.state.arrivals = hops.map((h) => [h.at.id, h.socket, h.xff]);

    // ------------------------------------------------------------------ code
    // utils.js:197-213 compileTrust; proxy-addr index.js:57, 68-74 (alladdrs) and 231-232 (proxyaddr).
    // forwarded index.js:30-32: addrs is the socket address, then the header's entries right to left.
    await this.step('code', {
      detail: true,
      title:
        trustKey === 'true'
          ? 'trust proxy true trusts every address'
          : trustKey === 'list'
            ? 'An address list trusts addresses inside its ranges'
            : `trust proxy ${trustKey} trusts the first ${trustKey === '1' ? 'address, whatever it is' : `${trustKey} addresses, whatever they are`}`,
      line:
        trustKey === 'true'
          ? 'Every address passes the check, so the loop never stops early.'
          : trustKey === 'list'
            ? 'The loop stops at the first address outside the ranges.'
            : `Only position counts: the loop trusts index i while i < ${trustKey}.`,
      caption:
        `Express turns the setting into a trust function. ` +
        (trustKey === 'true'
          ? 'true trusts every address. '
          : trustKey === 'list'
            ? `A string is split on commas into ranges, and an address is trusted when it falls in one. `
            : `A number n trusts the first n addresses by their position alone. `) +
        `proxy-addr lists the socket address, then X-Forwarded-For from right to left, and stops at the first address it does not trust. req.ip is the last address in its list.`,
    });
    await d.hide();
    await s.clearOverlays();
    const left = regionBox(FULL, { right: -0.1 }),
      right = regionBox(FULL, { left: 0.1 });
    const compile = await s.code(
      [
        'if (val === true) {',
        '  // Support plain true/false',
        '  return function(){ return true };',
        '}',
        "if (typeof val === 'number') {",
        '  // Support trusting hop count',
        '  return function(a, i){ return i < val };',
        '}',
        "if (typeof val === 'string') {",
        '  // Support comma-separated values',
        "  val = val.split(',')",
        '    .map(function (v) { return v.trim() })',
        '}',
        'return proxyaddr.compile(val || []);',
      ],
      { at: left, align: 'top', fontSize: 0.28, title: 'express 5.3.0, lib/utils.js, compileTrust', enter: false },
    );
    const read = await s.code(
      [
        '// alladdrs',
        'var addrs = forwarded(req)',
        'for (var i = 0; i < addrs.length - 1; i++) {',
        '  if (trust(addrs[i], i)) continue',
        '  addrs.length = i + 1',
        '}',
        'return addrs',
        '// proxyaddr',
        'var addrs = alladdrs(req, trust)',
        'var addr = addrs[addrs.length - 1]',
      ],
      { at: right, align: 'top', fontSize: 0.28, title: 'proxy-addr 2.0.8, index.js', enter: false },
    );
    await s.enter(compile, read);
    await compile.focus(trustKey === 'true' ? [0, 3] : trustKey === 'list' ? [8, 13] : [4, 7], { as: 'this setting' });
    await read.focus([2, 5], { as: 'stops at the first untrusted address' });
    this.state.trust = TRUST_CODE[trustKey];

    // ------------------------------------------------------------------ read
    // proxy-addr index.js:68-72: the loop tests every address but the last, so the last one, if reached,
    // is req.ip untested.
    const forgedUnread = reading.some((r) => r.verdict === 'unread' && r.addr === ADDR.forged);
    const trusted = reading.filter((r) => r.verdict === 'trusted'),
      last = reading.at(-1)!.verdict === 'answer';
    const both = (xs: readonly string[]) =>
      xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
    const why =
      trustKey === 'true'
        ? `true trusts every address, so Express reads to the end of the list.`
        : trustKey === 'list'
          ? `${both(trusted.map((r) => `${r.addr} is in ${TRUSTED_RANGES.find((g) => inRange(r.addr, g))}`))}, so ${trusted.length === 1 ? 'it is' : 'both are'} trusted.`
          : `Express trusts the first ${trustKey === '1' ? 'address' : `${trustKey} addresses`}, ${both(trusted.map((r) => r.addr))}, for ${trusted.length === 1 ? 'its' : 'their'} position alone.`;
    const stop = last
      ? `The list ends at ${mine.ip}, so that is req.ip.`
      : trustKey === 'list'
        ? `${mine.ip} is in neither range, so Express stops there: req.ip is ${mine.ip}.`
        : `Express does not trust the next address, ${mine.ip}, so it stops there: req.ip is ${mine.ip}.`;
    const verdict =
      mine.outcome === 'sender'
        ? `That is the ${req.sender.name}’s real address.`
        : mine.outcome === 'proxy'
          ? `That is the CDN edge, an honest proxy, so the ${req.sender.name}’s address is lost.`
          : `The attacker wrote that address, and Express trusted its real one, ${ADDR.attacker}, as if it were a proxy.`;
    await this.step('read', {
      detail: true,
      title:
        mine.outcome === 'sender'
          ? `req.ip is ${mine.ip}, the ${req.sender.name}’s real address`
          : mine.outcome === 'proxy'
            ? `req.ip is ${mine.ip}, the CDN edge’s address`
            : `req.ip is ${mine.ip}, an address the attacker wrote`,
      line: last
        ? `Express trusts ${count(trusted.length, 'address')} and reaches the end of the list.`
        : `Express trusts ${count(trusted.length, 'address')}, then stops at the next.`,
      caption: `${why} ${stop} ${verdict}${forgedUnread ? ` Express never reads ${ADDR.forged}.` : ''}`,
    });
    await s.clearOverlays();
    const order = await s.card(readingRows(reading), {
      at: regionBox(FULL, { right: 1.2, top: 2.6 }),
      align: 'top',
      fontSize: BIG,
      title: 'Addresses in the order Express reads them',
      enter: false,
    });
    const result = await s.card(
      [
        ['Sent by', `${req.sender.addr} (${req.sender.name})`],
        ['req.ip', mine.ip],
      ],
      { at: regionBox(FULL, { left: 1.6, top: 2.6 }), align: 'top', fontSize: BIG, title: 'Result', enter: false },
    );
    const said = wrap(
      mine.outcome === 'sender'
        ? `Right: the ${req.sender.name}’s own address.`
        : `Wrong: ${mine.outcome === 'proxy' ? 'the CDN edge’s address' : 'an address the attacker wrote'}.`,
      [result.box()![0] + 0.1, result.box()![1] - 0.2],
      result.box()![2] - result.box()![0] - 0.2,
      BIG,
      mine.outcome === 'sender' ? s.good : s.bad,
    );
    await s.enter(order, result, ...said);
    await order.mark(answerLabel(reading), { as: 'req.ip' });
    await result.mark('req.ip', { as: mine.outcome === 'sender' ? 'right' : 'wrong' });
    this.state.read = reading.map((r) => [r.addr, r.verdict]);
    this.state.ip = mine.ip;

    // ------------------------------------------------------------------ requests
    const row = TABLE[trustKey];
    const wrong = REQUEST_KEYS.filter((q) => row[q].outcome !== 'sender');
    await this.step('requests', {
      detail: true,
      title:
        wrong.length === 0
          ? `With ${setting(trustKey)}, req.ip is the real sender on every path`
          : trustKey === '1'
            ? 'With 1, every request through the CDN reports the CDN edge'
            : wrong.length === 1
              ? `With ${setting(trustKey)}, the attacker picks req.ip only by skipping the CDN`
              : `With ${setting(trustKey)}, the attacker picks req.ip on both paths`,
      line:
        wrong.length === 0
          ? 'All three requests get the real sender’s address.'
          : wrong.length === 3
            ? 'None of the three requests gets the real sender’s address.'
            : `Only ${NUMBER[3 - wrong.length]} of three requests ${wrong.length === 2 ? 'gets' : 'get'} the real sender’s address.`,
      caption:
        `The same setting against all three requests. ` +
        REQUEST_KEYS.map((q) => `${REQUEST_LABEL[q]}: ${row[q].ip}, ${OUTCOME[row[q].outcome]}`).join('. ') +
        '.',
    });
    await s.clearOverlays();
    const third = 15.1 / 3;
    const columns: Card[] = [];
    for (const [k, q] of REQUEST_KEYS.entries()) {
      const r = atExpress(REQUESTS[q]),
        rs = readAddresses(r.socket, r.xff, trust);
      columns.push(
        await s.card(
          rs.map((x) => [`${x.index + 1}.`, `${x.addr}  ${VERDICT_WORD[x.verdict]}`] as const),
          {
            at: [-7.55 + k * third + 0.08, -4.25, -7.55 + (k + 1) * third - 0.08, 2.6] as Box,
            align: 'top',
            fontSize: BIG,
            title: REQUEST_LABEL[q],
            enter: false,
          },
        ),
      );
    }
    const verdicts = REQUEST_KEYS.flatMap((q, k) =>
      wrap(
        row[q].outcome === 'sender'
          ? `Right: the ${REQUESTS[q].sender.name}’s own address.`
          : `Wrong: ${row[q].outcome === 'proxy' ? 'the CDN edge’s address' : 'an address the attacker wrote'}.`,
        [-7.55 + k * third + 0.2, columns[k]!.box()![1] - 0.15],
        third - 0.5,
        BIG,
        row[q].outcome === 'sender' ? s.good : s.bad,
      ),
    );
    await s.enter(...columns, ...verdicts);
    for (const [k, q] of REQUEST_KEYS.entries()) {
      const r = atExpress(REQUESTS[q]),
        rs = readAddresses(r.socket, r.xff, trust);
      await columns[k]!.mark(`${rs.find((x) => x.verdict === 'answer')!.index + 1}.`, { as: 'req.ip' });
    }
    this.state.answers = Object.fromEntries(REQUEST_KEYS.map((q) => [q, row[q].ip]));

    // ------------------------------------------------------------------ why
    // behind-proxies.mdx:31 (true), :60-63 (a number), :53 (addresses).
    const QUOTE: Record<TrustKey, string> = {
      true: '“When setting to true, it is important to ensure that the last reverse proxy trusted is removing/overwriting all of the following HTTP headers: X-Forwarded-For, X-Forwarded-Host, and X-Forwarded-Proto, otherwise it may be possible for the client to provide any value.”',
      1: '“ensure there are not multiple, different-length paths to the Express application such that the client can be less than the configured number of hops away, otherwise it may be possible for the client to provide any value.”',
      2: '“ensure there are not multiple, different-length paths to the Express application such that the client can be less than the configured number of hops away, otherwise it may be possible for the client to provide any value.”',
      list: '“the untrusted IP address nearest to the application server is determined as the client’s IP address.”',
    };
    await this.step('why', {
      detail: true,
      title:
        trustKey === 'true'
          ? 'true trusts whatever the sender wrote first'
          : trustKey === 'list'
            ? 'An address list trusts a machine, not a position'
            : 'A hop count assumes every path has the same length',
      line:
        trustKey === 'true'
          ? 'No proxy here removes the header the sender started.'
          : trustKey === 'list'
            ? `${ADDR.attacker} is in neither range, so the read stops there.`
            : trustKey === '1'
              ? 'The CDN path has two proxies; the setting trusts one.'
              : 'The CDN path has two proxies; the short path has only one.',
      caption:
        trustKey === 'true'
          ? 'Both proxies here append and neither removes the header, so the left-most entry is whatever the first sender wrote. Express’s guide warns that with true the last trusted proxy must remove or overwrite X-Forwarded-For.'
          : trustKey === 'list'
            ? `The attacker’s address, ${ADDR.attacker}, is in neither range, so Express stops there on both paths, and whatever the attacker wrote further left is never read. Express’s guide gives the rule, quoted below.`
            : trustKey === '1'
              ? `The path through the CDN has two proxies and the setting trusts one, so the answer is the CDN edge. The path that skips the CDN has one, so it gives the attacker’s real address. Express’s guide warns about paths of different lengths.`
              : `The path through the CDN has two proxies; the path that skips it has one. Counting two trusted addresses on the short path trusts the attacker’s own address, and the next one is the last entry it wrote. Express’s guide warns about this, quoted below.`,
    });
    await s.clearOverlays();
    await d.reveal('rest');
    if (trustKey === 'list') {
      await d.mark(['service:edge', 'service:balancer'], { color: s.good, as: 'trusted by address' });
      await d.mark(['service:attacker'], { color: s.bad, as: 'not trusted' });
    } else if (trustKey === 'true') {
      await d.mark(['service:attacker'], { color: s.bad, as: 'writes the left-most entry' });
    } else if (trustKey === '1') {
      await d.mark(['service:edge'], { color: s.bad, as: 'req.ip for every request through the CDN' });
    } else {
      await d.dim(['attacker', 'balancer', 'express']);
      await d.mark(['edge:attacker->balancer#0'], { color: s.bad, as: 'one proxy fewer' });
    }
    const quote = wrap(QUOTE[trustKey], [BELOW[0] + 0.3, BELOW[3] - 0.1], BELOW[2] - BELOW[0] - 0.6, 0.28);
    const cite = new Text(
      `Express guide, “Express behind proxies”, the ${trustKey === 'true' ? 'Boolean' : trustKey === 'list' ? 'IP addresses' : 'Number'} setting`,
      { fontSize: 0.2, color: s.soft, anchor: 'start' },
    ).moveTo([BELOW[0] + 0.3, quote.at(-1)!.box()![1] - 0.3], [-1, 0]);
    await s.enter(...quote, cite);
    this.state.why = trustKey;

    // ------------------------------------------------------------------ ranges
    const other: TrustKey = trustKey === 'list' ? '2' : 'list';
    await this.step('ranges', {
      detail: true,
      title:
        trustKey === 'list'
          ? 'Counting two hops instead gives the attacker the short path'
          : 'Trusting the proxies’ address ranges finds the real sender on every path',
      line:
        trustKey === 'list'
          ? `With 2, skipping the CDN gives ${TABLE['2'].direct.ip}, which the attacker wrote.`
          : `The list gets all three right; ${setting(trustKey)} gets ${NUMBER[wrong.length]} wrong.`,
      caption:
        `app.set('trust proxy', ${TRUST_CODE.list}) trusts the load balancer’s network and the CDN edge’s range, and nothing else. ` +
        (trustKey === 'list'
          ? `With 2 instead, the request that skips the CDN gives ${TABLE['2'].direct.ip}, an address the attacker wrote. The list depends on every trusted range holding only your proxies.`
          : `It gives the real sender for all three requests, where ${setting(trustKey)} gets ${wrong.length === 1 ? 'one' : wrong.length === 2 ? 'two' : 'three'} wrong. The list depends on every trusted range holding only your proxies.`),
    });
    await s.clearOverlays();
    await d.unmark();
    await d.dim(null);
    await d.mark(['service:edge', 'service:balancer'], { color: s.good, as: 'trusted by address' });
    const side = (t: TrustKey, box: Box) =>
      s.card(
        REQUEST_KEYS.map(
          (q) =>
            [REQUEST_LABEL[q], `${TABLE[t][q].ip}  ${TABLE[t][q].outcome === 'sender' ? 'right' : 'wrong'}`] as const,
        ),
        {
          at: box,
          align: 'top',
          fontSize: SIZE,
          title: `trust proxy ${t === 'list' ? TRUST_CODE.list : TRUST_LABEL[t]}`,
          enter: false,
        },
      );
    const a = await side(trustKey, regionBox(BELOW, { right: -0.1 })),
      b = await side(other, regionBox(BELOW, { left: 0.1 }));
    // The comparison's six answers are the ranges step's evidence. The
    // network panel behind the preceding quote is context when it is revealed.
    a.key = 'ranges-current';
    b.key = 'ranges-alternative';
    await s.enter(a, b);
    s.reading(a, b, d.get('service:edge'), d.get('service:balancer'));
    this.state.compare = Object.fromEntries(
      [trustKey, other].map((t) => [t, Object.fromEntries(REQUEST_KEYS.map((q) => [q, TABLE[t][q].ip]))]),
    );

    // ------------------------------------------------------------------ table
    const rights = TRUST_KEYS.map((t) => REQUEST_KEYS.filter((q) => TABLE[t][q].outcome === 'sender').length);
    const allRight = TRUST_KEYS.filter((_, i) => rights[i] === REQUEST_KEYS.length).map((t) =>
      t === 'list' ? 'the address list' : `trust proxy ${t}`,
    );
    await this.step('table', {
      detail: true,
      title: 'Twelve answers from real Express 5.3.0',
      line: `Green is the real sender; ${allRight.length ? `only ${allRight.join(' and ')} ${allRight.length === 1 ? 'gets' : 'get'} all three` : 'no setting gets all three'}.`,
      caption: `Each row is a setting and each column a request; green marks the real sender’s address. Out of three requests, true gets ${rights[0]} right, 1 gets ${rights[1]}, 2 gets ${rights[2]} and the address list gets ${rights[3]}. This case, ${TRUST_LABEL[trustKey]} with ${lowerFirst(REQUEST_LABEL[reqKey])}, is outlined.`,
    });
    await s.clearOverlays();
    await d.hide();
    const x0 = -7.3,
      col0 = 3.3,
      colW = (14.6 - col0) / 3,
      top = 2.7,
      rowH = 1.15;
    const cells: (Text | Rectangle)[] = [];
    const head = (text: string, x: number) =>
      cells.push(
        new Text(text, { fontSize: SIZE, color: s.soft, weight: 'bold', anchor: 'start' }).moveTo([x, top], [-1, 0]),
      );
    head('trust proxy', x0);
    REQUEST_KEYS.forEach((q, j) => head(REQUEST_LABEL[q], x0 + col0 + j * colW));
    TRUST_KEYS.forEach((t, i) => {
      const y = top - (i + 1) * rowH;
      cells.push(
        new Text(TRUST_LABEL[t], { fontSize: BIG, color: ink, font: 'mono', anchor: 'start' }).moveTo([x0, y], [-1, 0]),
      );
      REQUEST_KEYS.forEach((q, j) => {
        const cell = TABLE[t][q],
          x = x0 + col0 + j * colW;
        const color = cell.outcome === 'sender' ? s.good : s.bad;
        cells.push(
          new Text(cell.ip, { fontSize: BIG, color, font: 'mono', anchor: 'start' }).moveTo([x, y + 0.13], [-1, 0]),
        );
        cells.push(
          new Text(
            cell.outcome === 'sender' ? 'real sender' : cell.outcome === 'proxy' ? 'CDN edge' : 'attacker wrote it',
            {
              fontSize: 0.22,
              color: s.soft,
              anchor: 'start',
            },
          ).moveTo([x, y - 0.3], [-1, 0]),
        );
        if (t === trustKey && q === reqKey)
          cells.push(
            new Rectangle({
              width: colW - 0.2,
              height: rowH - 0.15,
              stroke: s.emphasis,
              strokeWidth: 0.03,
              fill: 'none',
              cornerRadius: 0.08,
            }).moveTo([x - 0.15 + (colW - 0.2) / 2, y - 0.07]),
          );
      });
    });
    await s.enter(...cells, {
      describe:
        'A table of req.ip for each setting and request. ' +
        TRUST_KEYS.map(
          (t) =>
            `trust proxy ${TRUST_LABEL[t]}: ` +
            REQUEST_KEYS.map(
              (q) =>
                `${REQUEST_LABEL[q].toLowerCase()} ${TABLE[t][q].ip} (${TABLE[t][q].outcome === 'sender' ? 'real sender' : TABLE[t][q].whose})`,
            ).join(', '),
        ).join('. ') +
        `. This case, ${TRUST_LABEL[trustKey]} with ${REQUEST_LABEL[reqKey].toLowerCase()}, is outlined.`,
    });
    this.state.table = Object.fromEntries(TRUST_KEYS.map((t) => [t, REQUEST_KEYS.map((q) => TABLE[t][q].ip)]));
  }
}

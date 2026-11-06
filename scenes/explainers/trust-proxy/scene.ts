import { Scene, Text, Group, FadeIn, view } from '../../../src/index.ts';
import type { Box, View, FadeOpts } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card, answerOf as scriptAnswerOf } from '../../../explain/index.ts';
import type { CardOptions, CardRow } from '../../../explain/index.ts';
import { keyed } from '../../../explain/drawing.ts';
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
  positions,
  readAddresses,
} from './model.ts';
import type { Outcome, Position, Reading, RequestKey, TrustKey, Verdict } from './model.ts';
import { numberWord } from '../lib/format.ts';
import { ROUTES, WHO_BOX, answerOf, drawAnswerTable, drawRoutesPanel, wrap } from './picture.ts';
import type { Cell, Route } from './picture.ts';

// Sources, each fetched at the pinned tag or commit; the lines each claim rests on are quoted in
// model.ts and beside the steps below. test/explain-trust-proxy.test.ts holds real Express
// 5.3.0's answers for every scenario.
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
/** "one address", "two addresses". */
const count = (n: number, noun: string) => `${numberWord(n, { zero: 'none' })} ${n === 1 ? noun : `${noun}es`}`;
const OUTCOME = { sender: 'the real sender', proxy: 'the CDN edge', forged: 'written by the attacker' } as const;
/** The request, as the opening question puts it. */
const ASKED: Record<RequestKey, string> = {
  client: 'a client comes through the CDN',
  forged: 'an attacker comes through the CDN',
  direct: 'an attacker skips the CDN',
};
/** The setting's branch of compileTrust (express 5.3.0 lib/utils.js:197-213), as the code step shows it. */
const COMPILE: Record<'true' | 'number' | 'list', string[]> = {
  true: ['if (val === true) {', '  // Support plain true/false', '  return function(){ return true };', '}'],
  number: ["if (typeof val === 'number') {", '  // Support trusting hop count', '  return function(a, i){ return i < val };', '}'],
  list: [
    "if (typeof val === 'string') {",
    '  // Support comma-separated values',
    "  val = val.split(',')",
    '    .map(function (v) { return v.trim() })',
    '}',
    'return proxyaddr.compile(val || []);',
  ],
};

/** Who an address in the header belongs to, in this story. */
function owner(addr: string, index: number): string {
  if (index === 0) return 'socket, load balancer';
  const m = Object.values(MACHINES).find((h) => h.addr === addr);
  return m ? m.name : 'written by the attacker';
}
const WHO_NAME: Record<Position['who'], string> = {
  client: 'the client',
  attacker: 'the attacker',
  edge: 'the CDN edge',
  balancer: 'the load balancer',
  express: 'Express',
  forged: `${ADDR.forged}, the entry the attacker made up`,
};
/** req.ip, said of whoever it belongs to. */
const WHO_ANSWER: Record<Position['who'], string> = {
  ...WHO_NAME,
  attacker: 'the attacker’s real address',
  forged: `${ADDR.forged}, the entry the attacker made up`,
};
const VERDICT_WORD = { trusted: 'trusted', answer: 'req.ip', unread: 'not read' } as const;
/** The addresses as Express reads them: "1. socket, load balancer" → "10.0.0.5  trusted". */
const readingRows = (rs: readonly Reading[]) =>
  rs.map((r) => [`${r.index + 1}. ${owner(r.addr, r.index)}`, `${r.addr}  ${VERDICT_WORD[r.verdict]}`] as const);
const answerLabel = (rs: readonly Reading[]) => {
  const r = rs.find((x) => x.verdict === 'answer')!;
  return `${r.index + 1}. ${owner(r.addr, r.index)}`;
};
/** Addresses as a step's state records them, [address, verdict] nearest first, read back as the model's readings. */
const readingsOf = (pairs: readonly (readonly [string, Verdict])[]): Reading[] => pairs.map(([addr, verdict], index) => ({ addr, verdict, index }));
/** Right or wrong, in words under a result: who req.ip belongs to. */
const outcomeWords = (outcome: Outcome, sender: string) =>
  outcome === 'sender' ? `Right: the ${sender}’s own address.` : `Wrong: ${outcome === 'proxy' ? 'the CDN edge’s address' : 'an address the attacker wrote'}.`;

export default class TrustProxyExplainer extends Scene {
  static meta = {
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
    // Sentences that reach past one step's picture, and the test that holds each.
    claims: [
      { says: 'every connection Express sees comes from the load balancer', test: 'test/explain-trust-proxy.test.ts: the proxies’ appends give the headers the Express run received' },
      { says: 'Express sees only X-Forwarded-For', test: 'test/explain-trust-proxy.test.ts: forwarded reads the socket, then the header right to left' },
      { says: 'trust every proxy in front of it', test: 'test/explain-trust-proxy.test.ts: true answers the left-most entry' },
      { says: 'trusts every address', test: 'test/explain-trust-proxy.test.ts: true answers the left-most entry' },
      { says: 'trusts every position', test: 'test/explain-trust-proxy.test.ts: true answers the left-most entry' },
      { says: 'trusts everything', test: 'test/explain-trust-proxy.test.ts: true answers the left-most entry' },
      { says: 'the loop never stops early', test: 'test/explain-trust-proxy.test.ts: true answers the left-most entry' },
      { says: 'tests every address but the last', test: 'test/explain-trust-proxy.test.ts: req.ip and req.ips equal real Express 5.3.0 for every setting and request' },
      { says: 'never looks at the address a', test: 'test/explain-trust-proxy.test.ts: a hop count n answers the address at position n, or the last one' },
      { says: 'Only position counts', test: 'test/explain-trust-proxy.test.ts: a hop count n answers the address at position n, or the last one' },
      { says: 'Express never reads', test: 'test/explain-trust-proxy.test.ts: req.ip and req.ips equal real Express 5.3.0 for every setting and request' },
      { says: 'is never read', test: 'test/explain-trust-proxy.test.ts: an address list answers the nearest untrusted address' },
      { says: 'of three requests', test: 'test/explain-trust-proxy.test.ts: the scene’s table is the twelve Express answers' },
      { says: 'only the address list gets all three', test: 'test/explain-trust-proxy.test.ts: the scene’s table is the twelve Express answers' },
      { says: 'every request through the CDN reports the CDN edge', test: 'test/explain-trust-proxy.test.ts: the scene’s table is the twelve Express answers' },
      { says: 'the attacker picks req.ip only by skipping the CDN', test: 'test/explain-trust-proxy.test.ts: with 2, an attacker straight at the load balancer chooses req.ip' },
      { says: 'the real sender on every path', test: 'test/explain-trust-proxy.test.ts: the scene’s table is the twelve Express answers' },
      { says: 'assumes every path has the same length', test: 'test/explain-trust-proxy.test.ts: with 2, an attacker straight at the load balancer chooses req.ip' },
      { says: 'the short path has only one', shown: true as const },
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
    const scriptAnswer = scriptAnswerOf(this);
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
    /** A card drawn from the step's state: a view, so check compares it with the state at the end of every step. */
    const cardView = (rowsOf: (st: Record<string, unknown>) => CardRow[], opts: CardOptions | ((st: Record<string, unknown>) => CardOptions)) =>
      view(this, (st) => new Card(this, s.palette, rowsOf(st), typeof opts === 'function' ? opts(st) : opts), { place: false });
    /**
     * Keep each view and fade them in together, in one play, as s.enter would. A card describes itself;
     * `words` says what else a view shows.
     */
    const enterViews = async (views: readonly View[], fade: FadeOpts = {}, words?: (v: View) => string) => {
      for (const v of views) if (words) s.keep(v, { describe: () => words(v) }); else s.keep(v);
      await this.play(...views.map((v) => new FadeIn(v, fade)));
    };

    // ------------------------------------------------------------------ paths
    // behind-proxies.mdx:31 (true), :53 (addresses), :60-63 (a number counts hops from Express).
    const meaning =
      trustKey === 'true'
        ? 'Setting trust proxy to true tells Express to trust every proxy in front of it.'
        : trustKey === 'list'
          ? `Set to the address list ${TRUST_CODE.list}, trust proxy tells Express to trust the load balancer’s network and the CDN edge’s range.`
          : `Setting trust proxy to ${trustKey} tells Express that ${trustKey === '1' ? 'one proxy stands' : 'two proxies stand'} in front of it; the path through the CDN has two.`;
    await this.step('paths', {
      title: trustKey === 'list' ? 'With trust proxy set to an address list, what is req.ip?' : `With trust proxy ${trustKey}, what is req.ip?`,
      line: `Predict: ${ASKED[reqKey]}. Whose address does Express report?`,
      caption: `Requests are meant to reach Express through a CDN and then a load balancer, so every connection Express sees comes from the load balancer, ${ADDR.balancer}. Express’s req.ip should still name the machine that sent the request. ${meaning} But the load balancer also accepts connections from the internet, so an attacker can skip the CDN. Here ${ASKED[reqKey]}: will req.ip be the ${req.sender.name}’s real address, ${req.sender.addr}? All the addresses are examples.`,
    });
    await s.clear();
    const d = await s.show({ source: NETWORK }, { box: DIAGRAM });
    // `setting`: the scenario's trust setting and request, which the second card names.
    this.state.addresses = { ...ADDR };
    this.state.setting = { trust: trustKey, request: reqKey };
    const addresses = cardView(
      (st) => {
        const a = st.addresses as typeof ADDR;
        return [
          ['Client', a.client],
          ['Attacker', a.attacker],
          ['CDN edge', a.edge],
          ['Load balancer', a.balancer],
        ];
      },
      { at: regionBox(BELOW, { right: -0.15 }), align: 'top', fontSize: SIZE, title: 'Addresses' },
    );
    const chosen = cardView(
      (st) => {
        const { trust: t, request: q } = st.setting as { trust: TrustKey; request: RequestKey };
        return [
          ['trust proxy setting', TRUST_CODE[t]],
          ['Request followed', REQUEST_LABEL[q]],
        ];
      },
      { at: regionBox(BELOW, { left: 0.15 }), align: 'top', fontSize: SIZE, title: 'This scenario' },
    );
    await enterViews([addresses, chosen]);

    // ------------------------------------------------------------------ follow
    const hops = arrivals(req);
    const sent = req.sent ? `X-Forwarded-For: ${req.sent}` : 'no X-Forwarded-For';
    const entries = numberWord(got.xff ? got.xff.split(',').length : 0);
    const settingName = trustKey === 'list' ? 'the address list' : `trust proxy ${trustKey}`;
    await this.step('follow', {
      title:
        mine.outcome === 'sender'
          ? `Answer: ${mine.ip}, the ${req.sender.name}’s real address`
          : mine.outcome === 'proxy'
            ? `Answer: ${mine.ip}, the CDN edge’s address`
            : `Answer: ${mine.ip}, an address the attacker wrote`,
      line: `Beyond its own connection, Express sees only X-Forwarded-For: ${got.xff}.`,
      // The proxies' behaviour is this explainer's assumption; Express's guide does not describe it.
      caption:
        `Express’s own connection comes from the load balancer, ${ADDR.balancer}. All it learns about the machines before that comes from the X-Forwarded-For header: each proxy here appends the address its connection came from. A sender can write entries of its own first, so the header is a reported chain, not proof that each address belongs to a proxy. ` +
        (reqKey === 'client'
          ? `The client sends ${sent}. The CDN edge appends the client’s address, ${ADDR.client}, and the load balancer appends the edge’s, ${ADDR.edge}. `
          : reqKey === 'forged'
            ? `The attacker sends ${sent}, an address it made up. The CDN edge appends the attacker’s real address, ${ADDR.attacker}, and the load balancer appends the edge’s. `
            : `The attacker sends ${sent}, an address it made up, straight to the load balancer, which appends the attacker’s real address, ${ADDR.attacker}: ${entries} entries, one fewer than through the CDN. `) +
        `From these, ${settingName} picks ${mine.ip}, ${
          mine.outcome === 'sender'
            ? `the ${req.sender.name}’s real address.`
            : mine.outcome === 'proxy'
              ? `the CDN edge’s, and the ${req.sender.name}’s address is lost.`
              : 'the entry the attacker made up.'
        }`,
    });
    await s.clearOverlays();
    await d.walk(PATH[reqKey], { trail: true });
    this.state.arrivals = hops.map((h) => [h.at.id, h.socket, h.xff]);
    // Each machine on the path with the header it receives; the last is Express, whose socket address closes the card.
    const received = cardView(
      (st) => {
        const arrived = st.arrivals as [keyof typeof MACHINES, string, string | null][];
        return [
          ...arrived.map(([id, , xff]) => [`${capital(MACHINES[id].name)} receives`, xff ?? 'none'] as const),
          ['Express’s socket address', arrived.at(-1)![1]],
        ];
      },
      { at: BELOW, fontSize: SIZE, title: 'X-Forwarded-For at each machine', width: 11 },
    );
    await enterViews([received], { runTime: 0.35, shift: [0, -0.08] });

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
      title:
        trustKey === 'true'
          ? `req.ip is ${mine.ip}, because true trusts every address before it`
          : trustKey === 'list'
            ? `req.ip is ${mine.ip}, the nearest address outside the trusted ranges`
            : `req.ip is ${mine.ip}, because ${trustKey} trusts the first ${trustKey === '1' ? 'address' : `${numberWord(Number(trustKey), { zero: 'none' })} addresses`} by position`,
      line: last
        ? `Express trusts ${count(trusted.length, 'address')} and reaches the end of the list.`
        : `Express trusts ${count(trusted.length, 'address')}, then stops at the next.`,
      caption: `Express reads the addresses from its own connection outward: the socket address, then X-Forwarded-For from right to left. It skips each address it trusts, and ${scriptAnswer}. ${why} ${stop} ${verdict}${forgedUnread ? ` Express never reads ${ADDR.forged}.` : ''}`,
    });
    await d.hide();
    await s.clearOverlays();
    // `sender` and `outcome`: who sent the request and whose address req.ip turns out to be, which the result card says.
    this.state.read = reading.map((r) => [r.addr, r.verdict]);
    this.state.ip = mine.ip;
    this.state.sender = { name: req.sender.name, addr: req.sender.addr };
    this.state.outcome = mine.outcome;
    const readOf = (st: Record<string, unknown>) => readingsOf(st.read as [string, Verdict][]);
    // `marked`: once true, the address req.ip takes and the result's req.ip row are lit.
    const order = cardView((st) => readingRows(readOf(st)), (st) => ({
      at: regionBox(FULL, { right: 1.2, top: 2.6 }),
      align: 'top',
      fontSize: BIG,
      title: 'Addresses in the order Express reads them',
      ...(st.marked ? { lit: answerLabel(readOf(st)), litAs: 'req.ip' } : {}),
    }));
    /** The result card, and under it whether req.ip is right. */
    const result = view(
      this,
      (st) => {
        const sender = st.sender as { name: string; addr: string },
          outcome = st.outcome as Outcome;
        const card = new Card(
          this,
          s.palette,
          [
            ['Sent by', `${sender.addr} (${sender.name})`],
            ['req.ip', String(st.ip)],
          ],
          {
            at: regionBox(FULL, { left: 1.6, top: 2.6 }), align: 'top', fontSize: BIG, title: 'Result',
            ...(st.marked === 'result' ? { lit: 'req.ip', litAs: outcome === 'sender' ? 'right' : 'wrong' } : {}),
          },
        );
        const b = card.box()!;
        return new Group(card, ...wrap(outcomeWords(outcome, sender.name), [b[0] + 0.1, b[1] - 0.2], b[2] - b[0] - 0.2, BIG, outcome === 'sender' ? s.good : s.bad));
      },
      { place: false },
    );
    s.keep(order);
    s.keep(result, { describe: () => outcomeWords(this.state.outcome as Outcome, (this.state.sender as { name: string }).name) });
    await this.play(new FadeIn(order), new FadeIn(result));
    this.state.marked = 'order';
    await this.play(order.sync({ runTime: 0.4 }));
    this.state.marked = 'result';
    await this.play(result.sync({ runTime: 0.4 }));

    // ------------------------------------------------------------------ routes
    // The same attacker on both routes, each address tied to its source by the route (positions() in the
    // model). utils.js:205 trusts index i while i < n; the list tests the address against its ranges.
    const counted: TrustKey = trustKey === 'list' ? '2' : trustKey;
    const routesOf = (t: TrustKey) =>
      Object.fromEntries(ROUTES.map((q) => [q, positions(REQUESTS[q], TRUSTS[t])])) as Record<Route, Position[]>;
    const byCount = routesOf(counted),
      byList = routesOf('list');
    const trustedOf = (ps: readonly Position[]) => ps.filter((p) => p.verdict === 'trusted').map((p) => WHO_NAME[p.who]);
    const countSays =
      counted === 'true'
        ? `trust proxy true trusts every position but the last, and Express takes the last without a test, so on both routes req.ip is ${WHO_ANSWER[answerOf(byCount.forged).who]}.`
        : `trust proxy ${counted} trusts the first ${counted === '1' ? 'position' : `${numberWord(Number(counted), { zero: 'none' })} positions`}, inside the dashed band, whatever stands there. Through the CDN that is ${both(trustedOf(byCount.forged))}, so req.ip is ${WHO_ANSWER[answerOf(byCount.forged).who]}; skipping the CDN it is ${both(trustedOf(byCount.direct))}, so req.ip is ${WHO_ANSWER[answerOf(byCount.direct).who]}.`;
    if (answerOf(byList.forged).who !== 'attacker' || answerOf(byList.direct).who !== 'attacker')
      throw new Error('The address list must stop at the attacker on both routes');
    const listSays = `The address list trusts an address inside ${TRUSTED_RANGES.join(' or ')}: ${both(trustedOf(byList.forged))} through the CDN, ${both(trustedOf(byList.direct))} on the short route. The attacker’s address is in neither range, so on both routes req.ip is ${WHO_ANSWER.attacker}.`;
    await this.step('routes', {
      title:
        trustKey === 'list'
          ? 'By address, the list stops at the attacker on both routes; 2 does not'
          : counted === 'true'
          ? 'true trusts every position, so both routes end at the made-up entry'
          : counted === '1'
            ? 'Position 1 is the load balancer on both routes; what comes next differs'
            : 'Position 2 is the CDN edge on one route and the attacker on the other',
      line: `Left: trust proxy ${counted} ${counted === 'true' ? 'trusts every position' : 'counts positions from Express'}. Right: the address list checks each address.`,
      caption: `The same attacker sends X-Forwarded-For: ${ADDR.forged} twice, once through the CDN and once straight to the load balancer. Each column lists the addresses Express reads for one route, nearest first, and the numbers count positions from Express. A green box is trusted, a thick outline is req.ip, and a dashed box is not read. ${countSays} ${listSays}`,
    });
    await s.clearOverlays();
    /** The colours the routes panels and the table are drawn in. */
    const colours = { ink, soft: s.soft, good: s.good, bad: s.bad, emphasis: s.emphasis };
    this.state.routes = Object.fromEntries(
      [
        [counted, byCount],
        ['list', byList],
      ].map(([t, rs]) => [t, Object.fromEntries(ROUTES.map((q) => [q, (rs as Record<Route, Position[]>)[q].map((p) => [p.who, p.verdict])]))]),
    );
    /** The routes as the step's state records them: per setting, per route, [who, verdict] counted from Express. */
    const routesState = (st: Record<string, unknown>) => {
      const all = st.routes as Record<string, Record<Route, [Position['who'], Verdict][]>>;
      const asPositions = (t: string) =>
        Object.fromEntries(ROUTES.map((q) => [q, all[t]![q].map(([who, verdict], index) => ({ who, verdict, index, addr: '' }))])) as Record<Route, Position[]>;
      // The count is the setting beside the address list.
      const count = Object.keys(all).find((t) => t !== 'list') as TrustKey;
      return { count, byCount: asPositions(count), byList: asPositions('list') };
    };
    const positionsPanel = view(this, (st) => { const r = routesState(st); return drawRoutesPanel(r.count, r.byCount, -7.55, 'routes-positions', colours).panel; }, { place: false }),
      addressesPanel = view(this, (st) => drawRoutesPanel('list', routesState(st).byList, 0.15, 'routes-addresses', colours).panel, { place: false });
    const tell = (t: TrustKey, routes: Record<Route, Position[]>) =>
      ROUTES.map(
        (q) =>
          `${q === 'forged' ? 'through the CDN' : 'skipping the CDN'}, ${routes[q].map((p) => `${p.index + 1} ${WHO_BOX[p.who]} ${VERDICT_WORD[p.verdict]}`).join(', ')}`,
      ).join('; ') + ` (${t === 'list' ? 'the address list' : `trust proxy ${t}`})`;
    await s.enter(positionsPanel, addressesPanel, {
      describe: () => {
        const r = routesState(this.state);
        return `Two panels of the addresses Express reads, counted from Express, for the attacker through the CDN and skipping it. Left, trust proxy ${r.count}: ${tell(r.count, r.byCount)}. Right, the address list: ${tell('list', r.byList)}.`;
      },
    });
    // The key to the boxes, which the caption reads: trusted, req.ip, not read, and the band a count trusts.
    await s.legend(
      [
        { label: 'trusted', fill: s.good },
        { label: 'req.ip: thick outline', fill: 'none', stroke: s.palette.ink },
        { label: 'not read', fill: 'none', stroke: s.soft, dashed: true },
        { label: 'trusted by position', fill: 'none', stroke: s.emphasis, dashed: true },
      ],
      { at: [-7.4, -3.72], size: 0.26, direction: 'row', gap: 0.5, key: 'routes-legend' },
    );
    s.opening(this.find('routes-positions')!);

    // ------------------------------------------------------------------ code
    // utils.js:197-213 compileTrust; proxy-addr index.js:57, 68-74 (alladdrs) and 231-232 (proxyaddr).
    // forwarded index.js:30-32: addrs is the socket address, then the header's entries right to left.
    await this.step('code', {
      title:
        trustKey === 'true'
          ? 'In the source, true becomes a function that trusts every address'
          : trustKey === 'list'
            ? 'In the source, the list becomes a test of each address against its ranges'
            : `In the source, ${trustKey} becomes i < ${trustKey}: a position, not an address`,
      line:
        trustKey === 'true'
          ? 'Every address passes the check, so the loop never stops early.'
          : trustKey === 'list'
            ? 'The loop stops at the first address outside the ranges.'
            : `Only position counts: the loop trusts index i while i < ${trustKey}.`,
      caption:
        `The question is whether this address belongs to a trusted proxy, or merely occupies a trusted position. Express turns the setting into a trust function, called with each address and its index. ` +
        (trustKey === 'true'
          ? 'true returns a function that trusts everything. '
          : trustKey === 'list'
            ? 'A string is split on commas and compiled into ranges; an address is trusted when it falls in one. '
            : 'A number returns function(a, i){ return i < val }, which never looks at the address a, only at its index. ') +
        'proxy-addr’s loop tests every address but the last and cuts the list after the first one the function rejects; req.ip is the last address left.',
    });
    await s.clearOverlays();
    const left = regionBox(FULL, { right: -0.1 }),
      right = regionBox(FULL, { left: 0.1 });
    const compile = await s.code(COMPILE[trustKey === 'true' || trustKey === 'list' ? trustKey : 'number'], {
      at: left,
      align: 'top',
      fontSize: 0.3,
      title: 'express 5.3.0, lib/utils.js, compileTrust',
      enter: false,
    });
    const loop = await s.code(
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
      { at: right, align: 'top', fontSize: 0.3, title: 'proxy-addr 2.0.8, index.js', enter: false },
    );
    await s.enter(compile, loop);
    await compile.focus(trustKey === 'list' ? [0, 5] : 2, { as: 'this setting' });
    await loop.focus([2, 5], { as: 'stops at the first untrusted address' });
    this.state.trust = TRUST_CODE[trustKey];

    // ------------------------------------------------------------------ requests
    const row = TABLE[trustKey];
    const wrong = REQUEST_KEYS.filter((q) => row[q].outcome !== 'sender');
    await this.step('requests', {
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
            : `Only ${numberWord(3 - wrong.length, { zero: 'none' })} of three requests ${wrong.length === 2 ? 'gets' : 'get'} the real sender’s address.`,
      caption:
        `Keep the trust setting fixed and change the route into the app. ${
          trustKey === 'list' ? 'A shorter route puts different machines at each position, and the list judges each by its address.' : 'A shorter route puts a different machine in the same trusted position.'
        } ` +
        REQUEST_KEYS.map((q) => `${REQUEST_LABEL[q]}: ${row[q].ip}, ${OUTCOME[row[q].outcome]}`).join('. ') +
        '.',
    });
    await s.clearOverlays();
    // `readings` and `outcomes`: how Express reads each request under this setting, and whose address req.ip is.
    this.state.answers = Object.fromEntries(REQUEST_KEYS.map((q) => [q, row[q].ip]));
    this.state.readings = Object.fromEntries(
      REQUEST_KEYS.map((q) => {
        const r = atExpress(REQUESTS[q]);
        return [q, readAddresses(r.socket, r.xff, trust).map((x) => [x.addr, x.verdict])];
      }),
    );
    this.state.outcomes = Object.fromEntries(REQUEST_KEYS.map((q) => [q, row[q].outcome]));
    const third = 15.1 / 3;
    const requestsOf = (st: Record<string, unknown>) =>
      REQUEST_KEYS.map((q) => ({
        q,
        readings: readingsOf((st.readings as Record<RequestKey, [string, Verdict][]>)[q]),
        outcome: (st.outcomes as Record<RequestKey, Outcome>)[q],
      }));
    /** A card per request, each with whether its req.ip is right under it. */
    const requestColumns = view(
      this,
      (st) => {
        const all = requestsOf(st);
        const columns = all.map(
          ({ q, readings }, k) =>
            new Card(this, s.palette, readings.map((x) => [`${x.index + 1}.`, `${x.addr}  ${VERDICT_WORD[x.verdict]}`] as const), {
              at: [-7.55 + k * third + 0.08, -4.25, -7.55 + (k + 1) * third - 0.08, 2.6] as Box,
              align: 'top',
              fontSize: BIG,
              title: REQUEST_LABEL[q],
              // `columnsMarked`: how many columns, from the left, have their req.ip lit.
              ...(k < Number(st.columnsMarked ?? 0) ? { lit: `${readings.find((x) => x.verdict === 'answer')!.index + 1}.`, litAs: 'req.ip' } : {}),
            }),
        );
        const verdicts = all.flatMap(({ q, outcome }, k) =>
          wrap(outcomeWords(outcome, REQUESTS[q].sender.name), [-7.55 + k * third + 0.2, columns[k]!.box()![1] - 0.15], third - 0.5, BIG, outcome === 'sender' ? s.good : s.bad),
        );
        return new Group(...columns, ...verdicts);
      },
      { place: false },
    );
    await enterViews([requestColumns], {}, () =>
      requestsOf(this.state).map(({ q, outcome }) => outcomeWords(outcome, REQUESTS[q].sender.name)).join('. '),
    );
    for (const k of REQUEST_KEYS.keys()) {
      this.state.columnsMarked = k + 1;
      await this.play(requestColumns.sync({ runTime: 0.4 }));
    }

    // ------------------------------------------------------------------ why
    // behind-proxies.mdx:31 (true), :60-63 (a number), :53 (addresses).
    const QUOTE: Record<TrustKey, string> = {
      true: '“When setting to true, it is important to ensure that the last reverse proxy trusted is removing/overwriting all of the following HTTP headers: X-Forwarded-For, X-Forwarded-Host, and X-Forwarded-Proto, otherwise it may be possible for the client to provide any value.”',
      1: '“ensure there are not multiple, different-length paths to the Express application such that the client can be less than the configured number of hops away, otherwise it may be possible for the client to provide any value.”',
      2: '“ensure there are not multiple, different-length paths to the Express application such that the client can be less than the configured number of hops away, otherwise it may be possible for the client to provide any value.”',
      list: '“the untrusted IP address nearest to the application server is determined as the client’s IP address.”',
    };
    await this.step('why', {
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
              : `The path through the CDN has two proxies; the path that skips it has one. Counting two trusted addresses on the short path trusts the attacker’s own address, and the next address is the one the attacker wrote. Express’s guide warns about this, quoted below.`,
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
    const quote = wrap(QUOTE[trustKey], [BELOW[0] + 0.3, BELOW[3] - 0.1], BELOW[2] - BELOW[0] - 0.6, 0.28, ink);
    const cite = new Text(
      `Express guide, “Express behind proxies”, the ${trustKey === 'true' ? 'Boolean' : trustKey === 'list' ? 'IP addresses' : 'Number'} setting`,
      { fontSize: 0.2, color: s.soft, anchor: 'start' },
    ).moveTo([BELOW[0] + 0.3, quote.at(-1)!.box()![1] - 0.3], [-1, 0]);
    await s.enter(...quote, cite);
    this.state.why = trustKey;

    // ------------------------------------------------------------------ ranges
    const other: TrustKey = trustKey === 'list' ? '2' : 'list';
    await this.step('ranges', {
      title:
        trustKey === 'list'
          ? 'Counting two hops instead gives the attacker the short path'
          : 'Trusting the proxies’ address ranges finds the real sender on every path',
      line:
        trustKey === 'list'
          ? `With 2, skipping the CDN gives ${TABLE['2'].direct.ip}, which the attacker wrote.`
          : `The list gets all three right; ${setting(trustKey)} gets ${numberWord(wrong.length, { zero: 'none' })} wrong.`,
      caption:
        `app.set('trust proxy', ${TRUST_CODE.list}) trusts the load balancer’s network and the CDN edge’s range, and nothing else. ` +
        (trustKey === 'list'
          ? `With 2 instead, the request that skips the CDN gives ${TABLE['2'].direct.ip}, an address the attacker wrote. The list is safe as long as each trusted range holds your proxies and no other machine.`
          : `It gives the real sender for all three requests, where ${setting(trustKey)} gets ${numberWord(wrong.length)} wrong. The list is safe as long as each trusted range holds your proxies and no other machine.`),
    });
    await s.clearOverlays();
    await d.unmark();
    await d.dim(null);
    await d.mark(['service:edge', 'service:balancer'], { color: s.good, as: 'trusted by address' });
    // `compareOutcomes`: whether each of the six answers is the real sender, which the cards mark right or wrong.
    this.state.compare = Object.fromEntries(
      [trustKey, other].map((t) => [t, Object.fromEntries(REQUEST_KEYS.map((q) => [q, TABLE[t][q].ip]))]),
    );
    this.state.compareOutcomes = Object.fromEntries(
      [trustKey, other].map((t) => [t, Object.fromEntries(REQUEST_KEYS.map((q) => [q, TABLE[t][q].outcome]))]),
    );
    /** One side of the comparison: the scenario's setting (the paths step's, still in the state), or the other one compared. */
    const side = (which: 0 | 1, box: Box, key: string) =>
      view(
        this,
        (st) => {
          const current = (st.setting as { trust: TrustKey }).trust,
            t = which === 0 ? current : (Object.keys(st.compare as object).find((k) => k !== current) as TrustKey),
            ips = (st.compare as Record<TrustKey, Record<RequestKey, string>>)[t],
            outcomes = (st.compareOutcomes as Record<TrustKey, Record<RequestKey, Outcome>>)[t];
          return keyed(
            new Card(
              this,
              s.palette,
              REQUEST_KEYS.map((q) => [REQUEST_LABEL[q], `${ips[q]}  ${outcomes[q] === 'sender' ? 'right' : 'wrong'}`] as const),
              { at: box, align: 'top', fontSize: SIZE, title: `trust proxy ${t === 'list' ? TRUST_CODE.list : TRUST_LABEL[t]}` },
            ),
            key,
          );
        },
        { place: false },
      );
    // The comparison's six answers are the ranges step's evidence. The
    // network panel behind the preceding quote is context when it is revealed.
    const a = side(0, regionBox(BELOW, { right: -0.1 }), 'ranges-current'),
      b = side(1, regionBox(BELOW, { left: 0.1 }), 'ranges-alternative');
    await enterViews([a, b]);
    s.opening(a.current, b.current, d.get('service:edge'), d.get('service:balancer'));

    // ------------------------------------------------------------------ table
    const rights = TRUST_KEYS.map((t) => REQUEST_KEYS.filter((q) => TABLE[t][q].outcome === 'sender').length);
    const allRight = TRUST_KEYS.filter((_, i) => rights[i] === REQUEST_KEYS.length).map((t) =>
      t === 'list' ? 'the address list' : `trust proxy ${t}`,
    );
    await this.step('table', {
      title: 'Twelve answers from real Express 5.3.0',
      line: `Green: the real sender; ${allRight.length ? `only ${allRight.join(' and ')} ${allRight.length === 1 ? 'gets' : 'get'} all three` : 'no setting gets all three'}.`,
      caption: `Each row is a setting and each column a request; green marks the real sender’s address. Out of three requests, true gets ${rights[0]} right, 1 gets ${rights[1]}, 2 gets ${rights[2]} and the address list gets ${rights[3]}. This scenario, ${TRUST_LABEL[trustKey]} with ${lowerFirst(REQUEST_LABEL[reqKey])}, is outlined.`,
    });
    await s.clearOverlays();
    await d.hide();
    // `tableAnswers`: whose address each of the twelve is, which colours and labels each cell.
    this.state.table = Object.fromEntries(TRUST_KEYS.map((t) => [t, REQUEST_KEYS.map((q) => TABLE[t][q].ip)]));
    this.state.tableAnswers = Object.fromEntries(
      TRUST_KEYS.map((t) => [t, REQUEST_KEYS.map((q) => ({ outcome: TABLE[t][q].outcome, whose: TABLE[t][q].whose }))]),
    );
    /** The twelve answers from the step's state, by setting then request, and the scenario the table outlines. */
    const tableOf = (st: Record<string, unknown>) => {
      const ips = st.table as Record<TrustKey, string[]>,
        answers = st.tableAnswers as Record<TrustKey, { outcome: Outcome; whose: string }[]>,
        setting = st.setting as { trust: TrustKey; request: RequestKey };
      const cell = (t: TrustKey, q: RequestKey): Cell => ({ ip: ips[t][REQUEST_KEYS.indexOf(q)]!, ...answers[t][REQUEST_KEYS.indexOf(q)]! });
      return { cell, setting };
    };
    const table = view(
      this,
      (st) => {
        const { cell: cellOf, setting } = tableOf(st);
        return drawAnswerTable(cellOf, setting, REQUEST_LABEL, { head: SIZE, body: BIG }, colours);
      },
      { place: false },
    );
    await s.enter(table, {
      describe: () => {
        const { cell: cellOf, setting } = tableOf(this.state);
        return (
          'A table of req.ip for each setting and request. ' +
          TRUST_KEYS.map(
            (t) =>
              `trust proxy ${TRUST_LABEL[t]}: ` +
              REQUEST_KEYS.map((q) => {
                const cell = cellOf(t, q);
                return `${REQUEST_LABEL[q].toLowerCase()} ${cell.ip} (${cell.outcome === 'sender' ? 'real sender' : cell.whose})`;
              }).join(', '),
          ).join('. ') +
          `. This scenario, ${TRUST_LABEL[setting.trust]} with ${REQUEST_LABEL[setting.request].toLowerCase()}, is outlined.`
        );
      },
    });
  }
}

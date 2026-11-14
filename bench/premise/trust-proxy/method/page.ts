// The method-only trust-proxy page: the same script intent and model as scenes/explainers/trust-proxy,
// with no engine. Every picture is a pure function from state to an SVG string; every step is a pure
// function from (setting, request) to { title, caption, svg }. main.ts wires them to buttons.
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
  arrivals,
  atExpress,
  inRange,
  positions,
} from '../../../../scenes/explainers/trust-proxy/model.ts';
import type { Hop, Position, Reading, RequestKey, TrustKey } from '../../../../scenes/explainers/trust-proxy/model.ts';
import { TWO_FORGED, TWO_FORGED_IP, WAF, WAF_LIST_IP } from '../../../../scenes/explainers/trust-proxy/answers.ts';
import { EXPRESS_IP } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}

// ------------------------------------------------------------------ drawing helpers
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 400;
const C = { ink: '#1d1d1f', soft: '#6e6e73', line: '#c7c7cc', good: '#1f7a3d', goodFill: '#d8f0df', bad: '#b3261e', badFill: '#f9dedc', route: '#0b57d0' };
const svg = (h: number, body: string, label: string) =>
  `<svg viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${body}</svg>`;
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 13}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.mono ? ' font-family="ui-monospace, Menlo, monospace"' : ''}>${esc(s)}</text>`;
const rect = (x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; dash?: boolean; r?: number } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 6}" fill="${o.fill ?? 'white'}" stroke="${o.stroke ?? C.ink}" stroke-width="${o.sw ?? 1}"${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`;

// ------------------------------------------------------------------ words from the model
export const LABEL: Record<RequestKey, string> = { client: 'Client via the CDN', forged: 'Attacker via the CDN', direct: 'Attacker, skipping the CDN' };
const SETTING: Record<TrustKey, string> = { true: 'true', 1: '1', 2: '2', list: 'the address list' };
const settingWords = (t: TrustKey) => (t === 'list' ? `the address list ${TRUST_CODE.list}` : `trust proxy ${t}`);
/** Who owns an address on this request's route (index 0 is always the socket, the load balancer). */
export function whose(r: RequestKey, addr: string): { who: Position['who']; words: string } {
  const req = REQUESTS[r];
  if (addr === req.sender.addr) return { who: req.sender.id, words: `the ${req.sender.name}’s real address` };
  const hop = req.via.find((h) => h.addr === addr);
  if (hop) return { who: hop.id, words: `the ${hop.name}’s address` };
  return { who: 'forged', words: 'an address the attacker wrote' };
}
const right = (r: RequestKey, ip: string) => ip === REQUESTS[r].sender.addr;
const ipOf = (r: RequestKey, t: TrustKey) => TABLE[t][r].ip;

// ------------------------------------------------------------------ pictures: state in, SVG out
const BOX: Record<Hop['id'], [number, number]> = {
  client: [8, 16],
  attacker: [8, 116],
  edge: [146, 16],
  balancer: [146, 116],
  express: [284, 116],
};
const EDGES: [Hop['id'], Hop['id']][] = [
  ['client', 'edge'],
  ['attacker', 'edge'],
  ['attacker', 'balancer'],
  ['edge', 'balancer'],
  ['balancer', 'express'],
];
const routeEdges = (r: RequestKey): string[] => {
  const req = REQUESTS[r];
  const ids = [req.sender.id, ...req.via.map((h) => h.id), 'express'];
  return ids.slice(1).map((id, i) => `${ids[i]}>${id}`);
};

/** The network: who can reach whom, with this request's route drawn heavy, and (optionally) what arrives at each machine. */
export function networkSvg(r: RequestKey, opts: { arrivals?: boolean; mark?: Partial<Record<Hop['id'], 'good' | 'bad'>> } = {}): string {
  const bw = 108,
    bh = 46;
  const on = new Set(routeEdges(r));
  let body = '';
  for (const [a, b] of EDGES) {
    const [ax, ay] = BOX[a],
      [bx, by] = BOX[b];
    const x1 = ax + bw / 2,
      y1 = ay + bh / 2,
      x2 = bx + bw / 2,
      y2 = by + bh / 2;
    // Stop the line at the box edges.
    const dx = x2 - x1,
      dy = y2 - y1;
    const t1 = Math.min(Math.abs(bw / 2 / (dx || 1e-9)), Math.abs(bh / 2 / (dy || 1e-9)));
    const sx = x1 + dx * t1,
      sy = y1 + dy * t1,
      ex = x2 - dx * t1,
      ey = y2 - dy * t1;
    const active = on.has(`${a}>${b}`);
    body += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${active ? C.route : C.line}" stroke-width="${active ? 3 : 1.5}"${active ? ' marker-end="url(#arr)"' : ' stroke-dasharray="4 3"'}/>`;
  }
  for (const [id, [x, y]] of Object.entries(BOX) as [Hop['id'], [number, number]][]) {
    const m = MACHINES[id];
    const mark = opts.mark?.[id];
    body += rect(x, y, bw, bh, { fill: mark === 'good' ? C.goodFill : mark === 'bad' ? C.badFill : 'white', stroke: mark === 'good' ? C.good : mark === 'bad' ? C.bad : C.ink, sw: mark ? 2 : 1 });
    body += text(x + bw / 2, y + 19, m.name[0]!.toUpperCase() + m.name.slice(1), { anchor: 'middle', weight: '600' });
    if (m.addr) body += text(x + bw / 2, y + 36, m.addr, { anchor: 'middle', size: 12, fill: C.soft, mono: true });
  }
  body += text(8, 192, 'Heavy blue: this request’s route. Dashed: other links.', { size: 11, fill: C.soft });
  let h = 204;
  if (opts.arrivals) {
    h += 6;
    body += text(8, h + 12, 'What each machine receives', { weight: '600' });
    h += 20;
    for (const a of arrivals(REQUESTS[r])) {
      body += text(8, h + 14, `${a.at.name[0]!.toUpperCase()}${a.at.name.slice(1)}`, { weight: '600', size: 12 });
      body += text(120, h + 14, `socket ${a.socket}`, { size: 12, mono: true });
      body += text(120, h + 30, `X-Forwarded-For: ${a.xff ?? '(none)'}`, { size: 12, mono: true, fill: a.xff ? C.ink : C.soft });
      h += 40;
    }
  }
  const defs = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.route}"/></marker></defs>`;
  return svg(h + 6, defs + body, `Network diagram for ${LABEL[r]}`);
}

const WHO_SHORT: Record<Position['who'], string> = { client: 'client', attacker: 'attacker', edge: 'CDN edge', balancer: 'load balancer', express: 'Express', forged: 'made up' };
const VERDICT: Record<Reading['verdict'], string> = { trusted: 'trusted', answer: 'req.ip', unread: 'not read' };

/** One stack of addresses in the order Express reads them: position, address, owner, verdict. */
function stack(x: number, y: number, w: number, ps: Position[], o: { compact?: boolean } = {}): { body: string; h: number } {
  const rowH = o.compact ? 40 : 34;
  let body = '';
  ps.forEach((p, i) => {
    const yy = y + i * (rowH + 4);
    const fill = p.verdict === 'trusted' ? C.goodFill : 'white';
    const stroke = p.verdict === 'unread' ? C.line : C.ink;
    body += rect(x, yy, w, rowH, { fill, stroke, sw: p.verdict === 'answer' ? 3 : 1, dash: p.verdict === 'unread' });
    const fg = p.verdict === 'unread' ? C.soft : C.ink;
    if (o.compact) {
      body += text(x + 6, yy + 16, `${p.index + 1}. ${p.addr}`, { size: 11, mono: true, fill: fg });
      body += text(x + 6, yy + 32, `${WHO_SHORT[p.who]} · ${VERDICT[p.verdict]}`, { size: 11, fill: fg });
    } else {
      body += text(x + 8, yy + 21, `${p.index + 1}`, { size: 12, fill: C.soft });
      body += text(x + 26, yy + 21, p.addr, { size: 12, mono: true, fill: fg });
      body += text(x + 140, yy + 21, WHO_SHORT[p.who] + (p.index === 0 ? ' (socket)' : ''), { size: 12, fill: fg });
      body += text(x + w - 8, yy + 21, VERDICT[p.verdict], { size: 12, fill: fg, anchor: 'end', weight: p.verdict === 'answer' ? '700' : undefined });
    }
  });
  return { body, h: ps.length * (rowH + 4) };
}
const KEY = (y: number) =>
  rect(8, y, 14, 12, { fill: C.goodFill, r: 2 }) +
  text(26, y + 11, 'trusted', { size: 11 }) +
  rect(84, y, 14, 12, { sw: 3, r: 2 }) +
  text(102, y + 11, 'req.ip', { size: 11 }) +
  rect(150, y, 14, 12, { stroke: C.line, dash: true, r: 2 }) +
  text(168, y + 11, 'not read', { size: 11 });

/** The addresses Express reads for one request, nearest first, with the verdict on each. */
export function readSvg(r: RequestKey, t: TrustKey): string {
  const ps = positions(REQUESTS[r], TRUSTS[t]);
  let body = text(8, 16, `Addresses in the order Express reads them (${settingWords(t)})`, { size: 12, weight: '600' });
  const s = stack(8, 26, W - 16, ps);
  body += s.body + KEY(s.h + 34);
  const ip = ipOf(r, t);
  const ok = right(r, ip);
  body += text(8, s.h + 70, `req.ip = ${ip}: ${whose(r, ip).words}`, { size: 13, weight: '700', fill: ok ? C.good : C.bad });
  return svg(s.h + 82, body, `Addresses for ${LABEL[r]} under ${settingWords(t)}; req.ip is ${ip}`);
}

/** A hop count against the address list, on the attacker's two routes, by position counted from Express. */
export function routesSvg(t: TrustKey): string {
  const counted: TrustKey = t === 'list' ? '2' : t;
  let body = '',
    y = 0;
  for (const s of [counted, 'list'] as const) {
    body += text(8, y + 16, s === 'list' ? `The address list ${TRUST_CODE.list}` : `trust proxy ${s}`, { weight: '600' });
    let colH = 0;
    (['forged', 'direct'] as const).forEach((q, i) => {
      const x = 8 + i * 196;
      body += text(x, y + 34, q === 'forged' ? 'Through the CDN' : 'Skipping the CDN', { size: 12, fill: C.soft });
      const st = stack(x, y + 42, 188, positions(REQUESTS[q], TRUSTS[s]), { compact: true });
      body += st.body;
      colH = Math.max(colH, st.h);
    });
    y += colH + 54;
  }
  body += KEY(y);
  return svg(y + 18, body, `Positions on the attacker's two routes under ${settingWords(counted)} and the address list`);
}

/** The branch of Express's compileTrust for this setting, and proxy-addr's loop. */
const COMPILE: Record<'true' | 'number' | 'list', string[]> = {
  true: ['if (val === true) {', '  // Support plain true/false', '  return function(){ return true };', '}'],
  number: ["if (typeof val === 'number') {", '  // Support trusting hop count', '  return function(a, i){ return i < val };', '}'],
  list: ["if (typeof val === 'string') {", '  // Support comma-separated values', "  val = val.split(',')", '    .map(function (v) { return v.trim() })', '}', 'return proxyaddr.compile(val || []);'],
};
const LOOP = [
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
];
export function codeSvg(t: TrustKey): string {
  const branch = COMPILE[t === 'true' || t === 'list' ? t : 'number'];
  const hot = t === 'list' ? [0, 5] : [2, 2];
  let body = text(8, 16, 'express 5.3.0, lib/utils.js, compileTrust', { size: 12, weight: '600' });
  let y = 26;
  branch.forEach((l, i) => {
    if (i >= hot[0]! && i <= hot[1]!) body += `<rect x="4" y="${y + 2}" width="${W - 8}" height="18" fill="#fff4c2"/>`;
    body += text(8, y + 15, l, { size: 11.5, mono: true });
    y += 18;
  });
  y += 14;
  body += text(8, y, 'proxy-addr 2.0.8, index.js', { size: 12, weight: '600' });
  y += 10;
  LOOP.forEach((l, i) => {
    if (i >= 2 && i <= 4) body += `<rect x="4" y="${y + 2}" width="${W - 8}" height="18" fill="#fff4c2"/>`;
    body += text(8, y + 15, l, { size: 11.5, mono: true, fill: l.startsWith('//') ? C.soft : C.ink });
    y += 18;
  });
  return svg(y + 8, body, `Source code: compileTrust for ${settingWords(t)} and proxy-addr's loop`);
}

/** The three requests side by side under one setting. */
export function requestsSvg(t: TrustKey): string {
  let body = '';
  const stacks = REQUEST_KEYS.map((q, i) => stack(4 + i * 132, 36, 128, positions(REQUESTS[q], TRUSTS[t]), { compact: true }));
  const top = 36 + Math.max(...stacks.map((s) => s.h));
  REQUEST_KEYS.forEach((q, i) => {
    const x = 4 + i * 132;
    const [l1, l2] = q === 'direct' ? ['Attacker,', 'skipping CDN'] : [q === 'client' ? 'Client' : 'Attacker', 'via the CDN'];
    body += text(x, 14, l1, { size: 12, weight: '600' }) + text(x, 28, l2, { size: 12, weight: '600' });
    body += stacks[i]!.body;
    const ip = ipOf(q, t);
    const ok = right(q, ip);
    const who = whose(q, ip);
    body += text(x, top + 18, ok ? 'right' : 'wrong', { size: 12, weight: '700', fill: ok ? C.good : C.bad });
    body += text(x, top + 34, who.who === 'forged' ? 'attacker wrote it' : who.words.replace(/’s (real )?address$/, ''), { size: 11, fill: ok ? C.good : C.bad });
  });
  return svg(top + 44, body, `The three requests under ${settingWords(t)}`);
}

/** Two settings, three requests each: req.ip and whether it is the real sender. */
export function compareSvg(a: TrustKey, b: TrustKey): string {
  let body = '';
  [a, b].forEach((s, row) => {
    const y = row * 96;
    body += text(8, y + 16, s === 'list' ? `trust proxy ${TRUST_CODE.list}` : `trust proxy ${s}`, { weight: '600', size: 12 });
    REQUEST_KEYS.forEach((q, i) => {
      const x = 4 + i * 132,
        ip = ipOf(q, s),
        ok = right(q, ip);
      body += rect(x, y + 24, 128, 62, { fill: ok ? C.goodFill : C.badFill, stroke: ok ? C.good : C.bad });
      body += text(x + 6, y + 40, LABEL[q].replace(', skipping the CDN', ', no CDN'), { size: 10.5, fill: C.soft });
      body += text(x + 6, y + 58, ip, { size: 12, mono: true });
      body += text(x + 6, y + 76, ok ? 'real sender' : whose(q, ip).words.replace('an address ', '').replace(/’s address$/, ''), { size: 10.5, fill: ok ? C.good : C.bad });
    });
  });
  return svg(196, body, `req.ip under ${settingWords(a)} and ${settingWords(b)}`);
}

/** The twelve answers, drawn from the oracle (real Express 5.3.0's recorded req.ip), not the model. */
export function tableSvg(t: TrustKey, r: RequestKey): string {
  const cw = 104,
    x0 = 84,
    rh = 44;
  let body = '';
  REQUEST_KEYS.forEach((q, i) => {
    const [l1, l2] = q === 'direct' ? ['Attacker,', 'no CDN'] : [q === 'client' ? 'Client' : 'Attacker', 'via CDN'];
    body += text(x0 + i * cw + cw / 2, 16, l1, { size: 11, anchor: 'middle', weight: '600' }) + text(x0 + i * cw + cw / 2, 30, l2, { size: 11, anchor: 'middle', weight: '600' });
  });
  TRUST_KEYS.forEach((s, row) => {
    const y = 40 + row * rh;
    body += text(8, y + 26, s === 'list' ? 'Address list' : `trust ${s}`, { size: 12, weight: '600' });
    REQUEST_KEYS.forEach((q, i) => {
      const ip = EXPRESS_IP[s][q],
        ok = right(q, ip);
      const outline = s === t && q === r;
      body += rect(x0 + i * cw + 2, y + 2, cw - 4, rh - 4, { fill: ok ? C.goodFill : C.badFill, stroke: outline ? C.ink : ok ? C.good : C.bad, sw: outline ? 3 : 1, r: 4 });
      body += text(x0 + i * cw + cw / 2, y + 20, ip, { size: 11.5, mono: true, anchor: 'middle' });
      body += text(x0 + i * cw + cw / 2, y + 35, ok ? 'real sender' : whose(q, ip).who === 'forged' ? 'attacker wrote it' : whose(q, ip).words.replace(/^the /, '').replace(/’s address$/, ''), { size: 10, anchor: 'middle', fill: ok ? C.good : C.bad });
    });
  });
  return svg(40 + 4 * rh + 6, body, 'Twelve req.ip values recorded from real Express 5.3.0');
}

// ------------------------------------------------------------------ the steps
export function steps(t: TrustKey, r: RequestKey): Step[] {
  const req = REQUESTS[r];
  const ip = ipOf(r, t);
  const w = whose(r, ip);
  const ok = right(r, ip);
  const ps = positions(req, TRUSTS[t]);
  const trusted = ps.filter((p) => p.verdict === 'trusted');
  const got = atExpress(req);
  const meaning =
    t === 'true'
      ? 'trust proxy true tells Express to trust every proxy in front of it.'
      : t === 'list'
        ? `The address list ${TRUST_CODE.list} tells Express to trust any address in the load balancer’s network or the CDN edge’s range.`
        : `trust proxy ${t} tells Express that ${t === '1' ? 'one proxy stands' : 'two proxies stand'} in front of it. The route through the CDN has two.`;
  const asked = { client: 'A client comes through the CDN', forged: 'An attacker comes through the CDN, with a made-up X-Forwarded-For', direct: 'An attacker sends straight to the load balancer, with a made-up X-Forwarded-For' }[r];
  const out: Step[] = [];

  out.push({
    id: 'paths',
    title: t === 'list' ? 'With trust proxy set to an address list, what is req.ip?' : `With trust proxy ${t}, what is req.ip?`,
    caption: `Requests are meant to reach Express through a CDN and then a load balancer, so every connection Express accepts comes from the load balancer, ${ADDR.balancer}. req.ip should still name the machine that sent the request. ${meaning} The load balancer also accepts connections from the internet, so an attacker can skip the CDN. ${asked}. Predict: will req.ip be the ${req.sender.name}’s real address, ${req.sender.addr}? (All addresses are examples.)`,
    svg: networkSvg(r),
  });

  const sentWords = req.sent ? `The ${req.sender.name} sends X-Forwarded-For: ${req.sent}, an address it made up.` : `The ${req.sender.name} sends no X-Forwarded-For.`;
  const appends = req.via
    .map((h, i) => `the ${h.name} appends ${i === 0 ? `the ${req.sender.name}’s address, ${req.sender.addr}` : `the ${req.via[i - 1]!.name}’s, ${req.via[i - 1]!.addr}`}`)
    .join(', and ');
  out.push({
    id: 'follow',
    title: `Answer: ${ip}, ${w.words}`,
    caption: `Express’s own connection comes from the load balancer, ${got.socket}. Everything it learns about earlier machines comes from the X-Forwarded-For header, which here each proxy extends by appending the address its connection came from (an assumption of this page; proxies can also replace or strip the header). ${sentWords} Then ${appends}. Express receives X-Forwarded-For: ${got.xff}. A sender can write entries of its own, so the header is a reported chain, not proof. From these, ${settingWords(t)} gives ${ip}, ${w.words}.`,
    svg: networkSvg(r, { arrivals: true }),
  });

  const trustWhy =
    t === 'true'
      ? 'true trusts every address, so Express reads to the end of the list'
      : t === 'list'
        ? trusted.map((p) => `${p.addr} is in ${TRUSTED_RANGES.find((rg) => inRange(p.addr, rg))}`).join(' and ') + `, so ${trusted.length === 1 ? 'it is' : 'both are'} trusted`
        : `${t} trusts the first ${t === '1' ? 'address' : `${t} addresses`}, ${trusted.map((p) => p.addr).join(' and ')}, for ${t === '1' ? 'its' : 'their'} position alone`;
  const stop = ps.at(-1)!.verdict === 'answer' ? `The list ends at ${ip}, so that is req.ip.` : `${ip} is not trusted, so Express stops there: req.ip is ${ip}.`;
  const unread = ps.filter((p) => p.verdict === 'unread').map((p) => p.addr);
  out.push({
    id: 'read',
    title: `req.ip is ${ip}${ok ? '' : `, ${w.words}`}`,
    caption: `Express reads the addresses from its own connection outward: the socket address first, then X-Forwarded-For from right to left. It skips each address it trusts; req.ip is the nearest address it does not trust, or the farthest one if it trusts all the others (the last address is never tested). ${trustWhy[0]!.toUpperCase()}${trustWhy.slice(1)}. ${stop} That is ${w.words}.${unread.length ? ` Express never tests ${unread.join(', ')}.` : ''}${!ok && w.who === 'forged' ? ` Express trusted the attacker’s real address, ${ADDR.attacker}, as if it were a proxy.` : ''}`,
    svg: readSvg(r, t),
  });

  const counted: TrustKey = t === 'list' ? '2' : t;
  const cf = positions(REQUESTS.forged, TRUSTS[counted]),
    cd = positions(REQUESTS.direct, TRUSTS[counted]);
  const ansWho = (pp: Position[]) => {
    const a = pp.find((p) => p.verdict === 'answer')!;
    return a.who === 'forged' ? `${a.addr}, the entry the attacker made up` : a.who === 'attacker' ? 'the attacker’s real address' : `the ${WHO_SHORT[a.who]}`;
  };
  const countWords =
    counted === 'true'
      ? `trust proxy true trusts every position but the last, and the last is never tested, so on both routes req.ip is ${ansWho(cf)}.`
      : `trust proxy ${counted} trusts the first ${counted === '1' ? 'position' : `${counted} positions`}, whatever stands there. Through the CDN req.ip is ${ansWho(cf)}; skipping the CDN it is ${ansWho(cd)}.`;
  out.push({
    id: 'routes',
    title: counted === '2' ? 'Position 2 is the CDN edge on one route and the attacker on the other' : counted === '1' ? 'Position 1 is the load balancer on both routes' : 'true trusts every position on both routes',
    caption: `The same attacker sends X-Forwarded-For: ${ADDR.forged} twice, once through the CDN and once straight to the load balancer. Each column lists the addresses Express reads, numbered from Express. ${countWords} The address list trusts an address inside ${TRUSTED_RANGES.join(' or ')}: the load balancer and the CDN edge on the long route, the load balancer on the short one. The attacker’s address is in neither range, so on both routes req.ip is the attacker’s real address.`,
    svg: routesSvg(t),
  });

  out.push({
    id: 'code',
    title: t === 'true' ? 'In the source, true becomes a function that trusts every address' : t === 'list' ? 'In the source, the list becomes a test of each address against its ranges' : `In the source, ${t} becomes i < ${t}: a position, not an address`,
    caption: `Express turns the setting into a trust function called with each address and its index. ${
      t === 'true'
        ? 'true returns a function that trusts everything.'
        : t === 'list'
          ? 'A string is split on commas and compiled into ranges; an address is trusted when it falls in one.'
          : 'A number returns function(a, i){ return i < val }, which never looks at the address a, only its index i.'
    } proxy-addr’s loop tests every address but the last and cuts the list after the first one the function rejects; req.ip is the last address left.`,
    svg: codeSvg(t),
  });

  const rightCount = REQUEST_KEYS.filter((q) => right(q, ipOf(q, t))).length;
  out.push({
    id: 'requests',
    title: `With ${SETTING[t]}, ${rightCount} of 3 requests get the real sender’s address`,
    caption: `Keep the setting fixed and change the route. ${REQUEST_KEYS.map((q) => `${LABEL[q]}: ${ipOf(q, t)}, ${right(q, ipOf(q, t)) ? 'the real sender' : whose(q, ipOf(q, t)).words}`).join('. ')}.`,
    svg: requestsSvg(t),
  });

  out.push({
    id: 'why',
    title: t === 'true' ? 'true trusts whatever the sender wrote first' : t === 'list' ? 'An address list trusts a machine, not a position' : 'A hop count assumes every route has the same length',
    caption:
      t === 'true'
        ? 'Both proxies here append and neither removes the header, so the left-most entry is whatever the first sender wrote. Express’s guide warns that with true the last trusted proxy must remove or overwrite X-Forwarded-For.'
        : t === 'list'
          ? `The attacker’s address, ${ADDR.attacker}, is in neither range, so Express stops there on both routes and never tests what the attacker wrote further left. Express’s guide: the untrusted address nearest to the application server is the client’s address.`
          : `The route through the CDN has two proxies; the route that skips it has one. ${t === '2' ? 'Counting two trusted addresses on the short route trusts the attacker’s own address, so the next address, the one the attacker wrote, becomes req.ip.' : 'Counting one trusted address gives the CDN edge on the long route and the attacker’s real address on the short one.'} Express’s guide warns against multiple routes of different lengths with a hop count.`,
    svg: networkSvg(r, {
      mark:
        t === 'list'
          ? { edge: 'good', balancer: 'good', attacker: 'bad' }
          : t === 'true'
            ? { attacker: 'bad' }
            : t === '1'
              ? { edge: 'bad' }
              : { attacker: 'bad' },
    }),
  });

  const other: TrustKey = t === 'list' ? '2' : 'list';
  const wrongCount = (s: TrustKey) => REQUEST_KEYS.filter((q) => !right(q, ipOf(q, s))).length;
  out.push({
    id: 'ranges',
    title: t === 'list' ? 'Counting two hops instead gives the attacker the short route' : 'Trusting the proxies’ address ranges finds the real sender on every route',
    caption: `app.set('trust proxy', ${TRUST_CODE.list}) trusts the load balancer’s network and the CDN edge’s range, and nothing else. It gives the real sender for all three requests; ${SETTING[t === 'list' ? '2' : t]} gets ${wrongCount(t === 'list' ? '2' : t)} wrong. The list is only as safe as its ranges: each must hold your proxies and no other machine.`,
    svg: compareSvg(t, other),
  });

  const counts = TRUST_KEYS.map((s) => `${SETTING[s]} gets ${REQUEST_KEYS.filter((q) => right(q, EXPRESS_IP[s][q])).length}`).join(', ');
  out.push({
    id: 'table',
    title: 'Twelve answers recorded from real Express 5.3.0',
    caption: `Each row is a setting, each column a request; green is the real sender’s address. These are the values real Express 5.3.0 returned for req.ip, not the model’s (the model is tested to match them). Out of three requests, ${counts}. Your scenario is outlined.`,
    svg: tableSvg(t, r),
  });
  return out;
}

export const CHECKS = [
  {
    q: `The attacker skips the CDN again, but writes two made-up entries: X-Forwarded-For: ${TWO_FORGED}. Which address becomes req.ip with trust proxy 2, and which with true?`,
    a: `With 2, ${TWO_FORGED_IP[2]}: Express trusts the load balancer and the attacker’s real address by position, then stops at the next entry. With true, ${TWO_FORGED_IP.true}: every address is trusted, so Express reaches the far end and takes it without a test. Either way the attacker chose req.ip.`,
  },
  {
    q: `You put a firewall service at ${WAF} in front of the CDN, so a client’s request passes three proxies. With trust proxy 2, whose address is req.ip for a client? Which setting gives the client’s address and still stops the attacker who skips the CDN?`,
    a: `The firewall’s: the two trusted positions hold the load balancer and the CDN edge. A count of 3 gives the client but, on the route that skips the CDN, trusts every address and returns the attacker’s made-up entry. The address list with ${WAF} added gives the client, ${WAF_LIST_IP}, and the attacker’s real address on the short route.`,
  },
  {
    q: `What must hold for the address list ${TRUST_CODE.list} to keep req.ip right?`,
    a: 'Every trusted range must hold only your own proxies. The list trusts machines by address, so route length no longer matters, but a machine inside a trusted range would be skipped like a proxy.',
  },
];
export const DEFAULT: { trust: TrustKey; request: RequestKey } = { trust: '2', request: 'direct' };
export { TRUST_KEYS, REQUEST_KEYS };

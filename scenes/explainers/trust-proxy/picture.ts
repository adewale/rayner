import { Text, Rectangle, Group } from '../../../src/index.ts';
import { ADDR, TRUST_KEYS, TRUST_LABEL, REQUEST_KEYS } from './model.ts';
import type { Outcome, Position, RequestKey, TrustKey } from './model.ts';

/** The stage's colours these pictures are drawn in. */
export type Ink = { ink: string; soft: string; good: string; bad: string; emphasis: string };

/** Lines of text wrapped to a width, from a top-left corner down. */
export function wrap(text: string, [x, y]: [number, number], width: number, size: number, color: string): Text[] {
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
}

/** The routes view: the same attacker through the CDN and straight to the load balancer. */
export const ROUTES = ['forged', 'direct'] as const;
export type Route = (typeof ROUTES)[number];
/** Who an address belongs to, as a box in the routes view says it. */
export const WHO_BOX: Record<Position['who'], string> = {
  client: 'Client',
  attacker: 'Attacker',
  edge: 'CDN edge',
  balancer: 'Load balancer',
  express: 'Express',
  forged: `${ADDR.forged}, made up`,
};
const WHO_SHORT: Record<Position['who'], string> = { ...WHO_BOX, forged: 'made up', edge: 'CDN edge', balancer: 'load balancer' };
/** The address a route's reading takes as req.ip. */
export const answerOf = (ps: readonly Position[]) => ps.find((p) => p.verdict === 'answer')!;
const sentByAttacker = (ps: readonly Position[]) => answerOf(ps).who === 'attacker';

/**
 * One panel of the routes step: for one setting, a column per route of the addresses Express reads,
 * counted from Express at the top. A green box is trusted, a thick outline is req.ip, a dashed box is
 * not read, and a count's trusted positions sit inside a dashed band. The rows down to the deepest
 * req.ip (the band, the trusted boxes and both answers, the picture's subject) are grouped under `key`.
 */
export function drawRoutesPanel(t: TrustKey, routes: Record<Route, Position[]>, x0: number, key: string, c: Ink) {
  const ROW = 0.95,
    BOX_H = 0.72,
    LABEL = 0.34;
  const label = (text: string, x: number, y: number, color = c.ink, weight?: 'bold') =>
    new Text(text, { fontSize: LABEL, color, ...(weight ? { weight } : {}) }).moveTo([x, y]);
  const width = 7.4,
    posW = 0.4,
    gap = 0.15,
    colW = (width - posW - gap) / 2;
  const rowY = (i: number) => 1.35 - i * ROW; // 0 is Express, 1 the first address it reads
  const colX = (k: number) => x0 + posW + k * (colW + gap) + colW / 2;
  const parts: (Text | Rectangle)[] = [];
  const core: (Text | Rectangle)[] = [];
  const longest = Math.max(...ROUTES.map((q) => routes[q].length)),
    deepest = Math.max(...ROUTES.map((q) => answerOf(routes[q]).index + 1));
  parts.push(
    label(
      t === 'list'
        ? 'Address list: the proxies’ ranges'
        : t === 'true'
          ? 'trust proxy true: every position'
          : `trust proxy ${t}: ${t === '1' ? 'position 1' : `positions 1 to ${t}`}`,
      x0 + width / 2,
      2.7,
      c.ink,
      'bold',
    ),
  );
  for (let i = 1; i <= longest; i++) (i <= deepest ? core : parts).push(label(String(i), x0 + posW / 2, rowY(i), c.soft));
  if (t === '1' || t === '2') {
    const n = Number(t);
    const band = new Rectangle({
      width: width + 0.1,
      height: n * ROW + 0.08,
      stroke: c.emphasis,
      strokeWidth: 0.04,
      fill: 'none',
      cornerRadius: 0.1,
    }).moveTo([x0 + width / 2, (rowY(1) + rowY(n)) / 2]);
    band.style.dashArray = '0.16 0.1';
    core.push(band);
  }
  ROUTES.forEach((q, k) => {
    const x = colX(k);
    parts.push(label(q === 'forged' ? 'Via the CDN' : 'Skipping the CDN', x, 2.1, c.soft, 'bold'));
    parts.push(
      new Rectangle({ width: colW, height: BOX_H, stroke: c.ink, strokeWidth: 0.03, fill: 'none', cornerRadius: 0.08 }).moveTo([x, rowY(0)]),
      label('Express', x, rowY(0), c.ink, 'bold'),
    );
    for (const p of routes[q]) {
      const y = rowY(p.index + 1),
        ok = p.who === 'attacker';
      const box = new Rectangle({
        width: colW - 0.2,
        height: BOX_H,
        stroke: p.verdict === 'answer' ? (ok ? c.good : c.bad) : p.verdict === 'trusted' ? c.good : c.soft,
        strokeWidth: p.verdict === 'answer' ? 0.07 : 0.03,
        fill: p.verdict === 'trusted' ? c.good : 'none',
        fillOpacity: p.verdict === 'trusted' ? 0.16 : 1,
        cornerRadius: 0.08,
      }).moveTo([x, y]);
      if (p.verdict === 'unread') box.style.dashArray = '0.12 0.08';
      (p.index < deepest ? core : parts).push(box, label(WHO_BOX[p.who], x, y, p.verdict === 'unread' ? c.soft : c.ink));
    }
    parts.push(
      label(sentByAttacker(routes[q]) ? "Right: the attacker" : `Wrong: ${WHO_SHORT[answerOf(routes[q]).who]}`, x, rowY(longest) - 0.85, sentByAttacker(routes[q]) ? c.good : c.bad),
    );
  });
  const subject = new Group(...core);
  subject.key = key;
  return { panel: new Group(...parts, subject), subject };
}

/** One of the twelve answers: req.ip, and whose address it is. */
export type Cell = { ip: string; outcome: Outcome; whose: string };

/**
 * The twelve answers as a table: a row per setting, a column per request, each address green for the
 * real sender and red otherwise, with whose it is under it; the scenario on show is outlined.
 */
export function drawAnswerTable(
  cellOf: (t: TrustKey, q: RequestKey) => Cell,
  setting: { trust: TrustKey; request: RequestKey },
  requestLabel: Record<RequestKey, string>,
  sizes: { head: number; body: number },
  c: Ink,
): Group {
  const x0 = -7.3,
    col0 = 3.3,
    colW = (14.6 - col0) / 3,
    top = 2.7,
    rowH = 1.15;
  const cells: (Text | Rectangle)[] = [];
  const head = (text: string, x: number) =>
    cells.push(
      new Text(text, { fontSize: sizes.head, color: c.soft, weight: 'bold', anchor: 'start' }).moveTo([x, top], [-1, 0]),
    );
  head('trust proxy', x0);
  REQUEST_KEYS.forEach((q, j) => head(requestLabel[q], x0 + col0 + j * colW));
  TRUST_KEYS.forEach((t, i) => {
    const y = top - (i + 1) * rowH;
    cells.push(
      new Text(TRUST_LABEL[t], { fontSize: sizes.body, color: c.ink, font: 'mono', anchor: 'start' }).moveTo([x0, y], [-1, 0]),
    );
    REQUEST_KEYS.forEach((q, j) => {
      const cell = cellOf(t, q),
        x = x0 + col0 + j * colW;
      const color = cell.outcome === 'sender' ? c.good : c.bad;
      cells.push(
        new Text(cell.ip, { fontSize: sizes.body, color, font: 'mono', anchor: 'start' }).moveTo([x, y + 0.13], [-1, 0]),
      );
      cells.push(
        new Text(
          cell.outcome === 'sender' ? 'real sender' : cell.outcome === 'proxy' ? 'CDN edge' : 'attacker wrote it',
          {
            fontSize: 0.22,
            color: c.soft,
            anchor: 'start',
          },
        ).moveTo([x, y - 0.3], [-1, 0]),
      );
      if (t === setting.trust && q === setting.request)
        cells.push(
          new Rectangle({
            width: colW - 0.2,
            height: rowH - 0.15,
            stroke: c.emphasis,
            strokeWidth: 0.03,
            fill: 'none',
            cornerRadius: 0.08,
          }).moveTo([x - 0.15 + (colW - 0.2) / 2, y - 0.07]),
        );
    });
  });
  return new Group(...cells);
}

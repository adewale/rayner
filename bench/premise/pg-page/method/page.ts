// The method-only pg-page page: the same script intent and model as scenes/explainers/pg-page, with no
// engine. Every picture is a pure function from state to an SVG string; every step is a pure function from
// the column to { title, caption, svg }. main.ts wires them to buttons.
import { BLCKSZ, COLUMNS, LINE_POINTER, PAGE_HEADER, SWAP, TEXT_CHARS, TUPLE_HEADER, percent, scenarioOf } from '../../../../scenes/explainers/pg-page/model.ts';
import type { Column, Scenario, Tuple } from '../../../../scenes/explainers/pg-page/model.ts';
import { questions } from '../../../../scenes/explainers/pg-page/answers.ts';
import { MEASURED } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}

// ------------------------------------------------------------------ drawing helpers
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 400;
const C = { ink: '#1d1d1f', soft: '#6e6e73', line: '#c7c7cc', header: '#c9d7f2', data: '#f6c17a', padding: '#ececec', pointer: '#b9e0c4', free: '#ffffff', pageHeader: '#8aa4d6' };
const svg = (h: number, body: string, label: string) =>
  `<svg viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${body}</svg>`;
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 13}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.mono ? ' font-family="ui-monospace, Menlo, monospace"' : ''}>${esc(s)}</text>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, o: { stroke?: string; sw?: number; dash?: boolean } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${o.stroke ?? C.ink}" stroke-width="${o.sw ?? 1}"${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
const swatch = (x: number, y: number, fill: string, label: string) => rect(x, y, 12, 12, fill) + text(x + 16, y + 11, label, { size: 11.5 });

// ------------------------------------------------------------------ pictures: state in, SVG out
/** The 8192-byte page, top to bottom, not to scale: header, line pointers, free space, tuples at the end. */
export function pageSvg(c: Scenario | null): string {
  const x = 8,
    w = 120,
    top = 10,
    h = 300;
  let body = rect(x, top, w, h, C.free);
  body += rect(x, top, w, 26, C.pageHeader);
  body += text(x + w / 2, top + 17, 'page header', { anchor: 'middle', size: 12 });
  const lx = x + w + 14;
  body += text(lx, top + 17, `page header, ${PAGE_HEADER} bytes`, { size: 12 });
  if (!c) {
    body += text(x + w / 2, top + h / 2, `${BLCKSZ - PAGE_HEADER} bytes free`, { anchor: 'middle', size: 12 });
    body += text(lx, top + 44, `pd_lower = ${PAGE_HEADER}`, { size: 12, mono: true });
    body += text(lx, top + h - 6, `pd_upper = ${BLCKSZ}`, { size: 12, mono: true });
    body += text(lx, top + h / 2, `free: ${BLCKSZ} − ${PAGE_HEADER} = ${BLCKSZ - PAGE_HEADER}`, { size: 12 });
    return svg(top + h + 30, body + text(8, top + h + 22, `One ${BLCKSZ}-byte heap page, not to scale.`, { size: 11, fill: C.soft }), 'An empty 8192-byte page: a 24-byte header, then free space');
  }
  const t = c.tuple,
    off = BLCKSZ - t.stored;
  body += rect(x, top + 26, w, 12, C.pointer);
  body += text(lx, top + 36, `pointer, ${LINE_POINTER} bytes; pd_lower ${PAGE_HEADER + LINE_POINTER}`, { size: 12 });
  body += rect(x, top + h - 40, w, 40, C.data);
  body += text(x + w / 2, top + h - 16, `tuple, ${t.stored} bytes`, { anchor: 'middle', size: 12 });
  body += text(lx, top + h - 26, `tuple at ${off}; pd_upper ${off}`, { size: 12 });
  body += text(lx, top + h - 10, `lp_len ${t.lpLen}, given ${t.stored} bytes`, { size: 12 });
  body += `<line x1="${x + w}" y1="${top + 32}" x2="${x + w + 10}" y2="${top + 32}" stroke="${C.ink}"/>`;
  body += text(x + w / 2, top + h / 2, `${off - PAGE_HEADER - LINE_POINTER} bytes free`, { anchor: 'middle', size: 12 });
  body += `<path d="M${x + w - 20},${top + 38} C${x + w + 40},${top + 120} ${x + w + 40},${top + h - 80} ${x + w - 20},${top + h - 30}" fill="none" stroke="${C.soft}" stroke-dasharray="3 3"/>`;
  body += text(lx + 30, top + h / 2, `pointer’s lp_off: ${off}`, { size: 11, fill: C.soft });
  return svg(top + h + 30, body + text(8, top + h + 22, `One ${BLCKSZ}-byte heap page, not to scale.`, { size: 11, fill: C.soft }), `A page with one ${c.label} row: a 4-byte line pointer under the header and a ${t.stored}-byte tuple at the end`);
}

const FILL = { header: C.header, padding: C.padding, data: C.data } as const;
/** A tuple's bytes in lines of 8, one cell per byte, coloured header, padding or data. */
export function tupleGrid(t: Tuple, title: string, y0: number): { body: string; h: number } {
  const cell = 34,
    x0 = 44;
  let body = text(8, y0 + 14, title, { weight: '600', size: 12.5 });
  const lines = t.stored / 8;
  for (let line = 0; line < lines; line++) {
    const y = y0 + 22 + line * (cell * 0.8 + 2);
    body += text(x0 - 6, y + 17, String(line * 8), { size: 11, anchor: 'end', fill: C.soft, mono: true });
    for (let b = 0; b < 8; b++) {
      const kind = t.bytes[line * 8 + b]!;
      body += rect(x0 + b * cell, y, cell - 2, cell * 0.8, FILL[kind], { stroke: C.line });
    }
  }
  const lineH = cell * 0.8 + 2;
  // Mark where lp_len ends if the page rounded it up.
  if (t.lpLen < t.stored) {
    const line = Math.floor(t.lpLen / 8),
      b = t.lpLen % 8;
    const x = x0 + b * cell - 1,
      y = y0 + 22 + line * lineH;
    body += `<line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + cell * 0.8 + 3}" stroke="${C.ink}" stroke-width="2.5"/>`;
  }
  const after = y0 + 22 + lines * lineH;
  body += text(x0, after + 14, `lp_len ${t.lpLen}${t.lpLen < t.stored ? ` (black bar), rounded up to ${t.stored}` : `, already a multiple of 8`}`, { size: 11.5 });
  return { body, h: after + 22 - y0 };
}
const GRID_KEY = (y: number) => swatch(8, y, C.header, 'tuple header') + swatch(120, y, C.padding, 'padding') + swatch(200, y, C.data, 'data (values)');
const tupleTitle = (c: Scenario) => `${c.label}: header ${c.tuple.header}, data ${c.tuple.data}, padding ${c.tuple.padding} = ${c.tuple.stored} bytes`;

export function rowSvg(c: Scenario): string {
  const g = tupleGrid(c.tuple, tupleTitle(c), 0);
  return svg(g.h + 24, g.body + GRID_KEY(g.h + 4), `The ${c.label} tuple, ${c.tuple.stored} bytes, in lines of 8`);
}
export function swapSvg(c: Scenario, w: Scenario): string {
  const a = tupleGrid(c.tuple, tupleTitle(c), 0);
  const b = tupleGrid(w.tuple, tupleTitle(w), a.h + 8);
  const h = a.h + 8 + b.h;
  return svg(h + 24, a.body + b.body + GRID_KEY(h + 4), `The ${c.label} and ${w.label} tuples side by side`);
}

/** Where a full page's 8192 bytes go, as one stacked bar (the Rayner page uses a pie). */
export function shareSvg(c: Scenario): string {
  const sh = c.share;
  const parts: [string, number, string][] = [
    ['Tuple headers', sh.headers, C.header],
    ['Row data', sh.data, C.data],
    ['Alignment padding', sh.padding, C.padding],
    ['Line pointers', sh.pointers, C.pointer],
    ['Page header', sh.pageHeader, C.pageHeader],
    ['Free space', sh.free + sh.reserved, C.free],
  ];
  let body = text(8, 14, `One full page of ${c.label} rows: ${c.page.rows} rows`, { weight: '600' });
  let x = 8;
  const bw = W - 16;
  for (const [, n, fill] of parts) {
    const w = (n / BLCKSZ) * bw;
    body += rect(x, 24, w, 34, fill, { stroke: C.line, sw: 0.5 });
    x += w;
  }
  body += rect(8, 24, bw, 34, 'none');
  parts.forEach(([name, n, fill], i) => {
    const y = 76 + i * 20;
    body += rect(8, y - 10, 12, 12, fill) + text(26, y, name, { size: 12 }) + text(250, y, `${n} B`, { size: 12, anchor: 'end', mono: true }) + text(310, y, percent(n), { size: 12, anchor: 'end', mono: true });
  });
  return svg(76 + parts.length * 20, body, `Where a full page of ${c.label} rows goes`);
}

export function whySvg(c: Scenario): string {
  const p = c.page,
    t = c.tuple;
  const rows: [string, string][] = [
    ['rows on the page', String(p.rows)],
    ['bytes per row (tuple + pointer)', `${t.stored} + ${LINE_POINTER} = ${t.perRow}`],
    ['used by rows', `${p.rows} × ${t.perRow} = ${p.rows * t.perRow}`],
    ['free: pd_upper − pd_lower', `${p.upper} − ${p.lower} = ${p.free}`],
    ['free less one new pointer', `${p.free} − ${LINE_POINTER} = ${p.heapFree}`],
    ['the next tuple needs', `${t.stored} (lp_len ${t.lpLen})`],
  ];
  let body = text(8, 14, `Why ${p.rows} rows and not ${p.rows + 1}`, { weight: '600' });
  rows.forEach(([k, v], i) => {
    const y = 40 + i * 24;
    body += text(8, y, k, { size: 12 }) + text(W - 8, y, v, { size: 12, anchor: 'end', mono: true });
    body += `<line x1="8" y1="${y + 7}" x2="${W - 8}" y2="${y + 7}" stroke="${C.line}"/>`;
  });
  return svg(40 + rows.length * 24, body, `Why ${p.rows} rows fit`);
}

/** The closing table: rows a page and pages for 10,000 rows as measured on Postgres 18.6. */
export function compareSvg(column: Column): string {
  const cols: Column[] = ['int4', 'int8', 'int4-text', 'int8-text'];
  const x0 = 140,
    cw = 64;
  let body = '';
  cols.forEach((k, i) => body += text(x0 + i * cw + cw / 2, 16, COLUMNS[k].label.replace(' + text', '+text'), { size: 11.5, anchor: 'middle', weight: '600' }));
  const lines: [string, (k: Column) => string][] = [
    ['lp_len (measured)', (k) => String(MEASURED[k].lpLen)],
    ['bytes a row', (k) => String(scenarioOf(k, 100).tuple.perRow)],
    ['rows a page (measured)', (k) => String(MEASURED[k].rows)],
    ['pages, 10,000 rows (measured)', (k) => String(MEASURED[k].pages)],
  ];
  lines.forEach(([label, f], r) => {
    const y = 30 + r * 30;
    body += text(8, y + 20, label, { size: 11.5 });
    cols.forEach((k, i) => {
      body += rect(x0 + i * cw + 2, y + 2, cw - 4, 26, k === column ? '#fff4c2' : 'white', { stroke: k === column ? C.ink : C.line });
      body += text(x0 + i * cw + cw / 2, y + 20, f(k), { size: 12.5, anchor: 'middle', mono: true });
    });
  });
  return svg(30 + lines.length * 30 + 6, body, 'Measured rows per page and table sizes for the four columns');
}

// ------------------------------------------------------------------ the steps
export function steps(column: Column): Step[] {
  const c = scenarioOf(column, 100),
    w = scenarioOf(SWAP[column], 100);
  const t = c.tuple,
    p = c.page;
  const text_ = column.endsWith('text');
  const [narrow, wide] = column.startsWith('int4') ? [c, w] : [w, c];
  const diff = narrow.page.rows - wide.page.rows;
  const out: Step[] = [];

  out.push({
    id: 'page',
    title: `Do ${narrow.label} rows fit more on a page than ${wide.label} rows?`,
    caption: `Postgres stores a table in pages of ${BLCKSZ} bytes, and each page starts with a ${PAGE_HEADER}-byte header, so an empty page has ${BLCKSZ - PAGE_HEADER} bytes free. Declaring an integer column int4 instead of int8 (bigint) stores 4 bytes a value instead of 8${text_ ? `; here the integer is followed by an ${TEXT_CHARS}-character text column` : ''}. Predict: how many more ${narrow.label} rows than ${wide.label} rows fit on one page?`,
    svg: pageSvg(null),
  });

  const parts = text_ ? `then the ${column.slice(0, 4)}, then ${TEXT_CHARS} characters after a 1-byte length` : `then the ${column}`;
  out.push({
    id: 'row',
    title: `One ${c.label} row takes ${t.perRow} bytes of the page`,
    caption: `A row is two allocations: a ${LINE_POINTER}-byte line pointer after the header, which records where the row is, and the row itself, the tuple, placed from the end of the page. The tuple is a ${TUPLE_HEADER}-byte header padded to ${t.hoff}, ${parts}: ${t.lpLen} bytes (pageinspect’s lp_len). On a 64-bit build the page gives each tuple a multiple of 8 bytes: ${t.lpLen === t.stored ? `${t.stored} already is one` : `${t.lpLen} becomes ${t.stored}`}. So the row costs ${t.perRow} bytes, of which ${t.data} are the value${text_ ? 's' : ''}.`,
    svg: pageSvg(c) + rowSvg(c),
  });

  out.push({
    id: 'swap',
    title: diff === 0 ? `Answer: none. Both tuples are ${t.stored} bytes` : `Answer: ${diff} more. The tuples are ${narrow.tuple.stored} and ${wide.tuple.stored} bytes`,
    caption: text_
      ? `On a 64-bit build every tuple gets a multiple of 8 bytes. Text with a 1-byte length needs no alignment, so after an int4 it starts at byte ${narrow.tuple.hoff + 4}, in what would have been padding, and the tuple ends at ${narrow.tuple.lpLen}${narrow.tuple.lpLen === narrow.tuple.stored ? ', already a multiple of 8' : ''}. After an int8 it starts at ${wide.tuple.hoff + 8} and the tuple ends at ${wide.tuple.lpLen}, rounded up to ${wide.tuple.stored}. A full page holds ${narrow.page.rows} ${narrow.label} rows and ${wide.page.rows} ${wide.label} rows: ${diff} more.`
      : `On a 64-bit build every tuple gets a multiple of 8 bytes. The int4 tuple is ${narrow.tuple.lpLen} bytes rounded up to ${narrow.tuple.stored}, so its last ${narrow.tuple.stored - narrow.tuple.lpLen} bytes are padding; int8’s extra 4 bytes land exactly there. Both rows cost ${t.perRow} bytes, and a full page holds ${p.rows} of either.`,
    svg: swapSvg(c, w),
  });

  const sh = c.share;
  out.push({
    id: 'full',
    title: `A full page holds ${p.rows} ${c.label} rows; ${percent(sh.data)} of it is data`,
    caption: `Inserts fill the page until the next row does not fit: ${p.rows} rows. The ${p.rows} tuple headers take ${percent(sh.headers)} of the ${BLCKSZ} bytes, more than the ${percent(sh.data)} that is values${text_ ? ' (counting the text’s length byte)' : ''}. Each row pays ${TUPLE_HEADER} header bytes for ${t.data} bytes of value${text_ ? 's' : ''}.`,
    svg: shareSvg(c),
  });

  out.push({
    id: 'why',
    title: `Row ${p.rows + 1} would need ${t.stored} bytes and a pointer; ${p.free} are left`,
    caption: `${p.rows} rows of ${t.perRow} bytes use ${p.rows * t.perRow} of the ${BLCKSZ - PAGE_HEADER} free bytes, leaving ${p.free}. A new row needs a pointer and a tuple: after the ${LINE_POINTER}-byte pointer, ${p.heapFree} bytes remain for a tuple that needs ${t.stored}. ${t.lpLen <= p.heapFree ? `The tuple’s own ${t.lpLen} bytes would fit; rounding up to ${t.stored} is what keeps row ${p.rows + 1} out.` : `Even unrounded, its ${t.lpLen} bytes would not fit.`}`,
    svg: whySvg(c),
  });

  const m = (k: Column) => MEASURED[k];
  out.push({
    id: 'compare',
    title: `int4 and int8 fill ${m('int4').pages} pages alike; with text after them, ${m('int4-text').pages} and ${m('int8-text').pages}`,
    caption: `Measured on a real Postgres 18.6 server, 10,000 rows of each column at fillfactor 100: int4 and int8 both take ${m('int4').pages} pages (${m('int4').rows} rows a page). With an ${TEXT_CHARS}-character text after the integer, int4 takes ${m('int4-text').pages} pages (${m('int4-text').rows} a page) and int8 ${m('int8-text').pages} (${m('int8-text').rows} a page). Whether a narrower type saves space depends on where the row’s bytes end relative to an 8-byte boundary.`,
    svg: compareSvg(column),
  });
  return out;
}

export const CHECKS = [
  { q: 'Would a row with two int4 columns take more page space than a row with one?', a: questions[1]() },
  { q: 'Would smallint (int2, 2 bytes) fit more rows on a page than int4?', a: questions[2]() },
  { q: questions[3]().question, a: questions[3]().answer },
];

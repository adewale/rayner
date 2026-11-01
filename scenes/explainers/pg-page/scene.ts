import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/pg-page.ts';
import { Scene, Group, Rectangle, Text, Arrow, FadeOut } from '../../../src/index.ts';
import type { Box, Vec } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
import {
  BLCKSZ,
  LINE_POINTER,
  PAGE_HEADER,
  SWAP,
  TEXT_CHARS,
  TUPLE_HEADER,
  caseOf,
  percent,
  reserveFor,
} from '../lib/pg-page.ts';
import type { Case, Column, Share } from '../lib/pg-page.ts';

// Sources, all at postgres/postgres tag REL_18_6; lines are quoted in lib/pg-page.ts and
// test/explain-pg-page.test.ts, which also freezes the measurements on Postgres 18.6.
const PG = 'https://github.com/postgres/postgres/blob/REL_18_6/src/';
const STYLE = 'pen-and-ink';

// Slice colours, in slice order, so the byte grid and the pie use the same ones.
const COLORS = {
  data: '#d9480f',
  headers: '#9a9087',
  padding: '#e8dcc4',
  pointers: '#3b6ea5',
  pageHeader: '#241f1a',
  free: '#fffdf7',
  reserved: '#7fb08a',
} as const;
const SLICES: { key: keyof Share; name: string }[] = [
  { key: 'data', name: 'Row data' },
  { key: 'headers', name: 'Tuple headers' },
  { key: 'padding', name: 'Alignment padding' },
  { key: 'pointers', name: 'Line pointers' },
  { key: 'pageHeader', name: 'Page header' },
  { key: 'free', name: 'Free space' },
  { key: 'reserved', name: 'Fillfactor reserve' },
];
const HEAD = [
  '---',
  'config:',
  '  pie:',
  '    legendPosition: right',
  '    textPosition: 0.68',
  '  themeVariables:',
  ...SLICES.map((s, i) => `    pie${i + 1}: '${COLORS[s.key]}'`),
  '    pieLegendTextSize: 17px',
  '    pieSectionTextSize: 15px',
  '    pieTitleTextSize: 18px',
  '---',
].join('\n');
const pieTitle = (c: Case) => `One page of ${c.label} rows`;
/** The pie of a full page. A slice of 0 bytes is left out: Mermaid refuses a zero value. */
const pie = (c: Case) =>
  `${HEAD}\npie showData\n  title ${pieTitle(c)}\n` +
  SLICES.filter((s) => c.share[s.key] > 0)
    .map((s) => `  "${s.name}" : ${c.share[s.key]}\n`)
    .join('');
/** The edit from one pie to another, as Agentic Mermaid's pie operations. */
const pieOps = (from: Case, to: Case) => [
  { kind: 'set_title', title: pieTitle(to) },
  ...SLICES.flatMap((s) => {
    const a = from.share[s.key],
      b = to.share[s.key];
    if (a === b) return [];
    if (a === 0) return [{ kind: 'add_slice', label: s.name, value: b }];
    if (b === 0) return [{ kind: 'remove_slice', label: s.name }];
    return [{ kind: 'set_slice_value', label: s.name, value: b }];
  }),
];

const SIZE = 0.34;
const SMALL = 0.28;
const PIE_BOX: Box = [-7.55, -4.25, 1.75, 3.25];
const RIGHT: Box = [1.95, -4.1, 7.55, 3.1];
// The first two steps draw the page on the left and the tuple on the right.
const ROW_RIGHT: Box = [-0.9, -4.1, 7.55, 3.1];

export default class PgPageExplainer extends Scene {
  static meta = {
    id: 'pg-page',
    title: 'Why can int4 and int8 rows take the same space?',
    sources: [
      PG + 'include/storage/bufpage.h#L158-L218',
      PG + 'include/storage/itemid.h#L25-L30',
      PG + 'include/access/htup_details.h#L150-L185',
      PG + 'include/access/htup_details.h#L615-L631',
      PG + 'backend/access/common/heaptuple.c#L1148-L1160',
      PG + 'backend/access/common/heaptuple.c#L219-L263',
      PG + 'backend/storage/page/bufpage.c#L300-L320',
      PG + 'backend/storage/page/bufpage.c#L900-L1040',
      PG + 'include/utils/rel.h#L355-L390',
      PG + 'backend/access/heap/hio.c#L493-L553',
      PG + 'backend/access/heap/hio.c#L700-L710',
      'https://www.postgresql.org/docs/18/storage-page-layout.html',
      'https://www.postgresql.org/docs/18/pageinspect.html',
      'https://www.postgresql.org/docs/18/sql-createtable.html#RELOPTION-FILLFACTOR',
    ],
  };
  static settings = [
    {
      id: 'column',
      label: 'Column',
      default: 'int4',
      options: [
        { value: 'int4', label: 'int4' },
        { value: 'int8', label: 'int8 (bigint)' },
        { value: 'int4-text', label: 'int4 + text' },
      ],
    },
    {
      id: 'fillfactor',
      label: 'Fillfactor',
      default: '100',
      options: [
        { value: '100', label: '100 (default)' },
        { value: '70', label: '70' },
      ],
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const column = values.column as Column,
      ff = Number(values.fillfactor);
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;
    const c = caseOf(column, 100),
      w = caseOf(SWAP[column], 100),
      f = caseOf(column, ff),
      t = c.tuple;
    const isText = column !== 'int4' && column !== 'int8';
    const text = (words: string, opts: { size?: number; color?: string; bold?: boolean } = {}) =>
      new Text(words, { fontSize: opts.size ?? SIZE, color: opts.color ?? ink, weight: opts.bold ? 'bold' : 'normal' });

    // ------------------------------------------------------------------ the empty page
    // bufpage.h:28-44 draws the page this way: header, line pointers growing down, tuples growing up.
    const PAGE: Box = [-7.2, -4.0, -2.0, 3.0];
    const pw = PAGE[2] - PAGE[0],
      ph = PAGE[3] - PAGE[1];
    const box = (x0: number, y0: number, x1: number, y1: number, fill: string, stroke = ink) =>
      new Rectangle({ width: x1 - x0, height: y1 - y0, fill, stroke, strokeWidth: 0.02 }).moveTo([
        (x0 + x1) / 2,
        (y0 + y1) / 2,
      ]);
    const HEADER_H = 0.6,
      ROW_H = 0.55;
    const outline = box(PAGE[0], PAGE[1], PAGE[2], PAGE[3], COLORS.free);
    const header = box(PAGE[0], PAGE[3] - HEADER_H, PAGE[2], PAGE[3], COLORS.pageHeader);
    const headerLabel = text(`page header, ${PAGE_HEADER} bytes`, { size: SMALL, color: s.palette.paper }).moveTo([
      PAGE[0] + pw / 2,
      PAGE[3] - HEADER_H / 2,
    ]);
    const freeLabel = text(`${BLCKSZ - PAGE_HEADER} bytes free`, { color: s.soft }).moveTo([
      PAGE[0] + pw / 2,
      PAGE[1] + ph * 0.45,
    ]);
    const pageSize = text(`${BLCKSZ} bytes`, { size: SMALL, color: s.soft }).moveTo([PAGE[0] + pw / 2, PAGE[1] - 0.22]);
    const pageWords = () =>
      `An 8192-byte page drawn top to bottom, not to scale: a ${PAGE_HEADER}-byte header, then free space` +
      (rowShown
        ? `, then one ${LINE_POINTER}-byte line pointer under the header and one ${t.stored}-byte tuple at the very end of the page.`
        : '.');
    let rowShown = false;
    await readerFirst(this, s, readerFrames(column, ff));
    await this.step('page', {
      detail: true,
      title: 'An empty 8 KB page has 8168 bytes free',
      line: `pd_lower ${PAGE_HEADER} and pd_upper ${BLCKSZ} mark where free space starts and ends.`,
      // bufpage.h:121-122 "pd_lower - offset to start of free space", "pd_upper - offset to end of free space";
      // bufpage.c:55-57 PageInit sets pd_lower = SizeOfPageHeaderData and pd_upper = pageSize - specialSize (0 for a table).
      caption: `By default Postgres stores a table in pages of ${BLCKSZ} bytes, and every page starts with a ${PAGE_HEADER}-byte header. Two of its fields, pd_lower and pd_upper, mark where the free space starts and ends. On an empty page they are ${PAGE_HEADER} and ${BLCKSZ}, so ${BLCKSZ - PAGE_HEADER} bytes are free.`,
    });
    await s.clear();
    await s.enter(outline, header, headerLabel, freeLabel, pageSize, { describe: pageWords });
    // pd_lower and pd_upper, said where they point: the free space's top and bottom edges.
    const lowerAt = (x: number, y: number, value: number) =>
      s.callout([x, y], `pd_lower ${value}`, { side: 'below', gap: 0.35, size: SMALL });
    const upperAt = (x: number, y: number, value: number) =>
      s.callout([x, y], `pd_upper ${value}`, { side: 'above', gap: 0.45, size: SMALL });
    const mid = PAGE[0] + pw / 2;
    const emptyMarks = [await lowerAt(mid, PAGE[3] - HEADER_H, PAGE_HEADER), await upperAt(mid, PAGE[1], BLCKSZ)];
    this.state.empty = { lower: PAGE_HEADER, upper: BLCKSZ, free: BLCKSZ - PAGE_HEADER };

    // ------------------------------------------------------------------ one row
    const valueWords = isText ? `the int4, then ${TEXT_CHARS} characters after a 1-byte length` : `the ${c.label}`;
    await this.step('row', {
      detail: true,
      title: `One ${c.label} row takes ${t.perRow} bytes of the page`,
      line: `A ${LINE_POINTER}-byte line pointer, plus a ${t.stored}-byte tuple at the page’s end.`,
      // heap_form_tuple (heaptuple.c:1151-1160); PageAddItemExtended (bufpage.c:310-316).
      caption: `An insert adds a ${LINE_POINTER}-byte line pointer after the header and a tuple at the end of the page: a ${TUPLE_HEADER}-byte header padded to ${t.hoff}, then ${valueWords}, ${t.lpLen} bytes. A 64-bit build stores each tuple in a multiple of 8 bytes, ${
        t.lpLen === t.stored ? `which ${t.lpLen} already is` : `here ${t.stored}`
      }, so a row costs ${t.perRow} bytes.`,
    });
    // The same page carries on: only the free-space label and the two offsets give way.
    await this.play(...[freeLabel, ...emptyMarks].map((m) => new FadeOut(m, { runTime: 0.3 })));
    // The pointer sits under the header; the tuple fills the last bytes of the page.
    // Widths in the two strips share one scale, so the pointer is an eighth of an int4 tuple.
    const perByte = (pw - 0.2) / 48;
    const pointer = box(
      PAGE[0],
      PAGE[3] - HEADER_H - ROW_H,
      PAGE[0] + LINE_POINTER * perByte,
      PAGE[3] - HEADER_H,
      COLORS.pointers,
    );
    const pointerLabel = text(`line pointer, ${LINE_POINTER} bytes`, { size: SMALL }).moveTo(
      [pointer.box()![2] + 0.15, PAGE[3] - HEADER_H - ROW_H / 2],
      [-1, 0],
    );
    const tupleW = t.stored * perByte;
    const tupleBox = box(PAGE[2] - tupleW, PAGE[1], PAGE[2], PAGE[1] + ROW_H, COLORS.data);
    const tupleLabel = text(`tuple, ${t.stored} bytes`, { size: SMALL, color: s.palette.paper }).moveTo(
      tupleBox.center(),
    );
    const linkFrom: Vec = [PAGE[0] + (LINE_POINTER * perByte) / 2, PAGE[3] - HEADER_H - ROW_H - 0.05],
      linkTo: Vec = [PAGE[2] - tupleW + 0.3, PAGE[1] + ROW_H + 0.05];
    const link = new Arrow(linkFrom, linkTo, { stroke: ink, strokeWidth: 0.025, tipLength: 0.18 });
    const free2 = text(`${BLCKSZ - PAGE_HEADER - t.perRow} bytes free`, { color: s.soft }).moveTo([
      PAGE[0] + pw / 2 + 0.5,
      PAGE[1] + ph * 0.42,
    ]);
    rowShown = true;
    // The tuple byte by byte, eight to a line: every row of the grid is one MAXALIGN unit.
    const CELL = 0.52,
      GX = ROW_RIGHT[0] + 0.75,
      GY = ROW_RIGHT[3] - 0.15;
    const cells = t.bytes.map((kind, i) =>
      new Rectangle({
        width: CELL,
        height: CELL,
        fill: kind === 'header' ? COLORS.headers : kind === 'padding' ? COLORS.padding : COLORS.data,
        stroke: ink,
        strokeWidth: 0.015,
      }).moveTo([GX + (i % 8) * CELL + CELL / 2, GY - Math.floor(i / 8) * CELL - CELL / 2]),
    );
    const offsets = Array.from({ length: t.stored / 8 }, (_, r) =>
      text(`${r * 8}`, { size: SMALL, color: s.soft }).moveTo([GX - 0.12, GY - r * CELL - CELL / 2], [1, 0]),
    );
    const key = (color: string, words: string, row: number) => {
      const y = GY - 0.25 - row * 0.62;
      return new Group(
        new Rectangle({ width: 0.3, height: 0.3, fill: color, stroke: ink, strokeWidth: 0.015 }).moveTo([
          GX + 8 * CELL + 0.45,
          y,
        ]),
        text(words, { size: SMALL }).moveTo([GX + 8 * CELL + 0.75, y], [-1, 0]),
      );
    };
    const keys = [
      key(COLORS.headers, `header, ${TUPLE_HEADER} bytes`, 0),
      key(COLORS.padding, `padding, ${t.padding} byte${t.padding === 1 ? '' : 's'}`, 1),
      key(COLORS.data, `row data, ${t.data} bytes`, 2),
    ];
    const gridWords = () => {
      const runs: string[] = [];
      let i = 0;
      while (i < t.bytes.length) {
        let j = i;
        while (j < t.bytes.length && t.bytes[j] === t.bytes[i]) j++;
        runs.push(`${j - i} ${t.bytes[i]} byte${j - i > 1 ? 's' : ''}`);
        i = j;
      }
      return `The ${t.stored}-byte tuple in lines of 8 bytes, starting at offsets ${offsets.map((o) => o.text).join(', ')}: ${runs.join(', ')}.`;
    };
    await s.enter(pointer, pointerLabel, tupleBox, tupleLabel, link, free2, { describe: pageWords });
    await s.enter(...cells, ...offsets, ...keys, { describe: gridWords });
    // pageinspect on Postgres 18.6 (heap_page_items and page_header of block 0 after one insert),
    // each value said where it points: the new free-space edges, the pointer's target and the data's start.
    await lowerAt(mid, PAGE[3] - HEADER_H - ROW_H, PAGE_HEADER + LINE_POINTER);
    await upperAt(PAGE[2] - tupleW / 2, PAGE[1] + ROW_H, BLCKSZ - t.stored);
    const [l0, l1] = [linkFrom, linkTo],
      along: Vec = [l0[0] + 0.3 * (l1[0] - l0[0]), l0[1] + 0.3 * (l1[1] - l0[1])];
    await s.callout(along, `lp_off ${BLCKSZ - t.stored}, lp_len ${t.lpLen}`, { side: 'right', gap: 0.3, size: SMALL });
    await s.callout(cells[t.hoff]!, `t_hoff ${t.hoff}: data starts here`, {
      side: 'below',
      gap: cells[t.hoff]!.box()![1] - (GY - (t.stored / 8) * CELL) + 0.35,
      size: SMALL,
    });
    this.state.row = {
      lpOff: BLCKSZ - t.stored,
      lpLen: t.lpLen,
      hoff: t.hoff,
      stored: t.stored,
      perRow: t.perRow,
      lower: PAGE_HEADER + LINE_POINTER,
      upper: BLCKSZ - t.stored,
    };

    // ------------------------------------------------------------------ a full page
    const sh = c.share,
      p = c.page;
    await this.step('full', {
      detail: true,
      title: `A full page holds ${p.rows} ${c.label} rows; ${percent(sh.data)} of it is data`,
      line: `Tuple headers take ${percent(sh.headers)} of the page${sh.headers > sh.data ? ', more than the data' : ''}.`,
      caption: `Inserts fill the page until the next row no longer fits: ${p.rows} rows at the default fillfactor. The pie splits the ${BLCKSZ} bytes, with each part’s bytes in brackets. The ${p.rows} tuple headers take ${percent(sh.headers)}, ${
        sh.headers > sh.data ? 'more than' : 'next to'
      } the ${percent(sh.data)} that is the values${isText ? ', counting the text’s length byte' : ''}.`,
    });
    await s.clear();
    const d: Diagram = await s.show({ source: pie(c) }, { box: PIE_BOX });
    const shareCard = (x: Case) =>
      [
        ['Rows', `${x.page.rows}`],
        ['Bytes a row', `${x.tuple.stored} + ${LINE_POINTER} = ${x.tuple.perRow}`],
        ['Data a row', `${x.tuple.data} bytes`],
        ['Overhead a row', `${x.tuple.perRow - x.tuple.data} bytes`],
      ] as [string, string][];
    await s.card(shareCard(c), { at: RIGHT, fontSize: SIZE, title: `${c.label}, fillfactor 100` });
    this.state.full = { rows: p.rows, share: sh };

    // ------------------------------------------------------------------ why that many
    const used = p.rows * t.perRow;
    await this.step('why', {
      detail: true,
      title: `Row ${p.rows + 1} would need ${t.stored} bytes and a pointer; ${p.free} are left`,
      line: `Free space less a ${LINE_POINTER}-byte pointer is ${p.heapFree} bytes, too few.`,
      // hio.c:520, 553, 703 and bufpage.c:906-921 (PageGetFreeSpace subtracts one ItemIdData).
      caption: `${p.rows} rows of ${t.perRow} bytes use ${used} of the ${BLCKSZ - PAGE_HEADER} free bytes, leaving ${p.free}; pageinspect reports pd_lower ${p.lower} and pd_upper ${p.upper}. Before an insert, hio.c asks for the tuple’s ${t.stored} bytes, and bufpage.c counts the free space less a ${LINE_POINTER}-byte pointer: ${p.heapFree} bytes, too few.`,
    });
    await s.clearOverlays();
    await d.mark(['slice:Free space'], { as: 'too small for another row' });
    await s.card(
      [
        ['Free when empty', `${BLCKSZ - PAGE_HEADER}`],
        [`${p.rows} rows x ${t.perRow} bytes`, `${used}`],
        ['Left', `${p.free}`],
        ['pd_lower, pd_upper', `${p.lower}, ${p.upper}`],
        [`Left less a pointer`, `${p.heapFree}`],
        ['Next row needs', `${t.stored}`],
      ],
      { at: RIGHT, fontSize: SIZE, title: `Why ${p.rows} rows` },
    );
    this.state.why = { used, free: p.free, lower: p.lower, upper: p.upper, heapFree: p.heapFree, needs: t.stored };

    // ------------------------------------------------------------------ switch the type
    const same = w.page.rows === c.page.rows;
    const swapWhy =
      column === 'int4'
        ? `Its 4 extra bytes take the place of the 4 bytes of padding that rounded the int4 tuple from 28 up to 32.`
        : column === 'int8'
          ? `The 4 bytes saved become padding, because the page still rounds the 28-byte tuple up to 32.`
          : `Text needs no alignment, so after an int4 it starts at byte 28, in what would be padding; after an int8 it starts at 32, and the ${w.tuple.lpLen}-byte tuple rounds up to ${w.tuple.stored}.`;
    await this.step('swap', {
      detail: true,
      title: same
        ? `An ${w.label} row takes the same ${w.tuple.perRow} bytes`
        : `As ${w.label}, a row takes ${w.tuple.perRow} bytes, not ${t.perRow}`,
      line:
        column === 'int4'
          ? 'The 4 extra bytes fill the int4 tuple’s 4 bytes of padding.'
          : column === 'int8'
            ? 'The 4 bytes saved become padding: the tuple still rounds to 32.'
            : `After an int8 the text starts at 32; the tuple rounds up to ${w.tuple.stored}.`,
      caption: `The same pie, edited to ${w.label}${isText ? '' : `: the data goes from ${t.data} to ${w.tuple.data} bytes a row`}. ${swapWhy} ${
        same
          ? `The slices change size; the page still holds ${w.page.rows} rows.`
          : `A full page drops from ${c.page.rows} rows to ${w.page.rows}.`
      }`,
    });
    await s.clearOverlays();
    await d.morph({ source: pie(w) }, { ops: pieOps(c, w) });
    await d.mark(['slice:Row data', 'slice:Alignment padding'], { as: 'changed' });
    await s.card(
      [
        [`${c.label} tuple`, `${t.stored}`],
        [`${c.label} end padding`, `${t.stored - t.lpLen}`],
        [`${w.label} tuple`, `${w.tuple.stored}`],
        [`${w.label} end padding`, `${w.tuple.stored - w.tuple.lpLen}`],
        ['Rows a page', `${c.page.rows}, ${w.page.rows}`],
      ],
      { at: RIGHT, fontSize: SIZE, title: 'Bytes' },
    );
    this.state.swap = {
      from: column,
      to: w.column,
      rows: [c.page.rows, w.page.rows],
      perRow: [t.perRow, w.tuple.perRow],
      share: w.share,
    };

    // ------------------------------------------------------------------ fillfactor
    const r70 = caseOf(column, 70);
    await this.step('fillfactor', {
      detail: true,
      title:
        ff === 100
          ? `Fillfactor 100, the default, holds nothing back: ${f.page.rows} rows`
          : `Fillfactor ${ff} holds ${f.page.reserve} bytes back: ${f.page.rows} rows`,
      line:
        ff === 100
          ? `Fillfactor 70 would hold ${reserveFor(70)} bytes back and stop at ${r70.page.rows} rows.`
          : `The next row needs ${t.stored} + ${f.page.reserve} bytes; ${f.page.heapFree} are free.`,
      // rel.h:389-390; hio.c:539-553 and 703; hio.c:493-496 says the space is for updates that keep a row on its page.
      caption:
        ff === 100
          ? `Back to ${c.label}. rel.h turns a table’s fillfactor into bytes an insert must leave free: ${BLCKSZ} x (100 - fillfactor) / 100, which is 0 at 100. So inserts fill the page to ${f.page.rows} rows. A table created with fillfactor 70 keeps ${reserveFor(70)} bytes back and stops at ${r70.page.rows}.`
          : `Back to ${c.label}, in a table created with fillfactor ${ff}. rel.h turns that into ${BLCKSZ} x ${100 - ff} / 100 = ${f.page.reserve} bytes, and hio.c puts a row on a page only if the row and those bytes fit. The page stops at ${f.page.rows} rows, leaving room for updates to its rows.`,
    });
    await s.clearOverlays();
    await d.morph({ source: pie(f) }, { ops: pieOps(w, f) });
    await d.mark([ff === 100 ? 'slice:Free space' : 'slice:Fillfactor reserve'], {
      as: ff === 100 ? 'nothing held back' : 'held back',
    });
    await s.card(
      [
        ['Fillfactor', `${ff}`],
        [`Held back: ${BLCKSZ} x ${100 - ff}%`, `${f.page.reserve}`],
        [`Next row: ${t.stored} + ${f.page.reserve}`, `${f.page.target}`],
        ['Free less a pointer', `${f.page.heapFree}`],
        ['Rows a page', `${f.page.rows}`],
      ],
      { at: RIGHT, fontSize: SIZE, title: `${c.label}, fillfactor ${ff}` },
    );
    this.state.fillfactor = {
      fillfactor: ff,
      reserve: f.page.reserve,
      target: f.page.target,
      rows: f.page.rows,
      free: f.page.free,
      share: f.share,
    };

    // ------------------------------------------------------------------ compare
    const all = (['int4', 'int8', 'int4-text', 'int8-text'] as Column[]).map((k) => caseOf(k, ff));
    const [i4, i8, i4t, i8t] = all as [Case, Case, Case, Case];
    await this.step('compare', {
      detail: true,
      title: `int4 and int8 fill ${i4.pagesFor10000} pages alike; with text after them, ${i4t.pagesFor10000} and ${i8t.pagesFor10000}`,
      line: `Both integer rows take ${i4.tuple.perRow} bytes; with text, ${i4t.tuple.perRow} and ${i8t.tuple.perRow}.`,
      caption: `Each line is a table of 10 000 rows at fillfactor ${ff}, as measured on Postgres 18.6. int4 and int8 rows both take ${i4.tuple.perRow} bytes, so both tables take ${i4.pagesFor10000} pages. With an ${TEXT_CHARS}-character text column after the integer, the int8 table takes ${i8t.pagesFor10000} pages to the int4 table’s ${i4t.pagesFor10000}.`,
    });
    await s.clear();
    const compareCard = await s.card(
      all.map(
        (x) =>
          [x.label, `${x.tuple.perRow} bytes a row, ${x.page.rows} a page, ${x.pagesFor10000} pages`] as [
            string,
            string,
          ],
      ),
      { at: regionBox('full', { top: 2.6, bottom: -3.6 }), fontSize: 0.42, title: `10 000 rows at fillfactor ${ff}` },
    );
    await compareCard.mark(c.label, { as: 'this case' });
    this.state.compare = Object.fromEntries(
      all.map((x) => [x.column, { perRow: x.tuple.perRow, rows: x.page.rows, pages: x.pagesFor10000 }]),
    );
  }
}

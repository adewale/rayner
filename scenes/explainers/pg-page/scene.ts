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
  INT4,
  INT8,
  scenarioOf,
  fill,
  percent,
  shortText,
  tuple,
} from '../lib/pg-page.ts';
import type { Attr, Scenario, Column, Share } from '../lib/pg-page.ts';

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
  '    textPosition: 0.72',
  '  themeVariables:',
  ...SLICES.map((s, i) => `    pie${i + 1}: '${COLORS[s.key]}'`),
  '    pieLegendTextSize: 17px',
  '    pieSectionTextSize: 15px',
  '    pieTitleTextSize: 18px',
  '---',
].join('\n');
const pieTitle = (c: Scenario) => `One page of ${c.label} rows`;
/** The pie of a full page. A slice of 0 bytes is left out: Mermaid refuses a zero value. */
const pie = (c: Scenario) =>
  `${HEAD}\npie showData\n  title ${pieTitle(c)}\n` +
  SLICES.filter((s) => c.share[s.key] > 0)
    .map((s) => `  "${s.name}" : ${c.share[s.key]}\n`)
    .join('');
/** The edit from one pie to another, as Agentic Mermaid's pie operations. */
const pieOps = (from: Scenario, to: Scenario) => [
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
const WIDE_PIE: Box = [-7.55, -4.25, 7.55, 3.0];
const RIGHT: Box = [1.95, -4.1, 7.55, 3.1];
// The first two steps draw the page on the left and the tuple on the right.
const ROW_RIGHT: Box = [-0.9, -4.1, 7.55, 3.1];
/** The script's one-sentence answer (script.md); the swap step's caption opens with it. */
const ANSWER = 'On a 64-bit build, Postgres gives every tuple a multiple of 8 bytes';

// The check questions' rows, laid out by the model's rules (not measured): two int4 columns, one int2
// (smallint: 2 bytes, pg_type typalign 's'), and the integer followed by a 15-character text.
const INT2: Attr = { name: 'int2', len: 2, align: 2 };
const rowOf = (attrs: readonly Attr[]) => {
  const t = tuple(attrs);
  return { ...t, rows: fill(t.stored, 100).rows };
};
const ONE = rowOf([INT4]),
  TWO = rowOf([INT4, INT4]),
  SMALL_INT = rowOf([INT2]),
  T15 = 15,
  NARROW15 = rowOf([INT4, shortText(T15)]),
  WIDE15 = rowOf([INT8, shortText(T15)]);
if (TWO.perRow !== ONE.perRow || SMALL_INT.perRow !== ONE.perRow || NARROW15.perRow !== WIDE15.perRow)
  throw new Error('The check answers assume each changed row costs what its comparison row costs');

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
      PG + 'backend/access/heap/hio.c#L493-L553',
      PG + 'backend/access/heap/hio.c#L700-L710',
      'https://www.postgresql.org/docs/18/storage-page-layout.html',
      'https://www.postgresql.org/docs/18/pageinspect.html',
    ],
    // The script's answer and check questions (script.md); check holds a step (swap) to stating the answer.
    answer: ANSWER,
    checks: [
      {
        question: 'Would a row with two int4 columns take more page space than a row with one?',
        answer: `No. The first int4 ends at byte ${ONE.lpLen}, and the second fills bytes ${ONE.lpLen} to ${TWO.lpLen - 1}, the padding one int4 leaves. Both tuples take ${ONE.stored} bytes, so both rows cost ${ONE.perRow} and a page holds ${TWO.rows} of either.`,
      },
      {
        question: 'Would smallint (int2, 2 bytes) fit more rows on a page than int4?',
        answer: `No. Its tuple is ${SMALL_INT.hoff} + 2 = ${SMALL_INT.lpLen} bytes, which the page rounds up to ${SMALL_INT.stored}, the same as int4’s ${ONE.lpLen}. Both rows cost ${ONE.perRow} bytes and a page holds ${SMALL_INT.rows}.`,
      },
      {
        question: `With a ${T15}-character text after the integer instead of an ${TEXT_CHARS}-character one, does int4 still fit more rows than int8?`,
        answer: `No. After an int4 the tuple is ${NARROW15.lpLen} bytes, rounded up to ${NARROW15.stored}; after an int8 it is ${WIDE15.lpLen}, already a multiple of 8. Both rows cost ${NARROW15.perRow} bytes, so the saving the ${TEXT_CHARS}-character text showed disappears.`,
      },
    ],
    // The sentences that reach beyond the rows on screen, and the tests that hold them.
    claims: [
      {
        says: 'every page starts with a 24-byte header',
        test: 'test/explain-pg-page.test.ts: the page header, line pointer and tuple header sizes',
      },
      {
        says: 'Postgres gives every tuple a multiple of 8 bytes',
        test: 'test/explain-pg-page.test.ts: stored in a multiple of MAXALIGN',
      },
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
  ];

  override async construct() {
    const values = settingsOf(this);
    const column = values.column as Column;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;
    const c = scenarioOf(column, 100),
      w = scenarioOf(SWAP[column], 100),
      t = c.tuple;
    // The opening's pair, narrow integer first: int4 against int8, with or without the text after it.
    const [narrow, wide] = column.startsWith('int4') ? [c, w] : [w, c];
    const isText = column !== 'int4' && column !== 'int8';
    const text = (words: string, opts: { size?: number; color?: string; bold?: boolean } = {}) =>
      new Text(words, { fontSize: opts.size ?? SIZE, color: opts.color ?? ink, weight: opts.bold ? 'bold' : 'normal' });

    // ------------------------------------------------------------------ the question, on an empty page
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
    const valueBytes = (x: Scenario) => (x.column.endsWith('text') ? `${x.tuple.data - TEXT_CHARS - 1} + ${TEXT_CHARS + 1}` : `${x.tuple.data}`);
    await this.step('page', {
      title: `Do ${narrow.label} rows fit more on a page than ${wide.label} rows?`,
      line: `Predict: ${narrow.label} saves 4 bytes a row. How many more rows fit in this page?`,
      // bufpage.h:121-122 "pd_lower - offset to start of free space", "pd_upper - offset to end of free space";
      // bufpage.c:55-57 PageInit sets pd_lower = SizeOfPageHeaderData and pd_upper = pageSize - specialSize (0 for a table).
      caption: `Postgres stores a table in pages of ${BLCKSZ} bytes, and every page starts with a ${PAGE_HEADER}-byte header, so an empty page has ${BLCKSZ - PAGE_HEADER} bytes free. A common way to save space is to declare an integer column int4 rather than int8 (bigint): 4 bytes a value instead of 8${isText ? `, here followed by an ${TEXT_CHARS}-character text column` : ''}. Predict how many more ${narrow.label} rows than ${wide.label} rows fit on one page.`,
    });
    await s.enter(outline, header, headerLabel, freeLabel, pageSize, { describe: pageWords });
    // pd_lower and pd_upper, said where they point: the free space's top and bottom edges.
    const lowerAt = (x: number, y: number, value: number) =>
      s.callout([x, y], `pd_lower ${value}`, { side: 'below', gap: 0.35, size: SMALL });
    const upperAt = (x: number, y: number, value: number) =>
      s.callout([x, y], `pd_upper ${value}`, { side: 'above', gap: 0.45, size: SMALL });
    const mid = PAGE[0] + pw / 2;
    const emptyMarks = [await lowerAt(mid, PAGE[3] - HEADER_H, PAGE_HEADER), await upperAt(mid, PAGE[1], BLCKSZ)];
    const question = await s.card(
      [
        ...[narrow, wide].map((x) => [`${x.label}, value bytes`, valueBytes(x)] as [string, string]),
        ['Rows a page', '?'],
      ],
      { at: ROW_RIGHT, fontSize: SIZE, title: 'Two ways to store the same rows' },
    );
    this.state.empty = { lower: PAGE_HEADER, upper: BLCKSZ, free: BLCKSZ - PAGE_HEADER };

    // ------------------------------------------------------------------ one row
    const valueWords = isText ? `the int4, then ${TEXT_CHARS} characters after a 1-byte length` : `the ${c.label}`;
    await this.step('row', {
      title: `One ${c.label} row takes ${t.perRow} bytes of the page`,
      line: `Predict: ${w.label} ${w.tuple.data > t.data ? 'adds' : 'saves'} ${Math.abs(w.tuple.data - t.data)} bytes of data. How big is its tuple?`,
      // heap_form_tuple (heaptuple.c:1151-1160); PageAddItemExtended (bufpage.c:310-316).
      caption: `A row has two allocations: a ${LINE_POINTER}-byte line pointer, which locates it on the page, and the row itself, called a tuple, at the other end: a ${TUPLE_HEADER}-byte header padded to ${t.hoff}, then ${valueWords}, ${t.lpLen} bytes. On a 64-bit build the page gives each tuple a multiple of 8 bytes, ${
        t.lpLen === t.stored ? `which ${t.lpLen} already is` : `here ${t.stored}`
      }, so the row costs ${t.perRow} bytes, of which ${t.data} are the value${isText ? 's' : ''}.`,
    });
    // The same page carries on: only the free-space label, the two offsets and the question give way.
    await this.play(...[freeLabel, ...emptyMarks, question].map((m) => new FadeOut(m, { runTime: 0.3 })));
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
    // A tuple byte by byte, eight to a line: every line of the grid is one MAXALIGN unit.
    const CELL = 0.52;
    const grid = (x: Scenario, gx: number, gy: number) => {
      const cells = x.tuple.bytes.map((kind, i) =>
        new Rectangle({
          width: CELL,
          height: CELL,
          fill: kind === 'header' ? COLORS.headers : kind === 'padding' ? COLORS.padding : COLORS.data,
          stroke: ink,
          strokeWidth: 0.015,
        }).moveTo([gx + (i % 8) * CELL + CELL / 2, gy - Math.floor(i / 8) * CELL - CELL / 2]),
      );
      const offsets = Array.from({ length: x.tuple.stored / 8 }, (_, r) =>
        text(`${r * 8}`, { size: SMALL, color: s.soft }).moveTo([gx - 0.12, gy - r * CELL - CELL / 2], [1, 0]),
      );
      const words = () => {
        const runs: string[] = [];
        let i = 0;
        while (i < x.tuple.bytes.length) {
          let j = i;
          while (j < x.tuple.bytes.length && x.tuple.bytes[j] === x.tuple.bytes[i]) j++;
          runs.push(`${j - i} ${x.tuple.bytes[i]} byte${j - i > 1 ? 's' : ''}`);
          i = j;
        }
        return `The ${x.label} row’s ${x.tuple.stored}-byte tuple in lines of 8 bytes, starting at offsets ${offsets.map((o) => o.text).join(', ')}: ${runs.join(', ')}.`;
      };
      return { cells, offsets, words };
    };
    /** A colour key for one tuple's bytes, from (kx, ky) down. */
    const keyFor = (x: Scenario, kx: number, ky: number) =>
      (
        [
          [COLORS.headers, `header, ${TUPLE_HEADER} bytes`],
          [COLORS.padding, `padding, ${x.tuple.padding} byte${x.tuple.padding === 1 ? '' : 's'}`],
          [COLORS.data, `${isText ? 'values' : 'value'}, ${x.tuple.data} bytes`],
        ] as const
      ).map(([color, words], row) => {
        const y = ky - row * 0.62;
        return new Group(
          new Rectangle({ width: 0.3, height: 0.3, fill: color, stroke: ink, strokeWidth: 0.015 }).moveTo([kx, y]),
          text(words, { size: SMALL }).moveTo([kx + 0.3, y], [-1, 0]),
        );
      });
    const GX = ROW_RIGHT[0] + 0.75,
      GY = ROW_RIGHT[3] - 0.15;
    const mine = grid(c, GX, GY);
    const keys = keyFor(c, GX + 8 * CELL + 0.45, GY - 0.25);
    await s.enter(pointer, pointerLabel, tupleBox, tupleLabel, link, free2, { describe: pageWords });
    await s.enter(...mine.cells, ...mine.offsets, ...keys, { describe: mine.words });
    // pageinspect on Postgres 18.6 (heap_page_items and page_header of block 0 after one insert),
    // each value said where it points: the new free-space edges, the pointer's target and the data's start.
    const rowMarks = [
      await lowerAt(mid, PAGE[3] - HEADER_H - ROW_H, PAGE_HEADER + LINE_POINTER),
      await upperAt(PAGE[2] - tupleW / 2, PAGE[1] + ROW_H, BLCKSZ - t.stored),
    ];
    const [l0, l1] = [linkFrom, linkTo],
      along: Vec = [l0[0] + 0.3 * (l1[0] - l0[0]), l0[1] + 0.3 * (l1[1] - l0[1])];
    rowMarks.push(
      await s.callout(along, `lp_off ${BLCKSZ - t.stored}, lp_len ${t.lpLen}`, { side: 'right', gap: 0.3, size: SMALL }),
    );
    const hoffMark = await s.callout(mine.cells[t.hoff]!, `t_hoff ${t.hoff}: data starts here`, {
      side: 'below',
      gap: mine.cells[t.hoff]!.box()![1] - (GY - (t.stored / 8) * CELL) + 0.35,
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

    // ------------------------------------------------------------------ the answer: the two tuples side by side
    const same = w.page.rows === c.page.rows;
    const swapWhy =
      column === 'int4'
        ? `The int4 tuple is ${t.lpLen} bytes rounded up to ${t.stored}, so its last ${t.stored - t.lpLen} bytes are padding, and int8’s 4 extra bytes take exactly their place.`
        : column === 'int8'
          ? `Without int8’s last 4 bytes the tuple is ${w.tuple.lpLen} bytes, and the page still rounds it up to ${w.tuple.stored}: the 4 bytes saved become padding.`
          : `Text needs no alignment, so after an int4 it starts at byte ${narrow.tuple.hoff + 4}, in what would be padding, and the tuple ${narrow.tuple.lpLen === narrow.tuple.stored ? `ends at ${narrow.tuple.stored}, a multiple of 8 already` : `rounds up from ${narrow.tuple.lpLen} to ${narrow.tuple.stored}`}; after an int8 it starts at ${wide.tuple.hoff + 8}, and the tuple ${wide.tuple.lpLen === wide.tuple.stored ? `ends at ${wide.tuple.stored}` : `rounds up from ${wide.tuple.lpLen} to ${wide.tuple.stored}`}.`;
    const more = narrow.page.rows - wide.page.rows;
    await this.step('swap', {
      title: same
        ? `Answer: none. Both tuples are ${t.stored} bytes`
        : `Answer: ${more} more. The tuples are ${narrow.tuple.stored} and ${wide.tuple.stored} bytes`,
      line: same
        ? `${c.label === 'int4' ? 'int8 fills the int4 tuple’s padding' : 'The bytes int4 saves become padding'}; a page holds ${c.page.rows} rows of either.`
        : `${narrow.label}: ${narrow.page.rows} rows a page; ${wide.label}: ${wide.page.rows}.`,
      // heaptuple.c:219-263 (data offsets by typalign); bufpage.c:310-316 MAXALIGNs the item; pg_controldata on 18.6: alignment 8.
      caption: `${ANSWER}. ${swapWhy} ${
        same
          ? `So an ${c.label} row and an ${w.label} row both cost ${t.perRow} bytes, and a full page holds ${c.page.rows} of either: none more.`
          : `So a full page holds ${narrow.page.rows} ${narrow.label} rows and ${wide.page.rows} ${wide.label} rows: ${more} more.`
      }`,
    });
    // The page gives way; this row's grid moves left and the other type's grid appears beside it.
    const LX = -5.9,
      RX = 1.7,
      TOP = 2.35;
    const theirs = grid(w, RX, TOP);
    const titleOf = (x: Scenario, gx: number) =>
      text(`${x.label}: ${x.tuple.stored}-byte tuple`, { bold: true }).moveTo([gx + 4 * CELL, TOP + 0.4]);
    await this.play(
      ...[outline, header, headerLabel, pageSize, pointer, pointerLabel, tupleBox, tupleLabel, link, free2, ...keys, ...rowMarks, hoffMark].map(
        (m) => new FadeOut(m, { runTime: 0.3 }),
      ),
    );
    const shift: Vec = [LX - GX, TOP - GY];
    await this.play(...[...mine.cells, ...mine.offsets].map((m) => m.animate.shift(shift)), { runTime: 0.6 });
    const below = (x: Scenario) => TOP - (x.tuple.stored / 8) * CELL - 1.25;
    const keyY = Math.min(below(c), below(w));
    const [cx, wx] = [LX, RX];
    await s.enter(
      titleOf(c, cx),
      titleOf(w, wx),
      ...keyFor(c, cx + 0.15, keyY),
      ...theirs.cells,
      ...theirs.offsets,
      ...keyFor(w, wx + 0.15, keyY),
      { describe: () => `${mine.words()} ${theirs.words()}` },
    );
    // Where the two differ: the bytes one type uses for its value and the other leaves as padding.
    const differ = t.bytes.flatMap((b, i) => (w.tuple.bytes[i] !== b ? [i] : []));
    if (differ.length) {
      const first = differ[0]!;
      await s.callout(mine.cells[first]!, c.tuple.bytes[first] === 'padding' ? 'padding here' : `${c.label}’s value`, {
        side: 'below',
        gap: mine.cells[first]!.box()![1] - (TOP - (t.stored / 8) * CELL) + 0.3,
        size: SMALL,
      });
      const other = theirs.cells[first]!;
      await s.callout(other, w.tuple.bytes[first] === 'padding' ? 'padding here' : `${w.label}’s value here`, {
        side: 'below',
        gap: other.box()![1] - (TOP - (w.tuple.stored / 8) * CELL) + 0.3,
        size: SMALL,
      });
    }
    this.state.swap = {
      from: column,
      to: w.column,
      rows: [c.page.rows, w.page.rows],
      perRow: [t.perRow, w.tuple.perRow],
    };

    // ------------------------------------------------------------------ a full page
    const sh = c.share,
      p = c.page;
    await this.step('full', {
      title: `A full page holds ${p.rows} ${c.label} rows; ${percent(sh.data)} of it is data`,
      line: `Tuple headers take ${percent(sh.headers)} of the page${sh.headers > sh.data ? ', more than the data' : ''}.`,
      caption: `Inserts fill the page until the next row no longer fits: ${p.rows} rows. The pie splits the ${BLCKSZ} bytes, with each part’s bytes in brackets. The ${p.rows} tuple headers take ${percent(sh.headers)}, ${
        sh.headers > sh.data ? 'more than' : 'next to'
      } the ${percent(sh.data)} that is the values${isText ? ', counting the text’s length byte' : ''}: of each row’s ${t.perRow} bytes, ${t.data} are data. ${same ? `Each of these rows pays ${TUPLE_HEADER} header bytes for ${t.data} bytes of value, so the integer’s width is a small part of the page whichever type is chosen.` : `Here the 4 bytes did matter: they pushed the ${wide.label} tuple past a multiple of 8.`}`,
    });
    await s.clear();
    // The whole stage for the pie, so its narrow slices have room for their labels.
    let d: Diagram = await s.show({ source: pie(c) }, { box: WIDE_PIE });
    this.state.full = { rows: p.rows, share: sh };

    // ------------------------------------------------------------------ why that many
    const used = p.rows * t.perRow;
    await this.step('why', {
      title: `Row ${p.rows + 1} would need ${t.stored} bytes and a pointer; ${p.free} are left`,
      line: `Free space less a ${LINE_POINTER}-byte pointer is ${p.heapFree} bytes, too few.`,
      // hio.c:520, 553, 703 and bufpage.c:906-921 (PageGetFreeSpace subtracts one ItemIdData).
      caption: `${p.rows} rows of ${t.perRow} bytes use ${used} of the ${BLCKSZ - PAGE_HEADER} free bytes, leaving ${p.free}; a new row needs both its pointer and its tuple. Reserving the ${LINE_POINTER}-byte pointer leaves ${p.heapFree} bytes for a tuple that needs ${t.stored}. ${
        t.lpLen <= p.heapFree
          ? `The tuple’s own ${t.lpLen} bytes would fit; rounding them up to ${t.stored} is what keeps row ${p.rows + 1} out.`
          : `Even unrounded, its ${t.lpLen} bytes would not fit.`
      }`,
    });
    await s.clear();
    d = await s.show({ source: pie(c) }, { box: PIE_BOX });
    await d.mark(['slice:Free space'], { as: 'too small for another row' });
    await s.card(
      [
        ['Free when empty', `${BLCKSZ - PAGE_HEADER}`],
        [`${p.rows} rows x ${t.perRow} bytes`, `${used}`],
        ['Left', `${p.free}`],
        ['pd_lower, pd_upper', `${p.lower}, ${p.upper}`],
        [`Left less a pointer`, `${p.heapFree}`],
        ['Next tuple, unrounded', `${t.lpLen}`],
        ['Next tuple, rounded up', `${t.stored}`],
      ],
      { at: RIGHT, fontSize: SIZE, title: `Why ${p.rows} rows` },
    );
    this.state.why = { used, free: p.free, lower: p.lower, upper: p.upper, heapFree: p.heapFree, needs: t.stored, unrounded: t.lpLen };

    // ------------------------------------------------------------------ compare
    const all = (['int4', 'int8', 'int4-text', 'int8-text'] as Column[]).map((k) => scenarioOf(k, 100));
    const [i4, , i4t, i8t] = all as [Scenario, Scenario, Scenario, Scenario];
    await this.step('compare', {
      title: `int4 and int8 fill ${i4.pagesFor10000} pages alike; with text after them, ${i4t.pagesFor10000} and ${i8t.pagesFor10000}`,
      line: `Both integer rows take ${i4.tuple.perRow} bytes; with text, ${i4t.tuple.perRow} and ${i8t.tuple.perRow}.`,
      caption: `Each line is a table of 10 000 rows, as measured on Postgres 18.6. int4 and int8 rows both take ${i4.tuple.perRow} bytes, so both tables take ${i4.pagesFor10000} pages. Put an ${TEXT_CHARS}-character text column after the integer and the padding is used up differently: the int8 table takes ${i8t.pagesFor10000} pages to the int4 table’s ${i4t.pagesFor10000}. Whether a narrower type saves space depends on where the 8-byte boundaries fall.`,
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
      { at: regionBox('full', { top: 2.6, bottom: -3.6 }), fontSize: 0.42, title: '10 000 rows' },
    );
    await compareCard.mark(c.label, { as: 'this scenario' });
    this.state.compare = Object.fromEntries(
      all.map((x) => [x.column, { perRow: x.tuple.perRow, rows: x.page.rows, pages: x.pagesFor10000 }]),
    );
  }
}

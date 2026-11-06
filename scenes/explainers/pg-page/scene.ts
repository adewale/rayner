import { Scene, FadeOut, Create, view } from '../../../src/index.ts';
import type { Box, Group, View, SceneState } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card, mermaid, answerOf } from '../../../explain/index.ts';
import type { Diagram, CardRow, CardOptions } from '../../../explain/index.ts';
import { callout } from '../../../explain/drawing.ts';
import {
  BLCKSZ,
  COLUMNS,
  LINE_POINTER,
  PAGE_HEADER,
  SWAP,
  TEXT_CHARS,
  TUPLE_HEADER,
  scenarioOf,
  percent,
} from './model.ts';
import type { Scenario, Column, Share } from './model.ts';
import { AT, CELL, COLORS, SIZE, SMALL, drawEmptyFree, drawFirstRow, drawKeyGroup, drawPage, drawPair, drawTupleGrid, gridWords, tupleOf } from './picture.ts';
import type { TupleState } from './picture.ts';

// Sources, all at postgres/postgres tag REL_18_6; lines are quoted in lib/pg-page.ts and
// model.test.ts, which also freezes the measurements on Postgres 18.6.
const PG = 'https://github.com/postgres/postgres/blob/REL_18_6/src/';
const STYLE = 'pen-and-ink';

const SLICES: { key: keyof Share; name: string }[] = [
  { key: 'data', name: 'Row data' },
  { key: 'headers', name: 'Tuple headers' },
  { key: 'padding', name: 'Alignment padding' },
  { key: 'pointers', name: 'Line pointers' },
  { key: 'pageHeader', name: 'Page header' },
  { key: 'free', name: 'Free space' },
  { key: 'reserved', name: 'Fillfactor reserve' },
];
const CONFIG = {
  pie: { legendPosition: 'right', textPosition: 0.72 },
  themeVariables: {
    ...Object.fromEntries(SLICES.map((s, i) => [`pie${i + 1}`, COLORS[s.key]])),
    pieLegendTextSize: '17px',
    pieSectionTextSize: '15px',
    pieTitleTextSize: '18px',
  },
};
const pieTitle = (c: { label: string }) => `One page of ${c.label} rows`;
/** The pie of a full page. A slice of 0 bytes is left out: Mermaid draws no zero slice, and mermaid.pie refuses one. */
const pie = (c: { label: string; share: Share }) =>
  mermaid.pie(
    SLICES.filter((s) => c.share[s.key] > 0).map((s) => ({ label: s.name, value: c.share[s.key] })),
    { title: pieTitle(c), showData: true, config: CONFIG },
  );

/** What the steps record, accumulated: the fields the views below draw from. */
interface PgState {
  column: Column;
  empty: { lower: number; upper: number; free: number };
  pair: { label: string; valueBytes: string }[];
  row: { lpOff: number; lpLen: number; hoff: number; stored: number; perRow: number; lower: number; upper: number };
  tuple: TupleState;
  tuples: [TupleState, TupleState];
  full: { rows: number; share: Share };
  why: { used: number; free: number; lower: number; upper: number; heapFree: number; needs: number; unrounded: number };
  compare: Record<Column, { perRow: number; rows: number; pages: number }>;
}

const PIE_BOX: Box = [-7.55, -4.25, 1.75, 3.25];
const WIDE_PIE: Box = [-7.55, -4.25, 7.55, 3.0];
const RIGHT: Box = [1.95, -4.1, 7.55, 3.1];
// The first two steps draw the page on the left and the tuple on the right.
const ROW_RIGHT: Box = [-0.9, -4.1, 7.55, 3.1];

export default class PgPageExplainer extends Scene {
  static meta = {
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
    // The sentences that reach beyond the rows on screen, and the tests that hold them.
    claims: [
      {
        says: 'every page starts with a 24-byte header',
        test: 'model.test.ts: the page header, line pointer and tuple header sizes',
      },
      {
        says: 'Postgres gives every tuple a multiple of 8 bytes',
        test: 'model.test.ts: stored in a multiple of MAXALIGN',
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
    const answer = answerOf(this);
    const values = settingsOf(this);
    const column = values.column as Column;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const colours = { ink: s.palette.ink, soft: s.soft, paper: s.palette.paper };
    const c = scenarioOf(column, 100),
      w = scenarioOf(SWAP[column], 100),
      t = c.tuple;
    // The opening's pair, narrow integer first: int4 against int8, with or without the text after it.
    const [narrow, wide] = column.startsWith('int4') ? [c, w] : [w, c];
    const isText = column !== 'int4' && column !== 'int8';

    /** The scene's state, as the steps record it. */
    const st = () => this.state as unknown as PgState;
    /** A card drawn from the state: a view that builds it from `rows(state)`, so check holds it to the state. */
    const cardOf = (rows: (st: PgState) => readonly CardRow[], opts: CardOptions | ((st: PgState) => CardOptions)): View<Card> =>
      view(
        this,
        (state) => {
          const st = state as unknown as PgState;
          return new Card(this, s.palette, rows(st), typeof opts === 'function' ? opts(st) : opts);
        },
        { place: false },
      );
    /** Enter a card view as s.card enters a card, described as the card describes itself. */
    const enterCard = (card: View<Card>) => s.enter(card, { runTime: 0.35, shift: [0, -0.08] });
    this.state.column = column;

    // ------------------------------------------------------------------ the question, on an empty page
    // The page's outline, header and size are the same in every scenario (picture.ts).
    const { outline, header, headerLabel, pageSize } = drawPage(colours);
    const pageWords = () =>
      `An 8192-byte page drawn top to bottom, not to scale: a ${PAGE_HEADER}-byte header, then free space` +
      (st().tuple
        ? `, then one ${LINE_POINTER}-byte line pointer under the header and one ${st().tuple.stored}-byte tuple at the very end of the page.`
        : '.');
    const valueBytes = (x: Scenario) => (x.column.endsWith('text') ? `${x.tuple.data - TEXT_CHARS - 1} + ${TEXT_CHARS + 1}` : `${x.tuple.data}`);
    await this.step('page', {
      title: `Do ${narrow.label} rows fit more on a page than ${wide.label} rows?`,
      line: `Predict: ${narrow.label} saves 4 bytes a row. How many more rows fit in this page?`,
      // bufpage.h:121-122 "pd_lower - offset to start of free space", "pd_upper - offset to end of free space";
      // bufpage.c:55-57 PageInit sets pd_lower = SizeOfPageHeaderData and pd_upper = pageSize - specialSize (0 for a table).
      caption: `Postgres stores a table in pages of ${BLCKSZ} bytes, and every page starts with a ${PAGE_HEADER}-byte header, so an empty page has ${BLCKSZ - PAGE_HEADER} bytes free. A common way to save space is to declare an integer column int4 rather than int8 (bigint): 4 bytes a value instead of 8${isText ? `, here followed by an ${TEXT_CHARS}-character text column` : ''}. Predict how many more ${narrow.label} rows than ${wide.label} rows fit on one page.`,
    });
    this.state.empty = { lower: PAGE_HEADER, upper: BLCKSZ, free: BLCKSZ - PAGE_HEADER };
    // The two value sizes the question compares, narrow integer first.
    this.state.pair = [narrow, wide].map((x) => ({ label: x.label, valueBytes: valueBytes(x) }));
    // The free space the empty page records, said in it.
    const freeLabel = view(this, (state) => drawEmptyFree((state as unknown as PgState).empty.free, colours), { place: false });
    await s.enter(outline, header, headerLabel, freeLabel, pageSize, { describe: pageWords });
    /** A callout drawn from the state, drawn in as s.callout draws one. */
    const calloutOf = async (draw: (st: PgState) => Group) => {
      const v = view(this, (state) => draw(state as unknown as PgState), { place: false });
      s.keep(v);
      await this.play(new Create(v, { runTime: 0.6, lagRatio: 0.15 }));
      return v;
    };
    // pd_lower and pd_upper, said where they point: the free space's top and bottom edges.
    const lowerAt = ([x, y]: readonly [number, number], value: (st: PgState) => number) =>
      calloutOf((st) => callout(s, [x, y], `pd_lower ${value(st)}`, { side: 'below', gap: 0.35, size: SMALL }));
    const upperAt = ([x, y]: readonly [number, number], value: (st: PgState) => number) =>
      calloutOf((st) => callout(s, [x, y], `pd_upper ${value(st)}`, { side: 'above', gap: 0.45, size: SMALL }));
    const emptyMarks = [await lowerAt(AT.emptyLower, (st) => st.empty.lower), await upperAt(AT.emptyUpper, (st) => st.empty.upper)];
    const question = cardOf(
      (state) => [...state.pair.map((x) => [`${x.label}, value bytes`, x.valueBytes] as [string, string]), ['Rows a page', '?']],
      { at: ROW_RIGHT, fontSize: SIZE, title: 'Two ways to store the same rows' },
    );
    await enterCard(question);

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
    this.state.row = {
      lpOff: BLCKSZ - t.stored,
      lpLen: t.lpLen,
      hoff: t.hoff,
      stored: t.stored,
      perRow: t.perRow,
      lower: PAGE_HEADER + LINE_POINTER,
      upper: BLCKSZ - t.stored,
    };
    // The tuple byte by byte, which the grid and its colour key draw.
    this.state.tuple = tupleOf(c);
    // The first row on the page, from what the row step records; a tuple byte by byte, eight to a line,
    // and its colour key (picture.ts).
    const GX = ROW_RIGHT[0] + 0.75,
      GY = ROW_RIGHT[3] - 0.15;
    // The answer step moves this row's grid left, to make room for the other type's; where it sits is what is shown.
    const LX = -5.9,
      RX = 1.7,
      TOP = 2.35;
    const rowAt = (shown: SceneState): [number, number] => (shown.grid === 'left' ? [LX, TOP] : [GX, GY]);
    const row = view(this, (state) => drawFirstRow((state as unknown as PgState).row, colours), { place: false });
    const mine = view(this, (state, shown) => drawTupleGrid((state as unknown as PgState).tuple, ...rowAt(shown), colours), { place: false });
    const keys = view(this, (state) => drawKeyGroup((state as unknown as PgState).tuple, GX + 8 * CELL + 0.45, GY - 0.25, colours), {
      place: false,
    });
    await s.enter(row, { describe: pageWords });
    await s.enter(mine, keys, { describe: () => gridWords(st().tuple) });
    // pageinspect on Postgres 18.6 (heap_page_items and page_header of block 0 after one insert),
    // each value said where it points: the new free-space edges, the pointer's target and the data's start.
    const byte = (v: View, x: TupleState, i: number) => v.current.family().find((m) => m.key === `pg-byte:${x.column}:${i}`)!;
    const rowMarks = [
      await lowerAt(AT.rowLower, (st) => st.row.lower),
      await upperAt(AT.rowUpper(st().row.stored), (st) => st.row.upper),
    ];
    rowMarks.push(
      await calloutOf((st) => callout(s, AT.link(st.row.stored), `lp_off ${st.row.lpOff}, lp_len ${st.row.lpLen}`, { side: 'right', gap: 0.3, size: SMALL })),
    );
    // Under the byte where the data starts, in the row's grid.
    const hoffMark = await calloutOf((st) => {
      const start = byte(mine, st.tuple, st.row.hoff);
      return callout(s, start, `t_hoff ${st.row.hoff}: data starts here`, {
        side: 'below',
        gap: start.box()![1] - (GY - (st.tuple.stored / 8) * CELL) + 0.35,
        size: SMALL,
      });
    });

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
      caption: `${answer}. ${swapWhy} ${
        same
          ? `So an ${c.label} row and an ${w.label} row both cost ${t.perRow} bytes, and a full page holds ${c.page.rows} of either: none more.`
          : `So a full page holds ${narrow.page.rows} ${narrow.label} rows and ${wide.page.rows} ${wide.label} rows: ${more} more.`
      }`,
    });
    // The page gives way; this row's grid moves left and the other type's grid appears beside it.
    await this.play(
      ...[outline, header, headerLabel, pageSize, row, keys, ...rowMarks, hoffMark].map((m) => new FadeOut(m, { runTime: 0.3 })),
    );
    this.state.swap = {
      from: column,
      to: w.column,
      rows: [c.page.rows, w.page.rows],
      perRow: [t.perRow, w.tuple.perRow],
    };
    // Both tuples byte by byte, this scenario's first, which the two grids and their keys draw.
    this.state.tuples = [tupleOf(c), tupleOf(w)];
    await this.play(mine.animate.shift([LX - GX, TOP - GY]), { runTime: 0.6 });
    this.shown.grid = 'left';
    /** The titles and keys of both tuples, with the other type's grid on the right. */
    const pair = view(this, (state) => drawPair((state as unknown as PgState).tuples, LX, RX, TOP, colours), { place: false });
    await s.enter(pair, { describe: () => `${gridWords(st().tuples[0])} ${gridWords(st().tuples[1])}` });
    // Where the two differ: the bytes one type uses for its value and the other leaves as padding.
    const [ours, other] = st().tuples;
    const differ = ours.bytes.flatMap((b, i) => (other.bytes[i] !== b ? [i] : []));
    if (differ.length) {
      const first = differ[0]!;
      const here = byte(mine, ours, first),
        there = byte(pair, other, first);
      await s.callout(here, ours.bytes[first] === 'padding' ? 'padding here' : `${ours.label}’s value`, {
        side: 'below',
        gap: here.box()![1] - (TOP - (ours.stored / 8) * CELL) + 0.3,
        size: SMALL,
      });
      await s.callout(there, other.bytes[first] === 'padding' ? 'padding here' : `${other.label}’s value here`, {
        side: 'below',
        gap: there.box()![1] - (TOP - (other.stored / 8) * CELL) + 0.3,
        size: SMALL,
      });
    }

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
    this.state.full = { rows: p.rows, share: sh };
    /** The full page's pie, from the share the full step records. */
    const fullPie = () => pie({ label: COLUMNS[st().column].label, share: st().full.share });
    // The whole stage for the pie, so its narrow slices have room for their labels.
    let d: Diagram = await s.show({ source: fullPie() }, { box: WIDE_PIE });

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
    this.state.why = { used, free: p.free, lower: p.lower, upper: p.upper, heapFree: p.heapFree, needs: t.stored, unrounded: t.lpLen };
    d = await s.show({ source: fullPie() }, { box: PIE_BOX });
    await d.mark(['slice:Free space'], { as: 'too small for another row' });
    // The arithmetic, from the full page's row count, the row's cost and what the why step records.
    const why = cardOf(
      (state) => [
        ['Free when empty', `${state.empty.free}`],
        [`${state.full.rows} rows x ${state.row.perRow} bytes`, `${state.why.used}`],
        ['Left', `${state.why.free}`],
        ['pd_lower, pd_upper', `${state.why.lower}, ${state.why.upper}`],
        [`Left less a pointer`, `${state.why.heapFree}`],
        ['Next tuple, unrounded', `${state.why.unrounded}`],
        ['Next tuple, rounded up', `${state.why.needs}`],
      ],
      (state) => ({ at: RIGHT, fontSize: SIZE, title: `Why ${state.full.rows} rows` }),
    );
    await enterCard(why);

    // ------------------------------------------------------------------ compare
    const all = (['int4', 'int8', 'int4-text', 'int8-text'] as Column[]).map((k) => scenarioOf(k, 100));
    const [i4, , i4t, i8t] = all as [Scenario, Scenario, Scenario, Scenario];
    await this.step('compare', {
      title: `int4 and int8 fill ${i4.pagesFor10000} pages alike; with text after them, ${i4t.pagesFor10000} and ${i8t.pagesFor10000}`,
      line: `Both integer rows take ${i4.tuple.perRow} bytes; with text, ${i4t.tuple.perRow} and ${i8t.tuple.perRow}.`,
      caption: `Each line is a table of 10 000 rows, as measured on Postgres 18.6. int4 and int8 rows both take ${i4.tuple.perRow} bytes, so both tables take ${i4.pagesFor10000} pages. Put an ${TEXT_CHARS}-character text column after the integer and the padding is used up differently: the int8 table takes ${i8t.pagesFor10000} pages to the int4 table’s ${i4t.pagesFor10000}. Whether a narrower type saves space depends on where the 8-byte boundaries fall.`,
    });
    await s.clear();
    this.state.compare = Object.fromEntries(
      all.map((x) => [x.column, { perRow: x.tuple.perRow, rows: x.page.rows, pages: x.pagesFor10000 }]),
    );
    // One row per column type, from what the compare step records; the scenario's own row is marked.
    const compareCard = cardOf(
      (state) =>
        (Object.entries(state.compare) as [Column, PgState['compare'][Column]][]).map(
          ([k, x]) => [COLUMNS[k].label, `${x.perRow} bytes a row, ${x.rows} a page, ${x.pages} pages`] as [string, string],
        ),
      (state) => ({
        at: regionBox('full', { top: 2.6, bottom: -3.6 }), fontSize: 0.42, title: '10 000 rows',
        lit: COLUMNS[state.column].label, litAs: 'this scenario',
      }),
    );
    await enterCard(compareCard);
  }
}

import { Group, Rectangle, Text, Arrow } from '../../../src/index.ts';
import type { Box, Vec } from '../../../src/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import { BLCKSZ, LINE_POINTER, PAGE_HEADER, TUPLE_HEADER } from './model.ts';
import type { Column, Scenario, Tuple } from './model.ts';

// Slice colours, in slice order, so the byte grid and the pie use the same ones.
export const COLORS = {
  data: '#d9480f',
  headers: '#9a9087',
  padding: '#e8dcc4',
  pointers: '#3b6ea5',
  pageHeader: '#241f1a',
  free: '#fffdf7',
  reserved: '#7fb08a',
} as const;
/** The size of the words: in the page and on the cards. */
export const SIZE = 0.34;
/** The size of the small words: labels in the page, the grid's offsets and its colour key. */
export const SMALL = 0.28;
/** One byte's square in a tuple's grid. */
export const CELL = 0.52;

/** One tuple as the steps record it: its column, its bytes one by one, and the sizes its key states. */
export interface TupleState {
  column: Column;
  label: string;
  bytes: Tuple['bytes'];
  stored: number;
  padding: number;
  data: number;
}
export const tupleOf = (x: Scenario): TupleState => ({
  column: x.column,
  label: x.label,
  bytes: [...x.tuple.bytes],
  stored: x.tuple.stored,
  padding: x.tuple.padding,
  data: x.tuple.data,
});
/** A column with a text after its integer. */
export const textual = (column: Column) => column !== 'int4' && column !== 'int8';

const small = (words: string, color: string) => new Text(words, { fontSize: SMALL, color, weight: 'normal' });

/**
 * A tuple byte by byte, eight to a line, from (gx, gy) down: every line of the grid is one MAXALIGN
 * unit, so the padding the page adds shows as the rest of the last line. Each byte is keyed by its
 * column and index, so the answer step can point at the byte where the data starts.
 */
export function drawGrid(x: TupleState, gx: number, gy: number, { ink, soft }: { ink: string; soft: string }) {
  const cells = x.bytes.map((kind, i) =>
    keyed(
      new Rectangle({
        width: CELL,
        height: CELL,
        fill: kind === 'header' ? COLORS.headers : kind === 'padding' ? COLORS.padding : COLORS.data,
        stroke: ink,
        strokeWidth: 0.015,
      }).moveTo([gx + (i % 8) * CELL + CELL / 2, gy - Math.floor(i / 8) * CELL - CELL / 2]),
      `pg-byte:${x.column}:${i}`,
    ),
  );
  const offsets = Array.from({ length: x.stored / 8 }, (_, r) =>
    small(`${r * 8}`, soft).moveTo([gx - 0.12, gy - r * CELL - CELL / 2], [1, 0]),
  );
  return { cells, offsets };
}

/** The grid in words: its lines' offsets, then its runs of header, padding and data bytes. */
export function gridWords(x: TupleState): string {
  const runs: string[] = [];
  let i = 0;
  while (i < x.bytes.length) {
    let j = i;
    while (j < x.bytes.length && x.bytes[j] === x.bytes[i]) j++;
    runs.push(`${j - i} ${x.bytes[i]} byte${j - i > 1 ? 's' : ''}`);
    i = j;
  }
  const offsets = Array.from({ length: x.stored / 8 }, (_, r) => `${r * 8}`);
  return `The ${x.label} row’s ${x.stored}-byte tuple in lines of 8 bytes, starting at offsets ${offsets.join(', ')}: ${runs.join(', ')}.`;
}

/** A colour key for one tuple's bytes, from (kx, ky) down: header, padding and value, each with its size. */
export function drawKey(x: TupleState, kx: number, ky: number, { ink }: { ink: string }): Group[] {
  return (
    [
      [COLORS.headers, `header, ${TUPLE_HEADER} bytes`],
      [COLORS.padding, `padding, ${x.padding} byte${x.padding === 1 ? '' : 's'}`],
      [COLORS.data, `${textual(x.column) ? 'values' : 'value'}, ${x.data} bytes`],
    ] as const
  ).map(([color, words], row) => {
    const y = ky - row * 0.62;
    return new Group(
      new Rectangle({ width: 0.3, height: 0.3, fill: color, stroke: ink, strokeWidth: 0.015 }).moveTo([kx, y]),
      small(words, ink).moveTo([kx + 0.3, y], [-1, 0]),
    );
  });
}

/** The stage's colours the page is drawn in. */
export type Ink = { ink: string; soft: string; paper: string };
const text = (words: string, ink: string, opts: { size?: number; color?: string; bold?: boolean } = {}) =>
  new Text(words, { fontSize: opts.size ?? SIZE, color: opts.color ?? ink, weight: opts.bold ? 'bold' : 'normal' });

// ---- the page, as bufpage.h:28-44 draws it: header, line pointers growing down, tuples growing up.
const PAGE: Box = [-7.2, -4.0, -2.0, 3.0];
const pw = PAGE[2] - PAGE[0],
  ph = PAGE[3] - PAGE[1];
const HEADER_H = 0.6,
  ROW_H = 0.55;
const box = (x0: number, y0: number, x1: number, y1: number, fill: string, stroke: string) =>
  new Rectangle({ width: x1 - x0, height: y1 - y0, fill, stroke, strokeWidth: 0.02 }).moveTo([
    (x0 + x1) / 2,
    (y0 + y1) / 2,
  ]);
// The pointer sits under the header; the tuple fills the last bytes of the page.
// Widths in the two strips share one scale, so the pointer is an eighth of an int4 tuple.
const perByte = (pw - 0.2) / 48;
const tupleWidth = (stored: number) => stored * perByte;
const linkAt = (stored: number): [Vec, Vec] => [
  [PAGE[0] + (LINE_POINTER * perByte) / 2, PAGE[3] - HEADER_H - ROW_H - 0.05],
  [PAGE[2] - tupleWidth(stored) + 0.3, PAGE[1] + ROW_H + 0.05],
];
const mid = PAGE[0] + pw / 2;

/** The page's outline, header and size, the same in every scenario. */
export function drawPage({ ink, soft, paper }: Ink) {
  const outline = box(PAGE[0], PAGE[1], PAGE[2], PAGE[3], COLORS.free, ink);
  const header = box(PAGE[0], PAGE[3] - HEADER_H, PAGE[2], PAGE[3], COLORS.pageHeader, ink);
  const headerLabel = text(`page header, ${PAGE_HEADER} bytes`, ink, { size: SMALL, color: paper }).moveTo([
    PAGE[0] + pw / 2,
    PAGE[3] - HEADER_H / 2,
  ]);
  const pageSize = text(`${BLCKSZ} bytes`, ink, { size: SMALL, color: soft }).moveTo([PAGE[0] + pw / 2, PAGE[1] - 0.22]);
  return { outline, header, headerLabel, pageSize };
}
/** The free space an empty page records, said in it. */
export const drawEmptyFree = (free: number, { ink, soft }: Ink) =>
  text(`${free} bytes free`, ink, { color: soft }).moveTo([PAGE[0] + pw / 2, PAGE[1] + ph * 0.45]);

/** Where the page's offsets point: the free space's top and bottom edges, empty and after one row, and along the link. */
export const AT = {
  emptyLower: [mid, PAGE[3] - HEADER_H] as Vec,
  emptyUpper: [mid, PAGE[1]] as Vec,
  rowLower: [mid, PAGE[3] - HEADER_H - ROW_H] as Vec,
  rowUpper: (stored: number): Vec => [PAGE[2] - tupleWidth(stored) / 2, PAGE[1] + ROW_H],
  /** A point 30% along the link from the pointer to its tuple. */
  link: (stored: number): Vec => {
    const [l0, l1] = linkAt(stored);
    return [l0[0] + 0.3 * (l1[0] - l0[0]), l0[1] + 0.3 * (l1[1] - l0[1])];
  },
};

/** The first row on the page: its pointer, its tuple, the link and what is left free. */
export function drawFirstRow(row: { stored: number; lower: number; upper: number }, { ink, soft, paper }: Ink) {
  const pointer = box(
    PAGE[0],
    PAGE[3] - HEADER_H - ROW_H,
    PAGE[0] + LINE_POINTER * perByte,
    PAGE[3] - HEADER_H,
    COLORS.pointers,
    ink,
  );
  const pointerLabel = text(`line pointer, ${LINE_POINTER} bytes`, ink, { size: SMALL }).moveTo(
    [pointer.box()![2] + 0.15, PAGE[3] - HEADER_H - ROW_H / 2],
    [-1, 0],
  );
  const tupleW = tupleWidth(row.stored);
  const tupleBox = box(PAGE[2] - tupleW, PAGE[1], PAGE[2], PAGE[1] + ROW_H, COLORS.data, ink);
  const tupleLabel = text(`tuple, ${row.stored} bytes`, ink, { size: SMALL, color: paper }).moveTo(tupleBox.center());
  const [from, to] = linkAt(row.stored);
  const link = new Arrow(from, to, { stroke: ink, strokeWidth: 0.025, tipLength: 0.18 });
  const free = text(`${row.upper - row.lower} bytes free`, ink, { color: soft }).moveTo([
    PAGE[0] + pw / 2 + 0.5,
    PAGE[1] + ph * 0.42,
  ]);
  return new Group(pointer, pointerLabel, tupleBox, tupleLabel, link, free);
}

/** A tuple's grid, its cells then its offsets, as one picture. */
export function drawTupleGrid(x: TupleState, gx: number, gy: number, colours: { ink: string; soft: string }) {
  const g = drawGrid(x, gx, gy, colours);
  return new Group(...g.cells, ...g.offsets);
}
/** A tuple's colour key as one picture. */
export const drawKeyGroup = (x: TupleState, kx: number, ky: number, colours: { ink: string }) => new Group(...drawKey(x, kx, ky, colours));

/**
 * The answer step's pair: both tuples' titles over their grids at `lx` and `rx` (the left grid drawn elsewhere),
 * the other type's grid on the right, and both keys on one line under the longer grid.
 */
export function drawPair([x, y]: readonly [TupleState, TupleState], lx: number, rx: number, top: number, colours: Ink) {
  const { ink, soft } = colours;
  const titleOf = (t: TupleState, gx: number) =>
    text(`${t.label}: ${t.stored}-byte tuple`, ink, { bold: true }).moveTo([gx + 4 * CELL, top + 0.4]);
  const below = (t: TupleState) => top - (t.stored / 8) * CELL - 1.25;
  const keyY = Math.min(below(x), below(y));
  const theirs = drawGrid(y, rx, top, { ink, soft });
  return new Group(titleOf(x, lx), titleOf(y, rx), ...drawKey(x, lx + 0.15, keyY, { ink }), ...theirs.cells, ...theirs.offsets, ...drawKey(y, rx + 0.15, keyY, { ink }));
}

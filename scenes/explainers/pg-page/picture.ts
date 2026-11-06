import { Group, Rectangle, Text } from '../../../src/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import { TUPLE_HEADER } from './model.ts';
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

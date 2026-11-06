import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { BLCKSZ, LINE_POINTER, PAGE_HEADER, SWAP, TEXT_CHARS, scenarioOf } from '../../../scenes/explainers/lib/pg-page.ts';
import type { Column } from '../../../scenes/explainers/lib/pg-page.ts';

/** Every scenario's step state equals the model's page for its column, at the default fillfactor, 100. */
export function check(trace: Trace, values: Record<string, string>): void {
  const column = values.column as Column;
  const c = scenarioOf(column, 100),
    w = scenarioOf(SWAP[column], 100),
    t = c.tuple,
    p = c.page;
  // A tuple as the views draw it: its column, its bytes one by one, and the sizes its colour key states.
  const tupleOf = (x: typeof c) => ({
    column: x.column,
    label: x.label,
    bytes: x.tuple.bytes,
    stored: x.tuple.stored,
    padding: x.tuple.padding,
    data: x.tuple.data,
  });
  // The question card is a view of the two value sizes, narrow integer first; the compare card marks the scenario's column.
  const [narrow, wide] = column.startsWith('int4') ? [c, w] : [w, c];
  const valueBytes = (x: typeof c) => (x.column.endsWith('text') ? `${x.tuple.data - TEXT_CHARS - 1} + ${TEXT_CHARS + 1}` : `${x.tuple.data}`);
  assertStepState(trace, 'page', {
    column,
    empty: { lower: PAGE_HEADER, upper: BLCKSZ, free: BLCKSZ - PAGE_HEADER },
    pair: [narrow, wide].map((x) => ({ label: x.label, valueBytes: valueBytes(x) })),
  });
  // The first row's line pointer and tuple, as pageinspect reports them.
  assertStepState(trace, 'row', {
    row: {
      lpOff: p.offsets[0],
      lpLen: t.lpLen,
      hoff: t.hoff,
      stored: t.stored,
      perRow: t.perRow,
      lower: PAGE_HEADER + LINE_POINTER,
      upper: p.offsets[0],
    },
    // The byte grid and its key are a view of the tuple the step records.
    tuple: tupleOf(c),
  });
  assertStepState(trace, 'full', { full: { rows: p.rows, share: c.share } });
  assertStepState(trace, 'why', {
    why: { used: p.rows * t.perRow, free: p.free, lower: p.lower, upper: p.upper, heapFree: p.heapFree, needs: t.stored, unrounded: t.lpLen },
  });
  // The two tuples side by side, byte for byte; the other type's pie and the fillfactor step are gone.
  assertStepState(trace, 'swap', {
    swap: { from: column, to: SWAP[column], rows: [p.rows, w.page.rows], perRow: [t.perRow, w.tuple.perRow] },
    // Both grids, titles and keys are views of the two tuples the step records, this scenario's first.
    tuples: [tupleOf(c), tupleOf(w)],
  });
  assertStepState(trace, 'compare', {
    compare: Object.fromEntries(
      (['int4', 'int8', 'int4-text', 'int8-text'] as Column[]).map((k) => {
        const x = scenarioOf(k, 100);
        return [k, { perRow: x.tuple.perRow, rows: x.page.rows, pages: x.pagesFor10000 }];
      }),
    ),
  });
}

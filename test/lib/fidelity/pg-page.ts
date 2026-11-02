import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { BLCKSZ, LINE_POINTER, PAGE_HEADER, SWAP, caseOf } from '../../../scenes/explainers/lib/pg-page.ts';
import type { Column } from '../../../scenes/explainers/lib/pg-page.ts';

/** Every case's step state equals the model's page for its column, at the default fillfactor, 100. */
export function check(trace: Trace, values: Record<string, string>): void {
  const column = values.column as Column;
  const c = caseOf(column, 100),
    w = caseOf(SWAP[column], 100),
    t = c.tuple,
    p = c.page;
  assertStepState(trace, 'page', { empty: { lower: PAGE_HEADER, upper: BLCKSZ, free: BLCKSZ - PAGE_HEADER } });
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
  });
  assertStepState(trace, 'full', { full: { rows: p.rows, share: c.share } });
  assertStepState(trace, 'why', {
    why: { used: p.rows * t.perRow, free: p.free, lower: p.lower, upper: p.upper, heapFree: p.heapFree, needs: t.stored },
  });
  // The two tuples side by side, byte for byte; the other type's pie and the fillfactor step are gone.
  assertStepState(trace, 'swap', {
    swap: { from: column, to: SWAP[column], rows: [p.rows, w.page.rows], perRow: [t.perRow, w.tuple.perRow] },
  });
  assertStepState(trace, 'compare', {
    compare: Object.fromEntries(
      (['int4', 'int8', 'int4-text', 'int8-text'] as Column[]).map((k) => {
        const x = caseOf(k, 100);
        return [k, { perRow: x.tuple.perRow, rows: x.page.rows, pages: x.pagesFor10000 }];
      }),
    ),
  });
}

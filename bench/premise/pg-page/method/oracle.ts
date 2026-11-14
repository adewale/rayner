// The oracle: measurements from a real Postgres 18.6 server (Docker postgres:18, 64-bit, block_size 8192,
// maximum data alignment 8), copied from scenes/explainers/pg-page/model.test.ts, where they were recorded on
// 2026-10-25 with pageinspect for 10,000 rows of each column at fillfactor 100. The method-only page draws its
// closing table from these values, and method.test.ts requires the model to agree with them.
import type { Column } from '../../../../scenes/explainers/pg-page/model.ts';

export interface Measured {
  /** Rows on block 0 (count of heap_page_items). */
  rows: number;
  /** page_header: pd_lower and pd_upper of block 0. */
  lower: number;
  upper: number;
  /** pg_class.relpages after VACUUM for 10,000 rows. */
  pages: number;
  /** heap_page_items: lp_len, t_hoff and length(t_data) of every tuple. */
  lpLen: number;
  hoff: number;
  data: number;
  /** lp_off of the first tuple. */
  firstOff: number;
}

export const MEASURED: Record<Column, Measured> = {
  int4: { rows: 226, lower: 928, upper: 960, pages: 45, lpLen: 28, hoff: 24, data: 4, firstOff: 8160 },
  int8: { rows: 226, lower: 928, upper: 960, pages: 45, lpLen: 32, hoff: 24, data: 8, firstOff: 8160 },
  'int4-text': { rows: 185, lower: 764, upper: 792, pages: 55, lpLen: 40, hoff: 24, data: 16, firstOff: 8152 },
  'int8-text': { rows: 157, lower: 652, upper: 656, pages: 64, lpLen: 44, hoff: 24, data: 20, firstOff: 8144 },
};

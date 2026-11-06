import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NARROW15, ONE, SMALL_INT, TWO, WIDE15 } from './answers.ts';
import { fc, params } from '../lib/pbt.ts';
import { BLCKSZ, COLUMNS, INT4, INT8, LINE_POINTER, MAX_HEAP_TUPLES_PER_PAGE, MAX_HEAP_TUPLE_SIZE, PAGE_HEADER, TUPLE_HEADER, scenarioOf, fill, heapFreeSpace, percent, reserveFor, shortText, total, tuple } from './model.ts';
import type { Attr, Column } from './model.ts';

test('the check answers’ wording: each changed row costs what its comparison row costs', () => {
  assert.equal(TWO.perRow, ONE.perRow);
  assert.equal(SMALL_INT.perRow, ONE.perRow);
  assert.equal(NARROW15.perRow, WIDE15.perRow);
});

// ---------------------------------------------------------------- measured on a real server
// Measured on 2026-10-25 with Docker image postgres:18
// (postgres@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6, linux/arm64):
// "PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on aarch64-unknown-linux-gnu, ... 64-bit", block_size 8192,
// pg_controldata "Maximum data alignment: 8". For each table: CREATE TABLE ... WITH (fillfactor = N);
// INSERT ... SELECT g[, 'hello world'] FROM generate_series(1, 10000) g; VACUUM (ANALYZE); then
// pageinspect's page_header(get_raw_page(t, 0)), count(*) of heap_page_items for blocks 0 and 1,
// pg_class.relpages and pg_relation_size(t) / 8192 (always equal to relpages here).
const MEASURED: Record<string, { column: Column; ff: number; rows: number; lower: number; upper: number; pages: number }> = {
  i4_100: { column: 'int4', ff: 100, rows: 226, lower: 928, upper: 960, pages: 45 },
  i8_100: { column: 'int8', ff: 100, rows: 226, lower: 928, upper: 960, pages: 45 },
  tx_100: { column: 'int4-text', ff: 100, rows: 185, lower: 764, upper: 792, pages: 55 },
  i8tx_100: { column: 'int8-text', ff: 100, rows: 157, lower: 652, upper: 656, pages: 64 },
  i4_70: { column: 'int4', ff: 70, rows: 158, lower: 656, upper: 3136, pages: 64 },
  i8_70: { column: 'int8', ff: 70, rows: 158, lower: 656, upper: 3136, pages: 64 },
  tx_70: { column: 'int4-text', ff: 70, rows: 129, lower: 540, upper: 3032, pages: 78 },
  i8tx_70: { column: 'int8-text', ff: 70, rows: 109, lower: 460, upper: 2960, pages: 92 },
};

// heap_page_items(get_raw_page(t, 0)) at fillfactor 100: [lp, lp_off, lp_len, t_hoff, length(t_data)].
const ITEMS: Record<Column, [number, number, number, number, number][]> = {
  int4: [
    [1, 8160, 28, 24, 4],
    [2, 8128, 28, 24, 4],
    [226, 960, 28, 24, 4],
  ],
  int8: [
    [1, 8160, 32, 24, 8],
    [2, 8128, 32, 24, 8],
    [226, 960, 32, 24, 8],
  ],
  'int4-text': [
    [1, 8152, 40, 24, 16],
    [2, 8112, 40, 24, 16],
    [185, 792, 40, 24, 16],
  ],
  'int8-text': [
    [1, 8144, 44, 24, 20],
    [2, 8096, 44, 24, 20],
  ],
};

// ---------------------------------------------------------------- properties of the rules
const attr = fc.oneof(fc.constant(INT4), fc.constant(INT8), fc.integer({ min: 0, max: 126 }).map(shortText));

const attrs = fc.array(attr, { minLength: 0, maxLength: 12 });

// ---------------------------------------------------------------- the source's own sizes
test('the page header, line pointer and tuple header sizes are the sums of their C fields', () => {
  // postgres REL_18_6 src/include/storage/bufpage.h:160-172, PageHeaderData up to pd_linp
  // (SizeOfPageHeaderData, bufpage.h:218): pd_lsn (PageXLogRecPtr, two uint32), pd_checksum, pd_flags,
  // pd_lower, pd_upper, pd_special, pd_pagesize_version (uint16 each), pd_prune_xid (TransactionId, uint32).
  assert.equal(PAGE_HEADER, 8 + 2 * 6 + 4);
  // itemid.h:25-30: lp_off:15, lp_flags:2, lp_len:15 in one unsigned int.
  assert.equal(LINE_POINTER * 8, 15 + 2 + 15);
  // htup_details.h:152-177 and 185: t_choice (HeapTupleFields: t_xmin, t_xmax, t_cid/t_xvac, 3 x 4 bytes),
  // t_ctid (ItemPointerData, 6 bytes), t_infomask2 and t_infomask (2 each), t_hoff (1); "^ - 23 bytes - ^".
  assert.equal(TUPLE_HEADER, 12 + 6 + 2 + 2 + 1);
  // htup_details.h:615 and 629-631, with MAXALIGN 8 and BLCKSZ 8192.
  assert.equal(MAX_HEAP_TUPLE_SIZE, 8192 - 32);
  assert.equal(MAX_HEAP_TUPLES_PER_PAGE, 291);
  // rel.h:389-390, integer arithmetic: 8192 * 30 / 100 = 2457.6, truncated.
  assert.equal(reserveFor(100), 0);
  assert.equal(reserveFor(70), 2457);
  assert.equal(reserveFor(10), 7372);
});

test('the model gives the measured rows per page, page bounds and table sizes, for every column and fillfactor', () => {
  for (const [table, m] of Object.entries(MEASURED)) {
    const c = scenarioOf(m.column, m.ff);
    assert.deepEqual(
      { rows: c.page.rows, lower: c.page.lower, upper: c.page.upper, pages: c.pagesFor10000 },
      { rows: m.rows, lower: m.lower, upper: m.upper, pages: m.pages },
      table,
    );
  }
});

test('the model gives pageinspect’s line pointers and tuple headers', () => {
  for (const [column, items] of Object.entries(ITEMS) as [Column, (typeof ITEMS)[Column]][]) {
    const c = scenarioOf(column, 100);
    for (const [lp, lpOff, lpLen, hoff, data] of items)
      assert.deepEqual(
        [c.page.offsets[lp - 1], c.tuple.lpLen, c.tuple.hoff, c.tuple.data],
        [lpOff, lpLen, hoff, data],
        `${column} lp ${lp}`,
      );
  }
  // One int4 row in an empty table: pd_lower 28, pd_upper 8160, lp_off 8160.
  const one = fill(tuple([INT4]).stored, 100);
  assert.equal(PAGE_HEADER + LINE_POINTER, 28);
  assert.equal(one.offsets[0], 8160);
  // The stored text: int4 1, then 0x19 (a 1-byte header saying 12 bytes), then 'hello world'.
  assert.equal(shortText(11).len, 12);
  assert.equal((0x19 >> 1) & 0x7f, 12);
});

test('a full int4 page splits as the researcher’s pie did, and every pie sums to the page', () => {
  const sh = scenarioOf('int4', 100).share;
  assert.deepEqual(
    [sh.data, sh.headers, sh.padding, sh.pointers, sh.pageHeader, sh.free].map(percent),
    ['11.0%', '63.5%', '13.8%', '11.0%', '0.3%', '0.4%'],
  );
  for (const column of Object.keys(COLUMNS) as Column[])
    for (const ff of [100, 70]) assert.equal(total(scenarioOf(column, ff).share), BLCKSZ, `${column} at ${ff}`);
  // Agentic Mermaid's legend never says 0.0% of a slice it draws: 4 of 8192 bytes is 0.1%.
  assert.equal(percent(4), '0.1%');
});

test('a tuple is its header, padding and data, stored in a multiple of MAXALIGN with data from t_hoff', () => {
  fc.assert(
    fc.property(attrs, (as: Attr[]) => {
      const t = tuple(as);
      assert.equal(t.hoff % 8, 0);
      assert.equal(t.stored % 8, 0);
      assert.ok(t.stored >= t.lpLen && t.stored - t.lpLen < 8);
      assert.equal(t.header + t.padding + t.data, t.stored);
      assert.equal(t.bytes.length, t.stored);
      assert.equal(t.data, as.reduce((n, a) => n + a.len, 0));
      // Every value starts on its own alignment.
      let at = t.hoff;
      for (const a of as) {
        while (at % a.align) at++;
        at += a.len;
      }
      assert.equal(at, t.lpLen);
    }),
    params(),
  );
});

test('a filled page refuses the next row and took every row before it, and a lower fillfactor never fits more', () => {
  fc.assert(
    fc.property(fc.integer({ min: 3, max: 200 }).map((n) => n * 8), fc.integer({ min: 10, max: 100 }), (stored, ff) => {
      if (stored > MAX_HEAP_TUPLE_SIZE) return;
      const p = fill(stored, ff);
      assert.equal(p.lower, PAGE_HEADER + LINE_POINTER * p.rows);
      assert.equal(p.upper, BLCKSZ - stored * p.rows);
      assert.ok(p.rows <= MAX_HEAP_TUPLES_PER_PAGE);
      // The next row is refused...
      assert.ok(p.target > heapFreeSpace(p.lower, p.upper, p.rows));
      // ...and the last one was accepted (or was the first row on a fresh page).
      if (p.rows > 1) assert.ok(p.target <= heapFreeSpace(p.lower - LINE_POINTER, p.upper + stored, p.rows - 1));
      if (ff > 10) assert.ok(fill(stored, ff - 1).rows <= p.rows);
    }),
    params(),
  );
});

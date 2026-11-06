// How many rows of a small table fit in one Postgres heap page, and where the page's 8192 bytes go.
// Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// Every constant and rule is transcribed from postgres/postgres at tag REL_18_6:
//   src/include/storage/bufpage.h:218   #define SizeOfPageHeaderData (offsetof(PageHeaderData, pd_linp))
//                                       (pd_lsn 8, pd_checksum 2, pd_flags 2, pd_lower 2, pd_upper 2,
//                                       pd_special 2, pd_pagesize_version 2, pd_prune_xid 4: 24 bytes)
//   src/include/storage/itemid.h:25-30  ItemIdData: lp_off:15, lp_flags:2, lp_len:15, one 4-byte word
//   src/include/access/htup_details.h:177  "^ - 23 bytes - ^" above t_bits
//   src/include/access/htup_details.h:185  #define SizeofHeapTupleHeader offsetof(HeapTupleHeaderData, t_bits)
//   src/include/access/htup_details.h:615  MaxHeapTupleSize (BLCKSZ - MAXALIGN(SizeOfPageHeaderData + sizeof(ItemIdData)))
//   src/include/access/htup_details.h:629-631  MaxHeapTuplesPerPage
//   src/backend/access/common/heaptuple.c:1151-1160  heap_form_tuple: header 23 bytes, plus a null bitmap only
//                                       if a value is null, then `hoff = len = MAXALIGN(len)`, then the data
//   src/backend/access/common/heaptuple.c:238-246  a varlena that can take a 1-byte header gets one, with
//                                       no alignment; src/include/varatt.h:257-262 (up to 127 bytes with it)
//   src/backend/storage/page/bufpage.c:310-316  PageAddItemExtended: lower += sizeof(ItemIdData),
//                                       upper -= MAXALIGN(size)
//   src/backend/storage/page/bufpage.c:906-921, 990-1035  PageGetFreeSpace / PageGetHeapFreeSpace:
//                                       upper - lower, less one line pointer; 0 once MaxHeapTuplesPerPage are used
//   src/include/utils/rel.h:360, 389-390  HEAP_DEFAULT_FILLFACTOR 100;
//                                       RelationGetTargetPageFreeSpace = BLCKSZ * (100 - fillfactor) / 100
//   src/backend/access/heap/hio.c:520, 539-553, 702-703  RelationGetBufferForTuple: len = MAXALIGN(len);
//                                       targetFreeSpace = len + saveFreeSpace; use the page if
//                                       targetFreeSpace <= PageGetHeapFreeSpace(page)
//   src/backend/access/heap/hio.c:767, 859-860  otherwise add a page, which needs only room for len
// MAXALIGN is 8 on a 64-bit build: pg_controldata on the measured server prints "Maximum data alignment: 8".
//
// Its limits: heap pages of a 64-bit build, with eight-byte maximum alignment; rows with no null
// values (so no null bitmap) and no later updates or dead tuples; a short text is ASCII with a
// one-byte length header (shortText refuses one that needs four), and longer or compressed values
// are not modelled; columns in the order given; fillfactor only as the reserve hio.c leaves.
// Table sizes are heap pages, not total storage with indexes or other relation files. The page
// counts are checked against a measured Postgres 18.6 server in test/explain-pg-page.test.ts.

import { percent as formatPercent } from '../lib/format.ts';

export const BLCKSZ = 8192;
export const MAXIMUM_ALIGNOF = 8;
export const PAGE_HEADER = 24;
export const LINE_POINTER = 4;
export const TUPLE_HEADER = 23;
export const HEAP_DEFAULT_FILLFACTOR = 100;

const typeAlign = (align: number, n: number) => Math.ceil(n / align) * align;
export const maxalign = (n: number) => typeAlign(MAXIMUM_ALIGNOF, n);
export const MAX_HEAP_TUPLE_SIZE = BLCKSZ - maxalign(PAGE_HEADER + LINE_POINTER);
export const MAX_HEAP_TUPLES_PER_PAGE = Math.floor((BLCKSZ - PAGE_HEADER) / (maxalign(TUPLE_HEADER) + LINE_POINTER));

/** One column value as stored: its length in bytes and the boundary it must start on. */
export interface Attr {
  name: string;
  len: number;
  align: number;
}
/** int4 and int8 are fixed-length and aligned to their size (pg_type typalign 'i' and 'd'). */
export const INT4: Attr = { name: 'int4', len: 4, align: 4 };
export const INT8: Attr = { name: 'int8', len: 8, align: 8 };
/** A short text value: a 1-byte length header, then the bytes, with no alignment. */
export const shortText = (chars: number): Attr => {
  if (chars + 1 > 127) throw new Error('A text value over 126 bytes takes a 4-byte header');
  return { name: 'text', len: 1 + chars, align: 1 };
};
/** The text the scene stores: 'hello world', 11 one-byte characters. */
export const TEXT_CHARS = 11;

export type Column = 'int4' | 'int8' | 'int4-text' | 'int8-text';
export const COLUMNS: Record<Column, { label: string; attrs: readonly Attr[] }> = {
  int4: { label: 'int4', attrs: [INT4] },
  int8: { label: 'int8', attrs: [INT8] },
  'int4-text': { label: 'int4 + text', attrs: [INT4, shortText(TEXT_CHARS)] },
  'int8-text': { label: 'int8 + text', attrs: [INT8, shortText(TEXT_CHARS)] },
};
/** The column the "switch the type" step changes each choice to: the integer's other width. */
export const SWAP: Record<Column, Column> = { int4: 'int8', int8: 'int4', 'int4-text': 'int8-text', 'int8-text': 'int4-text' };

/** One tuple's bytes, as heap_form_tuple lays them out for a row with no nulls. */
export interface Tuple {
  /** The fixed header, 23 bytes. */
  header: number;
  /** t_hoff: where the data starts, the header rounded up to MAXALIGN. */
  hoff: number;
  /** Bytes of the values themselves, including a short text's 1-byte length. */
  data: number;
  /** lp_len: header, alignment padding and data, before the page rounds it up. */
  lpLen: number;
  /** What the page gives the tuple: lp_len rounded up to MAXALIGN. */
  stored: number;
  /** Padding: after the header, before aligned values, and after the data. */
  padding: number;
  /** stored plus the 4-byte line pointer. */
  perRow: number;
  /** Byte by byte from the tuple's start: what each of `stored` bytes is. */
  bytes: ('header' | 'padding' | 'data')[];
}
export function tuple(attrs: readonly Attr[]): Tuple {
  const hoff = maxalign(TUPLE_HEADER);
  const bytes: Tuple['bytes'] = [...Array<'header'>(TUPLE_HEADER).fill('header'), ...Array<'padding'>(hoff - TUPLE_HEADER).fill('padding')];
  let data = 0;
  for (const a of attrs) {
    // Data offsets count from t_hoff, which is maxaligned, so aligning either gives the same bytes.
    const at = typeAlign(a.align, bytes.length);
    while (bytes.length < at) bytes.push('padding');
    for (let i = 0; i < a.len; i++) bytes.push('data');
    data += a.len;
  }
  const lpLen = bytes.length,
    stored = maxalign(lpLen);
  while (bytes.length < stored) bytes.push('padding');
  return { header: TUPLE_HEADER, hoff, data, lpLen, stored, padding: stored - TUPLE_HEADER - data, perRow: stored + LINE_POINTER, bytes };
}

/** The bytes fillfactor asks an insert to leave free on a page (rel.h:389-390), integer arithmetic. */
export const reserveFor = (fillfactor: number) => Math.floor((BLCKSZ * (100 - fillfactor)) / 100);

/** PageGetHeapFreeSpace for a page with `n` line pointers, none unused. */
export function heapFreeSpace(lower: number, upper: number, n: number): number {
  const space = upper - lower;
  if (space < LINE_POINTER) return 0;
  return n >= MAX_HEAP_TUPLES_PER_PAGE ? 0 : space - LINE_POINTER;
}

/** A page filled by single-row inserts of one tuple size, as hio.c and bufpage.c do it. */
export interface Page {
  rows: number;
  /** pd_lower: the end of the line pointers. */
  lower: number;
  /** pd_upper: the start of the tuples. */
  upper: number;
  /** upper - lower once the page refuses the next row. */
  free: number;
  /** saveFreeSpace for this fillfactor. */
  reserve: number;
  /** What the next row asks for: its maxaligned size plus the reserve. */
  target: number;
  /** PageGetHeapFreeSpace when the next row is refused. */
  heapFree: number;
  /** lp_off of each row, first to last. */
  offsets: number[];
}
export function fill(stored: number, fillfactor: number): Page {
  if (!(fillfactor >= 10 && fillfactor <= 100)) throw new Error('fillfactor runs from 10 to 100'); // rel.h:359
  const reserve = reserveFor(fillfactor);
  // hio.c:545-553: past nearly a whole empty page, the target falls back to the row alone.
  const nearlyEmpty = MAX_HEAP_TUPLE_SIZE - Math.floor(MAX_HEAP_TUPLES_PER_PAGE / 8) * LINE_POINTER;
  const target = stored + reserve > nearlyEmpty ? Math.max(stored, nearlyEmpty) : stored + reserve;
  let lower = PAGE_HEADER,
    upper = BLCKSZ,
    rows = 0;
  const offsets: number[] = [];
  // A fresh page takes its first row whatever the reserve (hio.c:767, 860: a new page needs room for the row only).
  while (rows === 0 || target <= heapFreeSpace(lower, upper, rows)) {
    lower += LINE_POINTER;
    upper -= stored;
    offsets.push(upper);
    rows++;
  }
  return { rows, lower, upper, free: upper - lower, reserve, target, heapFree: heapFreeSpace(lower, upper, rows), offsets };
}

/** Where a full page's 8192 bytes go: the slices of the scene's pie, in bytes. */
export interface Share {
  data: number;
  headers: number;
  padding: number;
  pointers: number;
  pageHeader: number;
  /** Free bytes that fillfactor holds back (0 at fillfactor 100). */
  reserved: number;
  /** The rest of the free bytes: too few for another row. */
  free: number;
}
export function share(t: Tuple, p: Page): Share {
  const freeBytes = p.free;
  const reserved = Math.min(p.reserve, freeBytes);
  return {
    data: p.rows * t.data,
    headers: p.rows * t.header,
    padding: p.rows * t.padding,
    pointers: p.rows * LINE_POINTER,
    pageHeader: PAGE_HEADER,
    reserved,
    free: freeBytes - reserved,
  };
}
export const total = (s: Share) => s.data + s.headers + s.padding + s.pointers + s.pageHeader + s.reserved + s.free;

/** Everything the scene says about one column type at one fillfactor. */
export interface Scenario {
  column: Column;
  label: string;
  fillfactor: number;
  tuple: Tuple;
  page: Page;
  share: Share;
  /** Pages for 10 000 rows: every page full but the last. */
  pagesFor10000: number;
}
export function scenarioOf(column: Column, fillfactor: number): Scenario {
  const t = tuple(COLUMNS[column].attrs),
    p = fill(t.stored, fillfactor);
  return { column, label: COLUMNS[column].label, fillfactor, tuple: t, page: p, share: share(t, p), pagesFor10000: Math.ceil(10000 / p.rows) };
}

/** "11.0%": a share of the page to one decimal, as the pie's legend rounds it (a drawn slice shows at least 0.1%). */
export const percent = (bytes: number) => formatPercent(bytes, { of: BLCKSZ, least: 0.1, rounding: 'Math.round' });

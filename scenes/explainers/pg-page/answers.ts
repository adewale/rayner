// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { INT4, INT8, TEXT_CHARS, fill, shortText, tuple } from './model.ts';
import type { Attr } from './model.ts';

const INT2: Attr = { name: 'int2', len: 2, align: 2 };
const rowOf = (attrs: readonly Attr[]) => {
  const tu = tuple(attrs);
  return { ...tu, rows: fill(tu.stored, 100).rows };
};
/** The rows the check answers compare: one and two int4s, an int2, and a 15-character text after an int4 or an int8. */
export const ONE = rowOf([INT4]),
  TWO = rowOf([INT4, INT4]),
  SMALL_INT = rowOf([INT2]),
  T15 = 15,
  NARROW15 = rowOf([INT4, shortText(T15)]),
  WIDE15 = rowOf([INT8, shortText(T15)]);

export const checks = {
  1: () =>
    `No. The first int4 ends at byte ${ONE.lpLen}, and the second fills bytes ${ONE.lpLen} to ${TWO.lpLen - 1}, the padding one int4 leaves. Both tuples take ${ONE.stored} bytes, so both rows cost ${ONE.perRow} and a page holds ${TWO.rows} of either.`,
  2: () =>
    `No. Its tuple is ${SMALL_INT.hoff} + 2 = ${SMALL_INT.lpLen} bytes, which the page rounds up to ${SMALL_INT.stored}, the same as int4’s ${ONE.lpLen}. Both rows cost ${ONE.perRow} bytes and a page holds ${SMALL_INT.rows}.`,
  3: () => ({
    question: `With a ${T15}-character text after the integer instead of an ${TEXT_CHARS}-character one, does int4 still fit more rows than int8?`,
    answer: `No. After an int4 the tuple is ${NARROW15.lpLen} bytes, rounded up to ${NARROW15.stored}; after an int8 it is ${WIDE15.lpLen}, already a multiple of 8. Both rows cost ${NARROW15.perRow} bytes, so the saving the ${TEXT_CHARS}-character text showed disappears.`,
  }),
};

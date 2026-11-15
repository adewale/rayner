// The oracle: CPython 3.15.1's answers (unicodedata.unidata_version 17.0.0), copied from
// scenes/explainers/isdigit/model.test.ts (CPYTHON and CPYTHON_COUNTS), where they were recorded in the
// python:3.15-slim Docker image on 2026-10-25. Each row: isdecimal(), isdigit(), isnumeric(), then int(c):
// the value, or the ValueError's message. The counts are over every code point except the surrogates.
// The method-only page draws its lineup table and its counts from these values, not from the model, and
// method.test.ts requires the model to agree with them.
import type { CharId } from '../../../../scenes/explainers/isdigit/model.ts';

export const CPYTHON: Record<CharId, readonly [boolean, boolean, boolean, number | string]> = {
  ascii: [true, true, true, 3],
  arabic: [true, true, true, 3],
  devanagari: [true, true, true, 3],
  fullwidth: [true, true, true, 3],
  super: [false, true, true, "invalid literal for int() with base 10: '²'"],
  half: [false, false, true, "invalid literal for int() with base 10: '½'"],
  roman: [false, false, true, "invalid literal for int() with base 10: 'Ⅻ'"],
  han: [false, false, true, "invalid literal for int() with base 10: '三'"],
};

export const CPYTHON_COUNTS = { isdecimal: 770, isdigit: 898, isnumeric: 2023, int: 770 } as const;

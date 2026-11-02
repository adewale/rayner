# Script: why can int4 and int8 rows take the same space?

Questions the reader brings: Does choosing int4 over bigint save disk space? How does Postgres lay a row out on a page? Where do the bytes go?

A Postgres table lives in 8192-byte pages, each starting with a 24-byte header, so an empty page has 8168 bytes free. A common way to save space is to declare an integer column int4 instead of int8: 4 bytes a value instead of 8. Ask the reader to commit: how many more int4 rows than int8 rows fit on this page?

Put one int4 row on the page. It costs a 4-byte line pointer under the header and a tuple at the end of the page: a 23-byte header padded to 24, then the 4-byte value, 28 bytes. The page gives every tuple a multiple of 8 bytes on a 64-bit build, so the tuple takes 32, and the row 36. The byte grid, eight bytes to a line, shows it: three lines of header, then a line that is half value, half padding.

Now the answer, as the payoff of that grid: draw the int8 tuple beside it. Its 4 extra bytes land exactly where the int4 tuple had padding, and it is 32 bytes too. So none more: both fill a page at 226 rows.

Why does 4 bytes a row change so little? A full page of int4 rows is 63.5% tuple headers and only 11.0% values: most of a row is overhead, and row 227 fails because 28 bytes, not 32, are left once a pointer is set aside. The last step measures 10 000-row tables on Postgres 18.6: int4 and int8 both take 45 pages. Add an 11-character text column after the integer and the result flips: text needs no alignment, so after an int4 it starts in what was padding (a 40-byte tuple), while after an int8 the tuple is 44 bytes and rounds up to 48: 55 pages against 64.

**The aha:** the two byte grids side by side, the int8's last four orange cells sitting in the int4's four padding cells.

**Sentence to remember:** on a 64-bit build, Postgres gives every tuple a multiple of 8 bytes, so a narrower type saves space only when it moves the tuple below an 8-byte boundary.

**Check questions**, in `meta.checks`, asked after the last step:

1. An int4 row and an int8 row both take 36 bytes of the page. Where do int8's 4 extra bytes go?
2. On a full page of int4 rows, which takes more room: the values or the tuple headers?
3. With an 11-character text column after the integer, why does int8 cost more than int4?

The column setting is the countercase: int4 + text gives the same question a different answer (28 more rows a page). Fillfactor, which the earlier edition explained in a step of its own, is left out: it holds space back for updates and does not bear on the question.

| Step | Script | Reader predicts |
| --- | --- | --- |
| page | paragraph 1: the empty page and the choice | how many more int4 rows fit |
| row | paragraph 2: one row, its pointer and its byte grid | how big the int8 tuple is |
| swap | paragraph 3: the two grids side by side, the answer and the aha | |
| full | paragraph 4: a full page's pie | |
| why | paragraph 4: why row 227 does not fit | |
| compare | paragraph 4: 10 000-row tables, and the text column that flips the result | |

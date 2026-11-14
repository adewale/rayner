# Why can int4 and int8 rows take the same space?

- **Reader:** designs Postgres tables, knows int4 takes four bytes and int8 (bigint) eight, and expects a narrower column to fit more rows on a page; has not looked at how a heap page lays out its bytes.
- **Answer:** On a 64-bit build, Postgres gives every tuple a multiple of 8 bytes
- **Changed condition:** the column: int4, int8, or int4 followed by an eleven-character text. int4 and int8 rows both cost 36 bytes and a page holds 226 of either; with the text after it, the int4 tuple ends at byte 40 and the int8 one at 44, which rounds up to 48, so int4 saves eight bytes a tuple and 28 rows a page (185 against 157).
- **Reader's own work:** predict how many more int4 rows than int8 rows fit on one page before the tuples are compared; switch the column to int8 and to int4 + text; answer the check questions, which ask about a second int4 column, smallint and a fifteen-character text.
- **Checked against:** a real Postgres 18.6 server (Docker `postgres:18`, 64-bit, 8192-byte blocks, maximum alignment 8), measured on 2026-10-25: pageinspect’s page header and `heap_page_items`, rows per page and table sizes in pages for 10,000 rows of each column at fillfactor 100 and 70, all frozen in `model.test.ts`, which also holds the page header, line pointer and tuple header sizes to the sums of their C fields at `REL_18_6`. The check answers’ rows (two int4 columns, smallint, a fifteen-character text) are laid out by the model’s rules in `answers.ts`, not measured.
- **Grounding:** recorded: a Postgres 18.6 server, measured on 2026-10-25
- **Leaves out:** 32-bit builds, null values and the null bitmap, updates and dead tuples, longer or compressed (TOAST) values, text needing a four-byte length header, other column orders, fillfactor reserve as a design choice, and storage beyond heap pages (indexes, the free-space and visibility maps, other relation files).

## Check yourself

1. Would a row with two int4 columns take more page space than a row with one?
   No. The first int4 ends at byte 28, and the second fills bytes 28 to 31, the padding one int4 leaves. Both tuples take 32 bytes, so both rows cost 36 and a page holds 226 of either.
2. Would smallint (int2, 2 bytes) fit more rows on a page than int4?
   No. Its tuple is 24 + 2 = 26 bytes, which the page rounds up to 32, the same as int4’s 28. Both rows cost 36 bytes and a page holds 226.
3. With a 15-character text after the integer instead of an 11-character one, does int4 still fit more rows than int8?
   No. After an int4 the tuple is 44 bytes, rounded up to 48; after an int8 it is 48, already a multiple of 8. Both rows cost 52 bytes, so the saving the 11-character text showed disappears.

## Why this explainer

Declaring a column int4 instead of int8 looks like a way to fit more rows on each page, and for a table of one integer column it saves nothing. The reader should leave knowing where to look instead: where the row’s bytes end relative to an eight-byte boundary, not the type’s width alone. The four bytes int8 adds land exactly where the int4 tuple had four bytes of padding.

The aha is the swap: the two tuples side by side, the same 32 bytes, followed by the full page, where tuple headers take far more of the page than the values do and row 227 would fit if the page did not round its tuple up. The byte grids distinguish a tuple’s logical length from the space the page allocates to it, and the line pointer is drawn as a separate allocation.

The int4 + text scenario is necessary: with integer-only rows the reader would conclude that narrowing a type never helps, and the text shows the case where it does, because the text needs no alignment and starts in what was padding. The closing comparison gives each table’s size for 10,000 rows (45 and 45 pages; 55 and 64 with the text), computed by the model and held by the tests to the sizes measured on the server, so the claim rests on a real server, not only on the model.

The check answers’ numbers were computed from the model (`scenes/explainers/pg-page/model.ts`) when they were written here; if the model changes, recompute them.

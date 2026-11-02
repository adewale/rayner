# Why can int4 and int8 rows take the same space?

An int4 value needs four bytes; an int8, also called bigint, needs eight. It seems that choosing int4 should fit more rows into a Postgres table. Before counting, predict how many more will fit on one page.

The page holds 8192 bytes. Its 24-byte header leaves 8168 bytes for rows and their bookkeeping. Adding a row creates two things: a four-byte line pointer near the beginning of the page, and the row itself, called a tuple, near the end. The line pointer tells Postgres where to find that tuple.

An int4 tuple begins with a 23-byte header, padded to 24 bytes before the value. Add four bytes of data and the tuple is 28 bytes long. On this 64-bit build, the page allocates tuple space in multiples of eight bytes, so those 28 bytes occupy 32. Include the line pointer and the row consumes 36 bytes of the page.

Now replace int4 with int8. The value gains four bytes, but those bytes occupy the four that were padding at the end of the int4 allocation. The tuple reaches 32 bytes exactly. Both rows therefore cost 36 bytes including their pointer, and both fit 226 rows on a page. The value became wider without crossing the next allocation boundary.

The full-page breakdown reveals another reason the type width can be a small part of the bill. For int4 rows, tuple headers occupy 63.5% of the page and the values only 11.0%. After 226 rows, 32 bytes remain free. A new line pointer would consume four, leaving 28 for a tuple that needs 32 allocated bytes. Row 227 cannot fit.

Does this mean int4 never saves space? Add an eleven-character text column after the integer. Its stored form needs twelve bytes and, in this case, can begin immediately after int4, at byte 28. The tuple then ends at byte 40, an allocation boundary. After int8, the text begins at byte 32 and ends at byte 44, which rounds up to 48. The narrower integer now saves eight allocated bytes per tuple.

The measured 10,000-row tables follow the same pattern. Integer-only int4 and int8 tables both use 45 pages. With the text column, they use 55 and 64 pages respectively. Saving bytes in a value saves page space when it changes the surrounding layout enough to cross an allocation boundary.

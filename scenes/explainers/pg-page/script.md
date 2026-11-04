# Why can int4 and int8 rows take the same space?

An int4 value needs four bytes; an int8, also called bigint, needs eight. Declaring a Postgres column int4 instead of int8 looks like a way to fit more rows on each page of a table. Before counting, predict how many more int4 rows fit on one page.

A page holds 8192 bytes. Its 24-byte header leaves 8168 for rows. Each row takes two pieces of that space: a four-byte line pointer near the top of the page, which records where the row is, and the row itself, called a tuple, stored from the bottom of the page upwards.

An int4 tuple starts with a 23-byte header, padded to 24 so that the data begins on an eight-byte boundary. Four bytes of value bring it to 28. On a 64-bit build the page hands out tuple space in multiples of eight bytes, so those 28 bytes occupy 32. With its line pointer, the row costs 36 bytes.

Now make the column int8. The value grows by four bytes, and they land exactly where the int4 tuple had four bytes of padding. The tuple is still 32 bytes, the row still costs 36, and a page holds 226 rows of either type. The answer to the opening question is none: on a 64-bit build Postgres gives every tuple a multiple of 8 bytes, and both tuples round to the same multiple.

The full page shows why the value's width matters so little here. For int4 rows, the tuple headers take 63.5% of the page and the values 11.0%. After 226 rows, 32 bytes are left. Row 227 needs a four-byte pointer, which leaves 28. Its tuple's own header and value come to exactly 28 bytes, so it would fit if the page did not round it up; the 32 it actually needs do not fit.

Does int4 ever save space, then? Put an eleven-character text column after the integer. Text needs no alignment, and this short value takes twelve bytes, one for its length and eleven for the characters. After an int4 it starts at byte 28, in what was padding, and the tuple ends at 40, a multiple of eight. After an int8 it starts at 32 and ends at 44, which rounds up to 48. Now the narrower integer saves eight bytes a tuple and 28 rows a page.

The measured tables agree. On Postgres 18.6, 10,000 int4 rows and 10,000 int8 rows each fill 45 pages; with the text column they fill 55 and 64. These are heap pages only, on a 64-bit build with default settings, for rows with no nulls and no later updates. Narrowing a column saves space only when it moves a tuple below an eight-byte boundary, so the place to look is where the row's bytes end, not the type's width alone.

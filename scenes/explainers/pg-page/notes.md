# Construction and scope

The byte grids distinguish a tuple's logical length from its allocated page space; the pointer is a separate allocation. The text-column scenario is necessary because integer-only rows would leave the mistaken impression that narrowing a type never helps.

The model uses Postgres 18.6 heap pages on a 64-bit build: 8192-byte pages, eight-byte maximum alignment, non-null values and default fillfactor. The short text is eleven ASCII characters with a one-byte length header. The 10,000-row comparisons are heap page counts, not total database storage including indexes or other relation files. Updates, dead tuples, null bitmaps, longer or compressed values and other column orders can change the result. Reserving update space with a different fillfactor is outside this comparison.

Sources: [Postgres 18 page layout](https://www.postgresql.org/docs/18/storage-page-layout.html), [pageinspect](https://www.postgresql.org/docs/18/pageinspect.html), and the [18.6 source](https://github.com/postgres/postgres/tree/REL_18_6/src). `../lib/pg-page.ts` identifies the tuple, alignment and page-allocation rules; model outputs are checked against the measured server.

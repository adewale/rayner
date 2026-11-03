# Author notes

The insert-only teaching model in `../lib/bloom-filter.ts` uses three seeded FNV-1a hashes, not Jason Davies's double-hash implementation or a production filter. With cat and dog inserted, 5 of 16 bits or 6 of 32 are set. The pipeline step reports measured pass rates over 10,000 fixed untaken sample names (268 at 16 bits, 65 at 32). It does not show the independent-uniform-hash estimate `(setBits / size)^3` (about 3.1% and 0.66%); the chosen hashes need not be independent, so the page labels its rates as measured for this sample and these hashes.

The later names fill the sixteen-bit row after 12 names and the thirty-two-bit row after 45. Those counts belong to that particular insertion sequence. The model omits deletion, counting filters, alternative hash counts and sizing for a target false-positive rate. Tests cover insertion and membership invariants over broader names and row lengths; those tests do not make the displayed sample representative of every workload.

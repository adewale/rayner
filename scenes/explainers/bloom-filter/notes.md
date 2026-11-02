# Author notes

The insert-only teaching model in `../lib/bloom-filter.ts` uses three seeded FNV-1a hashes, not Jason Davies's double-hash implementation or a production filter. With cat and dog inserted, 5 of 16 bits or 6 of 32 are set. The scene compares the independent-uniform-hash estimate `(setBits / size)^3` with 10,000 fixed untaken sample names. The actual chosen hashes need not be independent; the estimate is labelled with its assumption.

The later names fill the sixteen-bit row after 12 names and the thirty-two-bit row after 45. Those counts belong to that particular insertion sequence. The model omits deletion, counting filters, alternative hash counts and sizing for a target false-positive rate. Tests cover insertion and membership invariants over broader names and row lengths; those tests do not make the displayed sample representative of every workload.

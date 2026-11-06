# Why does a Bloom filter answer “maybe”?

- **Reader:** a programmer who has heard that a Bloom filter "can give false positives but never false negatives" and wants to see why; knows what a hash function and a bit are.
- **Answer:** A set bit says some name set it, not which
- **Changed condition:** the filter's memory. At 16 bits the untaken wolf finds all three of its bits set by cat and dog and gets maybe, a false positive; at 32 bits it finds a 0 and is ruled out. Over 10,000 untaken sample names, 268 pass the 16-bit row and 65 the 32-bit row; the 16-bit row fills after 12 names, the 32-bit row after 45.
- **Reader's own work:** predict whether wolf gets maybe or definitely not before the answer; switch between 16 and 32 bits; answer the check questions, which add a name to the 32-bit row and clear a departing name's bits.
- **Checked against:** an independent CPython 3.12 FNV-1a in `oracle/fnv.py`, whose hashes of seven strings and three positions for each of six names at 16 and 32 bits are stored in `fixtures/fnv.json`; `model.test.ts` requires the model's hashes, positions and bit owners to equal them, and checks by property tests that an inserted name always passes, that a name passes only when its three bits are set, and that a full row passes every name; `answers.ts` computes the check answers from the model. The sample pass rates are the model's own measurement, compared with nothing external.
- **Leaves out:** deletion and counting filters; other numbers of hash functions; sizing a row for a target false-positive rate; Jason Davies's double-hash implementation and production filters. The pass rates and fill counts hold for these hashes, this sample and this insertion order, not for every workload.

## Check yourself

1. In the 32-bit filter, someone also takes eel, whose hashes are 23, 20 and 1. What does the filter now say about wolf, and about owl?
   wolf gets maybe, a false positive: bit 23 now comes from eel, 22 from cat and 1 from dog and eel. owl still gets definitely not: eel set bit 20, but bits 27 and 13 are still 0.
2. dog closes its account, and to keep the filter tidy someone sets dog’s three bits back to 0. Then cat, still taken, tries to sign in. What does the filter say about cat at 16 bits, and at 32?
   At 16 bits, definitely not: bit 1 was shared, so clearing dog’s bits cleared one of cat’s, and the filter turns away a taken name, which a Bloom filter must never do. At 32 bits it still says maybe, but only because dog’s bits there happen to miss cat’s. The row cannot tell which names set a bit, so clearing a departing name’s bits can erase evidence of another name.

## Why this explainer

A Bloom filter is usually introduced by its guarantee: no false negatives, some false positives. This explainer wants the reader to see why both halves follow from one fact, that a set bit records that some name set it, not which. A sign-up form checking whether a name is taken gives the filter a job the reader feels: every "maybe" is a database read, every "definitely not" is one saved.

The colours exist for the reader, not the filter: they show who set each bit so that the reader can watch wolf be assembled from cat's and dog's bits, and the captions keep saying the row stores only the 1s. Wolf was chosen because it passes the 16-bit row on cat's and dog's bits alone and fails the 32-bit row, so the memory setting changes the conclusion rather than a number.

The pipeline step reports measured pass rates for 10,000 fixed untaken names, labelled as measured for this sample and these hashes; it deliberately does not show the textbook (setBits / size)^3 estimate, because the hashes here need not be independent. The ending fills the row until every bit is 1, because the filter's only evidence was its zeros; how many names that takes depends on where their bits land, so the page gives the counts for this sequence only.

The check questions are there to transfer the mechanism: adding eel shows a false positive appearing, and clearing dog's bits shows why an insert-only filter cannot delete.

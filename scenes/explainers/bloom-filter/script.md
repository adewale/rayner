# Script: why does a Bloom filter answer “maybe”?

Questions the reader brings: What is a Bloom filter? Why can it say “definitely not” but only “maybe” for yes? What does more memory change?

A sign-up form checks each name a person types against the accounts database, one database read per check, and a read for a free name finds nothing. cat and dog are taken, and the picture says they are not yet in the filter. A row of 16 bits in memory, all 0, will sit in front of the database and try to answer “not taken” without the read. Each box shows its bit, with its position in small grey type above it.


Taking a name runs it through the explainer’s three hash functions. Each turns the name into a position in the row, and that bit becomes 1: cat sets 1, 6 and 15. The picture fills each set bit in the colour of the name that set it, purple for cat and brown for dog, and says that the row itself keeps only the 1s. dog sets 7, 0 and 1, and bit 1 was already 1 from cat: it stays 1, its fill is half purple and half brown, and nothing in the row records that two names set it. A set bit says some name set it, not which, so when a name finds all its bits set, the filter can only say maybe.

Looking up owl runs the same hashes: 11, 4 and 13. Taking a name sets all its bits and nothing clears them, so a taken owl would find three 1s (the line: had owl been taken, all three of its bits would be 1). These are 0, so owl is definitely free and the database is not asked. The row and its hashes are a Bloom filter. cat finds its three 1s, so the filter says maybe and the database confirms it is taken: a taken name is never turned away.

wolf is not taken. It hashes to 7, 6 and 1. The reader predicts: maybe, or definitely not? All three are 1, and their fills show whose: bit 7 brown from dog, bit 6 purple from cat and bit 1 from both. wolf is made entirely of other names' bits. The filter says maybe, the database says not taken, and the read was wasted: a false positive, a maybe for a name that is not taken.

With 32 bits the same three names land elsewhere. dog shares no bit with cat, so the shared step there points at the row's six identical 1s instead. wolf hashes to 23, 22 and 1, and no name set bit 23, so the filter turns it away without asking: only 6 of 32 bits are set, against 5 of 16.

The filter skipped one read and wasted one at 16 bits, and skipped two and wasted none at 32. Three lookups are too few to measure a rate, so the last step counts. An untaken name passes only if all three of its bits are set: 5 of 16 bits are set, so about (5/16)³ = 3.1% should pass; at 32 bits 6 of 32 are set, (6/32)³ = 0.66%. Running 10,000 untaken names through each row, 268 pass at 16 bits and 65 at 32. The formula assumes each hash picks a bit independently at random; the measured rates sit a little below it at both sizes, and the scene throws if that stops being true. The line gives the measured rates and the picture the counts; the caption gives the formula, so the numbers are not said twice.

Last, the trade-off made concrete: keep taking names (ant, bee, cow and on, from the model's list) and the row only fills. At 16 bits the 12th name, ape, sets the last 0; from then on owl, cat, wolf and all 10,000 untaken names get maybe, and the filter saves no reads. A 32-bit row takes 45 names to fill. The row's length decides how many names it can hold before it stops saying “definitely not”. The picture greys the bits only later names set, and gives the set bits after the first, middle and last count of names.

**The aha:** wolf's three bits, each filled in cat's or dog's colour. An untaken name can be assembled from other names' bits, and that is why yes is only maybe.

**Sentence to remember:** a set bit says some name set it, not which, so a Bloom filter can prove a name absent but only suspect it present.

**Check questions**, in `meta.checks`, asked after the last step:

1. In the 32-bit filter, someone also takes eel, whose hashes are 23, 20 and 1. What does the filter now say about wolf, and about owl? (wolf: maybe, a false positive, since eel fills bit 23. owl: still definitely not; eel set bit 20, but 27 and 13 are 0.)
2. dog closes its account and someone sets dog's three bits back to 0. What does the filter then say about cat, still taken, at 16 bits and at 32? (At 16, definitely not: bit 1 was shared, so a taken name is turned away. At 32, still maybe, only because dog's bits miss cat's there.)

None of these answers is printed in a step: each asks the reader to use the fills on a case the steps do not show. A test holds eel's hashes, the cleared row's answers and both full rows to the model.

**The setting:** 32 bits changes wolf's answer from maybe to definitely not; the explainer is told from 16 bits, and every caption is written for the case it shows.

| Step | Script | Reader predicts |
| --- | --- | --- |
| question | paragraph 1: the database read the filter should save | |
| insert | paragraph 2, cat's three bits, filled purple | |
| shared | paragraph 2, dog's bits filled brown; bit 1 half and half; the answer | |
| absent | paragraph 3, owl finds a 0; the name Bloom filter | |
| present | paragraph 3, cat finds its 1s; maybe, then the database | |
| predict | paragraph 4, wolf's bits | maybe, or definitely not? |
| false-positive | paragraph 4, wolf's bits each filled by cat or dog: the aha (paragraph 5 at 32 bits) | |
| pipeline | paragraph 6, reads skipped and wasted; (set/size)³ against 10,000 untaken names at both sizes | |
| full | paragraph 7, names taken until every bit is 1 and every lookup says maybe | |

## Limits

The model (`scenes/explainers/lib/bloom-filter.ts`) is an insert-only filter with three seeded FNV-1a hashes. Those hashes are the explainer's own teaching choice, not the double hashing of Jason Davies's demo or of any production library, so every bit position on the page comes from them. The model leaves out deletion (the second check question shows why), counting filters, other numbers of hashes, and choosing a row's length from a target false-positive rate. Only two row lengths are drawn, 16 and 32 bits, with two taken names, three lookups and one sample of 10,000 untaken names (`sample0` to `sample9999`). The fill counts, 12 names for 16 bits and 45 for 32, hold only for the model's list of later names, and the last caption says that how many depends on where those names' bits land. The rules the captions state for every name (a taken name always gets maybe, a name gets through only when all three of its bits are set, the row only fills, a full row says maybe to every name) are tested over random names and row lengths from 8 to 512 bits in `test/learning-models.test.ts`.

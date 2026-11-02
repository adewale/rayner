# Script: why does a Bloom filter answer “maybe”?

Questions the reader brings: What is a Bloom filter? Why can it say “definitely not” but only “maybe” for yes? What does more memory change?

A sign-up form checks every name a person types against the accounts database, and each check is a disk read. Most names typed are not taken, so most of those reads find nothing. cat and dog are taken. A row of 16 bits in memory, all 0, will sit in front of the database and try to answer “not taken” without the read.

Taking a name runs it through three hash functions. Each turns the name into a position in the row, and that bit becomes 1: cat sets 1, 6 and 15. The picture fills each set bit in the colour of the name that set it, purple for cat and brown for dog, and says that the row itself keeps only the 1s. dog sets 7, 0 and 1, and bit 1 was already 1 from cat: it stays 1, its fill is half purple and half brown, and nothing in the row records that two names set it. That is the answer in one line: a set bit says some name set it, not which. So when a name finds all its bits set, the filter can only say maybe.

Looking up owl runs the same hashes: 11, 4 and 13. Taking a name sets all its bits and nothing clears them, so a taken owl would find three 1s. These are 0, so owl is definitely free and the database is never asked. The row and its hashes are a Bloom filter. cat finds its three 1s, so the filter says maybe and the database confirms it is taken: a taken name is never turned away.

wolf was never taken. It hashes to 7, 6 and 1. The reader predicts: maybe, or definitely not? All three are 1, and their fills show whose: bit 7 brown from dog, bit 6 purple from cat and bit 1 from both. wolf is made entirely of other names' bits. The filter says maybe, the database says not taken, and the read was wasted: a false positive.

With 32 bits the same three names land elsewhere. wolf hashes to 23, 22 and 1, and no name set bit 23, so the filter turns it away without asking. More bits leave more of them 0.

The filter skipped one read and wasted one at 16 bits, and skipped two and wasted none at 32. Three lookups are too few to measure a rate, so the last step counts. An untaken name passes only if all three of its bits are set: 5 of 16 bits are set, so about (5/16)³ = 3.1% should pass; at 32 bits 6 of 32 are set, (6/32)³ = 0.66%. Running 10,000 untaken names through each row, 268 pass at 16 bits and 65 at 32, close to both.

**The aha:** wolf's three bits, each filled in cat's or dog's colour. A name nobody took can be assembled from other names' bits, and that is why yes is only maybe.

**Sentence to remember:** a set bit says some name set it, not which, so a Bloom filter can prove a name absent but only suspect it present.

**Check questions**, in `meta.checks`, asked after the last step:

1. In the 16-bit filter, suppose only one of cat and dog had been taken. Would wolf still get "maybe"? (No, either way: it needs dog's bit 7 and cat's bit 6.)
2. A third taken name sets three bits nobody had set, so 8 of the 16 bits are 1. About what share of untaken names would now get "maybe"? ((8/16)³, 12.5%.)
3. dog's account is deleted and someone clears dog's bits 7, 0 and 1. What does the filter say when a person types cat? ("Definitely not taken", wrongly: bit 1 was cat's too.)

None of these answers is printed in a step: each asks the reader to use the fills or the pass formula on a case the steps do not show.

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
| pipeline | paragraph 6, reads skipped and wasted; (set/size)³ and 10,000 untaken names at both sizes | |

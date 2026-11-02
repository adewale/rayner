# Script: why does a Bloom filter answer “maybe”?

Questions the reader brings: What is a Bloom filter? Why can it say “definitely not” but only “maybe” for yes? What does more memory change?

A sign-up form checks every name a person types against the accounts database, and each check is a disk read. Most names typed are not taken, so most of those reads find nothing. cat and dog are taken. A row of 16 bits in memory, all 0, will sit in front of the database and try to answer “not taken” without the read.

Taking a name runs it through three hash functions. Each turns the name into a position in the row, and that bit becomes 1: cat sets 1, 6 and 15. The row keeps bits, not names. dog sets 7, 0 and 1, and bit 1 was already 1 from cat: it stays 1, and nothing records that two names set it. That is the answer in one line: a set bit says some name set it, not which. So when a name finds all its bits set, the filter can only say maybe.

Looking up owl runs the same hashes: 11, 4 and 13. Taking a name sets all its bits and nothing clears them, so a taken owl would find three 1s. These are 0, so owl is definitely free and the database is never asked. The row and its hashes are a Bloom filter. cat finds its three 1s, so the filter says maybe and the database confirms it is taken: a taken name is never turned away.

wolf was never taken. It hashes to 7, 6 and 1. The reader predicts: maybe, or definitely not? All three are 1: bit 7 from dog, bit 6 from cat and bit 1 from both. wolf is made entirely of other names' bits. The filter says maybe, the database says not taken, and the read was wasted: a false positive.

With 32 bits the same three names land elsewhere. wolf hashes to 23, 22 and 1, and no name set bit 23, so the filter turns it away without asking. More bits leave more of them 0.

The filter skipped one read and wasted one at 16 bits, and skipped two and wasted none at 32. In a fixed sample of 100 untaken names, 2 pass the 16-bit filter and 1 passes the 32-bit one.

**The aha:** wolf's three bits, each lit by cat or dog. A name nobody took can be assembled from other names' bits, and that is why yes is only maybe.

**Sentence to remember:** a set bit says some name set it, not which, so a Bloom filter can prove a name absent but only suspect it present.

**Check questions**, in `meta.checks`, asked after the last step:

1. In the 16-bit filter, wolf hashes to bits 7, 6 and 1. Which taken name set each of them?
2. Why does wolf pass the 16-bit filter but not the 32-bit one?
3. cat and dog share bit 1 in the 16-bit filter. What does that bit remember about them?

**The setting:** 32 bits changes wolf's answer from maybe to definitely not; the explainer is told from 16 bits, and every caption is written for the case it shows.

| Step | Script | Reader predicts |
| --- | --- | --- |
| question | paragraph 1: the database read the filter should save | |
| insert | paragraph 2, cat's three bits | |
| shared | paragraph 2, dog shares a bit, and the answer | |
| absent | paragraph 3, owl finds a 0; the name Bloom filter | |
| present | paragraph 3, cat finds its 1s; maybe, then the database | |
| predict | paragraph 4, wolf's bits | maybe, or definitely not? |
| false-positive | paragraph 4, wolf's bits each set by cat or dog: the aha (paragraph 5 at 32 bits) | |
| pipeline | paragraph 6, reads skipped and wasted, the fixed sample at both sizes | |

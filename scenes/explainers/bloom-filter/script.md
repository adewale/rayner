# Why does a Bloom filter answer “maybe”?

A sign-up form asks the accounts database whether each typed name is taken. A free name still costs a database read that finds nothing. Could a small row of bits in memory rule out some names before that read? Start with cat and dog taken, and sixteen empty bits.

Taking a name runs three hash functions. Each turns the name into a position in the row, and those bits become 1. Cat sets three positions; dog sets three too, sharing one with cat. Setting that shared bit again changes nothing. The colours let us follow the owners, but the stored row contains no colours or names. A set bit says some name set it, not which.

Now look up owl with the same hashes. It finds a 0. If owl had been inserted, that bit would have been set, so owl is definitely absent and the database read can be skipped. This is an insert-only Bloom filter: taking names sets bits, and nothing clears them.

Cat finds its bits set. That is consistent with being taken, but the row cannot identify who set them, so it says maybe and asks the database. No inserted name is turned away.

Wolf is not taken. Before looking at the result, follow its three positions: are any still 0? At sixteen bits, dog supplied one, cat supplied another, and both supplied the third. Wolf is assembled entirely from other names' bits. The filter says maybe and the database finds nothing. That unnecessary read is a false positive.

Change the row to thirty-two bits and repeat the same lookups. Wolf now finds an unset bit and is ruled out. The extra memory leaves more gaps, making it harder for an untaken name to find all its positions filled by others. A larger sample of untaken names confirms the difference: roughly three in a hundred pass the smaller row, against fewer than one in a hundred for the larger row. Those rates describe these rows and these hashes, rather than a guarantee for every collection of names.

Keep inserting names and both rows eventually fill. Once every bit is 1, owl, wolf and any other lookup get maybe: the filter saves no reads. More room delays that point for this sequence, but how long it helps depends on where the names land. The useful evidence was the remaining zeros; insertion gradually uses them up.

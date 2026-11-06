# Git object notes

The example uses SHA-1 object identifiers and checks the constructed object bytes against Git’s object hashing. A blob’s header contains its type, byte length and a zero byte; hello followed by a newline contributes six content bytes. The tree representation includes modes, names and raw object identifiers.

`objects.ts` builds both commits, and the rename and copy commits the check questions ask about, with that model. `test/explain-exgit.test.ts` makes each of those four second commits with the Git CLI, under the model's author and dates, and checks that the commit id and the set of objects Git writes are the model's.

The demonstration concerns object identity and reachability. It does not model packfiles, delta compression, garbage collection, SHA-256 repositories or merge conflict resolution. A new commit is distinct even when its tree is unchanged because its other bytes, such as its parent and metadata, can differ.

The optional hash comparison illustrates sensitivity to changed bytes; matching hex digits are not a measure of how similar two file versions are.

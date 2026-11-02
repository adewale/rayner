# What does Git store when a file changes?

The first commit contains hello.txt with the bytes for hello and a newline. Git prefixes those bytes with a type and length, then hashes the result. The resulting identifier, beginning ce01362, names a blob: an object holding the file’s contents. If another commit adds world.txt, must Git store hello again?

The name hello.txt is not inside the blob. A tree associates that name and its mode with the blob’s identifier. A commit names a tree and records its own metadata; the branch main holds the commit’s identifier. Following these references leads from a branch to a commit, then to a named file and its contents.

Adding world.txt creates its new blob, a new tree listing both files, and a new commit naming that tree. The new tree still names hello’s original blob. The unchanged content can be shared because its identifier already describes the bytes needed.

Editing hello.txt instead changes its contents, so the blob gets a different identifier. That identifier is part of the tree’s bytes, so the tree changes too. The commit naming the new tree also changes. The old commit and its objects stay intact; the new commit’s parent reference leads back to the earlier history.

Moving main to the new commit changes the identifier stored in that branch reference. It does not copy the objects below it. Content objects are immutable while a branch name can move between commits.

This is the logical object model: a commit describes a snapshot through references to reusable content. It does not require an independently duplicated copy of every file for every commit. How Git compresses those objects on disk is a separate question from which snapshot each commit names.

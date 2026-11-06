# What does Git store when a file changes?

A Git commit records a snapshot of the whole project, not a list of changes. That sounds expensive: if a project holds a thousand files and you change one, does the next commit copy the other 999? Start with one file and see what Git actually keeps.

The file is hello.txt, holding the word hello and a newline. Git puts a short header in front of those six bytes, the word blob, the length and a zero byte, and hashes all thirteen with SHA-1. The 40-digit result, beginning ce01362, names the stored object, a blob. Notice what is missing from the hashed bytes: the file name. Any file, in any folder or any repository, that holds exactly these bytes gets exactly this id.

The name has to live somewhere, and it lives in a tree. A tree's bytes list each file's mode, its name and the id of the blob holding its contents. Hashing those bytes names the tree. A commit's bytes name one tree, along with the author, the time and the message, and the branch main holds the commit's id. From main you can follow ids down to every name and every byte of the snapshot, yet the commit itself holds none of the files' contents.

Now make a second commit that adds world.txt. Its bytes are new, so Git writes a blob for them. The list of names has changed, so Git writes a new tree, and a new commit to name that tree. Hello's bytes have not changed, so their id is still ce01362, and the new tree names that same stored blob. Three new objects, and the snapshot of two files shares its first file with the old snapshot. Git writes only the objects whose bytes are new and names unchanged content again by its id.

Edit hello.txt instead, and the picture changes. New bytes give a new blob id. That id is written inside the tree, so the tree's bytes change and it gets a new id, and the commit that names the tree changes too. Again three objects are written. Commit one and everything it names stay as they were, and commit two's parent line still leads back to them.

Moving main to commit two changes one thing: the id stored in the branch reference. No object is copied or rewritten. Objects never change once written, because changing their bytes would change their ids; a branch is just a name that moves from one commit to another.

So a snapshot is cheap because it is a set of references, and a reference to unchanged bytes is the same reference every time. This is the logical model. On disk Git also compresses objects and packs similar ones as deltas, which is a separate question from which objects each commit names.

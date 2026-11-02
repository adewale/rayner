# Script: what does Git store when a file changes?

Questions the reader brings: Does Git keep a copy of every file in every commit? Does it store diffs? What actually changes on disk when I commit?

Start with the bytes. The first commit holds one file, hello.txt, containing `hello` and a newline. Git puts a short header in front, the type `blob`, the length 6 and a zero byte, and hashes the 13 bytes with SHA-1. That id, ce013625…, is the object's name: Git calls the object a blob, and ce01362 names it from here on. The reader is asked: if a second commit adds world.txt, does Git store these bytes again? (In the edit case: if hello.txt becomes "hello again", what must Git write?)

The blob has no file name. A tree stores the name: mode, hello.txt, and the blob's id, and the tree is hashed into an id of its own. A commit's first line is its tree's id, and the branch main is a reference holding the commit's id. Each object holds the id of the one below it.

Now the second commit. Adding world.txt writes three objects: world's blob, a new tree and a new commit. The new tree lists hello.txt with the very same id, ce01362: Git does not store hello again. That is the answer: Git writes only the objects whose bytes are new, and names unchanged content again by its id. Editing hello.txt instead gives new bytes, so a new blob id; the tree naming it changes, so its id changes, and so does the commit's, whose parent line names commit one again. In both cases commit one's objects stay exactly as they were.

Moving main to commit two rewrites the one id main holds; no object is copied, and commit one stays reachable through the parent line. As a detail, every id above a change is new: of the 80 hex digits in the new tree and commit ids, about the one in sixteen that chance gives match the old ones place for place.

**The aha:** the box for blob ce01362 moves from tree one's row into tree two's, the same object named by both trees.

**Sentence to remember:** Git writes only the objects whose bytes are new, and names unchanged content again by its id.

**Check questions**, in `meta.checks`, asked after the last step:

1. The second commit adds world.txt. How many objects does Git write, and which object do both trees name?
2. If the second commit edits hello.txt to "hello again" instead, which ids change, and what happens to commit one's objects?
3. What does moving main to commit two copy?

**Cases:** add world.txt (the default: the hello blob is shared) and edit hello.txt (every object above the change is new). The model's ids are checked against `git hash-object`.

| Step | Script | Reader predicts |
| --- | --- | --- |
| blob | paragraph 1: the 13 bytes and their id, and the question | whether Git stores hello again (add), or what it must write (edit) |
| tree | paragraph 2, the name lives in the tree | |
| commit | paragraph 2, commit and branch | |
| change | paragraph 3: the answer, both commits' rows | |
| head | paragraph 4, first sentence: main moves, nothing is copied | |
| hashes (detail) | paragraph 4, the digits that match by chance | |

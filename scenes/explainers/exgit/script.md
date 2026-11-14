# What does Git store when a file changes?

- **Reader:** uses Git day to day (commits, branches) and has heard that a commit is a snapshot, without knowing what Git actually writes or why a snapshot is cheap.
- **Answer:** Git writes only the objects whose bytes are new, and names unchanged content again by its id
- **Changed condition:** what the second commit does. Adding world.txt writes three objects and the new tree names hello's stored blob again; editing hello.txt also writes three, but now the blob is new too and the change climbs through the tree's id to the commit's.
- **Reader's own work:** predict whether Git stores hello's bytes again (or what it must write for an edit) before the change step; try the other second commit; answer the check questions on a rename, a copy and two machines.
- **Checked against:** real Git. `model.test.ts` checks every object id the model computes against `git hash-object`, and makes each of the four second commits (add, edit, and the rename and copy the check questions ask about) with the Git CLI, under the model's author and dates, and checks that the commit id and the set of objects Git writes are the model's; `answers.ts` computes the check answers from the model.
- **Grounding:** live: Git, run by the model’s tests
- **Leaves out:** how objects sit on disk (compression, packfiles and delta compression), garbage collection, SHA-256 repositories and merges. The hash comparison shows only that ids change with any byte; matching hex digits say nothing about how similar two file versions are.

## Check yourself

1. Starting again from commit one, a commit renames hello.txt to greeting.txt and changes nothing else. Which new objects does Git write, and why is no blob among them?
   2 objects, a tree and a commit. The name lives in the tree’s bytes, so the tree changes, and so does the commit that names it. The file’s bytes are unchanged, so its id is still ce01362 and the new tree names the stored blob.
2. Starting again from commit one, a commit adds copy.txt containing exactly hello and a newline. How many new blobs does Git write?
   None. Its bytes hash to ce01362, which is already stored, so the new tree lists both names against that one blob. The commit writes 2 objects, a tree and a commit.
3. Two people on different machines each commit a file containing hello and a newline. Do their blobs have the same id? Do their commits?
   The blobs do: both are ce01362, because a blob’s id depends only on its bytes. Commits match only if all their bytes match, including the tree, the parents, the author and committer lines with their timestamps, and the message, so in practice they differ.

## Why this explainer

"A commit is a snapshot" sounds expensive: change one file in a thousand and the next commit copies the other 999? The explainer answers that worry by showing exactly which bytes Git hashes. It starts with one blob's thirteen bytes, so the reader sees that the file name is not among them; the name has to live in a tree, and the tree's id covers its entries' ids. From there the answer follows: unchanged bytes have the same id, so a new snapshot names them again instead of copying them.

Every id on the page comes from the model's own SHA-1 over the exact bytes, and the real Git CLI agrees, so the reader can type the same commands and get ce01362. The two scenarios are the two cases a reader needs: adding a file shares the old blob, editing one changes every id above it. Rename and copy are kept for the check questions, where the reader has to apply the rule to a change the page did not draw; their answers came from the same model and the same Git comparison covers them.

A new commit is always a new object even when its tree is unchanged, because its parent and metadata differ; the moving branch at the end makes the point that refs change while objects never do. The hash-detail step exists to stop readers reading shared hex digits as similarity.

# Construction notes

The same two files distinguish ancestry from file content. B changes colour.txt and C adds title.txt, so the merge needs no conflict resolution; M's two parent arrows are the explanation rather than a distraction from a textual conflict.

The model's ordinary merges are checked against real Git with `merge.ff=true`. It does not model squash merges, rebases, conflicts or octopus merges. `--ff-only` would refuse the diverged case, and `--no-ff` can choose a merge commit in a history that permits fast-forwarding. Avoid the overbroad conclusion that Git always moves a label whenever only one branch has additional commits: merging an already-incorporated branch is a no-op.

“No branch reaches C” means the two branches drawn here. Reflogs, tags, remote-tracking references, recovery and garbage collection are outside the pictured history. The caption explicitly distinguishes losing C from main's history from deleting its stored object.

The repeat-merge, reverse-merge and explicit-policy exercises are defined once, in `scene.ts`'s `meta.checks`, and checked with real Git. They use the parent-arrow argument on commands the story does not draw.

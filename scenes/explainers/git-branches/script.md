# Why does a merge sometimes need a new commit?

- **Reader:** uses Git branches and has run git merge, but has never asked why some merges make a merge commit and others just move a label.
- **Answer:** A merge needs a new commit when each branch has a commit the other lacks
- **Changed condition:** main's history. When main makes its own commit C, moving main to feature's B would drop C from main's history, so git merge writes M with parents C and B. When main stays at A, A is already in B's history, so the merge fast-forwards main to B with no new commit.
- **Reader's own work:** predict which edit main would lose if its label just moved to B (or whether it would lose anything); predict whether Git would still need M in the other history; choose main's history; then the three check questions, which apply the parent-arrow argument to a repeated merge, a reverse merge and `--no-ff`.
- **Checked against:** real Git: `model.test.ts` replays both histories in a temporary repository with `merge.ff=true` and compares branch labels, parents and checked-out files frame by frame with the model; checks that moving only the main label leaves C on no branch exactly when real Git would; and runs the three check questions' commands (a repeated merge reports Already up to date, the reverse merge fast-forwards, `--no-ff` makes a commit with parents B and M).
- **Leaves out:** conflicts, squash merges, rebases and octopus merges; `--ff-only`; tags, other branches, reflogs, remote-tracking references, recovery and garbage collection ("no branch reaches C" means the two branches drawn, and C is still stored).

## Check yourself

1. After M is made, stay on main and run git merge feature again. Does main move back to B, make another commit, or stay at M?
   It stays at M. B is already in M’s history, so Git reports Already up to date. Main has already incorporated feature; moving main back to B would discard C from main’s history.
2. After M is made, switch to feature and run git merge main, with fast-forwards allowed. New commit, fast-forward, or no change?
   Fast-forward. Feature is at B, which is already one of M’s parents, while main has commits feature lacks. Git moves feature from B to M without making a commit.
3. Start again with feature at B and main at M. On feature, run git merge --no-ff main. Could Git fast-forward, and what does this option ask it to do instead?
   A fast-forward would be possible because B is in M’s history. --no-ff asks Git to create a merge commit anyway, with B as its first parent and M as its second. The history makes a fast-forward possible; the chosen merge policy decides whether to use it.

## Why this explainer

The merge commit is usually explained as "Git combines the changes", which hides the real reason: a branch is a label on a commit, and its history is whatever the parent arrows reach. The explainer asks the reader to try the simplest merge, moving main's label to B, and to find what it loses. In the diverged history it loses C; in the linear one it loses nothing, and that is a fast-forward.

The two files are chosen to separate ancestry from content. B changes colour.txt and C adds title.txt, so the merge needs no conflict resolution, and M's two parent arrows are the whole explanation rather than a distraction from a textual conflict. The checked-out files table shows what a label move would do to the working tree: green, but no title.txt.

The history setting is the reader's lever because it flips the conclusion, and each history's last step shows the other one's merge. The captions keep two distinctions a careless version would blur: losing C from main's history is not deleting C, and Git fast-forwards by default but `--no-ff` can ask for a commit anyway. The check questions guard against the overbroad rule that Git moves a label whenever only one branch has new commits: merging a branch already incorporated changes nothing.

# Script: why does a merge sometimes need a new commit?

Questions the reader brings: Why does `git merge` sometimes say "Fast-forward" and sometimes make a merge commit? What is a merge commit for? Could Git just move the branch?

Open on two branches that have each moved on. Both started at commit A, where colour.txt is blue. On feature, commit B made it green; on main, commit C added title.txt, "Home". A branch is only a label on a commit, and each commit points back to its parent, so the cheapest possible merge would move the main label onto B. Ask the reader: if it did, which edit would main lose?

The Home edit. With main on B, checking it out gives green and no title.txt: B's history is B, then A, and C is not in it, so no branch reaches C at all. Moving a label is safe only when the commit it leaves is already in the new commit's history. That is the answer, as the payoff: a merge needs a new commit when each branch has a commit the other lacks.

So Git writes M, a merge commit with two parents, C and B. Main moves to M, and its files have both edits, green and Home, because the edits touch different files. Feature stays at B. The reader predicts the other case: if main had never made C, would Git still need M?

No. Main would still point at A, which is B's parent, so moving main to B loses nothing. `git merge feature` just moves the label: a fast-forward, with no new commit.

**The aha:** the moved-label picture, where C is left with no branch: the merge commit exists to keep it.

**Sentence to remember:** a merge needs a new commit when each branch has a commit the other lacks; otherwise Git just moves the label.

**Check questions**, in `meta.checks`, asked after the last step:

1. In the diverged history, why can't `git merge feature` just point main at B?
2. After M is made, you switch to feature and run `git merge main`. New commit or fast-forward?
3. Which two parents does M record, and which files does it hold?

The `history` setting starts from the linear history instead: main never made C, the question becomes "would main lose anything?", the answer is the fast-forward, and the last step shows the diverged history needing M. The linear case has no moved-label step, because there the label move is the fast-forward.

| Step | Script | Reader predicts |
| --- | --- | --- |
| question | paragraph 1: the diverged picture, labels and parents, the cheap merge | which edit moving main to B would lose |
| lost | paragraph 2: C left on no branch, and the answer (diverged only) | |
| merge | paragraph 3: M with parents C and B | whether Git needs M without C |
| countercase | paragraph 4: the other history | |

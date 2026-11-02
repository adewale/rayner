# Script: why does a merge sometimes need a new commit?

Question the reader brings: `git merge` sometimes says “Fast-forward” and sometimes creates a commit. What difference in the history makes that necessary?

Both branches started at A, where colour.txt is blue. On feature, B made it green. On main, C added title.txt, “Home”. We have main checked out, so its files are blue and Home. A branch label names a commit, and the arrows lead back through its history. Could moving main to B combine the two edits? Predict which file would be missing.

Home would be missing: B leads back to A, not to C. Neither branch would contain C after the move. C is still stored; moving a branch does not delete a commit. But its edit would be absent from main. To keep main’s history, the new destination must lead back to its old commit. A merge needs a new commit when each branch has a commit the other lacks.

Git creates M with two parents, C and B, and moves main to it. Following M’s parents now reaches both histories. Its files have green and Home: these edits combine without a conflict because they affect different files. Feature stays at B. What if main had never made C?

Then main would still point at A, which is already in B’s history. Moving main to B keeps everything main had and brings in feature’s edit. This is a fast-forward, with no new commit. The examples allow fast-forwards; `--no-ff` asks for a merge commit even when a fast-forward is possible.

**The aha:** moving main to B leaves C outside both branch histories; M’s two parent arrows keep it in main’s history.

**Sentence to remember:** follow the parent arrows: if the incoming history already contains the current commit, the branch can fast-forward; if each side has commits the other lacks, a merge commit keeps both histories.

**Check questions**, in `meta.checks`, transfer the parent-arrow test to commands the steps do not show:

1. After M, stay on main and merge feature again. Does main move back to B, make another commit, or stay at M? (It stays: B is already in M’s history, so Git reports “Already up to date”.)
2. After M, switch to feature and merge main with fast-forwards allowed. New commit, fast-forward, or no change? (Fast-forward from B to M: M contains B, but B does not contain M.)
3. Start again with feature at B and main at M. On feature, run `git merge --no-ff main`. What changes? (Git could fast-forward but instead creates a commit with parents B and M. Possibility comes from the history; policy decides whether to use it.)

The `history` setting starts with main still at A. Its opening asks whether moving the label loses anything; the final step then contrasts the diverged history. Both cases use the same two-file example and parent relationships.

## Limits

This lesson follows ordinary two-branch merges with fast-forwards allowed (`merge.ff=true` in the real-Git tests). It does not model conflicts, squash merges, rebasing, octopus merges or `--ff-only`, which refuses a diverged merge. The check questions cover an already-incorporated branch and an explicit `--no-ff` request. The tests run these commands against real Git; the scene’s two settings draw only the diverged and fast-forward histories.

“No branch reaches C” refers to the two branches in this example. It does not mean Git immediately deletes C; recovery and garbage collection are outside the lesson. No tags or remote-tracking references are present.

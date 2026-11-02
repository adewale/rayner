# Why does a merge sometimes need a new commit?

Two Git branches start at commit A, where colour.txt is blue. On feature, commit B changes it to green. On main, commit C adds title.txt containing “Home”. We have main checked out, so our files are blue and Home.

A branch label names a commit. Each commit points back to its parent, so following those arrows gives the history behind the label. Could merging feature simply move the main label from C to B? Which edit would main lose?

The Home edit. B leads back to A, not to C. Checking out main at B would give us green but no title.txt. C would still be stored, but neither branch in this example would reach it. Moving the label does not delete the commit; it removes that commit from main's history.

To keep both histories, Git creates M with two parents, C and B, then moves main to M. Following either parent now reaches the corresponding branch's work. M's files contain green and Home: these edits combine without a conflict because they affect different files. Feature stays at B.

What if main had never made C? It would still point at A, which is already in B's history. Moving main to B would keep everything main had and bring in feature's edit. Git can then perform a fast-forward: the label moves to an existing commit and no new commit is needed.

The difference is in the parent arrows. In the first history, each branch has a commit the other lacks, so a merge commit keeps both. In the second, the incoming history already contains main's commit, so main can move forward along that history.

These examples allow fast-forwards. The option `--no-ff` can request a merge commit even when moving the label would suffice. The examples also have no conflicting edits, tags or other branches; a commit outside these two branch histories has not necessarily disappeared from Git.

# Script: what can a Mermaid verifier prove?

Question the reader brings: an agent edits my Mermaid diagrams and Agentic Mermaid verifies them. If the verifier says ok, is the diagram right?

An agent drew a cache lookup and got it backwards. Out of the decision Cached, yes leads to Database and no leads to Reply, so a cache hit would query the database the cache exists to spare. Agentic Mermaid parses the source into a snapshot that gives every node and edge an id, A->B#0 and A->C#0 for the two exits. Will the verifier accept this diagram?

It does: verify returns ok: true with no warnings, and a token that follows yes walks a real edge from Cached to Database. That is the answer: the verifier checks structure, such as a label on every branch, not whether the labels mean the right thing.

Is it checking anything at all? Delete both labels and it returns two DECISION_BRANCH_UNLABELED warnings, one for each exit of the decision diamond, each named by its edge id. A missing label is part of the diagram's structure, so the verifier can see it. The warnings are advice, so ok stays true.

Now label the edges the right way round with two typed set_label operations, yes on A->B#0 and no on A->C#0. The build replays them on the unlabelled diagram and refuses the result unless it serializes to the next diagram. The cache hit now replies from the cache, and the report is ok: true with no warnings: exactly what the wrong diagram got. Which label belongs on which branch is the author's decision, and the cache policy needs its own tests.

**The aha:** the right diagram's report sits beside the wrong one's, and they are identical, ok: true and no warnings, while the token now takes yes to Reply instead of Database.

**Sentence to remember:** a verifier can prove a diagram is well formed and every branch is labelled; it cannot prove the labels are true.

**Detail after the ending:** the history keeps the source, the typed edit and the checked snapshot as three commits, with the verifier's findings and the pinned renderer, so a reviewer reading the diff still decides what the labels mean.

**Check questions**, in `meta.checks`, asked after the last step. Each is a new diagram, and `test/explain-real.test.ts` runs the pinned verifier on it:

1. The agent labels both edges out of Cached yes. What does verify report? (ok: true, no warnings)
2. A third, unlabelled route out of Cached goes to a node D, Stale. How many warnings, naming which edge? (one, A->D#0)
3. Cached is drawn as a rectangle, A[Cached], with both edges unlabelled. Does the verifier warn? (no: it is not a decision)

**The reader's lever:** the agent's first edit labels yes to Database (the default: the wrong diagram, with no warnings), leaves the labels out (repaired, then swapped as a what-if), or labels yes to Reply (no repair, then swapped as a what-if). Every case states the answer in its second step and ends on the two identical reports.

| Step | Script | Reader predicts |
| --- | --- | --- |
| source | paragraph 1: the backwards diagram and its edge ids | does the verifier accept it? |
| verify | paragraph 2: ok: true, no warnings, the token reaches Database; the answer | is it checking anything? |
| flagged | paragraph 3: labels deleted, two warnings by edge id (default case only) | what changes when the labels are right? |
| repair | the labels-missing case only: two set_label operations clear both warnings | |
| meaning | paragraph 4: the right labels, the same report beside the wrong one's: the aha | |
| history | detail after the ending: three commits, and who still reads the meaning | |

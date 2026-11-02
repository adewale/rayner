# Script: what does a Mermaid verifier check?

Question the reader brings: an agent edits my Mermaid diagrams and Agentic Mermaid verifies them. If the verifier says ok, is the diagram right?

An agent drew a cache lookup and got it backwards. Out of the decision Cached, yes leads to Database and no leads to Reply, so a cache hit would query the database the cache exists to spare. Agentic Mermaid's verify(flow) checks a diagram's source and returns a report. Will the verifier accept this diagram?

It does: verify returns ok: true with no warnings, and a dot following the yes edge as drawn goes from Cached to Database. The report's last line, taskCorrectness: not-checked, is the verifier's own note that it did not judge whether the diagram does its job. That is the answer: verify fails a diagram that Agentic Mermaid's renderer cannot draw, warns about an unlabelled branch out of a decision, and leaves what the labels mean unchecked.

What does fail? Cut the end off the edge to Database, so the last line stops at its arrow. Agentic Mermaid's renderer cannot draw that, and verify returns ok: false with RENDER_FAILED, the error for a source that cannot be drawn, an UNSUPPORTED_SYNTAX warning naming the dangling edge, and renderability: failed. Errors are the findings that turn ok false (AGENT_NATIVE.md: "a clean verify proves the diagram actually renders"). Capture refuses a diagram that fails verify, so this step shows the source and the report, and `test/explain-real.test.ts` runs the pinned verifier on each case's broken source.

Between those two: delete both labels and the diagram draws again, with two DECISION_BRANCH_UNLABELED warnings, the warning for a decision with two or more exits where one exit carries no label. Each warning names its edge: Agentic Mermaid names an edge by its two ends and a count, so A->C#0 is the first edge from A, Cached, to C, Database. This is the first step that needs those names, so they arrive here (in the labels-missing case, at the verify step; in the labels-right case, at the last step, where set_label uses them). A missing label is part of the structure, so the verifier can see it. A warning is advice, so ok stays true.

Now label the edges the right way round. set_label is an Agentic Mermaid edit that names one edge by its id and sets that edge's label; two of them put yes on A->B#0 and no on A->C#0. The cache hit now replies from the cache, and the report is ok: true with no warnings, the report the wrong diagram got. Telling the two apart takes a check that knows a cache hit should reach Reply, such as a test written for this diagram.

**The aha:** the right diagram's report sits beside the wrong one's, and they are identical, ok: true and no warnings, while the dot now takes yes to Reply instead of Database.

**Sentence to remember:** verify fails a diagram that Agentic Mermaid's renderer cannot draw, warns about an unlabelled branch out of a decision, and leaves what the labels mean unchecked.

**Detail after the ending:** the history keeps the source, the agent's edit and a checked snapshot as three commits. The snapshot is the diagram as parsed and drawn, saved with the verifier's findings, including taskCorrectness: not-checked and the renderer version.

**Check questions**, in `meta.checks`, asked after the last step. Each is a new diagram, and `test/explain-real.test.ts` runs the pinned verifier on it:

1. The second edge is written A -->|no| D, and D appears nowhere else. What does verify report? (ok: true, no warnings: Mermaid creates D as a rectangle labelled D)
2. From the right diagram, a second unlabelled edge from Cached to Database, A --> C. Which edge does the warning name? (A->C#1: the naming rule's count, applied to a case no step shows)
3. Cached is drawn as a rectangle, A[Cached], with both edges unlabelled. Does the verifier warn? (no: it is not a decision)
4. The edge to Database is deleted, leaving A{Cached} --> B[Reply] unlabelled. How many warnings? (none: the warning needs two or more exits, as the flagged step says)

The old fourth check, a bare graph header, rested on what Mermaid itself accepts, which this repository cannot test; mermaid-js may accept a bare graph. `test/explain-real.test.ts` still holds that Agentic Mermaid's renderer rejects it.

**The reader's lever:** the agent's first edit labels yes to Database (the default: the wrong diagram, with no warnings), leaves the labels out (repaired, then swapped as a what-if), or labels yes to Reply (no repair, then swapped as a what-if). Every case states the answer in its verify step, shows the ok: false tier at the broken step, and ends on the two identical reports.

| Step | Script | Reader predicts |
| --- | --- | --- |
| source | paragraph 1: the backwards diagram | does the verifier accept it? |
| verify | paragraph 2: ok: true, no warnings, taskCorrectness: not-checked, the dot reaches Database; the answer | |
| broken | paragraph 3: the edge cut off at its arrow; ok: false, RENDER_FAILED; no picture | can the source be drawn at all? |
| flagged | paragraph 4: labels deleted, two warnings, edge names, ok stays true (default case only) | does a missing label turn ok false? |
| repair | the labels-missing case only: two set_label operations clear both warnings | |
| meaning | paragraph 5: the right labels, the same report beside the wrong one's: the aha | |
| history | detail after the ending: three commits and the snapshot's findings | |

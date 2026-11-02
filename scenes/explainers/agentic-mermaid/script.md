# Script: what can a Mermaid verifier prove?

Question the reader brings: an agent edits my Mermaid diagrams and Agentic Mermaid verifies them. If the verifier says ok, is the diagram right?

An agent drew a cache lookup: a decision, Cached, with two routes out of it, one to Reply and one to Database. It did not say which route means yes. Which branch means a cache hit? Does the verifier accept the diagram?

It does: verify returns ok: true, with two DECISION_BRANCH_UNLABELED warnings, one for each edge out of Cached. It can name them because the snapshot gives every edge an id, A->B#0 and A->C#0. Two typed set_label operations add yes and no; the build replays them on the parsed first edit and refuses the result unless it serializes to the next diagram. Verified again, the diagram has no warnings.

Now swap the labels, so yes leads to Database and a cache hit would query the database. The verifier still returns ok: true with no warnings, and a token walks a real edge from Cached to Database. The verifier checks structure, such as a label on every branch, not whether the labels mean the right thing. Which label belongs on which branch is the author's decision, and the cache policy needs its own tests.

The history keeps the source, the typed edit and the checked snapshot as three commits, with the verifier's findings and the pinned renderer. It records what was checked, so a reviewer reading the diff still decides what the labels mean.

**The aha:** the swapped diagram gets the same report as the right one, ok: true and no warnings, while the token runs from Cached to Database on yes.

**Sentence to remember:** a verifier can prove a diagram is well formed and every branch is labelled; it cannot prove the labels are true.

**Check questions**, in `meta.checks`, asked after the last step:

1. With the branch labels missing, how many warnings does verify return, and is ok true?
2. What does the verifier report when the labels are swapped so yes leads to Database?
3. Which two operations repair the first edit, and what must replaying them produce?

**The reader's lever:** the agent's first edit leaves the labels out (repaired, then swapped as a what-if), labels yes to Reply (no repair), or labels yes to Database (the wrong diagram, with no warnings).

| Step | Script | Reader predicts |
| --- | --- | --- |
| source | paragraph 1: the agent's diagram and its edge ids | does the verifier accept it? |
| verify | paragraph 2: ok: true and two warnings | |
| repair | paragraph 2: two set_label operations, replayed, no warnings (only when labels were missing) | |
| meaning | paragraph 3: the swapped labels, no warnings, the answer | |
| history | paragraph 4: three commits, and who still reads the meaning | |

# What does a Mermaid verifier check?

- **Reader:** uses, or is deciding whether to trust, an agent that edits Mermaid diagrams and checks them with a verifier; reads a flowchart without help, and has not looked at what a verifier's ok and warnings actually test.
- **Answer:** Verify fails a diagram that Agentic Mermaid’s renderer cannot draw, warns about structural gaps such as an unlabelled branch out of a decision, and leaves what the labels mean unchecked
- **Changed condition:** the agent's first edit. With the branch labels left out, verify keeps ok true and warns once per unlabelled exit of the decision; with yes sent to Database, or to Reply, it reports ok true with no warnings either way, although only one sends a cache hit to Reply. Cutting the end off the last edge fails verify in every scenario.
- **Reader's own work:** predict whether verify accepts the agent's diagram before the report; choose which first edit the agent made; answer the check questions, which ask what verify reports for diagrams the scene does not show (an undeclared node, a second edge between the same nodes, a rectangle instead of a decision, a decision with one exit).
- **Checked against:** the pinned verifier, agentic-mermaid 0.5.1: every report shown is its verify result, captured with the diagram's snapshot; `scene.test.ts` runs verifyMermaid on each scenario's broken source, which cannot be captured, and requires the report the scene writes for it, and on each check question's diagram and requires the answer given here.
- **Grounding:** live: agentic-mermaid 0.5.1’s verifier
- **Leaves out:** what Mermaid implementations in general accept; any check of what a diagram's labels mean, including the cache-specific check the ending describes; diagrams beyond three-node flowcharts and the verifier's other warnings.

## Check yourself

1. The agent writes the second edge as A -->|no| D, and D appears nowhere else in the source. What does verify(flow) report?
   ok: true and no warnings. Mermaid creates D where it is first used, as a rectangle labelled D, so the diagram draws and both exits of the decision carry labels. That the agent meant Database is the kind of thing verify leaves unchecked.
2. Starting from the right diagram, the agent adds a second, unlabelled edge from Cached to Database: A --> C. Which edge does the warning name?
   A->C#1. It is the second edge from A to C, so its count is 1, while the labelled edge to Database keeps A->C#0. One DECISION_BRANCH_UNLABELED warning, and ok stays true.
3. Draw Cached as a rectangle, A[Cached], and leave both edges unlabelled. Does the verifier warn?
   No: ok: true with no warnings. DECISION_BRANCH_UNLABELED is about the exits of a decision diamond, and a rectangle is not a decision, so there is nothing for it to flag.
4. The agent deletes the whole line for the edge to Database and leaves the edge to Reply unlabelled: A{Cached} --> B[Reply]. How many warnings?
   None: ok: true with no warnings. The warning is for a decision with two or more exits, and Cached now has one, so its one unlabelled exit is not flagged.

## Why this explainer

An agent that edits diagrams will report that its edit "verified". The reader should leave knowing exactly what that word covers: the renderer can draw the source, and each exit of a decision says which exit it is. It does not cover whether the diagram describes a working system. The cache lookup is the example because a wrong answer there is easy to see once you follow yes out of Cached, and because its mistake, labels the wrong way round, passes every check the verifier makes.

The default scenario is the swapped labels, so the first thing the reader sees is a wrong diagram that verifies cleanly. The broken arrow and the missing labels then show the two things verify does catch, a failure and a warning, before the meaning step sets the wrong and right diagrams side by side with identical reports. That comparison is the moment to remember: the same findings, opposite answers to where a cache hit goes.

The broken source cannot enter the capture pipeline, which refuses a diagram that fails verify, so its report is written in the scene and held to the pinned verifier by the test. Warnings name edges such as A->C#0, with a count because parallel edges share endpoints; the scene explains the name where the first one appears. The history detail keeps source, typed edit and verified snapshot as separate artifacts; the snapshot preserves the drawing, renderer version and findings, and adds no guarantee about the domain.

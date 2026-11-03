# What does a Mermaid verifier check?

An agent edits a cache lookup and gets its branches backwards: yes from Cached leads to Database, and no leads to Reply. The diagram draws neatly, but a cache hit now takes the database path the cache exists to avoid. Would a verifier reject it?

Agentic Mermaid accepts it: ok is true and there are no warnings. The report's last line says taskCorrectness is not checked. The verifier has confirmed that the source draws and that each exit of the decision carries a label; it has not confirmed that the labels describe a working cache.

A different mistake stops the diagram from drawing at all. Cut the destination off the last arrow, and the pinned renderer fails. The report then has ok false and a rendering error. The verifier can make this check without knowing what a cache is for, because the question is only whether its renderer can turn the source into a picture.

Missing labels fall between the two. The diagram still draws, but a decision with two exits now has unlabelled branches, and the verifier warns about each one while leaving ok true. An edge name such as A->C#0 says which connection needs a label: the first edge from Cached to Database.

Now label the branches the right way round, with yes to Reply and no to Database. The report is clean, but the backwards diagram's report was just as clean. Both diagrams draw, and both give every exit a label, so the same checks pass for both and the reports cannot tell them apart.

The missing requirement comes from the task: following a cache hit should reach Reply without querying Database. A check of that path would separate the two diagrams. Agentic Mermaid's ok and warnings answer two narrower questions: can this renderer draw the source, and does each decision say which exit is which? This page shows the gap; it does not implement the cache check.

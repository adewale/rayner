# What does a Mermaid verifier check?

A cache lookup has its branches reversed: yes from Cached leads to Database, while no leads to Reply. The diagram can be drawn neatly, but a hit now follows the database path the cache was meant to avoid. Would a verifier reject it?

Agentic Mermaid accepts it: ok is true and there are no warnings. Its report also says taskCorrectness is not checked. The drawn yes path really reaches Database; accepting the diagram has not established that the path represents a correct cache lookup.

A different mistake stops the diagram from being drawn at all. Cutting the destination off an arrow makes the pinned renderer fail. The report then has ok false and a rendering error. This is a check the tool can perform without knowing what the cache is for: can its renderer turn this source into a diagram?

Missing labels fall between the two cases. The diagram still draws, but a decision with multiple exits has unlabelled branches. The verifier warns about those edges while leaving ok true. An edge identifier such as A->C#0 tells which connection needs attention: the first edge from Cached to Database.

Correcting the labels makes yes lead to Reply and no to Database. The warnings are clear, but the backwards diagram already had a clear report. The two reports cannot distinguish the two meanings because both diagrams meet the same drawing and structural checks.

The remaining requirement has to come from the task. For this cache, following a hit should reach Reply without querying Database. A check of that behavior would distinguish the diagrams; the generic verifier’s success does not. Its findings are useful evidence about renderability and particular structural rules, with a boundary at domain meaning.

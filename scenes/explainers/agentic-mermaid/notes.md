# Verifier notes

The reports are for agentic-mermaid 0.5.1 and small three-node flowcharts. A failed source cannot enter the normal capture pipeline, so the broken-arrow report is represented explicitly and compared with the pinned verifier’s response.

The meaning step’s two-diagram comparison reads where a cache hit goes from each drawn snapshot: the edge whose label is yes, and the node at its end. The reports beside the two diagrams are the pinned verifier’s findings for those same sources.

DECISION_BRANCH_UNLABELED applies to a decision with multiple exits. It is not a general demand that every graph edge carry a label. Edge identifiers include an occurrence count because parallel connections can share endpoints.

The history detail retains source, edit and verified snapshot as separate artifacts. The snapshot preserves the parsed drawing, renderer version and findings; it does not add a domain-correctness guarantee.

This page does not establish what Mermaid implementations in general accept. Nor does it implement the cache-specific behavioral check described at the end; that example identifies the missing obligation.

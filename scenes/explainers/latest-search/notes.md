# Construction notes

The two displayed cases use real JavaScript promises resolved in chosen orders. They do not measure network latency or rely on sleeps. This keeps the difference between request order and completion order reproducible.

Both requests have started before either response arrives. The display starts empty; captions about showing “nothing yet” must not be generalized to an application that retains earlier results. The example implements no debounce, abort, retry, loading state, error UI or fallback policy.

The ticket belongs to a request, not its query text. The repeated-query and failed-newest exercises in `scene.ts`'s `meta.checks` test that distinction through the same handler; they are not additional displayed cases.

The final side-by-side traces compare the entire publication history. Matching final displays in the older-first case do not make the guard redundant: their intermediate displays differ.

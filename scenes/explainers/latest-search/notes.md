# Construction notes

The two displayed cases use real JavaScript promises resolved in chosen orders. They do not measure network latency or rely on sleeps. This keeps the difference between request order and completion order reproducible. The timeline places the run's four events, two starts and then two landings, at even spacing in the order they happened; its bar lengths are not durations.

Both requests have started before either response arrives. The display starts empty; captions about showing “nothing yet” must not be generalized to an application that retains earlier results. The example implements no debounce, abort, retry, loading state, error UI or fallback policy.

The two timelines that show the page (the overwrite step's and the last step's) are machines (`raceNext` in `lib/latest-search.ts`), one per rule: their events are the searches starting and their responses landing, through the same handler `createSearch` runs. Each step replays its case's four events from an empty timeline. `rayner check` explores every interleaving, 10 states per rule, including the one no displayed case shows, where “ca” answers before “cat” is typed. A test runs each explored state's events through real promises and gets the same page, and holds that only the unguarded page ever shows a result published after a newer search started (outlined in red); an invariant holds the guarded page to that on every frame and explored transition.

The ticket belongs to a request, not its query text. The repeated-query and failed-newest exercises in `scene.ts`'s `meta.checks` test that distinction through the same handler; they are not additional displayed cases.

The final side-by-side traces compare the entire publication history. Matching final displays in the older-first case do not make the guard redundant: their intermediate displays differ.

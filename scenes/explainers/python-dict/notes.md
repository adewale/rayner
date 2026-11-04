# Construction notes

The main path isolates the difference between never-used and deleted slots. The optional `hash` and `collision` steps explain the shared starting slot and the longer probe routes; the deletion argument does not require binary arithmetic.

The keys 0, 8 and 16 are deliberate: their hashes equal their values and their low three bits agree. That statement must stay scoped to these keys; `hash(-1)` is -2. Changing the selected lookup from 8 to 16 checks a longer route through the same deletion, rather than demonstrating a second repair.

The storage is CPython 3.12.14's compact combined table, checked against captured native storage. The emptied-slot failure is a counterfactual mutation, not Python's deletion behavior. Resizing, insertion after deletion, split instance dictionaries and custom hashing or equality are outside the lesson. The fixed-size teaching lookup rejects an absent-key search with no unused stopping slot.

The transfer exercises in `scene.ts` under `meta.checks` move deletion into the middle of a probe route and remove the unused stopping slots.

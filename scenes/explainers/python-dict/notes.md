# Construction notes

The main path isolates the difference between never-used and deleted slots. The optional `hash` and `collision` steps explain the shared starting slot and the longer probe routes; the deletion argument does not require binary arithmetic.

The keys 0, 8 and 16 are deliberate: their hashes equal their values and their low three bits agree. That statement must stay scoped to these keys; `hash(-1)` is -2. Changing the selected lookup from 8 to 16 checks a longer route through the same deletion, rather than demonstrating a second repair.

The storage is CPython 3.12.14's compact combined table, checked against captured native storage. The emptied-slot failure is a counterfactual mutation, not Python's deletion behavior. Resizing, insertion after deletion, split instance dictionaries and custom hashing or equality are outside the lesson. The fixed-size teaching lookup rejects an absent-key search with no unused stopping slot.

The transfer exercises in `scene.ts` under `meta.checks` move deletion into the middle of a probe route and remove the unused stopping slots.

The `broken`, `marker` and `missing` steps are played by two machines over the same model (`dictNext` in `lib/python-dict.ts`): one deletes with CPython's marker, the other with the counterfactual that empties the slot. Their events are deletions and lookups of 0, 8, 16 and 24. A lookup of a missing key is an answer (the panel's KeyError or not found); a deletion whose search cannot find its key is refused, as Python raises KeyError and changes nothing. Insertion is not an event: reusing a deleted slot and resizing are outside the lesson, so there is no story bound either. The pictures are keyed tables, so between states each slot and each entry row stays the same part, and a deletion's D replaces the entry index in its slot in place. `rayner check` explores every state each machine reaches.

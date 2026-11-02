# Script: why does a deleted dictionary slot need a marker?

For a Python user who knows what a dictionary does but has not seen its storage. Explain one deletion failure and its repair; hash arithmetic is reference material.

The dict holds 0 → apple, 8 → pear and 16 → plum. An index slot points to an entry in the separate table below. Key 8 is reached through slot 1. Delete key 0 from slot 0: surely emptying that slot cannot affect pear? Ask the reader to predict what a lookup of 8 will return.

It would fail. These three keys start at the same slot; occupied slots made 8 and 16 move on when they were stored. A lookup retraces that route. “Never used” means there cannot be a matching key farther along it, so clearing slot 0 ends the search before pear. An emptied slot would end the search early, so deletion leaves a marker that says keep looking.

Change just that slot to D, meaning deleted. The entry for apple is gone, but D keeps the lookup moving: through slot 0 to slot 1 for pear, or on to slot 6 for plum. The same lookup that failed now succeeds. The distinction is between “never used” and “used, then deleted”, not between occupied and empty storage.

Now look for key 24, which was never inserted and also starts at slot 0. Ask where its lookup stops. It passes D and the occupied slots, then finds a genuinely unused slot at 7. The marker preserves searches for existing keys; the unused slot still proves absence.

**Remember:** an emptied slot would end the search early, so deletion leaves a marker that says keep looking.

**Transfer questions:**

1. Delete key 8 from slot 1 while keeping key 0. Can key 16 still be found if slot 1 is cleared? What if it holds D? (Clearing breaks the 0 → 1 → 6 lookup; D preserves it.)
2. Replace every never-used slot with D. Can an absent-key lookup use this stopping rule? (No: D says continue. The real table needs unused space or a rebuild; the fixed-size teaching model refuses a table without an unused stopping slot.)

The `key` setting compares an early and a later key on the same probe path. It is useful for seeing that the marker preserves more than the first key beyond the deletion; it is not a different repair.

| Main step | What it contributes |
| --- | --- |
| question | Predict whether clearing slot 0 can lose another key |
| broken | The lookup stops early while the value still exists |
| marker | A one-character change repairs the same lookup |
| missing | A never-used slot still terminates an absent-key lookup |

## Optional reference

`hash` explains why these keys start at 0: their hashes are 0, 8 and 16, and an eight-slot index uses the low three bits. `collision` follows the complete probe paths, 0 → 1 and 0 → 1 → 6. Both remain directly reachable detail steps. The main story needs the shared starting slot and retraced path, not binary arithmetic.

## Limits

This is CPython 3.12.14's compact combined table, with capacity fixed at eight and three nonnegative integer keys. Those keys hash to themselves; that is not a rule for every Python integer (`hash(-1)` is -2). The lesson omits resizing, insertion after deletion, split instance dictionaries and custom equality/hash methods. The model is checked against captured CPython storage; the deliberately cleared table is a counterfactual bug, not Python's actual deletion behavior.

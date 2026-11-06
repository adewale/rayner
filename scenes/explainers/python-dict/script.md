# Why does a deleted dictionary slot need a marker?

- **Reader:** uses Python dictionaries and knows a dict looks keys up by hash, but has not seen how a hash table finds a key that collided, or what deletion has to preserve.
- **Answer:** An emptied slot would end the search early, so deletion leaves a marker that says keep looking
- **Changed condition:** the key looked up after deleting key 0. Key 8 is found one slot past the marker; key 16 has a longer route (slots 0, 1, 6) through the same deletion, so the marker is shown keeping a longer search open, not repairing a second case.
- **Reader's own work:** predict what d[8] (or d[16]) gives if deletion just empties slot 0; predict where the search for absent key 24 stops and why; choose which key to look up; then the two check questions, which move the deletion into the middle of a route and take away the never-used slots.
- **Checked against:** CPython 3.12.14's dict storage: `oracle/cpython_dict.py` builds `{0: 'apple', 8: 'pear', 16: 'plum'}`, reads its index and entries from memory before and after `del d[0]`, and captures them with its lookups into `fixtures/cpython-dict.json`, which `model.test.ts` compares with the model; the probe recurrence follows CPython's Objects/dictobject.c. The emptied-slot version is a counterfactual with nothing to check it against but the model's own tests.
- **Leaves out:** resizing, insertion after deletion and reuse of deleted slots, split instance dictionaries, custom hashing or equality, and keys other than 0, 8, 16 and 24 (the hash-equals-value fact holds for these keys only; `hash(-1)` is -2).

## Check yourself

1. Keep key 0, but delete key 8 from slot 1. What happens to the lookup of key 16 if slot 1 is cleared, and if it is marked D?
   Clearing slot 1 makes key 16 unreachable: its lookup visits slots 0, 1 and 6, so it stops at 1 before reaching plum. A D in slot 1 keeps the search moving to slot 6. A deletion marker matters in the middle of a probe path too.
2. After deleting key 0 correctly, someone replaces every never-used slot with D. Could a lookup of absent key 24 still use the stopping rule this lesson shows?
   No. It would have no never-used slot at which to stop. D means keep looking, not absent. A real dict must preserve an unused slot or rebuild its table; this fixed-size model refuses a table with no unused stopping slot.

## Why this explainer

The deleted-slot marker looks like bookkeeping until you see the lookup it protects. The main path isolates one difference, between a never-used slot (evidence that a key was never inserted, so the search stops) and a deleted one (taken once, so keep looking), and shows it with the smallest dict that needs it.

The keys 0, 8 and 16 are chosen because their hashes equal their values and their low three bits agree, so all three start at slot 0 and the later two had to probe onward. Deleting the first key on that shared route is the case where emptying the slot visibly breaks a lookup of a key that is still stored. The binary arithmetic and the probe recurrence are detail steps (`hash`, `collision`): the deletion argument does not need them.

The middle steps are two machines over the same model, one deleting with CPython's marker and one with the counterfactual that empties the slot. Their events are deletions and lookups of 0, 8, 16 and 24; insertion is left out because reusing a deleted slot and resizing are outside the lesson. The pictures are keyed tables, so a deletion's D replaces the entry index in its slot in place.

Absent key 24 ends the story because it shows the other half of the rule: a never-used slot on a key's own route is where the search may conclude the key is missing, while a never-used slot its route flies over says nothing about it.

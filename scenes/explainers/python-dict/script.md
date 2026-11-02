# Script: why does a deleted dictionary slot need a marker?

Questions the reader brings: What happens inside a Python dict when I delete a key? Why can't it just empty the slot? What is the "dummy" or "tombstone" people mention?

Take a real CPython 3.12 dict with three keys, 0, 8 and 16, mapped to apple, pear and plum. Its index has eight slots; each holds the number of an entry, or nothing yet. Key 8 is entry 1 and sits in slot 1, nowhere in slot 0. Now delete key 0. The obvious way is to empty its slot, so ask the reader: would `d[8]` still find pear?

It would not. Empty slot 0 and `d[8]` raises KeyError, although pear is still stored. The search for 8 does not start at slot 1: it starts at slot 0, and a slot that was never used ends a search. That is the answer, as the payoff of the surprise: an emptied slot would end the search early, so deletion leaves a marker that says keep looking.

Why does 8 start at slot 0? A small int hashes to itself, and an eight-slot index keeps only the hash's low three bits. 0, 8 and 16 all end in 000, so all three start at slot 0. Key 0 was stored first and took it; 8 found it taken and moved on to slot 1; 16 found both taken and moved on to slot 6. A lookup retraces that path, so anything that looks never used on the path cuts it.

CPython's fix is the marker: `del d[0]` writes a deleted marker, D, into slot 0 and empties entry 0. A search treats D as taken and moves on, so 8 is found at slot 1 again. The reader predicts the last piece: a key that was never stored, 24, also starts at 0. Where does its search end? At slot 7, the first never-used slot on its path; D alone never ends a search.

**The aha:** the same table with one character changed in slot 0: – loses pear, D finds it.

**Sentence to remember:** an emptied slot would end the search early, so deletion leaves a marker that says keep looking.

**Check questions**, in `meta.checks`, asked after the last step:

1. Key 8 is stored in slot 1. Why does a search for it start at slot 0?
2. If `del d[0]` emptied slot 0, which of the remaining keys, 8 and 16, could Python no longer find?
3. After `del d[0]`, the search for key 8 reads slot 0. What does it find there, and what does it do?

The `key` setting follows 16 instead of 8 through the same story: its search is longer (0, 1, 6) and fails the same way.

| Step | Script | Reader predicts |
| --- | --- | --- |
| question | paragraph 1: the concrete dict and the obvious deletion | whether `d[8]` still finds pear |
| broken | paragraph 2: KeyError, and the answer | why the search starts at slot 0 |
| hash | paragraph 3: hashes and the low three bits | |
| collision | paragraph 3: the paths 0 > 1 and 0 > 1 > 6, retraced on lookup | |
| marker | paragraph 4: D in slot 0, the search goes on | where a search for 24 ends |
| missing | paragraph 4: slot 7 ends it; the scope (no resizing) | |

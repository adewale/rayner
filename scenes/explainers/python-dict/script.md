# Why does a deleted dictionary slot need a marker?

A Python dictionary holds 0 → apple, 8 → pear and 16 → plum. Its index has eight slots. Each occupied slot points to a key and value in a separate entry table: slot 0 points to apple, slot 1 to pear and slot 6 to plum.

Delete key 0. If deletion simply emptied slot 0, would `d[8]` still find pear in slot 1?

It would fail, even though pear is still stored. These three keys start their searches at slot 0. When the keys were inserted, 0 occupied that slot, so 8 and 16 had to continue along their search routes to find space. A lookup retraces the route used for insertion. It cannot jump straight to the slot where its key ended up.

A never-used slot ends that search. If the key had been inserted, it would have found space there rather than continuing beyond it. Clearing slot 0 therefore gives the lookup false evidence: “this key was never inserted”. The search stops before reaching pear.

Python instead writes a deleted marker, D, into slot 0 and removes apple from the entry table. D records that the slot used to be occupied. It cannot match the key, but it tells the lookup to continue. The search for 8 passes D and finds pear at slot 1. The search for 16 continues through slots 0 and 1 to find plum at slot 6. Changing one slot from never used to deleted preserves both searches.

What about a key that is absent? Key 24 also starts at slot 0. Its search passes D and the occupied slots, then reaches slot 7, which has genuinely never been used. That is where the lookup can conclude that 24 is missing. Deleted slots keep a route open; never-used slots let it end.

This example follows CPython 3.12.14 with eight slots throughout. It shows why deletion needs the marker, without covering how the dictionary grows or reuses space for later insertions.

# What is the difference between LRU and MRU?

A cache has three slots. Requests for A, B and C have filled them, in that order. Now D arrives. It is missing, and there is no spare slot. Which item should make room: A, which has waited longest, or C, which was just used?

LRU evicts the item used longest ago: A. Its name means least recently used. MRU, most recently used, evicts C instead. Both put D in the freed slot. Keeping the recent item sounds sensible, but the next requests decide whether it helps.

Suppose A, B, C and D repeat. LRU has just evicted A, the next item needed. Bringing A back evicts B, which comes next. The same mistake repeats: all eight requests miss. MRU kept A and B when it made room for D. On the second pass, A, B and D hit; C misses. Evicting the newest item preserved more of this loop.

Change only the last four requests: C, D, C, D. LRU kept both, so all four repeats hit. MRU dropped C for D. Bringing C back now drops D, then bringing D back drops C. All four repeats miss.

The eviction rule has stayed the same; the useful choice has reversed. Recency records the past. Whether it predicts the next request depends on the access pattern. These two examples count eight requests through three slots; they do not measure the cost of maintaining the cache.

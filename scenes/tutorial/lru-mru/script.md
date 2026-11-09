# What is the difference between LRU and MRU?

- **Reader:** a developer choosing a replacement policy who assumes recently used data is always worth keeping.
- **Answer:** LRU evicts the item used longest ago
- **Changed condition:** the last four of eight requests through three slots. After A B C D, repeating A B C D gives LRU 0 hits and MRU 3; changing them to C D C D gives LRU 4 and MRU 0. The first four requests, and so the first eviction, are the same in both.
- **Reader's own work:** predict which item each policy evicts when D arrives; switch the requests between A B C D again and C D C D; answer the reader questions.
- **Checked against:** the worked LRU and MRU examples in Wikipedia's "Cache replacement policies", in `model.test.ts`; Chou and DeWitt (VLDB 1985) for when MRU suits a file scanned over and over.
- **Leaves out:** the cost of tracking recency, latency, and random access, where Chou and DeWitt report that the choice is immaterial; the hit counts are for eight requests through three slots.

## Check yourself

1. A full cache misses. Which item does each policy evict?
   LRU evicts the item used longest ago; MRU evicts the item used most recently.
2. Why does LRU miss every request when a loop is one item larger than the cache?
   Each miss evicts the oldest item, which is exactly the item the loop asks for next.
3. Which policy should manage a buffer for a file scanned over and over that does not fit in memory?
   MRU: it keeps most of the loop in the cache, while LRU evicts each item just before it is needed again.

## Why this explainer

The tempting shortcut is that keeping recent items is always right. A loop over more items than the cache holds is the request pattern that proves it wrong, and Chou and DeWitt make the same point for a file scanned repeatedly that does not fit in memory. So the explainer isolates the one decision where the policies differ, which item D evicts, before it shows what that decision costs over the whole sequence, and then changes only the last four requests so the same rule wins the other way. A trace table of eight requests would answer the question for a reader who already reads trace tables; the steps exist to separate the decision from its cost.

The ending is the limit: these are hit counts for one short sequence, not a claim about latency, bookkeeping or random access.

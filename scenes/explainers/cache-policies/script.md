# Can the same requests make LRU and MRU choose different winners?

- **Reader:** a developer who knows a cache miss needs space and assumes keeping recent items always wins.
- **Answer:** LRU evicts the item used longest ago; MRU evicts the item used most recently
- **Changed condition:** after A B C D through three slots, request A B C D again or C D C D. The first gives LRU 0 hits and MRU 3; the second gives LRU 4 and MRU 0.
- **Reader's own work:** predict the first eviction, switch the request pattern, then send the same further requests to both live caches and inspect their separate orders and counts.
- **Checked against:** the LRU/MRU worked examples and policy definitions in Wikipedia's Cache replacement policies, and Chou and DeWitt (VLDB 1985) for repeated scans. `model.test.ts` compares each policy with an independent insertion-ordered Map implementation on generated streams, checks the worked counts, and checks that neither cache can mutate the other. No outside cache implementation is executed.
- **Grounding:** read: Cache replacement policies and Chou and DeWitt, VLDB 1985
- **Leaves out:** latency, recency-tracking cost, concurrent requests and production eviction optimizations. The live demonstration stops at eleven requests; real caches do not.

## Check yourself

1. After A B C D through three slots, which policy still holds A and why?
   MRU: it evicted the newest item C to admit D. LRU evicted A, the oldest.
2. Why does changing only the last four requests reverse the winner?
   A repeated scan benefits from retaining older items, while alternating C and D benefits from retaining the items just used.
3. Does one cache's hit change the other cache's state?
   No. Each policy computes its own next state from its own cache and the shared request.

## Why this explainer

Both policies need the same input and independently owned state on screen together. One explicit product-state transition updates the two pure models and synchronizes their separate views. This uses the existing Scene and Machine rather than inventing a model registry or silently merging partial state writes.

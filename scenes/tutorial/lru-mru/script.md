# Script: what is the difference between LRU and MRU?

Write this before any code. Read it aloud to someone who doesn't know the topic, with no pictures: if they can't answer the check questions afterwards, fix the script, not the drawing. See "Script first" in the Rayner explainers skill.

**Questions the reader brings:** What is the difference between LRU and MRU? When does it matter?

**Script** (150 to 250 words, answer first):

On a miss in a full cache, a replacement policy chooses which item to evict. LRU evicts the item used longest ago. MRU evicts the item used most recently. Which one gets more hits depends on the order of requests.

Take a cache with three slots. Requests for A, B and C fill it in both policies, so both hold the same items. The next request, D, misses in both and forces an eviction. LRU drops A, the oldest. MRU drops C, the newest.

Now repeat A, B, C and D. LRU always evicted the item the loop needs next, so every request misses. MRU evicted C to make room for D, so A, B and D hit on the second pass. A loop over more items than the cache holds favours MRU.

Change only what follows: C and D alternate instead. LRU still holds both, so every repeat hits. MRU evicts the item requested just before, which is always the next one requested, so every repeat misses. Reuse of recent items favours LRU.

These counts cover eight requests through three slots. They leave out what tracking recency costs.

**Sentence to remember:** LRU evicts the oldest item and MRU the newest, so a loop larger than the cache favours MRU and reuse of recent items favours LRU.

**Check questions** (they go in the scene's `meta.checks`; `meta.answer` holds the script's first answer):

1. A full cache misses. Which item does each policy evict?
2. Why does LRU miss every request when a loop is one item larger than the cache?
3. Which policy should manage a buffer for a file scanned over and over that does not fit in memory?

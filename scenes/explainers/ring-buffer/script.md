# Script: how does a ring buffer reuse storage?

Questions the reader brings: What is a ring buffer for? Why not just use an array as a queue? What happens when it fills up?

The simplest queue keeps its values in order in an array. Push writes at the end. Pop takes the front, and then every other value moves one slot left, the way `Array.prototype.shift` does. Popping 1 from five values moves four; from a thousand values, 999. The order stays right, but every pop pays for every value left behind.

What if pop took the front value and moved nothing? Keep five fixed slots and remember two positions instead: head, the slot pop reads next, and tail, the slot push writes next. Push writes at tail and moves tail on; pop reads at head and moves head on. When a marker passes slot 4 it wraps back to slot 0, so the row behaves as a ring. Values stay in their slots while head and tail move, and both wrap back to slot 0 to reuse freed slots.

Five pushes fill the ring, and tail wraps back to slot 0, where head is: the same picture as an empty ring. That is why the buffer also keeps length. Only length, 5, says the ring is full.

Pop twice: 1 leaves slot 0 and 2 leaves slot 1, head moves to 2, and no other value moves (the array queue would have moved four, then three). Tail is still at 0, so push 6 and push 7 go into slots 0 and 1, the storage the pops gave back. The slots now read 6, 7, 3, 4, 5, but pops start at head, so the queue order is 3, 4, 5, 6, 7.

The other case pushes 6 into the full ring. This buffer checks length against capacity before anything else and throws Full; no slot, marker or length changes, and push 7 is refused the same way. Some ring buffers overwrite the oldest value instead. This one refuses, so the caller must handle Full.

**The aha:** the opening's four shifting arrows become none; head moving one slot does the work of every value moving.

**Sentence to remember:** a ring buffer leaves values where they are and moves head and tail, wrapping both back to slot 0, so freed slots are reused and no pop moves anything.

**Check questions**, in `meta.checks`, asked after the last step:

1. After five pushes, head and tail are both at slot 0, as when empty. What tells you it is full?
2. Push 1 to 5, pop twice, push 6 and 7: the slots read 6, 7, 3, 4, 5. In what order will five pops return the values?
3. Popping 1 from an array queue of five values moves how many values, and from this ring?

The model is `RingBuffer` in `lib/models.ts`, tested against a reference queue; the array queue's counts come from running `Array.prototype.shift` on real arrays.

| Step | Script | Reader predicts |
| --- | --- | --- |
| shift | paragraph 1, the array queue and its four moves | how pop could take 1 without moving the others |
| slots | paragraph 2, head and tail named, and the answer | where head and tail are after five pushes |
| fill | paragraph 3, the full ring that looks empty, and length | which values two pops remove, and what moves (wrap); what push 6 does (full) |
| next | paragraph 4, the two pops (wrap); paragraph 5, Full (full) | where push 6 and push 7 go (wrap) |
| result | paragraph 4, the reused slots (wrap); paragraph 5, the design choice (full) | |

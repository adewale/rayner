# How does a ring buffer reuse storage?

An array queue keeps its oldest value at the front. Pushing adds a value at the end; popping removes the first value and shifts the rest left. Removing 1 from the five values 1, 2, 3, 4, 5 leaves four values to move. Could a queue remove that first value without relocating the others?

Keep five fixed slots and remember where the queue begins. Head identifies the slot the next pop reads. Tail identifies the slot the next push writes. A pop reads at head and advances head; a push writes at tail and advances tail. Advancing past slot 4 returns to slot 0. The row is now used as a ring: its physical end does not end the queue.

Push 1 through 5. The slots fill, and tail wraps to slot 0, where head still waits. Head and tail now coincide just as they did when the ring was empty. The markers alone cannot distinguish those situations, so this buffer also stores length: zero means empty and five means full.

Pop twice. The returned values are 1 and 2, head advances to slot 2, and the remaining values stay where they were. The array queue would have shifted four values and then three. Here, advancing head changes which slot counts as the front instead of making the next value travel there.

Tail still points to slot 0. Push 6 and 7 into slots 0 and 1, reusing the space the pops freed. The slots now read 6, 7, 3, 4, 5 from left to right, but that is not the queue's order. Start at head, slot 2, and wrap after slot 4: the queue is 3, 4, 5, 6, 7. The markers define order; the layout of the slots does not.

The other case tries to push into a ring that is already full. This buffer checks length before writing and refuses push 6 with Full. No slot or marker changes, and push 7 is refused too. A fixed capacity requires such a policy: another ring buffer might overwrite the oldest value, but this one preserves the queued values and makes the caller handle refusal.

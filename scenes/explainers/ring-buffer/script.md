# How does a ring buffer reuse storage?

- **Reader:** a programmer who has used an array as a queue (push at the end, shift from the front) and has not asked what the shift costs or how a fixed buffer avoids it.
- **Answer:** Values stay in their slots while head and tail move, and both wrap back to slot 0 to reuse freed slots
- **Changed condition:** the operations. "Push 5, pop 2, push 2" shows the freed slots reused, with the queue read from head rather than left to right; "Push 7 into five slots" shows the policy at the limit: push 6 and push 7 are refused with Full and nothing changes.
- **Reader's own work:** predict where head and tail are after five pushes, which values two pops take, and where the next pushes go; choose the operations; at the end, press push and pop on the live ring (the story pushes the values 1 to 9); the three check questions.
- **Checked against:** a reference queue: `test/explain-models.test.ts` runs random push and pop sequences on rings of 1 to 24 slots and checks each pop, each refusal, and that the values read from head are the queue's; the array comparison follows ECMAScript's definition of `Array.prototype.shift`. Nothing external runs the ring itself.
- **Leaves out:** other designs: this ring tracks length to tell full from empty and refuses a push when full, where others keep a spare slot or overwrite the oldest value. Concurrent producers and consumers and memory ordering. The array's move counts are the copies the language's definition describes, not timings; engines may store arrays differently.

## Check yourself

1. Carry on from the last step of “Push 5, pop 2, push 2”, where head and tail are both at slot 2. Pop three times, then push 8. Which values leave, which slot takes 8, and in what order do the rest come out?
   The pops return 3, 4, 5, and head wraps to slot 0. Tail is still at slot 2, so 8 goes there. Reading from head gives 6, 7, 8: the order comes from head, not from the slot numbers.
2. A ring of eight slots takes eight pushes and then eight pops. Where are head and tail, and how does the ring know it is empty?
   Both are at slot 0, just where they were when it was full (head 0, tail 0). Only length, 0 now against 8 then, tells empty from full.
3. A queue of 1,000 values is drained by 1,000 pops. How many value copies does the array queue make in all, and how many does the ring make?
   The array makes 499,500: each pop copies every value still behind the front, 999, then 998, down to 0. The ring makes none, because a pop moves only head.

## Why this explainer

The motivation is a cost the reader already pays without seeing it: an array queue's pop moves every value behind the front. The ring removes that cost by moving two markers instead of the values, and the step that should stick is the wrapped one, where the slots read 6, 7, 3, 4, 5 left to right but the queue is 3, 4, 5, 6, 7 read from head. The markers define order; the layout of the slots does not. Never sort the displayed slots or let the picture invite reading them left to right.

Five slots are enough to show both the wrap and the full/empty ambiguity without hiding values: after five pushes head and tail coincide just as they did when the ring was empty, which is why this buffer keeps length. The second scenario exists because a fixed capacity needs a policy; this one refuses and keeps the queued values, and the page says that other ring buffers overwrite instead.

The check answers were computed from `RingBuffer` and `arrayQueue` (in `model.ts` and `picture.ts`) on rings and queues no step draws; recompute them if either changes. The scene also draws on the Lantern ring-buffer example, linked in `meta.sources`.

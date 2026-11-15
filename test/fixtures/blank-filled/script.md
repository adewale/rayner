# Why does [10, 9, 1].sort() give [1, 10, 9]?

- **Reader:** a JavaScript developer who expects sort() with no arguments to order numbers by size.
- **Answer:** sort() compares the elements as strings
- **Changed condition:** none: one scenario, the array [10, 9, 1], since the answer is one comparison.
- **Reader's own work:** predict the order before reading the step; answer the reader question.
- **Checked against:** Node's own Array.prototype.sort, run on five arrays in `model.test.ts` each time it runs.
- **Grounding:** live: Node 24's Array.prototype.sort
- **Leaves out:** compare functions, undefined and holes in arrays, and how fast the sort runs.

## Check yourself

1. What does [2, 10, 1].sort() give?
   [1, 10, 2]: as strings, "10" comes before "2".

## Why this explainer

test/explain-tutorial.test.ts fills `rayner init --blank` with this: the smallest subject that replaces every placeholder with something real, checked against the real sort.

# Why does [10, 9, 1].sort() give [1, 10, 9]?

- **Reader:** a JavaScript developer who expects sort() with no arguments to order numbers by size.
- **Answer:** sort() compares the elements as strings
- **Changed condition:** the compare function: none, or (a, b) => a - b. With none, [10, 9, 1] sorts to [1, 10, 9]; with a - b, to [1, 9, 10]. The array and the numbers the reader can add are the same in both.
- **Reader's own work:** predict where 10 goes before the answer; switch the compare function; at the last step, add 2, 25 or 100 and predict where each lands; answer the reader question.
- **Checked against:** Node's own Array.prototype.sort, with no compare function and with (a, b) => a - b, run in `model.test.ts` on six arrays and on every array the live step reaches, each time it runs.
- **Grounding:** live: Array.prototype.sort in the Node that runs the model's tests (Node 24 when written)
- **Leaves out:** other compare functions, strings, undefined and holes in arrays, how fast the sort runs and whether it is stable; the live step adds 2, 25 and 100, each once.

## Check yourself

1. What does [2, 10, 1].sort() give?
   [1, 10, 2]: as strings, "10" comes before "2".

## Why this explainer

The answer is one comparison, so a still of [1, 10, 9] with "1" < "9" under it would nearly do. What a still cannot do is let the reader commit: the first step asks where 10 goes before showing it, the setting puts the numeric compare function beside the default so the reader sees the same array come out two ways, and the last step lets them add numbers and test the rule on cases they choose. docs/WRITING.md builds it from `rayner init --blank`, and the test that keeps that guide true checks it at every stage.

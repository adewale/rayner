# Explainer benchmark: Rayner against the same model without Rayner

The question this answers: does an explainer an author builds with Rayner teach better than one the same author builds without it? The goal is for the answer to be yes. Run a round after any change meant to make explainers teach better, and keep the result here even when Rayner loses.

## A round

1. **One script.** Write and approve a script first (questions, a 150 to 250 word answer-first script, a sentence to remember, check questions, a transfer exercise), as the skill's "Script first" describes. Every builder gets the same one.
2. **Two pages per author.** Each author (a model, or a person) builds the explainer twice, in separate worktrees, from [`prompts/build-rayner.md`](prompts/build-rayner.md) and [`prompts/build-plain.md`](prompts/build-plain.md). The briefs share their definition of "educational" word for word; only the method differs. A plain builder must not read this repository.
3. **Evidence per page.** For a Rayner page: `rayner build` for the html, `rayner shots` for the contact sheet, `rayner describe` (drawings removed) for the transcript. For a plain page: the html, contact sheet and transcript its brief asks for.
4. **Blind pairs.** List the pages in a manifest and run `node tools/bench-explainers.ts pair manifest.json <dir>`. It writes `pairN-X.*` and `pairN-Y.*`, with the author order and sides drawn from the manifest's seed, and the key beside the directory.
5. **One blind review.** Give a fresh reviewer [`prompts/review.md`](prompts/review.md), filled in with the round's script and nothing else. The brief stays the same between rounds, so rounds can be compared.
6. **Quiz.** For each page, give `rayner quiz`'s packet (for a plain page, its transcript and contact sheet) to one fresh reader and the control to another. Grade both against the key. A question counts as taught when the packet's reader is right and the control's reader is not.
7. **Record.** Unblind with the key and add a row below: the verdict per pair and how decisively, the reasons the reviewer gave, and the quiz.

The comparison is small and judged by one reviewer per round. Treat a round as evidence about what to fix, not a measurement of how much readers learn.

## Rounds

### Round 1: statecharts, 1 November 2026

Script: [`scenes/explainers/statecharts/script.md`](../../scenes/explainers/statecharts/script.md). Authors: three models. The Rayner pages were built with the skill as it stood after "Script first" was added; the reviewer saw pages, contact sheets and transcripts.

| Author | Preferred | How decisively |
| --- | --- | --- |
| A | Plain | Clearly |
| B | Plain | Clearly |
| C | Plain | Slightly |

What the plain pages had that the Rayner pages lacked, in the reviewer's words or close to them: the learner commits to predictions and sends events to a live machine; check questions on the page; each step fits one screen. What the Rayner pages did better: cleaner, consistent diagrams; one idea per step; accessibility. Problems in Rayner's player that the review exposed, each verified afterwards: the side rail listed future titles such as "Answer: …", giving away predictions; at 1280 × 800 the caption started 749 px down; the arrow keys did nothing until the reader clicked.

Changes made in response: arrow keys work from load; the stage leaves room for the caption's first two lines; the rail names a step only once reached; `meta.answer` and `meta.checks`, with the check questions asked after the last step; `rayner quiz`; reader action scored in the rubric.

**Quiz, Rayner statecharts page:** the packet's reader answered all three check questions right; the control's reader, with no explainer, also answered all three right. None of the three questions tests the explainer: a model reader knows what statecharts are. The skill now asks for check questions only the explainer answers.

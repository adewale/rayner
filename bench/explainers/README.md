# Explainer benchmark: Rayner against the same model without Rayner

The question this answers: does an explainer an author builds with Rayner teach better than one the same author builds without it? The goal is for the answer to be yes. Run a round after any change meant to make explainers teach better, and keep the result here even when Rayner loses.

## A round

1. **One script.** Write and approve a script first (questions, a 150 to 250 word answer-first script, a sentence to remember, check questions, a transfer exercise), as the skill's "Script first" describes. Every builder gets the same one.
2. **Two pages per author.** Each author (a model, or a person) builds the explainer twice, in separate worktrees, from [`prompts/build-rayner.md`](prompts/build-rayner.md) and [`prompts/build-plain.md`](prompts/build-plain.md). The briefs share their definition of "educational" word for word; only the method differs. A plain builder must not read this repository.
3. **Evidence per page.** For a Rayner page: `rayner build` for the html, `rayner shots` for the contact sheet, `rayner describe` (drawings removed) for the transcript. For a plain page: the html, contact sheet and transcript its brief asks for.
4. **Blind pairs.** List the pages in a manifest and run `node tools/bench-explainers.ts pair manifest.json <dir>`. It writes `pairN-X.*` and `pairN-Y.*`, with the author order and sides drawn from the manifest's seed, and the key beside the directory.
5. **One blind review.** Give a fresh reviewer [`prompts/review.md`](prompts/review.md), filled in with the round's script and nothing else. The brief stays the same between rounds, so rounds can be compared.
6. **Record.** Unblind with the key and add a row below: the verdict per pair and how decisively, and the reasons the reviewer gave.

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

Changes made in response: arrow keys work from load; the stage leaves room for the caption's first two lines; the rail names a step only once reached; `meta.answer` and `meta.checks`, with the check questions asked after the last step; reader action scored in the rubric. A `rayner quiz` command was added and later removed (see below).

**Fresh-reader quiz, Rayner statecharts page** (a `rayner quiz` command, since removed, gave one fresh reader the explainer as text with the check questions and another the questions alone): the packet's reader answered all three check questions right; the control's reader, with no explainer, also answered all three right. None of the three questions tests the explainer: a model reader knows what statecharts are. The skill now asks for check questions only the explainer answers.

### Round 2: statecharts, 1 November 2026

Same script, same plain pages and the same reviewer brief as round 1. The Rayner pages were the round-1 scenes rebuilt on the changed player, each given the script's `meta.answer` and `meta.checks`; nothing else in them changed. New blinding (seed 20261101).

| Author | Preferred | How decisively |
| --- | --- | --- |
| A | Plain | Clearly |
| B | Plain | Clearly |
| C | Plain | Clearly, by less than A and B |

What changed: the reviewer no longer raised the caption below the fold, keys that needed a click, or rail spoilers, and credited the Rayner pages with arrow-key navigation, deep links, a text alternative for every picture, steady pacing and shorter length. Every verdict still turned on the same thing: on the plain pages the learner commits to predictions, sends events to a live machine and watches which state handles each, and runs the statechart and its flat machine side by side; on the Rayner pages the learner only reads and presses Next. The reviewer's one change for every Rayner page was the same: committed predictions and live event sending with a trace.

Other problems the review found in the Rayner pages:
- On a phone the stage shows a cropped, panned strip of the picture, the worst phone experience of the six.
- Count and trace cards overlap or crowd the diagram (authors A and C).
- A "What changed" chip switched examples between steps without saying so (author B).
- Author B's last step printed the check answers above the player's "Show the answer" disclosures: adding `meta.checks` to a scene that already ended on its answers spoiled them. A scene with `meta.checks` should not also print the answers.

Conclusion: the player fixes removed the defects round 1 found, but not the reason Rayner loses. Rayner needs reader interaction (committed predictions and a live machine driven from the scene's own model) before it can beat a hand-made page, and phone close-ups that show the whole picture.

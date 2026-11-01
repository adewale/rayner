<!-- The blind reviewer's brief. Fill {PAIRS_DIR}, {SCRIPT}, {REMEMBER} and {CHECKS} from the round's script; change nothing else between rounds. -->
You are an independent editor judging educational explainers. Do not modify any files outside your own scratch notes.

In `{PAIRS_DIR}` there are **pairs** of explainers that teach the same thing, built from the same approved script. Each pair has an X and a Y. For each explainer there is:
- `pairN-X.html`: the actual page; open it and use it.
- `pairN-X.png`: a contact sheet of its steps.
- `pairN-X.transcript.json`: its step text.

Within a pair, the two were built by the same author using two different methods. You aren't told which is which; judge only what a learner experiences. Don't look in any other folder.

**The script they all show:**
> {SCRIPT}

**Sentence to remember:** {REMEMBER}

**Check questions:**
{CHECKS}

**How to evaluate.** Use Playwright to open each `file://` page. Step through it with its own controls at 1280×800 and at 390×844, try its interactive parts, and take screenshots you then look at. Spend comparable effort on each page.

For each explainer, judge:
- **Answer and understanding.** Does it state the answer up front? Could a newcomer answer the check questions and apply them to a new case afterwards?
- **The learner's own work.** Does the learner predict, commit, act or test anything, or only read and click Next? Does doing so teach, or is it decoration?
- **Pictures.** Does each picture teach without its text? Is it legible at 1280 and 390? Is it consistent from step to step, and free of clutter?
- **Mechanism and pattern.** Is the rule that decides the outcome visible as it happens? Does it show the general pattern beyond the example?
- **Correctness.** Note any wrong or misleading statement, count or picture.
- **Economy.** Length, pacing, scrolling, and whether it is overwhelming. A learner's time matters.
- **Phone experience.**
- **Accessibility, as far as you can observe it:** keyboard use, a text alternative for pictures, and reduced motion if you can test it.

**Report (under 1,200 words):**
1. For each pair: which of X and Y teaches better, and how decisively (clearly, slightly, or a toss-up). Give three to five specific reasons, citing steps and what you saw.
2. Across the pairs: the capabilities the winning explainers have that the losers lack.
3. Anything one method does consistently better than the other, whichever wins overall. For this item only, note which pages share a style without guessing who made them.
4. The single most important change that would make each losing explainer beat its partner.

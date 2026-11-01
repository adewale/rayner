<!-- The Rayner builder's brief. Fill {TOPIC}, {ID}, {SCRIPT}, {REMEMBER}, {CHECKS} and {TRANSFER}; the shared parts match build-plain.md. -->
Build the best educational explainer you can of {TOPIC} with Rayner, as the scene `scenes/explainers/{ID}/`. Read `skills/rayner-explainers/SKILL.md` and follow it, starting with "Script first" (the script is already approved, below), and `docs/EXPLAINER-RUBRIC.md`. Copy the nearest example the skill names rather than starting blank. Don't read any other attempt at this topic.

**The approved script** (keep its meaning and order; you may add around it). Save it as `scenes/explainers/{ID}/script.md`, and put its answer in `meta.answer` and its check questions, with answers, in `meta.checks`:
> {SCRIPT}

**Sentence to remember:** {REMEMBER}

**Check questions:**
{CHECKS}

**What "educational" means here:**
- State the answer first.
- Each picture should teach without its caption.
- Draw the mechanism that decides the outcome as a visible trace.
- Show the pattern beyond the example.
- Make the reader predict before reveals, and answer each prediction.
- Name and refute a misconception.
- End with a transfer exercise: {TRANSFER}
- Close on the sentence to remember.
- Use no unexplained jargon.
- Make it correct, readable on a 390 px phone as well as a desktop, and accessible.

**Evidence for the comparison.** `npm run rayner -- review scenes/explainers/{ID}/scene.ts` must pass. Run `npm run rayner -- quiz` on it and give the packet and the control to two fresh readers (new subagents that have not seen the scene); report their answers. Build the page with `npm run rayner -- build`, make a contact sheet with `npm run rayner -- shots`, and look at it.

**Report back (under 500 words):** the scene path and built page; the step list, one line each; what the reader does besides pressing Next; the quiz results; what you think is strongest and weakest; where Rayner helped or got in the way.

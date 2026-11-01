<!-- The Rayner builder's brief. Fill {TOPIC}, {ID}, {SCRIPT}, {REMEMBER}, {CHECKS} and {TRANSFER}. The script, transfer and requirements match build-plain.md word for word; neither brief says how to teach. -->
Build the best educational explainer you can of {TOPIC} with Rayner, as the scene `scenes/explainers/{ID}/`. Read `skills/rayner-explainers/SKILL.md` and use it (the script is already approved, below). Don't read any other attempt at this topic.

**The approved script** (keep its meaning and order; you may add around it). Save it as `scenes/explainers/{ID}/script.md`, and put its answer in `meta.answer` and its check questions, with answers, in `meta.checks`:
> {SCRIPT}

**Sentence to remember:** {REMEMBER}

**Check questions:**
{CHECKS}

**Transfer exercise** (part of the script): {TRANSFER}

**Requirements.** Make it teach as well as you can, in whatever way you judge best. It must be correct, and readable and usable on a 390 px phone as well as a desktop.

**Evidence for the comparison.** `npm run rayner -- review scenes/explainers/{ID}/scene.ts` must pass. Build the page with `npm run rayner -- build`, make a contact sheet with `npm run rayner -- shots`, and look at it.

**Report back (under 500 words):** the scene path and built page; the step list, one line each; what the reader does besides pressing Next; what you think is strongest and weakest; where Rayner helped or got in the way.

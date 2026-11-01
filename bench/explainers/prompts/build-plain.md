<!-- The no-Rayner builder's brief. Fill {TOPIC}, {OUT}, {SCRIPT}, {REMEMBER}, {CHECKS} and {TRANSFER}; keep the rest identical to build-rayner.md's shared parts. -->
Build the best educational web explainer you can of {TOPIC}, as a single self-contained HTML page, in whatever way you think teaches best. **Do not use the Rayner engine or anything in this repository, and do not read it.** This is a baseline for comparison with Rayner, so it must reflect your own approach. You may use plain HTML, CSS, SVG, canvas and vanilla JavaScript, written inline. No external libraries or network requests: everything lives in the one file.

Write your work in `{OUT}`. Commit it there when done; don't push.

**The approved script** (keep its meaning and order; you may add around it):
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

**Make it step-through.** The reader advances with a Next button, so the page can be compared with other step-through explainers. Within that, you are free to add any interactivity that helps.

**Evidence for the comparison.** Use Playwright to capture the page:
- Screenshot every step at 1280×720 and at 390×844 into `{OUT}/out/`, named `<step>-1280.png` and `<step>-390.png`.
- Write `out/transcript.json`, listing each step's visible heading and text in order.
- Write `out/contact.png`, one image with every 1280 screenshot in a grid.
- Look at your screenshots and fix what you see.

**Report back (under 500 words):** the paths to `index.html`, `out/contact.png` and `out/transcript.json`; the step list, one line each; what interactivity you added; how you checked correctness and accessibility; what you think is strongest and weakest.

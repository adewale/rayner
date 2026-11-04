<!-- The no-Rayner builder's brief. Fill {TOPIC}, {OUT}, {SCRIPT}, {REMEMBER}, {CHECKS} and {TRANSFER}. The script, transfer and requirements match build-rayner.md word for word; neither brief says how to teach. -->
Build the best educational web explainer you can of {TOPIC}, as a single self-contained HTML page, in whatever way you think teaches best. **Do not use the Rayner engine or anything in this repository, and do not read it.** This is a baseline for comparison with Rayner, so it must reflect your own approach. You may use plain HTML, CSS, SVG, canvas and vanilla JavaScript, written inline. No external libraries or network requests: everything lives in the one file.

Write your work in `{OUT}`. Commit it there when done; don't push.

**The approved script** (keep its meaning and order; you may add around it):
> {SCRIPT}

**Sentence to remember:** {REMEMBER}

**Check questions:**
{CHECKS}

**Transfer exercise** (part of the script): {TRANSFER}

**Requirements.** Make it teach as well as you can, in whatever way you judge best. It must be correct, and readable and usable on a 390 px phone as well as a desktop.

**Make it step-through.** The reader advances with a Next button, so the page can be compared with other step-through explainers; everything else about it is your choice.

**Evidence for the comparison.** Use Playwright to capture the page:
- Screenshot every step at 1280×720 and at 390×844 into `{OUT}/out/`, named `<step>-1280.png` and `<step>-390.png`.
- Write `out/transcript.json`, listing each step's visible heading and text in order.
- Write `out/contact.png`, one image with every 1280 screenshot in a grid.
- Look at your screenshots and fix what you see.

**Report back (under 500 words):** the paths to `index.html`, `out/contact.png` and `out/transcript.json`; the step list, one line each; what interactivity you added; how you checked correctness and accessibility; what you think is strongest and weakest.

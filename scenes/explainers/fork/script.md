# Script: why build the page before readers open it?

Questions the reader brings: Rayner pages are prebuilt HTML; why not run the scene live? What does a reader's setting cost? What did forking Lantern give up?

The token bucket explainer lets the reader choose a refill rate of 1, 2 or 4 tokens a second. Choosing one starts no computation: the build already ran the scene once per option, captured its diagrams and checked it. Each choice is a case made before anyone reads. The reader is asked: add a policy setting with two options; how many cases then?

Six. That is the answer: every combination of settings is a case the build runs, draws and checks before anyone opens the page. Three rates and two policies make six, and every further setting multiplies again. The reader can switch among those cases and no others; an input with no fixed options would need the model running in the page and checks for values nobody tried.

For each case, Agentic Mermaid draws each diagram in Chromium at build time and the snapshot is stored beside the scene, so the page runs no diagram renderer and has no runtime dependency. The cost lands on the author, who needs Chromium to capture a new diagram.

Each case must then pass rayner check's 13 checks: motion and clock (motion, still during the caption, seek equals play, skipped trace), resting pictures (each step changes, text collisions, routes over labels, legibility), words (descriptions, glyphs, the stated answer) and code (catch lint, bare runtime). Six cases means 78 checks; another two-option setting doubles it.

What building first gave up: Lantern, which Rayner forks, ran each scene live, with a development player and a Cloudflare Worker serving frames, text and traces on request. The fork deleted that path. The player and parser have replacements; the JSON format and the Worker's endpoints have none, so a page cannot answer for a case nobody built.

**The aha:** the three-row card of cases becomes a three-by-two grid: settings multiply, and everything the build does is multiplied with them.

**Sentence to remember:** every combination of settings is a case the build runs, draws and checks before anyone opens the page.

**Check questions**, in `meta.checks`, asked after the last step:

1. The token bucket's refill rate has 3 options. Add a policy setting with 2: how many cases does the build make, and how many checks run?
2. What could a reader get from Lantern's Worker that a built page cannot give?
3. Which part of the build needs Chromium, and does the page?

**Cases:** one. The internal contrast is the token bucket's one setting against a hypothetical second, and Lantern's live path against the build. The engine itself (Bézier points, the clock, seeking by replay) is the lantern explainer's subject and is not repeated here.

| Step | Script | Reader predicts |
| --- | --- | --- |
| settings | paragraph 1: three options, three cases | how many cases a second setting makes |
| cases | paragraph 2: the answer, the 3 × 2 grid | |
| fork | paragraph 3: diagrams captured per case, no renderer in the page | |
| checks | paragraph 4: 13 checks per case | |
| timing (detail) | the page holds each picture for its caption, from the fork step's own timing | |
| removed | paragraph 5: what building first deleted | |

# Script: why build the page before readers open it?

Questions the reader brings: Rayner pages are built ahead of time, with a fixed list of cases. Why can't a reader type any value they like? What does the fixed list buy, and what does it cost?

Rayner's token bucket explainer sends ten requests through a bucket that refills at 1, 2 or 4 tokens a second, the only rates its reader can choose. Its last step says R10 is accepted at every rate. On the page that is true: at each offered rate R10 arrives after a four-second wait and finds at least one token. A page could instead take any rate a reader types and show the same sentence. The reader predicts: is it true at 0.1 tokens a second?

No. The same model at 0.1 tokens a second refuses R7, R8 and R9, and five seconds after the burst only 0.5 tokens have come back, so R10 gets 429. The author ran and read all three offered cases, but nobody can do that for every rate a reader might type. The answer: Rayner builds every case before anyone reads it, so the author can check each one, and a reader can open only a case that was checked.

Lantern, the animation engine Rayner was forked from, rendered on request: its Cloudflare Worker re-ran a scene to whatever step or time a client asked for and served the frame, caching nothing. Rayner deleted the Worker. The bottom row broke because 0.1 is a rate nobody listed, so nobody ran it, and a page built ahead would break the same way if it let readers type a rate. The token bucket's one setting lists three rates, the build runs one case for each, and the page offers no box for typing another.

The price is that settings multiply. Rayner's traffic-policy explainer has two settings, externalTrafficPolicy with 2 options and the placement of pods on its three nodes with 3, so its build makes 6 cases, and a third setting would multiply that again.

After the ending, two details: for each case the build captures every diagram once (Agentic Mermaid in Chromium, the snapshot stored beside the scene, so the page runs no diagram renderer); and the page holds each resting picture for its caption, timed from the fork step. The earlier `checks` detail, with its hand-kept count of 13 checks, is cut. `fork` and `timing` stay as details because `test/explain-fidelity.test.ts` holds the timing step to the fork step's own trace timing.

**The aha:** a fourth row slides in under the three offered rates, and R10's circle, accepted in every built row, is a cross at 0.1 tokens a second.

**Sentence to remember:** every combination of settings is a case the build makes, and the author checks, before anyone opens the page.

**Check questions**, in `meta.checks`, asked after the last step:

1. R8 and R9 arrive together at 1 s. If the author moved R10 from 5 s to 1.5 s, at which offered rate would "R10 is accepted at every rate" become false, and could a reader see it? (At 1 token a second, where R8 spends the token back by 1 s and R10 finds half a token; only if the author published without reading that built case.)
2. A shared link ends in `?rate=0.1`. What does the reader see? (The player finds no such option and opens the default case, 2 tokens a second, with "Unknown rate option: 0.1. Showing the default case." from `app/embed-strings.ts`.)

**Cases:** one. The contrast is inside the story: the offered rates against one the page never built, and Lantern's live Worker against the build. The engine itself (the clock, seeking by replay) is the lantern explainer's subject.

| Step | Script | Reader predicts |
| --- | --- | --- |
| sentence | paragraph 1: "R10 is accepted at every rate", true at 1, 2 and 4 | whether it holds at 0.1 |
| untested | paragraph 2: R10 refused at 0.1, and the answer (the aha) | |
| live | paragraph 3: Lantern's Worker rendered any frame; the risk is a rate nobody listed | |
| cases | paragraph 4: the price, traffic-policy's 3 × 2 cases (the ending) | |
| fork (detail) | paragraph 5: diagrams captured per case; Lantern's parts morph into the fork's | |
| timing (detail) | paragraph 5: the page holds each picture for its caption, from the fork step's own timing | |

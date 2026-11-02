# Script: why build the page before readers open it?

Questions the reader brings: Rayner pages are built ahead of time, with a fixed list of cases. Lantern, which Rayner forks, rendered whatever it was asked for. Why give that up?

Lantern's Cloudflare Worker re-ran a scene to whatever step or time a client asked for and served the frame, its text or the trace, caching nothing. Rayner deleted it. Its token bucket explainer offers a refill rate of 1, 2 or 4 tokens a second and nothing else. What does a fixed list buy?

The token bucket sends ten requests, and its last step says R10 is accepted at every rate. On the page that is true: at each offered rate R10 arrives after a four-second wait and finds at least one token. A page that took any rate would show the same sentence for rates nobody tried. The reader predicts: is it true at 0.1 tokens a second?

No. The same model at 0.1 tokens a second refuses R7, R8 and R9, and five seconds after the burst only 0.5 tokens have come back, so R10 gets 429. That is the answer: Rayner builds every case before anyone reads it so that every case can be checked; a reader can reach only a case that has been run, drawn and checked. Three cases can all be run, read and checked; every rate a reader might type cannot.

The price is that settings multiply. A second setting with two options makes six cases, and each further setting multiplies again. For each case the build draws every diagram once: Agentic Mermaid captures it in Chromium and the snapshot is stored beside the scene, so the page runs no diagram renderer. Lantern's JSON document, parser, development player and Worker are gone.

Each case must then pass rayner check's 13 checks, and rayner describe prints every caption of every case. None of that can be done for a case nobody built, which is why Rayner gave up the live input.

**The aha:** a fourth row slides in under the three offered rates, and R10's circle, accepted in every built row, is a cross at 0.1 tokens a second.

**Sentence to remember:** every combination of settings is a case the build runs, draws and checks before anyone opens the page.

**Check questions**, in `meta.checks`, asked after the last step:

1. Below what refill rate would the token bucket's R10 be refused, and why can no reader of that page see it? (Below 0.2 tokens a second, where 5 × rate is under one token; the page offers only the three rates it built.)
2. A reader wants 3 tokens a second. What does the page give them, and what must its author do to offer it? (Nothing; add a '3' option, and the build runs, draws and checks that case.)

**Cases:** one. The contrast is inside the story: the offered rates against one the page never built, and Lantern's live Worker against the build. The engine itself (the clock, seeking by replay) is the lantern explainer's subject.

| Step | Script | Reader predicts |
| --- | --- | --- |
| live | paragraph 1: Lantern's Worker against three fixed rates | what a fixed list buys |
| sentence | paragraph 2: "R10 is accepted at every rate", true at 1, 2 and 4 | whether it holds at 0.1 |
| untested | paragraph 3: R10 refused at 0.1, and the answer (the aha) | |
| cases | paragraph 4: the price, a 3 × 2 grid | |
| fork | paragraph 4: diagrams captured per case; Lantern's parts morph into the fork's | |
| checks | paragraph 5: 13 checks per case; the sentence to remember | |
| timing (detail, after the ending) | the page holds each picture for its caption, from the fork step's own timing | |

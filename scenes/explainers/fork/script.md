# Why build the page before readers open it?

- **Reader:** has read or written a Rayner explainer, or is deciding whether to, and has noticed that a page offers a few settings rather than free input; may know that Rayner was forked from Lantern.
- **Answer:** Rayner builds every scenario before anyone reads it, so rayner check can test each one and the author can read it, and a reader can open only a scenario the build made
- **Changed condition:** none: the page has no settings. It compares the token bucket's three offered refill rates, where "R10 is accepted at every rate" holds, with an unoffered 0.1 tokens a second, where R10 is refused; and a link naming a listed rate with one naming 0.1, which opens the default scenario.
- **Reader's own work:** predict whether the sentence survives 0.1 tokens a second before the answer; answer the check questions, which move R10 earlier, follow a shared link with an unlisted rate, and count the scenarios a new setting would add.
- **Checked against:** no model of its own. Its rows come from the token bucket's model, which that explainer's model test compares with golang.org/x/time/rate v0.15.0 on the same schedule at 1, 2 and 4 tokens a second (not at 0.1, whose answer `fidelity.ts` works out by hand); `fidelity.ts` also holds the rows, the scenarios and the two links to the token-bucket scene's own traces and settings resolver, and `model.test.ts` holds the claims about Lantern to Lantern's source at commit 2c7bad5 and to this tree.
- **Leaves out:** a deployed rate limiter (the rows are the explainer's model); running Lantern's Worker, which is read from its source rather than measured; the traffic-policy scene's six scenarios, which are counted but not drawn; how many settings a page can afford.

## Check yourself

1. On the token bucket page, R8 and R9 arrive together at 1 s. If its author moved R10 from 5 s to 1.5 s, at which offered rate would ‘R10 is accepted at every rate’ become false, and could a reader see the false sentence?
   At 1 token a second. There R8 spends the one token that has come back by 1 s, so at 1.5 s the bucket holds half a token and R10 gets 429; at 2 and 4 tokens a second it is still accepted. A reader could see it only if the author published without reading that scenario, because 1 token a second is a scenario the build makes and the author can run and read.
2. Someone shares a link to the token bucket page that ends in ?rate=0.1. What does the reader see, and do they meet the false sentence about R10?
   The player looks for 0.1 among the rates the scene lists, finds none, and opens the default scenario, 2 tokens a second, with the notice “The setting “Refill per second” has no option “0.1”. Showing the default scenario.” The reader sees a scenario the author ran, where R10 is accepted; the 0.1 row exists only in this explainer.
3. The traffic-policy page has two policies and three pod placements. Its author wants a third setting, the number of nodes, with four values. How many scenarios would the build make and the author need to read, and when is such a setting worth adding?
   Twenty-four: 2 × 3 × 4. Each is built, checked and must be read before publishing, so a setting earns its place when one of its values changes what the page concludes, not merely a number on it.

## Why this explainer

This is the explainer about Rayner's own central design decision: a page is built before anyone reads it, and a reader can open only the scenarios the build made. The obvious objection is that this loses freedom of input. The answer the reader should take away is that it buys something specific, a finite set of outcomes an author can run, check and read, and not something it does not: a sentence true of the declared inputs is still not true of every input.

The token bucket supplies the example because one of its own captions, "R10 is accepted at every rate", is true of the three rates it offers and false at 0.1, using the same model and the same request schedule. Holding the 0.1 run beside the three offered rates makes the gap concrete, and the choice step then shows why no reader of the token-bucket page meets it. The 0.1 row exists only in this explainer.

It ends on the cost, settings multiplying scenarios, because that is the practical boundary an author meets. Lantern's live Worker, the architecture morph and the reading-time detail come after the ending as details: history and mechanism for a reader who wants them, not part of the argument.

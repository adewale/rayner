# Why build the page before readers open it?

A token bucket page offers refill rates of 1, 2 and 4 tokens a second. Its last request, R10, succeeds at all three, so a caption says it is accepted at every rate. Would that sentence survive a reader typing 0.1?

At 0.1 tokens a second the same request schedule ends differently. Five seconds after the burst the bucket has recovered only half a token, and R10 needs a whole one, so it is refused. The sentence was true of every case the page offered; nothing in the model made it true of every rate.

Rayner answers by not letting the reader type 0.1. Before publishing, the build runs every combination of the options a scene declares, so each case's pictures and captions exist, and `rayner check` tests them, before anyone reads the page. The reader chooses among those cases, and a link naming a rate outside the list opens the default case instead.

That makes review finite. An author can read the caption in each of the three offered cases and correct it before readers see the page. A program that accepted any rate would need a rule that stays true across that wider input space, and building ahead does not supply one: a false caption can still be published if its author never reads the prepared cases.

The restriction has a cost. Two traffic-policy options combined with three pod placements make six cases, and each further setting multiplies the count again. Prepared cases trade freedom of input for a bounded set of outcomes that someone can inspect.

The fork from Lantern made this choice. Lantern's Worker rendered any requested step or time on demand; Rayner prepares the page and its diagrams before anyone reads it. Building ahead makes a page's evidence reviewable. It does not turn a statement about the declared inputs into a statement about every input.

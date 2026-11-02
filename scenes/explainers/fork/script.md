# Why build the page before readers open it?

A token bucket page offers refill rates of 1, 2 and 4 tokens a second. Its last request, R10, succeeds at all three, so a caption says it is accepted at every rate. Would that sentence survive a reader typing 0.1?

At 0.1 tokens a second, the same request schedule ends differently. Five seconds after the burst the bucket has recovered only half a token, and R10 needs one. It is refused. The sentence was true across the page’s offered cases, but the model did not make it true across arbitrary rates.

Rayner prepares a fixed set of cases before publishing. The build runs the combinations of declared options, so their pictures and captions can be checked together. The reader chooses among those cases. A rate outside the list does not silently become another supported case.

This makes review finite. An author can inspect whether a caption holds for the three offered rates and correct it before readers see the page. A program accepting arbitrary input would need a rule that remains valid across that wider input space. Building ahead does not supply that rule, and a false caption can still be published if its prepared cases are not read.

The restriction also has a cost. Two traffic-policy options combined with three pod placements make six cases. Adding another setting multiplies the combinations again. Prepared cases trade some freedom of input for a bounded collection of outcomes that can be inspected.

The fork from Lantern reflects that choice. Lantern’s Worker rendered requested scene times on demand; Rayner prepares the page and its diagrams ahead of reading. The important boundary is the declared input set: prebuilding a page helps make its evidence reviewable, but it does not turn a statement about those inputs into a statement about all possible inputs.

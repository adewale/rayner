# Construction notes

The comparison conditions on the particular observation “B opened to a goat”, not merely on some goat being shown. The informed host's random tie-break is therefore essential. Changing that rule can change the odds after observing B even if the host still knows where the car is.

Round cells have probability-weighted widths. Use those widths, not a count of drawn cells: a forced goat choice and a coin-flip choice do not have equal weight. The morph keeps staying's one-sixth share while splitting the informed host's switching third into a goat-opening sixth and a car-opening sixth.

The displayed cases use three doors, an equally likely car position and first pick A. Selecting a different first pick would relabel the doors without adding a new conclusion. More doors, uneven priors and other host rules are not displayed cases. The model has additional checks, but those should not be described as pictures the reader saw.

The changed-host and uneven-prior exercises live in `scene.ts` under `meta.checks`. They test whether the reader can rebuild the conditioned widths, rather than repeat the usual Monty Hall slogan.

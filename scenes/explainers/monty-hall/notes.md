# Construction notes

The comparison conditions on the particular observation “B opened to a goat”, not merely on some goat being shown. The informed host's random tie-break is therefore essential. Changing that rule can change the odds after observing B even if the host still knows where the car is.

Round cells have probability-weighted widths. Use those widths, not a count of drawn cells: a forced goat choice and a coin-flip choice do not have equal weight. The morph keeps staying's one-sixth share while splitting the informed host's switching third into a goat-opening sixth and a car-opening sixth.

The displayed cases use three doors, an equally likely car position and first pick A. Selecting a different first pick would relabel the doors without adding a new conclusion. More doors, uneven priors and other host rules are not displayed cases. The model has additional checks, but those should not be described as pictures the reader saw.

The doors are one round of a machine (`roundNext` in `lib/monty-hall.ts`): pick, the host opens a door, stay or switch, the car is shown. Its state is what the reader knows, so where the car is stays unknown until a door shows it, and the rules' refusals (he never opens your door; the host who knows never opens the car; a round whose car he opened is over) are `roundNext` returning undefined. The choice step plays its first two events; `rayner check` explores the rest (46 rounds' states for the host who knows, 52 for the random host) and plays each authored door opening, switch and reveal. The machine does not carry the odds: every round it reaches is a cell of the strip (test/learning-models.test.ts), and the strip gives each its width.

The changed-host and uneven-prior exercises live in `scene.ts` under `meta.checks`. They test whether the reader can rebuild the conditioned widths, rather than repeat the usual Monty Hall slogan.

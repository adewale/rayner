# Why does the host’s rule change the odds of switching?

- **Reader:** has met the Monty Hall puzzle, or can follow it in a sentence, and either distrusts the 2-in-3 answer or knows it as a slogan without knowing why it depends on the host.
- **Answer:** Switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat
- **Changed condition:** the host's rule. With the host who knows, the car behind C forces him to open B, so the cells that open B to a goat give switching two sixths against staying's one: 2 in 3. With the random host, the car behind C opens B only half the time (the other half shows the car and ends the round), so each choice keeps one sixth: 1 in 2.
- **Reader's own work:** predict whether switching matters and whether the host's knowledge changes that; find the cells that could have opened B to a goat and add their widths before the answer; choose the host rule; play the round's doors; then the two check questions, which change the host's rule and the car's prior.
- **Checked against:** Nothing external: `model.test.ts` checks the model against an independent enumeration of every (car, opened door) round in integer twelfths for each first pick and four host rules (and of every physical world for 3 to 25 doors), including the check answers' 50%, 60% and 42.9%, which `answers.ts` computes from the model, and checks that every state the playable round reaches is a cell of the strip; `fidelity.ts` holds each step's state to the model.
- **Leaves out:** more doors, uneven priors and other host rules as drawn scenarios (the model tests them; the page draws three doors, an equally likely car and a first pick of A); first picks other than A, which only relabel the doors.

## Check yourself

1. This host knows where the car is. When your first pick is right, he opens one of the two goats at random. When it is wrong, he tosses a coin: heads, he opens the car and the round ends; tails, he opens the other goat. You pick A and he opens B to a goat. How often does switching win, and which strip in the last step is his?
   50.0%. His strip is the random host’s, cell for cell: with the car behind B or C, he opens each unchosen door half the time, so one of the two sixths in each wrong-pick third shows the car. He knows where the car is, but his rule gives each round the random host’s chance, and those chances set the odds.
2. The producers hide the car behind A 40% of the time and behind B or C 30% each. You pick A and the host opens B to a goat. How often does switching win with the host who knows, and with the random host?
   With the host who knows, 60.0%: the car-behind-A rounds now fill 40% of the strip and he opens B in half of them, 20%, while all of the car-behind-C rounds, 30%, open B. With the random host, 42.9%: he opens B in only half of the car-behind-C rounds, 15%, against the same 20%.

## Why this explainer

The usual Monty Hall explanation ends at "switch, it's 2 in 3", which leaves the reader unable to say what that depends on. This explainer puts the host's rule at the centre: the same goat behind B is the same evidence for both hosts, and what differs is how often each host's rule would have produced it.

The comparison conditions on the particular observation, B opened to a goat, not merely on some goat being shown. That makes the informed host's coin toss between two goats essential: it is why the car-behind-A rounds give B only a sixth. The check questions lean on this, asking the reader to rebuild the conditioned widths for a host who knows but tosses a coin, and for an uneven prior, rather than repeat the slogan.

Every round is drawn as a cell as wide as its chance, because counting drawn cells gives the wrong answer: a forced goat and a coin-flip goat do not weigh the same. The last step morphs one host's strip into the other's, keeping staying's sixth and splitting the informed host's switching third into a goat-opening sixth and a car-opening sixth, so the reader sees exactly where switching loses half its qualifying rounds.

The doors at the start are one round of a machine whose state is what the reader knows: the car's place stays unknown until a door shows it, and the rules refuse what they forbid (he never opens your door; the host who knows never opens the car; a round whose car he opened is over).

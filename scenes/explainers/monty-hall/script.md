# Script: why does the host's rule change the odds of switching?

Questions the reader brings: Is switching in the Monty Hall problem really better? Why isn't it 50/50 once two doors are left? People say it depends on what the host knows: how?

You pick door A. A car is behind one of three doors and goats are behind the other two. The host opens B, shows a goat, and offers you C. With two doors still closed, the odds look even, and whether you should switch turns on what the host knew and how he chose which door to open. Ask the reader before any arithmetic: would you switch, and would your answer change if the host had opened a door at random and happened to show a goat?

Answer for the reader's own host first, by laying out every round with the first pick fixed at A as one strip, each round as wide as its chance, with a key that says what a cell's three words mean. From this first strip on, only the rounds where he opens B to a goat count, and the rest are greyed. The car is behind each door a third of the time. The host who knows opens B or C at random when the car is behind A, and must open B when it is behind C, so of the three sixths left, two are switching wins: 2 in 3. The random host opens B or C with equal chance wherever the car is, so every round is a sixth; two sixths open B to a goat, one with the car behind A and one with it behind C, so staying and switching win one each.

Then the other host, on the same strip, with motion. Step 4's caption opens with the answer: switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat. Both strips hold the same rounds. With the car behind A, either host opens B in one sixth. With it behind C, the host who knows must open B, so that whole third opens B; the random host opens B in only half of it and opens the car in the other half. The odds come from how likely each host was to open the door you saw. That is why the answer names the tie-break, and why a host who knows can still give 1 in 2, as the first check question shows.

**The aha:** the two strips are the same rounds. With the car behind C, the random host opens the car in half the rounds where the host who knows opens B, so switching loses half its share while staying keeps its sixth.

**Sentence to remember:** switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat.

**Check questions**, in `meta.checks`, asked after the last step. Each changes the rule or the strip's widths in a way no step shows:

1. A host who knows where the car is opens a goat at random when your pick is right, and tosses a coin when it is wrong: heads he opens the car, tails the other goat. He opens B to a goat. How often does switching win, and which strip is his? (1 in 2: his strip is the random host's, cell for cell.)
2. The car is behind A 40% of the time and behind B or C 30% each. You pick A and the host opens B to a goat. How often does switching win with each host? (60% with the host who knows: 30 against 20. 42.9% with the random host: 15 against 20.)

**The reader's lever:** the host rule (`host`) decides which round is played, which strip the count starts from, and which way the strips morph at step 4: splitting for the host who knows, merging for the random host. The first pick is always A; a setting for it only relabelled the doors, so it went.

| Step | Script | Reader predicts |
| --- | --- | --- |
| choice | paragraph 1: your pick, the host's goat, and the missing question | |
| predict | paragraph 1: the two questions | stay or switch; whether the host's knowledge matters |
| odds | paragraph 2: your host's strip, greyed to the rounds that open B, and his odds | |
| worlds | paragraph 3: the answer; the other host's strip, morphed from yours, and the aha | |

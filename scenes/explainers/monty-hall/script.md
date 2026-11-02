# Script: why does the host's rule change the odds of switching?

Questions the reader brings: Is switching in the Monty Hall problem really better? Why isn't it 50/50 once two doors are left? People say it depends on what the host knows: how?

You pick door A. A car is behind one of three doors and goats are behind the other two. The host opens B, shows a goat, and offers you C. With two doors still closed, the odds look even, and whether you should switch turns on what the host knew. Ask the reader before any arithmetic: would you switch, and would your answer change if the host had opened a door at random and happened to show a goat?

Answer for the reader's own host first, by laying out every round with the first pick fixed at A as one strip, each round as wide as its chance. Say at once that this counts rounds where he opens C too, and that the last step keeps only the ones that match the goat behind B. The car is behind each door a third of the time. The host who knows picks between B and C at random when the car is behind A, and must open the one goat otherwise, so in both wrong-pick thirds the car is behind the door he leaves closed: switching wins 2 in 3. The random host opens B or C with equal chance wherever the car is, so every round is a sixth; in two sixths he opens the car and the game ends, and of the four that show a goat, staying and switching win two each.

Then the other host, on the same strip, with motion. Step 4's caption opens with the answer: switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat. Each wrong-pick third splits in two, and in one half the random host opens the car; the host who knows never opens the car, so those halves are switching wins for him.

Last, the door the reader actually saw. Keep only the rounds where he opens B and shows a goat. With the car behind A, either host opens B half the time; with it behind C, the host who knows must open B, so C is twice as likely as A, while the random host opens B half the time either way. The odds come from how likely each host was to open the door you saw. That is why the answer names the tie-break: a host who knows but prefers B would change the odds after B opens. The check questions apply the rule to new cases: that host, a host chosen by a coin toss, and a hundred doors.

**The aha:** the two strips are the same rounds. The random host's car rounds are carved out of the informed host's switching wins, half of each wrong-pick third, while staying keeps its third.

**Sentence to remember:** switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat.

**Check questions**, in `meta.checks`, asked after the last step. Each is a case the steps don't show:

1. A host who knows always opens B when B hides a goat. You pick A and he opens C. Switch? (Yes, and you win every time: he opens C only when B hides the car. Had he opened B, switching would win 1 in 2.)
2. A coin decides the host before the game: heads, the host who knows; tails, the random host. You don't see it. You pick A and he opens B to a goat. How often does switching win? (3 in 5: the rules step's sixths, 3 with 2 switching wins for one host and 2 with 1 for the other, added.)
3. 100 doors, a random host opens 98. How often is there a switch offer, and what are the odds then? (2% of rounds; then 50/50.)

**The reader's lever:** the host rule (`host`) decides which round is played, which strip the count starts from, and which way the strips morph at step 4: splitting for the host who knows, merging for the random host. The first pick is always A; a setting for it only relabelled the doors, so it went.

| Step | Script | Reader predicts |
| --- | --- | --- |
| choice | paragraph 1: your pick, the host's goat, and the missing question | |
| predict | paragraph 1: the two questions | stay or switch; whether the host's knowledge matters |
| odds | paragraph 2: your host's strip, and his odds | |
| worlds | paragraph 3: the answer; the other host's strip, morphed from yours, and the aha | |
| rules | paragraph 4: only the rounds that show your goat behind B | |

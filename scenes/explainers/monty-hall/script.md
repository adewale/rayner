# Script: why does the host's rule change the odds of switching?

Questions the reader brings: Is switching in the Monty Hall problem really better? Why isn't it 50/50 once two doors are left? People say it depends on what the host knows: how?

You pick door A. A car is behind one of three doors and goats are behind the other two. The host opens B and shows a goat, then offers you C. Ask the reader two things before any arithmetic: would you switch, and would your answer change if the host hadn't known where the car was and had simply opened a door at random?

Play the round out once: the car was behind C, so switching wins this time. One round can't say which choice wins more often, so list every placement of the car with your pick fixed at A, for both hosts, side by side. The host who knows has three equally likely rows: the car behind A (he opens B or C, and staying wins), behind B (he must open C), behind C (he must open B). Switching wins two of the three. The random host has six equally likely rows, a car position and a door he happens to open, and in two of them he opens the car and the game ends. Of the four rows that show a goat, switching wins two. That is the answer, mid-story: switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat.

Why? A goat is evidence only when it could have been the car. The host who knows shows a goat in every round, so his goat rules nothing out: A still hides the car 1 time in 3, and in the other 2 he has left the car behind the door he didn't open. The random host shows the car in two rounds, both rounds where your first pick was wrong; seeing a goat rules exactly those out, leaving two rounds where your pick is right and two where it is wrong.

Scale it to 100 doors with the same rule. The host who knows opens 98 goats, and switching wins 99 times in 100. The random host shows the car in 98% of rounds, and in the 2% that go on, staying and switching are even. The last step puts the two rules side by side: the same two closed doors, odds set by the rule that produced them.

**The aha:** the two random-host rows that end with the car are exactly the wrong-pick rows the informed host turns into switching wins.

**Sentence to remember:** switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat.

**Check questions**, in `meta.checks`, asked after the last step:

1. With a host who knows where the car is, why doesn't his goat change the chance that your first door hides the car?
2. With a random host, which rounds does seeing a goat rule out, and why does that bring switching down to 1 in 2?
3. With 100 doors and a random host who opens 98 of them, how often does the game reach a switch offer, and what are the odds then?

The settings choose which host you play with in the round and at 100 doors (`host`), your first door (`choice`) and your decision (`strategy`). The side-by-side count and the last step show both hosts in every case.

| Step | Script | Reader predicts |
| --- | --- | --- |
| choice | paragraph 1: your pick, and the hint that the host's knowledge matters | |
| host | paragraph 1: the host opens a goat, under the chosen rule | |
| predict | paragraph 1: the two questions | stay or switch; whether the host's knowledge matters |
| reveal | paragraph 2: one round's outcome, and why it can't settle anything | |
| worlds | paragraph 2: both hosts' rows side by side, and the answer | |
| odds | paragraph 3: why, for the chosen host | |
| many | paragraph 4: 100 doors, same rule | |
| rules | paragraph 4: both rules, one table | |

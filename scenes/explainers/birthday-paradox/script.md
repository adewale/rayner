# Script: how many people make a shared birthday likely?

Questions the reader brings: How many people does a room need before two of them probably share a birthday? Why is the answer so small? Where does 50.7% come from?

Here is a room of people, each card one person's birthday, drawn at random. The model, like the Pudding's explainer, gives every day of a 365-day year the same chance and leaves out 29 February. A year has 365 days, so a match can seem to need a crowd: half of 365 is about 183. Count the cards (23) and guess the chance that two share a date before scanning the room. The step asks for the chance, so the room's size on screen does not give the answer away.

Look again: 26 Apr is on two cards, and so is 31 Jan. Is that luck? Of 1,000 random rooms of 23, 499 had a shared birthday, and the exact chance is 50.7%, so about half of all rooms of 23 have a match. That is the answer: a room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs, each a chance to match.

Why do we guess so high? Mark the first card as you. You make 22 comparisons, each a 1-in-365 chance, one square each in a column; the rest of the room's pairs sit faint beside it. The chance that someone shares your birthday is only 5.9%. An even chance would take 253 other people.

But a match doesn't have to include you. Each card adds a row with one square for every card before it, so the triangle holds 23 × 22 / 2 = 253 pairs. Two squares are red: the 26 Apr pair and the 31 Jan pair, the room's own matches. At least one pair matches in 50.7% of rooms of 23. And 253 is the number of comparisons your own even chance needed, when you had to make all 253 yourself against 253 others; here 23 people share the work. That is the ending.

**Details after the ending** (`detail: true`), for the reader who asks where 50.7% comes from:

- growth: each newcomer pairs with everyone already there. Two people make one pair, three make three, five make ten, and doubling 5 people to 10 takes the pairs from 10 to 45.
- exact: add people one at a time and ask each to miss every date taken so far: person 2 has 364 free dates of 365, person 23 has 343. Multiplying the 22 fractions gives 49.27% for no match, so 50.73% for at least one.
- estimate: if the 253 pairs missed independently, all would miss with chance 364/365 multiplied 253 times, 49.95%, leaving 50.05%, within a percentage point of the exact 50.73%; the gap comes from pairs that share a person: if Ann matches Ben and Ben matches Cal, Ann must match Cal. Your own 22 comparisons are independent, so for them the same product gives the exact 5.9%.

**The aha:** the column of 22 squares from you fills into a triangle of 253, and 253 is exactly the number of comparisons your own even chance needed; two of those squares are the matches you found in the room.

**Sentence to remember:** a room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs, each a chance to match.

**Check questions**, in `meta.checks`, ask the reader to transfer the mechanism to unseen conditions:

1. Two rooms of 23 merge. How many new pairs become possible, and why can’t their old match probabilities simply be added? (529 cross-room pairs; 1,035 total compared with 506 before. The old probabilities omit cross-room matches and overlap.)
2. On a planet with 100 equally likely birthdays, what is the smallest room with a better than even chance of a match? (13 people: 55.7%, against 49.7% for 12. Apply the person-by-person product to the smaller calendar.)

An experienced reader may solve these without the lesson. That does not invalidate them: the question is whether a newcomer can explain and apply the mechanism after reading. The seeded cards illustrate one room; recalling their dates is not the learning objective. `test/learning-models.test.ts` checks the transfer calculations.

**Settings:** the room holds 10, 23 (the default) or 40 people. The 10-person room has no shared date, so no red square, and an 11.7% chance; the 40-person room shares the same two dates and has an 89.1% chance. The rooms come from one seeded sample, so the larger rooms begin with the smaller rooms' people, and `test/fixtures/learning-models.json` checks each sample against an independent Python oracle.

**Changed from the earlier version:** the 253-line web is now a triangle of squares, one per pair; growth, exact and estimate are details after the ending, which is now the 253 = 253 link.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| room | paragraph 1: the room, the model, the guess | 23 date cards | the chance of a shared birthday in a room this size |
| chance | paragraph 2: the room's own matches, the sample, the answer | the same cards, repeated dates outlined, the chance | |
| you | paragraph 3: comparing with yourself, 22 comparisons, 5.9%, 253 others | your column of 22 squares, the rest faint | how many comparisons the whole room makes |
| pairs | paragraph 4: 253 pairs, the room's two matches, and the same 253: the aha and the ending | the triangle of 253 squares, the matched pairs red | |
| growth | detail: each newcomer pairs with everyone there | a table of people, pairs and chance, with bars on one scale | |
| exact | detail: the person-by-person product | 365 days, 22 taken | do 253 pairs at 1 in 365 give the same chance? |
| estimate | detail: the shortcut against the exact chance, exact for your own comparisons | the shortcut and the exact chance | |

## Limits

The model gives every day of a 365-day year the same chance, leaves out 29 February and draws each birthday independently, so twins, seasons of births and real calendars' uneven days are out. The cards come from one seeded sample of 1,000 rooms (seed 137); another seed would show other dates and another count of matching rooms near the same exact chance.

No case shows a room other than 10, 23 or 40 people (the growth table lists 2, 3, 5, 10, 23 and 40), a year other than 365 days (the old 100-day check is asserted in the test only), or three people on one date (the second check adds one). The 253 other people an even chance of matching your birthday takes is computed and tested, not drawn.

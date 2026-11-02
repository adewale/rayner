# Script: how many people make a shared birthday likely?

Questions the reader brings: How many people does a room need before two of them probably share a birthday? Why is the answer so small? Where does 50.7% come from?

Here is a room of 23 people, each card one person's birthday, drawn at random. Like the Pudding's explainer, the model gives every day of a 365-day year the same chance and leaves out 29 February. A year has 365 days, so a match can seem to need a crowd: half of 365 is about 183. Guess how many people make a shared birthday an even bet, then scan the room.

Look again: 26 Apr is on two cards, and so is 31 Jan. Is that luck? Of 1,000 random rooms of 23, 499 had a shared birthday, and the exact chance is 50.7%, so a match is about as likely as not. That is the answer: a room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs.

Why do we guess so high? The Pudding's explainer notes that we usually picture this by comparing ourselves with 365 possible days. Mark one person as you. You make 22 comparisons, each a 1-in-365 chance, and the chance that someone shares your birthday is only 5.9%. An even chance would take 253 other people.

But a match doesn't have to include you. Each of the 23 pairs with 22 others, and that counts every pair twice, so the room holds 23 × 22 / 2 = 253 pairs: as many comparisons as your even chance needed, when you had to make all 253 yourself against 253 others. Here 23 people share the work. Two of the 253 lines are red: the 26 Apr pair and the 31 Jan pair, the room's own matches from the second step.

Each newcomer pairs with everyone already there. Two people make one pair, three make three, five make ten, and doubling 5 people to 10 takes the pairs from 10 to 45. At 40 people the pairs outnumber the people 19.5 to 1.

Where does 50.7% come from? Add people one at a time and ask each to miss every date taken so far: person 2 has 364 free dates of 365, person 23 has 343. Multiplying the 22 fractions gives 49.27% for no match, so 50.73% for at least one.

Now connect the pairs to that chance. Each pair matches with chance 1 in 365. If the 253 pairs missed independently, all would miss with chance 364/365 multiplied 253 times, 49.95%, leaving 50.05% for a match, within a percentage point of the exact 50.73%. The gap is there because pairs share people: if Ann matches Ben and Ben matches Cal, Ann must match Cal. Your own 22 comparisons are independent, because each sets a different person against your one birthday, so for them the same product, 364/365 multiplied 22 times, gives the exact 5.9%.

**The aha:** the star of 22 lines from you becomes a web of 253 lines across the room, and 253 is exactly the number of comparisons your own even chance needed; two of those lines are the matches you found in the room.

**Sentence to remember:** a room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs.

**Check questions**, in `meta.checks`, asked after the last step. Each is a new case no step shows, and `test/learning-models.test.ts` checks its numbers against the model:

1. Two rooms of 23 open into one room of 46. How many pairs, and how many new? (1,035; the 529 cross-room pairs, more than the two rooms' 506)
2. On a planet with a 100-day year, how many people make a shared birthday more likely than not? (13, making 78 pairs: 55.7%, against 49.7% for twelve)
3. On that planet, how many others for an even chance that one shares your birthday? (69: 50.0%, against 49.5% for 68)

**Settings:** the room holds 10, 23 (the default) or 40 people. The 10-person room has no shared date, so no red line, and an 11.7% chance; the 40-person room shares the same two dates and has an 89.1% chance. The rooms come from one seeded sample, so the larger rooms begin with the smaller rooms' people, and `test/fixtures/learning-models.json` checks each sample against an independent Python oracle.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| room | paragraph 1: the room, the model, the guess | 23 date cards | how many people for an even chance |
| chance | paragraph 2: the room's own matches, the sample, the answer | the same cards, repeated dates outlined, the chance | |
| you | paragraph 3: comparing with yourself, 22 comparisons, 5.9%, 253 others | a star of lines from you | how many comparisons the whole room makes |
| pairs | paragraph 4: 253 pairs, the same 253, and the room's two matches: the aha | every pair drawn, 253 lines, the matched pairs in red | |
| growth | paragraph 5: each newcomer pairs with everyone there | a table of people, pairs and chance, with bars on one scale | |
| exact | paragraph 6: the person-by-person product | 365 days, 22 taken | |
| estimate | paragraph 7: 253 pairs at 1 in 365, the shortcut against the exact chance, exact for your own comparisons | the shortcut and the exact chance | |

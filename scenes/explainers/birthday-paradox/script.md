# Script: how many people make a shared birthday likely?

Questions the reader brings: How many people does a room need before two of them probably share a birthday? Why is the answer so small? Where does 50.7% come from?

Here is a room of 23 people, each card one person's birthday, drawn at random. Like the Pudding's explainer, the model gives every day of a 365-day year the same chance and leaves out 29 February. A year has 365 days, so a match can seem to need a crowd: half of 365 is about 183. Guess how many people make a shared birthday an even bet, then scan the room.

Look again: 26 Apr is on two cards, and so is 31 Jan. That is common for a room this size. Of 1,000 random rooms of 23, 499 had a shared birthday, and the exact chance is 50.7%. That is the answer: just 23 people give a better than even chance that two share a birthday, because 23 people make 253 pairs.

Why do we guess so high? The Pudding's explainer notes that we usually picture this by comparing ourselves with 365 possible days. Mark one person as you. You make 22 comparisons, each a 1-in-365 chance, and the chance that someone shares your birthday is only 5.9%. An even chance would take 253 other people.

But a match doesn't have to include you. Each of the 23 pairs with 22 others, and that counts every pair twice, so the room holds 23 × 22 / 2 = 253 pairs: the same 253 comparisons you would need 253 other people to make on your own. The room gets them by pairing everyone with everyone.

Pairs grow far faster than people. Two people make one pair, three make three, five make ten: each newcomer adds a pair with everyone already there. Doubling 5 people to 10 takes the pairs from 10 to 45, and at 40 people the pairs outnumber the people 19.5 to 1.

Now connect the pairs to the chance. Each pair matches with chance 1 in 365. If the 253 pairs missed independently, all would miss with chance 364/365 multiplied 253 times, 49.95%, leaving 50.05% for a match. The exact chance is 50.73%: close, but pairs share people, and if Ann matches Ben and Ben matches Cal, Ann must match Cal. For your own 22 comparisons the same sum is exact, 5.9%, because each involves your one birthday.

**The aha:** the star of 22 lines from you becomes a web of 253 lines across the room, and 253 is exactly the number of comparisons an even chance needs.

**Sentence to remember:** a room makes a shared birthday likely long before it fills the year, because every person pairs with every other.

**Detail after the ending:** the exact count. Add people one at a time and ask each to miss every date taken so far: person 2 has 364 free dates of 365, person 23 has 343. Multiplying the 22 fractions gives 49.27% for no match, so 50.73% for at least one.

**Check questions**, in `meta.checks`, asked after the last step. Each is a new case no step shows, and `test/learning-models.test.ts` checks its numbers against the model:

1. A 24th person walks into the room of 23. How many new pairs, and how many in all? (23, and 276)
2. A room holds 30 people. How many pairs, and is a shared birthday more likely than not? (435; yes, 70.6%, shortcut 69.7%)
3. On a planet with a 100-day year, how many people make a shared birthday more likely than not? (13, making 78 pairs: 55.7%, against 49.7% for twelve)

**Settings:** the room holds 10, 23 (the default) or 40 people. The 10-person room has no shared date and an 11.7% chance; the 40-person room shares the same two dates and has an 89.1% chance. The rooms come from one seeded sample, so the larger rooms begin with the smaller rooms' people, and `test/fixtures/learning-models.json` checks each sample against an independent Python oracle.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| room | paragraph 1: the room, the model, the guess | 23 date cards | how many people for an even chance |
| chance | paragraph 2: the room's own matches, the sample, the answer | the same cards, repeated dates outlined, the chance | |
| you | paragraph 3: comparing with yourself, 22 comparisons, 5.9%, 253 others | a star of lines from you | how many comparisons the whole room makes |
| pairs | paragraph 4: 253 pairs, the same 253: the aha | every pair drawn, 253 lines | |
| growth | paragraph 5: pairs grow far faster than people | a table of people, pairs and chance, with bars on one scale | |
| estimate | paragraph 6: 253 pairs at 1 in 365, the shortcut against the exact chance; ends on the sentence to remember | the shortcut and the exact chance | |
| exact | detail after the ending: the person-by-person product | 365 days, 22 taken | |

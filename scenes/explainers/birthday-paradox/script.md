# How many people make a shared birthday likely?

- **Reader:** has heard of the birthday paradox, or guesses that a shared birthday needs a crowd of a hundred or more; can multiply chances but has not counted pairs.
- **Answer:** A room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs, each a chance to match
- **Changed condition:** the size of the room. Ten people make 45 pairs and share a birthday 11.7% of the time, and the sampled room of ten has no shared date; twenty-three make 253 pairs, just over an even chance; forty make 780, 89.1%. A marked person's own chance stays far lower at every size.
- **Reader's own work:** guess the chance for the room before searching its dates, and predict how many comparisons the whole room makes after seeing your own; choose a room of 10, 23 or 40; answer the check questions, which merge two rooms and shrink the calendar to 100 days.
- **Checked against:** exhaustive enumeration of every birthday assignment for calendars of 1 to 5 days and rooms of 1 to 5 people, and exact fractions and the seeded samples from an independent CPython 3.12 script (`tools/oracle/learning_models.py`, stored in `test/fixtures/learning-models.json`) for rooms of 10, 23, 40 and 50, both in `test/learning-models.test.ts`; that test also holds the answer's and check answers' numbers to the model.
- **Leaves out:** leap day, twins and seasonal birth patterns: birthdays are independent and equally likely over 365 days. A sampled room shows matches but not their probability.

## Check yourself

1. Two separate rooms each hold 23 people. When everyone joins one room, how many new pairs become possible, and why can’t you just add the two rooms’ match probabilities?
   529 new pairs: each of the 23 people in one room can now match each of the 23 in the other. The combined room has 1,035 pairs, compared with 506 within the two separate rooms. Adding the old probabilities misses the cross-room pairs and counts overlapping match events twice.
2. On a planet with 100 equally likely birthdays, would 23 people still be needed for a better than even chance of a shared birthday? Use the person-by-person calculation to find the smallest room.
   No: 13 people suffice. Multiply the chances of avoiding earlier birthdays, 100/100 × 99/100 × … × 88/100, and subtract from 1: about 55.7%. With 12 people it is about 49.7%. A smaller calendar makes each new pair more likely to match.

## Why this explainer

The surprise in the birthday problem comes from answering a different question: people think about a match with themselves, which does need 253 other people for an even chance. The explainer is built around that contrast. Marking one card as "you" and drawing your comparisons as a column, then filling in the triangle of every pair, lets the reader see that a room of 23 makes the same 253 comparisons by sharing them among everyone. Comparing the column with the triangle is the first and main explanation.

The room is a seeded sample so the reader has real dates to search, but a single room proves nothing about the chance, so the page says so and quotes the simulated and exact figures beside it. The setting is the room size because it changes the conclusion: ten people usually have no match, forty usually do.

The exact person-by-person product and the independent-pair shortcut stay as optional details after the main story. The shortcut is close but not exact, and the reason, that pairs share people, is worth showing to a reader who wants it, without making every reader work through it.

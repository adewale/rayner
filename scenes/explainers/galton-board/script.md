# Why do balls dropped through pegs pile up in a bell shape?

- **Reader:** someone who has seen a Galton board, or a histogram with a hump in the middle, and wonders why the middle wins when every bounce is a coin flip; knows what a coin flip is and has not met binomial coefficients.
- **Answer:** More routes lead to the middle bins than to the edges
- **Changed condition:** the bin, the number of rows and the pegs. On six rows 20 of the 64 routes end in the middle bin and 1 in each edge bin; on four rows 6 of 16 end in the middle. Bend every peg so a ball goes right three times in four and the same 64 routes pile up one bin from the right edge instead, 35.6% there against 13.2% in the middle.
- **Reader's own work:** predict which bin fills highest before the balls drop; answer the check questions, which shorten the board, ask for a route's bin and bend the pegs.
- **Checked against:** Python's standard library, which `model.test.ts` runs through `oracle/galton.py` each time: `math.comb` for the number of routes to every bin of boards with 0 to 12 rows, `fractions.Fraction` for each bin's chance when a peg sends the ball right three times in four, and `statistics.NormalDist` for the bell curve's height and areas; `answers.ts` computes the check answers from the model. No physical board was measured.
- **Grounding:** live: Python's math.comb and statistics.NormalDist, run by the model's tests
- **Leaves out:** what real balls do: collisions, spin, momentum carried from peg to peg, and pegs that are not quite fair, all of which widen or skew a real pile; boards with more rows, where the pile comes closer to the curve; why the normal curve in particular is the limit (the de Moivre-Laplace theorem). The bell curve here is laid over the counts, not derived.

## Check yourself

1. A smaller board has four rows of pegs, and one ball goes down every route. How many balls land in the middle bin, and why that many?
   6 of the 16. A route to the middle bin turns right at two of the four pegs, and there are 6 ways to choose which two; only 1 route, all lefts, reaches the left edge.
2. On the six-row board a ball turns left, right, right, left, right, left. Which bin does it land in, and how many other routes end there?
   The middle bin: it turned right 3 times, and a bin is the number of rights. 19 other routes end there, each with the same three rights in another order.
3. Someone bends every peg so that a ball goes right three times in four. The routes are the same 64. Does the middle bin still collect the most balls?
   No. The number of routes to each bin is unchanged, 20 to the middle, but the routes are no longer equally likely: every right is three times as likely as a left, so a route with more rights is more likely. The bin one from the right edge now collects the most, 35.6% of the balls, and the middle bin 13.2%.

## Why this explainer

The usual account of a Galton board names the binomial distribution and the central limit theorem and shows a simulation. A reader who does not already know those names learns that the pile is a bell, not why. The why is small enough to see: a bin is a number of rights, a route is one order for those rights, and there are more orders for three rights among six pegs than for none. So the board here is small, six rows and 64 routes, and the balls are not random: exactly one goes down every route, which makes the pile a count the reader can check by eye rather than a sample that happens to look right.

The first ball is followed hop by hop so that "route" means something before there are 64 of them. The prediction comes before the pile, because the tempting answer is that fair pegs give an even spread. The paths step is the explanation proper: one route to the edge, drawn, beside three of the twenty to the middle. Only then does the bell curve arrive, and it arrives as a description laid over the counts, with its share of the three middle bins beside the counted share, so that the reader does not take the curve for the cause.

The ending is where the curve is wrong. It gives an edge bin more than its one route, and it gives weight to bins the board does not have. That is the practical boundary: the curve is for the middle of a pile like this.

The third check question bends the pegs. It separates the two facts the answer rests on, that the routes are counted this way and that they are equally likely, by breaking only the second.

Galton described the board in Natural Inheritance (1889). The counts are checked against Python's math.comb and the curve against statistics.NormalDist each time the model's tests run.

# Why is 0.1 + 0.2 not 0.3?

- **Reader:** a programmer who has seen 0.30000000000000004 printed, or a failed equality test on two prices, and has been told "floating point is inexact"; knows what a fraction and a power of two are, not how a double is laid out.
- **Answer:** Each decimal, and then their sum, is rounded to the nearest number the machine can hold
- **Changed condition:** the second number. 0.1 + 0.2 falls exactly halfway between two doubles and is rounded up, one double past the one 0.3 is kept as, so the comparison is false. 0.1 + 0.3 also falls exactly halfway and is rounded up, but there the upper double is the one 0.4 is kept as, so the comparison is true. The inputs are inexact in both.
- **Reader's own work:** predict whether the sum is kept as the same double as the expected decimal before the rounding is shown; switch between 0.1 + 0.2 and 0.1 + 0.3; answer the check questions, which change the sum, repeat the addition ten times and ask for a sum that is exact.
- **Checked against:** CPython's own float, which `model.test.ts` runs through `oracle/doubles.py` each time: `float.as_integer_ratio` and `decimal.Decimal` for the exact fraction and every decimal digit of several hundred doubles, `math.nextafter` for their neighbours, `repr` for what each prints as, `fractions.Fraction` for the exact sum of two doubles, and float addition and `float()` for what the model's rounding must give. The same test holds the model's rounded sums and stored decimals to JavaScript's own `+` and `Number()` on this machine; `answers.ts` computes the check answers from the model.
- **Grounding:** live: CPython's float and this machine's JavaScript numbers, run by the model's tests
- **Leaves out:** the bit layout of a double (sign, exponent, fraction); negative numbers, zero, subnormals, infinities and NaN; subtraction, multiplication and division, which round the same way; other rounding modes; 32-bit floats; languages that print a fixed number of digits instead of the shortest decimal; decimal types, which have the same problem with thirds.

## Check yourself

1. Is 0.2 + 0.4 == 0.6 true or false, and what does the sum print as?
   False: the sum prints as 0.6000000000000001. 0.2 is stored a little high and 0.4 a little high; their exact sum falls exactly halfway between the double 0.6 is stored as and the next one up, and the tie goes to the one whose last bit is 0, the upper.
2. A loop adds 0.1 to a total ten times, starting from 0.1. Is the total 1?
   No: it is 0.9999999999999999. Each addition rounds its exact result to a neighbouring double, and over the nine additions the small errors do not cancel. Count in whole numbers (ten tenths) or compare with a tolerance instead of ==.
3. Why does 0.5 + 0.25 == 0.75 hold with no luck involved?
   0.5, 0.25 and 0.75 are a half, a quarter and three quarters: whole numbers over a power of two, so each is stored exactly, their sum is a double already, and nothing is rounded.

## Why this explainer

Most accounts of this stop at "0.1 cannot be represented in binary". That is true and it does not answer the question, because 0.3 cannot be represented either, and 0.1 + 0.3 == 0.4 is true although none of the three numbers is exact. The reader needs the second half: the sum of the two stored numbers is itself not a double, so it is rounded again, and equality holds only when that second rounding lands on the double the expected decimal was rounded to. Typing rounds one way and adding may round the other.

A number line is the picture for that, because the argument is about position: where the typed decimal falls between two doubles, where the exact sum falls, and which tick each ends on. The line shows four neighbouring doubles, the gap between them, the typed decimal as a ring and the double it is kept as as a dot, then the exact sum as a square that hops to its tick. In the default scenario the dot and the square end one tick apart; in the other they end on the same tick. The setting changes the conclusion, not just the digits.

Both sums are exact ties, which the model's test pins. The caption says so and says which way a tie goes, rather than implying the sum is merely "closer" to the upper double.

The print step answers the question the reader arrived with, where the 4 at the end comes from: the short decimal a language prints is the shortest one that names the double, and the sum's double needs seventeen digits to be told from its neighbour. The ending is the practical rule and its one honest exception, sums of halves and quarters.

The stored value's digits are cut on the stage after 22 places; the model holds all of them, and the test compares every digit with CPython's decimal.Decimal.

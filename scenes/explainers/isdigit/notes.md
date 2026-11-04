# Construction notes

The default superscript-two failure is a reproducible counterexample to the guard, not a definition of the Unicode categories. The other character and predicate settings keep the same question while changing which category boundary is crossed.

The implementation account is pinned to CPython 3.15.1 and Unicode 17.0.0. The character counts in the picture—770 decimals, 898 digits and 2,023 numerics—come from scanning that version's code points. Do not silently carry them into another Unicode version. UnicodeData fields 6, 7 and 8 hold the three values; the Chinese numeral's numeric value uses Unihan data. CPython's generated tables are an implementation of those categories, not a claim that int() reads UnicodeData.txt at runtime.

The main comparison is one character at a time. Signs, underscores, whitespace, other bases and the full grammar of integer strings are not modeled as selectable cases. The ending therefore recommends attempting the actual conversion rather than replacing one pre-check with another for arbitrary strings.

The whitespace and float exercises live in `scene.ts` under `meta.checks`. Their inputs are checked against Python, but they are not additional displayed cases.

UAX #44 revision 38 also constrains new characters: none encoded since Unicode 6.3.0 receives a digit value without a decimal value. The existing age-fixture test checks the corresponding nondecimal-digit row. That history qualifies the data but does not help a reader decide whether to call int(), so it is outside the closing caption.

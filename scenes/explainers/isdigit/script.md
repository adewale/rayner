# Does isdigit guarantee int can parse it?

- **Reader:** a Python programmer who has guarded `int(s)` with `s.isdigit()`, or seen it done, and assumes text made of digits can be parsed; no knowledge of the Unicode Character Database needed.
- **Answer:** No: isdigit() is True for ², and int('²') raises ValueError
- **Changed condition:** the character (٣, ², ½, Ⅻ or 三) and the check guarding `int()` (isdecimal(), isdigit() or isnumeric()). Whether the guard lets the character through to a ValueError, passes it to a successful parse, or turns it away changes with both: ² gets through isdigit() and isnumeric() to a ValueError, ½, Ⅻ and 三 get through isnumeric() alone, and ٣ parses whichever check guards it. isdecimal() never lets a character through to a ValueError.
- **Reader's own work:** predict whether `int()` returns a number or raises for the chosen character; choose the character and the check; answer the check questions.
- **Checked against:** CPython 3.15.1 and Unicode 17.0.0. `test/explain-isdigit.test.ts` holds the model's rows to UnicodeData.txt and Unihan lines verbatim, its answers for every shown character and the check questions' cases to CPython 3.15.1's frozen answers (rerun when a python3 is on PATH: one with Unicode 17.0.0 for the shown characters, any for the check cases), the counts to a scan of every code point in that version, and the 128 characters isdigit() accepts beyond isdecimal() to the list, with their Unicode ages, in `test/fixtures/isdigit-digit-ages.json`.
- **Leaves out:** whole strings: signs, underscores, surrounding whitespace, other bases and the rest of `int()`'s grammar are not selectable scenarios, which is why the ending recommends calling `int()` and catching ValueError. Other Python and Unicode versions, whose counts may differ. UAX #44's rule that no character encoded since Unicode 6.3.0 gets a digit value without a decimal value qualifies the data but is not shown.

## Check yourself

1. s is two characters: U+3000, IDEOGRAPHIC SPACE, then an ASCII 7. Its line in UnicodeData.txt is 3000;IDEOGRAPHIC SPACE;Zs;0;WS;<wide> 0020;;;;N;;;;;. Does the isdigit() guard let s through, and what would int(s) do?
   The guard turns s away: U+3000 has nothing in field 7, so s.isdigit() is False. Yet int(s) returns 7. Its category Zs makes it whitespace to Python, so the rewrite turns it into a space, ' 7', and int() ignores surrounding spaces. The isdigit() guard also refuses text that int() can parse.
2. float() runs the same rewrite as int() before it parses. What do float('٣.5') and float('2.²') do?
   float('٣.5') returns 3.5: ٣ has a decimal digit value, so the text becomes '3.5'. float('2.²') raises ValueError: ² has none, so the text becomes '2.?', for the same reason int('²') fails.

## Why this explainer

The `isdigit()` guard is common advice and looks obviously right. The superscript two is a reproducible counterexample that breaks it in one character, so the explainer opens on it rather than on Unicode's categories: the reader should predict, be wrong, and then want to know why. The other character and check settings keep the same question while changing which category boundary is crossed.

The mechanism is two lookups that disagree. CPython rewrites non-ASCII text before parsing, using a character's decimal digit value (UnicodeData field 6), while `isdigit()` reads its digit value (field 7). Seeing ²'s own record with field 7 filled and field 6 empty is the moment that should stick. The nested sets then generalise it: decimal inside digit inside numeric, so only `isdecimal()` matches `int()` for a single character, and for whole strings the honest check is the conversion itself.

The counts (770, 898 and 2,023) come from scanning CPython 3.15.1's code points; do not carry them into another Unicode version. The check answers quote model results, and a guard in `scene.ts` fails the scene if the model stops giving them.

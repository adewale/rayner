# Script: does isdigit guarantee int can parse it?

Question the reader brings: I check `s.isdigit()` before `int(s)`. Is that safe?

A common guard checks the text and calls `int()` only if the check passes. Take the text `'²'`. `'²'.isdigit()` is True, so the guard lets it through. It is a numeral, two. Will `int('²')` return 2?

It raises ValueError. Before parsing, `int()` rewrites each non-ASCII character: a space becomes a space, a character with a decimal digit value becomes that ASCII digit, and anything else becomes `'?'`, so the parse fails. ² has no decimal digit value, so it becomes `'?'`. The guard passed a character `int()` cannot parse.

Eight numerals in a row, each with a numeric value in Unicode: four ways to write 3, then ², ½, Ⅻ and 三. Brackets over the row span what each check accepts, and brackets under it what `int()` does: `int()` accepts only the first four, while the `isdigit()` bracket reaches ² too and the `isnumeric()` bracket all eight. So the answer is no: isdigit() is True for ², and int('²') raises ValueError.

Why do they disagree? Each character's line in UnicodeData.txt has three numeric fields: 6, the decimal digit value; 7, the digit value; 8, the numeric value. ² fills 7 and 8 but not 6. `int()` reads field 6. CPython's table builder sets one flag per filled field, under names that do not match the fields (it calls them decomposition_mapping, numeric_type and numeric_value), and each predicate tests one flag: isdecimal field 6, isdigit field 7, isnumeric field 8.

Every decimal also has a digit value and every digit a numeric value, so the sets nest: 770 decimals inside 898 digits inside 2,023 numerics. `int()` accepts exactly the innermost box.

**The aha:** the guard's own box drawn heavy, with ² inside it but outside the innermost box, the only characters `int()` accepts.

**Sentence to remember:** for one character only isdecimal() matches int(); for a whole string, call int() and catch ValueError, because int() also takes signs, spaces and underscores.

**Check questions**, in `meta.checks`, asked after the last step. Two are cases no step shows:

1. Which field of a UnicodeData.txt line must a character fill for int() to parse it?
2. What does `int('٣4')` return, an Arabic-Indic three followed by an ASCII 4? (34: the rewrite works one character at a time, so scripts can mix.)
3. ⑤ has the line `2464;CIRCLED DIGIT FIVE;No;0;ON;<circle> 0035;;5;5;N;;;;;`. What do `'⑤'.isdigit()` and `int('⑤')` do? (True, and ValueError: fields 7 and 8 are filled, 6 is empty.)

**The reader's lever:** two settings, the character and the check. ٣ parses under every check; ½, Ⅻ and 三 are turned away by isdigit() but let through to a ValueError by isnumeric(); isdecimal() never lets a character through that int() rejects.

| Step | Script | Reader predicts |
| --- | --- | --- |
| guard | paragraph 1: the guard runs on ² | does int('²') return 2? |
| int | paragraph 2: int() rewrites ² as '?' and raises | |
| lineup | paragraph 3: eight numerals under the checks' brackets, the answer | which part of the database each check reads |
| ucd | paragraph 4: ²'s line, fields 6, 7 and 8 | |
| flags | paragraph 4: one flag per field, misnamed | |
| sets | paragraph 5: the nested sets, counted over every code point | |
| outcome | the aha: ² inside the isdigit() box, outside the innermost | |
| match | sentence to remember | |

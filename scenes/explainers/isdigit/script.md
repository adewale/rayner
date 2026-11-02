# Script: does isdigit guarantee int can parse it?

Question the reader brings: I check `s.isdigit()` before `int(s)`. Is that safe?

One way to keep `int()` from raising is a guard: check the text, and call `int()` only if the check passes. Take the text `'²'`. The title names the guard and the character, not what the check returns. `'²'.isdigit()` is True, so the guard lets it through. It is a numeral, two. Will `int('²')` return 2?

It raises ValueError. Before parsing, `int()` rewrites each non-ASCII character: any character Python counts as whitespace (`Py_UNICODE_ISSPACE`) becomes a space, a character with a decimal digit value becomes that ASCII digit, and anything else becomes `'?'`, so the parse fails. ² has no decimal digit value, so it becomes `'?'`. The guard passed a character `int()` cannot parse.

Eight numerals in a row, each with a numeric value in Unicode: four ways to write 3, then ², ½, Ⅻ and 三. Brackets over the row span what each check accepts, and brackets under it what `int()` does: `int()` accepts only the first four, while the `isdigit()` bracket reaches ² too and the `isnumeric()` bracket all eight. So the answer is no: isdigit() is True for ², and int('²') raises ValueError.

Why do they disagree? Each character's line in UnicodeData.txt has three numeric fields: 6, the decimal digit value; 7, the digit value; 8, the numeric value. ² fills 7 and 8 but not 6. `int()` reads field 6. CPython's table builder sets one flag per filled field, under names that do not match the fields (it calls them decomposition_mapping, numeric_type and numeric_value), and each predicate tests one flag: isdecimal field 6, isdigit field 7, isnumeric field 8.

Every decimal also has a digit value and every digit a numeric value, so the sets nest: 770 decimals inside 898 digits inside 2,023 numerics. `int()` accepts exactly the innermost box. One step draws the boxes with the case's check drawn heavy and its character marked; an earlier version drew the boxes plain first, and at rest the two pictures were nearly the same.

**The aha:** the guard's own box drawn heavy, with ² inside it but outside the innermost box, the only characters `int()` accepts.

**Sentence to remember:** for one character only isdecimal() matches int(); for a whole string, call int() and catch ValueError, because int() also takes signs, spaces and underscores.

**Check questions**, in `meta.checks`, asked after the last step. Each is a case no step shows, answered by applying field 6 or the one-character-at-a-time rewrite:

1. 𝟗, MATHEMATICAL BOLD DIGIT NINE, has the line `1D7D7;MATHEMATICAL BOLD DIGIT NINE;Nd;0;EN;<font> 0039;9;9;9;N;;;;;`. What do `'𝟗'.isdigit()` and `int('𝟗')` do? (True, and 9: field 6 holds 9.)
2. What do `'٣4²'.isdigit()` and `int('٣4²')` do? (True, since every character has a digit value; ValueError, since the rewrite gives `'34?'`.)
3. ⑤ has the line `2464;CIRCLED DIGIT FIVE;No;0;ON;<circle> 0035;;5;5;N;;;;;`. What do `'⑤'.isdigit()` and `int('⑤')` do? (True, and ValueError: fields 7 and 8 are filled, 6 is empty.)

test/explain-isdigit.test.ts holds all three to the model and to the python3 on the path.

**The reader's lever:** two settings, the character and the check. ٣ parses under every check; ½, Ⅻ and 三 are turned away by isdigit() but let through to a ValueError by isnumeric(); isdecimal() never lets a character through that int() rejects.

| Step | Script | Reader predicts |
| --- | --- | --- |
| guard | paragraph 1: the guard runs on ² | does int('²') return 2? |
| int | paragraph 2: int() rewrites ² as '?' and raises | |
| lineup | paragraph 3: eight numerals under the checks' brackets, the answer | which part of the database each check reads |
| ucd | paragraph 4: ²'s line, fields 6, 7 and 8 | |
| flags | paragraph 4: one flag per field, misnamed | |
| outcome | paragraph 5 and the aha: the nested sets, counted over every code point, with ² inside the heavy isdigit() box and outside the innermost | |
| match | sentence to remember | |

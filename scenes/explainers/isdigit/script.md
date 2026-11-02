# Script: does isdigit guarantee int can parse it?

Question the reader brings: I check `s.isdigit()` before `int(s)`. Is that safe?

One way to keep `int()` from raising is a guard: check the text, and call `int()` only if the check passes. Take the text `'²'`. The title names the guard and the character, not what the check returns. `'²'.isdigit()` is True, so the guard lets it through. It is a numeral, two. Will `int('²')` return 2?

It raises ValueError. Before parsing, `int()` rewrites each non-ASCII character: any character Python counts as whitespace (`Py_UNICODE_ISSPACE`) becomes a space, a character with a decimal digit value becomes that ASCII digit, and anything else becomes `'?'`, so the parse fails. ² has no decimal digit value, so it becomes `'?'`. The guard passed a character `int()` cannot parse.

Eight numerals in a row, each with a numeric value in Unicode: four ways to write 3, then ², ½, Ⅻ and 三. Brackets over the row span what each check accepts, and brackets under it what `int()` does: `int()` accepts only the first four, while the `isdigit()` bracket reaches ² too and the `isnumeric()` bracket all eight. So the answer is no: isdigit() is True for ², and int('²') raises ValueError.

Why do they disagree? Each character's line in UnicodeData.txt has three numeric fields: 6, the decimal digit value; 7, the digit value; 8, the numeric value. int() and isdecimal() read field 6, isdigit() field 7 and isnumeric() field 8, and the step's card labels each field with the calls that read it. ² fills 7 and 8 but not 6, so isdigit() and int() disagree on it. (CPython's table builder turns each filled field into a flag, under field names that do not match; an earlier step showed that code, but nothing later needed the flags, so it went.)

Every decimal also has a digit value and every digit a numeric value, so the sets nest: 770 decimals inside 898 digits inside 2,023 numerics. `int()` accepts exactly the innermost box. One step draws the boxes with the case's check drawn heavy and its character marked; an earlier version drew the boxes plain first, and at rest the two pictures were nearly the same.

**The aha:** the guard's own box drawn heavy, with ² inside it but outside the innermost box, the only characters `int()` accepts.

**Sentence to remember:** for one character only isdecimal() matches int(); for a whole string, call int() and catch ValueError, because int() also takes signs, spaces and underscores.

**Check questions**, in `meta.checks`, asked after the last step. Each needs the int() step's rewrite on a case or a call no step shows:

1. s is U+3000 IDEOGRAPHIC SPACE then an ASCII 7, with the space's UnicodeData.txt line given. Does the isdigit() guard let it through, and what would int(s) do? (The guard refuses it: field 7 is empty. int(s) returns 7: the rewrite turns the space into ' ', and int() ignores surrounding spaces. The guard fails the other way too.)
2. float() runs the same rewrite. What do float('٣.5') and float('2.²') do? (3.5, from '3.5'; ValueError, from '2.?'.)

test/explain-isdigit.test.ts holds both to the model, to the UnicodeData.txt line, and to the python3 on the path.

**The reader's lever:** two settings, the character and the check. ٣ parses under every check; ½, Ⅻ and 三 are turned away by isdigit() but let through to a ValueError by isnumeric(); isdecimal() never lets a character through that int() rejects.

| Step | Script | Reader predicts |
| --- | --- | --- |
| guard | paragraph 1: the guard runs on ² | does int('²') return 2? |
| int | paragraph 2: int() rewrites ² as '?' and raises | |
| lineup | paragraph 3: eight numerals under the checks' brackets, the answer | which part of the database each check reads |
| ucd | paragraph 4: ²'s line, fields 6, 7 and 8, and which call reads each | |
| outcome | paragraph 5 and the aha: the nested sets, counted over every code point, with ² inside the heavy isdigit() box and outside the innermost | |
| match | sentence to remember | |

## Limits

The model (`scenes/explainers/lib/isdigit.ts`) answers for one character at a time: the three string checks, the numeric fields of its UnicodeData.txt line (and Unihan's value for 三), and `int()`'s rewrite of that character. It leaves out what `int()` does with whole strings (signs, surrounding spaces, underscores, bases other than 10), `float()` beyond the second check question, `str.isascii()`, locale, and every Python and Unicode version but CPython 3.15.1 with Unicode 17.0.0 (3.14.9 with Unicode 16.0.0 is recorded only in a test comment). The page draws eight characters; the counts 770, 898 and 2,023 come from a scan of every code point recorded from that CPython, which `test/explain-isdigit.test.ts` reruns when a python3 with Unicode 17.0.0 is on the path. No case shows a whitespace character, a multi-character string, or a digit that is neither ² nor in the lineup: ⑤ and 𝟗 are tested but never drawn. The claim that every character in the `isdigit()` row predates Unicode 6.3.0 rests on UAX #44 and on a fixture of UnicodeData.txt and DerivedAge.txt 17.0.0, which a local python3 cross-checks up to its own Unicode version.

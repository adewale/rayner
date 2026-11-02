# Does isdigit guarantee int can parse it?

You want to turn a string into an integer without raising an error. Checking `s.isdigit()` first looks promising: surely text made of digits can be parsed? Try the single character `'²'`. Its check returns True. Will `int('²')` return 2?

It raises ValueError. Superscript two represents a number, but it is not a decimal digit that Python's integer parser accepts. The guard and the parser answer different questions.

Before parsing non-ASCII text, CPython converts decimal digits into their ASCII counterparts and whitespace into ordinary spaces. Other non-ASCII characters become `?`, which makes the parse fail. The superscript has no decimal digit value, so this conversion turns `'²'` into `'?'`.

Compare eight characters: four ways to write the decimal digit 3, then ², ½, Ⅻ and 三. All have numeric values. The four decimal forms can each be parsed by `int()`. `isdigit()` also accepts ²; `isnumeric()` reaches the fraction, Roman numeral and Chinese numeral too. Knowing that a character has a numeric meaning does not tell us whether it can occupy a place in an ordinary decimal integer.

The distinction is recorded in the Unicode Character Database. Its character records have separate fields for decimal digit value, digit value and numeric value. Superscript two has a digit value and a numeric value, but no decimal digit value. That is the disagreement between `isdigit()` and `int()` in the character's own record.

These categories nest. A decimal digit also has a digit value, and a character with a digit value also has a numeric value. For a single character, `isdecimal()` selects the innermost category, matching what `int()` can parse as a decimal integer. Broadening the check to `isdigit()` or `isnumeric()` admits characters outside that category; choosing another character lets you see where it falls.

A whole string needs more than a character-category check. `int()` can also accept a sign, surrounding spaces and underscores in valid positions. If the question is whether the whole string can be parsed, call `int()` and handle ValueError. The character comparison here describes CPython 3.15.1 with Unicode 17.0.0; it does not define the grammar of every numeric string or parser.

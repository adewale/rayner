"""Claims for isdigit (rounds 2 and 3): the plain page, the Rayner page and the method-only page."""

D = 'scenes/explainers/isdigit/'
T = D + 'model.test.ts'
M = D + 'model.ts'
ROWS = T + ':21-33 (UnicodeData.txt 17.0.0 rows: 0033 and 0663 ;3;3;3; 00B2 ;;2;2; 00BD ;;;1/2; 216B ;;;12; 4E00 range ;;;; and Unihan U+4E09 kPrimaryNumeric 3)'
CPY = T + ':38-47 (CPython 3.15.1 [isdecimal, isdigit, isnumeric, int]: 3 ٣ ३ ３ -> True,True,True,3; ² -> False,True,True,ValueError; ½, Ⅻ, 三 -> False,False,True,ValueError)'
COUNTS = T + ':52 (scan of every code point: isdecimal 770, isdigit 898, isnumeric 2023, int 770)'
AGES = D + 'fixtures/isdigit-digit-ages.json (the 128 code points isdigit() accepts beyond isdecimal(), by Unicode age); ' + T + ':306-316'
REWRITE = M + ':17-19 (Objects/unicodeobject.c:9536-9553: non-ASCII becomes a space if whitespace, "0" + field 6 if it has one, else "?")'
FIELDS = M + ':6-16 (UAX #44: field 6 for Decimal, 7 for Decimal and Digit, 8 for every numeric; Tools/unicode/makeunicodedata.py:595-603; Objects/unicodectype.c:105-144)'
SPACE = T + ':217-231 (U+3000 then 7: isdigit False, rewrite " 7", int 7; float("٣.5") rewrite "3.5"; float("2.²") rewrite "2.?"); ' + T + ':252-270 (python3 rerun)'
UNSHOWN = T + ':196-216 (⑤ fields ;;5;5; 𝟗 ;9;9;9; rewrite of ٣4² )'
NONE = 'No recorded value, model rule or pinned source in the oracle covers this.'

ORACLE = ('CPython 3.15.1\'s frozen answers and Unicode 17.0.0\'s rows in ' + T + ' (lines 21-52), the code-point scan counts, the 128 isdigit-but-not-isdecimal code points in '
          + D + 'fixtures/isdigit-digit-ages.json, the check-question cases, and the CPython and UAX #44 lines cited in ' + M + ':1-23. Signs, underscores, the rest of int()\'s grammar and the digit limit are outside the model.')

PAGES = {
    'plain': {'file': 'bench/premise/isdigit/plain.html', 'round': 2, 'how': 'Written by a fresh session with no repository from the question and Reader line (bench/premise/README.md, round 2).'},
    'rayner': {'file': 'scenes/explainers/isdigit (rayner describe at 5e9d07d4)', 'round': 2, 'how': 'The catalogued explainer; text read from `rayner describe`.'},
    'method': {'file': 'bench/premise/isdigit/method.html', 'round': 3, 'how': 'Method-only page (bench/premise/isdigit/method/), built for round 3 with the model and oracle and no engine.'},
}

CLAIMS = [
    ('plain', 1, 'right', 'No: isdigit() is True for characters int() refuses, so the guarded line can raise', CPY, 'recorded ²'),
    ('plain', 1, 'right', 'isdigit() also refuses strings int() parses', SPACE, 'recorded U+3000 then 7'),
    ('plain', 1, 'right', 'The three methods each check a Unicode group; the sets nest; int() uses the smallest', FIELDS + '; ' + COUNTS, ''),
    ('plain', 1, 'right', 'isdecimal covers ASCII and other scripts\' digits (٣ ३ ３)', CPY, ''),
    ('plain', 1, 'right', 'isdigit adds superscripts, subscripts and circled digits (² ₂ ② ₃ ① ❼)', AGES, ''),
    ('plain', 1, 'unverifiable', '...and some historical scripts whose digits are not positional', AGES + ' lists Ethiopic, Kharoshthi and Brahmi digits; how they are used is not in the oracle.', ''),
    ('plain', 1, 'right', 'isnumeric adds fractions, Roman numerals and Chinese numerals (½ Ⅻ 五)', CPY + '; ' + ROWS + ' (五 has the same Unihan kPrimaryNumeric shape as 三)', ''),
    ('plain', 1, 'unverifiable', 'Why int() refuses ² ("1²" would be ambiguous)', NONE, ''),
    ('plain', 1, 'right', 'int() strips surrounding whitespace', SPACE, ''),
    ('plain', 1, 'unverifiable', 'int() accepts a sign', NONE, ''),
    ('plain', 1, 'unverifiable', 'int() accepts underscores between digits', NONE, ''),
    ('plain', 1, 'right', 'isdigit() accepts no whitespace, sign or underscore', FIELDS + ': none of these has field 7; ' + SPACE, 'model'),
    ('plain', 13, 'right', 'Grid and preset buttons: what the three checks and int() give for 42, ٤٢ (42), ３ and ７, 𝟕𝟕 (77), ², ①, ₃, ፫, 1², ½, Ⅻ, 五 and " 7 " (13 claims)', CPY + '; ' + UNSHOWN + '; ' + AGES + ' (the page\'s 20 ranges equal its 128 code points)', 'recorded rows and model on recorded shapes'),
    ('plain', 1, 'unverifiable', '"abc", "3.5" and "" are refused by both', NONE + ' (int()\'s grammar)', ''),
    ('plain', 1, 'unverifiable', 'The 4,300-digit limit since 3.11 (and in 3.7 to 3.10 security releases), its message, sys.set_int_max_str_digits', NONE, ''),
    ('plain', 1, 'unverifiable', 'isdecimal() is the same as re.fullmatch(r"\\d+", s)', NONE, ''),
    ('plain', 1, 'right', 'isdecimal() still rejects "-5" and " 5"', FIELDS + ': neither "-" nor " " has field 6', 'model'),
    ('plain', 1, 'unverifiable', 'isascii() and isdecimal() together mean only 0 to 9', NONE + ' (isascii() is not in the oracle)', ''),
    ('plain', 1, 'right', 's.isdecimal() means int(s) works (up to the digit limit)', REWRITE + '; ' + T + ':283-293', 'model'),
    ('plain', 1, 'unverifiable', 'The ValueError message text', NONE + ' Only the exception was recorded.', ''),

    ('rayner', 1, 'right', 'The answer: isdigit() is True for ² and int(\'²\') raises ValueError', CPY + '; ' + T + ':11-19', 'recorded'),
    ('rayner', 1, 'right', 'int() turns text into a whole number and raises ValueError when it cannot', CPY, ''),
    ('rayner', 15, 'right', 'What each check returns for each of the five characters (٣ ² ½ Ⅻ 三)', CPY, 'recorded'),
    ('rayner', 5, 'right', 'int() of the five characters: ٣ gives 3, the others raise', CPY, 'recorded'),
    ('rayner', 1, 'right', 'The rewrite: non-ASCII decimals to ASCII digits, whitespace to spaces, anything else to "?"', REWRITE + '; ' + SPACE, ''),
    ('rayner', 2, 'right', 'The eight characters\' values; int() and isdecimal() accept the first four, isdigit() adds ², isnumeric() takes all eight', CPY + '; ' + ROWS, 'recorded'),
    ('rayner', 1, 'right', 'Fields 6, 7 and 8, and CPython building its tables from them', FIELDS, ''),
    ('rayner', 5, 'right', 'Each character\'s row: ٣ fills 6 to 8, ² 7 and 8, ½ only 8 (1/2), Ⅻ only 8 (12), 三 none, with Unihan kPrimaryNumeric 3', ROWS + '; ' + T + ':125-139', 'verbatim rows'),
    ('rayner', 1, 'right', 'isdigit() follows field 7 and int() field 6', FIELDS + '; ' + REWRITE, ''),
    ('rayner', 1, 'right', '770, 898 and 2,023', COUNTS, 'recorded scan'),
    ('rayner', 1, 'right', 'The sets nest', FIELDS + '; ' + T + ':271-282; ' + COUNTS, ''),
    ('rayner', 1, 'right', 'The innermost box holds the only single characters int() accepts', COUNTS + ' (int 770 = isdecimal 770; every int-accepted character was decimal)', 'recorded'),
    ('rayner', 3, 'right', 'Accepted by a check but not by int(): 0, 128 and 1,253', COUNTS, 'recorded'),
    ('rayner', 1, 'right', 'For one character only isdecimal() matches int()', COUNTS + '; ' + T + ':283-293', ''),
    ('rayner', 1, 'right', 'int() accepts surrounding spaces', SPACE, 'recorded U+3000 case'),
    ('rayner', 1, 'unverifiable', 'int() accepts signs', NONE, ''),
    ('rayner', 1, 'unverifiable', 'int() accepts underscores in valid positions', NONE, ''),
    ('rayner', 1, 'right', 'Check 1: s.isdigit() is False and int(s) is 7', SPACE, 'recorded'),
    ('rayner', 1, 'right', 'Check 1: why (Zs is whitespace, rewritten to a space)', REWRITE + '; ' + M + ' SPACE (UnicodeData.txt line 11279, category Zs)', ''),
    ('rayner', 1, 'right', 'Check 2: float(\'٣.5\') is 3.5 and float(\'2.²\') raises, through the same rewrite', SPACE, 'recorded'),
]

for page, count, grade, claim, evidence, note in list(CLAIMS):
    if page == 'rayner':
        CLAIMS.append(('method', count, grade, claim, evidence, note))
CLAIMS += [
    ('method', 1, 'right', 'The row pictures give each row\'s UnicodeData.txt line number (1598 for ٣, 179 for ², 190 for ½, 7719 for Ⅻ, 12349 for the range holding 三) and Unihan line 29', ROWS + ' (line numbers are in the test\'s UNICODE_DATA and UNIHAN_LINE)', ''),
    ('method', 1, 'right', 'Intro: every answer is computed from a model of CPython 3.15.1 and Unicode 17.0.0 tested against CPython 3.15.1\'s recorded answers; the lineup and the counts are those recorded values',
     'bench/premise/isdigit/method/oracle.ts (copied from ' + T + ':38-52); bench/premise/isdigit/method/method.test.ts', ''),
]

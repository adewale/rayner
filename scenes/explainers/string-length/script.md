# Why does one word have three lengths?

- **Reader:** a programmer who has written a "max 10 characters" rule or sized a database column, has seen two languages disagree about a string's length, and has mostly tested with English; knows what a byte is, not what a code point or a grapheme cluster is.
- **Answer:** Bytes, code points and the characters a reader sees are three different counts of the same text
- **Changed condition:** the word, and where a limit cuts it. नमस्ते is 18 bytes, 6 code points and 3 characters; שָׁלוֹם is 14, 7 and 4, and 8, 4 and 4 without its points; 你好 is 6, 2 and 2; hello is 5, 5 and 5. Cut नमस्ते at 10 bytes and a letter and its mark are lost; at 4 code points it ends on a joiner; at 2 characters both are whole.
- **Reader's own work:** predict how many code points the Hebrew word has before it is taken apart; answer the check questions, which take the Arabic word apart, fit characters into ten bytes and ask why English hides all of this.
- **Checked against:** Node 24.22.1 with Unicode 17.0 (ICU 78.3), recorded in `fixtures/segments.json` and asked again by `model.test.ts` on a Node with the same Unicode version: `Intl.Segmenter` for the grapheme clusters of the page's five words and of 3,000 random texts in the scripts the model covers, and `TextEncoder` and the string iterator for bytes and code points of any text. The same test runs CPython through `oracle/lengths.py` for `len()`, `str.encode()` and each code point's general category; `answers.ts` computes the check answers from the model.
- **Grounding:** live: Node's Intl.Segmenter and TextEncoder (Unicode 17.0) and CPython's str, run by the model's tests
- **Leaves out:** UTF-16 code units, which JavaScript's length counts and which equal code points for every character here; characters outside the Basic Multilingual Plane, emoji sequences and flags; Hangul; the conjuncts of Indic scripts other than Devanagari; normalisation, where one character has two spellings; how wide a character is drawn. Grapheme rules change between Unicode versions: before 15.1 the last character of नमस्ते counted as two.

## Check yourself

1. The Arabic greeting سَلَام is four letters with a vowel mark on each of the first two. What are its three lengths?
   12 bytes, 6 code points and 4 characters. Each of the two vowel marks is a code point of its own that rides on the letter before it, and every code point of this word takes two bytes in UTF-8.
2. A database column holds ten bytes of UTF-8. How many characters of नमस्ते fit in it whole?
   Two: न and म, 6 bytes. The third character, स्ते, is four code points and needs 12 bytes, more than the 4 left. Cutting at byte 10 would also split a code point, since each takes three bytes.
3. Why does the word hello never show any of this?
   Its five letters are five code points below U+0080, which UTF-8 writes as one byte each, and none of them is a mark or a joiner. So all three counts are 5, and code that confuses them passes every test written in English.

## Why this explainer

"How long is this string?" has three honest answers, and most code picks one without noticing there was a choice, because in English the three agree. The usual explanation starts from encodings: here is ASCII, here is UTF-8, here is UTF-16. A reader who follows that still cannot say why a ten-character limit rejects a three-character name, or why cutting a string at a "character" count leaves a stray stroke at the end.

So the page starts from one word and its three numbers, and takes the word apart twice: into the code points it is stored as, and each of those into bytes; then back together into what a reader sees, where the same cells slide into three groups. The cells are the same objects in both pictures, which is the point: nothing is added or removed, only counted differently.

The words are chosen for what each one separates. Hindi fuses consonants across a joiner, so four code points make one character. Hebrew carries its points as separate code points, and the same word without them is shorter to a program and the same length to a reader. Chinese has neither, so code points and characters agree and only bytes differ. Arabic is left for the reader, in the first check question. hello is there because it is the reason the problem hides.

The other scripts are drawn in their own faces, Noto Sans Devanagari, Noto Sans Hebrew, Noto Naskh Arabic and Noto Sans SC, and bold in real bold cuts, because a page about what a reader sees should draw it as a reader would see it.

The ending is the practical one: a limit has to cut somewhere, and only a cut between characters leaves text a reader would call shorter rather than broken. The grapheme rules themselves change with Unicode versions, which the script's limits line records, since a count that depends on the runtime's Unicode data is something a reader will meet.

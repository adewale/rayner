# Why does a patch still apply after the file has changed?

- **Reader:** a developer who reads `@@ -2,3 +2,4 @@` in code review every day and has met "patch does not apply", but has never asked what the numbers are for or how a patch finds its place; knows what a diff shows, not how one is applied.
- **Answer:** A hunk goes where its context and removed lines match the file; its line numbers only say where to look first
- **Changed condition:** the reader's copy of the file. With two lines added at the top, the hunk that says line 2 is found at line 4 and applied there, an offset of 2. With one context line changed (the port), no three lines match anywhere and the patch is refused, though the line it removes is still there. In a copy where another section holds the same three lines at line 2, the patch applies cleanly to the wrong section.
- **Reader's own work:** predict whether the patch applies at its line, at another line or not at all before the search is shown; switch between the two copies; answer the check questions, which add a third line above, ask why an untouched line is not enough, and widen the context to three lines.
- **Checked against:** the Git on the machine (2.43.0 when this was written), which `model.test.ts` runs each time: its diff with one line of context must write the page's patch, and its apply, run verbosely, must place every hunk where the model does, say what the model says and leave the file the model leaves, on the page's four files, on a two-hunk patch whose second hunk is refused, and on 120 drifted copies of random files with one to three lines of context; `answers.ts` computes the check answers from the model. The search order was read from Git's apply.c at v2.43.0 and is held by those runs.
- **Grounding:** live: Git's own apply and diff (2.43.0 when written), run by the model's tests
- **Leaves out:** `patch(1)`, which accepts a hunk with some context missing (fuzz) and writes rejects; Git's own looser modes (`-C`, `--3way`, `--reject`, `--ignore-whitespace`, `--unidiff-zero`); patches to several files, renames, binary files and the "no newline at end of file" marker; how a diff chooses its hunks in the first place. The page's patch has one line of context where Git's default is three, to keep the hunk small; the last step says what that costs.

## Check yourself

1. Three lines are added above the author's file instead of two. Where does the hunk go, and which lines does Git try on the way?
   At line 5, an offset of 3 lines. Git tries lines 2, 3, 1, 4 and 5: the line the header names, then one down, one up, two down, and, with nothing left above line 1, three down, where the hunk’s three old lines match.
2. In the copy whose port was changed, the line the patch removes, workers = 2, is still there and unchanged. Why is the patch refused all the same?
   Because the hunk expects 3 lines in a row: port = 8080, workers = 2 and timeout = 30. All of them must match, and with the port changed no 3 lines of the file do. Git tries lines 2, 3, 1 and 4, finds no match and reports the hunk’s own line, 2. The file is left untouched.
3. The same change made with three lines of context is refused on the copy with two lines added at the top, though every line of the hunk is still in the file, in order. Why?
   Its header is @@ -1,6 +1,7 @@, and a hunk that starts at line 1 is tried only at the top of the file: it claims to change the file’s first lines. With two new lines above them the top no longer matches, and Git looks nowhere else.

## Why this explainer

Most accounts of the unified format stop at decoding the header: minus this many lines from here, plus that many from there. That reads as if the numbers were an address, and a reader who believes it cannot explain the two things they actually meet: a patch that applies to a file whose lines have all moved, and a patch that is refused although the line it changes is sitting there untouched. Both follow from one fact, that a hunk is found by its lines and the numbers only start the search.

So the page shows the numbers once, on the author's own file, where they are right, and then takes the file away from under the patch. The setting is the reader's copy: lines added above, or a context line changed. The frame that slides over the file is the search itself, in Git's order (the line named, one down, one up, two down), with the hunk's three old lines beside the file's so each comparison can be read. On a refusal the frame returns to the line it started from, which is the line Git names in its error.

The ending is the case that matters in practice: a copy where the same three lines occur in another section, at the hunk's own line. Git applies the patch without a word, to the wrong section. One line of context made that possible, and the caption says so, because the page's patch has less context than Git's default and that choice should not pass as free. The third check question shows the other side of wider context: the three-line hunk starts at line 1 and so can only be applied at the top.

The model follows `apply.c`. Its test runs Git itself on every case the page shows and on random drifted files, and compares the place, the message and the resulting file.

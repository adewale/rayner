# Script: what puts an element in its group?

Questions the reader brings: Why is sodium in group 1 and chlorine in group 17? What do the columns of the periodic table mean? Why is helium over neon?

Sodium reacts with water much as lithium and potassium do, and chemists put such look-alikes in one column. Take sodium's: hydrogen 1, lithium 3, sodium 11, potassium 19, rubidium 37, caesium 55, francium 87. The jumps between neighbours are 2, 8, 8, 18, 18 and 32. Nothing in those numbers says "group 1", and the jumps are not a fixed step, so no simple count from the atomic number gives the column. The reader is asked what makes those particular jumps.

Forget the table. Give each element a cell and add electrons one at a time, in order of atomic number. By the filling rule (which step 4 names and sources) they fill runs, and every full run is 2, 6, 10 or 14 long. Sodium's 11 are runs of 2, 2 and 6, then 1 into a run of 2. Lay each run beside the last and start a new row at each run of 2, which is where the table starts a row, after each noble gas. The rows hold 2, 8, 8, 18, 18, 32 and 32 cells, and every jump down the opening's column is one of those lengths. The reader is asked what shape appears if runs of one length share columns.

Slide every run of 6 to the right edge and every run of 10 into the middle, and lift the runs of 14 into two rows below so the table stays 18 columns wide. Rows 2 and 3 have no run of 10, so their runs of 6 slide 10 columns and leave the gap. The result is the 18-column table that puts lutetium in group 3, as an IUPAC project recommended in 2021 (many textbooks use lanthanum, so the claim is scoped to this layout), except for one cell: helium, which stacking leaves over beryllium. The answer follows: apart from helium and the f block, an element's group is the column where the filling rule puts its last electron, with the runs of 2, 10 and 6 stacked left to right. ("The filling rule" keeps it true for copper, whose NIST configuration ends differently.) Sodium's 11th electron starts a run of 2: column 1. Chlorine's 17th is the 5th in a run of 6: 2 + 10 + 5 = 17.

Now the names. Each run is a subshell, named by its shell n and a letter for its length: s for 2, p for 6, d for 10, f for 14, so sodium's runs read 1s² 2s² 2p⁶ 3s¹. A subshell holds at most that many electrons. The order, 4s before 3d, is Madelung's empirical rule (lowest n + l first, lower n on a tie; Wikipedia's Aufbau principle article), and NIST's reference configurations follow it for 88 of the first 108 elements. Chlorine has 7 electrons after neon but sits in group 17 because rows 2 and 3 have no d run; boron to argon are all 10 short this way, and since rows 1 and 2 hold 10 electrons, aluminium to argon have atomic number equal to group. Copper is one of the 20 exceptions: NIST's 3d¹⁰ 4s¹ is still 11 after argon. The table moves helium over neon because 1s² fills its shell as 2s² 2p⁶ fills neon's.

Back to the opening jumps. Every member of a column ends the same way, one row further on, so each jump is a whole row: 8 = 2 + 6, 18 = 2 + 10 + 6, 32 = 2 + 14 + 10 + 6.

**The aha:** the stack: the rows of runs, laid side by side, turn into the periodic table when runs of one length share columns. The table's gap, its 18 columns and its two detached rows are what stacking does to rows of 2, 8, 18 and 32. The motion that matters is the slide; its resting picture keeps dashed outlines where rows 2 and 3's runs of 6 started, with arrows to where they went.

**Sentence to remember:** an element's group is the column where the filling rule puts its last electron, with the runs of 2, 10 and 6 stacked left to right.

**Check questions**, in `meta.checks`, asked after the last step. Each changes a condition no step shows:

1. If each shell filled completely before the next (a run of 10 straight after a row's run of 6), where would potassium land, and would it stay under sodium? (Column 2 + 1 = 3; it would leave group 1.)
2. Lanthanum is element 57. Where does the filling rule put it, and where would NIST's [Xe] 5d¹ 6s² put it? (The rule's last electron is the 1st of a run of 14: the f rows, no group. NIST's would be the 1st of a run of 10: column 3, which is why many textbooks put lanthanum in group 3.)

**Cases:** sodium (the plain case), chlorine (rows 2 and 3 skip the d columns; aluminium to argon), iron (the d block; 4s before 3d; ruthenium's different ending still counts 8), copper (one of NIST's 20 exceptions, same group) and helium (stacking puts it over beryllium; the full shell moves it over neon; its family title says neon to radon end in s² p⁶ and helium in 1s², since argon's shell 3 is not full).

Cut from an earlier version: the shared recap sentence that ended every case's family step. The lutetium caveat is back as a clause in the stack step, because "the periodic table" is true only of the layout with lutetium in group 3 (the model's comment and test keep that table, the arrangement the Group article reports IUPAC endorsed).

| Step | Script | Reader predicts |
| --- | --- | --- |
| column | paragraph 1: why groups matter, the column and its uneven jumps | what makes the jumps 8, 18 and 32 |
| fill | paragraph 2: every electron in order, runs laid side by side in rows of 2, 8, 8, 18, 18, 32, 32; no table yet | what shape appears when runs of one length share columns |
| stack | paragraph 3: the slide into the table (the aha's motion), the answer, the case's landing column in run widths | |
| blocks | paragraph 4: runs named as subshells, at most, Madelung's order and its source, the case's count, helium moved | |
| family | paragraph 5: each member's ending and count; each jump is one row | |

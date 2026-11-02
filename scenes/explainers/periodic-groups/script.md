# Script: what puts an element in its group?

Questions the reader brings: Why is sodium in group 1 and chlorine in group 17? What do the columns of the periodic table mean? Why is helium over neon?

Take sodium's column: hydrogen 1, lithium 3, sodium 11, potassium 19, rubidium 37, caesium 55, francium 87. The jumps between neighbours are 2, 8, 8, 18, 18 and 32. Nothing in those numbers says "group 1", and the jumps are not a fixed step. Something other than the atomic number decides the column, and the reader is asked what makes those particular jumps.

Read the table's cells in order of atomic number. By the filling rule, each cell adds one electron, and the electrons fill runs: the table fills run by run, all 118 cells, with sodium's own 11 first. Sodium's 11 are runs of 2, 2 and 6, then 1 into a new run of 2. Every full run is 2, 6, 10 or 14 cells long, and runs of one length stack into the same columns: runs of 2 at the left (helium apart, which the table moves to the right), runs of 10 in the middle, runs of 6 at the right, runs of 14 in the rows set below. The strip under the table measures the widths, 2, 10 and 6 columns, still unnamed. Rows 2 and 3 have no run of 10, so their runs of 6 sit over the runs of 6 below, leaving the gap.

Now the names. Each run is a subshell, named by its shell and its length: s for 2, p for 6, d for 10, f for 14, so sodium's runs read 1s² 2s² 2p⁶ 3s¹. A subshell holds exactly that many electrons, so each block is as wide as its subshell holds. That is the answer: except for helium, an element's group is the column where its last electron lands, in rows of 2 s, 10 d and 6 p columns. Sodium's last electron starts 3s, the first s column. Chlorine's is the fifth in 3p, so it lands in column 2 + 10 + 5 = 17, even though rows 2 and 3 have no d electrons; counting only its 7 electrons after neon would leave it ten short. Copper's filling-rule ending 4s² 3d⁹ lands at 2 + 9 = 11, and NIST's 3d¹⁰ 4s¹ is still 11 electrons after argon. Helium's 1s² would land in column 2, the dashed cell over beryllium, but it completes the first shell, so the table puts it with the other full shells.

Back to the opening jumps. Every member of a column ends the same way, one row further on, so each jump is a whole row: 8 = 2 + 6, 18 = 2 + 10 + 6, 32 = 2 + 14 + 10 + 6. The jumps are the block widths added up.

**The aha:** the fill: the electrons arrive in runs of 2, 6, 10 and 14, and the runs stack into the table's blocks, so the 18 columns are the subshells laid side by side (2 + 10 + 6), and the uneven jumps in the opening are those same widths summed into rows. The fill is the one step with motion that matters: the table fills run by run.

**Sentence to remember:** an element's group is the column where its last electron lands, in rows of 2 s, 10 d and 6 p columns.

**Check questions**, in `meta.checks`, asked after the last step. Each asks the reader to use the rule on a case no step shows:

1. Tin, element 50, ends 5s² 4d¹⁰ 5p². Which column does its last electron land in? (2 + 10 + 2 = 14.)
2. Scandium, element 21, has its last electron first in a run of 10. Why group 3 and not group 13? (The d block sits between s and p: 2 + 1 = 3.)
3. If rows 2 and 3 were drawn without the 10 empty columns, where would chlorine sit, and would it still be over bromine? (Column 7; bromine stays in 17, so the halogens would split.)

**Cases:** sodium (the plain case), chlorine (rows 2 and 3 skip the d columns), iron (the d block; ruthenium's different ending still counts 8), copper (NIST's exception changes the ending, not the group) and helium (the full shell overrides the landing column).

Cut from the earlier version: the separate count step (the same answer as the blocks step, now said in the blocks step's note), the group names (IUPAC numbering, CAS letters) and each case's boundary note; the lutetium caveat moved into the fill step, and the family step still marks members beyond the NIST reference.

| Step | Script | Reader predicts |
| --- | --- | --- |
| column | paragraph 1: the column and its uneven jumps | what makes the jumps 8, 18 and 32 |
| fill | paragraph 2: every cell in order, the runs of 2, 6, 10 and 14 stacking into blocks, widths unnamed: the aha's motion | |
| blocks | paragraph 3: runs named as subshells, the answer, the case's landing column and count | |
| family | paragraph 4: each jump is one row, the opening resolved | |

# Why does the periodic table have this shape?

- **Reader:** knows that elements have atomic numbers and has seen the table's familiar outline, with its gap at the top and two rows set apart below; may have heard of electron shells, but not of subshells or the filling order.
- **Answer:** The table’s gaps and widths come from stacking electron-filling runs of 2, 10 and 6, with runs of 14 below
- **Changed condition:** which element the reader follows (sodium, chlorine, iron, copper or helium). It changes the column whose uneven jumps open the story and where that element's last electron lands: chlorine and helium lose the column their electron count alone would give, copper's listed configuration breaks the filling rule yet keeps its column, and helium is the one element that stacking alone puts in the wrong place.
- **Reader's own work:** predict what makes the jumps down a column uneven, then what shape appears when runs of one length share columns; follow a second element to see where its last electron lands; answer the check questions.
- **Checked against:** NIST Atomic Spectra Database ground configurations for elements 1 to 108, frozen in `fixtures/nist-ground.json`: the filling rule agrees for 88 of the 108, and `model.test.ts` checks that the 20 the model stores as exceptions are exactly the ones that differ. Every computed position is also compared with an independently typed 18-column table that puts Lu and Lr in group 3. Elements 109 to 118 are the filling rule's predictions, with nothing to check them against.
- **Grounding:** recorded: NIST Atomic Spectra Database ground configurations for elements 1 to 108
- **Leaves out:** where the run lengths and the filling order come from (they are inputs, not derived from quantum mechanics); helium's chemical grouping and the alternative group-3 conventions, which stacking does not produce; chemical reactivity, ionisation energies and relativistic effects; and any scenario that follows an f-block element.

## Check yourself

1. Keep the runs of 14 inside the main table instead of putting them below. How wide would its longest rows be, and why?
   32 cells: 2 + 14 + 10 + 6. Putting the 14-cell runs below removes 14 columns from those rows, leaving an 18-column main table. The detached rows save width; they are still part of the same filling sequence.
2. Silicon (14) ends 3s² 3p² and tin (50) ends 5s² 4d¹⁰ 5p². Silicon has 4 electrons after neon, tin has 14 after krypton, yet both sit in column 14. Use the stacked runs to explain why.
   Each lands on the 2nd cell of a run of 6, and runs of 6 start after 2 + 10 columns, so both land in column 2 + 10 + 2 = 14. Tin’s row has a run of 10 (4d¹⁰) that fills columns 3 to 12. Silicon’s row has none, so its run of 6 slides across ten empty columns to reach the same place.

## Why this explainer

Sodium is 11, potassium 19 and rubidium 37: one column, but the jumps are 8 and then 18. That unevenness is a puzzle a reader can feel before any vocabulary, and it has a geometric answer. Take the run lengths 2, 6, 10 and 14 and their order as given, lay the runs side by side starting a new row at each run of 2, and the row lengths come out as exactly the jumps. Then slide runs of one length into shared columns: the gap at the top and the two detached rows appear on their own. The aha is that the familiar outline is what stacking those runs looks like.

The explainer deliberately does not say where the run lengths come from; it shows what they imply. Names arrive only after the shape: the runs become subshells, s, p, d and f, once the reader has seen why they need names, and the configuration of the followed element is written once, in that step. Helium is handled there too, and honestly: its run puts it over beryllium, and moving it over neon is chemistry we bring, not something sliding cells proves.

Madelung's filling order, the column arithmetic and the NIST comparison are detail steps. They qualify the geometric story without making its first payoff depend on the filling order. Copper is a scenario because it is the useful exception: its listed configuration differs from the rule, yet it still has 11 electrons beyond argon, so its column does not move.

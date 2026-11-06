# What does a WCAG conformance level require?

- **Reader:** a developer, designer or product owner whose policy or contract names a WCAG level (most often "AA"), who knows WCAG lists success criteria but not how levels and versions combine.
- **Answer:** A level asks for its own criteria and those of the levels below it, in the WCAG version you name
- **Changed condition:** the conformance level (A, AA or AAA). Each version's list and count change with it (WCAG 2.2 asks for 31 at A, 55 at AA, 86 at AAA), and at level A, 2.4.7 Focus Visible from the opening is not on any version's list. The guideline to open (1.4, 2.4, 2.5 or 4.1) changes which guideline's history the last detail shows: each criterion it has held at the level and the version that added it, with 2.5 a guideline 2.1 added and 4.1 the one that lost 4.1.1 Parsing.
- **Reader's own work:** predict which button Enter will press without a focus outline, and whether Focus Visible is on the level A list before choosing level A; choose the level and the guideline to open; answer the check questions.
- **Checked against:** the WCAG Recommendations and the pinned w3c/wcag repository (tag WCAG22-20241212). `model.test.ts` holds every criterion's number, level and adding version to the repository's guidelines/index.html and file folders (transcribed in the test, and re-read from a checkout when `WCAG_REPO` is set), each version's criteria and levels to that version's own Recommendation, and the counts per level to those lists, and checks that each level includes the levels below it and each version is its predecessor plus additions minus removals.
- **Leaves out:** testing a page: each criterion's own conditions and exceptions, and conformance's requirement for complete pages and processes. Draft changes, such as 2.4.7 Focus Visible's move to level A in drafts of 2.2, reversed before the final text. Which version an organisation must adopt; a policy may name an older version than those shown.

## Check yourself

1. A site meets all 24 criteria labelled AA in WCAG 2.2 but fails 1.1.1 Non-text Content, a level A criterion. Does it conform at level AA?
   No. Level AA’s list includes every level A criterion, so failing one level A criterion fails level AA too, however many AA criteria pass.
2. A contract asks for WCAG 2.1 level AA. A team checked its pages against the WCAG 2.2 level AA list and met all 55. What is still unchecked, and what did they check that 2.1 does not ask for?
   4.1.1 Parsing is still unchecked: it is on the 2.1 AA list of 50 but 2.2 removed it. The six criteria 2.2 added at A or AA are extra work for a 2.1 contract.
3. Keyboard focus on a new site is invisible. Does that fail 2.4.7 Focus Visible under a WCAG 2.0 level A policy, a WCAG 2.2 level A policy, or a WCAG 2.2 level AA policy?
   Only under the 2.2 level AA policy. 2.4.7 is a level AA criterion in 2.0, 2.1 and the final 2.2 text, so neither level A list includes it, although drafts of 2.2 had moved it to level A.

## Why this explainer

"We target AA" sounds like a complete instruction, and it is not. Two rules hide in it: a level includes the levels below it, so AA is mostly level A criteria; and the list depends on the version, which is not the older list plus extras, because 2.2 removed 4.1.1 Parsing. A team that checks only the criteria labelled AA, or the newest version against an older contract, misses work or does work nobody asked for.

The payment form's focus outline is there to make one criterion concrete before the counts arrive; it illustrates Focus Visible and is not a claim that an outline alone meets every focus criterion. The opening three steps (focus, levels, versions) state every total and the answer; the version strip, one row per version and one column per criterion, is the picture that shows both rules at once. The mind-map steps after it are details that show what the strip cannot, where in the guidelines each version put its changes, rather than deriving the totals again. A closing step of total cards was removed for repeating the opening.

2.4.7 Focus Visible's draft history stays off the page: drafts of 2.2 from WD-WCAG22-20200227 to CRD-WCAG22-20230125 listed it at level A, and from CRD-WCAG22-20230517 on it is AA again; the change log of REC-WCAG22-20231005 kept the promotion entry, and REC-WCAG22-20241212 drops it. The draft links stay in the scene's sources because the third check answer mentions the drafts.

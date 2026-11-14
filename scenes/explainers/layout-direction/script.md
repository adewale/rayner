# How does RTL change panels and field columns?

- **Reader:** an author laying out Rayner explainers who wants one layout to work in left-to-right and right-to-left pages; knows what RTL means, but not how Rayner's stage maps logical places and field columns.
- **Answer:** Start and End follow the stage’s direction, and a card’s field columns follow the stage unless the card sets its own
- **Changed condition:** the stage direction. On an rtl stage Start lands on the right half, its Field name sits right of 123, and the End card's own ltr puts its name on the left, so the override is visible. On an ltr stage Start lands on the left, both cards put Field first, and the override changes nothing; left and start name the same half.
- **Reader's own work:** predict which half the Start card lands in and which side of 123 each card puts its Field name; switch the stage direction; then the three check questions (a third card at end, where a left-to-right flowchart belongs, and an End card set to rtl).
- **Checked against:** Nothing external: every card is the engine's own `s.card` on a stage given the direction, and `fidelity.ts` measures each card's half and the order of its label and value from the drawn cards (not their titles) at the columns, updates and physical steps, in both directions.
- **Grounding:** none
- **Leaves out:** Arabic, Hebrew and other non-Latin text, font and script support, and bidirectional text shaping inside a field; layouts of more than two cards.

## Check yourself

1. On the rtl stage, add a third card at end with no direction of its own. Which half does it go to, and which side of its value is its Field name?
   The left half, because end is the left on an rtl stage. With no direction of its own it takes rtl columns from the stage, so its Field name sits to the right of its value.
2. A flowchart whose arrows run left to right must sit on the left half of the page in both reading directions. Should it be placed at start, at end or at left?
   At left. Start and end swap halves when the stage direction changes; left keeps its side in both, as the last step shows.
3. Give the End card direction rtl instead of ltr. On the rtl stage, how do the two cards’ fields compare?
   They match: both cards now have rtl columns, so both put Field to the right of 123. Neither card reverses the digits.

## Why this explainer

An author who wants one layout for both reading directions has three separate choices to make, and they are easy to conflate: which half a panel takes, which way a card orders its fields, and how text inside a field is written. This explainer settles the first two with the smallest layout that shows both: two cards that never say left or right, one at start and one at end, with the End card setting its own field direction.

The opening is the code itself, printed from the same options the scene passes to `s.card`, with a prediction about where the cards land. The rtl scenario is the one where the override shows; the ltr scenario is the control, where the override matches the stage and changes nothing visible, and left and start name the same half. The update step shows that a card keeps the column direction it was built with, and the last step is the countercase: physical left and right keep their halves, which is what a left-to-right flowchart needs.

The digits stay 123 in every card, so the page shows that swapping columns does not reverse the text inside a field; it does not attempt Arabic or Hebrew shaping, which is a separate subject.

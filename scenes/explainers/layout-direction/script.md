# How does RTL change panels and field columns?

In a right-to-left page the reader starts at the right, so the card they should read first belongs on the right. An author has a two-card layout and wants it to work in both reading directions without rewriting it. The layout never says left or right. One card goes at start, the other at end, and the End card sets its own field direction to left-to-right. On a right-to-left stage, which half does the Start card land in, and on which side of the value 123 does each card put its field name?

Start lands on the right and End on the left, because the stage maps the logical places onto halves according to its direction. The Start card also takes its field columns from the stage, so its name sits to the right of 123. The End card's own left-to-right setting overrides the stage, so its name sits on the left. Both cards still read 123: the columns swap sides, but the digits inside a field keep their order.

Switch the stage to left-to-right and Start moves to the left half. Both cards now put the name before the value, because the End card's override happens to match the stage. The override shows its effect only when the stage disagrees with it.

Change both values to 456 and nothing moves. Each card keeps the column direction it was built with, so an update does not reorder its fields.

Left and right are different. A card placed at left stays on the left half in both directions, so they suit something that must keep its side, such as a flowchart whose arrows run left to right. Start and end suit panels that should follow the reader. That makes three separate choices: which half a panel takes, which way a card orders its fields, and how text inside a field is written. This page settles the first two with Latin labels and digits; it does not show how Arabic or Hebrew text is shaped.

# How does RTL change panels and field columns?

A layout puts one card at Start and another at End. If the stage becomes right-to-left, should Start remain on the left?

Logical Start moves to the right and End to the left. The physical Left and Right regions keep their coordinates. Using Start and End lets the panels follow the stage's reading direction; using Left and Right anchors them to particular sides.

The card's internal columns are a separate choice. The Start card follows the right-to-left direction, placing the field name to the right of its value. The End card overrides its columns to left-to-right, placing the name on the left. Both show the number 123 in the same digit order. Swapping field columns does not reverse the contents of a field.

Now update both values from 123 to 456. Each card keeps its own column direction: the name remains on the right in the Start card and on the left in the End card. Changing a value need not rebuild the layout's meaning.

This example separates three decisions: where a panel belongs, how a card orders its fields and how text inside a field is written. It uses Latin labels and numbers; it does not demonstrate Arabic or Hebrew text shaping.

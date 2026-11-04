# Construction and scope

The code panel prints the placement and override options the scene passes to `s.card`, read from the same constants; the cards' width, font size and titles are left out of it because they do not affect placement or field order. Every picture is the engine's own output, and the fidelity test measures each card's half and the order of its label and value rather than trusting the titles.

The left-to-right scenario is the control: there the End card's override matches the stage and changes nothing visible, and left and start name the same half. The stage reference linked in scene metadata is the API source.

The example uses Latin text only. Font and script support and bidirectional text shaping are separate from the panel and field-column directions shown here.

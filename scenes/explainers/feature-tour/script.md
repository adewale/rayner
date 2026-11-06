# What does an authoring feature leave on the page?

Four lines turn a circle into a square. While the motion plays, the relationship between the two shapes is plain. But someone who opens a link straight to the finished step sees only its resting picture. Before reading on, decide: does the transformation leave the circle, the square or both?

It leaves the square. Transform reshapes the object already on stage until it matches the target, so when it finishes there is one object, and it is square. The result on this page has a circle beside the square only because the page draws that circle separately, as a record of where the change started. The animation's starting state helps calculate the transition; it does not become a comparison panel by itself.

The same holds for text and code. A matching morph moves the letters two texts share and fades the rest; a code morph keeps the lines both versions share and replaces the others. At rest, the changed line is simply the current line, and earlier versions do not stay visible because the animation passed through them. The matching example lists which letters moved, so the correspondence can still be inspected after the motion.

A camera move changes something else. `s.focus(subject)` brings a small object closer by changing the view, not the object's coordinates. A before panel would sit inside the same closer view, so the page draws a ruler across the whole stage instead; after the focus it shows only its middle, while the circle is still at the origin.

Each of the twenty-nine scenarios pairs a few lines an author writes with the picture those lines leave. Settings choose among prepared scenarios, a drawing tool leaves its finished stroke, and saveState gives Restore a position and style to return to. The mechanics differ, but one question judges every result: what evidence remains once the motion ends?

Code describes what happens over time; a step opened from a link has to explain the state it leaves behind. When the motion is the point, draw what the reader needs to see at rest, as the starting copies, the ruler and the dashed outline do here.

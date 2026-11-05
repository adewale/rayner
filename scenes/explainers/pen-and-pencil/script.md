# Can hand-drawn strokes keep a diagram’s layout?

A timeline needs its event labels inside their boxes, even if its strokes look loose. In the opening drawing several words poke out. The words stayed where the layout placed them, but the simulated hand built the boxes by chaining imperfect moves: each new line started where the previous one actually ended.

Small errors therefore change the starting point of the next line. A slightly long side moves the corner; the next side starts from that displaced corner and adds its own error. Across several boxes the drift can become much larger than the wobble of an individual stroke. Two simulated drawings can place the same box about half a unit apart.

Now fix the intended corners and endpoints before drawing. The simulated pen follows that route like a mass pulled by a damped spring. It can lag or wobble while tracing a line, but the next stroke starts from its own fixed mark. A second drawing changes the ink’s deviations without moving the construction the ink follows.

The real timeline uses the same separation. Its layout positions boxes and words using the words' measured widths, and the construction pencil traces those marks before any ink. A close view of one ring makes the distinction visible: the pale construction band stays fixed while the darker stroke varies within it.

Placed beside the opening drawing, the traced timeline has wobbling strokes too, but its words fit their boxes. The useful distinction is between randomising a stroke around a planned route and letting earlier stroke errors decide later geometry. This is a demonstration of the explainer's hand model, not a measurement of how a person draws.

Two details sit off the main path. One shows the layout itself, with a box's measured width. The other draws the finished plate: planks, hanging tags and a rope on the marks, with sea strokes and gulls around them. Changing the drawing seed moves those decorations, which are free to change because they do not determine where a label belongs; the planks, tags and words still use the shared construction.

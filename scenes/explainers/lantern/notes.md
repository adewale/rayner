# Lantern notes

The example runs at 30 fps for 45 frames: a 0.5-second fade followed by a one-second move. The still comparison at one second is halfway through that move. The timeline plots the dot’s x at all 45 frames, played and seeked, and the frame-by-frame strips compare the whole frames; the general check samples two frames per teaching step.

Seeking retains intermediate work for updaters and for a play containing Succession. Those paths are outside the pictured two-motion comparison. The sink contract concerns Rayner’s provided sinks; it does not promise that a caller’s custom sink is free of mutations.

The nudge and blend give the same played frame at one second, so the still comparison isolates seeking. Elsewhere in the move their played paths differ: the blend eases in and out, the nudge moves evenly. The timeline step shows both paths. Fingerprints compare the rendered frames.

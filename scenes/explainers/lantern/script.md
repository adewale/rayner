# How can a still skip the frames before it?

A link to a later step opens on its picture without playing the steps before it. Rayner makes that picture as a still: it runs the scene from the beginning on the same clock, but skips computing the frames before the target time. How can a picture built that way agree with playback?

Take a small scene in which a box fades in, then a dot moves along a track. At one second, playback has the dot halfway along. One version moves the dot by a fixed nudge each time a frame is computed. A still at one second computes just one frame of that move, so its dot has made one nudge where playback made fifteen. Counting the frames kept the time right but did not reproduce the moves that piled up during playback.

The other version fixes the start and end positions when the animation begins, and works out the dot's position from the share of the move's duration that has elapsed. Halfway through the duration means halfway between those endpoints, whether the earlier frames were computed or skipped. Its still matches the played picture.

Two more facts make that work. The clock makes the target time unambiguous: at thirty frames a second, frame thirty is one second, whether a browser waits between frames or another output takes them at once. And the output receiver, called a sink, only reads each frame after the animations have placed the shapes and text; it cannot supply nudges that were never made.

Comparing a still with playback at every frame of the small scene shows where the difference starts. The fade and the first nudge agree, because each of them is one frame deep. From the second nudge on, the nudged dot depends on a history the still skipped. The blended dot agrees at all forty-five frames.

For an author the rule is practical: make each frame depend on the animation's elapsed time, not on how many frames ran before it. Rayner's check compares stills with playback at two times in every step and fails on a mismatch, but two samples cannot prove agreement at every time. Scenes with updaters, or a Succession in play, take a slower path that computes the earlier frames; the shortcut described here is the case without them.

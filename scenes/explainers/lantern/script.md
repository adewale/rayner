# Script: how can a still skip the frames before it?

Question the reader brings: open a Rayner page from a link to its fifth step and the player draws that step without playing the first four; `renderAt` makes stills the same way. If the frames before were never worked out, how can the picture be the one I would have seen playing?

A tiny scene grows a box and moves a dot along a track. Played, frame 30 is t = 1 s, and the dot is halfway. A still at t = 1 s runs the scene again from the start but only counts frames 1 to 29: it never works out where anything was during them. Where is the dot in the still?

That depends on how the dot is moved, and the case is the reader's lever. With `animate.moveTo`, the still is the played frame byte for byte. With a nudge, which shifts the dot 1/30 of the track on every frame the scene computes, as a game loop would, the still has the dot one nudge along: playback made 15 nudges by t = 1 s, the seek made one. Played, the two scenes give the same frame. That is the answer: a still re-runs the scene on the same fixed clock and only counts the frames before t, so it matches playback when each frame is worked out from the clock, never from the frame before.

Two things make that work for Rayner's own animations. First, the clock: scene time advances by a fixed 1/30 s per frame, whatever receives the frames. Whatever receives them is a sink: the browser sink waits for a display tick before each frame, the trace sink takes them all at once, and both see the same scene times. So a still for t = 1 s and playback both stop on frame 30.

Second, what a frame is worked out from. A scene owns mobjects, the shapes on stage; it plays animations, which change them; and it emits each frame to a sink, which only reads it. So the dot in frame 30 is wherever the playing animation put it. Rayner's animations copy their start when they begin and blend it with a fixed end at alpha = elapsed time / run time, so at t = 1 s alpha is 0.5 whether 29 frames ran before or none. The nudge has no endpoints: its dot is wherever the frames so far have pushed it.

Last, every frame of the tiny scene is made as a still and compared with playback: all 45 match with blending; with the nudge, the fade-in frames and the first frame of the move match, and from frame 17 none does. `rayner check` seeks two frames in every step of every case and fails on any difference, so a scene that nudges fails with a seek mismatch.

**The aha:** the nudge's still, with the dot near the start and an outline where playback put it, beside a played frame identical to the blend's; then the listing that shows why: `blend(start, end, t / runTime)` against `dot.shift(step)`.

**Sentence to remember:** a scene is a program on a fixed clock, and a still is a replay that only counts the frames before it.

**Check questions**, in `meta.checks`, asked after the last step:

1. Seek the nudging scene to t = 1.5 s, the last frame of the dot's move. Where is the dot in the still, and where in playback? (One nudge along; at the end.)
2. A third version moves the dot by the change in time since the last frame it computed. Does its still at t = 1 s match playback? (Yes: the one computed frame adds the whole change from 0 to 0.5.)

**Cases:** the dot moves by blending fixed endpoints (default) or by a nudge each frame. The nudge case's seek step answers "one nudge along" with the outline where playback put the dot. The last step shows both strips in every case.

| Step | Script | Reader predicts |
| --- | --- | --- |
| played | paragraph 1 and 2: the deep link, the played frame, frames 1 to 29 only counted | where the still's dot is |
| seek | paragraph 3: the same or a different fingerprint, and the answer | why blending survives the skip |
| clock | paragraph 4: the fixed clock, and the sinks named | |
| objects | paragraph 5: what a frame is worked out from; a sink only reads | what an animation must do to survive |
| begin | paragraph 5: endpoints fixed at begin(), the listing beside the nudge, with the camera on Animation (the aha) | |
| check | paragraph 6: every frame seeked for both motions, and rayner check; the sentence to remember | |

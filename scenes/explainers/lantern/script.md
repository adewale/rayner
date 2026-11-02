# Script: how can a still skip the frames before it?

Question the reader brings: open a Rayner page from a link to its fifth step and the player draws that step without playing the first four; `renderAt`, the function that saves one moment of a scene as an image, makes stills the same way. If the frames before were never worked out, how can the picture be the one I would have seen playing?

A tiny scene grows a box and moves a dot along a track. Played, frame 30 is t = 1 s, and the dot is halfway. A still at t = 1 s runs the scene again from the start but only counts frames 1 to 29: it never works out where anything was during them. Where is the dot in the still?

That depends on how the dot is moved, and the case is the reader's lever. The default moves it with a nudge, which shifts the dot 1/30 of the track on every frame the scene computes, as a game loop would. Played, the two motions give the same frame. Seeked, the nudge's still has the dot one nudge along: playback made 15 nudges by t = 1 s, and the seek made one. Moved with `animate.moveTo`, the still is the played frame byte for byte. The answer: a still re-runs the scene on the same fixed clock and, unless the scene has updaters, skips computing the frames before t, so it matches playback whenever each frame depends on the time alone, and can miss when a frame depends on how many frames ran before it.

Two things make that work for Rayner's own animations. The still can find frame 30 because scene time is the frame number × 1/30 s, whatever receives the frames. The receiver is called a sink: the browser sink waits for a display tick before each frame, the trace sink takes them all at once, and both see the same scene times. So a still for t = 1 s and playback both stop on frame 30.

Once the still reaches frame 30, the playing animation decides where the dot is. A scene owns mobjects, Rayner's name for the shapes and text on stage; it plays animations, which change them; and it emits each frame to a sink, which only reads it. So the dot in frame 30 is wherever the playing animation put it; when that place depends on how many frames ran before, as the nudge's does, a still that skips them can put the dot somewhere else. Rayner's animations copy their start when they begin and blend it with a fixed end at alpha = elapsed time / run time, so at t = 1 s alpha is 0.5 whether 29 frames ran before or none. The nudge has no endpoints: its dot is wherever the frames so far have pushed it.

Last, every frame of the tiny scene is made as a still and compared with playback. All 45 match with blending. With the nudge, the fade-in frames and the first frame of the move match, and from frame 17 none does. `rayner check` seeks the middle and last frame of every step of every case and fails on any difference, so a scene that nudges fails with a seek mismatch.

**The aha:** the default case's still, with the dot near the start and an outline where playback put it, beside a played frame with the dot halfway; then the listing that shows why: `blend(start, end, t / runTime)` against `dot.shift(step)`.

**Sentence to remember:** a scene is a program on a fixed clock, and a still is a replay that only counts the frames before it.

**Check questions**, in `meta.checks`, asked after the last step. Neither case is shown in any step: the first moves the check step's rule to new timings, the second is a third kind of motion.

1. In the nudge version, the fade-in is stretched from 0.5 s to 1 s, so the move runs from t = 1 s to 2 s and the scene has 60 frames. Does the still at t = 1 s now match, and which is the first frame whose still differs? (It matches: frame 30 is the fade's last frame and neither run has nudged. The first difference is frame 32, since frame 31 opens the move with one nudge in both runs. Checked against the engine with a copy of the tiny scene.)
2. Another version moves the dot by the change in time since the last frame it computed. Does its still at t = 1 s match playback? (Yes: the one computed frame adds the whole change from 0 to 0.5.)

**Cases:** the dot moves by a nudge each frame (default) or by blending fixed endpoints. The nudge case's seek step answers "one nudge along" with the outline where playback put the dot; the blend case's seek step shows the two fingerprints equal. The last step shows both strips in every case.

| Step | Script | Reader predicts |
| --- | --- | --- |
| played | paragraphs 1 and 2: the deep link, renderAt, the played frame, frames 1 to 29 only counted | where the still's dot is |
| seek | paragraph 3: the same or a different fingerprint, and the answer | why blending survives the skip |
| clock | paragraph 4: the fixed clock, and the sinks named | |
| objects | paragraph 5: what a frame is worked out from; a sink only reads | what an animation must do to survive |
| begin | paragraph 5: endpoints fixed at begin(), the listing beside the nudge; the camera moves in below the heading (the aha) | |
| check | paragraph 6: every frame seeked for both motions, and rayner check | |

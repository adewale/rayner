# How can a still skip the frames before it?

- **Reader:** an author writing Rayner scenes, or anyone who has written a frame loop; knows what an animation frame is, but has not asked how a direct link to a later step can show its picture without playing what comes before.
- **Answer:** A still re-runs the scene on the same fixed clock and, unless the scene has updaters or is playing a Succession, skips computing the frames before t, so it matches playback whenever each frame depends on the time alone, and can miss when a frame depends on how many frames ran before it
- **Changed condition:** how the dot moves. Blending fixed endpoints gives a still identical to playback at t = 1 s and at all 45 frames; a nudge each frame gives a still whose dot has made 1 nudge where playback made 15, and only the first 16 frames match.
- **Reader's own work:** predict where the still's dot will be before the seek step; switch between blending and nudging; then the three check questions, which ask the reader to transfer the rule to a stretched fade, a delta-based move and a typing animation.
- **Checked against:** Rayner's own engine: the scene runs its tiny scene through the real engine's src/scene.ts and `renderAt` (played, seeked to t = 1 s, and seeked to every frame) and refuses to build if blending fails to match or the nudge matches; `model.test.ts` holds the engine's clock, sinks, blending and seeking rules, and `fidelity.ts` checks each step's state against an independent calculation of the 45 frames (15 nudges played against 1 seeked, 45 and 16 matching frames).
- **Leaves out:** scenes with updaters and plays containing a Succession, which take the slower seek that computes every earlier frame; sinks other than Rayner's own, whose freedom from mutation it does not promise; and proof of agreement between the two times per step that `rayner check` samples.

## Check yourself

1. In the nudge version, the fade-in is stretched from 0.5 s to 1 s, so the move runs from t = 1 s to 2 s and the scene has 60 frames. Does the still at t = 1 s now match playback, and which is the first frame whose still differs?
   The still at t = 1 s matches: frame 30 is now the last frame of the fade, and neither run has nudged the dot yet. The first frame that differs is 32. Frame 31 opens the move, and the seek and playback have each made one nudge there; by frame 32 playback has made two and the seek still one.
2. Another version moves the dot by the change in time since the last frame it computed: x += distance × (α − α at the last frame). Does its still at t = 1 s match playback?
   Yes. begin() computes α = 0, the skipped frames are never computed, and the frame at t = 1 s adds the whole change from 0 to 0.5 in one go, so the dot is halfway, as in playback. Keeping state is allowed, as long as the frame comes out the same however many frames ran before it.
3. You write a typing animation: each computed frame appends the next character of a 60-character sentence, over a 2-second run at 30 fps. What does a still taken 1 s into that run show, and what change makes it match playback?
   Playback has computed 30 frames by then and shows 30 characters; the still computes only the frame at t and shows about one. Show the first round(60 × α) characters instead, where α is the elapsed share of the run: each frame then depends on the time alone, and both show 30 characters at the midpoint.

## Why this explainer

Rayner's direct links and `rayner check` both rest on one shortcut: a still re-runs the scene and skips computing the frames before its time. An author needs one rule from that, and it is practical: make each frame depend on the animation's elapsed time, not on how many frames ran before it.

The example is a scene small enough to run inside the explainer: a 0.5 s fade, then a 1 s move, at 30 fps, 45 frames. The two motions are chosen so that played, they give the same frame at t = 1 s; the still comparison there therefore isolates seeking, not a difference in the paths. (Elsewhere their played paths do differ, the blend easing in and out and the nudge moving evenly, and the timeline step shows both.) Every picture of the tiny scene is the engine's real output, redrawn from recorded frames, so the explainer cannot claim a match the engine does not produce.

The timeline turns the difference into a shape: playback is a line, and each seeked still is a dot that either sits on it or stays at the first nudge. The clock and sink steps supply the two facts the shortcut needs (frame k is always t = k / fps, and sinks only read a frame), and the begin step shows where a blend's endpoints come from. The check step ends on the practical boundary: comparing whole frames shows where the nudge first differs, and `rayner check` samples only two times per step, so agreement there proves nothing about the times between.

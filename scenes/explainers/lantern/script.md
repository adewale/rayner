# Script: how does one scene produce several outputs?

Question the reader brings: Rayner gives me a playable page, still images and a trace from one scene file. How can a still at some moment be the frame I would have seen playing, if nothing played?

A tiny scene grows a box and moves a dot. Played from the start, at t = 1 s it shows one particular frame. Now ask for a still at t = 1 s without playing the first second. Same SVG, or different?

The same, byte for byte: both frames have the same fingerprint. renderAt does not jump to t; it runs the scene's program again from the start and skips drawing every frame before t. Seeking re-runs the scene's program on the same fixed clock and skips only the drawing, so the still at t is the frame played at t.

Two things make that safe. First, the clock: scene time advances by a fixed step, 1/30 s, per frame, whatever receives the frames. Whatever receives them is a sink: the browser sink waits for a display tick before each frame, and the trace sink takes them all at once, but both see the same scene times. A replay reaches t = 1 s on frame 30, as playback did.

Second, the program never draws. A scene owns mobjects, the shapes and text on stage; it plays animations on them; and it emits each frame to a sink. The page, an SVG still and the trace are three sinks on the same frames. And an animation fixes its endpoints when it begins: each frame is a blend of a copied start and a fixed end at that animation's time. A frame depends only on the program and the clock, never on which frames were drawn before it, so skipping the drawing changes nothing.

The third output, the trace, records what each step did: this scene's own walks are in it, and rayner check compares played and seeked frames for every case, as this page just did with its tiny scene.

**The aha:** two thumbnails, one played and one seeked, with the same fingerprint.

**Sentence to remember:** a scene is a program on a fixed clock; every output is a sink on the same frames, and a still is a replay that skips the drawing.

**Check questions**, in `meta.checks`, asked after the last step:

1. How does renderAt make the still at t = 1 s?
2. On which frame does a replay reach t = 1 s, and why is it the same frame playback reached?
3. Why can the frames before t be skipped without changing the frame at t?

**One case:** the scene has no settings; its internal comparison is played against seeked.

| Step | Script | Reader predicts |
| --- | --- | --- |
| played | paragraph 1: the played frame at t = 1 s | same SVG, or different? |
| seek | paragraph 2: the same fingerprint, and the answer | why the skipped frames don't matter |
| clock | paragraph 3: the fixed clock, and the sinks named | |
| objects | paragraph 4: Scene, mobjects, animations, sinks | |
| begin | paragraph 4: endpoints fixed at begin(), with the camera on Animation | |
| inspect | paragraph 5: the trace and the check | |

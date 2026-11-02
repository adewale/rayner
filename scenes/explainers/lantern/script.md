# How can a still skip the frames before it?

A link to a later step opens directly on its picture. It does not make you watch the earlier steps. Rayner makes a still in much the same way: it runs the scene from the beginning but can skip calculating the intermediate pictures. How can the result agree with playback?

In this small scene a box fades in, then a dot moves along a track. At one second, playback has the dot halfway along. One version moves it by a fixed nudge whenever a frame is calculated. A still at the same time calculates just one frame of that move, so the dot has made one nudge. Counting time has not reproduced the movements that accumulated during playback.

The other version fixes the start and end positions when the animation begins. It calculates the dot’s position from the fraction of the move’s duration that has elapsed. Halfway through the duration means halfway between those endpoints, whether the earlier pictures were calculated or skipped. Its still matches the played picture.

The clock makes the target time unambiguous. At thirty frames a second, frame thirty is at one second. A browser may wait between frames while another output runs through them immediately; both receive the same scene times. The output receiver, called a sink, reads the frame after the animation has positioned its shapes and text. It does not supply the missing nudges.

Comparing stills with playback across the tiny scene exposes the difference. The fade and the first nudge agree; later nudged positions depend on a history the still skipped. The endpoint-based animation agrees throughout. This explains why time-based interpolation can support direct links, and why a scene that accumulates changes per calculated frame can fail that promise.

Rayner’s seek check compares selected stills with playback. It can catch this mismatch, but sampling a few times is not proof that an arbitrary animation agrees at every time. Some engine features also require intermediate calculations; the shortcut described here is the case without those features.

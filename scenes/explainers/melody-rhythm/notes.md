# Construction notes

The all-C comparison removes pitch while preserving every start and duration. The straight-timing control does the converse: it preserves the notes and removes the rhythmic shift. These are different controls, not alternate illustrations of the same claim.

The scores use eight notes, four pitches and half-beat durations at 96 BPM. A 120 BPM setting was dropped: it doubled the scenarios and changed only the milliseconds, never where G falls in the bar; `test/learning-models.test.ts` still holds the claims at both tempos. Version C from the first check question (G back on beat 4, beat 3 left without a new note) would be a timing option that changes the outcome, syncopation without a bar-line crossing; it stays a check question for now. Playback is an unaccented Web Audio oscillator; the beat click marks the meter. Accents, rests, swing, articulation and other ways of creating syncopation are outside the example. The score is computed and checked, but no listening study establishes a listener's perceived strength of syncopation.

The displayed timing changes are a longer first E and a shorter second E. The G duration is unchanged; its start shifts because the earlier E lasts longer. Keep that cause clear when shortening the prose.

The changed-duration and changed-meter exercises live in `scene.ts`'s `meta.checks`. They are checked against the score model and are not extra displayed scenarios.

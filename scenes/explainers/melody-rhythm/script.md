# Script: why does one version of a tune sound off the beat?

Questions the reader brings: Why do two versions of one tune feel different when the notes are the same? Why does one seem to pull against the beat? What is syncopation, and does it depend on tempo?

Two versions of a short tune, A and B, play the same eight notes in the same order, C D E G E D C C, on the same instrument at 96 beats a minute. Each is drawn as a piano roll: left to right is time, height is pitch, width is how long the note sounds. The opening draws no beat lines, so the picture shows that B's timing differs but not where it meets the beat. Listen to both. Does one of them seem to pull against the beat? Where?

Count along: 1 2 3 4, 1 2 3 4. The pulse clicks on every beat, with a different click on the first beat of each bar, and the beat lines and large 1s arrive with it. In A a new note starts on every click, including the 1 that opens bar 2, where E starts. Which note in B starts there?

None. B holds the first E for one and a half beats, so G starts halfway through beat 4, 312.5 ms before the bar line at 96 BPM, and is still sounding when the 1 arrives. The E after G is cut to half a beat, which puts D back on beat 2. That is the answer: the shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note. Open Music Theory calls this syncopation: notes that would typically start on strong beats or strong parts of beats start on weak parts instead. Here G and E start on half beats, and the held G sounds through the 1 where A starts E.

Is it the timing, or the climb to G? Flatten every pitch to C and keep each note's start and length, with a dot under each start, red between beats. B still has no note starting on the 1 of bar 2, and its two red dots sit either side of the bar line. By this page's own measure, a 1 that brings no new note, timing by itself is enough to put B off the beat. That is the ending. The control case, B with A's timing, plays the identical rhythm, every dot on a beat.

**The aha:** hearing the all-C version of B still skip the 1 of bar 2, with its two red dots either side of the bar line.

**Sentence to remember:** the shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note.

**Check questions**, in `meta.checks`, asked after the last step. Each applies the explainer's rule to a version or a count no case shows; `test/learning-models.test.ts` checks each answer's values.

1. Version C cuts A's first D to half a beat and holds the next E for one and a half beats. Which beat loses its new note, and does anything cross the bar line? (Beat 3 of bar 1; no.)
2. Count B in threes, so a bar line falls after every third beat. Which note holds across a bar line, and does the 1 of bar 3 bring a new note? (The first E, across the line at beat 3; yes, a C on the seventh beat.)
3. Suppose the E after G lasted a full beat, with later notes straight after it. Which notes of bar 2 start on a beat? (None: D, C and C start half a beat late, and the last C runs past the bar.)

**Settings:** Version B's control (same timing as A) removes the effect; every caption is written for its case. Tempo changes the milliseconds in the bar step and the playback speed; the piano roll is counted in beats and stays the same. Every step carries its score as `step.audio`, played by the reader, and `test/browser/explain-audio.test.ts` plays it at both tempos.

**Cut from the earlier version:** the timing step, merged into bar (how B was made, and the milliseconds); and the phrase step, a recap whose onset dots now sit in rhythm, the ending.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| listen | paragraph 1: same notes, the piano roll, listen | the two rolls, no beat lines | where B pulls against the beat |
| pulse | paragraph 2: the beat, and the strong 1 that opens each bar | every beat line strong, the 1s large, A's notes on the 1s outlined | which note in B starts on the 1 of bar 2 |
| bar | paragraph 3: how B was made, the answer, then the name syncopation | B's G in red, A's E on the 1 outlined | |
| rhythm | paragraph 4: flattened pitches; timing is enough: the ending | every note a C, a dot under every start, red between beats | |

## Limits

The model is two eight-note versions over four pitches, C D E G, counted as two bars of four beats, with lengths in half beats and no rests. Every note plays at one loudness from a Web Audio oscillator, so there are no accents, no articulation and no swing, and syncopation made by accents or rests does not appear. "Off the beat" is this page's measure of the score, whether the 1 of bar 2 brings a new note and whether starts fall between beats; no listening test backs it, and how strongly a listener hears the pull is not modelled.

No case shows a tempo other than 96 and 120 BPM (80 BPM appears only in a test), a count other than four beats to a bar (the second check counts in threes), or a shift other than B's two half-beat starts (the first and third checks ask about two more).

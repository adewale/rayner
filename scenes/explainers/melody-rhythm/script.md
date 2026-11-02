# Script: why does one version of a tune sound off the beat?

Questions the reader brings: Why do two versions of one tune feel different when the notes are the same? Why does one seem to pull against the beat? What is syncopation, and does it depend on tempo?

Two versions of a short tune, A and B, play the same eight notes in the same order, C D E G E D C C, on the same instrument at 96 beats a minute. Each is drawn as a piano roll: left to right is time in beats, height is pitch, width is how long the note sounds. Two bars of four beats; a strong line marks where bar 2 begins. Listen to both. Does one of them seem to pull against the beat? Where?

Count along: 1 2 3 4, 1 2 3 4. The pulse clicks on every beat, and the 1 that opens each bar is the strong beat a listener expects a new note on; the picture draws those 1s large. In A, every note starts on a click, and E starts exactly on the 1 of bar 2. Which note in B starts there?

None. In B, G starts halfway through beat 4, 312.5 ms before the bar line and later than A's G, and is still sounding when the 1 arrives; E follows half a beat after the 1. That is the answer: the shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note. Musicians call this syncopation: a note that would normally start on a strong beat starts on a weak part of a beat instead (Open Music Theory). Here that note is E, which A starts on the 1.

Is it the timing, or the climb to G? Flatten every pitch to C and keep each note's start and length. With the climb to G gone, B still has no note starting on the 1 of bar 2, so the off-beat feel comes from timing alone.

How was B made? It holds the first E for one and a half beats instead of one, so G and the E after it each start half a beat later than in A. That E is cut to half a beat, so D lands on beat 2 of bar 2 as in A, and the remaining notes line up again. At 96 BPM a beat lasts 625 ms, so G starts 312.5 ms before the bar line. The piano roll is counted in beats, so it looks the same at any tempo; only the milliseconds change.

The ending puts a dot under every note's start. A's dots all sit on beats. In B, G starts on the half beat before the bar line and E on the half beat after it, two red dots, so the 1 of bar 2 passes under the held G. The control case, B with A's timing, is the same phrase twice, every dot on a beat.

**The aha:** hearing the 1 of bar 2 pass under a held G in B, and seeing it as the two red dots either side of the bar line in the ending.

**Sentence to remember:** the shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note.

**Check questions**, in `meta.checks`, asked after the last step. Each is a transfer to a version or tempo no case shows; `test/learning-models.test.ts` checks each answer's values.

1. Version C cuts A's first D to half a beat and holds the next E for one and a half beats. Which beat loses its new note, and does anything cross the bar line? (Beat 3 of bar 1; no.)
2. A version with half a beat of silence before G in place of the longer E: does the 1 of bar 2 bring a new note? (No: G still starts at 3.5 and holds across.)
3. B at 80 BPM: how long before the bar line does G start, and how long does it sound? (375 ms; 750 ms, half in each bar.)

**Settings:** Version B's control (same timing as A) removes the effect; every caption is written for its case. Tempo changes the milliseconds in the bar and timing steps and the playback speed; the picture stays the same, as the timing step says. Every step carries its score as `step.audio`, played by the reader.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| listen | paragraph 1: same notes, the piano roll, listen | the two rolls, with bar labels | where B pulls against the beat |
| pulse | paragraph 2: the beat, and the strong 1 that opens each bar | every beat line strong, the 1s large, A's notes on the 1s outlined | which note in B starts on the 1 of bar 2 |
| bar | paragraph 3: the answer, then the name syncopation | B's G in red, A's E on the 1 outlined | |
| rhythm | paragraph 4: flattened pitches; timing alone | every note a C | |
| timing | paragraph 5: how B was made, and what tempo does not change | the three changed notes in red | |
| phrase | paragraph 6: two starts between beats, either side of the bar line | a dot under every start, red between beats | |

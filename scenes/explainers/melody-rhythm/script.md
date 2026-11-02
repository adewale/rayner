# Script: why does one version of a tune lean forward?

Questions the reader brings: Why do two versions of one tune feel different when the notes are the same? Why does one seem to push ahead? What is syncopation, and does it depend on tempo?

Two versions of a short tune, A and B, play the same eight notes in the same order, C D E G E D C C, on the same instrument at 96 beats a minute. Each is drawn as a piano roll: left to right is time in beats, height is pitch, width is how long the note sounds. Two bars of four beats; a strong line marks where bar 2 begins. Listen to both. Does one of them seem to push ahead? Where?

Count along: 1 2 3 4, 1 2 3 4. The pulse clicks on every beat, and the 1 that opens each bar is the beat a listener leans on; the picture draws those 1s large. In A, every note starts on a click, and E starts exactly on the 1 of bar 2. Which note in B starts there?

None. In B, G starts halfway through beat 4, 312.5 ms before the bar line, and is still sounding when the 1 arrives; E follows half a beat later. That early G is where B leans forward. That is the answer: a tune leans forward when a note starts before the bar line and holds across it, so the strongest beat gets no new note. Musicians call this syncopation: a note that would normally start on a strong beat starts on a weak part of a beat instead.

Is it the timing, or the climb to G? Flatten every pitch to C and keep each note's start and length. B still has no note starting on the 1 of bar 2: the lean is timing alone.

How was B made? It holds the first E for one and a half beats instead of one, which pushes G half a beat later. The E after G is cut to half a beat, so D lands on beat 2 of bar 2 as in A, and the rest lines up again. Two lengths change, so two starts move. At 96 BPM a beat lasts 625 ms, so G starts 312.5 ms early; at any tempo it starts half a beat early, and the piano roll, counted in beats, does not change.

The ending puts a dot under every note's start. A's dots all sit on beats. B's are the same except two, either side of the bar line, that fall between beats: the same tune, with the same rise and fall, reaching bar 2 half a beat early. The control case, B with A's timing, is the same phrase twice, every dot on a beat.

**The aha:** hearing G arrive before the bar line in B, with the 1 passing under a held note, and seeing it as the two red dots in the ending.

**Sentence to remember:** a tune leans forward when a note starts before the bar line and holds across it, so the strongest beat gets no new note.

**Check questions**, in `meta.checks`, asked after the last step:

1. Where does the shifted version of B lean forward, and why does the 1 of bar 2 bring no new note?
2. Which two notes of B change length, and why must both change?
3. Play B at 80 BPM, a tempo no case shows. How long before the bar line does G start, and does the piano roll change? (375 ms, tested in `test/learning-models.test.ts`; no step prints it)

**Settings:** Version B's control (same timing as A) removes the effect; every caption is written for its case. Tempo changes the milliseconds in the bar and timing steps and the playback speed, not the picture, which is the point the timing step makes. Every step carries its score as `step.audio`, played by the reader.

| Step | Script | Picture | Reader predicts |
| --- | --- | --- | --- |
| listen | paragraph 1: same notes, the piano roll, listen | the two rolls, with bar labels | where B pushes ahead |
| pulse | paragraph 2: the beat, and the 1 a listener leans on | every beat line strong, the 1s large, A's notes on the 1s outlined | which note in B starts on the 1 of bar 2 |
| bar | paragraph 3: the answer, then the name syncopation | B's G in red, A's E on the 1 outlined | |
| rhythm | paragraph 4: flattened pitches; timing alone | every note a C | |
| timing | paragraph 5: how B was made, and what tempo does not change | the three changed notes in red | |
| phrase | paragraph 6: the same tune, half a beat early at the bar line | a dot under every start, red between beats | |

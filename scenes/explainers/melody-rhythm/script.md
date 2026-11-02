# Script: what happens when a note starts before the bar line?

Questions the reader brings: Why do two versions of one tune sound different when the notes are the same? What is syncopation? Does it depend on tempo?

Two versions of a short tune, A and B, play the same eight notes in the same order, C D E G E D C C, on the same instrument at 96 beats a minute. Each is drawn as a piano roll: left to right is time in beats, height is pitch, width is how long the note sounds. Two bars of four beats; a strong line marks where bar 2 begins. Listen to both: B sounds different. Where does it part from A?

Count along: 1 2 3 4, 1 2 3 4. The pulse clicks on every beat, and the 1 after the bar line is the beat a listener leans on hardest. In A, every note starts on a click, and E starts exactly on that 1. Which note in B starts there?

None. In B, G starts halfway through beat 4, 312.5 ms before the bar line, and is still sounding when beat 1 arrives; E follows half a beat later. That is the answer: when a note starts before the bar line and holds across it, the strongest beat gets no new note. A note that starts on a weak part of the beat, where a strong beat would carry it, is called syncopation.

Is it the timing, or the climb to G? Flatten every pitch to C and keep each note's start and length. B still has no note starting on beat 1 of bar 2: the effect is timing alone.

How was B made? It holds the first E for one and a half beats instead of one, which pushes G half a beat later. The E after G is cut to half a beat, so D lands on beat 2 of bar 2 as in A, and the rest lines up again. Two lengths change, so two starts move.

Does tempo matter? At 96 BPM half a beat is 312.5 ms; at 120 BPM it is 250 ms. G still starts half a beat before the bar line, so the score, counted in beats, does not change. Syncopation is about where a note falls against the beat, not how many milliseconds early it is.

The ending: the same tune, the same rise and fall, placed differently against the beat. The control case, B with A's timing, is the same phrase twice.

**The aha:** hearing G arrive before the bar line in B, with beat 1 passing under a held note.

**Sentence to remember:** when a note starts before the bar line and holds across it, the strongest beat gets no new note, and that is syncopation.

**Check questions**, in `meta.checks`, asked after the last step:

1. In the shifted version of B, where does G start, and what is sounding on beat 1 of bar 2?
2. Which two notes of B change length, and why must both change?
3. At 120 BPM, how long before the bar line does B's G start, and is it still syncopated?

**Settings:** Version B's control (same timing as A) removes the effect; every caption is written for its case. Tempo changes the milliseconds in the bar and timing steps and the playback speed, not the picture, which is the point the timing step makes.

| Step | Script | Reader predicts |
| --- | --- | --- |
| listen | paragraph 1: same notes, the piano roll, listen | where B parts from A |
| pulse | paragraph 2: the beat, and the strongest one | which note in B starts on beat 1 of bar 2 |
| bar | paragraph 3: the answer, then the name syncopation | |
| rhythm | paragraph 4: flattened pitches; timing alone | |
| timing | paragraphs 5 and 6: how B was made, and what tempo does not change | |
| phrase | paragraph 7: the same tune, placed differently against the beat | |

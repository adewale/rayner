# Why does one version of a tune sound off the beat?

- **Reader:** a listener or beginner musician who can hear that a tune feels off the beat but cannot say why; needs no notation, only the piano roll's left-to-right time and up-and-down pitch.
- **Answer:** The shifted B sounds off the beat because its G starts halfway through beat 4 and holds across the bar line, so the 1 of bar 2 brings no new note
- **Changed condition:** version B's timing. With two notes started half a beat later, G holds across the bar line and the 1 of bar 2 brings no new note; with B given A's timing, every start falls on a beat and E starts on the 1, so the control has no shifted starts.
- **Reader's own work:** listen to both versions and predict where B pulls against the beat; play them again counting along with the clicks, and again with every pitch C; switch B to the control timing; answer the check questions, which move a different note, count in threes, and leave the E after G a full beat long.
- **Checked against:** nothing external: the score is the model's own arithmetic. `test/learning-models.test.ts` checks it at 96 and 120 BPM: the pitches and total length are unchanged, exactly two starts and two lengths move, A starts a note on every beat, the shifted B starts none on the 1 of bar 2 and holds G across the bar line, the control B starts every note on a beat, and each check answer follows from the notes it describes.
- **Leaves out:** rests, accents, swing, articulation and loudness changes, and other ways of making syncopation; meters other than two bars of four beats; how strongly a listener hears the pull, which no listening study here measures.

## Check yourself

1. A version C starts from A, cuts the first D to half a beat and holds the E after it for one and a half beats, so G is back on beat 4. Which beat now brings no new note, and does any note cross the bar line?
   Beat 3 of bar 1: E starts halfway through beat 2 and is still sounding on beat 3. Nothing crosses the bar line, so the 1 of bar 2 brings E, as in A.
2. Count B in threes instead, 1 2 3 1 2 3, so a bar line falls after every third beat. Which note now holds across a bar line, and does the 1 of bar 3 bring a new note?
   The first E. It starts on beat 3 of bar 1 and lasts one and a half beats, so it is still sounding when bar 2 begins, and G starts half a beat into bar 2. The 1 of bar 3, the seventh beat, brings a C that starts exactly there.
3. Suppose the E after G lasted a full beat, as in A, with every later note following straight after it. Which notes of bar 2 would start on a beat?
   None. D and both Cs would each start half a beat late, halfway through beats 2, 3 and 4, and the last C would run half a beat past the end of bar 2. Cutting that E to half a beat is what lets B land back on the beat.

## Why this explainer

Syncopation is usually defined, "stress on the weak beat", and then illustrated. This explainer starts with the ear instead: two versions of the same eight notes, one of which feels off, and the reader is asked where before anything is named. The answer is in the score, where the reader can see that no new note starts on the 1 of bar 2 because G started early and is still sounding.

Two controls do different jobs and should stay separate. The all-C comparison removes pitch while keeping every start and length, so the reader cannot credit the climb to G for the effect. The straight-timing setting does the opposite, keeping the notes and removing the shift, so the setting changes the conclusion and not just the sound.

The cause of G's late start is the longer first E, not a change to G itself, and the shorter E after G is what brings D back onto beat 2; keep that clear when shortening the words. A 120 BPM setting was dropped because it doubled the scenarios and changed only the milliseconds, never where G falls in the bar. A version C, G back on beat 4 with beat 3 left without a new note, would make a timing option that changes the outcome (syncopation without crossing the bar line); for now it is the first check question.

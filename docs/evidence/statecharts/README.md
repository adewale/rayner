# Statecharts: decisions

Based on the media player in David Khourshid's [Statecharts in 2 minutes](https://x.com/DavidKPiano/status/2116523008323981315).

```text
Reader:    writes flat state machines and keeps hearing "use a statechart"
Question:  my player had three states until I added a mute button. Why did it double, and what does a statechart do about it?
Answer:    an independent button splits every state it applies to and copies every arrow those states had. A box (on)
           carries the shared POWER arrow once; side-by-side regions keep playback and volume apart, so each grid cell
           is one state from each region. Same behaviour, checked against XState 5.33.3.
Holds:     only when the buttons do not constrain each other
Still?     the article's before/after images show the end states; the scene earns motion by showing the split happen
           and by carrying each cell's words into the regions, so the reader sees which state became which
```

| question | before | model operation | after | same entity | resting witness | source |
| --- | --- | --- | --- | --- | --- | --- |
| What is the flat state playing · muted in the statechart? | grid cell playing · muted, marked | keep each cell's two words, drop the cells: top words form the playback region, bottom words the volume region | playing and muted, marked, one in each region | the cell's own words move; duplicates fade | flat grid (left) and chart (right) side by side, the same pair marked in both | `activeStates` of configuration `[playing, muted]`; XState reaches the same configuration |

| baseline | changed | fixed | predicted | pictured | caption |
| --- | --- | --- | --- | --- | --- |
| mute works paused or playing | mute works only while playing; pausing leaves volume, so playing restarts unmuted | off, paused, playing, POWER, PLAY, PAUSE | flat 5 states, 13 transitions → 4, 9; the grid loses paused · muted; regions would allow it; volume nests inside playing; chart 6, 6 in both | the empty cell; volume inside the playing box | each case's own counts and structure |

- **Native drawing, not Mermaid.** Auto-layout put states out of order and could not keep a state recognisable between pictures. Every arrow is drawn from a model transition, and every box from a model state.
- **No growth table.** Three controls make an 8-cell cube that cannot be drawn legibly; the counts that matter sit under each drawing.
- **Limits.** The model covers compound and parallel states with event transitions only; XState vouches for these charts, not for statecharts in general. On a 390 px phone the side-by-side steps need tours of 8 to 11 views, and the mute step opens on the unchanged left column: the heading line's 12 px floor sets a zoom at which the grid cannot fit one view. No subject expert has reviewed the scene.
- **Independent rubric read** (2026-11-01, a reviewer given the pictures, transcript and code but not the author's scores): 19/24, Q4 P3 V2 B3 G4 E3. Acted on: start dots on every compound state, the countercase's premise (pausing unmutes) stated, counts named as boxes, and a final title that claims only what is pictured. Not acted on: the regions alternative in the countercase is described, not drawn.

# Script: will this Tailwind colour fit the display?

Questions the reader brings: Tailwind 4 moved to oklch for "more vivid" colours; do my users see them? What happens on an ordinary sRGB screen? Is it a few colours or most of them?

You wrote cyan-500. Tailwind CSS 4 writes it as oklch(71.5% 0.143 215.221): lightness, chroma and hue, where chroma is how far the colour stands from grey. An sRGB screen cannot show chroma 0.143 at that lightness and hue, so this page, drawn in sRGB, has no paint for it. CSS Color 4 says such a colour must be brought inside the screen's range, and its gamut mapping turns cyan-500 into #00b8db, chroma 0.130: less vivid than you wrote. Is cyan the only one?

Cyan is one of 17 colours at shade 500, all written the same way, and Tailwind's own announcement says the move to oklch makes colours more vivid where sRGB had limited them. To see which of them an sRGB screen can show, draw sRGB's limit for each: on a radar with a spoke per family, the outline is the most chroma sRGB can show at that colour's lightness and hue, its sRGB edge. It sits at a different chroma on every spoke.

Draw Tailwind's chroma over it and the answer is there: most of these colours lie outside sRGB, so an sRGB screen shows them less vivid than written; 14 of 17, with only red, fuchsia and pink inside. At this scale the overshoot looks like a sliver: the furthest out in raw chroma, lime-500, is only 0.024 past the edge. Yet the first step showed what a sliver does to cyan.

Rescale each spoke to its own edge, so the edge becomes the 100 ring. The sliver becomes 113.1% for cyan: its edge is lower than lime's, so a smaller overshoot is a larger share of it. Pink has the most room, at 90.4%.

Add Display P3's edge: it lies beyond sRGB's on every spoke, and all 17 fit inside it, amber-500 closest at 98.4%. The reader's screen setting decides the ending. On sRGB, CSS Color 4's binary search lowers each colour's chroma until it lands on the edge; yellow-500 loses most. On Display P3, gamut mapping leaves a colour inside the gamut unchanged, so all 17 show as written.

**The aha:** the morph from raw chroma to share of the edge, where lime's sliver and cyan's swap places and cyan's 113.1% appears.

**Sentence to remember:** most of these colours lie outside sRGB, so an sRGB screen shows them less vivid than written; a Display P3 screen shows them all.

**Check questions**, in `meta.checks`, asked after the last step:

1. Which Tailwind 500 colour goes furthest past its own sRGB edge, and how far?
2. In raw chroma lime-500 is furthest past the edge; why does the share view put cyan-500 first?
3. Which 500 colours does an sRGB screen show exactly as written?

**The reader's levers:** Shade (300, 500, 700) changes the opening colour (purple-300, cyan-500, emerald-700) and every count; Screen (sRGB or Display P3) changes the ending. The opening always compares with sRGB.

| Step | Script | Reader predicts |
| --- | --- | --- |
| reader-display | paragraph 2: cyan-500 as written and as an sRGB screen paints it | whether cyan is the only one |
| oklch | paragraph 3: the 17 colours, all oklch | |
| srgb-edge | paragraph 3: sRGB's edge on each spoke, and the name | |
| palette | paragraph 4: 14 of 17 outside; the answer; the sliver | |
| share | paragraph 5: the sliver as 113.1%: the aha | |
| p3-edge | paragraph 6: P3's edge, none outside | |
| srgb-screen or p3-screen | paragraph 6: what the chosen screen does | |

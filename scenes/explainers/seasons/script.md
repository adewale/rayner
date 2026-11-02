# Script: why do seasons change with latitude?

Questions the reader brings: Is summer when Earth is closest to the Sun? Why are the seasons opposite in Sydney? Why does Tromsø get midnight sun and Quito hardly any seasons?

Earth's orbit is slightly oval, so once a year it passes nearest the Sun and half a year later farthest. A common guess is that summer comes when Earth is nearest. If so, the north would be nearest in its summer, around July. Which month is it?

Early January, in the middle of the northern winter, when the south has summer. The tilt of Earth's axis, not its distance from the Sun, makes the seasons: the axis is tilted 23.44° from upright to the orbit and points the same way all year, so the north end leans toward the Sun in June and away from it in December. The latitude where the noon Sun is overhead, the Sun's declination, swings from 23.44° north to 23.44° south.

Look at London in June from the side. As Earth turns, London travels round its latitude circle, and most of that circle is on the day side: 16.4 h of daylight. The noon Sun stands 61.9° above London's horizon, 90° minus the gap between London's latitude and the latitude where the Sun is overhead. The angle matters because it sets how hard the sunlight lands: a beam that would light one square metre from overhead spreads over 1 ÷ sin 61.9° = 1.13 m² at this angle, so each square metre gets 88% of an overhead Sun's light at noon (the air, which takes more at low angles, is left out). Half an orbit later the axis points the same way, so the south end leans sunward: London's day shrinks to 7.6 h and its noon Sun to 15.1°, 26% of overhead. Both the longer days and the stronger sunlight fall in June, so June is London's summer.

Whose daylight changes most? Draw the four places' circles on both globes. Tromsø's circle is all day in June and all night in December, 24 h to 0 h; Quito's, on the equator, is always cut in half, 12 h in both. Sydney's swings the opposite way to London's. Latitude sets how much of each circle is lit. The day lengths are the sunrise equation's, the hours the Sun's centre is above a flat horizon, without the air's refraction; the latitude step says how close that is to an almanac.

Run the same model on every day of the year and London's daylight traces a curve from 7.6 h in December to 16.4 h in June. Back to the opening question, with numbers. The orbit formula on the Position of the Sun page puts Earth at 0.983 of its average distance in early January and 1.017 in early July: 3.4% farther, so the sunlight reaching Earth is about 7% stronger in January. That is small beside the tilt's change at London, 26% to 88% of overhead sunlight at noon, and it reaches both hemispheres at once: on 15 January London gets 8.0 h and latitude −51.5° gets 16.0 h, the same distance from the Sun on the same day. In Quito's case the same numbers are set against London's January winter and Sydney's January summer, and Quito's unchanging 12 h and 66.6° solstice Sun. One formula draws all four places' curves, so latitude alone sets how far each one swings; London and Sydney peak six months apart because each hemisphere leans sunward in the opposite half of the year.

**The aha:** the nearest point comes in the northern winter, and the same day gives one hemisphere its short days and the other its long ones; distance changes sunlight by 7% while the tilt changes London's noon sunlight more than threefold.

**Sentence to remember:** the axis keeps its tilt as Earth goes round, so for half the year each hemisphere leans sunward, with longer days and a higher, stronger noon Sun; distance is a 3% effect felt everywhere at once.

**Check questions**, in `meta.checks`, asked after the last step. Each applies the explainer's two formulas to a place or a condition no step shows:

1. Cairo, 30° N, at the June solstice: noon altitude and share of overhead sunlight? (83.4°, sin = 0.99.)
2. Reykjavík, 64.1° N: midnight sun at the June solstice, by this model? (No: 20.4 h; that needs a latitude above 66.56°.)
3. With no tilt, London on 15 January and 15 July? (12 h both days, noon Sun 38.5°, 62% of overhead; only distance would differ.)

The model is in `lib/models.ts`: `sunlight` (day length and noon altitude from latitude and declination, with a cosine approximation for declination), `daylightYear`, `noonShare` (sin of the noon altitude) and `sunDistance` (Wikipedia's R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g, perihelion about 2 days after 1 January). The four places are the cases; London is the default.

| Step | Script | Reader predicts |
| --- | --- | --- |
| nearest | paragraph 1, the common guess as a question | which month Earth is nearest |
| tilt | paragraph 2, January, the answer, the tilt and declination named | whether the place gets more or less than 12 h in June |
| june | paragraph 3, the lit part of the latitude circle | |
| noon | paragraph 3, the noon angle, its formula, and the beam spread over 1 ÷ sin of it: sunlight per m² | |
| december | paragraph 3, the same axis half an orbit later: shorter days and weaker noon sunlight together | whose daylight changes most |
| latitude | paragraph 4, all four circles on both globes; the sunrise equation and refraction | |
| year | paragraph 5, the model through the year | |
| distance | paragraph 5, the opening question answered with the orbit formula: 3.4% farther in July, 7% more sunlight in January, both hemispheres at once | |
| compare | paragraph 5, four places, one formula | |

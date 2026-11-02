# Script: why does the north have summer when Earth is farthest from the Sun?

Questions the reader brings: Is summer when Earth is closest to the Sun? Why are the seasons opposite in Sydney? Why does Tromsø get midnight sun and Quito hardly any seasons?

Earth's orbit is slightly oval, so once a year it passes nearest the Sun and half a year later farthest. A common guess is that the seasons follow this distance, with summer when Earth is nearest. Which month is Earth nearest?

Early January, in the middle of the northern winter, when the south has summer. The tilt of Earth's axis, not its distance from the Sun, makes the seasons: the axis leans 23.44° from upright and keeps pointing the same way, so the north end leans toward the Sun in June and away from it in December.

Look at London in June from the side. As Earth turns, London travels round its latitude circle, and most of that circle is on the day side: 16.4 h of daylight. At June noon the Sun is overhead at 23.44° N, the Sun's declination; in December at 23.44° S. The noon Sun stands 61.9° above London's horizon, 90° minus the gap between London's latitude and the declination. A lower Sun spreads the same beam over more ground: a beam that would light one square metre from overhead covers 1 ÷ sin 61.9° = 1.13 m² at this angle, so each square metre gets 88% of an overhead Sun's light at noon (the air, which takes more at low angles, is left out). Half an orbit later the axis points the same way, so the south end leans sunward: London's day shrinks to 7.6 h and its noon Sun to 15.1°, 26% of overhead. Both the longer days and the stronger sunlight fall in June, so June is London's summer.

Whose daylight changes most? Draw the four places' circles on both globes. Tromsø's circle is all day in June and all night in December, 24 h to 0 h; Quito's, on the equator, is always cut in half, 12 h in both. Sydney's swings the opposite way to London's. The day lengths are the sunrise equation's, the hours the Sun's centre is above a flat horizon; an almanac times the Sun's top edge and adds refraction, so its June day at London is about a quarter of an hour longer.

Run the same model on every day of the year and London's daylight traces a curve from 7.6 h in December to 16.4 h in June. In the model every place off the poles gets 12 hours at the equinoxes; an almanac's equinox day is a little longer.

Back to the opening question, with numbers, and the ending. The orbit formula on the Position of the Sun page puts Earth at 0.983 of its average distance in early January and 1.017 in early July, so January's sunlight is about 7% stronger (the picture adds that July is 3.4% farther). The tilt moves London's noon sunlight between 26% and 88% of overhead. Distance reaches both hemispheres at once: on 15 January London gets 8.0 h and latitude −51.5° gets 16.0 h, and the grey curves, the same formula at Tromsø, Quito and Sydney, give 0.0 h, 12.0 h and 14.0 h on that day. Every place is the same distance from the Sun on a given day, so the opposite seasons come from the tilt. In Quito's case the same numbers are set against London's January winter and Sydney's January summer, and Quito's unchanging 12 h and 66.6° solstice Sun.

**The aha:** the nearest point comes in the northern winter, and on that one day, at one distance from the Sun, the chart's curves give one hemisphere its short days and the other its long ones; distance changes sunlight by 7% while the tilt changes London's noon sunlight more than threefold.

**Sentence to remember:** the axis keeps its tilt as Earth goes round, so for half the year each hemisphere leans sunward, with longer days and a higher, stronger noon Sun; distance is a 3% effect felt everywhere at once.

**Check questions**, in `meta.checks`, asked after the last step. Each changes a condition no step shows:

1. With a 45° tilt, would London get midnight sun at the June solstice, and how high would its noon Sun stand? (Yes, above 45° every circle is lit; 90° − |51.5° − 45°| = 83.5°.)
2. With a circular orbit, which of London's numbers would change? (Only January's extra sunlight; day length and noon share use latitude and declination alone.)
3. With an 80° tilt, Quito's daylight and noon share at the June solstice? (Still 12 h; noon Sun 10° up, sin 10° = 17% of overhead.)

The model is in `lib/models.ts`: `sunlight` (day length and noon altitude from latitude and declination, with a cosine approximation for declination), `daylightYear`, `noonShare` (sin of the noon altitude) and `sunDistance` (Wikipedia's R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g, perihelion about 2 days after 1 January). The four places are the cases; London is the default.

Cut from the earlier version: the compare step, whose four curves now sit in the distance step, so the explainer ends on the opening question answered.

| Step | Script | Reader predicts |
| --- | --- | --- |
| nearest | paragraph 1, the common guess | which month Earth is nearest |
| tilt | paragraph 2, January, the answer, the tilt | whether the place gets more or less than 12 h in June |
| june | paragraph 3, the lit part of the latitude circle; declination named | |
| noon | paragraph 3, the noon angle, its formula, and the beam spread over 1 ÷ sin of it: sunlight per m² | |
| december | paragraph 3, the same axis half an orbit later: shorter days and weaker noon sunlight together | whose daylight changes most |
| latitude | paragraph 4, all four circles on both globes; the sunrise equation and the almanac | |
| year | paragraph 5, the model through the year | |
| distance | paragraph 6, the ending: the opening question answered with the orbit formula, and all four places' curves on 15 January | |

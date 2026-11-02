# Script: why do seasons change with latitude?

Questions the reader brings: Is summer when Earth is closest to the Sun? Why are the seasons opposite in Sydney? Why does Tromsø get midnight sun and Quito hardly any seasons?

Earth's orbit is slightly oval, so once a year it passes nearest the Sun and half a year later farthest. A common guess is that summer comes when Earth is nearest. If so, the north would be nearest in its summer, around July. Which month is it?

Early January, in the middle of the northern winter, when the south has summer. Distance cannot make the seasons. The tilt of Earth's axis, not its distance from the Sun, makes the seasons: the axis is tilted 23.44° from upright to the orbit and points the same way all year, so the north end leans toward the Sun in June and away from it in December. The latitude where the noon Sun is overhead, the Sun's declination, swings from 23.44° north to 23.44° south.

Look at London in June from the side. As Earth turns, London travels round its latitude circle, and most of that circle is on the day side: 16.4 h of daylight. The noon Sun stands 61.9° above London's horizon, 90° minus the gap between London's latitude and the latitude where the Sun is overhead. Half an orbit later the axis points the same way, so the south end leans sunward, and London's day shrinks to 7.6 h.

Whose daylight changes most? Draw the four places' circles on both globes. Tromsø's circle is all day in June and all night in December, 24 h to 0 h; Quito's, on the equator, is always cut in half, 12 h in both. Sydney's swings the opposite way to London's. Latitude sets how much of each circle is lit.

Run the same model on every day of the year and London's daylight traces a curve from 7.6 h in December to 16.4 h in June. Back to the opening question: on 15 January, close to the nearest point, London gets 8.0 h and latitude −51.5° gets 16.0 h, the same distance from the Sun on the same day. One formula draws all four places' curves.

**The aha:** the nearest point comes in the northern winter, and the same day gives one hemisphere its short days and the other its long ones.

**Sentence to remember:** the axis keeps its tilt as Earth goes round, so for half the year each hemisphere leans sunward and its latitude circles are mostly lit; distance plays no part.

**Check questions**, in `meta.checks`, asked after the last step:

1. When is Earth nearest the Sun, and what is London's daylight on 15 January?
2. London gets 16.4 h at the June solstice. Why does Sydney get only 9.7 h that day?
3. London's June noon Sun stands 90° − |51.5° − 23.44°| above the horizon. What is the 23.44°?

The model is `sunlight` and `daylightYear` in `lib/models.ts`: day length from latitude and declination, with a cosine approximation for declination. It has no distance term. The four places are the cases; London is the default.

| Step | Script | Reader predicts |
| --- | --- | --- |
| nearest | paragraph 1, the common guess as a question | which month Earth is nearest |
| tilt | paragraph 2, January, the answer, the tilt and declination named | whether the place gets more or less than 12 h in June |
| june | paragraph 3, the lit part of the latitude circle | |
| noon | paragraph 3, the noon angle and its formula | |
| december | paragraph 3, the same axis half an orbit later | whose daylight changes most |
| latitude | paragraph 4, all four circles on both globes | |
| year | paragraph 5, the model through the year | |
| distance | paragraph 5, the opening question answered with the model | |
| compare | paragraph 5, four places, one formula | |

# Why does the north have summer when Earth is farthest from the Sun?

- **Reader:** knows Earth orbits the Sun and spins once a day, and half-believes that summer comes when Earth is nearest the Sun.
- **Answer:** The tilt of Earth’s axis, not its distance from the Sun, makes the seasons
- **Changed condition:** the place observed from (Tromsø, London, Quito or Sydney). The swing between June and December grows with latitude: Tromsø goes from all-day to all-night, Quito stays at 12 hours, and Sydney swaps the other way from London, while the distance effect is the same for all of them.
- **Reader's own work:** predict the month Earth is nearest the Sun, whether the chosen place gets more or less than 12 hours of daylight in June, and whose daylight changes most; choose the place to observe from; then the two check questions.
- **Checked against:** Nothing external: the model computes the cited formulas (the sunrise equation, a cosine approximation of the declination, and Wikipedia's Position of the Sun distance formula), and its own tests in `model.test.ts` check them by property (hemisphere symmetry, opposite seasons summing to 24 h, polar day and night, the equator at 12 h) and by hand-worked values (London 16.4 h and 7.6 h, perihelion 0.98329 AU); `fidelity.ts` holds each step's state and printed arithmetic to the model.
- **Leaves out:** refraction, the Sun's disc, hills and buildings (so almanac days are longer and polar nights shorter); absorption by the atmosphere; weather and temperature; any tilt but 23.44°; places beyond the four cities and their mirrored latitudes; and an almanac check of every date on the yearly curve, which comes from the approximation.

## Check yourself

1. At the December solstice London’s noon Sun gives 26% of overhead sunlight at Earth’s average distance. Earth is then near its nearest point. Taking the distance into account, what share does London’s ground actually get?
   About 27%. On the solstice Earth is about 0.984 of its average distance, so sunlight is about 3% stronger than average, and 26% × 1.03 is just under 27%: the distance adds one point to a share the tilt has cut from 88%.
2. Suppose Earth’s axis kept its 23.44° tilt but swung round each year so that its north end always leaned toward the Sun. What would London get at the December solstice?
   The same as in June: 16.4 h of daylight and 88% of overhead sunlight at noon. The real seasons swap because the axis keeps pointing the same way while Earth moves to the far side of the Sun; an axis that followed the Sun would keep London at its June values all year.

## Why this explainer

The distance theory is the misconception most readers carry, and it is refuted by one fact they can check: Earth is nearest the Sun in early January, in the northern winter. So the explainer opens on the oval orbit and asks for the month before giving it, and only then shows the tilted axis keeping one direction.

The tilt works in two ways at once, and the explainer shows both on the same place: the lit share of its latitude circle (day length) and the height of its noon Sun (how thinly a beam spreads). The spread step sets both solstices' 1 m noon beams on one stretch of level ground, to one scale, so the factor of about 3.4 between them is seen rather than stated.

The place setting is the reader's lever because latitude changes the conclusion, not just the numbers: Tromsø shows polar day and night, Quito shows a circle the terminator always halves, and Sydney shows the opposite season on the same date. The ending puts distance back in its place: it does change sunlight, by about 7% between January and July, but equally in both hemispheres, which is small beside London's swing from about a quarter to nearly nine tenths of overhead sunlight.

The explainer is about daylight and incoming sunlight. Temperature also depends on the air, land and oceans, and the pictures do not calculate it.

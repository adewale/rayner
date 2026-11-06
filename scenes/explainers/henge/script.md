# Why does sunset line up with Manhattan’s streets?

- **Reader:** someone who has heard of Manhattanhenge, or stood on a cross-street at sunset, and believes the Sun sets "in the west"; no astronomy assumed.
- **Answer:** The street stays fixed while Earth’s tilt moves the sunset direction across it and back
- **Changed condition:** the street direction. Turning the street from Manhattan's 299.1° to due west moves the two alignment seasons from late May and July to the March and September equinoxes, lines up sunrise as well as sunset on the same days, and brings half and full Sun less than half a day apart; the observer and the sky stay the same.
- **Reader's own work:** predict whether the low Sun lines up again tomorrow, and how many times the sunset will cross the street in a year; switch the street to due west and see what moves and what does not; the two check questions transfer the crossing to other bearings.
- **Checked against:** 48 horizon-coordinate vectors captured independently with ERFA's `hd2ae` (pyerfa 2.0.1.5) by `oracle/henge.py` into `fixtures/henge-erfa.json`, and USNO's altitude/azimuth formula as a spherical identity, in `model.test.ts`; the same file checks equinoxes, solstice extremes, a sky unchanged by turning the street, and the order of the half- and full-Sun crossings, and `scene.test.ts` checks the 3D pictures against the sky. Dates come from an idealised orbit, not an ephemeris, so no event time is checked against AMNH's.
- **Leaves out:** calendar dates and viewing times (fixed 23.44° tilt, circular orbit, the Sun's centre at a flat geometric horizon); refraction, terrain, observer elevation, local obstructions and the Sun's changing apparent size. The overhead grid is schematic, not Manhattan's real blocks, and the street views enlarge the disc and simplify the buildings.

## Check yourself

1. Another city’s streets point 10° north of west, between Manhattan’s 29° and due west. Are its two alignment seasons nearer the June solstice than Manhattan’s, or farther from it?
   Farther from it. The sunset direction sweeps north from December to June and back; it passes 10° north of west before it reaches 29° on the way north, and after it on the way back, so the two seasons sit nearer the equinoxes.
2. Suppose another street points farther north than the northernmost sunset in this model. How many low-Sun alignments does it get?
   None. The annual curve must cross the street’s direction. Moving the street beyond its northern turning point removes both crossings.

## Why this explainer

The puzzle is that the street points the same way every day, yet the Sun fills it on only a few evenings. "The Sun sets in the west" hides which part of the western horizon, and the explainer replaces it with one picture: a fixed direction, and a sunset direction that sweeps north from December to June and back, crossing the street on the way out and on the way back. Two crossings, two seasons. The due-west setting is the counterfactual that makes the point stick: changing the street changes the direction we wait for, not Earth's motion, so the seasons slide to the equinoxes.

The main path is street, overhead, sky, sweep and crossings, and ends on the street setting's comparison. Three steps are details (`kind: 'detail'`): the tilted Earths, which repeat the point the seasons explainer makes with its own globe, and the camera's descent with the half- and full-Sun discs, which answer a second question (why the calendar names four evenings) once the main one is settled. They keep their pictures, tests and review subjects.

The sky is drawn as one sphere seen in three ways: from outside and west of it (the dome, orthographic), turned by one `Follow` over orbital longitude for the year, and from its centre (gnomonic) for the street, where great circles such as the horizon and the street's vertical circle are straight lines. From outside, north is on the left, as the sky's handedness requires; from the centre the model mirrors north and south so a camera facing west has north on its right. Both the year's turn and the camera's descent are held, frame by frame, to `depthOrder`, and from the centre the street's circle and the horizon are held straight.

Sources (in `meta.sources`): AMNH's event definitions and the May/July order, USNO's coordinate formula, ERFA 2.0.1's horizon conversion, a NOAA seasons explanation, and NASA's due-west/equinox counterfactual.

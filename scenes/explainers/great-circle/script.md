# Why does a flight from London to Los Angeles pass over Greenland?

- **Reader:** anyone who has watched a seat-back flight map and wondered why the plane heads north to reach somewhere south; knows what a globe and a flat map are, no geometry assumed.
- **Answer:** The flat map has bent the shortest route out of shape
- **Changed condition:** the second route. Madrid to New York keeps the great circle shorter, by a smaller margin (170 km against 970), because the cities are closer together and farther from the pole; two cities on the equator, or a route due north, make the ruler's line and the string the same line, with no saving.
- **Reader's own work:** predict which line is shorter, the bent one or the ruler's; choose the second route; the three check questions transfer the idea to the southern hemisphere, the turned globe and the equator.
- **Checked against:** GeographicLib 2.0's geodesic solver (Karney 2013), run by `oracle/great-circle.py` into `fixtures/great-circle-geodesic.json`: the model's distances, initial bearings and highest points match it on the 6,371 km sphere, and its WGS84 results bound the ellipsoid's effect (0.24% and 0.25%); the law of cosines as a second distance formula; and Natural Earth 1:110m land polygons (written to `land.ts` by the same tool) for which landmasses the route crosses. All in `model.test.ts`.
- **Leaves out:** real flight tracks, which leave the great circle for winds, ETOPS reach and closed airspace, and the Earth's flattening; both are named in the last step and not drawn. How navigators combined the two maps (ruling a course on a gnomonic chart and steering a few straight Mercator headings along it). Coastlines are coarse at 1:110m, so the model says which landmass, not where its coast is.

## Check yourself

1. Two cities lie on the same line of latitude in the southern hemisphere, far apart. Does the shortest route between them bend toward the equator or toward the South Pole, and why?
   Toward the South Pole. The sheet through both cities and the Earth’s centre tips toward the nearer pole, so the great circle swings poleward of the line of latitude, which is a smaller circle and so a longer way round.
2. On the turned globe the London–Los Angeles route looked straight from one angle and curved from others. Did the route change?
   No. How bent it looks depends on where you look from. With the eye in the sheet through the route and the Earth’s centre, the whole great circle is seen edge-on, as a straight line through the middle of the globe.
3. Two airports both lie on the equator. Will the shortest route be drawn bent on Mercator’s map?
   No. The equator is itself a great circle, so the shortest route follows it, and Mercator draws the equator as a straight line: the ruler line and the string agree.

## Why this explainer

The seat-back map is a puzzle a reader has already felt: Los Angeles is far south of London, yet the plane goes north. The answer is that the flat map bent the shortest route, and the explainer earns that in three moves: Mercator stretches the north sideways, so a northern shortcut looks like a detour; on a globe a tight string swings north and lies in one sheet through the Earth's centre; and turning the globe until the eye lies in that sheet shows the route as a straight line.

The script is written to need 3D. The aha is a camera move, so the explainer cannot be a sequence of flat maps without losing its point. The turn starts where the globe step left the eye and ends with the eye on the route's midpoint, which lies in the route's plane; it overshoots by 20° so the arc visibly bows the other way before coming back. The gnomonic map closes the argument: the eye at the Earth's centre is the edge-on view for every route at once, at the price of showing less than half the world.

The second route is a setting because it changes the conclusion, not just the numbers: Madrid–New York shrinks the saving, and the equator removes it. Both scenarios share the step id `another`, so switching keeps the reader on that step. The gnomonic step draws London–Los Angeles and Madrid–New York in both scenarios; the equator routes would sit at its rim, where the map stretches most.

The script's figures are on the sphere and rounded: "about twice" for Mercator's stretch at the route's top (sec φ = 2.15, labelled ×2.1), and "due west" from Madrid for the rhumb line to JFK, which heads 270.15° because JFK lies 0.14° north of Madrid. "A fraction of a per cent" for the ellipsoid allows up to 0.6%. Navigators' use of both maps is left out to keep the gnomonic step on its one point. Sources: GeographicLib (Karney 2013), Snyder's "Map Projections: A Working Manual" (USGS PP 1395) for the Mercator and gnomonic formulas, and Natural Earth 1:110m land v5.1.2.

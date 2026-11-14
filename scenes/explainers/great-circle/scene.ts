import { Scene, VMobject, Succession } from '../../../src/index.ts';
import type { Viewpoint } from '../../../explain/geo.ts';
import { depthOrder, seenPictures, latLon, toLatLon } from '../../../explain/geo.ts';
import type { Vec } from '../../../src/index.ts';
import { stage, settingsOf, answerOf, view } from '../../../explain/index.ts';
import type { Stage, ExplainerMeta } from '../../../explain/index.ts';
import { greatCircle, pole, london, madrid, haversine, rhumb, tens, RADIUS_KM } from './model.ts';
import { MERCATOR, TROPICS, mercator, stretched, globe, westward, gnomonic, onEquator, turnWords } from './picture.ts';
import type { MapState, GlobeState, Pair } from './picture.ts';
import { grouped } from '../lib/format.ts';


// ---------------------------------------------------------------- viewpoints: state, turned by a view's tween
const L = london(), M = madrid();
/** The route's midpoint: looking straight at it, the eye lies in the route's plane. */
const middle = greatCircle(L.from, L.to, 2)[1]!;
const EDGE_ON: Viewpoint = { kind: 'orthographic', yaw: middle.lon, pitch: middle.lat };
const HELD: Viewpoint = { ...EDGE_ON, pitch: EDGE_ON.pitch - 38 };
const PAST: Viewpoint = { ...EDGE_ON, pitch: EDGE_ON.pitch + 20 };
const TILTED: Viewpoint = { kind: 'orthographic', yaw: -55, pitch: 18 };
const ATLANTIC: Viewpoint = { kind: 'orthographic', yaw: -38, pitch: 36 };
const GNOMONIC: Viewpoint = { kind: 'gnomonic', yaw: -58, pitch: 50, limit: 51 };

// ---------------------------------------------------------------- checks every frame is held to
/** A great circle seen with the eye in its plane (or on the gnomonic map) must be drawn straight. */
function straight(scene: Scene): true | string | undefined {
  let checked: true | undefined;
  for (const g of scene.mobjects.flatMap((m) => seenPictures(m))) {
    const meta = g.seenPicture;
    for (const piece of g.children) {
      if (!piece.key?.startsWith('route:') || piece.key.endsWith(':hidden') || !(piece instanceof VMobject)) continue;
      const pts = piece.seen.lines.flat();
      if (pts.length < 3) continue;
      const n = pole(toLatLon(pts[0]!), toLatLon(pts.at(-1)!));
      const v = latLon(meta.viewpoint.pitch, meta.viewpoint.yaw);
      const edgeOn = meta.viewpoint.kind === 'gnomonic' || (meta.viewpoint.kind === 'orthographic' && Math.abs(n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) < 1e-6);
      if (!edgeOn) continue;
      const drawn = piece.subpaths.flatMap((a) => Array.from({ length: (a.length - 2) / 6 + 1 }, (_, i) => [a[i * 6]!, a[i * 6 + 1]!] as Vec));
      const a = drawn[0]!, b = drawn.at(-1)!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const q of drawn) {
        const off = Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len;
        if (off > 1e-3) return `${piece.key} is seen edge-on from ${meta.viewpoint.kind} yaw ${meta.viewpoint.yaw}, pitch ${meta.viewpoint.pitch} but drawn ${off.toFixed(3)} off a straight line`;
      }
      checked = true;
    }
  }
  return checked;
}

export default class GreatCircle extends Scene<GlobeState & { turn: { from: number; via: number; to: number } }, {}> {
  static meta = {
    sources: [
      'https://doi.org/10.1007/s00190-012-0578-z',
      'https://pubs.usgs.gov/publication/pp1395',
      'https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_land.geojson',
      'https://pypi.org/project/geographiclib/2.0/',
    ],
    claims: [
      { says: 'the shortest route between two places always runs along one', test: 'model.test.ts: no route between two places is shorter than the great circle' },
      { says: 'Every point on the string lies on one flat sheet', test: 'model.test.ts: the string lies in one plane through the centre' },
      { says: 'Every line of latitude except the equator is a smaller circle', test: 'model.test.ts: lines of latitude are smaller circles' },
      { says: 'Every great circle lies in a plane through the eye', test: 'model.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'every shortest route is drawn straight', test: 'model.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'Only on the equator, or on a route running due north or south', test: 'model.test.ts: the ruler line is the shortest only along the equator or a meridian' },
      { says: 'crosses Hudson Bay and only then turns south', test: 'model.test.ts: the route crosses Great Britain, Ireland, southern Greenland at its highest point, and Hudson Bay' },
      { says: 'stretches every place sideways so that compass directions stay true', test: 'model.test.ts: Mercator stretches north–south as much as east–west, so headings stay true' },
      { says: 'Is there a flat map on which every shortest route is a ruler’s line', test: 'model.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'The route never changes; only where you look from does', shown: true },
      { says: 'The route did not change as the globe turned; only where you stood did', shown: true },
    ],
  } satisfies ExplainerMeta;

  static settings = [{ id: 'second', label: 'Second route', default: 'madrid', options: [
    { value: 'madrid', label: 'Madrid to New York' }, { value: 'equator', label: 'Two cities on the equator' },
  ] }];

  override async construct() {
    const answer = answerOf(this);
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const second = settingsOf(this).second as 'madrid' | 'equator';
    const westKm = rhumb(M.from, M.to).km;
    const pairs: Pair[] = [
      [{ code: 'A', city: 'A', lat: 0, lon: -75 }, { code: 'B', city: 'B', lat: 0, lon: -15 }],
      [{ code: 'C', city: 'C', lat: -25, lon: 10 }, { code: 'D', city: 'D', lat: 25, lon: 10 }],
    ].map(([from, to]) => ({ from: from!, to: to!, km: haversine(from!, to!), rhumbKm: rhumb(from!, to!).km }));
    const before = [
      { id: 'question', title: 'Why does a flight from London to Los Angeles pass over Greenland?', line: 'Predict: which line is shorter, the bent one or the ruler’s?',
        caption: 'Open the seat-back map on a flight from London to Los Angeles. The line it draws leaves Heathrow heading north-west, climbs past the southern tip of Greenland, crosses Hudson Bay and only then turns south toward California. Los Angeles is far to the south of London, yet the plane goes north. Lay a ruler across the same map from Heathrow to LAX and you get a tidy line heading west-south-west across the Atlantic. Which route is shorter?',
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState, s: Stage) => mercator(st, s, false), opening: ['map'],
        // The shorter route by the model's distances: the great circle's against the rhumb line's.
        predict: { options: ['The bent one', 'The ruler’s line'], answer: L.km < L.rhumbKm ? 'The bent one' : 'The ruler’s line' } },
      { id: 'shorter', title: `Answer: the bent line, by ${tens(L.extraKm)} km`, line: 'Red: the plane’s route. Blue dashed: the ruler’s line.',
        caption: `The bent one, by a long way: ${tens(L.km)} kilometres against ${tens(L.rhumbKm)}. The ruler’s line is about ${tens(L.extraKm)} kilometres longer. ${answer}. On the globe the shortest route lies along the circle that a flat plane cuts when it passes through both cities and the centre of the Earth. Look at that circle from inside its plane and it is a straight line.`,
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState, s: Stage) => mercator(st, s, true) },
      { id: 'stretch', title: 'Mercator’s map stretches the north sideways', line: 'Each bar is 1,000 km of the same parallel.',
        caption: `This kind of map, Mercator’s, stretches every place sideways so that compass directions stay true, and the farther from the equator, the more it stretches: about ${L.stretch.from.toFixed(1)} times at London’s latitude, about twice where the route crosses Greenland. The Earth is narrower up there, so a route that goes north takes a shortcut, and the map draws that narrow part widest, so the shortcut looks like a detour. The ruler’s line keeps one compass heading: easy to steer, longer to fly.`,
        state: { viewpoint: MERCATOR, route: L, km: 1000, stretch: L.stretch }, draw: stretched },
      { id: 'globe', title: 'On a globe, a tight string swings north', line: 'The pale sheet passes through both cities and the Earth’s centre.',
        caption: 'Now hold a globe, pin London and Los Angeles, and pull a string tight between them. A tight string takes the shortest path along the surface, and it swings north of both pins. Every point on the string lies on one flat sheet through London, Los Angeles and the centre of the globe. That sheet cuts the largest circle the sphere can hold, a great circle, and the shortest route between two places always runs along one.',
        state: { viewpoint: HELD, route: L }, draw: (st: GlobeState, s: Stage) => globe(st, s), opening: ['globe:seen'] },
    ];
    const after = [
      { id: 'north', title: `The sheet tips north, so the route peaks at ${Math.round(L.top.lat)}° N`, line: 'Grey: the equator, the one line of latitude that is a great circle.',
        caption: `That also explains the northward swing. Both cities lie north of the equator, so the sheet through them and the Earth’s centre tips toward the North Pole, and the great circle rises to its highest point between them: ${Math.round(L.top.lat)} degrees north, over southern Greenland. Lines of latitude are not great circles. Every line of latitude except the equator is a smaller circle, centred on the Earth’s axis rather than its middle, so following one wastes distance.`,
        state: { viewpoint: TILTED, route: L }, draw: (st: GlobeState, s: Stage) => globe(st, s, { sheet: true, top: true, equatorLine: true }) },
      second === 'madrid'
        ? { id: 'another', title: `Madrid to New York: due west is ${tens(westKm - M.km)} km longer`, line: 'Blue: Madrid’s line of latitude, a smaller circle. Red: the great circle.',
          caption: `Madrid and New York lie almost on the same line of latitude. Heading due west from Madrid covers ${tens(westKm)} kilometres; the great circle starts out west-north-west, reaches ${Math.round(M.top.lat)} degrees north and arrives after ${tens(M.km)}. The saving is smaller because the cities are closer together and farther from the pole. Only on the equator, or on a route running due north or south, do the ruler and the string agree: set the second route to the equator to see it.`,
          state: { viewpoint: ATLANTIC, route: M, westKm }, draw: westward }
        : { id: 'another', title: 'On the equator, the ruler and the string agree', line: 'Red and blue dashed: one line here, the string and the ruler’s.',
          caption: `What if both cities sat on the equator? The equator is a great circle, so the shortest route follows it and the ruler’s line is the string: ${tens(pairs[0]!.km)} km either way, no saving at all. A route due north, along a meridian, is the other such case. Only on the equator, or on a route running due north or south, do the two maps draw the same line.`,
          state: { viewpoint: TROPICS, pairs }, draw: onEquator },
      { id: 'gnomonic', title: 'A map seen from the Earth’s centre draws shortest routes straight', line: 'The gnomonic map: the eye at the centre, the paper touching the globe.',
        caption: 'Is there a flat map on which every shortest route is a ruler’s line? Put the eye at the Earth’s centre and project each place onto a flat sheet touching the globe. Every great circle lies in a plane through the eye, and that plane meets the sheet in a straight line. On this map, the gnomonic map, every shortest route is drawn straight: the turned globe’s edge-on view, for every route at once. The price is that it cannot show even half the world.',
        state: { viewpoint: GNOMONIC, routes: [L, M] }, draw: gnomonic, opening: ['gnomonic:seen'] },
      { id: 'limits', title: 'The shortcut over Greenland is the shortest way on a round Earth', line: `${tens(L.km)} km on a sphere of radius ${grouped(RADIUS_KM)} km.`,
        caption: 'The plane flies the great circle because on a round Earth it is the shortest way, and the map draws it bent because a flat map has to stretch a round world. Real flights leave the great circle to ride or avoid the jet stream, to stay within reach of airports and out of closed airspace, and the Earth’s slightly flattened shape changes these distances by a fraction of a per cent. The shortcut over Greenland survives all of them.',
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState, s: Stage) => mercator(st, s, true) },
    ];

    // Held on every frame by rayner check, the turn included: nothing behind the globe is drawn in
    // front of it, and a great circle seen edge-on (or on the gnomonic map) is drawn straight.
    this.addInvariant('nothing behind the globe is drawn in front', (scene) => {
      let held: true | undefined;
      for (const m of scene.mobjects) {
        const r = depthOrder(m);
        if (typeof r === 'string') return r;
        if (r) held = true;
      }
      return held;
    });
    this.addInvariant('a great circle seen edge-on is drawn straight', straight);

    await s.steps(before);

    // The aha: the same globe, turned. The viewpoint is state; the view tweened over its pitch draws
    // the globe afresh at every angle, so a seek lands on the frame a full play shows.
    await this.step('turn', {
      title: 'Turn the globe: seen edge-on, the route is a straight line',
      line: 'The route never changes; only where you look from does.',
      caption: 'So why does the string look curved? Turn the globe slowly. The route’s arc flattens, then bends the other way. At one angle your eye lies in the sheet itself, and the route becomes a straight line through the middle of the globe. The route did not change as the globe turned; only where you stood did. The flat map is one more viewpoint, and one you cannot turn.',
    });
    await s.clear({ runTime: 0.18 });
    // The step's model starts where the last picture was seen from and ends edge-on.
    this.state = { viewpoint: HELD, route: L, turn: { from: HELD.pitch, via: PAST.pitch, to: EDGE_ON.pitch } };
    const picture = view(this, (st) => globe(st, s), { place: false });
    s.opening(picture);
    await s.enter(picture, { runTime: 0.24, describe: () => turnWords(this.state.viewpoint, L) });
    const base = { ...this.state };
    const pitchTo = (from: number, to: number, runTime: number) =>
      picture.tween((t) => ({ ...base, viewpoint: { ...EDGE_ON, pitch: from + (to - from) * t } }), { runTime });
    await this.play(new Succession([pitchTo(HELD.pitch, PAST.pitch, 2.6), pitchTo(PAST.pitch, EDGE_ON.pitch, 1.4)]));

    await s.steps(after);
  }
}

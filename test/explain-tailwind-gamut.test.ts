// The tailwind-gamut explainer's model, held to color.js and to the researcher's counts; and the words a
// radar chart's curves get in a picture description (explain/diagrams.ts, explain/words.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Scene, NullSink, loadFonts } from '../src/index.ts';
import { Diagram, radarData } from '../explain/diagrams.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { wordsFor } from '../explain/words.ts';
import { readSnapshots } from '../tools/lib/explain-project.ts';
import {
  FAMILIES,
  SHADES,
  THEME_LINES,
  cssMap,
  edge,
  inside,
  linearRgb,
  lineOf,
  parseLine,
  rows,
  summarize,
  swatch,
} from '../scenes/explainers/lib/tailwind-gamut.ts';
import type { Family, Shade } from '../scenes/explainers/lib/tailwind-gamut.ts';

// ---------------------------------------------------------------- the palette as vendored
test('the vendored lines are the 300, 500 and 700 shades of the 17 coloured families, at their theme.css lines', () => {
  assert.equal(Object.keys(THEME_LINES).length, 51);
  for (const family of FAMILIES)
    for (const shade of SHADES) {
      const line = lineOf(family, shade);
      const parsed = parseLine(THEME_LINES[line]!);
      assert.equal(parsed.family, family, `line ${line}`);
      assert.equal(parsed.shade, shade, `line ${line}`);
    }
  // theme.css l.15, as the brief quotes it.
  assert.deepEqual(swatch('red', '500'), { family: 'red', shade: '500', line: 15, L: 0.637, C: 0.237, h: 25.331 });
  assert.deepEqual(swatch('lime', '500'), { family: 'lime', shade: '500', line: 63, L: 0.768, C: 0.233, h: 130.85 });
  assert.throws(() => parseLine('  --color-black: #000;'));
});

// ---------------------------------------------------------------- against color.js 0.7.1
// Answers from color.js 0.7.1 (npm colorjs.io@0.7.1), for colours parsed from npm tailwindcss@4.3.3's
// theme.css (identical to the vendored lines): theme.css line, colour, inGamut('srgb'), inGamut('p3') (both
// with color.js's default epsilon, 0.000075), the sRGB and P3 edges (bisection to 1e-9 on
// inGamut(space, { epsilon: 0 })), and toGamut({ space: 'srgb', method: 'css' }) as OKLCH L, C, h. Values
// are rounded to ten significant figures, so edges agree to 1e-8 and mapped colours to 1e-6.
const COLORJS: readonly [number, string, boolean, boolean, number, number, number, number, number][] = [
  [13, 'red-300', false, true, 0.1091225035, 0.1409591865, 0.8051420055, 0.1110825124, 19.49288851],
  [15, 'red-500', true, true, 0.2484136466, 0.2912903316, 0.637, 0.237, 25.331],
  [17, 'red-700', false, true, 0.2061145315, 0.232213499, 0.5095176563, 0.2085704538, 28.47911748],
  [25, 'orange-300', false, true, 0.1210477417, 0.1526600756, 0.8339367629, 0.1259179893, 67.46748822],
  [27, 'orange-500', false, true, 0.1931745159, 0.2194101568, 0.6992873109, 0.202159239, 44.35663508],
  [29, 'orange-700', false, true, 0.179457237, 0.2024639435, 0.5539873011, 0.1922117354, 35.45584822],
  [37, 'amber-300', false, true, 0.1658296501, 0.2023767447, 0.8782586, 0.168869409, 91.90458315],
  [39, 'amber-500', false, true, 0.1665042909, 0.1910362495, 0.770892115, 0.1721002487, 65.63683193],
  [41, 'amber-700', false, true, 0.1488832831, 0.1692429846, 0.5560874878, 0.158091687, 45.33215741],
  [49, 'yellow-300', false, true, 0.1769049373, 0.2109263614, 0.9041291858, 0.1819827356, 98.45569574],
  [51, 'yellow-500', false, true, 0.1627314948, 0.1876632487, 0.7968975028, 0.163872461, 82.96098718],
  [53, 'yellow-700', false, true, 0.1229317822, 0.1408591168, 0.5551309994, 0.1270285151, 62.63832066],
  [61, 'lime-300', true, true, 0.230326592, 0.2691323347, 0.897, 0.196, 126.665],
  [63, 'lime-500', false, true, 0.2093838342, 0.2451067297, 0.7698477662, 0.2149256693, 132.3491435],
  [65, 'lime-700', false, true, 0.1467249673, 0.1718162866, 0.5328080795, 0.1492592949, 132.5592061],
  [73, 'green-300', true, true, 0.2176828347, 0.2636746233, 0.871, 0.15, 154.449],
  [75, 'green-500', false, true, 0.2011379199, 0.2808233285, 0.7281873949, 0.211254903, 147.9102387],
  [77, 'green-700', false, true, 0.1448961459, 0.2021355703, 0.5296863311, 0.1499831118, 148.8618804],
  [85, 'emerald-300', true, true, 0.1777045056, 0.2435550988, 0.845, 0.143, 164.978],
  [87, 'emerald-500', false, true, 0.1515616998, 0.2082030866, 0.7028898305, 0.1583584663, 160.2547191],
  [89, 'emerald-700', false, true, 0.1059480086, 0.1451276671, 0.5127096561, 0.1098362986, 163.6223729],
  [97, 'teal-300', true, true, 0.1540400079, 0.2086596983, 0.855, 0.138, 181.071],
  [99, 'teal-500', false, true, 0.125736095, 0.1701705167, 0.710489502, 0.1275876051, 181.5933577],
  [101, 'teal-700', false, true, 0.08946520463, 0.1208038405, 0.514042561, 0.09014736263, 186.0227766],
  [109, 'cyan-300', true, true, 0.1337362211, 0.1442688331, 0.865, 0.127, 207.078],
  [111, 'cyan-500', false, true, 0.1264538271, 0.1680931784, 0.7223739697, 0.1295413401, 217.6764031],
  [113, 'cyan-700', false, true, 0.09694981016, 0.1282735839, 0.5233825521, 0.09922011655, 225.063113],
  [121, 'sky-300', false, true, 0.1068293387, 0.1160301296, 0.827131064, 0.109273929, 229.043607],
  [123, 'sky-500', false, true, 0.1502979379, 0.1968242889, 0.6913592276, 0.1598688246, 240.5514216],
  [125, 'sky-700', false, true, 0.1203284357, 0.1567641692, 0.5041279505, 0.1285836045, 245.6239041],
  [133, 'blue-300', false, true, 0.09889753163, 0.1077198749, 0.8074012484, 0.1005746922, 250.2818477],
  [135, 'blue-500', false, true, 0.2038096311, 0.2193807783, 0.6187731518, 0.2066879934, 259.2528545],
  [137, 'blue-700', true, true, 0.2889197674, 0.3081081128, 0.488, 0.243, 264.376],
  [145, 'indigo-300', false, true, 0.109129509, 0.1190662142, 0.7833400237, 0.1099781487, 274.4348734],
  [147, 'indigo-500', false, true, 0.2294765068, 0.2467149813, 0.5833999576, 0.2305849201, 277.229627],
  [149, 'indigo-700', true, true, 0.2826948222, 0.2857924765, 0.457, 0.24, 277.023],
  [157, 'violet-300', false, true, 0.1048930362, 0.1150148194, 0.809510211, 0.106316349, 294.1474909],
  [159, 'violet-500', false, true, 0.2362355273, 0.2548122108, 0.6004834711, 0.2423111854, 293.7907428],
  [161, 'violet-700', true, true, 0.2735075504, 0.2815992627, 0.491, 0.27, 292.581],
  [169, 'purple-300', false, true, 0.1100733308, 0.1211843304, 0.8251594799, 0.1135177882, 307.7288108],
  [171, 'purple-500', false, true, 0.2498973617, 0.2704390269, 0.6219115915, 0.2584566871, 305.2387175],
  [173, 'purple-700', false, true, 0.2619670909, 0.273526269, 0.4977822265, 0.2631190924, 301.7778053],
  [181, 'fuchsia-300', false, true, 0.1401752038, 0.1552037653, 0.8322591684, 0.1431373559, 322.0985537],
  [183, 'fuchsia-500', true, true, 0.3069110233, 0.3348214179, 0.667, 0.295, 322.15],
  [185, 'fuchsia-700', false, true, 0.2435274944, 0.2642030958, 0.523116597, 0.2461558608, 323.7738674],
  [193, 'pink-300', true, true, 0.1236094264, 0.1633359808, 0.823, 0.12, 346.018],
  [195, 'pink-500', true, true, 0.2665792014, 0.3031095816, 0.656, 0.241, 354.308],
  [197, 'pink-700', false, true, 0.2112685228, 0.2381147696, 0.532182365, 0.2138146943, 5.063946217],
  [205, 'rose-300', false, true, 0.1098550232, 0.1425230224, 0.8059011437, 0.112887894, 11.20296582],
  [207, 'rose-500', false, true, 0.2437620591, 0.2911442816, 0.6434780409, 0.2453168316, 16.35770193],
  [209, 'rose-700', false, true, 0.2057296317, 0.2320913589, 0.5244177112, 0.2103206115, 18.98191873],
];
test('the model agrees with color.js 0.7.1 on every vendored colour', () => {
  assert.equal(COLORJS.length, 51);
  for (const [line, name, inSrgb, inP3, srgbEdge, p3Edge, mL, mC, mh] of COLORJS) {
    const [family, shade] = name.split('-') as [Family, Shade];
    const { L, C, h } = swatch(family, shade);
    assert.equal(lineOf(family, shade), line, name);
    assert.equal(inside(L, C, h, 'srgb'), inSrgb, `${name} in sRGB`);
    assert.equal(inside(L, C, h, 'p3'), inP3, `${name} in P3`);
    assert.ok(Math.abs(edge(L, h, 'srgb') - srgbEdge) < 1e-8, `${name} sRGB edge ${edge(L, h, 'srgb')} vs ${srgbEdge}`);
    assert.ok(Math.abs(edge(L, h, 'p3') - p3Edge) < 1e-8, `${name} P3 edge`);
    const m = cssMap(L, C, h, 'srgb');
    assert.ok(Math.abs(m.L - mL) < 1e-6 && Math.abs(m.C - mC) < 1e-6 && Math.abs(m.h - mh) < 1e-6, `${name} mapped ${JSON.stringify(m)}`);
  }
});

// ---------------------------------------------------------------- the explainer's claims
test('11, 14 and 14 of the 17 lie outside sRGB at 300, 500 and 700; none lie outside Display P3', () => {
  const s300 = summarize('300'),
    s500 = summarize('500'),
    s700 = summarize('700');
  assert.deepEqual(s300.insideSrgb, ['lime', 'green', 'emerald', 'teal', 'cyan', 'pink']);
  assert.deepEqual(s500.insideSrgb, ['red', 'fuchsia', 'pink']);
  assert.deepEqual(s700.insideSrgb, ['blue', 'indigo', 'violet']);
  assert.deepEqual([s300, s500, s700].map((s) => s.outsideSrgb.length), [11, 14, 14]);
  for (const s of [s300, s500, s700]) assert.deepEqual(s.outsideP3, []);
  // The largest overshoot in chroma: lime-500, 0.024.
  assert.deepEqual(s500.furthest, { family: 'lime', value: 0.024 });
  assert.deepEqual(s500.mostOfSrgb, { family: 'cyan', value: 113.1 });
  assert.deepEqual(s500.nearestP3, { family: 'amber', value: 98.4, spare: 0.003 });
  assert.deepEqual(s500.lost, { family: 'yellow', value: 0.02, from: 0.184, to: 0.164 });
  assert.deepEqual(s500.hueShift, { family: 'amber', value: 4.4 });
});

test('every mapped colour lands on the sRGB edge for its new lightness and hue; colours inside stay put', () => {
  for (const shade of SHADES)
    for (const r of rows(shade)) {
      if (r.outsideSrgb) assert.equal(r.shownOfSrgb, 100, `${r.family}-${shade}`);
      else assert.deepEqual([r.shown, r.hueShift, r.shownOfSrgb], [r.C, 0, r.ofSrgb], `${r.family}-${shade}`);
    }
});

test('the spokes go round the hue circle in order, and every plotted value fits its radar scale', () => {
  for (const shade of SHADES) {
    const all = rows(shade),
      sum = summarize(shade);
    const gaps = all.map((r, i) => (all[(i + 1) % all.length]!.h - r.h + 360) % 360);
    assert.ok(Math.abs(gaps.reduce((a, b) => a + b) - 360) < 1e-9, `${shade}: hues not in order round the circle`);
    assert.ok(sum.hueGap.lo.value < 360 / 17 && sum.hueGap.hi.value > 360 / 17);
    // Chroma scale 0–0.35; percentage scale 50–150 (see the scene).
    for (const r of all) {
      for (const v of [r.C, r.srgb, r.p3]) assert.ok(v > 0 && v <= 0.35, `${r.family}-${shade} ${v}`);
      for (const v of [r.ofSrgb, r.p3OfSrgb, r.shownOfSrgb, r.ofP3, r.srgbOfP3]) assert.ok(v >= 50 && v <= 150, `${r.family}-${shade} ${v}`);
      assert.ok(r.p3OfSrgb > 100, `${r.family}-${shade}: the P3 edge lies beyond the sRGB edge`);
    }
  }
});

// ---------------------------------------------------------------- properties of the colour maths
const colour = fc.record({ L: fc.double({ min: 0.05, max: 0.95, noNaN: true }), h: fc.double({ min: 0, max: 359.999, noNaN: true }) });
test('sRGB lies inside Display P3, and each edge is the boundary of its gamut', () => {
  fc.assert(
    fc.property(colour, ({ L, h }) => {
      const s = edge(L, h, 'srgb'),
        p = edge(L, h, 'p3');
      assert.ok(s <= p + 1e-9, `sRGB edge ${s} beyond P3 edge ${p}`);
      for (const space of ['srgb', 'p3'] as const) {
        const e = edge(L, h, space);
        assert.ok(inside(L, e, h, space));
        assert.ok(!inside(L, e + 1e-6, h, space));
      }
    }),
    params(300),
  );
});
test('CSS gamut mapping returns a colour inside the gamut, never adds chroma, and leaves a colour inside unchanged', () => {
  fc.assert(
    fc.property(colour, fc.double({ min: 0, max: 0.4, noNaN: true }), fc.constantFrom('srgb' as const, 'p3' as const), ({ L, h }, C, space) => {
      const m = cssMap(L, C, h, space);
      assert.ok(linearRgb(m.L, m.C, m.h, space).every((v) => v >= -1e-9 && v <= 1 + 1e-9), JSON.stringify({ L, C, h, m }));
      assert.ok(m.C <= C + 1e-9);
      if (inside(L, C, h, space)) assert.deepEqual(m, { L, C, h });
    }),
    params(300),
  );
});

// ---------------------------------------------------------------- radar words (explain/diagrams.ts)
await loadFonts();
const store = await readSnapshots('scenes/explainers/tailwind-gamut/scene');
const radar = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'radar' && x.spec.source.includes(text));
  assert.ok(s, `no pinned radar with ${text}`);
  return s;
};
async function shown(s: DiagramSnapshot, Kind: import('../src/index.ts').SceneClass = Scene, build: 'all' | 'frame' = 'all') {
  const d = new Diagram(new Kind(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build(build);
  return d;
}
const chroma500 = () => radar('curve tw["Tailwind 500"]{0.237,');

test('a radar chart names each curve by its value on every spoke, counts its spokes and scale, and leaves none blank', async () => {
  const seen = (await shown(chroma500())).describe();
  assert.equal(seen.what, 'Radar chart: 2 curves, 17 axes from 0 to 0.35');
  assert.equal(seen.blank, undefined);
  assert.deepEqual(
    seen.parts.map((p) => p.name.split(', ').slice(0, 2).join(', ')),
    ['sRGB edge: 0.248 at red 25°, 0.193 at orange 48°', 'Tailwind 500: 0.237 at red 25°, 0.213 at orange 48°'],
  );
  assert.equal(seen.parts[1]!.name.split(', ').length, 17);
  assert.ok(seen.parts[1]!.name.endsWith('0.246 at rose 16°'));
});

test('a radar curve brings its dots: revealing the polygon reveals its vertices, which need no words of their own', async () => {
  const d = await shown(chroma500(), Scene, 'frame');
  assert.equal(d.visible.has('dot:srgb:0'), false);
  await d.reveal(['curve:srgb']);
  for (let i = 0; i < 17; i++) assert.ok(d.visible.has(`dot:srgb:${i}`), `dot:srgb:${i}`);
  assert.equal(d.visible.has('dot:tw:0'), false);
  assert.equal(d.describe().blank, undefined);
  assert.equal(d.describe().what, 'Radar chart: 1 curve, 17 axes from 0 to 0.35');
});

test('a French scene says a radar chart in French', async () => {
  class Fr extends Scene {
    static meta = { id: 'fr', title: 'fr', lang: 'fr' };
  }
  const seen = (await shown(chroma500(), Fr)).describe();
  assert.equal(seen.what, 'Graphique en toile : 2 courbes, 17 axes de 0 à 0,35');
  assert.ok(seen.parts[0]!.name.startsWith('sRGB edge : 0,248 pour red 25°, 0,193 pour orange 48°'), seen.parts[0]!.name);
  assert.deepEqual(wordsFor('fr').families.radar, ['Graphique en toile', 'courbe']);
});

test('radarData reads axes, plain and keyed curves, several curves on a line, and the default scale', () => {
  const data = radarData(
    [
      '---',
      'config:',
      '  radar:',
      '    maxWidth: 3',
      '---',
      'radar-beta',
      '  axis a["Speed"], b, c["Cost, total"]',
      '  curve x["Now"]{1, 2.5, 3}, y{c: 4, a: 1}',
      '  curve z{0, 0, 0}',
    ].join('\n'),
  );
  assert.deepEqual(data.axes, [
    { id: 'a', label: 'Speed' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'Cost, total' },
  ]);
  assert.deepEqual(data.curves, [
    { id: 'x', label: 'Now', values: [1, 2.5, 3] },
    { id: 'y', label: 'y', values: [1, NaN, 4] },
    { id: 'z', label: 'z', values: [0, 0, 0] },
  ]);
  assert.equal(data.min, 0);
  assert.equal(data.max, 4);
  assert.deepEqual([radarData('radar-beta\n  axis a, b\n  curve q{1, 2}\n  max 10\n  min 5').min, radarData('radar-beta\n  max 10\n  min 5').max], [5, 10]);
});

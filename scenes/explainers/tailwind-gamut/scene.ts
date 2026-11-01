import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/tailwind-gamut.ts';
import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, REGIONS } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
import { SHADES, THEME_LINES, rows, summarize } from '../lib/tailwind-gamut.ts';
import type { Row, Shade } from '../lib/tailwind-gamut.ts';
type Side = 'above' | 'below' | 'left' | 'right';

// Sources. Every number on screen comes from lib/tailwind-gamut.ts, which cites the lines it uses.
const THEME =
  'https://github.com/tailwindlabs/tailwindcss/blob/c2b24dd15fed1c59dd521bd86082f520c9f5ad0d/packages/tailwindcss/theme.css';
const BLOG =
  'https://github.com/tailwindlabs/tailwindcss.com/blob/7f92c2213315c195dae583d68752da4042da3ade/src/blog/tailwindcss-v4/index.mdx';
const CSS4 = 'https://github.com/w3c/csswg-drafts/blob/e1bd39185acd650512f82e1eeb7b94da21b686c7/css-color-4/';

const STYLE = 'hand-drawn';
type Screen = 'srgb' | 'p3';

// Radar-beta with a ring label on each ring. A 290 px canvas (radius 89 px rather than 120) keeps the
// spoke and ring labels at least 14 px on a 1280 px stage when the chart fills the `main` region; the
// legend is drawn natively in the side column, at the reader's size.
const HEAD = ['---', 'config:', '  radar:', '    tickLabels: true', '    width: 290', '    height: 290', '---'];
interface Curve {
  id: 'srgb' | 'tw' | 'p3';
  label: string;
  values: readonly number[];
}
interface Scale {
  min: number;
  max: number;
  ticks: number;
}
/** Absolute chroma, 0 at the centre, rings 0.05 apart. */
const CHROMA: Scale = { min: 0, max: 0.35, ticks: 7 };
/** Chroma as a percentage of an edge: 50 at the centre, rings 25 apart, so 100 is a ring. */
const SHARE: Scale = { min: 50, max: 150, ticks: 4 };
const radar = (all: readonly Row[], curves: readonly Curve[], scale: Scale) =>
  [
    ...HEAD,
    'radar-beta',
    `  axis ${all.map((r) => `${r.family}["${r.family} ${Math.round(r.h)}°"]`).join(', ')}`,
    ...curves.map((c) => `  curve ${c.id}["${c.label}"]{${c.values.join(', ')}}`),
    `  max ${scale.max}`,
    `  min ${scale.min}`,
    `  ticks ${scale.ticks}`,
    '  graticule polygon',
    '  showLegend false',
  ].join('\n');

// The radar fills `main`; the side column holds a card, a few lines and the key.
const SIDE: Box = [REGIONS.side[0], REGIONS.side[1], REGIONS.side[2], 3.05];
const SIZE = 0.24;
/** Hand-drawn's first three series colours, as a reader would name them. */
const COLOUR_NAME: Record<Curve['id'], string> = { srgb: 'dark grey', tw: 'blue', p3: 'lavender' };

const pct = (v: number) => `${v.toFixed(1)}%`;
const list = (xs: readonly string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export default class TailwindGamutExplainer extends Scene {
  static meta = {
    id: 'tailwind-gamut',
    title: 'Will this Tailwind colour fit the display?',
    sources: [
      THEME + '#L10-L323',
      BLOG + '#L356-L366',
      CSS4 + 'conversions.js',
      CSS4 + 'Overview.bs#L5998-L6230',
      CSS4 + 'Overview.bs#L6383-L6609',
      'https://www.npmjs.com/package/colorjs.io/v/0.7.1',
    ],
  };
  static settings = [
    {
      id: 'shade',
      label: 'Shade',
      default: '500',
      options: SHADES.map((v) => ({ value: v, label: v })),
    },
    {
      id: 'screen',
      label: 'Screen',
      default: 'srgb',
      options: [
        { value: 'srgb', label: 'sRGB' },
        { value: 'p3', label: 'Display P3' },
      ],
    },
  ];

  override async construct() {
    const values = settingsOf(this),
      shade = values.shade as Shade,
      screen = values.screen as Screen;
    const all = rows(shade),
      sum = summarize(shade);
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;
    const n = sum.count,
      out = sum.outsideSrgb.length;
    const tw = `Tailwind ${shade}`;

    /** Lines of text wrapped to the side column, from `top` down. */
    const lines = (texts: readonly string[], top: number, size = SIZE) => {
      const made: Text[] = [];
      let y = top - size * 0.6;
      const width = SIDE[2] - SIDE[0] - 0.1;
      for (const text of texts) {
        let line = '';
        const flush = () => {
          made.push(new Text(line, { fontSize: size, color: ink, anchor: 'start' }).moveTo([SIDE[0], y], [-1, 0]));
          y -= size * 1.4;
          line = '';
        };
        for (const w of text.split(' ')) {
          const next = line ? `${line} ${w}` : w;
          if (line && new Text(next, { fontSize: size }).width() > width) flush();
          line = line ? `${line} ${w}` : w;
        }
        flush();
        y -= size * 0.5;
      }
      return { made, bottom: y };
    };
    /** The key: one swatch per curve shown, in the curve's own colour, at the foot of the side column. */
    const key = (d: Diagram, curves: readonly Curve[]) => {
      const rowsOut: Group[] = [];
      curves.forEach((c, i) => {
        const fill =
          d
            .get(`curve:${c.id}`)
            .family()
            .map((m) => m.style.fill)
            .find((f) => f && f !== 'none') ?? ink;
        const y = SIDE[1] + 0.35 + (curves.length - 1 - i) * 0.42;
        const swatch = new Rectangle({
          width: 0.26,
          height: 0.26,
          fill,
          fillOpacity: 0.6,
          stroke: fill,
          strokeWidth: 0.02,
        }).moveTo([SIDE[0] + 0.13, y]);
        const label = new Text(c.label, { fontSize: SIZE, color: ink, anchor: 'start' }).moveTo(
          [SIDE[0] + 0.4, y],
          [-1, 0],
        );
        rowsOut.push(new Group(swatch, label));
      });
      return {
        mobs: rowsOut,
        describe: `Key: ${curves.map((c) => `${COLOUR_NAME[c.id]}, ${c.label}`).join('; ')}`,
      };
    };
    /** A card at the top of the side column, lines under it, and the key at its foot, entering together. */
    const column = async (
      d: Diagram | null,
      card: readonly (readonly [string, string])[],
      texts: readonly string[],
      curves: readonly Curve[] = [],
    ) => {
      const c = card.length ? await s.card(card, { at: SIDE, align: 'top', fontSize: SIZE, enter: false }) : null;
      if (c) c.shift([SIDE[0] - c.box()![0], 0]);
      const { made } = lines(texts, SIDE[3] - (c ? c.height() + 0.3 : 0));
      if (c || made.length) await s.enter(...(c ? [c] : []), ...made);
      if (d && curves.length) {
        const k = key(d, curves);
        await s.enter(new Group(...k.mobs), { describe: k.describe });
      }
    };

    /**
     * A colour's value, said on its Tailwind dot in a note, whose spoke name is beside it: on the
     * first side, across the spoke first, where the note meets none of the chart's words (spoke
     * names and ring values) or the notes so far; failing that, where it covers least.
     */
    const said: Box[] = [];
    const onDot = async (d: Diagram, family: string, text: string) => {
      const i = all.findIndex((r) => r.family === family);
      const dot = d.get(`dot:tw:${i}`).box()!,
        ring = d.get('ring:0').box()!;
      const dx = (dot[0] + dot[2]) / 2 - (ring[0] + ring[2]) / 2,
        dy = (dot[1] + dot[3]) / 2 - (ring[1] + ring[3]) / 2;
      const across: Side[] =
        Math.abs(dx) > Math.abs(dy)
          ? dy >= 0
            ? ['above', 'below']
            : ['below', 'above']
          : dx >= 0
            ? ['right', 'left']
            : ['left', 'right'];
      const along: Side[] =
        Math.abs(dx) > Math.abs(dy)
          ? dx >= 0
            ? ['left', 'right']
            : ['right', 'left']
          : dy >= 0
            ? ['below', 'above']
            : ['above', 'below'];
      const words = [...d.parts.keys()]
        .filter((id) => id.startsWith('axis-label:') || id.startsWith('tick'))
        .map((id) => d.get(id).box())
        .filter((b): b is Box => !!b);
      const taken = [...words, ...said];
      const size = 0.22,
        w = new Text(text, { fontSize: size }).width() + size * 1.4,
        h = size * 1.85;
      const cx = (dot[0] + dot[2]) / 2,
        cy = (dot[1] + dot[3]) / 2;
      // Where note() puts a note on each side, 0.14 off the dot.
      const boxAt = (side: Side): Box =>
        side === 'right'
          ? [dot[2] + 0.14, cy - h / 2, dot[2] + 0.14 + w, cy + h / 2]
          : side === 'left'
            ? [dot[0] - 0.14 - w, cy - h / 2, dot[0] - 0.14, cy + h / 2]
            : side === 'above'
              ? [cx - w / 2, dot[3] + 0.14, cx + w / 2, dot[3] + 0.14 + h]
              : [cx - w / 2, dot[1] - 0.14 - h, cx + w / 2, dot[1] - 0.14];
      const overlap = (a: Box, b: Box) =>
        Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
        Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const cost = (sd: Side) => taken.reduce((sum, b) => sum + overlap(boxAt(sd), b), 0);
      const sides = [...across, ...along];
      const best = sides.find((sd) => cost(sd) === 0) ?? sides.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      said.push(boxAt(best));
      await d.note(`dot:tw:${i}`, text, { side: best, size });
    };

    // ------------------------------------------------------------------ oklch
    // theme.css l.10–320: 26 families of 11 shades, 286 lines, each oklch(L% C h); only black and white
    // (l.322–323) are hex. The 17 coloured families come first (l.10–212), then nine greys. Blog l.358–360: "We've upgraded the entire default
    // color palette from rgb to oklch, taking advantage of the wider gamut to make the colors more vivid in
    // places where we were previously limited by the sRGB color space."
    await readerFirst(this, s, readerFrames(shade, screen));
    await this.step('oklch', {
      detail: true,
      title: 'Tailwind 4 writes each colour as lightness, chroma and hue',
      line: 'Each line reads oklch(L C h); C, chroma, is distance from grey.',
      caption: `Tailwind CSS 4.3.3’s theme.css writes all 286 palette shades as oklch(L C h): lightness, chroma (how far from grey) and hue angle. The v4.0 announcement says the move from rgb to oklch makes colours more vivid where sRGB had limited them. This page takes the ${shade} shade of the ${n} coloured families. We will compare each shade with the limits of sRGB and Display P3, then show what the selected screen does when a colour lies outside its range.`,
    });
    await s.clear();
    const code = await s.code(
      [`/* theme.css, v4.3.3: the ${shade} shades */`, ...all.map((r) => THEME_LINES[r.line]!.trim())],
      { at: [REGIONS.main[0], REGIONS.main[1], REGIONS.main[2], 3.05], fontSize: 0.19 },
    );
    await column(
      null,
      [
        ['L', 'lightness, 0% to 100%'],
        ['C', 'chroma, 0 is grey'],
        ['h', 'hue angle, degrees'],
      ],
      [`Lines ${all[0]!.line} to ${all.at(-1)!.line} of the file, every twelfth line.`],
    );
    this.state.palette = all.map((r) => [r.family, r.L, r.C, r.h]);

    // ------------------------------------------------------------------ srgb-edge
    const srgbCurve: Curve = { id: 'srgb', label: 'sRGB edge', values: all.map((r) => r.srgb) };
    const twCurve: Curve = { id: 'tw', label: tw, values: all.map((r) => r.C) };
    const gap = sum.hueGap;
    await this.step('srgb-edge', {
      detail: true,
      title: 'An sRGB screen’s edge sits at a different chroma for each colour',
      line: 'The outline is the most chroma sRGB can show on each spoke.',
      caption: `Each spoke is one family, labelled with its hue. The outline marks the most chroma an sRGB screen can show at that colour’s own lightness and hue, found by bisection with CSS Color 4’s sample code. The spokes are evenly spaced; the hues are not: ${gap.lo.from} to ${gap.lo.to} is ${gap.lo.value}°, ${gap.hi.from} to ${gap.hi.to} ${gap.hi.value}°.`,
    });
    await s.clear();
    const d = await s.show({ source: radar(all, [srgbCurve, twCurve], CHROMA) }, { box: 'main', build: 'frame' });
    await d.reveal(['curve:srgb']);
    await column(
      d,
      [],
      [
        'Distance from the centre: chroma, rings 0.05 apart.',
        `Each spoke keeps its own colour’s lightness and hue, so this is not one slice of the colour space.`,
        `The spokes are evenly spaced; the hue angles on them are not.`,
      ],
      [srgbCurve],
    );
    this.state.srgbEdge = all.map((r) => r.srgb);

    // ------------------------------------------------------------------ palette
    await this.step('palette', {
      detail: true,
      title: `${out} of the ${n} ${shade} shades lie outside sRGB`,
      line: `Furthest past the edge: ${sum.furthest.family}-${shade}, by ${sum.furthest.value.toFixed(3)} chroma.`,
      caption: `Tailwind’s own chroma for each colour, drawn over the edge. ${out} of ${n} lie outside sRGB; only ${list(sum.insideSrgb)} fit. At this scale the overshoot is a sliver: the furthest out in chroma, ${sum.furthest.family}-${shade}, is ${sum.furthest.value.toFixed(3)} past the edge.`,
    });
    await s.clearOverlays();
    said.length = 0;
    await d.reveal(['curve:tw']);
    await onDot(d, sum.furthest.family, `+${sum.furthest.value.toFixed(3)}`);
    await column(d, [], [`Inside sRGB: ${list(sum.insideSrgb)}.`], [srgbCurve, twCurve]);
    this.state.outsideSrgb = sum.outsideSrgb;
    this.state.furthest = sum.furthest;

    // ------------------------------------------------------------------ share
    const edge100 = all.map(() => 100);
    const shareCurves: Curve[] = [
      { ...srgbCurve, values: edge100 },
      { ...twCurve, values: all.map((r) => r.ofSrgb) },
    ];
    await this.step('share', {
      detail: true,
      title: `As a share of the edge, ${sum.mostOfSrgb.family}-${shade} reaches ${pct(sum.mostOfSrgb.value)}`,
      line: `The edge is now the 100 ring; ${sum.leastOfSrgb.family} has most room, at ${pct(sum.leastOfSrgb.value)}.`,
      caption: `The same colours, each as a percentage of the sRGB edge on its own spoke. The edge becomes the 100 ring, and every colour past it shows. ${sum.mostOfSrgb.family} goes furthest, to ${pct(sum.mostOfSrgb.value)}; ${sum.leastOfSrgb.family} has the most room, at ${pct(sum.leastOfSrgb.value)}. The centre is now 50%, and the rings are 25 points apart.`,
    });
    await s.clearOverlays();
    said.length = 0;
    await d.morph(
      { source: radar(all, shareCurves, SHARE) },
      {
        ops: [
          { kind: 'set_config', min: SHARE.min, max: SHARE.max, ticks: SHARE.ticks },
          { kind: 'set_curve_values', id: 'srgb', values: [...shareCurves[0]!.values] },
          { kind: 'set_curve_values', id: 'tw', values: [...shareCurves[1]!.values] },
        ],
      },
    );
    await onDot(d, sum.mostOfSrgb.family, pct(sum.mostOfSrgb.value));
    await onDot(d, sum.leastOfSrgb.family, pct(sum.leastOfSrgb.value));
    await column(d, [], ['Ring 100 is the sRGB edge.', 'Rings: 75, 100, 125 and 150% of the edge.'], shareCurves);
    this.state.ofSrgb = all.map((r) => r.ofSrgb);

    // ------------------------------------------------------------------ p3-edge
    const p3Curve: Curve = { id: 'p3', label: 'Display P3 edge', values: all.map((r) => r.p3OfSrgb) };
    const withP3 = [...shareCurves, p3Curve];
    const near = sum.nearestP3;
    await this.step('p3-edge', {
      detail: true,
      title: `None of the ${n} lie outside Display P3`,
      line: `Closest to the P3 edge: ${near.family}-${shade}, at ${pct(near.value)} of it.`,
      caption: `The Display P3 edge on the same scale lies beyond sRGB’s on every spoke, from ${pct(sum.p3OfSrgb.lo.value)} at ${sum.p3OfSrgb.lo.family} to ${pct(sum.p3OfSrgb.hi.value)} at ${sum.p3OfSrgb.hi.family}. All ${n} colours fit inside it. The closest is ${near.family}-${shade}, at ${pct(near.value)} of the P3 edge, ${near.spare.toFixed(3)} chroma short of it.`,
    });
    await s.clearOverlays();
    said.length = 0;
    await d.morph(
      { source: radar(all, withP3, SHARE) },
      { ops: [{ kind: 'add_curve', id: 'p3', label: p3Curve.label, values: [...p3Curve.values] }] },
    );
    await onDot(d, near.family, pct(near.value));
    await column(
      d,
      [],
      [
        `Outside P3: ${sum.outsideP3.length ? `${sum.outsideP3.length} of ${n}` : 'none'}.`,
        `${near.family}-${shade} reaches ${pct(near.value)} of the P3 edge, ${near.spare.toFixed(3)} chroma short of it.`,
      ],
      withP3,
    );
    this.state.outsideP3 = sum.outsideP3;
    this.state.nearestP3 = near;
    this.state.p3OfSrgb = all.map((r) => r.p3OfSrgb);

    // ------------------------------------------------------------------ screen
    if (screen === 'srgb') {
      // Overview.bs l.6014–6022: a colour outside the display's gamut must be converted to one inside;
      // l.6383–6466: the CSS gamut mapping algorithms aim at constant-lightness, constant-hue chroma
      // reduction in OKLCh and leave colours inside the gamut unchanged, and l.6423 lets implementations
      // choose binary search, EdgeSeeker or ray trace; l.6482–6609: the binary search returns the clipped
      // colour once clipping moves the colour tried by less than one JND (0.02, l.6518), so hue and
      // lightness move a little. The numbers here are binary search's, as color.js 0.7.1 also computes them.
      const mapped: Curve = { id: 'tw', label: `${tw} on sRGB`, values: all.map((r) => r.shownOfSrgb) };
      const lost = sum.lost;
      await this.step('srgb-screen', {
        detail: true,
        title: `On an sRGB screen, the ${out} land on its edge`,
        line: `Chroma drops to the edge; ${lost.family}-${shade} loses most, ${lost.from.toFixed(3)} to ${lost.to.toFixed(3)}.`,
        caption: `CSS Color 4 says a colour outside the screen’s gamut must be mapped into it. Its binary search lowers chroma at fixed lightness and hue until clipping changes the colour by under 0.02, then clips; hue moves by up to ${sum.hueShift.value}°. All ${out} land on the edge. ${lost.family}-${shade} loses most chroma: ${lost.from.toFixed(3)} to ${lost.to.toFixed(3)}.`,
      });
      await s.clearOverlays();
      said.length = 0;
      await d.morph(
        { source: radar(all, [shareCurves[0]!, mapped, p3Curve], SHARE) },
        {
          ops: [
            { kind: 'set_curve_values', id: 'tw', values: [...mapped.values] },
            { kind: 'set_curve_label', id: 'tw', label: mapped.label },
          ],
        },
      );
      await onDot(d, lost.family, `−${lost.value.toFixed(3)}`);
      await column(
        d,
        [],
        [
          `${out} of ${n} lowered; hue moves up to ${sum.hueShift.value}°.`,
          `${lost.family}-${shade}: chroma ${lost.from.toFixed(3)} to ${lost.to.toFixed(3)}.`,
          'Each lowered colour is measured against the edge at its new lightness and hue.',
          'CSS Color 4 also allows two other methods, EdgeSeeker and ray trace; these numbers are binary search’s.',
        ],
        [shareCurves[0]!, mapped, p3Curve],
      );
      this.state.shown = all.map((r) => [r.family, r.shown, r.hueShift, r.shownOfSrgb]);
    } else {
      // Overview.bs l.6439–6440: the CSS gamut mapping algorithms "implement a relative colorimetric intent,
      // thus colors inside the destination gamut are unchanged".
      const p3Share: Curve[] = [
        { ...srgbCurve, values: all.map((r) => r.srgbOfP3) },
        { ...twCurve, values: all.map((r) => r.ofP3) },
        { ...p3Curve, values: edge100 },
      ];
      await this.step('p3-screen', {
        detail: true,
        title: `On a Display P3 screen, all ${n} show as written`,
        line: `Ring 100 is now the P3 edge; sRGB’s falls to ${pct(sum.srgbOfP3.lo.value)}–${pct(sum.srgbOfP3.hi.value)} of it.`,
        caption: `Now each spoke is measured against the Display P3 edge, the new 100 ring. CSS Color 4’s gamut mapping leaves a colour inside the screen’s gamut unchanged, so a P3 screen shows all ${n} as written. The sRGB edge falls to ${pct(sum.srgbOfP3.lo.value)}–${pct(sum.srgbOfP3.hi.value)} of P3’s; ${near.family} comes closest, at ${pct(near.value)}.`,
      });
      await s.clearOverlays();
      said.length = 0;
      await d.morph(
        { source: radar(all, p3Share, SHARE) },
        { ops: p3Share.map((c) => ({ kind: 'set_curve_values', id: c.id, values: [...c.values] })) },
      );
      await onDot(d, near.family, pct(near.value));
      if (sum.leastOfP3.family !== near.family) await onDot(d, sum.leastOfP3.family, pct(sum.leastOfP3.value));
      await column(
        d,
        [],
        [
          'Ring 100 is now the Display P3 edge.',
          'Each spoke is now a percentage of the P3 edge at that colour’s lightness and hue.',
        ],
        p3Share,
      );
      this.state.ofP3 = all.map((r) => r.ofP3);
      this.state.srgbOfP3 = all.map((r) => r.srgbOfP3);
    }
  }
}

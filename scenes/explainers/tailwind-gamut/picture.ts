import { Group, Line, Rectangle, Text } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { rows, summarize, cssMap, linearRgb, THEME_LINES } from './model.ts';
import type { Row, Shade, Space } from './model.ts';
import { label } from '../../../explain/drawing.ts';
import type { Diagram, Stage, StagedStepsOptions } from '../../../explain/index.ts';
import { REGIONS, mermaid } from '../../../explain/index.ts';

/** The colour an sRGB screen paints for `written`, as #rrggbb, after CSS Color 4's gamut mapping. */
function painted(L: number, C: number, h: number): string {
  const mapped = cssMap(L, C, h, 'srgb');
  const rgb = linearRgb(mapped.L, mapped.C, mapped.h, 'srgb').map((v) =>
    Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))),
  );
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * The opening: the shade's colour that goes furthest past sRGB, as written and as an sRGB screen paints
 * it. The comparison is the same whichever screen the reader picks; the screen decides the last step.
 */
export function frames(stage: Stage, shade: Shade, screen: Space, opts?: StagedStepsOptions): Promise<void> {
  const all = rows(shade),
    sum = summarize(shade),
    most = all.find((r) => r.family === sum.mostOfSrgb.family)!;
  const preview = painted(most.L, most.C, most.h);
  const written = /oklch\([^)]*\)/.exec(THEME_LINES[most.line]!)![0];
  const name = `${most.family}-${shade}`;
  return stage.steps([
    {
      id: 'reader-display',
      title: `You wrote ${name}; an sRGB screen paints ${preview}`,
      line: 'Left: the colour as written, which sRGB cannot show. Right: what an sRGB screen paints instead.',
      caption: `Tailwind CSS 4 writes ${name} as ${written}: lightness, chroma and hue, where chroma is how far the colour stands from grey. An sRGB screen cannot show chroma ${most.C.toFixed(3)} at that lightness and hue, so this page, drawn in sRGB, has no paint for the colour as written. CSS Color 4’s gamut mapping brings it inside the screen’s range as ${preview}, chroma ${most.shown.toFixed(3)}, with lightness and hue nudged slightly: less vivid than written. Do the other ${shade} shades fit?`,
      // `written` is the chroma as written; `writtenAs`, the theme's oklch() value the picture shows.
      state: { shade, screen, colour: name, written: most.C, writtenAs: written, edge: most.srgb, shown: most.shown, preview },
      draw: (st, s) => {
        const split = st.writtenAs.indexOf(' ');
        const w = 5.2,
          h = 2.1,
          y = 0.75;
        const g = new Group();
        // As written: an empty, hatched swatch, since sRGB has no paint for it.
        const left = -3.7,
          right = 3.7;
        const outline = new Rectangle({ width: w, height: h, fill: 'none', stroke: s.palette.ink, strokeWidth: 0.03 }).moveTo([left, y]);
        outline.style.dashArray = '0.14 0.1';
        g.add(outline);
        for (let x = -w / 2 + 0.35; x < w / 2 + h; x += 0.42) {
          // Hatching inside the empty swatch, clipped to its box by hand.
          const x0 = Math.max(-w / 2, x - h),
            x1 = Math.min(w / 2, x);
          if (x1 - x0 < 0.05) continue;
          g.add(
            new Line([left + x0, y - h / 2 + (x0 - (x - h))], [left + x1, y - h / 2 + (x1 - (x - h))], {
              stroke: s.soft,
              strokeWidth: 0.018,
              strokeOpacity: 0.6,
            }),
          );
        }
        g.add(
          new Rectangle({ width: w, height: h, fill: st.preview, stroke: s.soft, strokeWidth: 0.03 }).moveTo([right, y]),
          label('As written', left, y + h / 2 + 0.5, s.palette.ink, 0.66),
          label('On an sRGB screen', right, y + h / 2 + 0.5, s.palette.ink, 0.66),
          label(st.writtenAs.slice(0, split), left, y - h / 2 - 0.5, s.palette.ink, 0.66),
          label(st.writtenAs.slice(split + 1), left, y - h / 2 - 1.3, s.palette.ink, 0.66),
          label(st.preview, right, y - h / 2 - 0.5, s.palette.ink, 0.66),
          label(`Chroma ${st.written.toFixed(3)}`, left, y - h / 2 - 2.35, s.emphasis, 0.66),
          label(`Chroma ${st.shown.toFixed(3)}`, right, y - h / 2 - 2.35, s.emphasis, 0.66),
        );
        return g;
      },
    },
  ], opts);
}

// ------------------------------------------------------------------ the radar and its side column
// Each spoke uses its own colour's lightness and hue; the equal angles between spokes are a family
// index, not a uniform hue scale. The share view (SHARE) starts at 50%, so its distances are not raw
// chroma. The theme's oklch lines are not listed on the page: the opening shows the chosen colour's line.
// Radar-beta with a ring label on each ring. A 290 px canvas (radius 89 px rather than 120) keeps the
// spoke and ring labels at least 14 px on a 1280 px stage when the chart fills the `main` region; the
// legend is drawn natively in the side column, at the reader's size.
const HEAD = mermaid.frontMatter({ radar: { tickLabels: true, width: 290, height: 290 } });
export interface Curve {
  id: 'srgb' | 'tw' | 'p3';
  label: string;
  values: readonly number[];
}
export interface Scale {
  min: number;
  max: number;
  ticks: number;
}
/** Absolute chroma, 0 at the centre, rings 0.05 apart. */
export const CHROMA: Scale = { min: 0, max: 0.35, ticks: 7 };
/** Chroma as a percentage of an edge: 50 at the centre, rings 25 apart, so 100 is a ring. */
export const SHARE: Scale = { min: 50, max: 150, ticks: 4 };
/** The radar's Mermaid source: one spoke per family, labelled with its hue, and a curve per edge or palette. */
export const radar = (all: readonly Row[], curves: readonly Curve[], scale: Scale) =>
  [
    HEAD,
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
export const SIDE: Box = [REGIONS.side[0], REGIONS.side[1], REGIONS.side[2], 3.05];
export const SIZE = 0.24;
/** Hand-drawn's first three series colours, as a reader would name them. */
const COLOUR_NAME: Record<Curve['id'], string> = { srgb: 'dark grey', tw: 'blue', p3: 'lavender' };

/** Lines of text wrapped to the side column, from `top` down, and where they stop. */
export function sideLines(texts: readonly string[], top: number, ink: string, size = SIZE) {
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
}

/** The key: one swatch per curve shown, in the colour the radar drew that curve, at the foot of the side column. */
export function radarKey(d: Diagram, curves: readonly Curve[], ink: string) {
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
}

import { Group, Line, Rectangle } from '../../../../src/index.ts';
import { rows, summarize, cssMap, linearRgb, THEME_LINES } from '../tailwind-gamut.ts';
import type { Shade, Space } from '../tailwind-gamut.ts';
import { label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

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
export function frames(shade: Shade, screen: Space): ReaderFrame[] {
  const all = rows(shade),
    sum = summarize(shade),
    most = all.find((r) => r.family === sum.mostOfSrgb.family)!;
  const preview = painted(most.L, most.C, most.h);
  const written = /oklch\([^)]*\)/.exec(THEME_LINES[most.line]!)![0];
  const name = `${most.family}-${shade}`;
  return [
    {
      id: 'reader-display',
      title: `You wrote ${name}; an sRGB screen paints ${preview}`,
      line: 'Left: the colour as written, which sRGB cannot show. Right: what an sRGB screen paints instead.',
      caption: `Tailwind CSS 4 writes ${name} as ${written}: lightness, chroma and hue, where chroma is how far the colour stands from grey. An sRGB screen cannot show chroma ${most.C.toFixed(3)} at that lightness and hue, so this page, drawn in sRGB, has no paint for the colour as written. CSS Color 4 says such a colour must be brought inside the screen’s range; its gamut mapping turns ${name} into ${preview}, chroma ${most.shown.toFixed(3)}, with lightness and hue nudged slightly: less vivid than written. Is ${most.family} the only one?`,
      values: { shade, screen, colour: name, written: most.C, edge: most.srgb, shown: most.shown, preview },
      draw: (s) => {
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
          new Rectangle({ width: w, height: h, fill: preview, stroke: s.soft, strokeWidth: 0.03 }).moveTo([right, y]),
          label('As written', left, y + h / 2 + 0.5, s.palette.ink, 0.6),
          label('On an sRGB screen', right, y + h / 2 + 0.5, s.palette.ink, 0.6),
          label(written, left, y - h / 2 - 0.5, s.palette.ink, 0.46),
          label(preview, right, y - h / 2 - 0.5, s.palette.ink, 0.46),
          label(`Chroma ${most.C.toFixed(3)}`, left, y - h / 2 - 1.25, s.emphasis, 0.56),
          label(`Chroma ${most.shown.toFixed(3)}`, right, y - h / 2 - 1.25, s.emphasis, 0.56),
        );
        return g;
      },
    },
  ];
}

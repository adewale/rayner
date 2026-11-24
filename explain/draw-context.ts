import type { Palette } from '../src/color.ts';
import type { TextShaping } from '../src/text-context.ts';
import type { LayoutDirection } from './layout-direction.ts';
import { checkPalette, lookOf } from './look.ts';
import type { Look } from './look.ts';

/** Everything a picture needs from its stage, captured at the time it is drawn. */
export interface DrawContext {
  readonly palette: Readonly<Palette>;
  readonly look: Look;
  readonly direction: LayoutDirection;
  readonly lang: string;
  /** null selects the embedded faces even when another scene supplies ambient lettering. */
  readonly shaping: Readonly<Omit<TextShaping, 'prepare'>> | null;
}

/** Build the same detached drawing input a stage supplies, for a picture drawn on its own. */
export function drawContext({ palette, direction = 'ltr', lang = 'en', shaping }: {
  palette: Palette; direction?: LayoutDirection; lang?: string; shaping?: TextShaping | null;
}): DrawContext {
  checkPalette('drawContext()', palette);
  if (direction !== 'ltr' && direction !== 'rtl') throw new RangeError('drawContext(): direction must be ltr or rtl');
  if (typeof lang !== 'string' || !lang.trim()) throw new TypeError('drawContext(): lang must be a nonempty language tag');
  const { paper, ink, accent, muted } = palette;
  const colors = Object.freeze({ paper, ink, accent, muted });
  const service = shaping ? Object.freeze({
    shape: shaping.shape.bind(shaping),
    ...(shaping.realBold && { realBold: shaping.realBold.bind(shaping) }),
    ...(shaping.spanBox && { spanBox: shaping.spanBox.bind(shaping) }),
    ...(shaping.clusterKey && { clusterKey: shaping.clusterKey.bind(shaping) }),
  }) : null;
  return Object.freeze({ palette: colors, look: lookOf(colors), direction, lang, shaping: service });
}

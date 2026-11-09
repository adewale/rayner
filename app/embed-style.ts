import type { ExplainerClass, Palette } from '../explain/index.ts';
import { contrastRatio, isHex } from '../src/internal.ts';

type Cues = NonNullable<NonNullable<ExplainerClass['meta']>['player']>;
const themes = {
  light: {
    bg: '#f7f7f7',
    surface: '#fff',
    fg: '#202020',
    muted: '#595959',
    accent: '#202020',
    'accent-fg': '#fff',
  },
  dark: {
    bg: '#141414',
    surface: '#202020',
    fg: '#f0f0f0',
    muted: '#b0b0b0',
    accent: '#f0f0f0',
    'accent-fg': '#141414',
  },
};
// Opaque hex only: alpha and CSS syntax must never enter the hashed stylesheet.
const color = (s: unknown): s is string => isHex(s);
const contrast = contrastRatio;
/** Complete, resettable properties: a scenario without a valid cue clears the preceding scenario's cue. */
export function playerProperties(
  cues: Cues = {},
  palette?: Palette,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [theme, neutral] of Object.entries(themes)) {
    const t = { ...neutral };
    if (
      cues.paper &&
      color(palette?.paper) &&
      contrast(t.fg, palette.paper) >= 7 &&
      contrast(t.muted, palette.paper) >= 4.5 &&
      contrast(t.accent, palette.paper) >= 3
    ) {
      t.bg = t.surface = palette.paper;
    }
    if (cues.accent && color(palette?.accent)) {
      const a = palette.accent;
      const foreground =
        contrast('#fff', a) >= contrast('#141414', a) ? '#fff' : '#141414';
      // The accent is also small link/step text, so require text contrast, beyond the 3:1 marker minimum.
      if (
        contrast(a, t.surface) >= 4.5 &&
        contrast(a, t.bg) >= 4.5 &&
        contrast(a, foreground) >= 4.5
      ) {
        t.accent = a;
        t['accent-fg'] = foreground;
      }
    }
    for (const role of ['bg', 'surface', 'accent', 'accent-fg'] as const)
      out[`--player-${theme}-${role}`] =
        t[role] === neutral[role] ? 'initial' : t[role];
  }
  out['--player-tile-radius'] = cues.corners === 'square' ? '0px' : 'initial';
  out['--player-control-radius'] =
    cues.corners === 'square' ? '0px' : 'initial';
  return out;
}
export function playerCss(cues?: Cues, palette?: Palette): string {
  const colors = `:root{${Object.entries(playerProperties(cues, palette))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}\n`;
  const width = cues?.minStageWidth;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return colors;
  const floor = Math.min(width, 4096);
  // A wide page can hold the stage, a 300px rail and its 16px side paddings.
  const page = Math.max(1240, Math.ceil(floor + 332));
  return colors + `:root:not([data-framed]) #content{--player-floor:${floor}px;max-width:${page}px}\n` +
    `:root:not([data-framed]) .layout:not(:has(>aside.rail)){width:min(100%,var(--player-cap));grid-template-columns:none}\n` +
    // Reparenting a long rail must not toggle the page scrollbar and oscillate its fit.
    `@media(min-width:1100px){:root:not([data-framed]){scrollbar-gutter:stable}}\n`;
}

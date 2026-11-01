// specs/player-tile.md T5: the tile's chrome is tinted toward the case's paper, by one mix for every
// palette. The mix must keep the page's text, its secondary text and its accent readable on the tinted
// chrome in both themes, for all thirteen palettes: 7:1, 4.5:1 and 3:1 (WCAG 1.4.3, 1.4.6, 1.4.11).
// The colours and the oracle here are independent of explain/look.ts; the tint is read from embed.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PALETTES } from '../explain/palettes.ts';

const css = await readFile(new URL('../app/embed.css', import.meta.url), 'utf8');
/** The page's tokens, as embed.css declares them for each theme. */
const THEMES = {
  light: { surface: '#fff', fg: '#202020', muted: '#595959', accent: '#202020' },
  dark: { surface: '#202020', fg: '#f0f0f0', muted: '#b0b0b0', accent: '#f0f0f0' },
} as const;
const MINIMUM = { fg: 7, muted: 4.5, accent: 3 } as const;

const rgb = (hex: string): number[] => {
  const h = hex.slice(1),
    full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  assert.match(full, /^[0-9a-f]{6}$/i, hex);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
/** WCAG relative luminance and contrast ratio. */
const luminance = (c: number[]) => {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** color-mix(in srgb, paper t, surface): interpolation of the gamma-encoded channels. */
const tile = (paper: string, surface: string, t: number) => rgb(paper).map((p, i) => p * t + rgb(surface)[i]! * (1 - t));

test('embed.css declares the page tokens this gate checks, and one --tint on .tile', () => {
  const tint = [...css.matchAll(/--tint:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(tint.length, 1, 'one --tint');
  assert.match(css, /\.tile\{--tint:[\d.]+%;--tile:color-mix\(in srgb,var\(--paper,var\(--surface\)\) var\(--tint\),var\(--surface\)\)/);
  // The light tokens on :root, the dark ones on [data-theme=dark] and under prefers-color-scheme: dark.
  const root = css.match(/:root\{[^}]*\}/)![0];
  for (const [k, v] of Object.entries(THEMES.light).filter(([k]) => k !== 'surface')) assert.ok(root.includes(`--${k}:${v}`) || root.includes(`--${k}:var(--player-light-${k},${v})`), `light --${k}`);
  assert.ok(root.includes('--surface:var(--player-light-surface,#fff)'), 'light --surface');
  for (const rule of [css.match(/:root\[data-theme=dark\]\{[^}]*\}/)![0], css.match(/@media\(prefers-color-scheme:dark\)\{[^\n]*/)![0]])
    for (const [k, v] of Object.entries(THEMES.dark)) assert.ok(rule.includes(`--${k}:${v}`) || rule.includes(`--${k}:var(--player-dark-${k},${v})`), `dark --${k} in ${rule.slice(0, 40)}`);
});

test('the tint keeps text 7:1, secondary text 4.5:1 and the accent 3:1 on the tinted chrome, for every palette in both themes', () => {
  const t = Number(css.match(/--tint:\s*([\d.]+)%/)![1]) / 100;
  assert.ok(t > 0 && t <= 0.1, `--tint is ${t * 100}%, at most the 10% start`);
  const palettes = Object.entries(PALETTES);
  assert.equal(palettes.length, 13, 'thirteen palettes');
  let checked = 0,
    weakest = { margin: Infinity, pair: '' };
  for (const [name, p] of palettes)
    for (const [theme, tokens] of Object.entries(THEMES)) {
      const behind = tile(p.paper, tokens.surface, t);
      for (const [role, min] of Object.entries(MINIMUM) as [keyof typeof MINIMUM, number][]) {
        const ratio = contrast(rgb(tokens[role]), behind);
        assert.ok(ratio >= min, `${name}, ${theme} theme: --${role} on the tile is ${ratio.toFixed(2)}:1, under ${min}:1`);
        if (ratio / min < weakest.margin) weakest = { margin: ratio / min, pair: `${name} ${theme} --${role} ${ratio.toFixed(2)}:1` };
        checked++;
      }
    }
  assert.equal(checked, 13 * 2 * 3);
  // The oracle rejects a tint too strong for the weakest palette: at 40% the gate must fail somewhere.
  const fails = palettes.some(([, p]) =>
    Object.values(THEMES).some((tokens) => (Object.entries(MINIMUM) as [keyof typeof MINIMUM, number][]).some(([role, min]) => contrast(rgb(tokens[role]), tile(p.paper, tokens.surface, 0.4)) < min)),
  );
  assert.ok(fails, `a 40% tint would fail; the weakest pair at ${t * 100}% is ${weakest.pair}`);
});

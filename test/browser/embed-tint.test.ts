// Exercise the shipped CSS in Chromium; whitespace, rule order and equivalent color syntax
// are free to change. WCAG calculations below remain independent of the player implementation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PALETTES} from '../../explain/palettes.ts';
import {launch} from '../../tools/lib/browser.ts';

const css = await readFile(new URL('../../app/embed.css', import.meta.url), 'utf8');
const MINIMUM = {fg: 7, muted: 4.5, accent: 3} as const;
/** WCAG relative luminance and contrast ratio. */
const luminance = (c: number[]) => {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('rendered tile text meets contrast requirements for every palette and explicit/system theme',
  {skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for computed CSS checks'}, async () => {
    const browser = await launch();
    try {
      let checked = 0;
      for (const theme of ['light', 'dark'] as const) {
        const page = await browser.newPage({colorScheme: theme});
        try {
          await page.setContent(`<style>${css}</style><section class="tile"><p>Primary</p><p class="live-lede">Secondary</p><a href="#">Accent</a></section>`);
          for (const explicit of [false, true]) {
            await page.evaluate(({theme, explicit}) => {
              if (explicit) document.documentElement.dataset.theme = theme;
              else delete document.documentElement.dataset.theme;
            }, {theme, explicit});
            for (const [name, palette] of Object.entries(PALETTES)) {
              const colors = await page.evaluate(paper => {
                const tile = document.querySelector<HTMLElement>('.tile')!;
                tile.style.setProperty('--paper', paper);
                // Avoid observing an in-progress transition while varying palettes.
                tile.style.transition = 'none';
                const rgba = (value: string) => {
                  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
                  const ctx = canvas.getContext('2d')!; ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
                  return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
                };
                return {background: rgba(getComputedStyle(tile).backgroundColor),
                  fg: rgba(getComputedStyle(tile.querySelector('p')!).color),
                  muted: rgba(getComputedStyle(tile.querySelector('.live-lede')!).color),
                  accent: rgba(getComputedStyle(tile.querySelector('a')!).color)};
              }, palette.paper);
              for (const [role, minimum] of Object.entries(MINIMUM) as [keyof typeof MINIMUM, number][]) {
                const ratio = contrast(colors[role], colors.background);
                assert.ok(ratio >= minimum, `${name}/${theme}/${explicit ? 'explicit' : 'system'} ${role}: ${ratio.toFixed(2)}:1 < ${minimum}:1`);
                checked++;
              }
            }
          }
        } finally { await page.close(); }
      }
      assert.equal(checked, Object.keys(PALETTES).length * 2 * 2 * 3);
    } finally { await browser.close(); }
  });

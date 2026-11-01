import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { playerProperties } from '../../app/embed-style.ts';
import { PALETTES } from '../../explain/palettes.ts';
import { collectProject, ROOT } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';

test('palette cues validate all thirteen palettes in both themes and reject unsafe colours', () => {
  // Independent WCAG oracle over effective tokens, not the production gate.
  const rgb = (s: string) => {
    const h = s.slice(1);
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return [0, 2, 4]
      .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  };
  const lum = (s: string) => {
    const c = rgb(s);
    return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
  };
  const ratio = (a: string, b: string) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  let count = 0;
  for (const p of Object.values(PALETTES))
    for (const theme of ['light', 'dark']) {
      const props = playerProperties({ paper: true, accent: true }, p);
      const fallback =
        theme === 'light'
          ? {
              surface: '#fff',
              bg: '#f7f7f7',
              fg: '#202020',
              muted: '#595959',
              accent: '#202020',
              'accent-fg': '#fff',
            }
          : {
              surface: '#202020',
              bg: '#141414',
              fg: '#f0f0f0',
              muted: '#b0b0b0',
              accent: '#f0f0f0',
              'accent-fg': '#141414',
            };
      const value = (role: 'surface' | 'bg' | 'accent' | 'accent-fg') =>
        props[`--player-${theme}-${role}`] === 'initial'
          ? fallback[role]
          : props[`--player-${theme}-${role}`]!;
      assert.ok(ratio(fallback.fg, value('surface')) >= 7);
      assert.ok(ratio(fallback.muted, value('surface')) >= 4.5);
      assert.ok(ratio(value('accent'), value('surface')) >= 4.5);
      assert.ok(ratio(value('accent'), value('bg')) >= 4.5);
      assert.ok(ratio(value('accent'), value('accent-fg')) >= 4.5);
      count++;
    }
  assert.equal(count, 26);
  for (const bad of ['#777', '#fff0', 'red', '#fff;}body{display:none']) {
    const props = playerProperties(
      { accent: true, paper: true },
      { ...PALETTES.nord!, accent: bad, paper: bad },
    );
    for (const theme of ['light', 'dark'])
      assert.equal(props[`--player-${theme}-accent`], 'initial');
  }
});

test(
  'served player isolates cues, changes them by case and keeps forced-colour markers after blur',
  {
    skip: process.env.EXPLAIN_BROWSER
      ? false
      : 'set EXPLAIN_BROWSER=1 for served browser checks',
  },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-style-'));
    const source = (
      cues: boolean,
    ) => `import {Scene,Text} from '${ROOT}/src/index.ts';
import {stage,settingsOf} from '${ROOT}/explain/index.ts';
export default class Demo extends Scene {
static meta={title:'Arc<T>',${cues ? "player:{accent:true,paper:true,corners:'square',minStageWidth:880}," : ''}};
static settings=[{id:'mode',label:'isdigit()',default:'a',options:[{value:'a',label:'-m'},{value:'b',label:'-M'}]}];
async construct(){stage(this,{palette:settingsOf(this).mode==='a' ? {paper:'#fff7ed',ink:'#202020',muted:'#595959',accent:'#9a3412'} : {paper:'#888888',ink:'#202020',muted:'#595959',accent:'#777777'}});this.add(new Text('Hello'));for(const name of ['first','middle','last']){await this.step(name,{title:name,caption:'Hello'});await this.wait(.1)}}}`;
    let server: Awaited<ReturnType<typeof serve>> | undefined;
    let browser: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      for (const [name, cues] of [
        ['cued', true],
        ['neutral', false],
      ] as const) {
        const file = join(folder, name + '.ts');
        await writeFile(file, source(cues));
        const project = await collectProject(file, { write: false });
        await buildExplainer(project, join(folder, name + '.html'));
      }
      const html = await readFile(join(folder, 'cued.html'), 'utf8');
      assert.ok(html.includes('--player-light-accent:#9a3412'));
      assert.ok(
        !(await readFile(join(folder, 'neutral.html'), 'utf8')).includes(
          '--player-light-accent:#9a3412',
        ),
      );
      server = await serve(folder, 0, 'cued.html');
      browser = await launch();
      for (const theme of ['light', 'dark'] as const)
        for (const name of ['cued', 'neutral'] as const) {
          const page = await browser.newPage({
            colorScheme: theme,
            viewport: { width: 1280, height: 800 },
            reducedMotion: 'reduce',
          });
          await page.goto(
            `${server.url}/${name}.html?step=middle&theme=${theme}`,
          );
          await page.waitForSelector('[data-ready=true]');
          assert.equal(
            await page
              .locator('.tile')
              .evaluate((e) => getComputedStyle(e).borderRadius),
            name === 'cued' ? '0px' : '12px',
          );
          assert.equal(
            await page
              .locator('body')
              .evaluate((e) => getComputedStyle(e).backgroundColor),
            theme === 'light'
              ? name === 'cued'
                ? 'rgb(255, 247, 237)'
                : 'rgb(247, 247, 247)'
              : 'rgb(20, 20, 20)',
          );
          assert.equal(
            await page
              .locator('.primary')
              .evaluate((e) => getComputedStyle(e).backgroundColor),
            theme === 'light'
              ? name === 'cued'
                ? 'rgb(154, 52, 18)'
                : 'rgb(32, 32, 32)'
              : 'rgb(240, 240, 240)',
          );
          assert.equal(
            await page
              .locator('.stage')
              .evaluate((e) => getComputedStyle(e).minWidth),
            name === 'cued' ? '880px' : '0px',
          );
          assert.equal(
            await page.locator('.case legend').textContent(),
            'isdigit()',
          );
          assert.equal(
            await page
              .locator('.case legend')
              .evaluate((e) => getComputedStyle(e).textTransform),
            'none',
          );
          const flow = () => page.evaluate(() =>
            ['.tile', '.head', '.frame', '.stage', '.stepper', '.words', '.rail', '.step-bar', '.segments']
              .map(selector => [selector, document.querySelector(selector)!.getBoundingClientRect().toJSON()]));
          const normalFlow = await flow();
          await page.emulateMedia({ forcedColors: 'active' });
          assert.deepEqual(await flow(), normalFlow, 'forced-colour markers preserve layout and control positions');
          for (const mode of ['a', 'b']) {
            await page.locator(`input[value=${mode}]`).check();
            await page.waitForFunction(
              () => !document.querySelector('#content.loading'),
            );
            await page.locator('.step-bar button').nth(1).click();
            await page.locator('.stage').evaluate((e) => {
              (e as HTMLElement).tabIndex = -1;
              (e as HTMLElement).focus();
            });
            const markers = await page.evaluate(() => {
              const style = (s: string, p?: string) =>
                getComputedStyle(document.querySelector(s)!, p);
              const chosen = style('.segments label:has(input:checked)'),
                other = style('.segments label:has(input:not(:checked))');
              const current = style('.steps [aria-current=step]');
              const badge = style('.steps [aria-current=step]', '::before');
              const bar = (state: string) => {
                const s = style(`.step-bar [data-state=${state}]`, '::before');
                return {
                  bg: s.backgroundColor,
                  border: s.borderTopWidth,
                  color: s.borderTopColor,
                  height: s.height,
                };
              };
              return {
                selected: chosen.backgroundColor !== other.backgroundColor,
                outline: chosen.outlineWidth,
                current: current.outlineWidth,
                badge: badge.backgroundColor !== badge.color,
                done: bar('done'),
                now: bar('current'),
                later: bar('todo'),
              };
            });
            assert.ok(markers.selected);
            assert.equal(markers.outline, '2px');
            assert.equal(markers.current, '2px');
            assert.ok(markers.badge);
            assert.equal(markers.done.border, '1px');
            assert.equal(markers.later.border, '1px');
            assert.notEqual(markers.done.bg, markers.later.bg);
            assert.equal(markers.now.border, '3px');
          }
          // Poison the actual served CSSOM under CSP, then restore the rule before continuing.
          const poison = await page.evaluate(() => {
            const sheet = document.styleSheets[0]!;
            const index = [...sheet.cssRules].findIndex(
              (rule) =>
                rule instanceof CSSMediaRule &&
                rule.conditionText.includes('forced-colors'),
            );
            if (index < 0) throw new Error('missing forced-colours rule');
            const rule = sheet.cssRules[index]!.cssText;
            sheet.deleteRule(index);
            const marked =
              getComputedStyle(
                document.querySelector('.segments label:has(input:checked)')!,
              ).outlineWidth === '2px';
            sheet.insertRule(rule, index);
            return marked;
          });
          assert.throws(
            () => assert.ok(poison),
            assert.AssertionError,
            'the selected-case assertion rejects the missing rule',
          );
          await page.emulateMedia({ forcedColors: 'none' });
          assert.equal(
            await page.evaluate(() =>
              document.documentElement.style
                .getPropertyValue(
                  `--player-${document.documentElement.dataset.theme}-accent`,
                )
                .trim(),
            ),
            'initial',
          );
          await page.goto(`${server.url}/neutral.html?theme=${theme}`);
          await page.waitForSelector('[data-ready=true]');
          assert.equal(
            await page
              .locator('.tile')
              .evaluate((e) => getComputedStyle(e).borderRadius),
            '12px',
          );
          await page.close();
        }
    } finally {
      await browser?.close();
      server?.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);

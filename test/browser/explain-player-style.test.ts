import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright-core';
import { playerProperties } from '../../app/embed-style.ts';
import { PALETTES } from '../../explain/palettes.ts';
import { collectProject, ROOT } from '../../tools/lib/explain-project.ts';
import { buildExplainer, buildLoader } from '../../tools/lib/explain-build.ts';
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
  'served player isolates cues, preserves width floors and focus, and keeps forced-colour markers',
  {
    skip: process.env.EXPLAIN_BROWSER
      ? false
      : 'set EXPLAIN_BROWSER=1 for served browser checks',
  },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-style-'));
    const source = (
      cues: boolean,
      long = false,
    ) => `import {Scene,Text} from '${ROOT}/src/index.ts';
import {stage,settingsOf} from '${ROOT}/explain/index.ts';
export default class Demo extends Scene {
static meta={title:'Arc<T>',${cues ? "player:{accent:true,paper:true,corners:'square',minStageWidth:880}," : ''}};
static settings=[{id:'mode',label:'isdigit()',default:'a',options:[{value:'a',label:'-m'},{value:'b',label:'-M'}]}];
async construct(){stage(this,{palette:settingsOf(this).mode==='a' ? {paper:'#fff7ed',ink:'#202020',muted:'#595959',accent:'#9a3412'} : {paper:'#888888',ink:'#202020',muted:'#595959',accent:'#777777'}});this.add(new Text('Hello'));for(const name of ${long ? "Array.from({length:40},(_,i)=>'s'+i)" : "['first','middle','last','note']"}){await this.step(name,{title:name,caption:'Hello',detail:name==='note'});await this.wait(.1)}}}`;
    let server: Awaited<ReturnType<typeof serve>> | undefined;
    let browser: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      for (const [name, cues] of [
        ['cued', true],
        ['neutral', false],
        ['long', true],
      ] as const) {
        const file = join(folder, name + '.ts');
        await writeFile(file, source(cues, name === 'long'));
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
      const geometry = (root: HTMLElement) => {
        const stage = root.querySelector('.stage')!.getBoundingClientRect();
        const style = getComputedStyle(root);
        return {
          width: stage.width, height: stage.height,
          content: root.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          viewportHeight: innerHeight,
          next: root.querySelector('.primary')!.getBoundingClientRect().bottom,
          side: root.querySelectorAll('aside.rail').length,
          under: root.querySelectorAll('details.rail').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      };
      const settle = async () => {
        for (let n = 0; n < 4; n++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      };
      for (const name of ['cued', 'neutral']) {
        const page: Page = await browser.newPage({reducedMotion:'reduce'});
        try {
          await page.goto(`${server.url}/${name}.html?step=middle`);
          await page.waitForSelector('[data-ready=true]');
          // Resize the same reader through both rail breakpoints, not just fresh loads.
          for (const viewport of [390,1100,1211,1212,1226,1227,1280,1600,1100].map(width=>({width,height:400}))) {
            await page.setViewportSize(viewport);
            await page.evaluate(settle);
            const seen = await page.locator('#content').evaluate(geometry);
            const side = viewport.width >= 1100 && (name === 'neutral' || seen.content >= 1180);
            assert.equal(seen.side,Number(side),`${name}/${viewport.width}: side rail`);
            assert.equal(seen.under,Number(!side),`${name}/${viewport.width}: steps disclosure`);
            assert.equal(seen.overflow,false,`${name}/${viewport.width}: no horizontal page scroll`);
            if (name === 'cued') {
              assert.ok(seen.width >= Math.min(880,seen.content)-1,`${viewport.width}: width floor`);
              if (viewport.width >= 1100) assert.ok(seen.next > viewport.height,'the width floor can put Next below a short window');
            } else assert.ok(Math.abs(seen.width-320)<1,'unconfigured pages retain the 20rem short-window floor');
          }
          await page.setViewportSize({width:1280,height:720});
          await page.evaluate(settle);
          await page.getByRole('button',{name:/Enlarge/}).click();
          await page.waitForFunction(()=>!!document.fullscreenElement);
          await page.evaluate(settle);
          const full = await page.locator('#content').evaluate(geometry);
          assert.ok(Math.abs(full.width-(name === 'cued' ? 880 : (full.viewportHeight-300)*16/9))<1,
            `${name}: fullscreen retains the opt-in floor and the neutral height cap`);
          await page.evaluate(()=>document.exitFullscreen());
          await page.waitForFunction(()=>!document.fullscreenElement);
        } finally { await page.close(); }
      }
      await buildLoader(join(folder,'loader.js'));
      for (const loader of [false,true]) {
        const host = `<!doctype html><style>body{margin:0}</style>` + ['cued','neutral'].map(name=>
          `<div id="${name}">${loader ?
            `<script src="/loader.js" data-src="/${name}.html?step=middle" data-target="${name}" data-title="${name}"></script>` :
            `<iframe title="${name}" allowfullscreen src="/${name}.html?step=middle" style="width:100%;height:720px;border:0;display:block"></iframe>`}</div>`).join('');
        await writeFile(join(folder,'host.html'),host);
        for (const width of [390,1280]) {
          const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
          try {
            await page.goto(`${server.url}/host.html`);
            const seen = [];
            for (const name of ['cued','neutral']) {
              const frame = page.frameLocator(`#${name} iframe`);
              await frame.locator('[data-ready=true]').waitFor();
              await frame.locator('#content').evaluate(settle);
              seen.push(await frame.locator('#content').evaluate(geometry));
            }
            assert.deepEqual(seen[0],seen[1],`${loader?'loader':'raw frame'}/${width}: opted-in sizing must not affect a frame`);
            assert.equal(seen[0]!.overflow,false);
            const heights = await page.locator('iframe').evaluateAll(frames=>frames.map(f=>f.getBoundingClientRect().height));
            assert.equal(heights[0],heights[1],'the loader reports the same height with or without the setting');
            if (!loader && width === 1280) {
              await page.setViewportSize({width,height:600});
              const frame = page.frameLocator('#cued iframe');
              await frame.getByRole('button',{name:/Enlarge/}).click();
              await page.waitForFunction(()=>!!document.fullscreenElement);
              await frame.locator('#content').evaluate(settle);
              const full = await frame.locator('#content').evaluate(geometry);
              assert.ok(full.viewportHeight<795,'framed fullscreen must exercise a cap below the opt-in floor');
              assert.ok(Math.abs(full.width-(full.viewportHeight-300)*16/9)<1,'a framed fullscreen keeps host-driven sizing');
              await page.evaluate(()=>document.exitFullscreen());
              await page.waitForFunction(()=>!document.fullscreenElement);
            }
          } finally { await page.close(); }
        }
      }
      // Playwright normally hides scrollbars. Use the native classic gutter for the fit boundary.
      await browser.close();
      browser = await chromium.launch({
        executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,
        ignoreDefaultArgs:['--hide-scrollbars'],
        args:['--disable-features=OverlayScrollbar'],
      });
      const page: Page = await browser.newPage({viewport:{width:1212,height:720},reducedMotion:'reduce'});
      try {
        const errors: string[] = [];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`${server.url}/cued.html?step=middle`);
        await page.waitForSelector('[data-ready=true]');
        assert.ok(await page.evaluate(()=>document.documentElement.clientWidth<innerWidth),'classic scrollbars are active');
        for (const width of [1211,1212,1213,1226,1227,1280]) {
          await page.setViewportSize({width,height:720});
          await page.evaluate(settle);
          const seen = await page.locator('#content').evaluate(geometry);
          assert.ok(seen.width>=880-1,`${width}: the gutter must not squeeze the stage`);
          assert.equal(seen.side,Number(seen.content>=1180),`${width}: rail follows actual space`);
        }
        await page.setViewportSize({width:1212,height:720});
        await page.evaluate(settle);
        await page.locator('details.rail > summary').click();
        await page.locator('.steps button[data-step=middle]').focus();
        for (const width of [1227,1212]) {
          await page.setViewportSize({width,height:720});
          await page.evaluate(settle);
          assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-step')),'middle','the focused step survives reparenting');
        }
        await page.goto(`${server.url}/cued.html?step=note`);
        await page.waitForSelector('[data-ready=true]');
        await page.evaluate(settle);
        assert.ok(await page.locator('details.rail').evaluate(e=>(e as HTMLDetailsElement).open),'a direct source step opens the actual under-card rail');
        await page.locator('.supporting button[data-step=note]').focus();
        for (const width of [1280,1212]) {
          await page.setViewportSize({width,height:720});
          await page.evaluate(settle);
          assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-step')),'note','the focused source step survives reparenting');
        }
        assert.ok(await page.locator('details.rail').evaluate(e=>(e as HTMLDetailsElement).open),'the source step remains visible after moving below the card');
        await page.goto(`${server.url}/long.html?step=s1`);
        await page.waitForSelector('[data-ready=true]');
        await page.setViewportSize({width:1212,height:1200});
        await page.evaluate(settle);
        const samples = await page.locator('#content').evaluate(async root => {
          const rows = [];
          for(let n=0;n<12;n++) {
            await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
            rows.push([root.getBoundingClientRect().width,root.querySelector('.stage')!.getBoundingClientRect().width,root.querySelectorAll('aside.rail').length]);
          }
          return rows;
        });
        assert.equal(samples.length,12);
        assert.ok(samples.every(row=>JSON.stringify(row)===JSON.stringify(samples[0])),'a long rail must not oscillate the scrollbar and width');
        assert.ok(samples[0]![1]!>=880-1);
        assert.equal(samples[0]![2],0);
        assert.deepEqual(errors,[],'fit changes produce no observer-loop or page errors');
      } finally { await page.close(); }
    } finally {
      await browser?.close();
      server?.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);

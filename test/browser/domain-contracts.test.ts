import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { encodeLog, SENT } from '../../app/embed-live.ts';

const enabled = !!process.env.EXPLAIN_BROWSER;
const options = { skip: !enabled && 'set EXPLAIN_BROWSER=1 for domain-contract reader checks' };
let folder: string, browser: Browser, server: Awaited<ReturnType<typeof serve>>;
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-domain-contracts-'));
  for (const id of ['latest-search', 'poppy-sessions']) {
    const project = await collectProject(`scenes/explainers/${id}`, { capture: false, write: false });
    await buildExplainer(project, join(folder, id + '.html'));
  }
  const file = join(folder, 'readout-live.ts');
  await writeFile(file, `import {Scene} from 'rayner';import {stage,view,Machine,refuse} from 'rayner/explain';import {card} from 'rayner/drawing';
export default class Readouts extends Scene{state={n:0};shown={enabled:false};static meta={id:'readout-live',watch:[{source:'model',key:'n',label:'Count'},{source:'shown',key:'enabled',label:'Enabled'},{source:'derived',key:'doubled',label:'Double'}]};
async construct(){const s=stage(this,{heading:false}),ctx=s.drawing;this.addJson(()=>({doubled:this.state.n*2}));await this.step('try',{title:'A counter',caption:'Each press adds one.'});const v=view(this,st=>card(ctx,[['Count',st.n]],{width:8,size:.65}));const m=new Machine(this,{start:{n:0},events:['up'],next:st=>st.n<2?{n:st.n+1}:refuse('At two'),views:[v],runTime:.08});await s.enter(v);m.offer();}}`);
  await buildExplainer(await collectProject(file, { capture: false, write: false }), join(folder, 'readout-live.html'));
  server = await serve(folder, 0, 'latest-search.html');
  browser = await launch();
});

test('live readouts agree after presses, Undo, Reset and a fresh recorded-log link', options, async () => {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    try {
      const url = `${server.url}/readout-live.html?step=try`, rows = () => page.locator('.changes .change').allTextContents();
      await page.goto(url); await settled(page, []);
      const rest = ['Enabled: no', 'Double: 0'];
      assert.deepEqual(await rows(), rest);
      await page.click('.live-events button[data-event="up"]'); await settled(page, ['up']);
      const one = ['Count: 0 → 1', 'Enabled: no', 'Double: 2'];
      assert.deepEqual(await rows(), one);
      await page.click('.live-tools button:text-is("Undo")'); await settled(page, []);
      assert.deepEqual(await rows(), rest);
      await page.goto(`${server.url}/readout-live.html?${new URLSearchParams({step:'try',[SENT]:encodeLog(['up'])})}`);
      await settled(page, ['up']);
      assert.deepEqual(await rows(), one);
      await page.click('.live-tools button:text-is("Reset")'); await settled(page, []);
      assert.deepEqual(await rows(), rest);
    } finally { await page.close(); }
  }
});
after(async () => {
  if (!enabled) return;
  await browser?.close(); await server?.close();
  await rm(folder, { recursive: true, force: true });
});
async function settled(page: Page, log: readonly string[]) {
  await page.waitForFunction(value => {
    const row = document.querySelector<HTMLElement>('.live');
    return row && !row.hidden && row.dataset.drawn === value && !document.querySelector('.stage[aria-busy],#content.loading,svg.leaving');
  }, encodeLog(log));
}
// Live exploration can use the whole authored frame on phones; compare the actual drawing records.
const svg = (page: Page) => page.locator('.stage svg:not(.leaving)').evaluate(node => node.innerHTML);

test('the published-page reader preserves hidden event distinctions on desktop and phone', options, async () => {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    try {
      const url = `${server.url}/latest-search.html?step=page-only`;
      await page.goto(url); await settled(page, []);
      const blank = await svg(page);
      assert.equal(await page.locator('.live-events button[data-event="A lands"]').getAttribute('aria-disabled'), 'true');
      await page.click('.live-events button[data-event="start A"]'); await settled(page, ['start A']);
      assert.equal(await svg(page), blank, 'starting a request changes hidden work without changing the published page');
      assert.equal(await page.locator('.live-events button[data-event="A lands"]').getAttribute('aria-disabled'), null);
      await page.click('.live-events button[data-event="start B"]'); await settled(page, ['start A','start B']);
      assert.equal(await svg(page), blank);
      await page.click('.live-events button[data-event="A lands"]'); await settled(page, ['start A','start B','A lands']);
      assert.equal(await svg(page), blank, 'the older response is suppressed when a newer request exists');
      await page.goto(url); await settled(page, []);
      await page.click('.live-events button[data-event="start A"]'); await settled(page, ['start A']);
      await page.click('.live-events button[data-event="A lands"]'); await settled(page, ['start A','A lands']);
      assert.notEqual(await svg(page), blank, 'the same response publishes when A remains latest');
      assert.match(await page.locator('.described div').textContent() ?? '', /Result: ca/);
    } finally { await page.close(); }
  }
});

test('reader watch rows distinguish displayed ticket links from actual request events', options, async () => {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    try {
      for (const [step, links] of [['stranger', 0], ['address', 1], ['delegation', 3]] as const) {
        await page.goto(`${server.url}/poppy-sessions.html?step=${step}`);
        await page.waitForFunction(expected => document.querySelector('.steps [aria-current=step]')?.getAttribute('data-step') === expected && !document.querySelector('.stage[aria-busy],#content.loading'), step);
        assert.equal(await page.locator('.changes > span:first-child').textContent(), 'At this step');
        assert.deepEqual(await page.locator('.changes .change').allTextContents(), [`Links on the ticket: ${links}`]);
      }
      await page.goto(`${server.url}/poppy-sessions.html?step=send`);
      await page.waitForFunction(() => document.querySelector('.steps [aria-current=step]')?.getAttribute('data-step') === 'send' && !document.querySelector('.stage[aria-busy],#content.loading'));
      assert.deepEqual(await page.locator('.changes .change').allTextContents(), ['Request sent: no → yes', 'Links on the ticket: 3']);
    } finally { await page.close(); }
  }
});

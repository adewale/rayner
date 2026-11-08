#!/usr/bin/env node
// What a press of a live machine's event button costs (docs/MACHINES.md, "The player").
//
//   node tools/repo/live-cost.ts                      the nine machines, 6 presses each, no CPU throttling
//   node tools/repo/live-cost.ts --cpu 4 --presses 8 --explainers ring-buffer,token-bucket
//
// For each live step of each explainer's default scenario it builds the page, serves it, and in
// Chromium presses events the model takes, each press extending the reader's log (Reset where no
// event goes on), and times each press from the click to the first animated frame on the stage
// (the scene run again to the step, every earlier event skipped), to the landing, and, with
// motion reduced, to the landing drawn at once. In Node it times the same re-runs (runLive, no
// frame drawn). Prints a Markdown table of medians and worsts. Numbers move with whatever else the
// machine runs; compare rows from one run.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from 'playwright-core';
import { collectProject } from '../lib/explain-project.ts';
import { buildExplainer } from '../lib/explain-build.ts';
import { serve } from '../lib/explain-serve.ts';
import { launch } from '../lib/browser.ts';
import { SENT, acceptedLog, encodeLog, logStart, outcomes, runLive } from '../../app/embed-live.ts';
import { stepQuery } from '../../explain/settings.ts';
import { median } from './lib/bench-stats.ts';

const { values: flags } = parseArgs({
  options: {
    presses: { type: 'string', default: '6' },
    cpu: { type: 'string', default: '1' },
    explainers: { type: 'string', default: 'ring-buffer,state-machine,statecharts,token-bucket,monty-hall,latest-search,oauth-pkce,just-bash,python-dict' },
  },
});
const presses = Number(flags.presses), cpu = Number(flags.cpu);
const ms = (xs: number[]) => `${Math.round(median(xs))} / ${Math.round(Math.max(...xs))}`;

/** Click `event`'s button; resolve with the time to the first new picture on the stage and to the landing on `want`. */
const press = (page: Page, event: string, want: string) => page.evaluate(({ event, want }) => new Promise<{ start: number; landed: number }>((resolve) => {
  const stage = document.querySelector('.stage')!, row = document.querySelector<HTMLElement>('.live')!;
  const before = new Set(stage.querySelectorAll(':scope>svg'));
  let start = NaN;
  const t0 = performance.now();
  const seen = new MutationObserver(() => {
    if (Number.isNaN(start) && [...stage.querySelectorAll(':scope>svg')].some((svg) => !before.has(svg))) start = performance.now() - t0;
  });
  seen.observe(stage, { childList: true });
  document.querySelector<HTMLButtonElement>(`.live-events button[data-event="${CSS.escape(event)}"]`)!.click();
  const check = () => {
    if (row.dataset.landed === want && !stage.hasAttribute('aria-busy')) {
      seen.disconnect();
      resolve({ start, landed: performance.now() - t0 });
    } else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}), { event, want });
const landed = (page: Page, log: string) => page.waitForFunction((value) => {
  const row = document.querySelector<HTMLElement>('.live');
  return !!row && !row.hidden && row.dataset.landed === value && !document.querySelector('.stage[aria-busy]') && !document.querySelector('#content.loading');
}, log, { timeout: 60_000 });

const folder = await mkdtemp(join(tmpdir(), 'rayner-live-cost-'));
const browser = await launch();
const rows: string[] = [];
try {
  for (const id of flags.explainers.split(',')) {
    const project = await collectProject(join('scenes/explainers', id), { write: false });
    await buildExplainer(project, join(folder, `${id}.html`));
    const server = await serve(folder, 0, `${id}.html`);
    const scenario = project.scenarios[0]!;
    for (const [step, live] of scenario.live ?? []) {
      const times = scenario.trace.steps.find((s) => s.step === step)!;
      const base = logStart(live.machine, (await runLive(scenario.Scene, times, live, [])).rest);
      if (!base) continue;
      // The presses: each extends the log, so no picture is one the page drew before (it keeps those),
      // with the events the model takes from the state reached, in turn; where none goes on, Reset
      // and start again. The first press warms up and is not measured.
      const walk: string[][] = [];
      for (let i = 0, log: string[] = []; i <= presses; i++) {
        let takes = outcomes(live.machine, acceptedLog(live.machine, base.state, log).states.at(-1)!).filter((o) => o.kind === 'next').map((o) => o.event);
        if (!takes.length) {
          log = [];
          takes = outcomes(live.machine, base.state).filter((o) => o.kind === 'next').map((o) => o.event);
        }
        log = [...log, takes[i % takes.length]!];
        walk.push(log);
      }
      // Node: the scene run again to the step and the log played, no frame drawn.
      const node: number[] = [];
      for (const [i, log] of walk.entries()) {
        const t0 = performance.now();
        await runLive(scenario.Scene, times, live, log, { from: base.from });
        if (i) node.push(performance.now() - t0);
      }
      const measured: Record<'motion' | 'reduce', { start: number[]; landed: number[] }> = { motion: { start: [], landed: [] }, reduce: { start: [], landed: [] } };
      for (const motion of ['motion', 'reduce'] as const) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
        const page = await context.newPage();
        if (cpu > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
        await page.goto(`${server.url}/${id}.html?${stepQuery(scenario.values, step)}`);
        await page.waitForSelector('[data-ready=true]');
        await landed(page, '');
        for (const [i, log] of walk.entries()) {
          if (log.length === 1 && i) {
            await page.click('.live-tools button:text-is("Reset")');
            await landed(page, '');
          }
          const t = await press(page, log.at(-1)!, encodeLog(log));
          if (i) { measured[motion].start.push(t.start); measured[motion].landed.push(t.landed); }
        }
        if (new URL(page.url()).searchParams.get(SENT) !== walk.at(-1)!.join(',')) throw new Error(`${id} ${step}: the URL lost the events`);
        await context.close();
      }
      rows.push(`| \`${id}\` | \`${step}\` | ${Math.max(...walk.map((l) => l.length))} | ${ms(node)} | ${ms(measured.motion.start)} | ${ms(measured.motion.landed)} | ${ms(measured.reduce.landed)} |`);
      console.error(rows.at(-1));
    }
    server.close();
  }
} finally {
  await browser.close();
  await rm(folder, { recursive: true, force: true });
}
console.log(`${presses} presses per live step, CPU throttling ${cpu}×; median / worst in ms.\n`);
console.log('| Explainer | Live step | Longest log | Node: re-run | Chromium: press to first frame | Chromium: press to landing | Chromium, reduced motion: press to landing |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) console.log(row);

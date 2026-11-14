// The live machine in the served player (docs/MACHINES.md, "The player"): on each of the ten
// explainers with a machine, the reader's buttons say what `outcome` says from every state the test
// reaches by pressing them, the URL carries the events sent, and the picture the presses land on is
// the picture a fresh load of that URL draws. A button that disagrees with `outcome` fails.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { collectProject } from '../../tools/lib/explain-project.ts';
import type { Project } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { SENT, acceptedLog, decodeLog, encodeLog, outcomes } from '../../app/embed-live.ts';
import { logStart, runLive } from '../../explain/live.ts';
import type { Live } from '../../explain/live.ts';
import { chromeFor } from '../../app/embed-strings.ts';

const enabled = !!process.env.EXPLAIN_BROWSER;
const options = { skip: enabled ? false : 'set EXPLAIN_BROWSER=1 for served live machine checks' };
const EXPLAINERS = ['ring-buffer', 'state-machine', 'statecharts', 'token-bucket', 'monty-hall', 'latest-search', 'oauth-pkce', 'just-bash', 'python-dict', 'bloom-filter'];
/** How far the walk goes from each live step's start: events deep, and states in all. */
const DEPTH = 2, STATES = 6;
const t = chromeFor('en');

type Subject = {
  id: string;
  file: string;
  values: Record<string, string>;
  step: string;
  live: Live;
  base: { from: 'rest' | 'start'; state: object };
};
let folder: string, browser: Browser, server: Awaited<ReturnType<typeof serve>>;
const subjects: Subject[] = [];

before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-live-'));
  for (const id of EXPLAINERS) {
    const project: Project = await collectProject(`scenes/explainers/${id}`, { write: false });
    const file = `${id}.html`;
    await buildExplainer(project, join(folder, file));
    // The default scenario's live steps (oauth-pkce's default replays the theft, which has its machine).
    const scenario = project.scenarios[0]!;
    assert.ok(scenario.live?.size, `${id}: its default scenario has a live step`);
    for (const [step, live] of scenario.live!) {
      const base = logStart(live.machine, (await runLive(scenario.Scene, step, live, [])).rest);
      assert.ok(base, `${id} ${step}: some event goes somewhere`);
      subjects.push({ id, file, values: scenario.values, step, live, base });
    }
  }
  server = await serve(folder, 0, 'ring-buffer.html');
  browser = await launch();
});
after(async () => {
  if (!enabled) return;
  await browser?.close();
  server?.close();
  if (folder) await rm(folder, { recursive: true, force: true });
});

const urlOf = (s: Subject, log: readonly string[]) =>
  `${server.url}/${s.file}?${new URLSearchParams({ ...s.values, step: s.step })}${log.length ? `&${SENT}=${encodeLog(log)}` : ''}`;
/** Wait until the live row has landed on `log` and the stage is at rest. */
const landed = (page: Page, log: readonly string[]) =>
  page.waitForFunction((value) => {
    const row = document.querySelector<HTMLElement>('.live');
    return !!row && !row.hidden && row.dataset.drawn === value && !document.querySelector('.stage[aria-busy]') &&
      !document.querySelector('svg.leaving') && !document.querySelector('#content.loading');
  }, encodeLog(log), { timeout: 30_000 });
const picture = (page: Page) => page.locator('.stage svg:not(.leaving)').evaluate((svg) => svg.outerHTML);
/** The live row as the reader meets it: each button's event, kind, whether it is aria-disabled, and the reason it gives. */
const buttons = (page: Page) => page.$$eval('.live-events button', (all) => all.map((b) => ({
  event: (b as HTMLElement).dataset.event!,
  kind: (b as HTMLElement).dataset.outcome!,
  disabled: b.getAttribute('aria-disabled') === 'true',
  reason: b.getAttribute('aria-describedby') ? document.getElementById(b.getAttribute('aria-describedby')!)?.textContent ?? '' : '',
  name: b.getAttribute('aria-label') ?? '',
})));
type Seen = Awaited<ReturnType<typeof buttons>>;

/** Where the buttons disagree with `outcome` from the state `log` reaches: nothing when they agree. */
function disagreements(s: Subject, log: readonly string[], seen: Seen): string[] {
  const state = acceptedLog(s.live.machine, s.base.state, log).states.at(-1)!;
  const expected = outcomes(s.live.machine, state).map((o) => ({
    event: o.event,
    kind: o.kind,
    disabled: o.kind !== 'next',
    reason: o.kind === 'next' ? '' : o.kind === 'beyond' ? t.storyStops(o.reason!) : o.reason ?? t.notPossible,
    name: o.label,
  }));
  const problems: string[] = [];
  if (seen.length !== expected.length) problems.push(`${seen.length} buttons for ${expected.length} events`);
  for (const [i, e] of expected.entries()) {
    const b = seen[i];
    if (JSON.stringify(b) !== JSON.stringify(e)) problems.push(`after [${log.join(', ')}], ${e.event}: the button is ${JSON.stringify(b)}, outcome says ${JSON.stringify(e)}`);
  }
  return problems;
}

test('every live step: buttons agree with outcome, the URL holds the events, and a fresh load of it draws the same picture', options, async () => {
  const pressing = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let states = 0, presses = 0;
  try {
    for (const s of subjects) {
      const at = `${s.id} ${s.step}`;
      await pressing.goto(urlOf(s, []));
      await pressing.waitForSelector('[data-ready=true]');
      await landed(pressing, []);
      assert.equal(await pressing.locator('.live-lede').textContent(), s.base.from === 'start' ? t.liveFromStart : t.liveFromRest, at);
      let visited = 0;
      const visit = async (log: string[]): Promise<void> => {
        visited++;
        states++;
        const where = `${at} after [${log.join(', ')}]`;
        assert.deepEqual(disagreements(s, log, await buttons(pressing)), [], where);
        assert.deepEqual(decodeLog(new URL(pressing.url()).searchParams.get(SENT)), log, `${where}: the URL's events`);
        // Deep link = same picture: the presses (each played in real time) land where a fresh load of the URL draws.
        await fresh.goto(pressing.url());
        await fresh.waitForSelector('[data-ready=true]');
        await landed(fresh, log);
        assert.equal(await picture(fresh), await picture(pressing), `${where}: a fresh load of the URL draws another picture`);
        assert.deepEqual(disagreements(s, log, await buttons(fresh)), [], `${where}, freshly loaded`);
        if (log.length >= DEPTH) return;
        const state = acceptedLog(s.live.machine, s.base.state, log).states.at(-1)!;
        for (const o of outcomes(s.live.machine, state)) {
          if (o.kind !== 'next' || visited >= STATES) continue;
          const before = await picture(pressing);
          await pressing.click(`.live-events button[data-event="${o.event}"]`);
          presses++;
          await landed(pressing, [...log, o.event]);
          // A press that reaches another state draws another picture: the comparisons below compare something.
          if (JSON.stringify(o.kind === 'next' && s.live.machine.after(state, o.event)) !== JSON.stringify(state))
            assert.notEqual(await picture(pressing), before, `${where}: ${o.event} changed nothing on the stage`);
          assert.match(await pressing.locator('.live-said').textContent() ?? '', new RegExp(`^${o.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\. \\S`), `${where}: ${o.event} is announced`);
          await visit([...log, o.event]);
          await pressing.click('.live-tools button:text-is("Undo")');
          await landed(pressing, log);
        }
      };
      await visit([]);
      assert.ok(visited >= 2, `${at}: at least one event was pressed`);
    }
  } finally {
    await pressing.close();
    await fresh.close();
  }
  assert.equal(subjects.length, 13, 'ten explainers; statecharts, latest-search and python-dict have two live steps each');
  assert.ok(states >= 40 && presses >= 30, `${states} states, ${presses} presses`);
});

test('a button that disagrees with outcome fails the check (a deliberate defect)', options, async () => {
  const s = subjects.find((x) => x.id === 'ring-buffer')!;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(urlOf(s, []));
    await page.waitForSelector('[data-ready=true]');
    await landed(page, []);
    assert.deepEqual(disagreements(s, [], await buttons(page)), []);
    // The defect: an event the model takes, shown as refused, the way a player that read the wrong state would.
    await page.$eval('.live-events button[data-outcome=next]', (b) => {
      (b as HTMLElement).dataset.outcome = 'refused';
      b.setAttribute('aria-disabled', 'true');
    });
    const problems = disagreements(s, [], await buttons(page));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0]!, /push: the button is .*"kind":"refused".*outcome says .*"kind":"next"/);
  } finally {
    await page.close();
  }
});

test('Undo, Reset or another press during an animated landing lands where a fresh load of the URL does', options, async () => {
  const s = subjects.find((x) => x.id === 'ring-buffer')!;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  /** An event the machine takes after `log`. */
  const nextAfter = (log: string[]) => outcomes(s.live.machine, acceptedLog(s.live.machine, s.base.state, log).states.at(-1)!).find((o) => o.kind === 'next')!.event;
  const event = nextAfter([]);
  /** The stage at rest on `log`, a moment later still, and the picture a fresh load of that link draws. */
  const same = async (log: string[], why: string) => {
    await landed(page, log);
    assert.deepEqual(decodeLog(new URL(page.url()).searchParams.get(SENT)), log, why);
    const now = await picture(page);
    // A landing cut short must not put its picture on the stage afterwards.
    await page.waitForTimeout(600);
    assert.equal(await picture(page), now, `${why}: the stage changed after it landed`);
    await fresh.goto(urlOf(s, log));
    await fresh.waitForSelector('[data-ready=true]');
    await landed(fresh, log);
    assert.equal(now, await picture(fresh), `${why}: a fresh load draws another picture`);
  };
  try {
    await page.goto(urlOf(s, []));
    await page.waitForSelector('[data-ready=true]');
    await landed(page, []);
    const landing = () => page.locator('.stage[aria-busy]').count();
    for (const control of ['Undo', 'Reset']) {
      await page.click(`.live-events button[data-event="${event}"]`);
      assert.equal(await landing(), 1, 'the press is still landing');
      await page.click(`.live-tools button:text-is("${control}")`);
      await same([], `${control} during the landing`);
    }
    const second = nextAfter([event]);
    await page.click(`.live-events button[data-event="${event}"]`);
    assert.equal(await landing(), 1, 'the press is still landing');
    await page.click(`.live-events button[data-event="${second}"]`);
    await same([event, second], 'a press during the landing');
    const third = nextAfter([event, second]);
    await page.click(`.live-events button[data-event="${third}"]`);
    await same([event, second, third], 'a press after it, from the run held there');
  } finally {
    await page.close();
    await fresh.close();
  }
});

test('the keyboard sends events, refused events say why, a bad link falls back with a notice, and Back undoes an event', options, async () => {
  const s = subjects.find((x) => x.id === 'statecharts' && x.step === 'parent')!;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  try {
    // A link whose second event the machine refuses there opens on the first, and says so.
    await page.goto(urlOf(s, ['POWER_OFF', 'POWER_OFF']));
    await page.waitForSelector('[data-ready=true]');
    await landed(page, ['POWER_OFF']);
    assert.match(await page.locator('.notice').textContent() ?? '', /“POWER_OFF” cannot be sent there/);
    assert.deepEqual(decodeLog(new URL(page.url()).searchParams.get(SENT)), ['POWER_OFF']);
    // A refused event's button stays focusable, describes its reason, and pressing it only says why.
    const refused = page.locator('.live-events button[data-event="POWER_OFF"]');
    assert.equal(await refused.getAttribute('aria-disabled'), 'true');
    await refused.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-event')), 'POWER_OFF');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('.live-said').textContent() ?? '', /^POWER_OFF: /);
    assert.deepEqual(decodeLog(new URL(page.url()).searchParams.get(SENT)), ['POWER_OFF']);
    // Tab reaches the next event; Space sends it (under reduced motion it lands at once), and the arrows still step.
    await page.locator('.live-events button[data-event="POWER_ON"]').focus();
    await page.keyboard.press(' ');
    await landed(page, ['POWER_OFF', 'POWER_ON']);
    assert.match(await page.locator('.live-said').textContent() ?? '', /^POWER_ON\. /);
    // Back in the browser's history takes the last event back, as it takes back a step.
    await page.goBack();
    await landed(page, ['POWER_OFF']);
    // Reset is the step's own picture, with no events in the URL.
    await page.click('.live-tools button:text-is("Reset")');
    await landed(page, []);
    assert.equal(new URL(page.url()).searchParams.has(SENT), false);
    assert.equal(await page.locator('.live-said').textContent(), t.resetSaid);
    // Leaving the step clears the log; a step with no machine has no buttons.
    await page.locator('.live-events button[data-event="POWER_OFF"]').click();
    await landed(page, ['POWER_OFF']);
    await page.keyboard.press('Escape');
    await page.locator('body').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('step') === 'copies');
    assert.equal(new URL(page.url()).searchParams.has(SENT), false);
    assert.equal(await page.locator('.live').isHidden(), true);
    // A link with events for a step with no machine opens on the step and says the events are left out.
    await page.goto(`${server.url}/${s.file}?step=copies&${SENT}=POWER_ON`);
    await page.waitForSelector('[data-ready=true]');
    await page.waitForFunction(() => !document.querySelector('#content.loading') && new URL(location.href).searchParams.get('step') === 'copies');
    await page.waitForFunction((words) => document.querySelector('.notice')?.textContent?.includes(words), t.notLive);
    assert.equal(new URL(page.url()).searchParams.has(SENT), false);
  } finally {
    await page.close();
  }
});

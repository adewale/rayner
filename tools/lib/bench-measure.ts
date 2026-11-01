import type { Browser } from 'playwright-core';
import { blocking, longestGap } from './bench-stats.ts';
export type Sample = {
  ready: number;
  motion: number;
  rest: number;
  gap: number;
  jump: number;
  blocking: number;
  shift: number;
  trace: PageLog;
};
const VIEWPORT = { width: 390, height: 844 };

/** What the page records, from before its own script runs (timestamps are performance.now()). */
export type PageLog = {
  ready: number;
  clicks: number[];
  steps: [string, number][];
  stage: number[];
  frames: number[];
  tasks: [number, number][];
  shifts: [number, number][];
};
function record() {
  const r: PageLog = { ready: 0, clicks: [], steps: [], stage: [], frames: [], tasks: [], shifts: [] };
  (window as unknown as { __bench: PageLog }).__bench = r;
  const tasks = (entries: PerformanceEntry[]) => entries.forEach((e) => r.tasks.push([e.startTime, e.duration]));
  const shifts = (entries: PerformanceEntry[]) =>
    entries.forEach((e) => r.shifts.push([e.startTime, (e as PerformanceEntry & { value: number }).value]));
  const taskObserver = new PerformanceObserver((l) => tasks(l.getEntries()));
  taskObserver.observe({ type: 'longtask', buffered: true });
  // Every shift counts, including those just after a click, which CLS itself would excuse.
  const shiftObserver = new PerformanceObserver((l) => shifts(l.getEntries()));
  shiftObserver.observe({ type: 'layout-shift', buffered: true });
  (window as unknown as { __benchFlush: () => void }).__benchFlush = () => {
    tasks(taskObserver.takeRecords());
    shifts(shiftObserver.takeRecords());
  };
  // The event's own time: when the reader pressed, including any wait for the main thread.
  document.addEventListener('click', (e) => r.clicks.push(e.timeStamp), true);
  document.addEventListener('rayner:step', (e) => r.steps.push([(e as CustomEvent).detail.step, performance.now()]));
  // The stage's picture changing: a new picture put on it, or a drawn element inside it patched.
  // The stage element's own attributes (its label) change with the caption, not the picture.
  new MutationObserver((list) => {
    if (
      r.ready &&
      list.some(
        (m) =>
          (m.target as Element).closest?.('.stage') &&
          (m.type === 'childList' || !(m.target as Element).classList.contains('stage')),
      )
    )
      r.stage.push(performance.now());
    if (!r.ready && document.querySelector('[data-ready=true]')) r.ready = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true });
  const tick = (t: number) => {
    r.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export async function measure(
  browser: Browser,
  url: string,
  { cpu, readMs, viewport = VIEWPORT }: { cpu: number; readMs: number; viewport?: { width: number; height: number } },
): Promise<Sample> {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (cpu > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.addInitScript(record);
    const until = (step: string) =>
      page.waitForFunction(
        (s) => (window as unknown as { __bench: PageLog }).__bench.steps.some(([n]) => n === s),
        step,
        { polling: 100, timeout: 120_000 },
      );
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __bench: PageLog }).__bench.ready > 0, null, {
      polling: 100,
      timeout: 120_000,
    });
    const names = await page
      .locator('.steps button')
      .evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.step!));
    if (names.length < 3 || new Set(names).size !== names.length || names.some((n) => !n))
      throw new Error('bench needs at least three distinct named steps');
    await page.waitForTimeout(readMs);
    await page.locator('.stepper .primary').click();
    await until(names[1]!);
    await page.waitForTimeout(readMs);
    // Main steps have a segment the reader can use even when the rail is closed.
    // A source step instead needs its disclosures opened through their real UI.
    const lastName = names.at(-1)!;
    const segments = page.locator('.step-bar button');
    const segment = await segments.evaluateAll(
      (buttons, name) => buttons.findIndex((b) => (b as HTMLElement).dataset.step === name),
      lastName,
    );
    const jumpTarget = segment >= 0 ? segments.nth(segment) : page.locator('.steps button').last();
    let disclosureClicks = 0;
    const ancestors = await jumpTarget.locator('xpath=ancestor::details').all();
    const ordered = await Promise.all(
      ancestors.map(async (detail) => ({
        detail,
        depth: await detail.evaluate((node) => {
          let depth = 0;
          for (let p = node.parentElement; p; p = p.parentElement) depth++;
          return depth;
        }),
      })),
    );
    for (const { detail } of ordered.sort((a, b) => a.depth - b.depth)) {
      if (await detail.evaluate((node) => (node as HTMLDetailsElement).open)) continue;
      await detail.locator(':scope > summary').click();
      disclosureClicks++;
    }
    if (!(await jumpTarget.isVisible())) throw new Error(url + ': the final benchmark step is unreachable');
    await jumpTarget.click();
    await until(names.at(-1)!);
    // Let observer delivery and two rendering opportunities finish before taking records.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(), 0))),
      );
      (window as unknown as { __benchFlush: () => void }).__benchFlush();
    });
    const r = await page.evaluate(() => (window as unknown as { __bench: PageLog }).__bench);
    if (errors.length) throw new Error(`${url}: ${errors.join('; ')}`);
    const observations = [
      r.ready,
      ...r.clicks,
      ...r.stage,
      ...r.frames,
      ...r.steps.map(([, t]) => t),
      ...r.tasks.flat(),
      ...r.shifts.flat(),
    ];
    if (observations.some((v) => !Number.isFinite(v) || v < 0)) throw new Error(url + ': invalid trace observation');
    const expectedClicks = 2 + disclosureClicks;
    if (r.clicks.length !== expectedClicks || r.clicks.some((t, i) => i > 0 && t < r.clicks[i - 1]!))
      throw new Error(url + `: expected ${expectedClicks} ordered action clicks`);
    // A reference jump includes opening its disclosure, rather than hiding that
    // extra interaction or its blocking work from the reported latency.
    const [next, jump] = r.clicks as [number, number];
    const at = (step: string, after: number) => r.steps.find(([n, t]) => n === step && t >= after)![1];
    const rested = at(names[1]!, next),
      jumped = at(names.at(-1)!, jump);
    const mutation = r.stage.find((t) => t >= next && t <= rested);
    if (mutation === undefined) throw new Error(url + ': no stage mutation in Next window');
    const sample = {
      ready: r.ready,
      motion: mutation - next,
      rest: rested - next,
      gap: longestGap(r.frames, next, rested),
      jump: jumped - jump,
      blocking: blocking(r.tasks, next, rested) + blocking(r.tasks, jump, jumped),
      shift: r.shifts.filter(([t]) => t >= r.ready).reduce((s, [, v]) => s + v, 0),
    };
    for (const [key, value] of Object.entries(sample))
      if (!Number.isFinite(value) || value < 0) throw new Error(url + ': invalid measured ' + key);
    return { ...sample, trace: r };
  } finally {
    await context.close();
  }
}

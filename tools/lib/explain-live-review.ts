// Served review of the live states: the pictures a reader reaches by pressing a machine's event
// buttons at its live step (docs/MACHINES.md, "The player"). Each is opened as a link opens it,
// `?step=…&sent=…`, at 390 and 1180 px, and held to the rules a resting step is held to where they
// apply. Node works out what each picture must be (its painted records, what the events changed,
// its labels and its buttons); Chromium says what the served page actually paints.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { machinesOf } from '../../src/index.ts';
import type { Machine, Scene, Sink } from '../../src/index.ts';
import { SENT, acceptedLog, encodeLog, logStart, outcomes, runLive } from '../../app/embed-live.ts';
import type { LogStart } from '../../app/embed-live.ts';
import { chromeFor } from '../../app/embed-strings.ts';
import { READ_PX } from '../../app/embed-closeup.ts';
import { stepWords } from '../../explain/trace.ts';
import { MIN_PX } from './explain-check.ts';
import { covered, inspectStoryFrame, storyFrame, storyMemory, verifyStoryTargets } from './explain-story-review.ts';
import type { StoryFrame, StoryMemory, StoryView } from './explain-story-review.ts';
import type { Project } from './explain-project.ts';
import { LIVE_STATES, readableOpeningLabel } from './explain-review-plan.ts';
import type { LiveStateReview } from './explain-review-plan.ts';

type AnyMachine = Machine<object, string>;
type Scenario = Project['scenarios'][number];

/**
 * The events each visited live state is reached by, from where the reader's events start: every
 * state one press away (one per event the model takes, however many); then, breadth first, the
 * states further on, until LIVE_STATES less one; and last the farthest state exploration reaches,
 * by its shortest events. A state the same as the start is not visited again, except that a
 * machine whose every event returns to the start (just-bash's lesson) has its first event pressed once.
 *
 * Why: the pictures one press away are the ones every reader who touches the buttons sees, and
 * there are few (two to five here); breadth first keeps each further state's link the shortest
 * that reaches it, so a failure names the fewest events; and the farthest state is where a story's
 * machine ends up (a full ring, the tenth request, every response landed), the picture most
 * likely to crowd. `rayner check` has already drawn every reachable state at 1280 px in Node; this
 * is the served page's evidence for a bounded sample, at the two widths readers use.
 */
export function liveVisits(machine: AnyMachine, start: object): string[][] {
  const key = (state: object) => JSON.stringify(state);
  const reached = machine.reachable(start).filter((r) => key(r.state) !== key(start));
  const chosen = reached.filter((r) => r.path.length === 1);
  for (const r of reached) {
    if (chosen.length >= LIVE_STATES - 1) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  const far = reached.at(-1);
  if (far && !chosen.includes(far)) chosen.push(far);
  if (!chosen.length) {
    const event = machine.spec.events.find((e) => 'next' in machine.outcome(start, e));
    return event === undefined ? [] : [[event]];
  }
  return chosen.map((r) => [...r.path]);
}

/** One button as the reader meets it, or as `outcome` says it must be. */
export interface LiveButton {
  event: string;
  kind: string;
  disabled: boolean;
  reason: string;
  name: string;
}
/** A live state to review: the step, where its events start, the events, and what the page must show. */
export interface LiveSubject {
  step: string;
  from: LogStart;
  sent: string[];
  frame: StoryFrame;
  buttons: LiveButton[];
}

/**
 * Every live state of `scenario` to visit (liveVisits), each with the picture the page must paint:
 * the scene run to the live step's resting picture and the events played (runLive, as the page
 * runs it), read as a resting step is read, with what the events newly emphasised, else the
 * artwork they changed, compared with the step's own picture. An event that leaves the stage as
 * it was is reviewed on the machine's views. A step whose machine no event moves has no buttons
 * and nothing to visit.
 */
export async function liveSubjects(scenario: Scenario, lang?: string): Promise<LiveSubject[]> {
  const t = chromeFor(lang);
  const subjects: LiveSubject[] = [];
  for (const [step, live] of scenario.live ?? []) {
    const times = scenario.trace.steps.find((s) => s.step === step);
    assert.ok(times, `live step ${step} is not in the trace`);
    const base = logStart(live.machine, (await runLive(scenario.Scene, times, live.index, [])).rest);
    if (!base) continue;
    for (const sent of liveVisits(live.machine, base.state)) {
      const name = `${step} after [${sent.join(', ')}]`;
      let memory: StoryMemory | undefined, frame: StoryFrame | undefined;
      const capture: Sink = {
        async frame(scene: Scene) {
          const views = machinesOf(scene)[live.index]!.spec.views;
          frame = (await storyFrame(scene, name, memory!, [], views.map((v) => ({ name: `view: ${v.key ?? 'machine'}`, objects: [v] })))).frame;
        },
      };
      await runLive(scenario.Scene, times, live.index, sent, { sink: capture, from: base.from, onRest: (scene) => (memory = storyMemory(scene)) });
      assert.ok(frame, `${name}: the run drew no picture`);
      const state = acceptedLog(live.machine, base.state, sent).states.at(-1)!;
      const buttons = outcomes(live.machine, state).map((o) => ({
        event: o.event,
        kind: o.kind,
        disabled: o.kind !== 'next',
        reason: o.kind === 'next' ? '' : o.kind === 'beyond' ? t.storyStops(o.reason!) : o.reason ?? t.notPossible,
        name: o.label,
      }));
      subjects.push({ step, from: base.from, sent, frame, buttons });
    }
  }
  return subjects;
}

/** Each label at its best view among `views` (painted, whole, inside the view), in CSS pixels; a label no view shows is left out. */
function labelPixels(labels: StoryFrame['labels'], views: StoryView[]): { text: string; px: number }[] {
  return labels.flatMap((label) => {
    const best = Math.max(0, ...views.map((v) => {
      const ink = label.indices.map((i) => v.ink.find((p) => p.index === i)!);
      if (!ink.every((p) => p.visible && p.complete && covered(p.box, [v.viewport]))) return 0;
      return label.size * Math.min(...ink.map((p) => p.scale));
    }));
    return best > 0 ? [{ text: label.text, px: best }] : [];
  });
}

/**
 * Open each live state of `subjects` by its link (`?step=…&sent=…`) at 390 and 1180 px,
 * and check what a resting step is checked for, where it applies: the caption is the step's, no
 * notice, the URL keeps the events, the page does not overflow, the stage paints exactly the
 * records Node drew for the state, and the reader's views (the whole picture, then on a phone the
 * step's close-ups) show what the events changed whole and unclipped. Three checks are the live
 * state's own: the buttons are the ones `outcome` gives from the state; every label the whole
 * picture paints reads at least MIN_PX as at a 1280 px stage, measured from the served page's own
 * transform (the rule `rayner check` applies to explored states in Node); and at 390 px every label
 * of what the events changed reads at least READ_PX, the phone's floor, in some reader view (the
 * whole picture or one of the step's close-ups), since a reader who presses must be able to read
 * what the press did. Console errors and outside connections are the caller's, as for resting steps.
 */
export async function reviewLiveStates(
  page: Page,
  url: string,
  scenario: Scenario,
  subjects: readonly LiveSubject[],
  directory?: string,
): Promise<LiveStateReview[]> {
  const results: LiveStateReview[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1180, height: 980 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [n, subject] of subjects.entries()) {
      const name = `${subject.step} after [${subject.sent.join(', ')}]`, where = `${name} at ${viewport.width}px`;
      const log = encodeLog(subject.sent), link = `${url}?${new URLSearchParams({ ...scenario.values, step: subject.step })}&${SENT}=${log}`;
      // The first state at each width opens as a fresh load of its link; the rest are reached
      // through the history, as Back and Forward reach them, which draws the same picture
      // (explain-live.test.ts compares a fresh load with presses) at a third of the time.
      if (n === 0) await page.goto(link);
      else await page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, link);
      await page.waitForSelector('[data-ready=true]');
      await page.waitForFunction((value) => {
        const row = document.querySelector<HTMLElement>('.live');
        return !!row && !row.hidden && row.dataset.landed === value && !document.querySelector('.stage[aria-busy]') &&
          !document.querySelector('svg.leaving') && !document.querySelector('#content.loading');
      }, log, { timeout: 60_000 });
      await settle();
      assert.equal(await page.evaluate(() => innerWidth), viewport.width, 'review must use the declared viewport');
      const step = scenario.trace.steps.find((s) => s.step === subject.step)!;
      assert.equal(await page.locator('.caption').innerText(), stepWords(step).caption, `${where}: caption`);
      assert.equal((await page.locator('.notice').textContent())?.trim() ?? '', '', `${where}: a notice says the link's events were not all taken`);
      assert.deepEqual(new URL(page.url()).searchParams.get(SENT)?.split(','), subject.sent, `${where}: the URL keeps the events`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${where}: page overflows`);
      const buttons: LiveButton[] = await page.$$eval('.live-events button', (all) => all.map((b) => ({
        event: (b as HTMLElement).dataset.event!,
        kind: (b as HTMLElement).dataset.outcome!,
        disabled: b.getAttribute('aria-disabled') === 'true',
        reason: b.getAttribute('aria-describedby') ? document.getElementById(b.getAttribute('aria-describedby')!)?.textContent ?? '' : '',
        name: b.getAttribute('aria-label') ?? '',
      })));
      assert.deepEqual(buttons, subject.buttons, `${where}: the buttons differ from what outcome gives`);
      // The labels join the inspected ink, so they can be measured, but not the subjects the views must show.
      const frame = subject.frame,
        measured = { ...frame, targets: [...frame.targets, { name: 'labels', indices: frame.labels.flatMap((l) => l.indices), opening: false }] };
      const whole = await inspectStoryFrame(page, measured), views = [whole];
      if (directory)
        await page.locator('.stage').screenshot({ path: join(directory, `${encodeURIComponent(subject.step)}.live${n}.${viewport.width}.png`), animations: 'disabled' });
      // The player shows the whole picture while the reader explores; on a phone, Next view tours the step's close-ups.
      const next = page.locator('.view-controls > button').first();
      const visited = new Set([whole.viewBox]);
      if ((await next.isVisible()) && (await next.isEnabled()))
        for (let k = 0; k < frame.records.length + 1; k++) {
          await next.click();
          await settle();
          const view = await inspectStoryFrame(page, measured);
          if (visited.has(view.viewBox)) break;
          visited.add(view.viewBox);
          views.push(view);
          assert.ok(k < frame.records.length, `${where}: close-up tour did not terminate`);
        }
      const verified = verifyStoryTargets(frame, views, name, viewport.width);
      assert.ok(verified.size, `${where}: nothing the events changed is painted in a reader view`);
      // The check's legibility rule, on the served page: each label in the whole picture, as at a 1280 px stage.
      const perStage = 1280 / (whole.stage[2] - whole.stage[0]);
      const labels = labelPixels(frame.labels, [whole]).map((l) => ({ ...l, px: l.px * perStage }));
      const small = labels.filter((l) => l.px < MIN_PX - 1e-3);
      assert.deepEqual(small.map((l) => `“${l.text}” is ${l.px.toFixed(1)} px at a 1280 px stage`), [], `${where}: labels under ${MIN_PX} px`);
      const changed = new Set(frame.targets.flatMap((t) => t.indices)),
        changedLabels = labelPixels(frame.labels.filter((l) => l.indices.some((i) => changed.has(i))), views);
      // On a phone, what a press changed must read at the phone's floor in the whole picture or a close-up.
      if (viewport.width === 390)
        assert.deepEqual(changedLabels.filter((l) => !readableOpeningLabel(l.px)).map((l) => `“${l.text}” is ${l.px.toFixed(1)} px at its best view`), [],
          `${where}: what the events changed reads under ${READ_PX} px on a phone`);
      results.push({
        step: subject.step, sent: subject.sent, width: viewport.width, views: views.length, targets: [...verified],
        labels: labels.length, minimumLabelPx1280: labels.length ? Math.min(...labels.map((l) => l.px)) : null,
        ...(viewport.width === 390 ? { changedLabelPx: changedLabels.length ? Math.min(...changedLabels.map((l) => l.px)) : null } : {}),
      });
    }
  }
  return results;
}

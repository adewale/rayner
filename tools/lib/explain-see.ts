// One step's resting picture without a browser, for a person or an agent reading a terminal:
// the picture as text, then the step's title, caption, what the picture shows in words, and what
// the step changed in scene.state. Lantern's `npm run see`, for one scenario. Every word comes from
// describeExplainer's description of the scenario, so `see` and `describe` cannot disagree.
import { withoutHeading, describeScenario } from '../../explain/internal.ts';
import type { ScenarioDescription } from '../../explain/testing.ts';
import { writeFile } from 'node:fs/promises';
import { renderFrame, toSvgString } from '../../src/index.ts';
import type { Sink } from '../../src/index.ts';
import type { Project } from './explain-project.ts';

type Scenario = Project['scenarios'][number];

const value = (v: unknown) => (v === undefined ? '—' : JSON.stringify(v));

/** The text `rayner see` prints for `step` of a described scenario (by name; the last step when omitted). */
export function seeText(id: string, c: ScenarioDescription, step?: string): string {
  const names = c.steps.map((s) => s.step);
  const s = step == null ? c.steps.at(-1) : c.steps.find((x) => x.step === step);
  if (!s) throw new RangeError(`the scene has no step ${JSON.stringify(step)}; its steps are ${names.join(', ')}`);
  const changed = Object.entries(s.changed).map(([k, { before, after }]) => `${k}: ${value(before)} → ${value(after)}`);
  const teaching = c.teaching.indexOf(s.step);
  return [
    s.drawing ?? '',
    '',
    `${id} · step ${names.indexOf(s.step) + 1} of ${names.length}: ${s.step}${c.name ? ` · ${c.name}` : ''}`,
    `Path: ${s.kind} · ${teaching < 0 ? 'outside the teaching path' : `teaching step ${teaching + 1} of ${c.teaching.length}`}`,
    `Title: ${s.title}`,
    ...(s.line ? [`Line: ${s.line}`] : []),
    ...(s.caption ? [`Caption: ${s.caption}`] : []),
    ...(s.picture ? [`Picture: ${s.picture}`] : []),
    ...(s.events ? [`Events: ${s.events.join(', ')}`] : []),
    ...(s.predict ? [`Prediction: ${s.predict.prompt ? `${s.predict.prompt} ` : ''}${s.predict.options.join(' / ')}; answer: ${s.predict.options[s.predict.answer]}; revealed at ${s.predict.reveal}`] : []),
    ...(s.reveals ? [`Reveals predictions from: ${s.reveals.join(', ')}`] : []),
    changed.length ? `Changed: ${changed.join('; ')}` : 'Changed: nothing in the step state',
    // What the whole scenario holds on every frame and lets events drive, so a reader of one step knows what is checked.
    ...(c.invariants ? [`Invariants checked on every frame: ${c.invariants.join('; ')}`] : []),
    ...(c.machines ?? []).flatMap((x) => [
      `Machine events: ${x.events.join(', ')} (${x.states} states from start, ${x.complete ? 'complete' : 'sampled'})`,
      ...(x.live ? [`Live at ${x.step}, from ${x.live.from}: ${x.live.states} states, ${x.live.complete ? 'complete' : 'sampled'}`] : []),
    ]),
    ...(c.predictionProblems ?? []).map((problem) => `Prediction problem: ${problem}`),
  ].join('\n');
}

/**
 * The text for `step` of the scenario. The scenario is described with only that step drawn:
 * `see` shows one step, and drawing every step cost it up to a second on the longer explainers.
 */
export async function seeStep(project: Project, v: Scenario, step?: string): Promise<string> {
  const drawings = step ?? v.trace.steps.at(-1)!.step;
  const described = await describeScenario(project.Scene, v.values, { snapshots: project.store, drawings });
  return seeText(project.Scene.meta?.id ?? 'scene', described, step);
}

/** The step's resting picture as SVG, at the frame the description draws it, heading left out as `check` draws it. */
export async function stepSvg(v: Scenario, step?: string): Promise<string> {
  const s = step == null ? v.trace.steps.at(-1)! : v.trace.steps.find((x) => x.step === step)!;
  const sink: Sink = { async frame() {} };
  const scene = await renderFrame(v.Scene, s.frame1, sink);
  return withoutHeading(scene, () => toSvgString(scene));
}

/** Print the step; with `svgOut`, also write its resting picture as SVG. */
export async function see(project: Project, v: Scenario, step: string | undefined, svgOut?: string): Promise<string> {
  const text = await seeStep(project, v, step);
  if (!svgOut) return text;
  await writeFile(svgOut, await stepSvg(v, step));
  return `${text}\nWrote ${svgOut}`;
}

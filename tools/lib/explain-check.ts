import { scriptReport } from '../../explain/script.ts';
import { claimsReport, checkClaimsMeta } from '../../explain/claims.ts';
import { restingRouteProblems } from './explain-layout.ts';
import { letteringWeight, pageSnapshot } from './lettering.ts';
import { isHeading, stagedStepsOf, pictureFingerprint } from '../../explain/stage.ts';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
import {
  MotionSink,
  InvariantSink,
  machinesOf,
  viewMismatch,
  jsonObject,
  analyzeMotion,
  SnapshotSink,
  renderAt,
  toSvgString,
  traceScene,
  renderText,
  Text,
} from '../../src/index.ts';
import { ROOT, engineAlias, sceneSlug } from './explain-project.ts';
import { caseName } from '../../explain/index.ts';
import { restingFrame, undescribed, watchedChanges } from '../../explain/trace.ts';
import { labelOf, readingLabelSize } from '../../explain/diagrams.ts';
import { closeUps, stageScale, stepLayouts, toView, viewBox, viewZoom } from '../../app/embed-closeup.ts';
import type { Box, Mobject, Scene, Sink, Step } from '../../src/index.ts';
import type { Project } from './explain-project.ts';
import { pageFaces, letteringReport, useProjectLettering } from './explain-lettering.ts';

const SWALLOW =
  'Do not catch around awaited animation/step calls in construct(): a broad catch can swallow StopScene. Catch model errors before animation.';
export function lintConstruct(source: string): string[] {
  const file = ts.createSourceFile('scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors: string[] = [];
  const named = (name: ts.PropertyName | ts.BindingName | undefined) =>
    !!name &&
    (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
      ? name.text
      : ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)
        ? name.expression.text
        : '') === 'construct';
  // `async construct() {}`, `'construct'() {}`, `['construct']() {}` and `construct = async () => {}`.
  const isConstruct = (node: ts.Node) =>
    (ts.isMethodDeclaration(node) && named(node.name)) ||
    (ts.isPropertyDeclaration(node) && named(node.name) && !!node.initializer && ts.isFunctionLike(node.initializer));
  /** Awaited in this function body: `await`, `for await`; nested functions are not awaited by the try. */
  function awaits(n: ts.Node): boolean {
    if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier)) return true;
    if (ts.isFunctionLike(n)) return false;
    return !!ts.forEachChild(n, (c) => awaits(c) || undefined);
  }
  function walk(node: ts.Node, inConstruct = false) {
    if (isConstruct(node)) inConstruct = true;
    if (inConstruct && ts.isTryStatement(node) && node.catchClause && awaits(node.tryBlock)) errors.push(SWALLOW);
    // A promise's own `.catch()` on awaited work swallows StopScene the same way.
    if (
      inConstruct &&
      ts.isAwaitExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === 'catch'
    )
      errors.push(SWALLOW);
    ts.forEachChild(node, (n) => walk(n, inConstruct));
  }
  walk(file);
  return errors;
}
/** Smallest label, in CSS pixels at a 1280-pixel stage, a reader must be able to see. */
export const MIN_PX = 14;
/** Reader CSS pixels per scene unit on a 1280-pixel stage, with the camera home. */
const STAGE_PX_PER_UNIT = 1280 / 16;
const FRAME: Box = [-8, -4.5, 8, 4.5];
/** Anything with a camera: a Scene, or a test's stand-in. Without one, the view is the whole stage. */
interface Viewed {
  familyMembers(): Mobject[];
  frame?: { box(): Box | null };
}
/** The box of the world on screen: the camera's (`scene.frame`), which the SVG viewBox shows. */
export const viewOf = (scene: Pick<Viewed, 'frame'>): Box => [...(scene.frame?.box() ?? FRAME)] as Box;
const isHome = (view: Box) => view.every((v, i) => Math.abs(v - FRAME[i]!) < 1e-6);
/**
 * A label's size as the reader sees it, in CSS pixels at a 1280-pixel stage: its size
 * in the world times the camera's zoom. A label the camera has zoomed in on reads
 * larger; one it has zoomed out from reads smaller. A view out of 16:9 is letterboxed,
 * so its tighter side sets the zoom. Null for a mobject that is not a sized label.
 * A phone close-up multiplies this again (the reader's zoom, on top).
 */
export function labelPx(m: Mobject, scene: Pick<Viewed, 'frame'>): number | null {
  const size = readingLabelSize(m);
  return size == null ? null : size * STAGE_PX_PER_UNIT * viewZoom(viewOf(scene));
}
/** `box` cut down to every clip around `m`: the part of it that is drawn (a diagram clips to its frame). */
function clipped(m: Mobject, box: Box): Box {
  const out: Box = [...box];
  for (let a: Mobject | null = m; a; a = a.parent)
    if (a.clipBox) {
      out[0] = Math.max(out[0], a.clipBox[0]);
      out[1] = Math.max(out[1], a.clipBox[1]);
      out[2] = Math.min(out[2], a.clipBox[2]);
      out[3] = Math.min(out[3], a.clipBox[3]);
    }
  return out;
}
/** Fully drawn and inside the viewport: a label a reader can see at its size. */
const readable = (m: Mobject, box: Box | null, viewport: Box) =>
  !!box &&
  box[0] >= viewport[0] - 1e-5 &&
  box[2] <= viewport[2] + 1e-5 &&
  box[1] >= viewport[1] - 1e-5 &&
  box[3] <= viewport[3] + 1e-5 &&
  m.style.opacity >= 0.95 &&
  (m.style.drawFraction ?? 1) >= 0.95;

/**
 * Text a reader would see colliding, including labels imported from diagrams.
 * Upstream placement is not an exemption from the reader's visible geometry.
 *
 * With the camera away from home, text is judged in its view as well: native text
 * or the heading across the view's edge is cut off; text wholly outside the view
 * is off screen, and collides with nothing a reader sees.
 */
export function restingTextProblems(scene: Viewed): string[] {
  const view = viewOf(scene),
    zoomed = !isHome(view);
  const texts: { m: Mobject; box: Box; native: boolean; text: string }[] = [];
  const problems: string[] = [];
  const chromeBoxes: { box: Box; text: string }[] = [];
  const visible = (m: Mobject) => {
    for (let a: Mobject | null = m; a; a = a.parent) if ((a.style.opacity ?? 1) < 0.5) return false;
    // Text is drawn by the fill (and any stroke) of its paths: with neither it shows nothing.
    // A group's own paint is never drawn, so look at the paths it holds.
    const painted = (x: Mobject) =>
      (x.style.opacity ?? 1) >= 0.5 &&
      ((!!x.style.fill && x.style.fill !== 'none' && (x.style.fillOpacity ?? 1) >= 0.5) ||
        (!!x.style.stroke &&
          x.style.stroke !== 'none' &&
          (x.style.strokeOpacity ?? 1) >= 0.5 &&
          (x.style.strokeWidth ?? 0) > 0));
    return m.family().some((x) => !x.children.length && painted(x));
  };
  const seen = new Set<Mobject>();
  for (const m of scene.familyMembers()) {
    // A mobject listed twice (added on its own and inside a group) is still one text.
    if (seen.has(m)) continue;
    seen.add(m);
    const text = (m as unknown as { text?: unknown }).text;
    if (typeof text !== 'string' || !text.trim() || !visible(m)) continue;
    let nested = false;
    for (let a = m.parent; a; a = a.parent)
      if (typeof (a as unknown as { text?: unknown }).text === 'string') nested = true;
    if (nested) continue;
    const drawn = m.box();
    if (!drawn) continue;
    const box = clipped(m, drawn);
    if (!(box[2] > box[0] && box[3] > box[1])) continue;
    const shown = box[0] < view[2] && box[2] > view[0] && box[1] < view[3] && box[3] > view[1];
    if (zoomed && !shown) continue; // off screen while the camera looks elsewhere
    const native = m instanceof Text;
    // The heading, and its number and line: stage furniture, kept clear of the picture by the stage itself.
    const heading = isHeading(m);
    if (zoomed && (native || heading) && (box[0] < view[0] || box[1] < view[1] || box[2] > view[2] || box[3] > view[3]))
      problems.push(`"${text}" is cut off by the frame`);
    if (!heading) texts.push({ m, box, native, text });
    else chromeBoxes.push({ box, text });
  }
  // The heading's line takes room under the title: content text must stay clear of all of it.
  for (const t of texts)
    for (const c of chromeBoxes)
      if (t.box[0] < c.box[2] && t.box[2] > c.box[0] && t.box[1] < c.box[3] && t.box[3] > c.box[1])
        problems.push(`"${t.text}" runs into the heading's "${c.text}"`);
  for (const t of texts)
    if (t.native && (t.box[0] < FRAME[0] || t.box[1] < FRAME[1] || t.box[2] > FRAME[2] || t.box[3] > FRAME[3]))
      problems.push(`"${t.text}" crosses the stage edge`);
  const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!,
        b = texts[j]!;
      const overlap: Box = [
        Math.max(a.box[0], b.box[0]),
        Math.max(a.box[1], b.box[1]),
        Math.min(a.box[2], b.box[2]),
        Math.min(a.box[3], b.box[3]),
      ];
      if (overlap[2] <= overlap[0] || overlap[3] <= overlap[1]) continue;
      if (area(overlap) > 0.12 * Math.min(area(a.box), area(b.box))) problems.push(`"${a.text}" overlaps "${b.text}"`);
    }
  return problems;
}

/**
 * Conservative preflight at the narrow stage's minimum height (16:9). Actual height
 * depends on the served page's headings and viewport; only browser review measures it.
 * Do not duplicate the player's CSS/DOM height calculation here or assume its 4:5 maximum.
 */
const PHONE_PAGE = 390,
  PHONE_W = PHONE_PAGE - 32,
  PHONE_H = PHONE_W * 9 / 16;
/** One label across a case: its largest size at 1280 px, and in the phone's close-ups at rest. */
interface LabelSizes {
  text: string;
  px: number;
  /** Largest size in a resting picture's close-up on the phone, in CSS px; 0 if never at rest and readable. */
  phone: number;
  /** Whole inside one of a resting picture's close-ups (where the step opens, or its tour), so no panning finds it. */
  inView: boolean;
  /** The resting step where `phone` was measured: where a small label is, for the report. */
  phoneStep?: string;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
/**
 * Desktop label sizes and phone estimates at the minimum stage geometry.
 * Actual phone sizes and visible coverage belong to served-page review.
 */
function legibilityReport(records: LabelSizes[]) {
  const sizes = records.filter((r) => r.px > 0),
    min = sizes.length ? Math.min(...sizes.map((r) => r.px)) : null;
  const atRest = sizes.filter((r) => r.phone > 0),
    phoneMin = atRest.length ? Math.min(...atRest.map((r) => r.phone)) : null;
  const whole = stageScale(PHONE_W, PHONE_H).s / STAGE_PX_PER_UNIT;
  return {
    phoneEstimate: { stageWidth: PHONE_W, stageHeight: PHONE_H, geometry: 'minimum-stage' },
    minLabelPx1280: min == null ? null : round1(min),
    minLabelPx390: phoneMin == null ? null : round1(phoneMin),
    labelsUnder12PxAt390: atRest.filter((r) => round1(r.phone) < 12).length,
    // Which they are, smallest first: each label's words, its phone size and its step.
    smallLabelsAt390: atRest
      .filter((r) => round1(r.phone) < 12)
      .sort((a, b) => a.phone - b.phone)
      .map((r) => ({ text: r.text, px: round1(r.phone), step: r.phoneStep ?? '' })),
    // Labels no close-up shows whole, at rest: the reader pans to them (at the same size).
    labelsOutsideCloseUpsAt390: atRest.filter((r) => !r.inView).length,
    minLabelPx390WholeStage: min == null ? null : round1(min * whole),
    labels: sizes.length,
  };
}

// ---- the checks' sinks --------------------------------------------------
// `rayner check` plays each case once and hands every frame to these, through FanSink, as
// InvariantSink and MotionSink are handed it. Each reads the scene and keeps what its check
// needs; a scene's `mobjects` changed to read a frame are put back before the next sink runs.

/** Hands each frame, and each step's beginning and end, to every sink in turn. */
export class FanSink implements Sink {
  readonly sinks: readonly Sink[];
  constructor(sinks: readonly Sink[]) { this.sinks = sinks; }
  async frame(scene: Scene, dt: number): Promise<void> { for (const s of this.sinks) await s.frame(scene, dt); }
  async stepBegin(scene: Scene, step: Step): Promise<void> { for (const s of this.sinks) await s.stepBegin?.(scene, step); }
  async stepEnd(scene: Scene, step: Step): Promise<void> { for (const s of this.sinks) await s.stepEnd?.(scene, step); }
}

/** The caption hold: a step whose picture changes after its hold begins is `moved`. */
export class HoldSink implements Sink {
  readonly holds: readonly { step: string; from: number; to: number }[];
  readonly held = new Map<string, string>();
  readonly moved = new Set<string>();
  constructor(holds: readonly { step: string; from: number; to: number }[]) { this.holds = holds; }
  async frame(scene: Scene, dt: number): Promise<void> {
    const hold = dt ? this.holds.find((h) => scene.frameCount >= h.from && scene.frameCount <= h.to) : undefined;
    if (!hold) return;
    const svg = toSvgString(scene);
    if (scene.frameCount === hold.from) this.held.set(hold.step, svg);
    else if (svg !== this.held.get(hold.step)) this.moved.add(hold.step);
  }
}

/** The played SVG of chosen frames, for comparison with what a seek renders there. */
export class FrameCaptureSink implements Sink {
  readonly targets: ReadonlySet<number>;
  readonly frames = new Map<number, string>();
  constructor(targets: ReadonlySet<number>) { this.targets = targets; }
  async frame(scene: Scene): Promise<void> {
    if (this.targets.has(scene.frameCount)) this.frames.set(scene.frameCount, toSvgString(scene));
  }
}

/** Each step's resting picture: its SVG without the heading, its text drawing, and its text and route collisions. */
export class RestingSink implements Sink {
  readonly completed: ReadonlySet<number>;
  readonly resting = new Map<number, string>();
  readonly restingText = new Map<number, string>();
  readonly collisions: string[] = [];
  constructor(completed: ReadonlySet<number>) { this.completed = completed; }
  async frame(scene: Scene): Promise<void> {
    if (!this.completed.has(scene.frameCount)) return;
    // The resting picture of a step, without the heading (number, title, line) that names it.
    const all = scene.mobjects;
    scene.mobjects = all.filter((m) => !isHeading(m));
    this.resting.set(scene.frameCount, toSvgString(scene));
    scene.mobjects = all;
    this.restingText.set(scene.frameCount, renderText(scene));
    this.collisions.push(
      ...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map((p) => `${scene.currentStep?.name}: ${p}`),
    );
  }
}

/**
 * Every label's largest readable size: at 1280 px in any frame, and on the phone in each
 * resting frame's close-ups. Native labels are kept by object, so a small label is not
 * excused by a larger one with the same words; imported labels by their keyed owner.
 */
export class LegibilitySink implements Sink {
  readonly labels = new Map<Mobject, LabelSizes>();
  readonly staticLabels = new Map<string, LabelSizes>();
  readonly completedFrames: ReadonlySet<number>;
  readonly phoneViews: ReadonlyMap<number, { k: number; views: { k: number; box: Box }[] }>;
  readonly stepAt: ReadonlyMap<number, string>;
  readonly phoneUnit: number;
  constructor(
    completedFrames: ReadonlySet<number>,
    phoneViews: ReadonlyMap<number, { k: number; views: { k: number; box: Box }[] }>,
    stepAt: ReadonlyMap<number, string>,
    phoneUnit: number,
  ) {
    this.completedFrames = completedFrames;
    this.phoneViews = phoneViews;
    this.stepAt = stepAt;
    this.phoneUnit = phoneUnit;
  }

  /**
   * Record a label readable in this frame: at 1280 px always, and on the phone when the
   * frame is a resting one. `px` is already on screen (world size × the author's camera
   * zoom); the phone's close-up is the reader's zoom over that view, so the two multiply.
   * `box` is in the camera's view units, where close-ups are worked out.
   *
   * A picture label no close-up shows is measured at the opening's zoom, where a reader
   * panning to it finds it. The stage's heading (`chrome`) is not measured on the phone at
   * all: a narrow stage draws its pictures without it (ReaderSink in app/embed-zoom.ts) and
   * the player sets the step's number, title and line as page text under the stepper row.
   * It is still measured at 1280 px, where the stage draws it.
   */
  private seen(record: LabelSizes, px: number, box: Box | null, frame: number, chrome = false): void {
    record.px = Math.max(record.px, px);
    const close = this.phoneViews.get(frame);
    if (!close) return;
    const inside = (v: Box) =>
      !!box && box[0] >= v[0] - 1e-6 && box[2] <= v[2] + 1e-6 && box[1] >= v[1] - 1e-6 && box[3] <= v[3] + 1e-6;
    if (chrome) return;
    const complete = close.views.filter((v) => inside(v.box));
    // The opening can frame a comparison at a smaller scale than its detail
    // stops. Measure each label where the tour actually shows it whole.
    const k = complete.length ? Math.max(...complete.map((v) => v.k)) : close.k;
    const size = (px / STAGE_PX_PER_UNIT) * this.phoneUnit * k;
    if (size > record.phone) {
      record.phone = size;
      record.phoneStep = this.stepAt.get(frame);
    }
    if (complete.length) record.inView = true;
  }

  async frame(scene: Scene): Promise<void> {
    // Sizes on screen: world size times the camera's zoom, inside the camera's view
    // cut by every clip; boxes for the phone's close-ups in the view's own units.
    const view = viewOf(scene);
    const shown = (b: Box | null) => (b ? toView(b, view) : null);
    const completed = this.completedFrames.has(scene.frameCount);
    for (const m of scene.familyMembers()) {
      const label = labelOf(m);
      if (!label?.text.trim()) continue;
      const { text } = label;
      const viewport = clipped(m, view),
        px = labelPx(m, scene)!;
      // Imported semantic labels must be readable in a completed step, not
      // merely flash past at a readable size halfway through a camera move.
      if (!(m instanceof Text)) {
        let owner = m.parent;
        while (owner && !owner.key) owner = owner.parent;
        const key = `${owner?.key ?? text}@${label.fontSize.toPrecision(5)}`;
        if (!this.staticLabels.has(key)) this.staticLabels.set(key, { text, px: 0, phone: 0, inView: false });
        const record = this.staticLabels.get(key)!;
        if (completed && readable(m, (owner ?? m).box(), viewport)) this.seen(record, px, shown(m.box()), scene.frameCount);
      } else {
        if (!this.labels.has(m)) this.labels.set(m, { text, px: 0, phone: 0, inView: false });
        // A camera gliding past does not make a label read: between completed frames a
        // label counts at no more than its size with the camera home.
        const credited = completed ? px : Math.min(px, readingLabelSize(m)! * STAGE_PX_PER_UNIT);
        if (readable(m, m.box(), viewport)) this.seen(this.labels.get(m)!, credited, shown(m.box()), scene.frameCount, isHeading(m));
      }
    }
  }
}

/**
 * Every state a scene's machines (src/machine.ts) reach, breadth first from each one's start,
 * redrawn after the run and checked as a resting picture is: no text collisions or routes
 * over labels, every label it shows at least MIN_PX at a 1280 px stage (measured by the same
 * LegibilitySink a run uses), a description, a picture that follows the state (viewMismatch,
 * for views of the scene's state), and a description no other reachable state shares, so a
 * reader, or a screen reader, can tell them apart. A problem is named by the shortest events
 * reaching it. Phone close-ups are not worked out for explored states.
 */
export async function exploreMachines(scene: Scene): Promise<{ events: string[]; states: number; sampled: boolean; problems: string[] }[]> {
  const explored = [];
  for (const machine of machinesOf(scene)) {
    const problems: string[] = [];
    const reached = machine.reachable();
    const said = new Map<string, string>();
    for (const { state, path } of reached) {
      const at = path.length ? `after ${path.join(', ')}` : 'at the start';
      scene.state = jsonObject(state, 'machine state');
      for (const view of machine.spec.views) {
        view.rebuild();
        const mismatch = viewMismatch(view, scene.state);
        if (mismatch) problems.push(`${at}: ${mismatch}`);
      }
      problems.push(...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map((p) => `${at}: ${p}`));
      // Each label this state shows, at the size a 1280 px stage draws it; one not shown (outside
      // the view, clipped or transparent) is never measured and stays at 0.
      const sizes = new LegibilitySink(new Set([scene.frameCount]), new Map(), new Map(), 0);
      await sizes.frame(scene);
      for (const r of [...sizes.labels.values(), ...sizes.staticLabels.values()])
        if (r.px > 0 && r.px < MIN_PX) problems.push(`${at}: “${r.text}” is ${r.px.toFixed(1)} px at a 1280 px stage, under ${MIN_PX}`);
      const picture = scene.describe().picture as { entries?: { what?: string; items?: string[] }[] } | undefined;
      const words = JSON.stringify(picture?.entries ?? []);
      if (!picture?.entries?.some((e) => e.what?.trim())) problems.push(`${at}: the picture has no description`);
      else if (said.has(words)) problems.push(`${at}: the picture is described exactly as ${said.get(words)}, a different state`);
      else said.set(words, at);
      problems.push(...transitionProblems(scene, machine, state, path));
    }
    explored.push({ events: [...machine.spec.events], states: reached.length, sampled: reached.length >= machine.spec.limit, problems });
  }
  return explored;
}

/**
 * Every step `stage.steps` presented, redrawn after the run from the state its trace recorded and
 * compared with the picture drawn then (text and every part's box). A step whose draw reads
 * anything but its own state, such as a variable a later step changed, draws something else now
 * and is named here.
 */
export function redrawStagedSteps(scene: Scene, trace: { steps: readonly { step: string; after?: Record<string, unknown> }[] }): { redrawn: number; problems: string[] } {
  const problems: string[] = [];
  const records = stagedStepsOf(scene);
  for (const record of records) {
    const traced = trace.steps.find((s) => s.step === record.step);
    if (!traced?.after) { problems.push(`step "${record.step}": no recorded state to redraw it from`); continue; }
    if (pictureFingerprint(record.redraw(traced.after)) !== record.drawn)
      problems.push(`step "${record.step}": its picture differs when drawn again from the state it recorded; its draw reads something other than ${record.reader ? 'state.reader' : 'its state'}`);
  }
  return { redrawn: records.length, problems };
}

/**
 * Each authored transition from `state`, played through on the explored scene: every invariant
 * is checked a quarter, half, three quarters and all the way through, and when it ends the views
 * must show the pictures of the state it reaches, as rendered, so the landing sync moves nothing.
 */
/**
 * A rendered frame's marks in any stacking order: a part a transition brought in is added last,
 * so it may sit above parts it sits below in the target picture; the landing puts it back a frame
 * later. Every mark must still be there, drawn the same.
 */
const marksOf = (svg: string) => svg.split('/>').sort().join('/>');

function transitionProblems(scene: Scene, machine: ReturnType<typeof machinesOf>[number], state: object, path: readonly string[]): string[] {
  const problems: string[] = [];
  const { views, transition, events } = machine.spec;
  for (const event of events) {
    const authored = transition?.[event];
    const after = authored && machine.spec.next(state, event);
    if (!authored || after === undefined) continue;
    const at = `${path.length ? `after ${path.join(', ')}, ` : ''}${event}`;
    // What the reader should see when it ends: the views rebuilt for `after` where they stand
    // now (a rebuilt picture keeps its place), before the transition can move them.
    scene.state = jsonObject(after, 'machine state');
    for (const v of views) v.rebuild();
    const expected = marksOf(toSvgString(scene));
    scene.state = jsonObject(state, 'machine state');
    for (const v of views) v.rebuild();
    const motion = authored({ event, before: state, after, views, targets: views.map((v) => v.placed(after as Record<string, unknown>)) });
    // As in a play: the event's SetState has already moved the scene to `after` when its transition
    // begins, so a sync inside the transition draws the state reached.
    scene.state = jsonObject(after, 'machine state');
    scene.beginAnimations([motion]);
    for (const alpha of [0.25, 0.5, 0.75, 1]) {
      motion.interpolate(motion.rateFunc(alpha));
      for (const [name, check] of scene.invariants) {
        const said = check(scene);
        if (typeof said === 'string') problems.push(`${at}: the invariant "${name}" fails ${alpha * 100}% through the transition: ${said}`);
      }
    }
    motion.finish();
    motion.cleanUpFromScene(scene);
    // Compared as rendered marks, since a morph lands glyphs without retyping a Text. A transition that
    // ends elsewhere would leave the views there: their next rebuild keeps the place it left them.
    if (marksOf(toSvgString(scene)) !== expected) problems.push(`${at}: the transition ends somewhere other than the picture of the state it reaches`);
    scene.state = jsonObject(after, 'machine state');
    for (const v of views) v.rebuild();
  }
  return problems;
}

/** Run every check on every case; write the report to `out`/report.json and return it. */
export async function checkProject(project: Project, out: string): Promise<Record<string, unknown>> {
  const lint = lintConstruct(await readFile(project.file, 'utf8'));
  assert.deepEqual(lint, [], lint.join('\n'));
  await mkdir(out, { recursive: true });
  await useProjectLettering(project);
  const variants = [];
  // The lettering the page carries, once for every case: the bare runtime below runs it
  const shipped = project.outlineLettering ? JSON.stringify(await pageSnapshot(project.outlineLettering)) : '';
  for (const v of project.variants) {
    const where = `in ${caseName(project.Scene, v.values) || 'the scene'}`;
    // The scene's own invariants of the picture (Scene.addInvariant), checked on every frame of this full run.
    const invariants = new InvariantSink();
    const motion = new MotionSink();
    // Each played frame at two points per step, compared below with what a seek renders there.
    const capture = new FrameCaptureSink(
      new Set(
        v.trace.steps.flatMap((s) => [
          s.frame0 + Math.max(1, Math.floor(((s.frame1 ?? s.frame0 + 1) - s.frame0) / 2)),
          Math.max(s.frame0 + 1, (s.frame1 ?? s.frame0 + 1) - 1),
        ]),
      ),
    );
    const completedFrames = new Set(v.trace.steps.map(restingFrame));
    // Each resting frame's close-ups on the phone, worked out as the player works them out.
    const layouts = await stepLayouts(v.Scene);
    const legibility = new LegibilitySink(
      completedFrames,
      new Map(
        v.trace.steps.map((s) => {
          const tour = closeUps(layouts.get(s.step), PHONE_W, PHONE_H);
          return [
            restingFrame(s),
            { k: tour[0]!.k, views: tour.map((z) => ({ k: z.k, box: viewBox(z, PHONE_W, PHONE_H) })) },
          ] as const;
        }),
      ),
      new Map(v.trace.steps.map((s) => [restingFrame(s), s.step] as const)),
      stageScale(PHONE_W, PHONE_H).s,
    );
    const restingSink = new RestingSink(completedFrames);
    // The caption hold: the player stops where it begins and the film holds the picture there, so
    // nothing may change after it. A play lands after its last frame is drawn (a morph gets its
    // paths' own structure back), so the first held frame is the resting picture, as in render.
    const holdSink = new HoldSink(
      v.trace.steps.flatMap((s) =>
        s.hold == null
          ? []
          : [{ step: s.step, from: Math.round(s.hold * v.trace.fps) + 1, to: s.frame1 ?? v.trace.frames }],
      ),
    );
    // One full run feeds every check, each a sink of its own, in this order.
    const ran = await new v.Scene(new FanSink([invariants, motion, holdSink, capture, restingSink, legibility])).run();
    const { frames } = capture,
      { moved } = holdSink,
      { resting, restingText, collisions } = restingSink,
      { labels, staticLabels } = legibility;
    const events = analyzeMotion(motion);
    assert.equal(events.length, 0, `Motion failures ${where}: ${JSON.stringify(events.slice(0, 8))}`);
    assert.deepEqual(
      invariants.failures.slice(0, 5),
      [],
      `Invariants fail ${where} (${invariants.failures.length} frames; the first five)`,
    );
    assert.deepEqual(
      invariants.vacuous(),
      [],
      `Invariants never held ${where}: each ran but found nothing to check on every frame (a key it reads may be misspelt)`,
    );
    const machines = await exploreMachines(ran);
    const staged = redrawStagedSteps(ran, v.trace);
    assert.deepEqual(
      staged.problems.slice(0, 5),
      [],
      `Staged steps ${where}: a step's picture must be a function of the state it records (the first five)`,
    );
    assert.deepEqual(
      machines.flatMap((s) => s.problems).slice(0, 5),
      [],
      `Machines ${where}: a state the events reach fails (each named by its shortest events; the first five)`,
    );
    assert.deepEqual(
      [...moved],
      [],
      `The picture changes after the caption hold begins, where the player stops; finish every change before the step's last play() ends ${where}`,
    );
    for (const [frame, svg] of frames) {
      const sink = new SnapshotSink();
      await renderAt(v.Scene, frame / v.trace.fps, sink);
      assert.equal(sink.svg, svg, `Seek mismatch at frame ${frame} ${where}`);
    }
    const skipped = await traceScene(v.Scene, { skipUntil: 0 });
    assert.deepEqual(skipped, v.trace, `Skipped and played traces differ ${where}`);
    const still = v.trace.steps.filter(
      (step, i) => i > 0 && resting.get(restingFrame(step)) === resting.get(restingFrame(v.trace.steps[i - 1]!)),
    );
    assert.deepEqual(
      still.map((s) => s.step),
      [],
      `Each step must change the picture; these end exactly as the step before ${where}`,
    );
    assert.deepEqual([...new Set(collisions)], [], `Resting frames have colliding or cut-off text ${where}`);
    const staticSmall = [...staticLabels.values()]
      .filter((label) => label.px < MIN_PX)
      .map(({ text, px }) => ({ text, px }));
    assert.deepEqual(
      staticSmall,
      [],
      `Imported labels need a readable completed-step view at 1280px ${where}: ${JSON.stringify(staticSmall)}`,
    );
    const small = [...labels.values()].filter((label) => label.px < MIN_PX).map(({ text, px }) => ({ text, px }));
    assert.deepEqual(small, [], `Labels never reach ${MIN_PX}px at 1280px stage ${where}: ${JSON.stringify(small)}`);
    const blank = v.trace.steps.flatMap((s) => undescribed(s.after).map((m) => `${s.step}: ${m}`));
    assert.deepEqual(blank, [], `Every drawing needs words for readers who cannot see it ${where}`);
    // A lettered explainer's bare runtime puts its faces in place first, as its page does.
    const lettered = project.lettering
      ? [
          `import{useLettering}from ${JSON.stringify(join(ROOT, 'src/lettering.ts'))};`,
          `await useLettering(${JSON.stringify(pageFaces(project.lettering))});`,
        ]
      : ['', ''];
    const contents = `${project.outlineLettering ? `import{bindLettering}from ${JSON.stringify(join(ROOT, 'src/lettering-outlines.ts'))};` : ''}import * as author from ${JSON.stringify(project.file)};import{bindSnapshots,withSettings}from ${JSON.stringify(join(ROOT, 'explain/index.ts'))};import{Scene,NullSink,toSvgString}from ${JSON.stringify(join(ROOT, 'src/index.ts'))};${lettered[0]}const Source=author[${JSON.stringify(project.exportName)}];export async function run(){${lettered[1]}const Lettered=${project.outlineLettering ? `bindLettering(Source,${shipped})` : 'Source'};const C=withSettings(bindSnapshots(Lettered,${JSON.stringify(project.store)}),${JSON.stringify(v.values)});const s=await new C(new NullSink(),{skipUntil:Infinity}).run();return{steps:s.steps.map(s=>s.name),state:s.describe(),svg:toSvgString(s)}}`;
    const b = await build({
      stdin: { contents, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      globalName: 'bare',
      platform: 'neutral',
      target: 'es2022',
      write: false,
      plugins: [engineAlias(false, !!project.outlineLettering)],
      logLevel: 'silent',
    });
    const context = vm.createContext({ TextEncoder, TextDecoder, atob });
    vm.runInContext(b.outputFiles[0]!.text + ';globalThis.result=bare.run()', context);
    const result = await context.result;
    const bare = `The bare runtime (no DOM, no Node) disagrees with the trace ${where}`;
    assert.deepEqual(
      JSON.parse(JSON.stringify(result.steps)),
      v.trace.steps.map((s) => s.step),
      bare,
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result.state)), v.trace.steps.at(-1)!.after, bare);
    assert.ok(result.svg.includes('<path'), bare);
    const script = scriptReport(project.Scene.meta, v.trace.steps);
    assert.deepEqual(script.problems, [], `Script ${where}: ${script.problems.join('; ')}`);
    variants.push({
      settings: v.values,
      trace: v.trace,
      steps: v.trace.steps.length,
      frames: motion.frames.length,
      seekFrames: frames.size,
      motionEvents: events.length,
      // Each declared invariant and the frames it held on: an invariant that held on no frame is not evidence.
      invariants: Object.fromEntries(invariants.held),
      // Each machine's events and how many states they reach, every one drawn and checked.
      ...(machines.length ? { machines: machines.map(({ events, states, sampled }) => ({ events, states, ...(sampled ? { sampled } : {}) })) } : {}),
      // How many stage.steps pictures were redrawn from their recorded state and matched.
      ...(staged.redrawn ? { redrawn: staged.redrawn } : {}),
      labels: labels.size,
      completedStepLabels: staticLabels.size,
      // What a reader sees: the labels at 1280 px, and on a 390 px phone in each step's close-up.
      legibility: legibilityReport([...labels.values(), ...staticLabels.values()]),
      // The script gate (explain/script.ts): a declared meta.answer stated by some step (where, reported), and how many
      // check questions the page asks. Undeclared parts are reported as missing.
      script,
      // Sentences with scope words, the declared claim (meta.claims) backing each, and the code names
      // reaching the steps' words (explain/claims.ts). Reported, not gated; see claimProblems below.
      claims: claimsReport(project.Scene.meta, v.trace.steps),
      // What each step changed of the state the author watches (meta.watch), as readers see it, and
      // the watched keys skipped because their value cannot be said briefly. Reported, not gated.
      ...(project.Scene.meta?.watch
        ? {
            watch: v.trace.steps.map((s) => {
              const unformatted: string[] = [];
              const changes = watchedChanges(s, project.Scene.meta!.watch, project.Scene.meta!.lang, unformatted);
              return { step: s.step, changes, unformatted };
            }),
          }
        : {}),
      // Each step's resting frame as text, so an author can read it without a browser.
      restingFrames: Object.fromEntries(
        v.trace.steps.map((step) => [step.step, restingText.get(restingFrame(step)) ?? '']),
      ),
    });
  }
  // A declared claim must be stated by some case and held by a test that is there.
  const claimProblems = await declaredClaimProblems(
    checkClaimsMeta(project.Scene.meta),
    variants.flatMap((v) => v.claims.stated),
  );
  assert.deepEqual(claimProblems, [], `Claims: ${claimProblems.join('; ')}`);
  const report = {
    scene: sceneSlug(project),
    variants,
    diagrams: Object.keys(project.store).length,
    replayedEdits: project.edits,
    ...(project.outlineLettering ? { lettering: await letteringWeight(project.outlineLettering) } : {}),
    // What the requested lettering adds to the page; only an explainer that asked has it.
    ...(project.lettering ? { lettering: letteringReport(project.lettering) } : {}),
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

/**
 * What is wrong with a scene's declared claims: one no case states, or one whose test file is not
 * there or holds no test whose name contains the given part.
 */
export async function declaredClaimProblems(claims: readonly { says: string; test?: string; shown?: true }[], stated: readonly string[], directory = process.cwd()): Promise<string[]> {
  const problems: string[] = [];
  const files = new Map<string, string[] | null>();
  for (const c of claims) {
    if (!stated.includes(c.says)) problems.push(`no step states the claim "${c.says}"`);
    if (!c.test) continue;
    const at = c.test.indexOf(': '),
      file = c.test.slice(0, at),
      name = c.test.slice(at + 2);
    if (!files.has(file)) {
      const source = await readFile(resolve(directory, file), 'utf8').catch(() => null);
      files.set(file, source === null ? null : testNames(source));
    }
    const names = files.get(file);
    if (names == null) problems.push(`the claim "${c.says}" names ${file}, which is not there`);
    else if (!names.some((test) => test.includes(name))) problems.push(`the claim "${c.says}" names a test in ${file} called "${name}", and there is none`);
  }
  return problems;
}

/** Evidence-link lint: static node:test declarations, not comments or arbitrary strings.
 * This neither runs a test nor proves that its assertions support the sentence.
 */
function testNames(source: string): string[] {
  const file = ts.createSourceFile('claim.test.ts', source, ts.ScriptTarget.Latest, true);
  const functions = new Set<string>(), suites = new Set<string>(), namespaces = new Set<string>(), names: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== 'node:test') continue;
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    if (clause?.name) functions.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (['test', 'it'].includes(imported)) functions.add(specifier.name.text);
      if (['describe', 'suite'].includes(imported)) suites.add(specifier.name.text);
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      let call = node.expression;
      let modifier = '';
      if (ts.isPropertyAccessExpression(call) && ['skip', 'todo', 'only'].includes(call.name.text)) {
        modifier = call.name.text;
        call = call.expression;
      }
      const [name, options] = node.arguments;
      const isTest = ts.isIdentifier(call) ? functions.has(call.text)
        : ts.isPropertyAccessExpression(call) && ts.isIdentifier(call.expression) && namespaces.has(call.expression.text) && ['test', 'it'].includes(call.name.text);
      const isSuite = ts.isIdentifier(call) ? suites.has(call.text)
        : ts.isPropertyAccessExpression(call) && ts.isIdentifier(call.expression) && namespaces.has(call.expression.text) && ['describe', 'suite'].includes(call.name.text);
      const skipped = options && ts.isObjectLiteralExpression(options) && options.properties.some((property) =>
        ts.isPropertyAssignment(property) && ['skip', 'todo'].includes(property.name.getText(file).replace(/['"]/g, '')) && property.initializer.kind !== ts.SyntaxKind.FalseKeyword);
      if ((isTest || isSuite) && (skipped || modifier === 'skip' || modifier === 'todo')) return;
      const callback = node.arguments.at(-1);
      if (isTest && callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && name) {
        if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) names.push(name.text);
        // A title built per case, as in test(`${entry.id}: …`): only its fixed text can match, so
        // each substitution becomes a character no claim's test name contains.
        else if (ts.isTemplateExpression(name)) names.push(name.head.text + name.templateSpans.map((span) => '\u0000' + span.literal.text).join(''));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

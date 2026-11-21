import { scriptReport, predictionsOf, claimsReport, checkClaimsMeta, captionLookProblems, describesItself, seenSource, isHeading, isFurniture, withoutHeading, undescribed, watchedReadings, diagramsOn, restingDrawing, LiveSink, liveMachine, runLive, labelOf, readingLabelSize, isView, machinesOf, observedValue, viewMismatch, scenarioName, scriptOf, viewInput } from '../../explain/internal.ts';
import type { View } from '../../explain/index.ts';
import type { Settings } from '../../explain/index.ts';
import { renderElements } from '../../src/internal.ts';
import { serializeElement, canonicalJson, zoomOf, contains, intersect, unionBoxes, nonempty, overlaps, paints, atHome, viewOf, FRAME, STAGE_BOX, UNITS, MotionSink, analyzeMotion, SnapshotSink, traceRun, KeyedMotionSink, keyedMotionLine } from '../../src/internal.ts';
import type { LiveExplore } from '../../explain/internal.ts';
import { liveSteps, logStart, machineSteps } from '../../explain/internal.ts';
import { restingRouteProblems } from './explain-layout.ts';
import { MachineMotionCheck } from './explain-motion-rules.ts';
import { sceneEntry } from './scene-entry.ts';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { browserFonts } from './explain-browser-fonts.ts';
import { showsDiagrams, withoutDiagramCode } from './explain-diagram-code.ts';
import ts from 'typescript';
import { Text, Rectangle } from '../../src/index.ts';
import { renderFrame, toSvgString } from '../../src/index.ts';
import { InvariantSink, jsonObject } from '../../src/internal.ts';
import { ROOT, engineAlias, importAuthored, sceneSlug } from './explain-project.ts';
import { checkedAgainstFiles, compareAnswers, placeholderTodo, runModelTest } from './explain-evidence.ts';
import { READ_PX, closeUps, stageScale, stepLayouts, toView, viewBox } from '../../app/embed-closeup.ts';
import type { Box, EndedStep, Mobject, Scene, SceneClass, Sink, Step } from '../../src/index.ts';
import type { Project } from './explain-project.ts';
import { letteringReport, useProjectLettering } from './explain-lettering.ts';
import { MIN_PX, PHONE_VIEWPORT, STAGE_PX_PER_UNIT } from './review-sizes.ts';

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
export { MIN_PX };
/** Anything with a camera: a Scene, or a test's stand-in. Without one, the view is the whole stage. */
interface Viewed {
  familyMembers(): Mobject[];
  frame?: { box(): Box | null };
  colors?: {paper: string};
}
/**
 * A label's size as the reader sees it, in CSS pixels at a 1280-pixel stage: its size
 * in the world times the camera's zoom. A label the camera has zoomed in on reads
 * larger; one it has zoomed out from reads smaller. A view out of 16:9 is letterboxed,
 * so its tighter side sets the zoom. Null for a mobject that is not a sized label.
 * A phone close-up multiplies this again (the reader's zoom, on top).
 */
export function labelPx(m: Mobject, scene: Pick<Viewed, 'frame'>): number | null {
  const size = readingLabelSize(m);
  return size == null ? null : size * STAGE_PX_PER_UNIT * zoomOf(viewOf(scene));
}
/**
 * `box` cut down to every clip around `m`: the part of it that is drawn (a diagram clips
 * to its frame); null when nothing of it is.
 */
function clipped(m: Mobject, box: Box): Box | null {
  let out: Box | null = nonempty(box) ? [...box] : null;
  for (let a: Mobject | null = m; a && out; a = a.parent) if (a.clipBox) out = intersect(out, a.clipBox);
  return out;
}
/** Fully drawn and inside the viewport: a label a reader can see at its size. */
const readable = (m: Mobject, box: Box | null, viewport: Box | null) =>
  !!box &&
  !!viewport &&
  contains(viewport, box, 1e-5) &&
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
    zoomed = !atHome(view);
  const texts: { m: Mobject; box: Box; native: boolean; text: string }[] = [];
  const problems: string[] = [];
  const chromeBoxes: { box: Box; text: string }[] = [];
  const visible = (m: Mobject) => {
    for (let a: Mobject | null = m; a; a = a.parent) if ((a.style.opacity ?? 1) < 0.5) return false;
    // Text is drawn by the fill (and any stroke) of its paths: with neither it shows nothing.
    // A group's own paint is never drawn, so look at the paths it holds. Legible, not merely present: half opacity at least.
    return m.family().some((x) => !x.children.length && (x.style.opacity ?? 1) >= 0.5 && paints(x.style, { min: 0.5 }));
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
    if (!box) continue;
    const shown = overlaps(box, view, { touching: false });
    if (zoomed && !shown) continue; // off screen while the camera looks elsewhere
    const native = m instanceof Text;
    // The heading, and its number and line: stage furniture, kept clear of the picture by the stage itself.
    const heading = isHeading(m);
    if (zoomed && (native || heading) && !contains(view, box))
      problems.push(`"${text}" is cut off by the frame`);
    if (!heading) texts.push({ m, box, native, text });
    else chromeBoxes.push({ box, text });
  }
  // The heading's line takes room under the title: content text must stay clear of all of it.
  for (const t of texts)
    for (const c of chromeBoxes)
      if (overlaps(t.box, c.box, { touching: false }))
        problems.push(`"${t.text}" runs into the heading's "${c.text}"`);
  for (const t of texts)
    if (t.native && !contains(STAGE_BOX, t.box))
      problems.push(`"${t.text}" crosses the stage edge`);
  const area = (b: Readonly<Box>) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const members = [...new Set(scene.familyMembers())], order = new Map(members.map((m, i) => [m, i]));
  const pigment = (c: string) => c.toLowerCase().replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3');
  const paper = members.filter(m => {
    if (!(m instanceof Rectangle) || isFurniture(m, {frame:true}) || m.style.fill === 'none') return false;
    // A duck-typed imported label may itself be a rectangle in an adapter.
    // Its glyph geometry is text, rather than an independent panel behind text.
    for(let p:Mobject|null=m;p;p=p.parent) if(typeof (p as {text?:unknown}).text==='string')return false;
    let opacity = m.style.fillOpacity ?? 1;
    if (/^#[0-9a-f]{8}$/i.test(m.style.fill)) opacity *= parseInt(m.style.fill.slice(7),16)/255;
    else if (/^#[0-9a-f]{4}$/i.test(m.style.fill)) opacity *= parseInt(m.style.fill[4]!,16)/15;
    for (let p: Mobject | null = m; p; p = p.parent) opacity *= p.style.opacity ?? 1;
    const box = m.box();
    // A borderless knockout in the stage's own paper has no visible panel edge.
    if (m.style.stroke === 'none' && scene.colors && pigment(m.style.fill) === pigment(scene.colors.paper)) return false;
    // Filled hairlines are rules or strike-throughs, not panels carrying text.
    if (box && m.style.stroke === 'none' && Math.min(box[2]-box[0], box[3]-box[1]) <= 0.1 &&
      Math.max(box[2]-box[0], box[3]-box[1]) >= 5 * Math.min(box[2]-box[0], box[3]-box[1])) return false;
    // A stroke-free ground filling the stage has no narrative paper edge.
    if (box && m.style.stroke === 'none' && area(box) >= area(STAGE_BOX) * 0.9) return false;
    return opacity >= 0.9;
  });
  for (const text of texts) for (const part of paper) {
    // A Text's em frame includes empty ascent/descent. Judge the actual glyph ink at paper edges.
    const ink = unionBoxes(text.m.children.map(m => m.box())) ?? text.box;
    const box = part.box();
    if (!box || (contains(box, ink) && order.get(part)! < order.get(text.m)!)) continue;
    const overlap = intersect(box, ink);
    if (!overlap || area(overlap) <= area(ink) * 0.12) continue;
    // A foreground label plate may legitimately cover a background card's edge.
    if (paper.some(plate => order.get(plate)! > order.get(part)! && order.get(plate)! < order.get(text.m)! && contains(plate.box()!, ink))) continue;
    // A framed cell can have several coloured fill segments under its one label.
    // Its enclosing outline defines the paper's edge, rather than an internal colour boundary.
    if (members.some(frame => frame instanceof Rectangle && frame.parent === part.parent &&
      frame.style.stroke !== 'none' && order.get(frame)! > order.get(part)! && order.get(frame)! < order.get(text.m)! &&
      contains(frame.box()!, box, 1e-5) && contains(frame.box()!, ink, 1e-5))) continue;
    problems.push(`"${text.text}" crosses the edge of ${part.key ? `paper "${part.key}"` : 'another part’s paper'}`);
  }
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!,
        b = texts[j]!;
      const overlap = intersect(a.box, b.box);
      if (!overlap) continue;
      if (area(overlap) > 0.12 * Math.min(area(a.box), area(b.box))) problems.push(`"${a.text}" overlaps "${b.text}"`);
    }
  return problems;
}

/**
 * Conservative preflight at the narrow stage's minimum height (16:9). Actual height
 * depends on the served page's headings and viewport; only browser review measures it.
 * Do not duplicate the player's CSS/DOM height calculation here or assume its 4:5 maximum.
 */
const PHONE_PAGE = PHONE_VIEWPORT.width,
  PHONE_W = PHONE_PAGE - 32,
  PHONE_H = PHONE_W * FRAME.h / FRAME.w;
/** Phone CSS px per view unit with the whole picture on the phone's stage. */
const PHONE_UNIT = stageScale(PHONE_W, PHONE_H).s;
/** Phone CSS px per CSS px of a 1280 px stage, with the whole picture on the phone's stage (358 / 1280). */
const PHONE_WHOLE = PHONE_UNIT / STAGE_PX_PER_UNIT;
/** The smallest font size, in stage units with the camera at home, that reads READ_PX on the whole picture on a phone (0.54). */
export const PHONE_WHOLE_MIN_SIZE = READ_PX / PHONE_UNIT;
/**
 * The keyed motion sink `rayner check` runs (src/keyed-motion.ts), able to judge words by size:
 * a label's reading size, and the size that reads on a phone showing the whole picture.
 */
class CheckedMotionSink extends KeyedMotionSink {
  readonly rules: MachineMotionCheck;
  constructor(segmentOf?: (scene: Scene) => string | null) {
    super(segmentOf, { labelSize: readingLabelSize, legible: PHONE_WHOLE_MIN_SIZE });
    this.rules = new MachineMotionCheck(segmentOf);
  }
  override async frame(scene: Scene, dt = 0): Promise<void> {
    await super.frame(scene, dt);
    await this.rules.frame(scene);
  }
}
export const keyedMotionSink = (segmentOf?: (scene: Scene) => string | null) => new CheckedMotionSink(segmentOf);
/** A step's close-ups on the phone, as the player works them out: the opening's zoom, and each view's zoom and box in view units. */
type PhoneCloseUps = { k: number; views: { k: number; box: Box }[] };
function phoneCloseUps(layout: Parameters<typeof closeUps>[0]): PhoneCloseUps {
  const tour = closeUps(layout, PHONE_W, PHONE_H);
  return { k: tour[0]!.k, views: tour.map((z) => ({ k: z.k, box: viewBox(z, PHONE_W, PHONE_H) })) };
}
/** One label across a scenario: its largest size at 1280 px, and in the phone's close-ups at rest. */
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
  const whole = PHONE_WHOLE;
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
// `rayner check` plays each scenario once and hands every frame to these, through FanSink, as
// InvariantSink and MotionSink are handed it. Each reads the scene and keeps what its check
// needs; a scene's `mobjects` changed to read a frame are put back before the next sink runs.
// A sink that reads a step's resting picture reads it in `stepEnd`, as each step ends, the way
// describe and the contact sheet read it (AtRest in src/trace.ts); LastFrameSink holds that picture to the
// step's last played frame, which the frame-numbered sinks (HoldSink, FrameCaptureSink) read.

/** Hands each frame, and each step's beginning and end, to every sink in turn. */
export class FanSink implements Sink {
  readonly sinks: readonly Sink[];
  constructor(sinks: readonly Sink[]) { this.sinks = sinks; }
  async frame(scene: Scene, dt: number): Promise<void> { for (const s of this.sinks) await s.frame(scene, dt); }
  async stepBegin(scene: Scene, step: Step): Promise<void> { for (const s of this.sinks) await s.stepBegin?.(scene, step); }
  async stepEnd(scene: Scene, step: EndedStep): Promise<void> { for (const s of this.sinks) await s.stepEnd?.(scene, step); }
}

/**
 * Every view on the stage, at the end of every step, shows what its draw makes of the state the
 * step ends in: a picture that follows the model at each resting step, not only where a machine
 * plays. A view whose picture lags its state (the state changed without a sync) is named here.
 */
/**
 * Identity is a key: `scene.find(key)` returns one mobject, and a transform, a choreography
 * and the player's close-up treat a key as one part. Two mobjects on the stage with the same
 * key at the end of a step make `find` answer with whichever comes first, silently. A part
 * keyed twice is named here, every key alike: what the stage's chrome or a diagram's frame is for
 * is its `role`, which many parts share, not a key.
 */
export class KeySink implements Sink {
  readonly problems: string[] = [];
  async frame(): Promise<void> {}
  async stepEnd(scene: Scene, step: Step): Promise<void> {
    // A mobject listed twice (on its own and inside a group) is still one part.
    const seen = new Map<string, Mobject>();
    const twice = new Set<string>();
    for (const m of scene.familyMembers()) {
      if (m.key === undefined) continue;
      const other = seen.get(m.key);
      if (other && other !== m) twice.add(m.key);
      seen.set(m.key, m);
    }
    if (twice.size) this.problems.push(`step "${step.name}": ${[...twice].slice(0, 5).map((k) => `"${k}"`).join(', ')}`);
  }
}

export class ViewSink implements Sink {
  readonly problems: string[] = [];
  checked = 0;
  /** Views some step's end has shown to depend on their state (see viewIgnoresState). */
  private readonly proven = new Set<View>();
  /** Views no step has shown to yet, each named by the first step that showed it. */
  private readonly unproven = new Map<View, { name: string; others: number }>();
  /** Each step's state so far: the other states a view first seen now is drawn from. */
  private readonly states: Record<string, unknown>[] = [];
  async frame(): Promise<void> {}
  async stepEnd(scene: Scene, step: Step): Promise<void> {
    const model = scene.stateJson(), shown = scene.shownJson();
    this.states.push(model);
    for (const m of scene.familyMembers()) {
      if (!isView(m)) continue;
      this.checked++;
      const state = m[viewInput](model);
      if (state !== model) this.states.push(structuredClone(state));
      const mismatch = viewMismatch(m, state, { shown }) ?? viewGeometryMismatch(m, scene);
      if (mismatch) this.problems.push(`step "${step.name}": ${m.key ?? 'a view'}: ${mismatch}`);
      // An explicit observation is checked on actual reachable models by exploreMachine below.
      // A synthetic input that throws, or a legitimate singleton observation, is no contrast proof.
      if (machinesOf(scene).some(machine => machine.spec.observe && machine.spec.views.includes(m) && machineSteps(machine, liveSteps(scene)).includes(step.path))) {
        continue;
      }
      // Asked at each step's end that shows the view, while the scene is as the step left it (a draw
      // may read live parts of the scene), until one shows the picture depends on the state: a list
      // that is empty at first and grows later shows it only later.
      if (this.proven.has(m)) continue;
      const others = viewIgnoresState(m, state, shown, this.states);
      if (others === null) { this.proven.add(m); this.unproven.delete(m); }
      else if (!this.unproven.has(m)) this.unproven.set(m, { name: `step "${step.name}": ${m.key ?? 'a view'}`, others });
    }
  }
  /** After the run: views for which the sampled inputs have not demonstrated a different picture. */
  get ignoring(): string[] { return [...this.unproven.values()].map((u) => u.name); }
  ignoringProblems(): string[] {
    return [...this.unproven.values()].map((u) => `${u.name}: sampled alternative inputs produced the same picture (${u.others} model states); state dependence is unproven. Show a valid contrasting state in the scene and check the intended observation in its fidelity tests`);
  }
}

/**
 * Text alone misses a mark: a card's lit bar on the wrong row, or a bar left showing, reads the
 * same words. Preserve the structural checks, then compare the actual renderer's records with
 * a placed fresh draw: paint, path data, paint order and effective rectangular clips. Renderer
 * identities and memoized strings are not picture content.
 */
function viewGeometryMismatch(v: View, scene: Scene): string | null {
  const round = (x: number) => Math.round(x * 100) / 100;
  const family = (m: Mobject) => m.family();
  const parts = (ms: Mobject[]) => ms.map((x) => JSON.stringify([
    x.constructor.name, x instanceof Text ? x.text : null, x.box()?.map(round) ?? null, round(x.style.opacity ?? 1),
  ]));
  const expected = v.placed(v[viewInput](scene.state), scene.shown);
  const shown = family(v.current), shows = parts(shown), draws = parts(family(expected));
  if (shows.join() === draws.join()) {
    // Outer clips are shared context; child clips belong to the view. Compare their effective
    // intersection, not clip IDs or redundant authored rectangles.
    const clip = (a: Box, b: Box): Box => {
      const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
      return [x, y, Math.max(x, Math.min(a[2], b[2])), Math.max(y, Math.min(a[3], b[3]))];
    };
    let outer: Box | undefined;
    for (let parent: Mobject | null = v; parent; parent = parent.parent)
      if (parent.clipBox) outer = outer ? clip(outer, parent.clipBox) : parent.clipBox;
    const rendered = (picture: Mobject): string[] => {
      // A render projection: the real scene and both pictures retain their roots and parents.
      return renderElements({ mobjects: [picture], frame: scene.frame }, { relative: false }).map((el) => {
        const attrs = Object.fromEntries(Object.entries(el.attrs).filter(([key]) => key !== 'clip-path').map(([key, value]) => {
          // Equivalent hex spelling is not a paint difference.
          if ((key === 'fill' || key === 'stroke') && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))
            value = value.length <= 5 ? '#' + [...value.slice(1)].map((c) => c + c).join('').toLowerCase() : value.toLowerCase();
          return [key, value];
        }).sort(([a], [b]) => a! < b! ? -1 : a! > b! ? 1 : 0));
        const effective = el.clipBox ? outer ? clip(el.clipBox, outer) : el.clipBox : outer;
        const viewport = effective ? [effective[0], -effective[3], effective[2] - effective[0], effective[3] - effective[1]].map((n) => Math.round(n * UNITS)) : null;
        return JSON.stringify([el.tag, attrs, el.transform, el.text, viewport]);
      });
    };
    const actualPaint = rendered(v.current), expectedPaint = rendered(expected);
    const count = Math.max(actualPaint.length, expectedPaint.length);
    for (let i = 0; i < count; i++) {
      if (actualPaint[i] === expectedPaint[i]) continue;
      type Paint = [string, Record<string, string>, string | null, string | null, number[] | null];
      const actual = actualPaint[i], expected = expectedPaint[i];
      const a = actual ? JSON.parse(actual) as Paint : null;
      const b = expected ? JSON.parse(expected) as Paint : null;
      const short = (value: unknown) => JSON.stringify(value)?.slice(0, 100) ?? 'missing';
      const changed = a && b ? [...new Set([...Object.keys(a[1]), ...Object.keys(b[1])])]
        .filter((key) => a[1][key] !== b[1][key]).map((key) => `${key}: ${short(a[1][key])}, state draws ${short(b[1][key])}`) : ['missing part'];
      if (a && b && JSON.stringify(a[4]) !== JSON.stringify(b[4])) changed.push(`clip: ${short(a[4])}, state draws ${short(b[4])}`);
      return `the view's rendered part ${i} differs from a fresh draw of the state (${changed.slice(0, 3).join('; ') || 'paint order or element content'}; ${actualPaint.length} parts shown, ${expectedPaint.length} drawn)`;
    }
    return null;
  }
  // Name the first part that differs and has no parts of its own: the bar that moved, not its card.
  const differs = shows.map((p, k) => p !== draws[k]);
  const leaf = differs.findIndex((d, k) => d && !shown[k]!.children.length);
  const i = leaf >= 0 ? leaf : differs.indexOf(true);
  return `the view's part ${i} is ${shows[i] ?? 'missing'}, the state draws ${draws[i] ?? 'nothing there'} (${shows.length} parts shown, ${draws.length} drawn)`;
}

/**
 * A frame as the parts toSvgString joins: the camera's box and paper, then each element's string
 * and clip. Each element's string is memoised on its mobject while it is unchanged, so comparing
 * two frames part by part costs no SVG document; the verdict is toSvgString's.
 */
function frameParts(scene: Scene): string[] {
  const parts = [`${scene.frame.box()!.join(' ')} ${scene.colors.paper}`];
  for (const el of renderElements(scene)) parts.push(el.svg ??= serializeElement(el), el.clipBox?.join(' ') ?? '');
  return parts;
}
const sameParts = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((p, i) => p === b[i]);

/** The caption hold: a step whose picture changes after its hold begins is `moved`. */
export class HoldSink implements Sink {
  readonly holds: readonly { step: string; from: number; to: number }[];
  readonly held = new Map<string, string[]>();
  readonly moved = new Set<string>();
  constructor(holds: readonly { step: string; from: number; to: number }[]) { this.holds = holds; }
  async frame(scene: Scene, dt: number): Promise<void> {
    const hold = dt ? this.holds.find((h) => scene.frameCount >= h.from && scene.frameCount <= h.to) : undefined;
    if (!hold || this.moved.has(hold.step)) return;
    const parts = frameParts(scene);
    if (scene.frameCount === hold.from) this.held.set(hold.step, parts);
    else if (!sameParts(parts, this.held.get(hold.step) ?? [])) this.moved.add(hold.step);
  }
}

/**
 * An animation's doFinish() ends where the last frame drew: as each step ends, after its last play has finished
 * and left the stage, the picture must be its resting frame's, which a link shows and the checks
 * judge, and which describe and the contact sheet draw as the step ends. A step that differs is listed
 * in `differing`. Reads the played frames FrameCaptureSink kept, so it comes after it.
 */
export class LastFrameSink implements Sink {
  readonly played: ReadonlyMap<number, string>;
  readonly differing: string[] = [];
  constructor(played: ReadonlyMap<number, string>) { this.played = played; }
  async frame(): Promise<void> {}
  async stepEnd(scene: Scene, step: EndedStep): Promise<void> {
    if (toSvgString(scene) !== this.played.get(step.frame1)) this.differing.push(step.name);
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

/** Each step's resting picture, by step: its SVG and its text drawing, both without the heading, and its text and route collisions. */
export class RestingSink implements Sink {
  readonly resting = new Map<string, string>();
  readonly restingText = new Map<string, string>();
  readonly collisions: string[] = [];
  async frame(): Promise<void> {}
  async stepEnd(scene: Scene, step: Step): Promise<void> {
    // The resting picture of a step, without the heading (number, title, line) that names it.
    this.resting.set(step.path, withoutHeading(scene, () => toSvgString(scene)));
    // Drawn as describe draws it, without the heading too (restingDrawing).
    this.restingText.set(step.path, restingDrawing(scene));
    this.collisions.push(
      ...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map((p) => `${step.name}: ${p}`),
    );
  }
}

/**
 * At each step's resting picture, the colours and line styles the step's caption and line name that no word
 * on the stage names (explain/caption-looks.ts). The stage's words are its visible text, diagram
 * labels and the words of every part that describes itself, a legend's swatches included; not a
 * `describe`, which only a screen reader hears.
 */
export class LookWordsSink implements Sink {
  readonly problems: string[] = [];
  readonly words: {step: string; text: string}[] = [];
  async frame(): Promise<void> {}
  async stepEnd(scene: Scene, step: Step): Promise<void> {
    const words: string[] = [];
    const heading = new Set(scene.mobjects.filter(isHeading).flatMap((m) => m.family()));
    for (const m of scene.familyMembers()) {
      if (heading.has(m) || (m.style.opacity ?? 1) < 0.5) continue;
      if (describesItself(m)) {
        const seen = m[seenSource]();
        words.push(seen.what, ...seen.parts.map((p) => p.name));
      }
      const label = labelOf(m);
      if (label) words.push(label.text);
    }
    const meta = step.meta as { title?: string; line?: string; caption?: string };
    this.words.push(...words.map(text => ({step: step.path, text})));
    this.problems.push(...captionLookProblems(meta, [meta.title ?? '', meta.line ?? ''], words).map((p) => `${step.name}: ${p}`));
  }
}

/**
 * Every label's largest readable size: at 1280 px in any frame, and on the phone in each
 * step's resting picture's close-ups. Native labels are kept by object, so a small label is not
 * excused by a larger one with the same words; imported labels by their keyed owner.
 */
export class LegibilitySink implements Sink {
  readonly labels = new Map<Mobject, LabelSizes>();
  readonly staticLabels = new Map<string, LabelSizes>();
  /** Each step's close-ups on the phone, by step. */
  readonly phoneViews: ReadonlyMap<string, { k: number; views: { k: number; box: Box }[] }>;
  readonly phoneUnit: number;
  constructor(phoneViews: ReadonlyMap<string, { k: number; views: { k: number; box: Box }[] }>, phoneUnit: number) {
    this.phoneViews = phoneViews;
    this.phoneUnit = phoneUnit;
  }

  /**
   * Record a label readable in this picture: at 1280 px always, and on the phone when it is
   * step `step`'s resting picture. `px` is already on screen (world size × the author's camera
   * zoom); the phone's close-up is the reader's zoom over that view, so the two multiply.
   * `box` is in the camera's view units, where close-ups are worked out.
   *
   * A picture label no close-up shows is measured at the opening's zoom, where a reader
   * panning to it finds it. The stage's heading (`chrome`) is not measured on the phone at
   * all: a narrow stage draws its pictures without it (ReaderSink in app/embed-zoom.ts) and
   * the player sets the step's number, title and line as page text under the stepper row.
   * It is still measured at 1280 px, where the stage draws it.
   */
  private seen(record: LabelSizes, px: number, box: Box | null, step: string | undefined, chrome = false): void {
    record.px = Math.max(record.px, px);
    const close = step === undefined ? undefined : this.phoneViews.get(step);
    if (!close) return;
    const inside = (v: Box) => !!box && contains(v, box, 1e-6);
    if (chrome) return;
    const complete = close.views.filter((v) => inside(v.box));
    // The opening can frame a comparison at a smaller scale than its detail
    // stops. Measure each label where the tour actually shows it whole.
    const k = complete.length ? Math.max(...complete.map((v) => v.k)) : close.k;
    const size = (px / STAGE_PX_PER_UNIT) * this.phoneUnit * k;
    if (size > record.phone) {
      record.phone = size;
      record.phoneStep = step;
    }
    if (complete.length) record.inView = true;
  }

  /** A frame on the way: a camera gliding past does not make a label read (see `measure`). */
  async frame(scene: Scene): Promise<void> { this.measure(scene, false); }
  /** A step's resting picture, as the step ends: measured in full, and on the phone in its close-ups. */
  async stepEnd(scene: Scene, step: Step): Promise<void> { this.measure(scene, true, step.path); }
  /**
   * A resting picture that belongs to no step (a state a machine reaches): measured in full, and on
   * the phone in the close-ups of `step` when given (the live step the state is shown at).
   */
  resting(scene: Scene, step?: string): void { this.measure(scene, true, step); }

  private measure(scene: Scene, completed: boolean, step?: string): void {
    // Sizes on screen: world size times the camera's zoom, inside the camera's view
    // cut by every clip; boxes for the phone's close-ups in the view's own units.
    const view = viewOf(scene);
    const shown = (b: Box | null) => (b ? toView(b, view) : null);
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
        if (completed && readable(m, (owner ?? m).box(), viewport)) this.seen(record, px, shown(m.box()), step);
      } else {
        const glyphs=m.family().filter(g=>!g.children.length&&g.hasPoints());
        // Unmatched proxy labels can remain wholly invisible while shapes are
        // paired. They are not reader-visible text and must not create zero-size rows.
        if (!glyphs.some(g=>g.style.opacity>0.01&&paints(g.style,{min:0.01}))) continue;
        const ink=glyphs.length>0&&glyphs.every(g=>g.style.opacity>=0.95&&(g.style.drawFraction??1)>=0.95&&paints(g.style,{min:0.95}));
        // A glyph-matching shell can combine fading fragments without ever
        // presenting its nominal word. Measure complete words during motion;
        // still retain incomplete resting labels so they fail the size gate.
        if (!completed && !ink) continue;
        if (!this.labels.has(m)) this.labels.set(m, { text, px: 0, phone: 0, inView: false });
        // A camera gliding past does not make a label read: between completed frames a
        // label counts at no more than its size with the camera home.
        const credited = completed ? px : Math.min(px, readingLabelSize(m)! * STAGE_PX_PER_UNIT);
        // The flat SVG renderer paints glyph styles, not their Text container's
        // style. A matching proxy may retain an invisible container while its
        // glyphs become fully painted. Credit only complete, actually painted glyphs.
        if (ink && viewport && contains(viewport,m.box()!,1e-5)) this.seen(this.labels.get(m)!, credited, shown(m.box()), completed ? step : undefined, isHeading(m));
      }
    }
  }
}

/**
 * Every state a scene's machines (src/machine.ts) reach, breadth first from each one's start,
 * redrawn and checked as a resting picture is: no text collisions or routes over labels, every
 * label it shows at least MIN_PX at a 1280 px stage (measured by the same LegibilitySink a run
 * uses), a description, a picture that follows the state (viewMismatch, for views of the scene's
 * state), and a description no other reachable state shares, so a reader, or a screen reader, can
 * tell them apart. A problem is named by the shortest events reaching it.
 *
 * A machine's step is live (the player gives the reader its events there), and on a phone the player
 * shows the whole picture after each press, with the step's close-ups one Next view away. So at a live
 * step every label a reachable state shows must also read READ_PX on a 390 px phone, on the whole
 * picture or whole inside one of the step's close-ups (livePhoneProblems). `layouts` are the scene's
 * step layouts (stepLayouts), worked out here when not given.
 *
 * Each machine of `scene` (a run of `Source`, the scene's class) is explored on the stage the reader
 * drives it on: `Source` run again to the end of the step it last played in, by the live player's
 * own run (`runLive`, which refuses a run that made a different machine there), and explored there,
 * while that scene can still play, so the state exploration starts from is the one the reader's
 * events start from, and each transition plays in a play of its own, as a reader's event plays it.
 * A machine that never played is explored on a fresh run of `Source` as it ends. `diagrams` says
 * whether exploring the machine made a diagram, which a page without diagram code could not draw.
 * `only.events` plays the transitions of those events alone (the motion corpus's focused runs);
 * `rayner check` plays every event's.
 */
export async function exploreMachines(
  scene: Scene,
  Source: SceneClass,
  layouts?: Awaited<ReturnType<typeof stepLayouts>>,
  only?: { events?: readonly string[] },
): Promise<{ step?: string; events: string[]; states: number; observations: number; sampled: boolean; diagrams: boolean; problems: string[]; motion: string[]; phoneWarnings: string[] }[]> {
  const explored: Awaited<ReturnType<typeof exploreMachines>> = [];
  const controls = liveSteps(scene);
  if (!layouts && controls.size) layouts = await stepLayouts(Source);
  for (const [index, made] of machinesOf(scene).entries()) {
    for (const step of machineSteps(made, controls)) {
      const live = step === null ? undefined : controls.get(step);
      const active = live?.machine === made;
      const place = active ? live : { index, identity: made.identity };
      const explore: LiveExplore = async (host, machine, draw) => {
        try {
          const checked = await exploreMachine(host, machine, step, active, draw, step === null ? undefined : phoneCloseUps(layouts?.get(step)), only?.events);
          explored.push(step !== null && live?.offered && active ? { ...checked, step } : checked);
        } catch (error) {
          throw new Error(`Machine ${index + 1}${step === null ? '' : ` at step "${step}"`}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
      };
      if (step !== null) await runLive(Source, step, place, [], { explore });
      else {
        const out = new LiveSink();
        const host = await new Source(out).run();
        await explore(host, liveMachine(host, null, place), (to) => out.draw(to));
      }
    }
  }
  return explored;
}

/** One machine explored on `host`, which may still play, as the step it last played in (`step`) ends, or as the run ends when it never played; `draw` routes the host's frames. */
async function exploreMachine(host: Scene, machine: ReturnType<typeof machinesOf>[number], step: string | null, active: boolean, draw: (to?: Sink) => void, tour?: PhoneCloseUps, only?: readonly string[]) {
  const diagramsBefore = diagramsOn(host);
  const problems: string[] = [], motion: string[] = [], phoneWarnings: string[] = [];
  const missing = machine.spec.views.filter((v) => !host.familyMembers().includes(v));
  if (missing.length) problems.push(`its views ${missing.map((v) => v.key ?? v.constructor.name).join(', ')} are not on the stage where it last played, so its states cannot be checked there`);
  // From the start, as exploration always has; and from the state the reader finds at the step
  // where the machine is live, since the player lets the reader send events from there too.
  const startWalk = machine.explore();
  const fromStart = startWalk.states.map((r) => ({ ...r, origin: '' }));
  const seen = new Set(fromStart.map((r) => canonicalJson(r.state)));
  const live = active ? logStart(machine, jsonObject(host.state, 'machine state')) : null;
  // Each distinct origin gets its own budget, even if the live origin is in the start's capped
  // prefix. Retain completeness before removing states already checked from the other origin.
  const liveWalk = live === null || canonicalJson(live.state) === canonicalJson(machine.spec.start)
    ? undefined : machine.explore(live.state);
  const fromStep = (liveWalk?.states ?? []).filter((r) => !seen.has(canonicalJson(r.state)))
    .map((r) => ({ ...r, origin: `from the state at "${step}", ` }));
  const reached = [...fromStart, ...fromStep];
  const shownThen = host.shown;
  // runLive already chose the shown state for this historical step. A play outside any step has its own shown state.
  if (step === null) host.shown = machine.playedUnder ?? shownThen;
  // Results are presentation, not model identity. A self-loop can still change the picture
  // from which the next event starts. Check every distinct incoming result as a source, while
  // retaining the durable-state exploration budget and reported state count.
  const baseline = jsonObject(host.shown, 'machine presentation');
  const presentation = (path: readonly string[], origin: string) => {
    const shown = jsonObject(baseline, 'machine presentation');
    if (!origin || live?.from === 'start') delete shown.result;
    host.shown = shown;
    let before = origin ? live!.state : machine.spec.start;
    for (const event of path) {
      const after = machine.after(before, event)!;
      machine.present(event, before, after);
      before = after;
    }
    return jsonObject(host.shown, 'machine presentation');
  };
  const contexts = reached.map(r => ({...r, shown: machine.spec.result ? presentation(r.path, r.origin) : baseline}));
  if (machine.spec.result) {
    const admitted = new Set(reached.map(r => canonicalJson(r.state)));
    const liveSources = live?.from === 'rest' ? (liveWalk?.states ?? startWalk.states)
      .map(r => ({...r, origin: `from the state at "${step}", `})) : [];
    const sources = [...fromStart, ...liveSources];
    for (const source of sources) {
      contexts.push({...source, shown: presentation(source.path, source.origin)});
      for (const event of machine.spec.events) {
        const state = machine.after(source.state, event);
        if (state === undefined || !admitted.has(canonicalJson(state))) continue;
        const path = [...source.path, event];
        contexts.push({state, path, origin: source.origin, shown: presentation(path, source.origin)});
      }
    }
  }
  const checkedContexts = new Set<string>();
  const said = new Map<string, { observation: string; at: string }>(), observations = new Set<string>();
  for (const { state, path, origin, shown } of contexts) {
    const contextKey = canonicalJson({state, shown});
    if (checkedContexts.has(contextKey)) continue;
    checkedContexts.add(contextKey);
    host.shown = shown;
    const at = origin + (path.length ? `after ${path.join(', ')}` : 'at the start');
    const model = jsonObject(state, 'machine state');
    const observation = canonicalJson(observedValue(machine, state, `${at}, model ${canonicalJson(state)}`));
    observations.add(observation);
    host.state = model;
    for (const view of machine.spec.views) {
      view.rebuild();
      const mismatch = viewMismatch(view, model, { shown: host.shown });
      if (mismatch) problems.push(`${at}: ${mismatch}`);
    }
    problems.push(...[...restingTextProblems(host), ...restingRouteProblems(host)].map((p) => `${at}: ${p}`));
    // Each label this state shows, at the size a 1280 px stage draws it; one not shown (outside
    // the view, clipped or transparent) is never measured and stays at 0. At a live step, also on
    // the phone in the step's close-ups.
    const sizes = new LegibilitySink(step !== null && tour ? new Map([[step, tour]]) : new Map(), PHONE_UNIT);
    sizes.resting(host, step ?? undefined);
    for (const r of [...sizes.labels.values(), ...sizes.staticLabels.values()])
      if (r.px > 0 && r.px < MIN_PX) problems.push(`${at}: “${r.text}” is ${r.px.toFixed(1)} px at a 1280 px stage, under ${MIN_PX}`);
    if (step !== null) {
      problems.push(...livePhoneProblems(sizes, step).map((p) => `${at}: ${p}`));
      phoneWarnings.push(...livePhoneProblems(sizes, step, true).map((p) => `${at}: ${p}`));
    }
    const picture = host.derivedJson().picture as { entries?: { what?: string; items?: string[] }[] } | undefined;
    const words = JSON.stringify(picture?.entries ?? []);
    if (!picture?.entries?.some((e) => e.what?.trim())) problems.push(`${at}: the picture has no description`);
    else if (said.has(words) && said.get(words)!.observation !== observation)
      problems.push(`${at}: the picture is described exactly as ${said.get(words)!.at}, a different observation`);
    else if (!said.has(words)) said.set(words, { observation, at });
    const played = await transitionProblems(host, machine, state, path, origin, draw, only);
    problems.push(...played.problems);
    motion.push(...played.motion);
  }
  host.shown = shownThen;
  const sampled = !startWalk.complete || liveWalk?.complete === false;
  return { events: [...machine.spec.events], states: reached.length, observations: observations.size, sampled, diagrams: diagramsOn(host) > diagramsBefore, problems, motion, phoneWarnings };
}

/**
 * At live step `step`, the labels a phone reader cannot read: each must read READ_PX at a 390 px
 * phone on the whole picture, which the player shows after every press, or whole inside one of the
 * step's close-ups, which Next view brings back. A label no close-up holds whole counts at its
 * whole-picture size, as the served review counts what a press changed: a view must show it whole,
 * not a pan across it from a close-up planned for another part of the picture. The stage's
 * heading is left out, as a phone's stage leaves it out (LegibilitySink). `sizes` measured one
 * resting picture with the step's close-ups.
 */
function livePhoneProblems(sizes: LegibilitySink, step: string, wholeOnly = false): string[] {
  const records = [...[...sizes.labels].filter(([m]) => !isHeading(m)).map(([, r]) => r), ...sizes.staticLabels.values()];
  const problems: string[] = [];
  for (const r of records) {
    if (!(r.px > 0)) continue;
    const whole = r.px * PHONE_WHOLE,
      best = wholeOnly ? whole : Math.max(whole, r.inView ? r.phone : 0);
    if (round1(best) >= READ_PX) continue;
    if (wholeOnly) {
      problems.push(`“${r.text}” reads ${round1(whole)} px on the whole picture at a ${PHONE_PAGE} px phone after a live event at "${step}", under ${READ_PX}; use at least ${PHONE_WHOLE_MIN_SIZE.toFixed(2)} units with the camera at home`);
      continue;
    }
    const closest = r.inView && r.phone > whole + 1e-9 ? `, ${round1(r.phone)} px in the best close-up of "${step}" that holds it` : `, and no close-up of "${step}" shows it larger`;
    problems.push(`“${r.text}” reads ${round1(whole)} px on the whole picture at a ${PHONE_PAGE} px phone${closest}, under ${READ_PX}; the player shows a live step's whole picture after each press, so draw it at a size of at least ${PHONE_WHOLE_MIN_SIZE.toFixed(2)} with the camera at home, or bring it into one of the step's close-ups`);
  }
  return problems;
}

/** A picture for testing state dependence, including changes confined to paths or clips. */
const pictureDetail = (m: Mobject) =>
  JSON.stringify(m.family().map((x) => [x.constructor.name, x.key ?? null, 'text' in x ? x.text : null, x.box(), x.style, x.clipBox ?? null, x.pointArrays().map((p) => [...p])]));

/** Every value of a JSON state changed: numbers moved, strings lengthened, booleans flipped, nulls made 0. */
function perturbed(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? value + 1 : value * 1.5 + 0.5;
  if (typeof value === 'string') return `${value}x`;
  if (typeof value === 'boolean') return !value;
  if (value === null) return 0;
  if (Array.isArray(value)) return value.map(perturbed);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, perturbed(v)]));
  return value;
}

/**
 * Probe a view with changed values, an empty model, earlier step models and changed shown input.
 * Return the number of alternative model inputs when none changes the picture; otherwise null.
 * This is a bounded diagnostic, not proof that a draw ignores every possible state. A threshold
 * may need a valid contrasting authored step; a failed draw only proves it inspected its input,
 * not that the input was represented faithfully. ViewSink separately checks fresh redraws.
 */
export function viewIgnoresState(view: View, state: Record<string, unknown>, shown: Record<string, unknown>, states: readonly Record<string, unknown>[]): number | null {
  if (!Object.keys(state).length) return null;
  const own = canonicalJson(state);
  const drawn = pictureDetail(view.draw(state, shown));
  const others = [perturbed(state), {}, ...states]
    .filter((s, j, all) => canonicalJson(s) !== own && all.findIndex((t) => canonicalJson(t) === canonicalJson(s)) === j);
  const differs = (st: Record<string, unknown>, sh: Record<string, unknown>) => {
    try { return pictureDetail(view.draw(st, sh)) !== drawn; } catch { return true; }
  };
  // A view draws the model and what is shown apart from it; a picture that follows what is shown
  // (a chapter, a highlight) reads its inputs too.
  const depends = others.some((other) => differs(other as Record<string, unknown>, shown)) ||
    (Object.keys(shown).length > 0 && differs(state, perturbed(shown) as Record<string, unknown>));
  // A draw may keep what it last drew (its words, say): leave it as the step drew it.
  view.draw(state, shown);
  return depends ? null : others.length;
}


/**
 * A rendered frame's marks in any stacking order: a part a transition brought in is added last,
 * so it may sit above parts it sits below in the target picture; the views taking the state's
 * pictures put it back a frame later. Every mark must still be there, drawn the same.
 */
const marksOf = (svg: string) => svg.split('/>').sort().join('/>');

/**
 * Each authored transition from `state`, played on the explored scene as a reader's event plays it:
 * the event's state change first, then the transition in a play of its own (`machine.transitionPlay`),
 * made when its turn comes and waiting, as the play lets it, for what it reads. Every invariant is
 * checked on every frame it draws (an InvariantSink, through `draw`), and when it ends the views must
 * show the pictures of the state it reaches, as rendered, so taking them moves nothing.
 */
async function transitionProblems(scene: Scene, machine: ReturnType<typeof machinesOf>[number], state: object, path: readonly string[], origin: string, draw: (to?: Sink) => void, only?: readonly string[]): Promise<{ problems: string[]; motion: string[] }> {
  const problems: string[] = [], motionProblems: string[] = [];
  const { views, events } = machine.spec;
  for (const event of events) {
    if (only && !only.includes(event)) continue;
    // A bound only bounds: an event it stops that the model refuses anyway is a refusal.
    const bound = machine.spec.bound?.(state, event);
    if (bound !== undefined && 'refused' in machine.model(state, event))
      problems.push(`${origin}${path.length ? `after ${path.join(', ')}, ` : ''}${event}: the bound says "${bound}", but the model refuses it anyway; it is a refusal, not where the story stops`);
    const after = machine.after(state, event);
    if (after === undefined) continue;
    const beforeShown = jsonObject(scene.shown, 'machine presentation');
    const motion = machine.transitionPlay(event, state, after);
    const at = `${origin}${path.length ? `after ${path.join(', ')}, ` : ''}${event}`;
    if (!motion) {
      // No authored transition: the views' own staged morph, which a reader's press plays too. Only its motion is judged here.
      scene.state = jsonObject(state, 'machine state');
      for (const v of views) v.rebuild();
      scene.state = jsonObject(after, 'machine state');
      machine.present(event, state, after);
      const keyedMotion = keyedMotionSink(() => at);
      await keyedMotion.frame(scene, 0);
      draw(keyedMotion);
      try { await keyedMotion.rules.during(scene, () => scene.play(machine.defaultPlay(event, state, after))); } finally { draw(); }
      motionProblems.push(...keyedMotion.finish().map((f) => `${at}: ${keyedMotionLine(f)}`), ...keyedMotion.rules.findings);
      if (machine.spec.result) problems.push(...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map(p => `${at}: ${p}`));
      scene.state = jsonObject(state, 'machine state');
      scene.shown = beforeShown;
      for (const v of views) v.rebuild();
      continue;
    }
    // What the reader should see when it ends: the views rebuilt for `after` where they stand
    // now (a rebuilt picture keeps its place), before the transition can move them.
    scene.state = jsonObject(after, 'machine state');
    machine.present(event, state, after);
    for (const v of views) v.rebuild();
    const expected = marksOf(toSvgString(scene));
    if (machine.spec.result) problems.push(...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map(p => `${at}: ${p}`));
    scene.state = jsonObject(state, 'machine state');
    scene.shown = beforeShown;
    for (const v of views) v.rebuild();
    // As in a send: the event's SetState has already moved the scene to `after` when its transition
    // begins, so a sync inside the transition draws the state reached.
    scene.state = jsonObject(after, 'machine state');
    machine.present(event, state, after);
    const frames = new InvariantSink();
    // Every keyed part's motion, from the picture before the transition (its first frame) to its last frame.
    const keyedMotion = keyedMotionSink(() => at);
    await keyedMotion.frame(scene, 0);
    const t0 = scene.time;
    draw(new FanSink([frames, keyedMotion]));
    try { await keyedMotion.rules.during(scene, () => scene.play(motion)); } finally { draw(); }
    motionProblems.push(...keyedMotion.finish().map((f) => `${at}: ${keyedMotionLine(f)}`), ...keyedMotion.rules.findings);
    // Each invariant's first failing frame, by how far through the transition it is.
    const failed = new Set<string>();
    for (const f of frames.failures) {
      if (failed.has(f.invariant)) continue;
      failed.add(f.invariant);
      const through = Math.round(((f.t - t0) / (motion.runTime || 1)) * 100);
      problems.push(`${at}: the invariant "${f.invariant}" fails ${through}% through the transition: ${f.message}`);
    }
    // Compared as rendered marks, since a morph finishes on glyphs without retyping a Text. A transition that
    // ends elsewhere would leave the views there: their next rebuild keeps the place it left them.
    if (marksOf(toSvgString(scene)) !== expected) problems.push(`${at}: the transition ends somewhere other than the picture of the state it reaches`);
    scene.state = jsonObject(after, 'machine state');
    for (const v of views) v.rebuild();
    if (machine.spec.result) {
      scene.state = jsonObject(state, 'machine state');
      scene.shown = beforeShown;
      for (const v of views) v.rebuild();
    }
  }
  return { problems, motion: motionProblems };
}

/**
 * The bare runtime of a project: its scene entry bundled once, as the page bundles it (the page's
 * SFNT font path, and no diagram code when no scenario shows a diagram), for a neutral platform with
 * no DOM. Each call runs one scenario in a fresh VM context, so no state crosses scenarios.
 */
export async function bareRuntime(project: Project, plugins: Plugin[] = []): Promise<(values: Settings) => Promise<{ trace: unknown; svg: string }>> {
  const contents = await sceneEntry(project, { target: 'bare' });
  const b = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'iife',
    globalName: 'bare',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    plugins: [...plugins, browserFonts(), ...(showsDiagrams(project) ? [] : [withoutDiagramCode()]), engineAlias(false, !!project.outlineLettering)],
    logLevel: 'silent',
  });
  const script = new vm.Script(b.outputFiles[0]!.text + ';globalThis.result=bare.run(globalThis.values)');
  return async (values) => {
    const context = vm.createContext({ TextEncoder, TextDecoder, atob, URL, URLSearchParams, values: JSON.parse(JSON.stringify(values)) });
    script.runInContext(context);
    return JSON.parse(JSON.stringify(await context.result));
  };
}

/** Run every check on every scenario; write the report to `out`/report.json and return it. */
export async function checkProject(project: Project, out: string): Promise<Record<string, unknown>> {
  const lint = lintConstruct(await readFile(project.file, 'utf8'));
  assert.deepEqual(lint, [], lint.join('\n'));
  await mkdir(out, { recursive: true });
  // The folder's own evidence first: a scene drawn from a model its test refuses shows nothing true.
  const model = await runModelTest(project.file);
  // A blank explainer (rayner init --blank) fails here with what is left to write, in order.
  const todo = placeholderTodo(await readFile(scriptOf(project.file), 'utf8').catch(() => null), model, project.scenarios.flatMap((v) => v.trace.steps), basename(project.file));
  assert.ok(!todo.length, `This explainer still has placeholders, each marked TODO:. To do, in order:\n${todo.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
  assert.ok(!model?.failed.length, `The model test fails (${model?.file}): ${model?.failed.join('; ')}`);
  const answers = await compareAnswers(project.file, project.Scene.meta, async (file) => (await importAuthored(file)).module);
  assert.deepEqual(answers?.problems ?? [], [], `script.md disagrees with answers.ts (${answers?.file}): ${answers?.problems.join('; ')}`);
  const checkedAgainst = await checkedAgainstFiles(project.file, (project.Scene.meta as { checkedAgainst?: unknown } | undefined)?.checkedAgainst);
  assert.deepEqual(checkedAgainst?.problems ?? [], [], `script.md's Checked against names files that are not there: ${checkedAgainst?.problems.join('; ')}`);
  await useProjectLettering(project);
  const scenarios = [];
  let runBare: ReturnType<typeof bareRuntime> | undefined;
  for (const v of project.scenarios) {
    const where = `in ${scenarioName(project.Scene, v.values) || 'the scene'}`;
    // The scene's own invariants of the picture (Scene.addInvariant), checked on every frame of this full run.
    const invariants = new InvariantSink();
    const motion = new MotionSink();
    // Each played frame at three points per step, compared below with what a seek renders there: its
    // middle, the frame before its last, and its resting frame, the one a link to it shows.
    const capture = new FrameCaptureSink(
      new Set(
        v.trace.steps.flatMap((s) => [
          s.frame0 + Math.max(1, Math.floor((s.frame1 - s.frame0) / 2)),
          Math.max(s.frame0 + 1, s.frame1 - 1),
          s.frame1,
        ]),
      ),
    );
    const lastFrame = new LastFrameSink(capture.frames);
    // Each step's close-ups on the phone, worked out as the player works them out.
    const layouts = await stepLayouts(v.Scene);
    const legibility = new LegibilitySink(
      new Map(v.trace.steps.map((s) => [s.step, phoneCloseUps(layouts.get(s.step))] as const)),
      PHONE_UNIT,
    );
    const restingSink = new RestingSink();
    const looks = new LookWordsSink();
    // The caption hold: the player stops where it begins and the film holds the picture there, so
    // nothing may change after it. A play finishes after its last frame is drawn (a morph gets its
    // paths' own structure back), so the first held frame is the resting picture, as in render.
    const holdSink = new HoldSink(
      v.trace.steps.flatMap((s) => (s.holdFrame != null ? [{ step: s.step, from: s.holdFrame + 1, to: s.frame1 }] : [])),
    );
    // One full run feeds every check, each a sink of its own, in this order: the step's resting
    // picture is read as the step ends, the last-frame comparison first, before views and keys redraw anything.
    const views = new ViewSink();
    const keys = new KeySink();
    // Every keyed part followed from frame to frame within each play: jumps, flicker, early words, covers and small words (src/keyed-motion.ts).
    const keyedMotion = keyedMotionSink();
    const playback = new v.Scene(new FanSink([invariants, motion, keyedMotion, holdSink, capture, lastFrame, restingSink, legibility, looks, views, keys]));
    const ran = await keyedMotion.rules.during(playback, () => playback.run());
    const stepMotion = [...keyedMotion.finish().map(f => `${f.segment}: ${keyedMotionLine(f)}`), ...keyedMotion.rules.findings];
    // The last frame, before exploring machines moves the scene.
    const finalSvg = toSvgString(ran);
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
    // Each machine is explored on the stage where it last played: the scene run again to that step's end, as the player runs it.
    const machines = await exploreMachines(ran, v.Scene, layouts);
    assert.ok(
      showsDiagrams(project) || !machines.some((m) => m.diagrams),
      `Diagrams ${where}: a reader's event draws a diagram no scenario draws, so the page, built without diagram code, cannot draw it; draw the diagram in a scenario too`,
    );
    assert.deepEqual(
      [...views.problems, ...views.ignoringProblems()].slice(0, 5),
      [],
      `Views ${where}: at the end of a step, a view must show what its draw makes of the step's state, and that picture must depend on the state (the first five)`,
    );
    assert.deepEqual(
      keys.problems.slice(0, 5),
      [],
      `Keys ${where}: at the end of a step, a key names one mobject on the stage, so find, transforms and the close-up mean one part (the first five)`,
    );
    assert.deepEqual(
      machines.flatMap((s) => s.problems.map((p) => s.step ? `at offered step "${s.step}": ${p}` : p)).slice(0, 5),
      [],
      `Machines ${where}: a state the events reach fails (each named by its shortest events; the first five)`,
    );
    const motionFound = [...stepMotion, ...machines.flatMap((m) => m.motion)];
    assert.deepEqual(
      motionFound.slice(0, 8),
      [],
      `Keyed motion ${where}: a keyed part jumps, flickers, shows new words before what causes them lands, travels over a label, or carries words too small to read, in a step or in a reader's event (${motionFound.length} found; the first eight)`,
    );
    assert.deepEqual(
      [...moved],
      [],
      `The picture changes after the caption hold begins, where the player stops; finish every change before the step's last play() ends ${where}`,
    );
    assert.deepEqual(
      lastFrame.differing.slice(0, 5),
      [],
      `These steps end on a different picture from their last frame ${where}: an animation's doFinish() must end where its last frame drew, since a link, describe and the contact sheet show the step as it ends (the first five)`,
    );
    for (const [frame, svg] of frames) {
      const sink = new SnapshotSink();
      await renderFrame(v.Scene, frame, sink);
      assert.equal(sink.svg, svg, `Seek mismatch at frame ${frame} ${where}`);
    }
    const played = (await traceRun(v.Scene, { skipUntil: 0 })).trace;
    assert.deepEqual(played, v.trace, `Skipped and played traces differ ${where}`);
    const still = v.trace.steps.filter(
      (step, i) => i > 0 && resting.get(step.step) === resting.get(v.trace.steps[i - 1]!.step),
    );
    assert.deepEqual(
      still.map((s) => s.step),
      [],
      `Each step must change the picture; these end exactly as the step before ${where}`,
    );
    assert.deepEqual([...new Set(collisions)], [], `Resting frames have colliding or cut-off text ${where}`);
    // A colour or line style the words name must be named on the stage too, so the picture teaches with its caption hidden.
    const unnamed = [...new Set(looks.problems)];
    assert.deepEqual(
      unnamed,
      [],
      `Captions name a look the stage does not ${where}: ${unnamed.join('; ')}. Label it, or key it with a legend (rayner/drawing's legend)`,
    );
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
    const blank = v.trace.steps.flatMap((s) => undescribed(s.derived).map((m) => `${s.step}: ${m}`));
    assert.deepEqual(blank, [], `Every drawing needs words for readers who cannot see it ${where}`);
    // The bare runtime runs what the page ships (its lettering, faces and snapshots, through the page's
    // font path and diagram code) in a context of its own, and must reproduce the Node trace: every
    // step's times, hold, state and what it shows, and the last frame.
    const bare = await (await (runBare ??= bareRuntime(project)))(v.values);
    const disagrees = `The bare runtime (no DOM, no Node) disagrees with the trace ${where}`;
    assert.deepEqual(bare.trace, JSON.parse(JSON.stringify(v.trace)), disagrees);
    assert.equal(bare.svg, finalSvg, `${disagrees}: its last frame draws differently`);
    const script = scriptReport(project.Scene.meta, v.trace.steps);
    assert.deepEqual(script.problems, [], `Script ${where}: ${script.problems.join('; ')}`);
    // Each prediction a step asks the reader to commit to: its answer one of its options, revealed by a later step.
    const predicted = predictionsOf(v.trace.steps);
    assert.deepEqual(predicted.problems, [], `Predictions ${where}: ${predicted.problems.join('; ')}`);
    scenarios.push({
      settings: v.values,
      trace: v.trace,
      steps: v.trace.steps.length,
      frames: motion.frames.length,
      seekFrames: frames.size,
      motionEvents: events.length,
      // Frames the keyed motion check followed every keyed part through, in the run (each press it plays is extra).
      keyedMotionFrames: keyedMotion.frames,
      // Each declared invariant and the frames it held on: an invariant that held on no frame is not evidence.
      invariants: Object.fromEntries(invariants.held),
      // Each machine's events and how many states they reach, every one drawn and checked.
      ...(machines.length ? { machines: machines.map(({ step, events, states, observations, sampled, phoneWarnings }) => ({ ...(step ? { step } : {}), events, states, observations, ...(sampled ? { sampled } : {}), ...(phoneWarnings.length ? { phoneWarnings } : {}) })) } : {}),
      // How many view pictures, step by step, were compared with what their draw makes of the step's state.
      ...(views.checked ? { viewsChecked: views.checked } : {}),
      labels: labels.size,
      completedStepLabels: staticLabels.size,
      // What a reader sees: the labels at 1280 px, and on a 390 px phone in each step's close-up.
      legibility: legibilityReport([...labels.values(), ...staticLabels.values()]),
      // The script gate (explain/script.ts): a declared meta.answer stated by some step (where, reported), and how many
      // reader questions the page asks. Undeclared parts are reported as missing.
      script,
      // Each prediction (meta.predict): the step that asks it, its options, the answer and the step that reveals it.
      ...(predicted.predictions.length
        ? { predictions: predicted.predictions.map(({ step, options, answer, reveal }) => ({ step, options, answer: options[answer], reveal })) }
        : {}),
      // Sentences with scope words, the declared claim (meta.claims) backing each, and the code names
      // reaching the steps' words (explain/claims.ts). Reported, not gated; see claimProblems below.
      claims: claimsReport(project.Scene.meta, v.trace.steps, looks.words),
      // What each step changed of the state the author watches (meta.watch), as readers see it, and
      // the watched keys skipped because their value cannot be said briefly. Reported, not gated.
      ...(project.Scene.meta?.watch
        ? {
            watch: v.trace.steps.map((s, index) => {
              const unformatted: string[] = [];
              const changes = watchedReadings(s, project.Scene.meta!.watch, project.Scene.meta!.lang, unformatted);
              return { step: s.step, changes, unformatted };
            }),
          }
        : {}),
      // Each step's resting frame as text, so an author can read it without a browser: the drawing
      // describe gives (restingDrawing), without the heading that names the step.
      restingFrames: Object.fromEntries(
        v.trace.steps.map((step) => [step.step, restingText.get(step.step) ?? '']),
      ),
    });
  }
  // A declared claim must be stated by some scenario and held by a test that is there.
  const claimProblems = await declaredClaimProblems(
    checkClaimsMeta(project.Scene.meta),
    scenarios.flatMap((v) => v.claims.stated),
    process.cwd(),
    dirname(project.file),
  );
  assert.deepEqual(claimProblems, [], `Claims: ${claimProblems.join('; ')}`);
  const report = {
    scene: sceneSlug(project),
    // The model test beside the scene (model.test.ts), run with node:test: how many tests ran and passed, and any skipped.
    ...(model ? { model: { file: model.file, tests: model.tests, passed: model.passed, ...(model.skipped ? { skipped: model.skipped } : {}) } } : {}),
    // The script's answer and its reader questions' answers that answers.ts computes from the model, each equal to script.md's.
    ...(answers ? { answers: { file: answers.file, compared: answers.compared } } : {}),
    // The files the script's Checked against line names in backticks, each one in the explainer's folder.
    ...(checkedAgainst?.files.length ? { checkedAgainst: checkedAgainst.files } : {}),
    scenarios,
    diagrams: Object.keys(project.store).length,
    replayedEdits: project.edits,
    ...(project.outlineLettering ? { lettering: await (await import('./lettering.ts')).letteringWeight(project.outlineLettering) } : {}),
    // What the requested lettering adds to the page; only an explainer that asked has it.
    ...(project.lettering ? { lettering: letteringReport(project.lettering) } : {}),
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

/**
 * What is wrong with a scene's declared claims: one no scenario states, or one whose test file is not
 * there or holds no test whose name contains the given part. A test file is looked for in the scene's
 * `folder` first (`model.test.ts: …`), then from `directory`, where the command was run.
 */
export async function declaredClaimProblems(claims: readonly { says: string; test?: string; shown?: true }[], stated: readonly string[], directory = process.cwd(), folder?: string): Promise<string[]> {
  const problems: string[] = [];
  const files = new Map<string, string[] | null>();
  for (const c of claims) {
    if (!stated.includes(c.says)) problems.push(`no step states the claim "${c.says}"`);
    if (!c.test) continue;
    const at = c.test.indexOf(': '),
      file = c.test.slice(0, at),
      name = c.test.slice(at + 2);
    if (!files.has(file)) {
      const source =
        (folder === undefined ? null : await readFile(resolve(folder, file), 'utf8').catch(() => null)) ??
        (await readFile(resolve(directory, file), 'utf8').catch(() => null));
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
        // A title built per scenario, as in test(`${entry.id}: …`): only its fixed text can match, so
        // each substitution becomes a character no claim's test name contains.
        else if (ts.isTemplateExpression(name)) names.push(name.head.text + name.templateSpans.map((span) => '\u0000' + span.literal.text).join(''));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

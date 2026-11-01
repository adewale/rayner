import { scriptReport } from '../../explain/script.ts';
import { restingRouteProblems } from './explain-layout.ts';
import { letteringWeight, pageSnapshot } from './lettering.ts';
import { isHeading } from '../../explain/stage.ts';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
import {
  MotionSink,
  analyzeMotion,
  SnapshotSink,
  renderAt,
  toSvgString,
  traceScene,
  renderText,
  Text,
} from '../../src/index.ts';
import { Card } from '../../explain/panels.ts';
import { ROOT, engineAlias, sceneSlug } from './explain-project.ts';
import { caseName } from '../../explain/index.ts';
import { restingFrame, undescribed, stepWords, watchedChanges } from '../../explain/trace.ts';
import { wordsReport } from './explain-words.ts';
import { labelOf, readingLabelSize } from '../../explain/diagrams.ts';
import { closeUps, stageScale, stepLayouts, toView, viewBox, viewZoom } from '../../app/embed-closeup.ts';
import type { Box, Mobject } from '../../src/index.ts';
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
 * The phone the legibility report measures: a 390 px page, whose stage (inside the
 * page's 16 px gutters) is 358 × 201 px. The player opens each step there on its
 * close-up (app/embed-closeup.ts), so a label's phone size is its size at that zoom.
 */
const PHONE_PAGE = 390,
  PHONE_W = PHONE_PAGE - 32,
  PHONE_H = Math.round((PHONE_W * 9) / 16);
/** One label across a case: its largest size at 1280 px, and in the phone's close-ups at rest. */
interface LabelSizes {
  text: string;
  px: number;
  /** Largest size in a resting picture's close-up on the phone, in CSS px; 0 if never at rest and readable. */
  phone: number;
  /** Whole inside one of a resting picture's close-ups (where the step opens, or its tour), so no panning finds it. */
  inView: boolean;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
/**
 * Smallest label sizes at a 1280 px stage, and on a 390 px phone as the player shows
 * each resting picture there (its close-up); the whole-stage phone size is what the
 * reader would get without close-ups.
 */
function legibilityReport(records: LabelSizes[]) {
  const sizes = records.filter((r) => r.px > 0),
    min = sizes.length ? Math.min(...sizes.map((r) => r.px)) : null;
  const atRest = sizes.filter((r) => r.phone > 0),
    phoneMin = atRest.length ? Math.min(...atRest.map((r) => r.phone)) : null;
  const whole = stageScale(PHONE_W, PHONE_H).s / STAGE_PX_PER_UNIT;
  return {
    minLabelPx1280: min == null ? null : round1(min),
    minLabelPx390: phoneMin == null ? null : round1(phoneMin),
    labelsUnder12PxAt390: atRest.filter((r) => round1(r.phone) < 12).length,
    // Labels no close-up shows whole, at rest: the reader pans to them (at the same size).
    labelsOutsideCloseUpsAt390: atRest.filter((r) => !r.inView).length,
    minLabelPx390WholeStage: min == null ? null : round1(min * whole),
    labels: sizes.length,
  };
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
    const motion = new MotionSink(),
      frames = new Map<number, string>();
    const targets = new Set(
      v.trace.steps.flatMap((s) => [
        s.frame0 + Math.max(1, Math.floor(((s.frame1 ?? s.frame0 + 1) - s.frame0) / 2)),
        Math.max(s.frame0 + 1, (s.frame1 ?? s.frame0 + 1) - 1),
      ]),
    );
    // Native labels by object, so a small label is not excused by a larger one with the same words.
    const labels = new Map<Mobject, LabelSizes>();
    const completedFrames = new Set(v.trace.steps.map(restingFrame));
    const staticLabels = new Map<string, LabelSizes>();
    // Each resting frame's close-ups on the phone, worked out as the player works them out.
    const layouts = await stepLayouts(v.Scene),
      phoneUnit = stageScale(PHONE_W, PHONE_H).s;
    const phoneViews = new Map(
      v.trace.steps.map((s) => {
        const tour = closeUps(layouts.get(s.step), PHONE_W, PHONE_H);
        return [
          restingFrame(s),
          { k: tour[0]!.k, views: tour.map((z) => ({ k: z.k, box: viewBox(z, PHONE_W, PHONE_H) })) },
        ] as const;
      }),
    );
    /**
     * Record a label readable in this frame: at 1280 px always, and on the phone when the
     * frame is a resting one. `px` is already on screen (world size × the author's camera
     * zoom); the phone's close-up is the reader's zoom over that view, so the two multiply.
     * `box` is in the camera's view units, where close-ups are worked out.
     */
    const seen = (record: LabelSizes, px: number, box: Box | null, frame: number) => {
      record.px = Math.max(record.px, px);
      const close = phoneViews.get(frame);
      if (!close) return;
      const inside = (v: Box) =>
        !!box && box[0] >= v[0] - 1e-6 && box[2] <= v[2] + 1e-6 && box[1] >= v[1] - 1e-6 && box[3] <= v[3] + 1e-6;
      const complete = close.views.filter((v) => inside(v.box));
      // The opening can frame a comparison at a smaller scale than its detail
      // stops. Measure each label where the tour actually shows it whole.
      const k = complete.length ? Math.max(...complete.map((v) => v.k)) : close.k;
      record.phone = Math.max(record.phone, (px / STAGE_PX_PER_UNIT) * phoneUnit * k);
      if (complete.length) record.inView = true;
    };
    const resting = new Map<number, string>();
    const restingText = new Map<number, string>();
    const collisions: string[] = [];
    // The caption hold: the player stops where it begins and the film holds the picture there, so
    // nothing may change after it. A play lands after its last frame is drawn (a morph gets its
    // paths' own structure back), so the first held frame is the resting picture, as in render.
    const holds = v.trace.steps.flatMap((s) =>
      s.hold == null
        ? []
        : [{ step: s.step, from: Math.round(s.hold * v.trace.fps) + 1, to: s.frame1 ?? v.trace.frames }],
    );
    const held = new Map<string, string>(),
      moved = new Set<string>();
    // Cards on screen at each resting picture: a step that ends on a card says its values in a panel.
    const cardsAtRest: Record<string, number> = {};
    await new v.Scene({
      async frame(scene, dt) {
        await motion.frame(scene);
        const hold = dt ? holds.find((h) => scene.frameCount >= h.from && scene.frameCount <= h.to) : undefined;
        if (hold) {
          const svg = toSvgString(scene);
          if (scene.frameCount === hold.from) held.set(hold.step, svg);
          else if (svg !== held.get(hold.step)) moved.add(hold.step);
        }
        if (targets.has(scene.frameCount)) frames.set(scene.frameCount, toSvgString(scene));
        if (completedFrames.has(scene.frameCount)) {
          // The resting picture of a step, without the heading (number, title, line) that names it.
          const all = scene.mobjects;
          scene.mobjects = all.filter((m) => !isHeading(m));
          resting.set(scene.frameCount, toSvgString(scene));
          scene.mobjects = all;
          restingText.set(scene.frameCount, renderText(scene));
          if (scene.currentStep)
            cardsAtRest[scene.currentStep.name] = scene
              .familyMembers()
              .filter((m) => m instanceof Card && (m.style.opacity ?? 1) >= 0.5).length;
          collisions.push(
            ...[...restingTextProblems(scene), ...restingRouteProblems(scene)].map(
              (p) => `${scene.currentStep?.name}: ${p}`,
            ),
          );
        }
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
            if (!staticLabels.has(key)) staticLabels.set(key, { text, px: 0, phone: 0, inView: false });
            const record = staticLabels.get(key)!;
            if (completedFrames.has(scene.frameCount) && readable(m, (owner ?? m).box(), viewport))
              seen(record, px, shown(m.box()), scene.frameCount);
          } else {
            if (!labels.has(m)) labels.set(m, { text, px: 0, phone: 0, inView: false });
            // A camera gliding past does not make a label read: between completed frames a
            // label counts at no more than its size with the camera home.
            const credited = completedFrames.has(scene.frameCount)
              ? px
              : Math.min(px, readingLabelSize(m)! * STAGE_PX_PER_UNIT);
            if (readable(m, m.box(), viewport)) seen(labels.get(m)!, credited, shown(m.box()), scene.frameCount);
          }
        }
      },
    }).run();
    const events = analyzeMotion(motion);
    assert.equal(events.length, 0, `Motion failures ${where}: ${JSON.stringify(events.slice(0, 8))}`);
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
      labels: labels.size,
      completedStepLabels: staticLabels.size,
      // What a reader sees: the labels at 1280 px, and on a 390 px phone in each step's close-up.
      legibility: legibilityReport([...labels.values(), ...staticLabels.values()]),
      // Cards in each step's resting picture: values said in a panel rather than on the drawing.
      cardsAtRest,
      // Each step's words on a phone, estimated, and the steps whose length sets the room for the rest.
      words: wordsReport(v.trace.steps.map((s) => ({ step: s.step, ...stepWords(s) }))),
      // The script gate (explain/script.ts): a declared meta.answer stated by step 2, and how many
      // check questions the page asks. Undeclared parts are reported as missing.
      script,
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

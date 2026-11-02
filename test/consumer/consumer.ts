// A TypeScript consumer of the package, type-checked against the emitted
// declarations in dist/ (npm run check builds them first). 'rayner' resolves
// through package.json "exports", as it would from node_modules. If this stops
// compiling, the public types broke.
import { Scene, Rectangle, Text, Labeled, Arrow, FadeIn, Create, Transform, RIGHT, TEAL, StringSink, traceScene, renderAt, SnapshotSink } from 'rayner';
import type { AnimOpts, TextOpts } from 'rayner';
import {jsonObject} from 'rayner';
const serializedState: import('rayner').JsonObject = jsonObject({count: 1});
void serializedState;
import { TransformMatching, TransformMatchingText } from 'rayner';
import type { MatchingOpts, MatchSummary } from 'rayner';
import { Code, TransformDiff, diffLines, parseUnifiedDiff, renderElements } from 'rayner';
import type { Hunk, TransformDiffOpts, Evidence, StepRecord, ColorSpan, CodeSpan, RenderOptions, Step } from 'rayner';
import { Frame, StateReadout, View, ViewSync, stateView, viewMismatch, Axes, NumberLine, Brace, Circumscribe, SurroundingRectangle, AnimationGroup, Succession, TransformFromCopy, Restore, DOWN } from 'rayner';
import type { FrameFitOpts, SyncOpts, AxesOpts, NumberLineOpts, PlotOpts, BraceOpts, CircumscribeOpts } from 'rayner';
import type {AudioClip, ScoreNote, StepAudio} from 'rayner/explain';
const middleC: ScoreNote = {midi: 60, at: 0, duration: 1};
const scoreClip: AudioClip = {id: 'a', label: 'Middle C', bpm: 96, beats: 4, notes: [middleC]};
const stepScore: StepAudio = {clips: [scoreClip]};
void stepScore;
import type { LetteringRequest } from 'rayner/lettering';

// Both public entrypoints accept the complete request, including outline lettering.
const requestedLettering: LetteringRequest = { scripts: ['Arab'], styles: ['bold'], math: true };
const sameRequest: import('rayner').LetteringRequest = requestedLettering;

export class Demo extends Scene {
  // Lettering on request: the build reads it; the type checks it
  static meta = { id: 'demo', lettering: { scripts: ['Grek', 'Cyrl'] } satisfies LetteringRequest };
  override async construct() {
    this.state = { ok: false };
    await this.step('one', { caption: 'hello' });
    const opts: TextOpts = { fontSize: 0.3, font: 'mono' };
    const box = new Labeled(new Rectangle({ width: 2, height: 1, stroke: TEAL }), new Text('box', opts));
    const a = new Arrow([0, 0], [1, 0], { buff: 0.1 });
    const fade: AnimOpts = { runTime: 0.5 };
    await this.play(new FadeIn(box, { shift: [0, 1] }), new Create(a), fade);
    await this.play(box.animate.shift(RIGHT));
    await this.play(new Transform(a, new Arrow([0, 0], [2, 0])));
    this.state = { ok: true };
  }
}

export async function run(): Promise<number> {
  const sink = new StringSink();
  await new Demo(sink, { fps: 30 }).run();
  const tr = await traceScene(Demo);
  const snap = new SnapshotSink();
  await renderAt(Demo, 0.2, snap);
  return sink.frames.length + tr.steps.length + snap.svg.length;
}

// Matching transforms: options, keys and the pairing report are public types
export function matching(): number {
  const opts: MatchingOpts = { fadeMismatches: false, replace: false, runTime: 2 };
  const text = new TransformMatchingText(new Text('cache'), new Text('cached'), opts);
  const fills = new TransformMatching(new Text('a'), new Text('b'), { key: (part) => part.style.fill });
  const report = (m: TransformMatching): MatchSummary => m.summary();
  return text.runTime + fills.runTime + report.length;
}

// Diff-driven transforms and evidence: hunks, options, colour spans and trace records are public types
export function diffDriven(): number {
  const hunks: Hunk[] = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n');
  const opts: TransformDiffOpts = { hunks: diffLines(['a'], ['b']), runTime: 1.4 };
  const spans: ColorSpan[] = [{ line: 0, from: 0, to: 1, color: '#f97583' }];
  const t = new TransformDiff(new Code(['a']), new Code(['b'], { spans, tabWidth: 2 }), opts);
  const record = (r: StepRecord): Evidence[] => r.evidence ?? [];
  return hunks.length + t.runTime + record.length;
}

// The camera, views, graphs, emphasis, code spans, the state-restoring animations and step hooks
export class Tour extends Scene {
  override async construct() {
    this.state = { n: 1 };
    const fit: FrameFitOpts = { margin: 0.4 };
    const code = new Code(['let n = 1;']);
    await this.play(this.frame.animate.fit(code, fit));
    const frame: Frame = this.frame;
    const readout: View<StateReadout> = stateView(this, ['n'], { place: 'left' });
    const sync: SyncOpts = { match: 'text', runTime: 0.5 };
    this.state = { n: 2 };
    await this.play(new ViewSync(readout, sync));
    const mismatch: string | null = viewMismatch(readout, this.state);
    const axesOpts: AxesOpts = { xRange: [0, 4, 1], yRange: [0, 2, 1] };
    const axes = new Axes(axesOpts);
    const lineOpts: NumberLineOpts = { range: [0, 4, 1] };
    const plot: PlotOpts = { samples: 16 };
    await this.play(new Create(axes), new Create(axes.plot((x) => x / 2, plot)), new Create(new NumberLine(lineOpts)));
    const brace: BraceOpts = { buff: 0.1 };
    const ring: CircumscribeOpts = { shape: 'circle' };
    await this.play(new Create(new Brace(code, DOWN, brace)), new Circumscribe(code, ring), new Create(new SurroundingRectangle(code)));
    const span: CodeSpan = code.token(0, 'n');
    await this.play(span.animate.setFill(TEAL));
    code.saveState();
    await this.play(new Succession([new TransformFromCopy(code, new Code(['n = 2;']).shift(DOWN)), new Restore(code)]));
    this.onStep((s: Step) => s.name);
    this.addDescriber(() => ({ frame: frame.width(), mismatch }));
  }
}

export function cameraRecords(scene: Scene): number {
  const opts: RenderOptions = { relative: false, cull: true };
  return renderElements(scene, opts).length;
}

// The optional outline request and maths mobject are public exports too.
import { Math as Formula } from 'rayner';
import type { LetteringRequest as OutlineRequest } from 'rayner';
export const outlineRequest = { scripts: ['Arab'], math: true, faces: { sans: 'inter' } } satisfies OutlineRequest;
export const formula = () => new Formula('x^2');

import {stage} from 'rayner/explain';
import type {LayoutDirection, StageRegion, DiagramSpec} from 'rayner/explain';
export async function authorLayout(scene: Scene): Promise<void> {
  const direction: LayoutDirection = 'rtl', at: StageRegion = 'start';
  const s = stage(scene, {direction});
  const card = await s.card([['Count', 123]], {at, direction: 'ltr'});
  await s.carry(card, 'end');
  const diagram: DiagramSpec = {source: 'graph RL\nA --> B', lettering: 'natural'};
  await s.show(diagram, {box: 'start'});
}


// Author and wire contracts are checked through the installed public declarations.
function authorContracts(packed: import('rayner').PackedLetteringSnapshot) {
  interface CounterState {count: number}
  class Counter extends Scene<CounterState> {
    override state = {count: 0};
    override async construct() {
      this.state.count++;
      // @ts-expect-error a count cannot become prose
      this.state.count = 'one';
      // @ts-expect-error recognised caption fields are strings
      await this.step('one', {caption: 123});
    }
  }
  const counter = new Counter(new StringSink());
  view(counter, state => new Text(String(state.count)));
  // @ts-expect-error view callbacks retain their scene's state keys
  view(counter, state => new Text(String(state.misspelled)));
  const schedule = new AnimationGroup([]);
  // @ts-expect-error a group schedules animations, it owns no drawable target
  schedule.mobject;
  const expanded = (_value: import('rayner').LetteringSnapshot) => {};
  // @ts-expect-error packed glyph references are not expanded outline paths
  expanded(packed);
  return Counter;
}

import { view } from 'rayner';

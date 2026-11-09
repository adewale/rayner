// A TypeScript consumer of the package, type-checked against the emitted
// declarations in dist/ (npm run check builds them first). 'rayner' resolves
// through package.json "exports", as it would from node_modules. If this stops
// compiling, the public types broke.
import { Scene, Rectangle, Text, Labeled, Arrow, FadeIn, Create, Transform } from 'rayner';
import type { AudioClip, ScoreNote, StepAudio } from 'rayner/explain';
import { TransformFromCopy, Restore } from 'rayner/extras';
import { StringSink, renderAt, SnapshotSink } from 'rayner/output';
import { traceScene } from 'rayner/testing';
import { GrowFromEdge, PulseAlongPath, Line, Dot } from 'rayner';
import type { GrowFromEdgeOpts } from 'rayner';

export function choreography(scene: Scene<{count: number}>) {
  const opts: GrowFromEdgeOpts = { initialScale: 0.01, runTime: 0.5 };
  const grow = new GrowFromEdge(new Rectangle(), [1, 0], opts);
  const pulse = new PulseAlongPath(new Dot(), new Line([0, 0], [2, 0]), { remover: false, fromCurrent: false });
  scene.state = { count: 3 };
  // @ts-expect-error A typed scene's count is a number.
  scene.state = { count: 'three' };
  return [grow, pulse];
}
import type { AnimOpts, TextOpts } from 'rayner';
import { jsonObject } from 'rayner/testing';
const serializedState: import('rayner').JsonObject = jsonObject({count: 1});
void serializedState;
import { TransformMatching, TransformMatchingText } from 'rayner';
import type { MatchingOpts, MatchSummary } from 'rayner';
import { Code, TransformDiff, diffLines, parseUnifiedDiff } from 'rayner';
import { renderElements } from 'rayner/output';
import type { Hunk, TransformDiffOpts, Evidence, ColorSpan, CodeSpan, Step } from 'rayner';
import type { RenderOptions } from 'rayner/output';
import type { StepRecord } from 'rayner/testing';
import { Frame, Axes, NumberLine, Brace, Circumscribe, SurroundingRectangle, AnimationGroup, Succession } from 'rayner';
import { viewMismatch } from 'rayner/testing';
import type { FrameFitOpts, AxesOpts, NumberLineOpts, PlotOpts, BraceOpts, CircumscribeOpts } from 'rayner';
import type { SyncOpts } from 'rayner/explain';
import { palette } from 'rayner/explain';
const middleC: ScoreNote = {midi: 60, at: 0, duration: 1};
const scoreClip: AudioClip = {id: 'a', label: 'Middle C', bpm: 96, beats: 4, notes: [middleC]};
const stepScore: StepAudio = {clips: [scoreClip]};
void stepScore;
import type { LetteringRequest } from 'rayner';

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
    const box = new Labeled(new Rectangle({ width: 2, height: 1, stroke: '#5cd0b3' }), new Text('box', opts));
    const a = new Arrow([0, 0], [1, 0], { buff: 0.1 });
    const fade: AnimOpts = { runTime: 0.5 };
    await this.play(new FadeIn(box, { shift: [0, 1] }), new Create(a), fade);
    await this.play(box.animate.shift([1, 0]));
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
    const s = stage(this, { palette: palette('github-dark'), heading: false });
    const readout: View<Card> = view(this, (st) => card(s, [['n', st.n]], { panel: false, key: 'n' }), { place: false });
    const sync: SyncOpts = { runTime: 0.5 };
    this.state = { n: 2 };
    const syncing: Action = readout.sync(sync);
    await syncing;
    const mismatch: string | null = viewMismatch(readout, this.state);
    const axesOpts: AxesOpts = { xRange: [0, 4, 1], yRange: [0, 2, 1] };
    const axes = new Axes(axesOpts);
    const lineOpts: NumberLineOpts = { range: [0, 4, 1] };
    const plot: PlotOpts = { samples: 16 };
    await this.play(new Create(axes), new Create(axes.plot((x) => x / 2, plot)), new Create(new NumberLine(lineOpts)));
    const brace: BraceOpts = { buff: 0.1 };
    const ring: CircumscribeOpts = { shape: 'circle' };
    await this.play(new Create(new Brace(code, [0, -1], brace)), new Circumscribe(code, ring), new Create(new SurroundingRectangle(code)));
    const span: CodeSpan = code.token(0, 'n');
    await this.play(span.animate.setFill('#5cd0b3'));
    code.saveState();
    await this.play(new Succession([new TransformFromCopy(code, new Code(['n = 2;']).shift([0, -1])), new Restore(code)]));
    this.onStep((s: Step) => s.name);
    this.addJson(() => ({ frame: frame.width(), mismatch }));
  }
}

export function cameraRecords(scene: Scene): number {
  const opts: RenderOptions = { relative: false, cull: true };
  return renderElements(scene, opts).length;
}

// The optional outline request and maths mobject are public exports too.
import { MathTex } from 'rayner';
import type { LetteringRequest as OutlineRequest } from 'rayner';
export const outlineRequest = { scripts: ['Arab'], math: true, faces: { sans: 'inter' } } satisfies OutlineRequest;
export const formula = () => new MathTex('x^2');

import { stage, view } from 'rayner/explain';
import type { View } from 'rayner/explain';
import type {LayoutDirection, StageRegion, DiagramSpec} from 'rayner/explain';
export async function authorLayout(scene: Scene): Promise<void> {
  const direction: LayoutDirection = 'rtl', at: StageRegion = 'start';
  const s = stage(scene, {direction});
  const card = await s.card([['Count', 123]], {at, direction: 'ltr'});
  await s.carry(card, 'end');
  const diagram: DiagramSpec = {source: 'graph RL\nA --> B', lettering: 'natural'};
  await s.show(diagram, {box: 'start'});
}


// Author contracts are checked through the installed public declarations.
function authorContracts() {
  interface CounterState {count: number}
  class Counter extends Scene<CounterState, { lit?: boolean }> {
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
  view(counter, (state, shown) => new Text(`${state.count} ${shown.lit ?? false}`));
  // @ts-expect-error view callbacks retain their scene's shown keys
  view(counter, (_state, shown) => new Text(String(shown.misspelled)));
  const schedule = new AnimationGroup([]);
  // @ts-expect-error a group schedules animations, it owns no drawable target
  schedule.mobject;
  return Counter;
}


// The drawing kit, as an author imports it.
import { label, tile, table, flow, bars, stat, segment, dot } from 'rayner/drawing';
import type { TableColumns, Card, CodeBlock, CodeOptions, CardOptions, CardRow } from 'rayner/drawing';
export function drawingKit(scene: Scene) {
  const s = stage(scene);
  const spread: TableColumns = { left: -6, right: 6 };
  const parts = [
    label(s, 'hit', { at: [0, 1], color: s.look.ink, key: 'hit' }), tile(s, 'D1', { width: 2, height: 1, active: true, key: 'db' }),
    table(s, ['Key', 'Slot'], [['a', 1]], { columns: spread, key: 'slots' }), table(s, ['Key'], [['a']], { columns: { left: 0, gap: 1 }, at: [0, -1], key: 'keys' }),
    flow(s, ['Request', 'Cache', 'Database'], { key: 'request' }), bars(s, [{ label: 'reads', value: 1, display: '1' }], 2, { at: [0, -2], key: 'reads' }),
    stat(s, 'Reads', 1, { at: [3, 0], key: 'read-count' }), segment(s, [0, 0], [1, 1], { color: s.look.soft, strokeWidth: 0.03 }), dot(s, 'A', { at: [-3, 0], active: true }),
  ];
  // @ts-expect-error a table's columns are centres or an edge with a right edge or a gap
  table(s, ['Key'], [['a']], { columns: { right: 2 }, key: 'bad' });
  // @ts-expect-error a flow's parts are keyed, so it needs a key
  flow(s, ['Request']);
  const kept = tile(s, 'D2', { width: 2, height: 1, key: 'db2' }).find('db2:label');
  return [...parts, kept];
}

// What the collection writes, an outside author can write: emphasis a scene draws itself, a card
// and code rebuilt inside a view, a diagram laid out before it is drawn, and colours mixed from the palette.
import { Diagram, diagramResolverOf } from 'rayner/explain';
import type { DiagramResolver, Look } from 'rayner/explain';
import { emphasised, card, code } from 'rayner/drawing';
import { lerpColor } from 'rayner';
export async function publicCollection(scene: Scene): Promise<void> {
  const s = stage(scene);
  s.keep(emphasised(new SurroundingRectangle(new Text('slot')), 'outlined: the full slot'));
  const panel = new Rectangle({ fill: s.look.raised, stroke: s.look.rule }).setFill(lerpColor(s.look.paper, s.look.emphasis, 0.36));
  view(scene, (state) => card(s, [['State', String(state.status ?? 'idle')]], { width: 4, at: 'start', lit: { row: 'State', as: 'now' } }), { place: false });
  const lit: CodeOptions['lit'] = { lines: [0, 1], as: 'run' };
  const listing: View<CodeBlock> = view(scene, () => code(s, ['let a = 1;', 'a += 1;'], { at: 'end', lit }), { place: false });
  const direction: LayoutDirection = s.direction;
  // The panels are built by the kit, never constructed: Card and CodeBlock are types only.
  // @ts-expect-error Card is exported as a type, so a scene cannot construct one
  const constructed = () => new Card();
  void [listing, direction, constructed];
  const spec: DiagramSpec = { source: 'graph LR\nA --> B' };
  const resolver: DiagramResolver = diagramResolverOf(scene);
  const plan = new Diagram(scene, spec, await resolver.diagram(spec), { box: 'main' });
  // A diagram part's shapes and labels, addressed by the part's id rather than by child index.
  const outline = plan.shapes('A')[0], words: string | undefined = plan.labels('A')[0]?.text;
  const look: Look = s.look;
  void [panel, plan.get('A'), outline, words, look.muted, s.backdrop, plan.emphasis];
}

// The rest of what the collection's scenes import, and the members they use, written as an outside
// author writes them. Every view draws from its state.
import { Group, Mobject, VMobject, Circle, Polygon, Arc, Cross, CurvedArrow, BraceLabel, DecimalNumber, ItalicText, FadeOut, LaggedStart, Animation, TransformMatchingShapes, matchByKey, linear, smooth, rushInto, rushFrom, thereAndBack, shaperFor } from 'rayner';
import type { Box, Vec, SceneState, ScheduledAnimation, MatchKey, FadeOpts, FontName, SceneClass, Sink, Style } from 'rayner';
import { callout, dimension, pin, legend, keyed, keyedParts } from 'rayner/drawing';
import { Machine, refuse, isRefusal, answerOf, settingsOf, resolveSettings, regionBox, mermaid } from 'rayner/explain';
import type { Refusal, Transition, Choreography, NoteSide, PictureNote, DiagramPicture, Palette, Stage, ExplainerClass, ExplainerMeta, Setting, StepKind, Description } from 'rayner/explain';
import { Write, MoveAlongPath, Square, Underline, ArcBetweenPoints } from 'rayner/extras';
import { seenFrom, seenPictures, depthOrder, latLon, toLatLon, greatArc, circleOn, between, project } from 'rayner/geo';
import type { Model3D, Part, SeenPiece, SeenOptions, SeenPicture, Vec3, Viewpoint } from 'rayner/geo';
import { NullSink, indexScene, stepTime, renderText, toSvgString } from 'rayner/output';
import { InvariantSink } from 'rayner/testing';
import type { InvariantFailure } from 'rayner/testing';

/** A custom animation: it overrides the public hooks, as a recipe's does. */
class Pulse extends Animation {
  protected override doInterpolate(alpha: number): void { this.mobject.setOpacity(0.5 + 0.5 * thereAndBack(alpha)); }
}

type Door = { door: 'open' | 'closed' };
type DoorEvent = 'open' | 'close';
const doorNext = <S extends Door>(state: S, event: DoorEvent): S | Refusal =>
  event === 'open' ? (state.door === 'open' ? refuse('the door is open already') : { ...state, door: 'open' }) : state.door === 'closed' ? refuse('the door is closed already') : { ...state, door: 'closed' };
type CollectionModel = Door & { status: string; count: number };
// @ts-expect-error A misspelt meta key does not compile.
export const misspelt = { id: 'x', titel: 'X' } satisfies ExplainerMeta;
// @ts-expect-error So does a misspelt player key.
export const misspeltPlayer = { player: { acent: true } } satisfies ExplainerMeta;
// A step's kind is the explain layer's, declared on the engine's StepMeta once rayner/explain is loaded.
export const detail: StepKind = 'detail';
export const stepMeta = (scene: Scene) => scene.step('aside', { title: 'Aside', line: 'A line', caption: 'Words.', kind: detail });
// @ts-expect-error A kind outside short, main and detail does not compile.
export const badKind = (scene: Scene) => scene.step('aside', { kind: 'details' });
// What a card's, code panel's or diagram's describe() returns.
export const words = (d: Description) => d.parts.map((p) => `${p.name}${p.mark ? ` (${p.mark})` : ''}`).join(', ') || d.what;

export class Collection extends Scene<CollectionModel> {
  static meta = { id: 'collection', title: 'What the collection uses', answer: 'Every part of it.', player: { corners: 'square' } } satisfies ExplainerMeta;
  static settings = [{ id: 'case', label: 'Case', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] satisfies readonly Setting[];
  override state = { door: 'open' as 'open' | 'closed', status: 'start', count: 0 };
  override async construct() {
    const s: Stage = stage(this);
    const values = settingsOf(this);
    const resolved = resolveSettings(Collection, values);
    const answer: string = answerOf(this);
    await this.step('shapes', { title: 'Shapes', caption: `${answer} ${resolved.case}` });
    const box: Box = regionBox('main', { top: 3 });
    const at: Vec = [box[0], box[3]];
    const parts = keyedParts();
    const ring = parts.add(new Circle({ radius: 0.4, stroke: s.look.ink }), 'ring');
    parts.add(new Polygon([[0, 0], [1, 0], [0, 1]], { stroke: s.look.soft }), 'triangle');
    parts.add(new Arc({ radius: 0.5, angle: Math.PI }), 'arc');
    parts.add(new Cross(ring), 'cross');
    parts.add(new CurvedArrow([0, 0], [1, 1]), 'curve');
    parts.add(new BraceLabel(ring, 'r', [0, -1]), 'brace');
    parts.add(new DecimalNumber(3.14, { decimals: 2 }), 'pi');
    parts.add(new ItalicText('aside'), 'aside');
    const picture: Group = parts.group();
    const shapes: readonly Mobject[] = picture.children;
    const path: VMobject = new Circle({ radius: 1 });
    const style: Style = { stroke: s.look.emphasis };
    path.setStyle(style);
    const fade: FadeOpts = { shift: [0, 0.2], rateFunc: smooth };
    await s.enter(keyed(picture, 'shapes'));
    const all: ScheduledAnimation[] = [new LaggedStart(shapes.map((m) => new Pulse(m, { rateFunc: linear }))), new MoveAlongPath(new Dot(), path, { rateFunc: rushInto })];
    await this.play(...all);
    await this.play(new FadeOut(picture, fade), new Write(new Text('done')), new ArcBetweenPoints(at, [0, 0]).animate.shift([0, 1]));
    await s.clear();

    await this.step('kit', { title: 'The kit', caption: 'A callout, a dimension, a pin and a legend.' });
    const square = new Square({ side: 1 });
    await s.enter(
      square, new Underline(square),
      callout(s, square, 'a unit square', { side: 'right', key: 'note' }),
      dimension(s, [-0.5, -0.8], [0.5, -0.8], '1', { key: 'width' }),
      pin(s, [0, 0], { label: 'centre', key: 'centre' }),
      legend(s, [{ label: 'square', fill: s.look.ink }], { at: [3, 2], stack: 'row', key: 'legend' }),
    );
    await s.focus(square, { margin: 0.6 });
    await s.focus('all');
    await s.clear();

    await this.step('door', { title: 'A machine', caption: 'Open and close the door.' });
    const door = view(this, (st) => keyed(new Text(st.door === 'open' ? 'Open' : 'Closed', { color: s.look.ink }), 'door'));
    const machine = new Machine<CollectionModel, DoorEvent>(this, {
      start: { door: 'open', status: 'start', count: 0 }, events: ['open', 'close'], next: doorNext, views: [door],
      transition: { close: (t: Transition<CollectionModel, DoorEvent>) => { const c: Choreography = t.choreograph(door); return c.morph('door', { rateFunc: rushFrom }); } },
    });
    await s.enter(door);
    await this.play(machine.send('close'));
    await this.play(machine.replay(['open', 'close']));
    const refused = doorNext({ door: 'closed' }, 'close');
    this.state.status = isRefusal(refused) ? refused.reason : 'moved';

    await this.step('code', { title: 'Code', caption: 'A code panel and a card, drawn from the state.' });
    const panel: CodeBlock = await s.code(['let n = 0;', 'n += 1;'], { lit: { lines: 1 } });
    const rows: CardRow[] = [['Count', 0]], opts: CardOptions = { width: 3 };
    const count = view(this, (st) => card(s, [['Count', st.count]], opts), { place: false });
    await s.enter(count);
    this.state.count = rows.length;
    await this.play(count.sync(), new TransformMatchingShapes(new Text('n'), new Text('n + 1'), { runTime: 0.5 }));
    void panel.marks;

    await this.step('diagram', { title: 'A diagram', caption: 'A diagram drawn from the state.' });
    const d = await s.show({ source: mermaid.frontMatter({ theme: 'base' }) + 'graph LR\nA --> B' }, { box: 'main' });
    const side: NoteSide = 'above';
    const notes: PictureNote[] = [{ id: 'A', text: 'start', side }];
    const shown = s.diagramView(d, (st): DiagramPicture => ({ marks: st.status === 'moved' ? { A: s.look.emphasis } : {}, notes }));
    this.state.status = 'moved';
    await this.play(shown.sync());
    const marked: Mobject = d.picture({ A: { color: s.look.emphasis, as: 'the start' } });
    void [marked, d.order, d.visible.size, d.snapshot.parts.length];
    s.liveDiagram(d);
  }
}

export async function globe(scene: Scene): Promise<number> {
  const viewpoint: Viewpoint = { kind: 'orthographic', yaw: 10, pitch: 20 };
  const london: Vec3 = latLon(51.5, -0.1), tokyo: Vec3 = latLon(35.7, 139.7);
  const parts: Part[] = [
    { kind: 'path', key: 'route', lines: [greatArc(london, tokyo)], color: '#d9480f' },
    { kind: 'path', key: 'equator', lines: [circleOn([0, 0, 1], 90)], color: '#888888' },
    { kind: 'point', key: 'london', at: london, color: '#000000' },
  ];
  const model: Model3D = { body: { radius: 1, fill: '#eeeeee', stroke: '#333333' }, parts };
  const options: SeenOptions = { scale: 2, key: 'globe' };
  const turned = between(viewpoint, { ...viewpoint, yaw: 40 }, 0.5);
  const picture = seenFrom(model, turned, options);
  scene.add(picture);
  const drawn: SeenPicture[] = seenPictures(picture).map((g) => (g as Group & { seenPicture: SeenPicture }).seenPicture);
  const seen = (picture.children[0] as Mobject & { seen?: SeenPiece }).seen;
  const order = depthOrder(picture);
  const { at } = project(tokyo, turned, 1, options);
  return drawn.length + (seen ? 1 : 0) + (order === true ? 1 : 0) + at[0] + toLatLon(tokyo).lat;
}

export async function hostPage(Explainer: SceneClass): Promise<string> {
  const index = await indexScene(Explainer);
  const time = stepTime(index, 'door') ?? 0;
  const sink: Sink = new NullSink();
  const scene = new Explainer(sink);
  await scene.run();
  const invariants = new InvariantSink();
  const failures: InvariantFailure[] = invariants.failures;
  const key: MatchKey = matchByKey({ text: 'whole' });
  const state: SceneState = scene.state;
  const font: FontName = 'mono';
  return `${time} ${renderText(scene).length} ${toSvgString(scene).length} ${failures.length} ${key(scene.mobjects[0]!, scene.mobjects[0]!)} ${Object.keys(state)} ${shaperFor(font)('x', 1).width}`;
}

export function colours(palette: Palette): string {
  return palette.ink;
}

import { loadProject, loadSnapshots, pictureWordsAt, diagramFindings } from 'rayner/testing';
import type { LoadedProject, LoadedScenario, PictureWords } from 'rayner/testing';
import type { Finding } from 'rayner/explain';

export async function authorTest(Explainer: SceneClass, folder: string): Promise<string> {
  const project: LoadedProject = await loadProject(Explainer, folder);
  const first: LoadedScenario = project.scenario();
  const words: PictureWords = pictureWordsAt(first.trace, first.trace.steps[0]!.step);
  const findings: Finding[] = Object.values(await loadSnapshots(folder)).flatMap((s) => diagramFindings(s));
  return `${project.scenarios.length} ${Object.keys(project.snapshots).length} ${words.summary} ${words.full} ${words.transcript} ${findings.length}`;
}

import type { Action } from 'rayner/explain';

/** Stage and diagram actions: awaited one by one, or composed into one play or a Succession, with what each gives typed. */
export class Composed extends Scene {
  override async construct() {
    const s = stage(this, { style: 'nord' });
    await this.step('compose', { title: 'Composed', caption: 'A card and a camera move in one play, then a walk.' });
    const d: Diagram = await s.show({ source: 'graph LR\nA --> B' });
    const entry: Action<Card> = s.card([['count', 1]], { at: 'end' });
    const card: Card = entry.value;
    await this.play(s.focus(d.get('A')), entry, new FadeIn(new Rectangle({ width: 1, height: 1 }), { runTime: 0.9 }));
    await this.play(new Succession([d.walk([['A', 'B']]), s.callout(card, 'one'), s.focus('all')]));
    const panel: CodeBlock = code(s, ['x = 1']);
    const walked: Action = d.walk([['A', 'B']]);
    await this.play(new AnimationGroup([walked, s.enter(panel)]));
  }
}

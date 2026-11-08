import { Mobject, Group, Rectangle, Circle, Text, FadeIn, FadeOut, Transform, Create } from '../src/index.ts';
import { View } from './view.ts';
import { cloneJson } from '../src/json.ts';
import type { Scene, Vec, Box, FadeOpts, Animation, SceneColors } from '../src/index.ts';
import { center, unionBoxes } from '../src/box.ts';
import { STAGE_BOX, atHome } from '../src/svg.ts';
import { isDetail, teaching } from './script.ts';
import type { StepKind } from './script.ts';
import type { StepAudio } from './audio.ts';
import { tool, Sketch, oneStrokeEach } from './annotate.ts';
import * as kit from './drawing.ts';
import type { LegendItem } from './annotate.ts';
import type { Side, ToolKind } from './annotate.ts';
import { Diagram } from './diagrams.ts';
import { Action } from './action.ts';
import type { Plan } from './action.ts';
import type { ShowOptions, PictureNote } from './diagrams.ts';
import type { Card, CodeBlock, CardRow, CardOptions, CodeOptions } from './panels.ts';
import { card, code } from './drawing.ts';
import { resolverOf } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSpec, DiagramSnapshot } from '../integrations/agentic-mermaid/snapshot.ts';
import type { Palette } from '../src/color.ts';
import { palette } from './palettes.ts';
import { soft, emphasis, bad, lookOf, bindStagePalette, regionBox, opening, partsSeen, REGIONS } from './look.ts';
import type { Region, Look } from './look.ts';
import { picture, shownNames } from './trace.ts';
import { wordsOf, langOf } from './words.ts';
import type { Description } from './trace.ts';
import { layoutDirection, physicalAt } from './layout-direction.ts';
import type { LayoutDirection } from './layout-direction.ts';

/** Physical regions retain their coordinates; start/end follow the stage's direction. */
export type StageRegion = Region | 'start' | 'end';

export interface StageOptions {
  /** Default card field order and the meaning of logical start/end regions. */
  direction?: LayoutDirection;
  /** An Agentic Mermaid style: the stage's palette and the style of every diagram that names none. */
  style?: string;
  /** Colours for a stage that differ from its style's (or that has no diagrams). */
  palette?: Palette;
  /**
   * What the heading shows. By default it follows each step's `title`, so the
   * stage itself (poster, still) says which idea is on screen.
   * A string fixes it; `false` leaves the whole frame to the scene.
   */
  heading?: 'step' | string | false;
  /** The heading's font size; at the default 0.36 it is under 12 px on a 390 px phone, at 0.5 about 12. */
  headingSize?: number;
  /** Number each step's heading (a circled 1, 2, 3 before the title). On by default when the heading follows the steps. */
  numbered?: boolean;
}
/** `enter: false` makes the panel and keeps it without playing, for `s.enter` to bring in with others. */
type Entry = { enter?: boolean };
/**
 * What kept native objects show, in words, for the description: a sentence, or a
 * function for a drawing that changes. Without it, their visible text is listed.
 */
export type Describe = { describe?: string | (() => string) };

/**
 * One step of a stepped explanation: its words, the state it records, and its picture as a
 * function of that state. `rayner check` redraws every step from the state its trace recorded,
 * after the run, and fails a step whose picture differs: a `draw` that reads anything another
 * step changes, rather than its own state, cannot pass.
 */
export interface StagedStep<S extends object = Record<string, unknown>> {
  id: string;
  title: string;
  line: string;
  caption: string;
  /** The step's model (JSON): it becomes the scene's state, and the trace records it. */
  state: S;
  /** The step's picture, from its state alone; the stage gives its palette and helpers. */
  draw: (state: S, stage: StageApi) => Mobject;
  audio?: StepAudio;
  /** Which path this step is on, when not the list's (see StagedStepsOptions). */
  kind?: StepKind;
  /** Keys of the parts the step is about, when that is less than the whole picture: a phone opens on them. */
  opening?: readonly string[];
  /**
   * What the picture shows, in words, from the step's state: for a picture whose meaning is its
   * geometry rather than its labels. Without it the picture is described by its text. Either way,
   * a part that describes itself (a card, a code panel, a note, a dimension line) is described by
   * its own words as well.
   */
  describe?: (state: S) => string;
}
/** A staged step of each of the state types `S` holds: a list element whose step is one of several. */
type StepOf<S> = S extends object ? StagedStep<S> : never;
/** Options for `stage.steps`: `kind` puts every step on that path (default 'main'). */
export interface StagedStepsOptions { kind?: StepKind }
/** A picture's text and each part's box, rounded: what a redraw must reproduce. */
export function pictureFingerprint(m: Mobject): string {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return JSON.stringify(m.family().map((x) => [x.constructor.name, x instanceof Text ? x.text : null, x.box()?.map(round) ?? null]));
}
// The stage, for a step's draw; declared structurally so StagedStep can name it inside stage().
type StageApi = Stage;

/**
 * Part of the stage's heading: its title (role `'heading'`), or its number, line or band
 * (`'chrome'`), or inside one of them. Everything that leaves the heading out of a picture
 * (the checks, the phone close-ups, the text drawing agents read) asks here, so a part
 * added to the heading is left out everywhere at once.
 */
export function isHeading(m: Mobject): boolean {
  for (let x: Mobject | null = m; x; x = x.parent) if (x.role === 'heading' || x.role === 'chrome') return true;
  return false;
}
/**
 * Stage furniture: the backdrop, or part of the heading (isHeading), or inside one of them; with
 * `frame`, a diagram's frame (role `'frame'`) too. It frames every step and says nothing about
 * where to look, so the close-ups, the review and the layout checks leave it out.
 */
export function isFurniture(m: Mobject, { frame = false }: { frame?: boolean } = {}): boolean {
  for (let x: Mobject | null = m; x; x = x.parent) if (x.role === 'backdrop' || (frame && x.role === 'frame')) return true;
  return isHeading(m);
}
/** The stage's backdrop (role `'backdrop'`), or undefined for a scene drawn without a stage. */
export const backdropOf = (scene: Scene): Mobject | undefined => scene.mobjects.find((m) => m.role === 'backdrop');
/**
 * The colour of the stage's paper (its look's `paper`, the backdrop's fill) as `scene` has it, or
 * undefined for a scene drawn without a stage. Player palette cues are opt-in through `meta.player`.
 */
export const paperOf = (scene: Scene): string | undefined => backdropOf(scene)?.style.fill;
const stagePalettes = new WeakMap<Scene, () => Palette>();
/** The scenes that have a stage: stage() runs once per scene. */
const staged = new WeakSet<Scene<any, any>>();
/** The stage's final palette, including a palette adopted from a diagram. */
export const paletteOf = (scene: Scene): Palette | undefined => stagePalettes.get(scene)?.();
const isOptions = (v: unknown): v is object => !!v && !(v instanceof Mobject);
/** The colours engine defaults take on a stage with this palette: its look's paper, ink, soft, emphasis and bad. */
export const sceneColors = (p: Palette): SceneColors => ({ paper: p.paper, ink: p.ink, soft: soft(p), emphasis: emphasis(p), bad: bad(p) });
const HEADING_Y = 3.8;
/** With a line under it, the heading moves up to make room. */
const HEADING_Y_WITH_LINE = 3.98;
/** A step's `line`: one line under the heading, in the soft colour. */
const LINE_SIZE = 0.3;
/** The widest the heading and its line may be, in scene units. */
const CHROME_WIDTH = 14.6;
/** Where content goes when the camera focuses on it: the stage below the heading and its line. */
const CONTENT: Readonly<Box> = REGIONS.full;

/** What a diagram's view draws from the state (see diagramView): its marks, notes and the parts left undimmed, as `d.picture` takes them. */
export interface DiagramPicture {
  marks?: Readonly<Record<string, string | { color: string; as?: string }>>;
  notes?: readonly PictureNote[];
  dim?: readonly string[] | null;
  prefix?: string;
}
/**
 * The stage on `scene`: its palette, heading, regions, diagrams and panels, and the helpers that
 * enter, keep and clear what it shows. Typed from the scene (`Scene<S, Sh>`), so the draws it takes
 * (`diagramView`'s) read the scene's model and shown types.
 */
export function stage<S extends object, Sh extends object>(scene: Scene<S, Sh>, options: StageOptions = {}) {
  // A second stage would add a second backdrop, heading and step listeners over the first.
  if (staged.has(scene)) throw new Error('stage(): the scene has a stage already; call stage(this) once and keep what it returns');
  // Each caption owns its opening; a previous step's subjects must not leak, unless opening(..., { keep: true })
  // named them for every step that follows.
  let kept: Mobject[] = [];
  /** Each diagram shown by a view of the state (diagramView): the view and what it draws. */
  const diagramViews = new Map<Diagram, { draw: (state: S, shown: Sh) => DiagramPicture; view: View<Mobject, S, Sh> }>();
  scene.onStep(() => opening(scene, ...kept));
  const direction = layoutDirection(options, 'ltr', 'stage()');
  const physical = <T extends Vec | Box | StageRegion | undefined>(at: T): Exclude<T, 'start' | 'end'> | Region =>
    physicalAt(at, direction) as Exclude<T, 'start' | 'end'> | Region;
  // Without a style or palette, the stage adopts the first diagram's palette, and only the first's.
  let adopt = !options.palette && !options.style;
  let colors = options.palette ?? palette(options.style ?? 'nord');
  stagePalettes.set(scene, () => ({ ...colors }));
  /** The look of the palette as it is now: computed again only when a colour of it changes. */
  const paletteKey = (p: Palette) => `${p.paper} ${p.ink} ${p.accent} ${p.muted}`;
  let looked = { from: paletteKey(colors), look: lookOf(colors) };
  // Engine defaults (a Text with no colour, an Axes, a SurroundingRectangle) take the stage's palette.
  scene.colors = sceneColors(colors);
  const mode = options.heading ?? 'step';
  const backdrop = new Rectangle({ width: 16, height: 9, fill: colors.paper, stroke: 'none' });
  backdrop.role = 'backdrop';
  scene.add(backdrop);
  const numbered = options.numbered ?? mode === 'step';
  const headingSize = options.headingSize ?? 0.36;
  /**
   * The heading, at home (camera at rest): the title, a circled step number before it when
   * numbered, and the step's line under it. The number and line have the role `'chrome'`: like the
   * heading they belong to the stage, not the picture a step leaves.
   */
  const makeChrome = (text: string, line: string, number: number | null, step: string) => {
    const t = scene.text(text, { fontSize: headingSize, color: colors.ink, weight: 'bold' });
    t.role = 'heading';
    const y = line ? HEADING_Y_WITH_LINE : HEADING_Y;
    const parts: Mobject[] = [];
    let badge: Group | null = null;
    if (number != null && text) {
      const r = headingSize * 0.62;
      const digit = scene.text(String(number), { fontSize: headingSize * 0.72, color: emphasis(colors), weight: 'bold' });
      badge = new Group(
        new Circle({ radius: r, stroke: emphasis(colors), strokeWidth: headingSize * 0.06, fill: 'none' }),
        digit,
      );
      badge.role = 'chrome';
    }
    const badgeW = badge ? headingSize * 1.24 + headingSize * 0.5 : 0;
    if (t.width() + badgeW > CHROME_WIDTH) t.setWidth(CHROME_WIDTH - badgeW);
    t.moveTo([badgeW / 2, y]);
    if (badge) {
      badge.moveTo([t.box()![0] - headingSize * 0.5 - headingSize * 0.62, y]);
      (badge.children[1] as Text).moveTo(badge.children[0]!.center());
      parts.push(badge);
    }
    if (line) {
      const l = scene.text(line, { fontSize: LINE_SIZE, color: soft(colors) });
      if (l.width() > CHROME_WIDTH)
        throw new Error(
          `this.step(): the line of step ${JSON.stringify(step)} is ${l.width().toFixed(1)} units wide, longer than one line under the heading (${CHROME_WIDTH}); shorten it`,
        );
      l.moveTo([0, t.box()![1] - 0.08 - l.height() / 2]);
      l.role = 'chrome';
      parts.push(l);
    }
    return { heading: t, chrome: parts };
  };
  const first = makeChrome(typeof mode === 'string' && mode !== 'step' ? mode : '', '', null, '');
  let heading = first.heading;
  let chrome: Mobject[] = [];
  /**
   * A paper band behind the heading. Invisible at home, where content keeps below the heading;
   * while the camera is away, zoomed content passes under it instead of through the title.
   */
  const band = new Rectangle({ width: 16, height: 4.5 - CONTENT[3], fill: colors.paper, stroke: 'none' }).moveTo([
    0,
    (4.5 + CONTENT[3]) / 2,
  ]);
  band.style.opacity = 0;
  band.role = 'chrome';
  scene.add(band, heading);
  /** Each heading part's home placement; the camera maps it to the screen while it is away. */
  const home = new Map<Mobject, Mobject>([
    [heading, heading.copy()],
    [band, band.copy()],
  ]);
  /** The heading, its band, number and line draw last, over anything added after them. */
  const onTop = () => {
    const top = [band, heading, ...chrome].filter((m) => scene.mobjects.includes(m));
    scene.mobjects = [...scene.mobjects.filter((m) => !top.includes(m)), ...top];
  };
  const add = scene.add.bind(scene);
  scene.add = (...mobs: Mobject[]) => {
    add(...mobs);
    onTop();
    return scene;
  };
  /** A camera map from home to the world: world = shift + k × home. */
  type CameraMap = { k: number; shift: Vec };
  const HOME: CameraMap = { k: 1, shift: [0, 0] };
  /** The box the stage last moved the camera to, with its map computed exactly from that box. */
  let aimed: { box: Box; map: CameraMap } | null = null;
  /**
   * The camera's map now, from the box `scene.frame` shows, so a camera the scene moved itself (a
   * Transform of `this.frame`) is followed too. Where the frame is the box the stage moved it to, the
   * map is the one computed from that box, free of the frame's float32 rounding.
   */
  const camera = (): CameraMap => {
    const b = scene.frame.box() ?? [...STAGE_BOX] as Box;
    if (aimed && b.every((v, i) => Math.abs(v - aimed!.box[i]!) < 1e-4)) return aimed.map;
    if (atHome(b)) return HOME;
    return { k: (b[2] - b[0]) / 16, shift: center(b) };
  };
  const pinned = (m: Mobject, v: CameraMap) => {
    const at = home.get(m)!.copy();
    at.scale(v.k, { aboutPoint: [0, 0] });
    for (const x of at.family()) if (x.style.strokeWidth) x.style.strokeWidth *= v.k;
    return at.shift(v.shift);
  };
  /** Kept objects, each with what describes it (several kept together share one). */
  const overlays = new Map<Mobject, (() => string) | undefined>();
  const diagrams = new Set<Diagram>();

  async function setHeading(text: string, line: string, number: number | null, step: string): Promise<void> {
    const next = makeChrome(text, line, number, step);
    const was = [heading.text, ...chrome.map((c) => (c as { text?: string }).text ?? '')].join('|'),
      now = [next.heading.text, ...next.chrome.map((c) => (c as { text?: string }).text ?? '')].join('|');
    if (was === now && chrome.length === next.chrome.length) return;
    // Away from home, the new heading arrives where the camera shows the old one.
    const view = camera();
    for (const m of [next.heading, ...next.chrome]) {
      home.set(m, m.copy());
      if (view.k === 1 && !view.shift[0] && !view.shift[1]) continue;
      m.scale(view.k, { aboutPoint: [0, 0] });
      for (const x of m.family()) if (x.style.strokeWidth) x.style.strokeWidth *= view.k;
      m.shift(view.shift);
    }
    const anims = [];
    if (heading.text) anims.push(new FadeOut(heading, { runTime: 0.3 }));
    else scene.remove(heading);
    for (const c of chrome) anims.push(new FadeOut(c, { runTime: 0.3 }));
    if (text) anims.push(new FadeIn(next.heading, { runTime: 0.3 }));
    for (const c of next.chrome) anims.push(new FadeIn(c, { runTime: 0.3 }));
    for (const m of [heading, ...chrome]) home.delete(m);
    heading = next.heading;
    chrome = next.chrome;
    if (!text) scene.add(heading);
    if (anims.length) await scene.play(...anims);
  }
  // Follow step titles (and lines) without asking authors to repeat them.
  if (mode === 'step')
    scene.onStep((s) =>
      setHeading(
        typeof s.meta.title === 'string' ? s.meta.title : '',
        typeof s.meta.line === 'string' ? s.meta.line.trim() : '',
        // The step's own number: teaching steps so far, itself included (the scene has pushed it).
        numbered && !isDetail(s) ? teaching(scene.steps).length : null,
        s.name,
      ),
    );
  /**
   * What a sighted reader sees: diagrams, then each kept object's parts that describe themselves
   * (cards, code, notes, dimension lines, wherever they sit, a view's current picture included) and
   * its `describe`, then other kept text.
   */
  function look(): Description[] {
    const w = wordsOf(scene);
    const present = new Set(scene.familyMembers());
    const seen: Description[] = [];
    for (const d of diagrams) if (present.has(d.root) || (d.shownBy && present.has(d.shownBy))) seen.push(d.describe());
    const told = new Set<() => string>();
    const labels: string[] = [];
    let blank = 0;
    for (const [m, describe] of overlays) {
      if (!present.has(m)) continue;
      // A part that describes itself says so whatever else describes the object; `describe` speaks for the rest.
      const parts = partsSeen(m, (t) => !!t.text.trim() && (t.style.opacity ?? 1) >= 0.5);
      seen.push(...parts.seen);
      if (describe) {
        if (!told.has(describe)) seen.push({ what: describe(), parts: [] });
        told.add(describe);
      } else {
        labels.push(...parts.words);
        if (!parts.words.length && !parts.seen.length) blank++;
      }
    }
    if (labels.length) seen.push({ what: w.count(labels.length, w.label), parts: labels.map((name) => ({ name })) });
    if (blank)
      seen.push({
        what: '',
        parts: [],
        blank: [`${blank} kept drawing${blank > 1 ? 's' : ''} with no text: give s.keep or s.enter a describe`],
      });
    return seen;
  }
  // Each step's state records its resting picture and what changed since the step began.
  let before = new Set<string>();
  scene.onStep(() => {
    before = shownNames(look());
  });
  scene.addJson(() => ({ picture: picture(look(), before, langOf(scene)) }), 'shown');
  const keepAll = (mobs: Mobject[], { describe }: Describe) => {
    const say = typeof describe === 'string' ? () => describe : describe;
    for (const m of mobs) overlays.set(m, say);
  };
  /**
   * Annotations are sized for the screen: the kit builds each in home coordinates from the points the
   * camera shows, then it is mapped into the world as the heading is, so a zoomed camera shows it at size.
   */
  const toScreen = (p: Vec, view: CameraMap): Vec => [(p[0] - view.shift[0]) / view.k, (p[1] - view.shift[1]) / view.k];
  function onScreen<T extends Mobject>(m: T, view: CameraMap): T {
    if (view.k === 1 && !view.shift[0] && !view.shift[1]) return m;
    m.scale(view.k, { aboutPoint: [0, 0] });
    for (const x of m.family()) if (x.style.strokeWidth) x.style.strokeWidth *= view.k;
    m.shift(view.shift);
    return m;
  }
  /** The camera box that shows `target` in the content area below the heading. */
  function viewFor(target: Mobject | readonly Mobject[] | Box, margin: number): Box {
    let b: Box | null;
    if (Array.isArray(target) && typeof target[0] === 'number') b = target as Box;
    else {
      const mobs = (Array.isArray(target) ? target : [target]) as Mobject[];
      b = unionBoxes(mobs.map((m) => m.box()));
      if (!b) throw new Error('s.focus(): nothing to look at; give mobjects that are drawn, a box, or \'all\'');
    }
    const w = b[2] - b[0] + 2 * margin,
      h = b[3] - b[1] + 2 * margin;
    const z = Math.max(
      1,
      Math.min((CONTENT[2] - CONTENT[0]) / Math.max(w, 1e-6), (CONTENT[3] - CONTENT[1]) / Math.max(h, 1e-6)),
    );
    const cc = center(CONTENT),
      tc = center(b);
    const hw = 8 / z,
      hh = 4.5 / z;
    // Put the target's centre where the content area's centre is on screen, then keep the view on the stage.
    const cx = Math.min(8 - hw, Math.max(-8 + hw, tc[0] - cc[0] / z)),
      cy = Math.min(4.5 - hh, Math.max(-4.5 + hh, tc[1] - cc[1] / z));
    return [cx - hw, cy - hh, cx + hw, cy + hh];
  }
  /**
   * The animations that move the camera to `box`, with the heading's parts moving in step so
   * they stay put on screen: the camera's map from home is linear in the box, so both
   * interpolate together exactly.
   */
  function cameraTo(box: Box, runTime: number): Animation[] {
    const k = (box[2] - box[0]) / 16,
      next = { k, shift: center(box) };
    const anims: Animation[] = [new Transform(scene.frame, scene.frame.copy().fit(box, { margin: 0 }), { runTime })];
    for (const m of [heading, ...chrome]) if (home.has(m)) anims.push(new Transform(m, pinned(m, next), { runTime }));
    const away = Math.abs(k - 1) > 1e-9 || Math.abs(next.shift[0]) > 1e-9 || Math.abs(next.shift[1]) > 1e-9;
    const banded = pinned(band, next);
    banded.style.opacity = away ? 0.94 : 0;
    anims.push(new Transform(band, banded, { runTime }));
    aimed = { box: [...box] as Box, map: next };
    return anims;
  }
  /** An action of the stage's (see Action): it is decided now and plays when awaited or composed. */
  const act = <T>(name: string, make: () => Plan<T>, more?: { ready?: Promise<unknown>; late?: boolean }) =>
    new Action<T>(scene, name, make, more);
  /** Keep `panel` and fade it in over `fade.runTime`, or with `enter: false` only keep it. */
  function enterPanel<T extends Mobject>(panel: T, { enter = true }: Entry, fade: FadeOpts & { runTime: number }): Plan<T> {
    return {
      value: panel,
      start: () => overlays.set(panel, undefined),
      beats: enter ? [{ runTime: fade.runTime, play: () => [new FadeIn(panel, fade)] }] : [],
    };
  }
  /** Keep `g`, which describes itself, and play it in with `entry` over `runTime`. */
  function drawIn<T extends Mobject>(g: T, runTime: number, entry: () => Animation): Plan<T> {
    return { value: g, start: () => keepAll([g], {}), beats: [{ runTime, play: () => [entry()] }] };
  }

  const api = {
    scene,
    backdrop,
    get heading() {
      return heading;
    },
    /**
     * The colours to draw with, each reading on the stage's paper: paper, ink, soft, emphasis,
     * good, bad, raised, rule and muted (see Look). The stage's helpers colour from the same look.
     */
    get look(): Look {
      if (looked.from !== paletteKey(colors)) looked = { from: paletteKey(colors), look: lookOf(colors) };
      return looked.look;
    },
    /**
     * Draw a diagram and build it in. It reads the diagram's layout first, so the diagram (its
     * `value`) and how long it takes are known once it begins: play it in play() or await it.
     */
    show(spec: DiagramSpec, opts: Omit<ShowOptions, 'box'> & { box?: Box | StageRegion } = {}): Action<Diagram> {
      if (options.style && spec.style == null) spec = { ...spec, style: options.style };
      let snapshot: DiagramSnapshot | null = null;
      const reading = (async () => {
        snapshot = await resolverOf(scene, 's.show()').diagram(spec);
      })();
      return act('s.show()', () => {
        const read = snapshot!;
        if (adopt) {
          adopt = false;
          colors = read.palette;
          scene.colors = sceneColors(colors);
          backdrop.setFill(colors.paper);
          heading.setFill(colors.ink);
          band.setFill(colors.paper);
          home.get(band)!.setFill(colors.paper);
          // The number and line take the adopted palette too, here and in their home copies.
          for (const c of chrome)
            for (const m of [c, home.get(c)!])
              if (m instanceof Group) {
                m.children[0]!.setStroke(emphasis(colors));
                m.children[1]!.setFill(emphasis(colors));
              } else m.setFill(soft(colors));
        }
        const diagram = new Diagram(scene, spec, read, { ...opts, box: physical(opts.box) });
        diagrams.add(diagram);
        return diagram.buildPlan(opts.build, opts.runTime);
      }, { ready: reading, late: true });
    },
    /**
     * Show diagram `d` by a view: `draw(state, shown)` gives what it marks, its notes and what stays
     * undimmed, as `d.picture` takes them, usually from `shown` (how the model is shown), and the view
     * takes the live diagram's place. Change them in `this.shown` and play
     * `view.sync()`; `rayner check` redraws the view at every step. A walk
     * runs over the view as it is. For a morph, a reveal or an enlargement, hand the stage back with `liveDiagram(d)`,
     * then call this again to show the diagram by its view once more.
     */
    diagramView(d: Diagram, draw: (state: S, shown: Sh) => DiagramPicture = () => ({})): View<Mobject, S, Sh> {
      let shown = diagramViews.get(d);
      if (!shown) {
        const entry = { draw, view: null as unknown as View<Mobject, S, Sh> };
        entry.view = new View<Mobject, S, Sh>(scene, (st, sh) => {
          const p = entry.draw(st, sh);
          return d.picture(p.marks ?? {}, { notes: p.notes ?? [], dim: p.dim ?? null, ...(p.prefix ? { prefix: p.prefix } : {}) });
        }, { place: false });
        diagramViews.set(d, (shown = entry));
      } else {
        shown.draw = draw;
        // The live diagram may have changed (a morph): the view draws it as it is now.
        shown.view.rebuild();
      }
      scene.add(shown.view);
      scene.remove(d.root);
      // The stage describes the diagram through the view that shows it, as it describes a live one;
      // like a live diagram, the view is not an overlay, so clearOverlays leaves it.
      d.showBy(shown.view);
      return shown.view;
    },
    /** The live diagram back in its view's place, for a morph, a reveal or an enlargement (see diagramView). */
    liveDiagram(d: Diagram): void {
      const shown = diagramViews.get(d);
      if (!shown) throw new Error('s.liveDiagram(): the diagram is not shown by a view; show it with s.diagramView(d, draw) first');
      scene.add(d.root);
      scene.remove(shown.view);
      d.unshow();
    },
    /**
     * The stage's direction: where the logical regions `'start'` and `'end'` fall, and the field
     * order of the cards the kit's `card` builds on it.
     */
    get direction(): LayoutDirection {
      return direction;
    },
    /** Labelled values, entered: the kit's `card(s, rows, opts)`, faded in and kept. */
    card(
      rows: readonly CardRow[],
      opts: CardOptions & Entry = {},
    ): Action<Card> {
      return act('s.card()', () => {
        // The direction is checked on the options as given, before they are copied with the call's name.
        layoutDirection(opts, direction, 's.card()');
        return enterPanel(card(this as StageApi, rows, { ...opts, api: 's.card()' } as CardOptions), opts, { runTime: 0.35, shift: [0, -0.08] });
      });
    },
    /** Keep these subjects together in the reader's opening when they fit legibly.
     * Other artwork remains available in the close-up tour. Call after step().
     * With `{ keep: true }` last, they are the opening of this step and of every later one, until
     * another kept opening replaces them (none clears them); a step's own opening still wins for
     * that step. For a picture that stays on stage while the steps change it, such as a machine's view. */
    opening(...args: Mobject[] | [...Mobject[], { keep: boolean }]) {
      const last = args.at(-1);
      const keep = !!last && !(last instanceof Mobject) && (last as { keep: boolean }).keep;
      const subjects = (last && !(last instanceof Mobject) ? args.slice(0, -1) : args) as Mobject[];
      if (keep) kept = [...subjects];
      opening(scene, ...subjects);
    },
    /** Code on a panel, entered: the kit's `code(s, source, opts)`, faded in and kept. */
    code(
      lines: readonly string[],
      opts: CodeOptions & Entry = {},
    ): Action<CodeBlock> {
      return act('s.code()', () => enterPanel(code(this as StageApi, lines, { ...opts, api: 's.code()' } as CodeOptions), opts, {
        runTime: 0.4,
      }));
    },
    /** A plain line of supporting text in the stage's secondary colour. */
    note(text: string, { at = [0, -3.9], size = 0.24 }: { at?: Vec; size?: number } = {}): Action<Text> {
      return act('s.note()', () => {
        const t = scene.text(text, { fontSize: size, color: soft(colors) }).moveTo(at);
        if (t.width() > 15) t.setWidth(15);
        return enterPanel(t, {}, { runTime: 0.3 });
      });
    },
    /**
     * Track native objects so `clearOverlays` and `clear` remove them with the rest; returns
     * the first. A last `{ describe }` says in words what they show together.
     */
    keep<T extends Mobject>(first: T, ...rest: Mobject[] | [...Mobject[], Describe]): T {
      const options = isOptions(rest.at(-1)) ? (rest.pop() as Describe) : {};
      keepAll([first, ...(rest as Mobject[])], options);
      return first;
    },
    /** Keep these and fade them in together, in one play (options as for FadeIn, plus `describe`). */
    enter(...args: Mobject[] | [...Mobject[], FadeOpts & Describe]): Action {
      return act('s.enter()', () => {
        const { describe, ...fade } = isOptions(args.at(-1)) ? (args.pop() as FadeOpts & Describe) : {};
        const mobs = args as Mobject[];
        return {
          value: undefined,
          start: () => keepAll(mobs, { describe }),
          beats: mobs.length ? [{ runTime: fade.runTime ?? 1, play: () => mobs.map((m) => new FadeIn(m, fade)) }] : [],
        };
      });
    },
    /** Fade out cards, code and kept objects, in one play. */
    clearOverlays(): Action {
      return act('s.clearOverlays()', () => {
        const present = new Set(scene.familyMembers());
        const kept = [...overlays.keys()];
        const shown = kept.filter((g) => present.has(g));
        return {
          value: undefined,
          beats: shown.length ? [{ runTime: 0.3, play: () => shown.map((g) => new FadeOut(g, { runTime: 0.3 })) }] : [],
          end: () => { for (const g of kept) overlays.delete(g); },
        };
      });
    },
    /**
     * Fade everything but the backdrop and heading in one play: a clean slate for the
     * next idea. A camera moved by `focus` glides home in the same play.
     */
    clear({ runTime = 0.4 } = {}): Action {
      return act('s.clear()', () => {
        const gone = scene.mobjects.filter((m) => m !== backdrop && m !== heading && m !== band && !chrome.includes(m));
        const away = !atHome(scene.frame.box()!);
        const shown = [...diagrams], kept = [...overlays.keys()];
        return {
          value: undefined,
          beats: gone.length || away ? [{
            runTime,
            play: () => {
              const anims: Animation[] = gone.map((m) => new FadeOut(m, { runTime }));
              if (away) anims.push(...cameraTo([...STAGE_BOX], runTime));
              return anims;
            },
          }] : [],
          end: () => {
            for (const d of shown) d.forget();
            for (const g of kept) overlays.delete(g);
          },
        };
      });
    },
    /**
     * Move the camera so `target` (mobjects or a box) fills the stage below the heading, with
     * `margin` around it, or back home with `'all'`. The heading, its number and its line stay
     * where they are on screen, at their size; everything else is seen closer. The camera never
     * zooms out past the stage, and never shows beyond its edges. `exact: true` takes `target`, a
     * 16:9 box, as the camera's view as it is. To move other things in the same play, play them
     * together: `this.play(s.focus(box), new FadeIn(m, { runTime: 0.9 }))`.
     */
    focus(
      target: Mobject | readonly Mobject[] | Box | 'all',
      {
        margin = 0.4,
        runTime = 0.9,
        exact = false,
      }: { margin?: number; runTime?: number; exact?: boolean } = {},
    ): Action {
      return act('s.focus()', () => {
        const box = target === 'all' ? [...STAGE_BOX] as Box : exact ? (target as Box) : viewFor(target, margin);
        return { value: undefined, beats: [{ runTime, play: () => cameraTo(box, runTime) }] };
      });
    },
    /**
     * Move a kept object to a new place in one glide: a point, or a box or region it is scaled
     * down to fit (never up). The idea carried on from the step before, rather than cleared.
     */
    carry(m: Mobject, destination: Vec | Box | StageRegion, { runTime = 0.8 } = {}): Action {
      return act('s.carry()', () => {
        const to = physical(destination);
        const target = m.copy();
        if (typeof to === 'string' || to.length === 4) {
          const b = typeof to === 'string' ? regionBox(to) : (to as Box);
          const k = Math.min(
            1,
            (b[2] - b[0]) / Math.max(1e-6, target.width()),
            (b[3] - b[1]) / Math.max(1e-6, target.height()),
          );
          target.scale(k).moveTo(center(b));
        } else target.moveTo(to as Vec);
        return { value: undefined, beats: [{ runTime, play: () => [new Transform(m, target, { runTime })] }] };
      });
    },
    /** A dimension line from `a` to `b` with `label`, set off by `offset`: the kit's `dimension`, sized for the screen, drawn in and kept. */
    dimension(a: Vec, b: Vec, label: string, opts: { offset?: number; color?: string; size?: number; key?: string } = {}): Action<Group> {
      return act('s.dimension()', () => {
        // The line describes itself.
        const view = camera();
        const g = onScreen(kit.dimension(this, toScreen(a, view), toScreen(b, view), label, opts), view);
        return drawIn(g, 0.6, () => new Create(g, { runTime: 0.6, lagRatio: 0.1 }));
      });
    },
    /** A pin stuck in at `point`, with an optional label: the kit's `pin`, sized for the screen, drawn in and kept. */
    pin(point: Vec, opts: { label?: string; color?: string; size?: number; side?: 'left' | 'right'; key?: string } = {}): Action<Group> {
      return act('s.pin()', () => {
        const view = camera();
        const g = onScreen(kit.pin(this, toScreen(point, view), opts), view);
        return drawIn(g, 0.4, () => new FadeIn(g, { runTime: 0.4, shift: [0, -0.15] }));
      });
    },
    /**
     * A key of swatches and their meanings, its first entry starting at `at` (the swatch's left edge, on the entry's centre line):
     * the kit's `legend`, sized for the screen, faded in and kept. It describes itself as its swatch→meaning pairs.
     */
    legend(items: readonly LegendItem[], opts: { at?: Vec; size?: number; stack?: 'column' | 'row'; gap?: number; key: string }): Action<Group> {
      return act('s.legend()', () => {
        const view = camera();
        const g = onScreen(kit.legend(this, items, { ...opts, at: toScreen(opts.at ?? [0, 0], view), api: 's.legend()' } as typeof opts), view);
        return drawIn(g, 0.4, () => new FadeIn(g, { runTime: 0.4 }));
      });
    },
    /** Words beside a target with a leader line to it: the kit's `callout`, sized for the screen, drawn in and kept. */
    callout(
      target: Vec | Box | Mobject,
      text: string,
      opts: { side?: Side; gap?: number; color?: string; size?: number; key?: string } = {},
    ): Action<Group> {
      return act('s.callout()', () => {
        const box = Array.isArray(target)
          ? target.length === 2
            ? ([...target, ...target] as Box)
            : (target as Box)
          : (target as Mobject).box();
        if (!box) throw new Error('s.callout(): the target has no extent; give a point, a box or a mobject that is drawn');
        const view = camera();
        const [a, b] = [toScreen([box[0], box[1]], view), toScreen([box[2], box[3]], view)];
        const g = onScreen(kit.callout(this, [a[0], a[1], b[0], b[1]], text, opts), view);
        return drawIn(g, 0.6, () => new Create(g, { runTime: 0.6, lagRatio: 0.15 }));
      });
    },
    /**
     * Draw `m` stroke by stroke at an even speed, with a pen or pencil riding the tip (or none),
     * and keep it. `m` must not be on stage yet. A path of several strokes is split into one path
     * per stroke first; the result is what was drawn and kept. `describe` says what it shows.
     */
    sketch(
      m: Mobject,
      {
        tool: kind = 'pen',
        color,
        runTime = 1.5,
        describe,
      }: { tool?: ToolKind | false; color?: string; runTime?: number } & Describe = {},
    ): Action<Mobject> {
      return act('s.sketch()', () => {
        // One path per stroke, so the tool can follow each in turn.
        const strokes = oneStrokeEach(m);
        const t = kind
          ? tool(kind, { ink: colors.ink, body: color ?? (kind === 'pen' ? soft(colors) : emphasis(colors)) })
          : null;
        if (t) {
          // The tool is sized to the stage, as the camera shows it.
          const { k } = camera();
          t.scale(k, { aboutPoint: [0, 0] });
          for (const x of t.family()) if (x.style.strokeWidth) x.style.strokeWidth *= k;
        }
        return {
          value: strokes,
          start: () => keepAll([strokes], { describe }),
          beats: [{ runTime, play: () => [new Sketch(strokes, t, { runTime })], after: () => { if (t) scene.remove(t); } }],
        };
      });
    },
    /**
     * Present steps in turn: each clears the stage, makes its model the scene's state, and fades in
     * its picture, a view of that state: `rayner check` holds it to its draw as it holds every view.
     * `kind: 'short'` marks the steps as the reader's short path before the main one; each step's
     * own `kind` overrides the list's. Each step is typed by its own state, so one list can hold
     * steps whose states differ: its draw and describe read that step's state. The steps' states
     * are theirs, not the scene's model type; a scene that reads `this.state` after them sets it first.
     */
    async steps<T extends readonly object[] | []>(list: { readonly [K in keyof T]: StepOf<T[K]> }, { kind: listKind = 'main' }: StagedStepsOptions = {}): Promise<void> {
      for (const step of list as readonly StagedStep<object>[]) {
        const kind = step.kind ?? listKind;
        await scene.step(step.id, {
          title: step.title, line: step.line, caption: step.caption,
          ...(step.audio ? { audio: step.audio } : {}), ...(kind !== 'main' ? { kind } : {}),
        });
        await this.clear({ runTime: 0.18 });
        const state = cloneJson(step.state, 's.steps()', 'state', ` (step ${JSON.stringify(step.id)})`) as object;
        // The step's state is the scene's while the step shows: a view of it, which check redraws.
        const host = scene as unknown as Scene<object, Sh>;
        host.state = { ...state };
        const picture = new View(host, (st) => {
          const drawn = step.draw(st, this as StageApi);
          if (kind === 'short') drawn.key = 'reader-picture';
          return drawn;
        }, { place: false });
        const drawing = picture.current;
        // What the step is about, when that is less than the whole drawing: a phone opens on it.
        const about = step.opening ? drawing.family().filter((m) => step.opening!.includes(m.key ?? '')) : [drawing];
        this.opening(...about);
        // Describe the drawn labels (or the step's own words for its picture), not the state object or the
        // authored caption; a part that describes itself is described by itself, so its text is not repeated.
        const words = partsSeen(drawing).words.filter(Boolean).join('. ');
        await this.enter(picture, { runTime: kind === 'short' ? 0.25 : 0.24, describe: step.describe ? step.describe(state) : words });
      }
    },
  };
  bindStagePalette(api, () => colors);
  // Options refused above leave the scene without a stage, free to have one.
  staged.add(scene);
  return api;
}
/** The stage on a `Scene<S, Sh>`; a bare `Stage` is the stage on any scene, as kit functions take it. */
export type Stage<S extends object = any, Sh extends object = any> = ReturnType<typeof stage<S, Sh>>;

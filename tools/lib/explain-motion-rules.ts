// Check event-specific assertions against actual travel animations, independently of the code
// arranging the beats. A declaration cannot make its own source disappear or its prerequisite paint.
import { motionObservers, type ObserveMotion } from '../../explain/internal.ts';
import type { MotionRule } from '../../explain/index.ts';
import { UNITS, clipPathOf, intersect, isHex, mobjectId, pad, renderElements, serializeElement, userBox } from '../../src/internal.ts';
import type { Animation, Box, Mobject, Scene, Sink, Vec } from '../../src/index.ts';
import { rasterize } from './explain-raster.ts';

type Occluder = {svg: string; box?: Box};
type VisiblePaint = { screen: Vec; pixels: Uint8Array; support: Uint8Array; foreground: Occluder[] };
type Trip = { move: Animation; first?: { world: Vec; paint: VisiblePaint }; proved: boolean };
type Check = { rule: MotionRule; trips: Trip[]; issues: Set<string>; where: string; start: number };
type Painted = { svg: string; visible: boolean };
type Composited = { actual: string; omitted: string; visible: boolean };

/** Isolated native paint, including the camera, inherited/descendant clips, real fills and strokes.
 * Keep the last result per subject: unchanged context usually has identical SVG across a trip. */
async function paintsOnStage(scene: Scene, part: Mobject, cache: WeakMap<Mobject, Painted>): Promise<boolean> {
  const camera = scene.frame.box()!;
  let clip: Box = camera, top = part;
  for (let node = part.parent; node; node = node.parent) {
    top = node;
    if (node.clipBox) {
      const section = intersect(clip, node.clipBox);
      if (!section) return false;
      clip = section;
    }
  }
  if (!scene.mobjects.includes(top)) return false;
  const records = renderElements({frame: scene.frame, mobjects: [part]}, {relative: false});
  const bounds = part.box();
  if (!bounds || !records.length) return false;
  // Render a small crop on the same pixel grid as an 800 x 450 stage. The box only prunes work.
  const stroke = Math.max(0, ...part.family().map(m => m.style.strokeWidth * Math.max(1, m.style.miterLimit ?? 4)));
  const scale = Math.min(800 / (camera[2] - camera[0]), 450 / (camera[3] - camera[1]));
  const patch = intersect(clip, pad(bounds, stroke + 1 / scale));
  if (!patch) return false;
  const x0 = Math.floor((patch[0] - camera[0]) * scale), x1 = Math.ceil((patch[2] - camera[0]) * scale);
  const y0 = Math.floor((camera[3] - patch[3]) * scale), y1 = Math.ceil((camera[3] - patch[1]) * scale);
  const crop = userBox([camera[0] + x0 / scale, camera[3] - y1 / scale, camera[0] + x1 / scale, camera[3] - y0 / scale]);
  const clips = new Map<string, string>();
  const outer = clipPathOf(clip);
  clips.set(outer.id, outer.svg);
  for (const record of records) if (record.clipBox) {
    const entry = clipPathOf(record.clipBox);
    clips.set(entry.id, entry.svg);
  }
  const paths = records.map(serializeElement).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x1-x0}" height="${y1-y0}" viewBox="${crop[0]} ${crop[1]} ${crop[2]-crop[0]} ${crop[3]-crop[1]}"><defs>${[...clips.values()].join('')}</defs><g clip-path="url(#${outer.id})">${paths}</g></svg>`;
  const old = cache.get(part);
  if (old?.svg === svg) return old.visible;
  const {pixels} = await rasterize(svg);
  let visible = false;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) { visible = true; break; }
  cache.set(part, {svg, visible});
  return visible;
}

/** Required context must contribute to this picture, not merely paint in isolation.
 * The native crop uses the full scene's order and clips, including later views. Only
 * the exact subject's records are omitted; unrelated changing ink cannot witness it.
 * Cache the two relevant SVGs, since an unchanged subject can acquire a new cover. */
async function contributesOnStage(scene: Scene, part: Mobject, cache: WeakMap<Mobject, Composited>): Promise<boolean> {
  const camera = scene.frame.box()!, bounds = part.box();
  if (!bounds) return false;
  // Match toSvgString's rounded user-unit viewBox and SVG's centred meet transform,
  // including a shifted camera or letterboxing from a non-16:9 camera.
  const [left, top, right, bottom] = userBox(camera);
  const vx = Math.round(left), vy = Math.round(top), vw = Math.round(right - left), vh = Math.round(bottom - top);
  const unit = Math.min(800 / vw, 450 / vh);
  const ox = (800 - vw * unit) / 2, oy = (450 - vh * unit) / 2;
  const stroke = Math.max(0, ...part.family().map(m => m.style.strokeWidth * Math.max(1, m.style.miterLimit ?? 4)));
  const extent = userBox(pad(bounds, stroke + 1 / (unit * UNITS)));
  const x0 = Math.max(0, Math.floor(ox + (extent[0] - vx) * unit));
  const x1 = Math.min(800, Math.ceil(ox + (extent[2] - vx) * unit));
  const y0 = Math.max(0, Math.floor(oy + (extent[1] - vy) * unit));
  const y1 = Math.min(450, Math.ceil(oy + (extent[3] - vy) * unit));
  if (x0 >= x1 || y0 >= y1) return false;
  const crop: Box = [vx + (x0 - ox) / unit, vy + (y0 - oy) / unit,
    vx + (x1 - ox) / unit, vy + (y1 - oy) / unit];
  const box: Box = [crop[0] / UNITS, -crop[3] / UNITS, crop[2] / UNITS, -crop[1] / UNITS];
  // The temporary frame only narrows native conservative culling. World paint and
  // its inherited clips remain untouched, on the original 800 x 450 pixel grid.
  const frame = scene.frame.copy().setWidth(box[2] - box[0], true).setHeight(box[3] - box[1], true)
    .moveTo([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
  // Preserve individual record ownership: merged text runs can contain siblings
  // outside a keyed glyph, and omitting that run would credit unrelated ink.
  const records = renderElements({frame, mobjects: scene.mobjects}, {cull: true, width: x1 - x0});
  const ids = new Set(part.family().map(mobjectId));
  if (!records.some(record => ids.has(record.id))) return false;
  const clips = new Map<string, string>(), actual: string[] = [], omitted: string[] = [];
  for (const record of records) {
    if (record.clipBox) {
      const clip = clipPathOf(record.clipBox);
      clips.set(clip.id, clip.svg);
    }
    const svg = record.svg ??= serializeElement(record);
    actual.push(svg);
    if (!ids.has(record.id)) omitted.push(svg);
  }
  const paper = scene.colors.paper;
  if (!isHex(paper)) throw new TypeError('Scene paper must be a #rgb or #rrggbb colour');
  const start = `<svg xmlns="http://www.w3.org/2000/svg" width="${x1-x0}" height="${y1-y0}" viewBox="${crop[0]} ${crop[1]} ${crop[2]-crop[0]} ${crop[3]-crop[1]}"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${paper}"/><defs>${[...clips.values()].join('')}</defs>`;
  const svg = start + actual.join('') + '</svg>', without = start + omitted.join('') + '</svg>';
  const old = cache.get(part);
  if (old?.actual === svg && old.omitted === without) return old.visible;
  const [drawn, removed] = await Promise.all([rasterize(svg), rasterize(without)]);
  const a = drawn.pixels, b = removed.pixels;
  // Letterboxed pixels outside the camera's paper can be transparent. Opaque
  // black there contributes alpha even when both RGB triples are zero.
  const visible = a.some((value, i) => value !== b[i]);
  cache.set(part, {actual: svg, omitted: without, visible});
  return visible;
}

/** Locate the family in the composited picture. Every other paint record, including later views,
 * keeps its place when the traveller alone is omitted. A mask, the background, or an equal-colour
 * copy may therefore leave no visible contribution. Measure the centre of the actual RGB change. */
async function visiblePosition(scene: Scene, part: Mobject): Promise<VisiblePaint | null> {
  const ids = new Set(part.family().map(mobjectId));
  const width = 800, height = 450;
  // Native culling rejects only definitely empty paint bounds, including descendant
  // strokes and subpixel edge ink. This avoids Resvg's empty-opacity panic.
  const records = renderElements(scene, {width, cull: true});
  if (!records.some(record => ids.has(record.id))) return null;
  const [left, top, right, bottom] = userBox(scene.frame.box()!);
  const rect = [left, top, right - left, bottom - top].map(Math.round);
  const clips = new Map<string, string>();
  const all: string[] = [], without: string[] = [], black: string[] = [], white: string[] = [];
  const objects = new Map(scene.familyMembers().map(m => [mobjectId(m), m]));
  const camera = scene.frame.box()!, scale = width / (camera[2] - camera[0]);
  const foreground: Occluder[] = [];
  let afterSubject = false;
  for (const record of records) {
    if (record.clipBox) {
      const clip = clipPathOf(record.clipBox);
      clips.set(clip.id, clip.svg);
    }
    const svg = record.svg ??= serializeElement(record);
    all.push(svg);
    if (!ids.has(record.id)) {
      without.push(svg); black.push(svg); white.push(svg);
      if (afterSubject) {
        const object = objects.get(record.id), bounds = object?.box();
        const stroke = object ? Math.max(0, ...object.family().map(m => m.style.stroke === 'none' ? 0 : m.style.strokeWidth * Math.max(1, m.style.miterLimit ?? 4))) : 0;
        const box: Box | undefined = bounds ? [(bounds[0] - stroke - camera[0]) * scale, (camera[3] - bounds[3] - stroke) * scale,
          (bounds[2] + stroke - camera[0]) * scale, (camera[3] - bounds[1] + stroke) * scale] : undefined;
        foreground.push({svg, box});
      }
    } else {
      afterSubject = true;
      for (const [paths, color] of [[black, '#000'], [white, '#fff']] as const) {
      const attrs = {...record.attrs};
      if (attrs.fill !== 'none') attrs.fill = color;
      if (attrs.stroke && attrs.stroke !== 'none') attrs.stroke = color;
      paths.push(serializeElement({...record, attrs, svg: undefined}));
      }
    }
  }
  const paper = scene.colors.paper;
  if (!isHex(paper)) throw new TypeError('Scene paper must be a #rgb or #rrggbb colour');
  const start = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${rect.join(' ')}"><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" fill="${paper}"/><defs>${[...clips.values()].join('')}</defs>`;
  const render = (paths: string[]) => rasterize(start + paths.join('') + '</svg>');
  const [drawn, omitted] = await Promise.all([render(all), render(without)]);
  const a = drawn.pixels, b = omitted.pixels;
  if (!a.some((value, i) => i % 4 !== 3 && Math.abs(value - b[i]!) > 0)) return null;
  // A black/white matte identifies support independently of hidden background colours.
  // Knockout contrast alone can move while the complete painted picture stays frozen.
  const [dark, light] = await Promise.all([render(black), render(white)]);
  const darkPixels = dark.pixels, lightPixels = light.pixels;
  const support = new Uint8Array(width * height);
  let weight = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.max(Math.abs(darkPixels[i]! - lightPixels[i]!), Math.abs(darkPixels[i + 1]! - lightPixels[i + 1]!), Math.abs(darkPixels[i + 2]! - lightPixels[i + 2]!));
    if (delta) {
      const pixel = i / 4;
      support[pixel] = delta;
      weight += delta;
      x += delta * (pixel % width);
      y += delta * Math.floor(pixel / width);
    }
  }
  return weight ? {screen: [x / weight, y / weight], pixels: a, support, foreground} : null;
}

function displaced(first: Vec, now: Vec): boolean {
  return first[0] !== now[0] || first[1] !== now[1];
}

/** Actual pixels must change where this traveller's visible support changed. A moving hidden
 * underlay, changing colours in a fixed aperture, or motion elsewhere cannot supply that proof. */
function movedPaint(first: VisiblePaint, now: VisiblePaint): boolean {
  if (!displaced(first.screen, now.screen)) return false;
  // A moving opaque paper aperture can move the matte without any traveller edge
  // reaching it. Abstain if changing foreground paint touches either support.
  for (const [a, b] of [[first, now], [now, first]]) {
    const unchanged = new Set(b!.foreground.map(record => record.svg));
    for (const record of a!.foreground) if (!unchanged.has(record.svg)) {
      const box = record.box ?? [0, 0, 800, 450];
      for (let y = Math.max(0, Math.floor(box[1]!)); y < Math.min(450, Math.ceil(box[3]!)); y++)
        for (let x = Math.max(0, Math.floor(box[0]!)); x < Math.min(800, Math.ceil(box[2]!)); x++)
          if (first.support[y * 800 + x] || now.support[y * 800 + x]) return false;
    }
  }
  for (let p = 0; p < first.support.length; p++) if (first.support[p] !== now.support[p]) {
    const i = 4 * p;
    if ([0, 1, 2].some(c => first.pixels[i + c] !== now.pixels[i + c])) return true;
  }
  return false;
}

export class MachineMotionCheck implements Sink {
  readonly findings: string[] = [];
  readonly #active = new Map<object, Check[]>();
  readonly #paint = new WeakMap<Mobject, Painted>();
  readonly #context = new WeakMap<Mobject, Composited>();
  readonly #segment?: (scene: Scene) => string | null;
  constructor(segment?: (scene: Scene) => string | null) { this.#segment = segment; }

  /** Subscribe before playback so a missing or too-short trip cannot be lost between frames. */
  async during<T>(scene: Scene, play: () => Promise<T>): Promise<T> {
    const previous = motionObservers.get(scene);
    const observe: ObserveMotion = (machine, event, rules, views, target) => {
      this.#close(machine);
      if (!Array.isArray(rules)) throw new TypeError('machine.motion(): return an array of rules');
      const where = this.#segment?.(scene) ?? `step "${scene.currentStep?.path ?? '(opening)'}", event "${event}"`;
      const checks: Check[] = rules.map((rule: MotionRule) => {
        const {view, during, present = [], absent = []} = rule;
        if (!views.includes(view)) throw new RangeError('machine.motion(): the rule must name a view of this machine');
        if (!Array.isArray(present) || !Array.isArray(absent)) throw new TypeError('machine.motion(): present and absent must be lists of exact keys');
        const subjects = [...present, ...absent];
        if (!subjects.length || ![during, ...subjects].every(k => typeof k === 'string' && k.trim()) || new Set(subjects).size !== subjects.length)
          throw new RangeError('machine.motion(): provide a travel key and distinct, nonempty subject keys');
        const issues = new Set<string>();
        for (const key of subjects) {
          const source = view.current.findAll(key).length, destination = target(view).findAll(key).length;
          if (Math.max(source, destination) !== 1) issues.add(`subject "${key}" must identify one part in the source or destination picture`);
        }
        return {rule, trips: [], issues, where, start: scene.time};
      });
      this.#active.set(machine, checks);
      return (view, key, move) => {
        for (const check of checks) if (check.rule.view === view && check.rule.during === key)
          check.trips.push({move, proved: false});
      };
    };
    motionObservers.set(scene, observe);
    try { return await play(); }
    finally {
      for (const machine of this.#active.keys()) this.#close(machine);
      if (previous) motionObservers.set(scene, previous);
      else motionObservers.delete(scene);
    }
  }

  async frame(scene: Scene): Promise<void> {
    const positions = new Map<Mobject, VisiblePaint | null>();
    for (const checks of this.#active.values()) for (const check of checks) {
      const {rule, trips, issues} = check;
      const active = trips.filter(({move}) => move.phase === 'begun');
      if (!active.length) continue;
      if (active.length > 1) issues.add('more than one trip with this key is active');
      for (const trip of active) {
        if (trip.proved) continue;
        const part = trip.move.mobject;
        if (!positions.has(part)) positions.set(part, await visiblePosition(scene, part));
        const paint = positions.get(part);
        if (paint) {
          const world = part.center();
          trip.first ??= {world, paint};
          trip.proved = displaced(trip.first.world, world) && movedPaint(trip.first.paint, paint);
          if (trip.proved) delete trip.first;
          else trip.first = {world, paint};
        }
      }
      // Context belongs to the whole begun move, even while its traveller is hidden or offstage.
      for (const [subjects, required] of [[rule.present ?? [], true], [rule.absent ?? [], false]] as const) {
        for (const key of subjects) {
          const matches = rule.view.current.findAll(key);
          // Absence retires physical source ink even behind a cover. Presence is
          // stronger: the reader must receive that subject in the composed scene.
          const painted = (await Promise.all(matches.map(m => required
            ? contributesOnStage(scene, m, this.#context)
            : paintsOnStage(scene, m, this.#paint)))).filter(Boolean).length;
          const issue = painted > 1 ? `subject "${key}" paints in more than one place`
            : Boolean(painted) !== required ? `subject "${key}" must be ${required ? 'present' : 'absent'}` : null;
          if (issue && ![...issues].some(s => s.startsWith(issue))) issues.add(`${issue} at +${(scene.time - check.start).toFixed(3)} s`);
        }
      }
    }
  }

  #close(machine: object): void {
    for (const {rule, trips, issues, where} of this.#active.get(machine) ?? []) {
      if (!trips.length) issues.add('the declared travel was never constructed');
      else if (trips.some(t => !t.proved)) issues.add('a declared travel did not paint at two distinct screen positions during its move');
      for (const issue of issues) this.findings.push(`${where}: motion contract: during "${rule.during}", ${issue}`);
    }
    this.#active.delete(machine);
  }
}

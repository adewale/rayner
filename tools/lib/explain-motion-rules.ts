// Check event-specific assertions against actual travel animations, independently of the code
// arranging the beats. A declaration cannot make its own source disappear or its prerequisite paint.
import { motionObservers, type ObserveMotion } from '../../explain/internal.ts';
import type { MotionRule } from '../../explain/index.ts';
import { clipPathOf, intersect, pad, renderElements, serializeElement, userBox } from '../../src/internal.ts';
import type { Animation, Box, Mobject, Scene, Sink } from '../../src/index.ts';
import { rasterize } from './explain-raster.ts';

type Trip = { move: Animation; last: readonly number[]; seen: boolean };
type Check = { rule: MotionRule; trips: Trip[]; issues: Set<string>; where: string; start: number };
type Painted = { svg: string; visible: boolean };

/** Isolated native paint, including the camera, inherited/descendant clips, real fills and strokes.
 * A foreground occluder belongs to the separate occlusion checks. Keep the last result per subject:
 * context left alone during travel usually contributes identical SVG on every sampled frame. */
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

export class MachineMotionCheck implements Sink {
  readonly findings: string[] = [];
  readonly #active = new Map<object, Check[]>();
  readonly #paint = new WeakMap<Mobject, Painted>();
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
          check.trips.push({move, last: move.mobject.center(), seen: false});
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
    for (const checks of this.#active.values()) for (const check of checks) {
      const {rule, trips, issues} = check;
      const active = trips.filter(({move}) => move.phase === 'begun');
      if (active.length > 1) issues.add('more than one trip with this key is active');
      for (const trip of active) {
        const part = trip.move.mobject, at = part.center();
        if (at[0] === trip.last[0] && at[1] === trip.last[1]) continue;
        trip.last = at;
        if (!await paintsOnStage(scene, part, this.#paint)) continue;
        trip.seen = true;
        for (const [subjects, required] of [[rule.present ?? [], true], [rule.absent ?? [], false]] as const) {
          for (const key of subjects) {
            const matches = rule.view.current.findAll(key);
            const painted = (await Promise.all(matches.map(m => paintsOnStage(scene, m, this.#paint)))).filter(Boolean).length;
            const issue = painted > 1 ? `subject "${key}" paints in more than one place`
              : Boolean(painted) !== required ? `subject "${key}" must be ${required ? 'present' : 'absent'}` : null;
            if (issue && ![...issues].some(s => s.startsWith(issue))) issues.add(`${issue} at +${(scene.time - check.start).toFixed(3)} s`);
          }
        }
      }
    }
  }

  #close(machine: object): void {
    for (const {rule, trips, issues, where} of this.#active.get(machine) ?? []) {
      if (!trips.length) issues.add('the declared travel was never constructed');
      else if (trips.some(t => !t.seen)) issues.add('a declared travel had no sampled, visibly moving frame');
      for (const issue of issues) this.findings.push(`${where}: motion contract: during "${rule.during}", ${issue}`);
    }
    this.#active.delete(machine);
  }
}

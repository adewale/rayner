// Scenes for the engine tests. `Fixture` is small and changes only when the
// engine does, so the golden trace pins the engine rather than an author's
// edits. `explainer(id)` is what readers see: an explainer's default scenario with
// its diagram snapshots bound.
import { join } from 'node:path';
import {
  Scene, Rectangle, Circle, Arrow, Line, Dot, Text, Code, DecimalNumber,
  FadeIn, FadeOut, Write, Create, Transform, MoveAlongPath, LaggedStart,
} from '../../src/index.ts';
import { Indicate } from './transient.ts';
import type { Box, Mobject, SceneClass } from '../../src/index.ts';
import { labelOf } from '../../explain/diagrams.ts';
import { Card } from '../../explain/panels.ts';
import { toView } from '../../app/embed-closeup.ts';
import { EXPLAINERS } from '../../scenes/explainers/catalog.ts';
import { collectProject, defaultScenario, ROOT } from '../../tools/lib/explain-project.ts';
// Manim's values, which the package no longer exports.
const GOLD = '#f0ac5f';
const GREY = '#888888';
const TEAL = '#5cd0b3';

export class Fixture extends Scene {
  override async construct() {
    this.state = { count: 0 };
    await this.step('draw', { caption: 'A title is written and two shapes are drawn.' });
    const heading = new Text('A fixture for the engine tests', { fontSize: 0.4 }).moveTo([0, 3.4]);
    const box = new Rectangle({ width: 2.4, height: 1.2, cornerRadius: 0.1, stroke: TEAL }).moveTo([-3, 1]);
    const ring = new Circle({ radius: 0.6, stroke: GOLD }).moveTo([3, 1]);
    await this.play(new Write(heading), new Create(box), new FadeIn(ring, { shift: [0, 0.5] }));
    const link = new Arrow(box.right(), ring.left(), { buff: 0.1 });
    await this.play(new Create(link));

    await this.step('code', { caption: 'A loop appears and its condition is lit.' });
    const code = new Code(['let count = 0;', 'while (count < 3) count++;', 'return count;']).moveTo([-3.5, -2]);
    await this.play(new FadeIn(code, { shift: [0.3, 0] }));
    const bar = code.highlight(1);
    await this.play(new FadeIn(bar));

    await this.step('count', { caption: 'The counter rises while a dot rides the track.' });
    const n = new DecimalNumber(0, { fontSize: 0.5, font: 'mono' }).moveTo([3, -1.4]);
    const track = new Line([1.5, -2.6], [4.5, -2.6], { stroke: GREY });
    const dot = new Dot().moveTo([1.5, -2.6]);
    await this.play(new FadeIn(n), new Create(track), new FadeIn(dot));
    for (let i = 1; i <= 3; i++) {
      await this.play(new Transform(n, n.copy().setValue(i)), new MoveAlongPath(dot, new Line([0.5 + i, -2.6], [1.5 + i, -2.6])), { runTime: 0.5 });
      this.state = { count: i };
    }

    await this.step('end', { caption: 'The shapes pulse, then the code leaves.' });
    await this.play(new LaggedStart([new Indicate(box), new Indicate(ring)]));
    await this.play(new Transform(ring, new Rectangle({ width: 1.2, height: 1.2, stroke: GOLD }).moveTo([3, 1])));
    await this.play(new FadeOut(code), new FadeOut(bar));
  }
}

const loaded = new Map<string, Promise<SceneClass>>();
export const explainer = (id: string): Promise<SceneClass> => {
  if (!loaded.has(id))
    loaded.set(id, collectProject(join(ROOT, 'scenes/explainers', id), { write: false }).then((p) => defaultScenario(p).Scene));
  return loaded.get(id)!;
};
// One at a time, so the order of collection, and anything a project leaves behind, is the same on
// every run. (Concurrent collection is safe too: the first lettering lease waits for runs that
// began before lettering was installed; test/lettering-race.test.ts.)
export const explainers = async (): Promise<[string, SceneClass][]> => {
  const all: [string, SceneClass][] = [];
  for (const { id } of EXPLAINERS) all.push([id, await explainer(id)]);
  return all;
};

/**
 * The box around what `pick` finds in a step's resting picture, in the camera's view units
 * (stage units while the camera is home), where close-ups are worked out.
 */
export async function restingBox(Source: SceneClass, step: string, pick: (scene: Scene) => Mobject[]): Promise<Box> {
  let box: Box | null = null;
  await new Source(
    {
      async frame() {},
      async stepEnd(scene, s) {
        if (s.name !== step) return;
        const found = pick(scene);
        if (!found.length) throw new Error(`nothing picked at the end of ${step}`);
        const view = scene.frame.box() ?? ([-8, -4.5, 8, 4.5] as Box);
        const boxes = found.map((m) => toView(m.box()!, view));
        box = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
      },
    },
    { skipUntil: Infinity },
  ).run();
  if (!box) throw new Error(`no step ${step}`);
  return box;
}
/** A shown card's row: its label and value. */
export const cardRow = (scene: Scene, label: string, value: string): Mobject[] => {
  const card = scene.familyMembers().find(
    (m): m is Card => m instanceof Card && (m.style.opacity ?? 1) > 0.5 && m.values.get(label)?.text === value,
  );
  return card ? [card.labels.get(label)!, card.values.get(label)!] : [];
};
/** Shown labels whose text contains `words`: a note that says a value among others, say. */
export const labelsSaying = (scene: Scene, words: string): Mobject[] =>
  scene.familyMembers().filter((m) => (m.style.opacity ?? 1) > 0.5 && (labelOf(m)?.text ?? '').includes(words));
/** Shown labels with these words, outside cards (a diagram's, say). */
export const wordsOutsideCards = (scene: Scene, ...words: string[]): Mobject[] =>
  scene.familyMembers().filter((m) => {
    if (!words.includes(labelOf(m)?.text ?? '')) return false;
    for (let a: Mobject | null = m; a; a = a.parent) if (a instanceof Card) return false;
    return true;
  });

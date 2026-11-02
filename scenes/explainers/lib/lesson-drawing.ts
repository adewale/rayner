import { Scene, Group, Text, Rectangle, Circle, Line } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';

export interface LessonFrame {
  id: string;
  title: string;
  line: string;
  caption: string;
  state: Record<string, unknown>;
  draw: (s: Stage) => Group;
  audio?: unknown;
}
export function label(text: string | number, x: number, y: number, color: string, size = 0.6, key?: string): Text {
  const t = new Text(String(text), { fontSize: size, color }).moveTo([x, y]);
  if (key) t.key = key;
  return t;
}
export function tile(
  text: string | number,
  x: number,
  y: number,
  width: number,
  height: number,
  s: Stage,
  options: { active?: boolean; bad?: boolean; key?: string; size?: number } = {},
): Group {
  const color = options.bad ? s.bad : options.active ? s.emphasis : s.soft;
  const g = new Group(
    new Rectangle({
      width,
      height,
      fill: s.palette.paper,
      stroke: color,
      strokeWidth: options.active || options.bad ? 0.055 : 0.025,
    }).moveTo([x, y]),
    label(text, x, y, options.bad ? s.bad : s.palette.ink, options.size ?? 0.62),
  );
  if (options.key) g.key = options.key;
  return g;
}
export function segment(a: Vec, b: Vec, color: string, width = 0.04): Line {
  return new Line(a, b, { stroke: color, strokeWidth: width });
}
export function dot(text: string, x: number, y: number, s: Stage, active = false): Group {
  return new Group(
    new Circle({
      radius: 0.5,
      fill: s.palette.paper,
      stroke: active ? s.emphasis : s.soft,
      strokeWidth: active ? 0.055 : 0.03,
    }).moveTo([x, y]),
    label(text, x, y, s.palette.ink, 0.7),
  );
}
export function table(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  s: Stage,
  { xs = [-5.5, -1.7, 2.2, 5.8], y = 1.9, gap = 1.05, key = 'comparison', size = 0.6 } = {},
): Group {
  const heads = headers.map((h) => new Text(h, { fontSize: size, color: s.palette.ink, weight: 'bold' }));
  const cells = rows.map((row) => row.map((v) => new Text(String(v), { fontSize: size, color: s.palette.ink })));
  const numeric = headers.map(
    (_, c) =>
      rows.length > 0 &&
      rows.every(
        (row) =>
          typeof row[c] === 'number' ||
          /^[+−-]?\d[\d.,\s/]*(?:%|€|h|days|pages|tokens|bytes|GiB|TiB)?$/u.test(String(row[c])),
      ),
  );
  const widths = headers.map((_, c) => Math.max(heads[c]!.width(), ...cells.map((row) => row[c]!.width())));
  const place = (text: Text, c: number, at: number) =>
    text.moveTo([xs[c]! + ((numeric[c] ? 1 : -1) * widths[c]!) / 2, at], [numeric[c] ? 1 : -1, 0]);
  const children: Mobject[] = heads.map((h, c) => place(h, c, y));
  cells.forEach((row, r) => row.forEach((v, c) => children.push(place(v, c, y - (r + 1) * gap))));
  if (headers.length)
    children.unshift(
      new Line(
        [Math.min(...xs.slice(0, headers.length).map((x, c) => x - widths[c]! / 2)), y - size * 0.7],
        [Math.max(...xs.slice(0, headers.length).map((x, c) => x + widths[c]! / 2)), y - size * 0.7],
        { stroke: s.soft, strokeWidth: 0.025 },
      ),
    );
  const g = new Group(...children);
  g.key = key;
  return g;
}
export function stat(s: Stage, title: string, value: string | number, x: number, y: number, key: string): Group {
  const g = new Group(label(title, x, y + 0.7, s.soft, 0.6), label(value, x, y - 0.45, s.palette.ink, 0.95));
  g.key = key;
  return g;
}
export async function lesson(scene: Scene, frames: readonly LessonFrame[], style = 'github-light') {
  const s = stage(scene, { style, headingSize: 0.6 });
  for (const frame of frames) {
    await scene.step(frame.id, {
      title: frame.title,
      line: frame.line,
      caption: frame.caption,
      ...(frame.audio ? { audio: frame.audio } : {}),
    });
    await s.clear({ runTime: 0.18 });
    scene.state = { ...JSON.parse(JSON.stringify(frame.state)), phase: frame.id };
    const drawing = frame.draw(s);
    s.reading(drawing);
    // Describe actual drawn labels, not the state object or the authored caption.
    const words = drawing
      .family()
      .filter((m): m is Text => m instanceof Text)
      .map((t) => t.text)
      .filter(Boolean);
    await s.enter(drawing, { runTime: 0.24, describe: words.join('. ') });
  }
}

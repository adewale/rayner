// Native drawing helpers for the statechart pictures: state boxes, parent boxes, regions, arrows with words.
import { Group, Text, Rectangle, Line, Arrow, Circle } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';

export const SIZE = { state: 0.46, event: 0.32, name: 0.42, note: 0.4 };

/** Text centred on (x, y), or with its left or right edge there. */
export function words(
  text: string,
  at: Vec,
  color: string,
  size: number,
  edge: 'middle' | 'left' | 'right' = 'middle',
  key?: string,
): Text {
  const t = new Text(text, { fontSize: size, color });
  t.moveTo(at, edge === 'left' ? [-1, 0] : edge === 'right' ? [1, 0] : [0, 0]);
  if (key) t.key = key;
  return t;
}

export interface BoxLook {
  /** Stroke colour; ink by default. */
  color?: string;
  /** Stroke width. */
  stroke?: number;
  dashed?: boolean;
  /** Paper fill so arrows behind do not show through. */
  filled?: boolean;
}

/** A rounded rectangle centred on `at`. */
export function frame(s: Stage, at: Vec, w: number, h: number, { color, stroke = 0.035, dashed = false, filled = true }: BoxLook = {}): Rectangle {
  return new Rectangle({
    width: w,
    height: h,
    cornerRadius: 0.16,
    fill: filled ? s.palette.paper : 'none',
    stroke: color ?? s.palette.ink,
    strokeWidth: stroke,
    ...(dashed ? { dashArray: '0.14 0.1' } : {}),
  }).moveTo(at);
}

/** A state: a rounded box with its name, one or two lines. */
export function state(s: Stage, name: string, at: Vec, w: number, h: number, look: BoxLook & { size?: number } = {}): Group {
  const { size = SIZE.state, ...box } = look;
  const lines = name.split('\n');
  const g = new Group(frame(s, at, w, h, box));
  lines.forEach((line, i) =>
    g.add(words(line, [at[0], at[1] + ((lines.length - 1) / 2 - i) * size * 1.15], s.palette.ink, size)),
  );
  g.key = `state-${name.replace(/\W+/g, '-')}`;
  return g;
}

/** An arrow from `a` to `b`, in one colour. */
export function arrow(a: Vec, b: Vec, color: string, width = 0.035): Arrow {
  return new Arrow(a, b, { stroke: color, strokeWidth: width, tipLength: 0.26, tipWidth: 0.2 });
}

/** An arrow with an event name beside it. `label` sits at `at`, centred or with an edge there. */
export function link(
  a: Vec,
  b: Vec,
  color: string,
  label: string,
  at: Vec,
  edge: 'middle' | 'left' | 'right' = 'middle',
  size = SIZE.event,
  textColor = color,
): Group {
  return new Group(arrow(a, b, color), words(label, at, textColor, size, edge));
}

/** A dashed line, for the border between regions. */
export function divider(a: Vec, b: Vec, color: string): Line {
  return new Line(a, b, { stroke: color, strokeWidth: 0.03, dashArray: '0.14 0.1' });
}

/** The ring that says "the machine is here". */
export function ring(s: Stage, at: Vec, w: number, h: number): Rectangle {
  return new Rectangle({ width: w + 0.2, height: h + 0.2, cornerRadius: 0.2, fill: 'none', stroke: s.emphasis, strokeWidth: 0.07 }).moveTo(at);
}

export const dot = (s: Stage, at: Vec, color = s.palette.ink) =>
  new Circle({ radius: 0.11, fill: color, fillOpacity: 1, stroke: 'none' }).moveTo(at);

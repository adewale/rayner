import { Group, Arrow, Circle, Text, SurroundingRectangle, Cross } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { keyedParts } from '../../../explain/drawing.ts';
import { label, tile, emphasised } from '../../../explain/drawing.ts';
import type { Stage, StagedStepsOptions, Look } from '../../../explain/index.ts';
import type { RingState } from './model.ts';

/**
 * The queue a ring buffer replaces: values kept in array order, popped with
 * Array.prototype.shift, which takes the first value and moves each later one
 * a slot left. The counts are what real arrays report after the shift: the copies ECMAScript's
 * definition of shift describes, not timings, since engines may store arrays differently.
 */
export function arrayQueue(values: readonly number[]) {
  const after = [...values];
  const popped = after.shift()!;
  // shift moves every value behind the first: as many moves as values remain.
  return { before: [...values], after, popped, moved: after.length };
}

export function frames(stage: Stage, opts?: StagedStepsOptions): Promise<void> {
  const q = arrayQueue([1, 2, 3, 4, 5]),
    big = arrayQueue(Array.from({ length: 1000 }, (_, i) => i + 1));
  const x = (i: number) => (i - 2) * 2.3,
    TOP = 1.5,
    BOTTOM = -1.0,
    W = 2.0,
    H = 1.05;
  return stage.steps([
    {
      id: 'shift',
      title: 'A queue in an array: each pop moves every value left',
      line: `Predict: how could pop take ${q.popped} without moving the other ${q.moved}?`,
      caption: `The simplest queue keeps its values in order in an array. Push writes at the end; pop takes the front, then copies every other value one slot left, as the language’s definition of Array.prototype.shift does. Popping from five values moves ${q.moved}; from a thousand, ${big.moved}. Engines may store some arrays differently, but these are the copies the definition describes. The order stays right because every pop pays for every value left behind.`,
      state: { before: q.before, after: q.after, popped: q.popped, moved: q.moved },
      draw: (st, s) => {
        const g = new Group();
        st.before.forEach((v, i) =>
          g.add(
            tile(v, x(i), TOP, W, H, s, { size: 0.7, key: `array:${i}`, bad: i === 0 }),
            label(`slot ${i}`, x(i), TOP + 0.95, s.look.soft, 0.5),
          ),
        );
        st.before.forEach((_, i) => {
          const v = st.after[i];
          g.add(tile(v ?? 'empty', x(i), BOTTOM, W, H, s, { size: v == null ? 0.5 : 0.7, key: `array-after:${i}` }));
        });
        // One arrow per value shift moves: slot i + 1 to slot i.
        for (let i = 0; i < st.moved; i++)
          g.add(
            new Arrow([x(i + 1) - 0.35, TOP - H / 2 - 0.08], [x(i) + 0.35, BOTTOM + H / 2 + 0.08], {
              stroke: s.look.emphasis,
              strokeWidth: 0.04,
              tipLength: 0.2,
              tipWidth: 0.17,
            }),
          );
        g.add(
          label(`pop() returned ${st.popped} and moved ${st.moved} values`, 0, -2.75, s.look.bad, 0.58, 'shift-result'),
        );
        return g;
      },
    },
  ], opts);
}

// ---------------------------------------------------------------- the ring, drawn from the machine's state

export const SLOTS = 5,
  C: Vec = [-4.15, -0.45],
  R = 2.05,
  SLOT = 0.56,
  /** Where push(v)'s argument waits before it is copied into the ring. */
  IN: Vec = [-1.15, 2.45];
const TAIL = '#7fc8b8';
/** The tray under the ring: its row, below the labels of the pointers at the bottom slots, and where it must end, left of the code. */
const TRAY_Y = -4.1,
  TRAY_END = -0.6;
export const angle = (i: number) => Math.PI / 2 - (i * 2 * Math.PI) / SLOTS;
export const polar = (a: number, r: number): Vec => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
/** The value a push hands the buffer, read back from the operation the model ran ("push 6" -> 6). */
export const pushArg = (operation: unknown): number | null =>
  typeof operation === 'string' && operation.startsWith('push ') ? Number(operation.slice(5)) : null;

/** The stage's colours the ring is drawn in: `emphasis` is the head pointer's and a pop's colour, `bad` a refusal's. */
export type Ink = Pick<Look, 'ink' | 'soft' | 'paper' | 'emphasis' | 'bad'>;

// Native pieces of the ring, rebuilt from a model snapshot.
const slotCircle = (k: Ink, filled: boolean, fresh = false) =>
  new Circle({
    radius: SLOT,
    fill: filled ? k.ink : k.paper,
    fillOpacity: filled ? 0.13 : 1,
    stroke: fresh ? TAIL : filled ? k.ink : k.soft,
    strokeWidth: fresh ? 0.05 : filled ? 0.035 : 0.025,
    ...(filled ? {} : { dashArray: '0.09 0.07' }),
  });
// Copies fly between the incoming View (View > token > ring, digit), stored
// values and tray tokens. A Transform pairs families tree by tree, so all three
// share that tree: ring morphs into ring and digit into digit.
/** A stored value: its number, and an unseen slot-sized ring a token's ring can grow into or out of. */
const stored = (k: Ink, v: number, at: Vec) =>
  new Group(
    new Group(
      new Circle({ radius: SLOT, fill: 'none', stroke: k.ink, strokeWidth: 0.03, opacity: 0 }).moveTo(at),
      new Text(String(v), { fontSize: 0.44, color: k.ink }).moveTo(at),
    ),
  );
const token = (k: Ink, v: number, refused: boolean) => {
  const color = refused ? k.bad : k.soft;
  const ring = new Circle({
    radius: 0.32,
    fill: k.paper,
    stroke: color,
    strokeWidth: 0.03,
    ...(refused ? { dashArray: '0.08 0.06' } : {}),
  });
  return new Group(ring, new Text(String(v), { fontSize: 0.28, color: k.ink }).moveTo(ring.center()));
};
/** A pointer at any angle round the ring: its arrow toward the slot there, its word upright beside it. */
export const pointerAt = (k: Ink, name: 'head' | 'tail', at: number) => {
  const a = at + (name === 'head' ? 0.22 : -0.22),
    color = name === 'head' ? k.emphasis : TAIL;
  const start = polar(a, R + 1.12),
    slot = polar(at, R),
    dir = [start[0] - slot[0], start[1] - slot[1]],
    len = Math.hypot(dir[0]!, dir[1]!),
    end: Vec = [slot[0] + (dir[0]! / len) * (SLOT + 0.07), slot[1] + (dir[1]! / len) * (SLOT + 0.07)];
  const label = new Text(name, { fontSize: 0.24, font: 'mono', color, weight: 'bold' }).moveTo(
    polar(a + (name === 'head' ? 0.06 : -0.06), R + 1.42),
  );
  return new Group(
    new Arrow(start, end, { stroke: color, strokeWidth: 0.035, tipLength: 0.16, tipWidth: 0.14 }),
    label,
  );
};
export const pointer = (k: Ink, name: 'head' | 'tail', i: number) => pointerAt(k, name, angle(i));
/** An outline that stays on the slot an operation touched until the next operation. */
const mark = (k: Ink, i: number, color: string) =>
  new SurroundingRectangle(slotCircle(k, false).moveTo(polar(angle(i), R)), {
    buff: 0.09,
    cornerRadius: SLOT + 0.09,
    stroke: color,
    strokeWidth: 0.045,
  });
const trayLabelAt = (k: Ink, text: string) => new Text(text, { fontSize: 0.24, color: k.soft, anchor: 'start' }).moveTo([-7.35, TRAY_Y], [-1, 0]);

/**
 * The ring, drawn from the machine's state: every piece keyed, so a transition can move each. What it
 * marks is emphasis the phone's close-ups visit first and review holds to the caption: each outlined
 * slot, and the value the tray took last.
 */
export function drawRing(st: RingState, k: Ink): Group {
  const { add, group } = keyedParts();
  for (let i = 0; i < SLOTS; i++) {
    add(slotCircle(k, st.data[i] != null, st.reused[i]!).moveTo(polar(angle(i), R)), `ring:slot:${i}`);
    add(new Text(String(i), { fontSize: 0.2, font: 'mono', color: k.soft }).moveTo(polar(angle(i), R - 0.86)), `ring:index:${i}`);
  }
  st.data.forEach((v, i) => { if (v != null) add(stored(k, v, polar(angle(i), R)), `ring:value:${i}`); });
  add(pointer(k, 'head', st.head), 'ring:pointer:head');
  add(pointer(k, 'tail', st.tail), 'ring:pointer:tail');
  const colour = { push: TAIL, pop: k.emphasis, refused: k.bad } as const;
  for (const m of st.marks) add(emphasised(mark(k, m.slot, colour[m.kind]), `outlined: ${m.kind} at slot ${m.slot}`), `ring:mark:${m.slot}`);
  const v = pushArg(st.operation);
  // No argument (a pop): an unseen ring holds the place.
  add(v == null ? new Group(new Circle({ radius: 0.32, opacity: 0 }).moveTo(IN)) : new Group(token(k, v, false)).moveTo(IN), `ring:incoming:${v ?? 'none'}`);
  if (st.operation != null) {
    add(new Text('push(v)', { fontSize: 0.24, font: 'mono', color: k.soft, anchor: 'end' }).moveTo([IN[0] - 0.5, IN[1]], [1, 0]), 'ring:arg');
    // The value the next push hands the buffer, so two states that differ only there look different.
    add(new Text(`next ${st.next}`, { fontSize: 0.2, font: 'mono', color: k.soft, anchor: 'end' }).moveTo([IN[0] - 0.5, IN[1] - 0.36], [1, 0]), `ring:next:${st.next}`);
  }
  if (st.tray) {
    // The most recent values that fit left of the code; the label counts the rest.
    const all = st.tray.values;
    let shown = all.length, label = trayLabelAt(k, st.tray.label);
    for (; shown > 1; shown--) {
      label = trayLabelAt(k, shown < all.length ? `${st.tray.label.slice(0, -1)} (+${all.length - shown}):` : st.tray.label);
      if (label.box()![2] + 0.55 + (shown - 1) * 0.95 + 0.32 <= TRAY_END) break;
    }
    const x = label.box()![2] + 0.55;
    add(label, `ring:tray:${st.tray.label}`);
    all.forEach((value, i) => {
      const j = i - (all.length - shown);
      if (j < 0) return;
      const bad = new Group(token(k, value, st.tray!.refused)).moveTo([x + j * 0.95, TRAY_Y]);
      if (i === all.length - 1) emphasised(bad, `${st.tray!.label} ${value}`);
      add(bad, `ring:tray:${i}`);
      if (st.tray!.refused) add(new Cross(bad, { stroke: k.bad, strokeWidth: 0.035, scale: 0.95 }), `ring:tray:${i}:cross`);
    });
  }
  return group();
}

/** What the ring shows, in words. */
export function sayRing(st: RingState): string {
  const why = { push: (i: number) => `in the tail colour, where ${st.data[i]} was just written`, pop: () => 'in the head colour, popped and now empty', refused: () => `in red, where ${st.operation} would have gone` };
  const said = [
    `A ring of five slots: ${st.data.map((v, i) => `slot ${i} ${v == null ? 'empty' : `holds ${v}`}`).join(', ')}`,
    `The head arrow points at slot ${st.head} and the tail arrow at slot ${st.tail}; the middle reads head ${st.head}, tail ${st.tail}, length ${st.length}`,
    ...st.marks.map((m) => `Slot ${m.slot} is outlined ${why[m.kind](m.slot)}`),
  ];
  const v = pushArg(st.operation);
  if (v != null) said.push(`push(v) holds ${v}`);
  if (st.operation != null) said.push(`The next push hands it ${st.next}`);
  if (st.tray?.values.length)
    said.push(`Under the ring, after “${st.tray.label}”: ${st.tray.values.join(', ')}${st.tray.refused ? ', crossed out' : ''}`);
  return said.join('. ') + '.';
}

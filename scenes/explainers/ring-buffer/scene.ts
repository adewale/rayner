import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames, arrayQueue } from '../lib/readers/ring-buffer.ts';
import {
  Scene,
  SetState,
  AnimationGroup,
  Succession,
  Circle,
  Text,
  Group,
  Arrow,
  FadeIn,
  FadeOut,
  Create,
  Transform,
  TransformFromCopy,
  SurroundingRectangle,
  Cross,
  StateReadout,
  view,
  linear,
} from '../../../src/index.ts';
import type { ScheduledAnimation, Vec, Mobject, PathFunc, SceneState, View } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { Card } from '../../../explain/panels.ts';
import { ringStory, RingBuffer } from '../lib/models.ts';

/** The check questions' answers, from the same model: rings and queues no step draws. */
const CHECK = (() => {
  // Carry on from the wrap case's last step: three pops, then push 8.
  const ring = new RingBuffer<number>(5);
  for (let v = 1; v <= 5; v++) ring.push(v);
  ring.pop();
  ring.pop();
  ring.push(6);
  ring.push(7);
  const out = [ring.pop(), ring.pop(), ring.pop()],
    slot8 = ring.tail;
  ring.push(8);
  const left = Array.from({ length: ring.length }, (_, k) => ring.data[(ring.head + k) % ring.capacity]!);
  const carry = { out, slot8, head: ring.head, left };
  // Eight slots, eight pushes, eight pops.
  const eight = new RingBuffer<number>(8);
  for (let v = 1; v <= 8; v++) eight.push(v);
  const full8 = eight.snapshot();
  for (let v = 1; v <= 8; v++) eight.pop();
  const empty8 = eight.snapshot();
  // Draining a thousand values: the array copies every value behind each popped one; the ring copies none.
  let queue = Array.from({ length: 1000 }, (_, i) => i + 1),
    arrayMoves = 0;
  while (queue.length) {
    const step = arrayQueue(queue);
    arrayMoves += step.moved;
    queue = step.after;
  }
  return { carry, full8, empty8, arrayMoves };
})();

type Snapshot = ReturnType<typeof ringStory>[number]['result'];
const SLOTS = 5,
  C: Vec = [-4.15, -0.45],
  R = 2.05,
  SLOT = 0.56,
  /** Where push(v)'s argument waits before it is copied into the ring. */
  IN: Vec = [-1.15, 2.45];
const TAIL = '#7fc8b8';
// RingBuffer from scenes/explainers/lib/models.ts, without the `this.`s.
const CODE = [
  'push(v) {',
  '  if (length === capacity) throw new Full();',
  '  data[tail] = v;',
  '  tail = (tail + 1) % capacity;',
  '  length++;',
  '}',
  'pop() {',
  "  if (length === 0) throw new Error('Empty');",
  '  const v = data[head];',
  '  data[head] = null;',
  '  head = (head + 1) % capacity;',
  '  length--;',
  '  return v;',
  '}',
];
/** The values in queue order: from head, wrapping past the last slot. */
const queueOrder = (r: { head: number; length: number; data: (number | null)[] }) =>
  Array.from({ length: r.length }, (_, k) => r.data[(r.head + k) % r.data.length]!);
const angle = (i: number) => Math.PI / 2 - (i * 2 * Math.PI) / SLOTS;
const polar = (a: number, r: number): Vec => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
/**
 * A pointer's move from one slot to another goes round the ring, not across it: the straight
 * morph between its two drawings, carried along the arc its base travels at the pointers'
 * radius, the short way round. Both drawings are upright, so the word stays upright too.
 */
const alongRing = (from: number, to: number): PathFunc => {
  const r = R + 1.12,
    a0 = angle(from);
  let d = angle(to) - a0;
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
  const c0 = polar(a0, r),
    c1 = polar(angle(to), r);
  return (s, e, alpha) => {
    if (alpha <= 0) return [s[0], s[1]];
    if (alpha >= 1) return [e[0], e[1]];
    const on = polar(a0 + d * alpha, r);
    return [
      s[0] + (e[0] - s[0]) * alpha + on[0] - (c0[0] + (c1[0] - c0[0]) * alpha),
      s[1] + (e[1] - s[1]) * alpha + on[1] - (c0[1] + (c1[1] - c0[1]) * alpha),
    ];
  };
};
/** Animations side by side in group time that does not ease, so each member's own easing is not compounded. */
const together = (anims: ScheduledAnimation[]) => new AnimationGroup(anims, { rateFunc: linear });
/** The value a push hands the buffer, read back from the operation the model ran ("push 6" -> 6). */
const pushArg = (operation: unknown): number | null =>
  typeof operation === 'string' && operation.startsWith('push ') ? Number(operation.slice(5)) : null;

export default class RingBufferExplainer extends Scene {
  static meta = {
    id: 'ring-buffer',
    title: 'How does a ring buffer reuse storage?',
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/ring-buffer.doc.json',
      'https://tc39.es/ecma262/2025/#sec-array.prototype.shift',
    ],
    // The script's answer and check questions (script.md); check holds the slots step to stating the answer.
    answer: 'Values stay in their slots while head and tail move, and both wrap back to slot 0 to reuse freed slots',
    checks: [
      {
        question:
          'Carry on from the last step of “Push 5, pop 2, push 2”, where head and tail are both at slot 2. Pop three times, then push 8. Which values leave, which slot takes 8, and in what order do the rest come out?',
        answer: `The pops return ${CHECK.carry.out.join(', ')}, and head wraps to slot ${CHECK.carry.head}. Tail is still at slot ${CHECK.carry.slot8}, so 8 goes there. Reading from head gives ${CHECK.carry.left.join(', ')}: the order comes from head, not from the slot numbers.`,
      },
      {
        question: 'A ring of eight slots takes eight pushes and then eight pops. Where are head and tail, and how does the ring know it is empty?',
        answer: `Both are at slot ${CHECK.empty8.head}, just where they were when it was full (head ${CHECK.full8.head}, tail ${CHECK.full8.tail}). Only length, ${CHECK.empty8.length} now against ${CHECK.full8.length} then, tells empty from full.`,
      },
      {
        question: 'A queue of 1,000 values is drained by 1,000 pops. How many value copies does the array queue make in all, and how many does the ring make?',
        answer: `The array makes ${CHECK.arrayMoves.toLocaleString('en')}: each pop copies every value still behind the front, 999, then 998, down to 0. The ring makes none, because a pop moves only head.`,
      },
    ],
  };
  static settings = [
    {
      id: 'operations',
      label: 'Operations',
      default: 'wrap',
      options: [
        { value: 'wrap', label: 'Push 5, pop 2, push 2' },
        { value: 'full', label: 'Push 7 into five slots' },
      ],
    },
  ];
  /** head, tail and length in the middle of the ring: a View of `this.state`. */
  readout?: View;
  /** The card's Operation and Result values: a View of `this.state`. */
  results?: View;
  /** push(v)'s argument, waiting to be copied in: a View of `this.state`. */
  incoming?: View;

  override async construct() {
    const which = settingsOf(this).operations!,
      events = ringStory(which),
      s = stage(this, { headingSize: 0.6, style: 'dusk' }),
      ink = s.palette.ink,
      soft = s.soft,
      head = s.emphasis;

    // Native pieces of the ring, rebuilt from a model snapshot.
    const slotCircle = (filled: boolean, fresh = false) =>
      new Circle({
        radius: SLOT,
        fill: filled ? ink : s.palette.paper,
        fillOpacity: filled ? 0.13 : 1,
        stroke: fresh ? TAIL : filled ? ink : soft,
        strokeWidth: fresh ? 0.05 : filled ? 0.035 : 0.025,
        ...(filled ? {} : { dashArray: '0.09 0.07' }),
      });
    // Copies fly between the incoming View (View > token > ring, digit), stored
    // values and tray tokens. A Transform pairs families tree by tree, so all three
    // share that tree: ring morphs into ring and digit into digit.
    /** A stored value: its number, and an unseen slot-sized ring a token's ring can grow into or out of. */
    const stored = (v: number, at: Vec) =>
      new Group(
        new Group(
          new Circle({ radius: SLOT, fill: 'none', stroke: ink, strokeWidth: 0.03, opacity: 0 }).moveTo(at),
          new Text(String(v), { fontSize: 0.44, color: ink }).moveTo(at),
        ),
      );
    const token = (v: number, refused: boolean) => {
      const color = refused ? s.bad : soft;
      const ring = new Circle({
        radius: 0.32,
        fill: s.palette.paper,
        stroke: color,
        strokeWidth: 0.03,
        ...(refused ? { dashArray: '0.08 0.06' } : {}),
      });
      return new Group(ring, new Text(String(v), { fontSize: 0.28, color: ink }).moveTo(ring.center()));
    };
    const pointer = (name: 'head' | 'tail', i: number) => {
      const a = angle(i) + (name === 'head' ? 0.22 : -0.22),
        color = name === 'head' ? head : TAIL;
      const start = polar(a, R + 1.12),
        slot = polar(angle(i), R),
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
    /** An outline that stays on the slot an operation touched until the next operation. */
    const mark = (i: number, color: string) =>
      new SurroundingRectangle(circles[i]!, {
        buff: 0.09,
        cornerRadius: SLOT + 0.09,
        stroke: color,
        strokeWidth: 0.045,
      });

    // What the ring shows, in words: one description shared by every native piece of it
    // (slots, indices, cursors, the readout, values, outlines, push(v) and the tray).
    let outlined: { slot: number; why: string }[] = [];
    const tray = { label: '', values: [] as number[] };
    const ringWords = () => {
      const st = this.state as unknown as Snapshot & { operation: unknown };
      const said = [
        `A ring of five slots: ${st.data.map((v, i) => `slot ${i} ${v == null ? 'empty' : `holds ${v}`}`).join(', ')}`,
        `The head arrow points at slot ${st.head} and the tail arrow at slot ${st.tail}; the middle reads head ${st.head}, tail ${st.tail}, length ${st.length}`,
        ...outlined.map((o) => `Slot ${o.slot} is outlined ${o.why}`),
      ];
      const v = pushArg(st.operation);
      if (v != null) said.push(`push(v) holds ${v}`);
      if (tray.values.length)
        said.push(
          `Under the ring, after “${tray.label}”: ${tray.values.join(', ')}${tray.label.startsWith('refused') ? ', crossed out' : ''}`,
        );
      return said.join('. ') + '.';
    };
    const keepRing = <T extends Mobject>(...mobs: [T, ...Mobject[]]): T => s.keep(...mobs, { describe: ringWords });

    // The queue the ring replaces: an array whose pop moves every value left.
    await readerFirst(this, s, readerFrames());
    const shifted = [arrayQueue([1, 2, 3, 4, 5]), arrayQueue([2, 3, 4, 5])];
    await this.step('slots', {
      title: 'Answer: keep the values still, and move two markers instead',
      line: 'Predict: after five pushes, where are head and tail?',
      caption:
        'Keep five fixed slots and remember two positions: head, the slot pop reads next, and tail, the slot push writes next. Push writes at tail and moves tail on; pop reads at head and moves head on. Values stay in their slots while head and tail move, and both wrap back to slot 0 to reuse freed slots. Queue order starts at head, not at the leftmost or lowest-numbered slot. The three fields start at 0.',
    });
    await s.clear();
    let now: Snapshot = { head: 0, tail: 0, length: 0, data: Array(SLOTS).fill(null) };
    this.state = { ...now, operation: null, error: null, returned: null };
    const circles = Array.from({ length: SLOTS }, (_, i) => slotCircle(false).moveTo(polar(angle(i), R)));
    const values: (Group | null)[] = Array(SLOTS).fill(null);
    const indices = Array.from({ length: SLOTS }, (_, i) =>
      new Text(String(i), { fontSize: 0.2, font: 'mono', color: soft }).moveTo(polar(angle(i), R - 0.86)),
    );
    const headPtr = pointer('head', 0),
      tailPtr = pointer('tail', 0);
    // The buffer's own fields, rebuilt from this.state at every sync.
    const readout = (this.readout = view(
      this,
      (st) => {
        const r = new StateReadout(
          (['head', 'tail', 'length'] as const).map((k) => [k, st[k]] as const),
          { fontSize: 0.26, at: [C[0] + 0.32, C[1] + 0.4], gap: 0.4 },
        );
        r.children.forEach((t, i) => t.setFill(i % 2 ? ink : soft));
        return r;
      },
      { place: false },
    ));
    keepRing(readout, headPtr, tailPtr, ...circles, ...indices);
    await this.play(...circles.map((c) => new FadeIn(c)), ...indices.map((t) => new FadeIn(t)));
    await this.play(new FadeIn(headPtr), new FadeIn(tailPtr), new FadeIn(readout));
    // The card keeps its panel, title and labels; a View holds its values.
    const card = new Card(
      this,
      s.palette,
      [
        ['Operation', '–'],
        ['Result', '–'],
      ],
      { at: regionBox('full', { left: -0.25, bottom: 1.0 }), width: 7.4, fontSize: 0.27 },
    );
    const rows = (['Operation', 'Result'] as const).map((label) => {
      const placeholder = card.values.get(label)!;
      card.remove(placeholder);
      return { label, at: placeholder.anchorPoint() };
    });
    const resultOf = (st: SceneState) =>
      st.error != null
        ? String(st.error)
        : Array.isArray(st.returned)
          ? `returned ${st.returned.join(', ')}`
          : st.operation != null
            ? 'ok'
            : '–';
    const results = (this.results = view(
      this,
      (st) =>
        new Group(
          ...rows.map(({ label, at }) =>
            new Text(label === 'Operation' ? String(st.operation ?? '–') : resultOf(st), {
              fontSize: 0.27 * 1.04,
              font: 'mono',
              color: ink,
              anchor: 'end',
            }).moveTo(at, [1, 0]),
          ),
        ),
      { place: false },
    ));
    // The card's own values were taken out, so the view's words describe it.
    let resultMarked = false;
    s.keep(results, {
      describe: () =>
        `A card: Operation: ${String(this.state.operation ?? '–')}, Result: ${resultOf(this.state)}${resultMarked ? ' (marked)' : ''}`,
    });
    await this.play(new FadeIn(card, { runTime: 0.35, shift: [0, -0.08] }), new FadeIn(results, { runTime: 0.35 }));
    const code = await s.code(CODE, {
      at: regionBox('full', { left: -0.25, top: card.box()![1] - 0.25 }),
      fontSize: 0.2,
    });
    const incoming = (this.incoming = view(
      this,
      (st) => {
        const v = pushArg(st.operation);
        // No argument (a pop): an unseen ring holds the place, so a token grows in and shrinks away there.
        return v == null ? new Group(new Circle({ radius: 0.32, opacity: 0 }).moveTo(IN)) : token(v, false).moveTo(IN);
      },
      { place: false },
    ));
    this.add(incoming);
    const argLabel = new Text('push(v)', { fontSize: 0.24, font: 'mono', color: soft, anchor: 'end' }).moveTo(
      [IN[0] - 0.5, IN[1]],
      [1, 0],
    );
    keepRing(incoming, argLabel);

    // A row of tokens under the ring: values that left (pop) or never got in (Full).
    let trayX = -5;
    const trayLabel = (text: string) => {
      const t = new Text(text, { fontSize: 0.24, color: soft, anchor: 'start' }).moveTo([-7.35, -3.85], [-1, 0]);
      trayX = t.box()![2] + 0.55;
      tray.label = text;
      tray.values = [];
      return keepRing(t);
    };
    const trayAt = (k: number): Vec => [trayX + k * 0.95, -3.85];
    const syncAll = () => together([readout.sync({ runTime: 0.45 }), results.sync({ runTime: 0.45 })]);

    const groups = [events.slice(0, 5), events.slice(5, 6), events.slice(6)];
    let refused = 0,
      marks: Mobject[] = [];
    for (let g = 0; g < groups.length; g++) {
      await this.step(['fill', 'next', 'result'][g]!, {
        title:
          g === 0
            ? 'Answer: both back at slot 0, so only length says full'
            : which === 'wrap'
              ? g === 1
                ? 'Answer: 1 and 2 leave, and no other value moves'
                : 'Answer: into slots 0 and 1, the slots the pops freed'
              : g === 1
                ? 'Answer: push 6 throws Full before changing anything'
                : 'push 7 is refused too, and the ring is unchanged',
        line:
          g === 0
            ? which === 'wrap'
              ? 'Predict: pop twice. Which values leave, and does anything move?'
              : 'Predict: the ring is full. What does push 6 do?'
            : which === 'wrap'
              ? g === 1
                ? 'Predict: tail is at 0. Where do push 6 and push 7 go?'
                : `Read from head, slot ${events.at(-1)!.result.head}: ${queueOrder(events.at(-1)!.result).join(', ')}.`
              : g === 1
                ? 'The first line of push finds length === capacity, both 5.'
                : 'Head, tail and length still read 0, 0 and 5.',
        caption:
          g === 0
            ? 'Each push outlines the slot at tail, copies v into it, then moves tail on modulo five and adds one to length. After five pushes tail has wrapped to 0, where head is, just as when the ring was empty; only length, 5, says the ring is full. Coincident markers cannot distinguish “nothing to read” from “no room to write”.'
            : which === 'wrap'
              ? g === 1
                ? `Each pop copies the value at head out to the tray, clears its slot and moves head on: 1 from slot 0, then 2 from slot 1, and head is at 2. The array queue would have moved ${shifted[0]!.moved} values and then ${shifted[1]!.moved}; the ring moved none. Tail is still at 0, the first of the two outlined slots the pops freed.`
                : 'Tail wrapped to 0 after the fifth push, so 6 and 7 are copied into slots 0 and 1, the storage two pops gave back, and no stored value moves. Length is back to 5, with head and tail both at 2. Left to right the slots hold 6, 7, 3, 4, 5, but the queue starts at head and wraps past slot 4, so the markers decide the order, not the slot numbers.'
              : g === 1
                ? 'push checks length === capacity on its first line, so with length 5 it throws Full before writing a slot or moving either marker. The 6 is crossed out short of slot 0 and goes to the refused tray, and head, tail and length do not change.'
                : 'push 7 is refused the same way and joins 6 in the refused tray; the ring still holds 1 to 5. Some ring buffers overwrite the oldest value instead. This one refuses, so no stored value is lost and the caller must handle Full.',
      });
      const first = groups[g]![0]!;
      await code.focus(first.error ? 1 : first.operation.startsWith('pop') ? [8, 12] : [2, 4]);
      // Every operation of the step, in order, in one play. The model already ran:
      // Each SetState puts its answer in this.state at its turn, and the syncs after it show it.
      const members: ScheduledAnimation[] = [];
      if (g === 0) members.push(new FadeIn(argLabel, { runTime: 0.3 }));
      for (const event of groups[g]!) {
        const r = event.result,
          popped = event.operation.startsWith('pop'),
          gone = now.data.flatMap((v, i) => (v != null && r.data[i] == null ? [i] : []));
        members.push(
          new SetState(this, {
            ...r,
            operation: event.operation,
            error: event.error ?? null,
            returned: popped ? gone.map((i) => now.data[i]!) : null,
          }),
        );
        const clear = marks.map((m) => new FadeOut(m, { runTime: 0.3 }));
        marks = [];
        outlined = [];
        members.push(together([incoming.sync({ runTime: 0.4 }), ...clear]));
        if (event.error) {
          // Refused: the value travels toward the slot it would have taken and goes no further.
          const near = polar(angle(r.tail), R + SLOT + 0.38),
            bad = new Group(token(pushArg(event.operation)!, true).moveTo(near)),
            cross = new Cross(bad, { stroke: s.bad, strokeWidth: 0.035, scale: 0.95 }),
            outline = mark(r.tail, s.bad);
          marks.push(keepRing(outline, bad, cross));
          outlined.push({ slot: r.tail, why: `in red, where ${event.operation} would have gone` });
          if (!refused) {
            members.push(new FadeIn(trayLabel('refused, Full:'), { runTime: 0.3 }));
          }
          tray.values.push(pushArg(event.operation)!);
          const to = trayAt(refused),
            by: Vec = [to[0] - near[0], to[1] - near[1]];
          members.push(
            new Create(outline, { runTime: 0.35 }),
            new TransformFromCopy(incoming, bad, { runTime: 0.6 }),
            new Create(cross, { runTime: 0.4 }),
            together([
              new Transform(bad, bad.copy().moveTo(to), { runTime: 0.5 }),
              new Transform(cross, cross.copy().shift(by), { runTime: 0.5 }),
            ]),
          );
          refused++;
        } else if (popped) {
          members.push(new FadeIn(trayLabel('popped:'), { runTime: 0.3 }));
          gone.forEach((i, k) => {
            const outline = mark(i, head),
              out = new Group(token(now.data[i]!, false).moveTo(trayAt(k)));
            marks.push(keepRing(outline, out));
            outlined.push({ slot: i, why: `in the head colour, popped and now empty` });
            tray.values.push(now.data[i]!);
            members.push(
              together([
                new Create(outline, { runTime: 0.4 }),
                new TransformFromCopy(values[i]!, out, { runTime: 0.6 }),
              ]),
              together([
                new Transform(circles[i]!, slotCircle(false).moveTo(polar(angle(i), R)), { runTime: 0.35 }),
                new FadeOut(values[i]!, { runTime: 0.35 }),
              ]),
            );
            values[i] = null;
          });
        } else {
          // Slots written after the first fill keep a tail-coloured ring.
          const i = now.tail,
            at = polar(angle(i), R),
            outline = mark(i, TAIL);
          marks.push(keepRing(outline));
          outlined.push({ slot: i, why: `in the tail colour, where ${r.data[i]} was just written` });
          values[i] = keepRing(stored(r.data[i]!, at));
          values[i]!.key = `slot:${i}`;
          // The slot at tail is outlined first, then the value is copied into it.
          members.push(
            new Create(outline, { runTime: 0.35 }),
            together([
              new TransformFromCopy(incoming, values[i]!, { runTime: 0.6 }),
              new Transform(circles[i]!, slotCircle(true, g > 0).moveTo(at), { runTime: 0.6 }),
            ]),
          );
        }
        const moves: ScheduledAnimation[] = [];
        if (r.head !== now.head) moves.push(new Transform(headPtr, pointer('head', r.head), { runTime: 0.45, pathFunc: alongRing(now.head, r.head) }));
        if (r.tail !== now.tail) moves.push(new Transform(tailPtr, pointer('tail', r.tail), { runTime: 0.45, pathFunc: alongRing(now.tail, r.tail) }));
        members.push(together([...moves, syncAll()]));
        now = r;
      }
      await this.play(new Succession(members));
      if (first.error) {
        resultMarked = true;
        await card.mark('Result');
      }
    }
  }
}

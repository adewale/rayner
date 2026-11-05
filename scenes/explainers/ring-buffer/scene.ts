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
  Follow,
  SurroundingRectangle,
  Cross,
  StateReadout,
  Machine,
  choreograph,
  view,
  linear,
} from '../../../src/index.ts';
import type { ScheduledAnimation, Vec, Mobject, SceneState, View, Choreography } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card } from '../../../explain/index.ts';
import { ringStory, ringStart, ringNext, RingBuffer } from '../lib/models.ts';
import type { RingState, RingEvent } from '../lib/models.ts';

/** The check questions' answers, from the same model: rings and queues no step draws. */
const CHECK = (() => {
  // Carry on from the wrap scenario's last step: three pops, then push 8.
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
/** The tray under the ring: its row, below the labels of the pointers at the bottom slots, and where it must end, left of the code. */
const TRAY_Y = -4.1,
  TRAY_END = -0.6;
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
/** The turn from one slot to another, the short way round. */
const turnBetween = (from: number, to: number) => {
  const d = angle(to) - angle(from);
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
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
  /** The ring itself (slots, values, pointers, outlines, push(v) and the tray): a View of `this.state`. */
  ring?: View;

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
    /** A pointer at any angle round the ring: its arrow toward the slot there, its word upright beside it. */
    const pointerAt = (name: 'head' | 'tail', at: number) => {
      const a = at + (name === 'head' ? 0.22 : -0.22),
        color = name === 'head' ? head : TAIL;
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
    const pointer = (name: 'head' | 'tail', i: number) => pointerAt(name, angle(i));
    /** An outline that stays on the slot an operation touched until the next operation. */
    const mark = (i: number, color: string) =>
      new SurroundingRectangle(slotCircle(false).moveTo(polar(angle(i), R)), {
        buff: 0.09,
        cornerRadius: SLOT + 0.09,
        stroke: color,
        strokeWidth: 0.045,
      });

    // The ring, drawn from the machine's state: every piece keyed, so a transition can move each.
    const trayLabelAt = (text: string) => new Text(text, { fontSize: 0.24, color: soft, anchor: 'start' }).moveTo([-7.35, TRAY_Y], [-1, 0]);
    const ringPicture = (st: RingState) => {
      const parts: Mobject[] = [];
      const add = (m: Mobject, key: string) => { m.key = key; parts.push(m); };
      for (let i = 0; i < SLOTS; i++) {
        add(slotCircle(st.data[i] != null, st.reused[i]!).moveTo(polar(angle(i), R)), `ring:slot:${i}`);
        add(new Text(String(i), { fontSize: 0.2, font: 'mono', color: soft }).moveTo(polar(angle(i), R - 0.86)), `ring:index:${i}`);
      }
      st.data.forEach((v, i) => { if (v != null) add(stored(v, polar(angle(i), R)), `ring:value:${i}`); });
      add(pointer('head', st.head), 'ring:pointer:head');
      add(pointer('tail', st.tail), 'ring:pointer:tail');
      const colour = { push: TAIL, pop: head, refused: s.bad } as const;
      for (const m of st.marks) add(mark(m.slot, colour[m.kind]), `ring:mark:${m.slot}`);
      const v = pushArg(st.operation);
      // No argument (a pop): an unseen ring holds the place.
      add(v == null ? new Group(new Circle({ radius: 0.32, opacity: 0 }).moveTo(IN)) : new Group(token(v, false)).moveTo(IN), `ring:incoming:${v ?? 'none'}`);
      if (st.operation != null) {
        add(new Text('push(v)', { fontSize: 0.24, font: 'mono', color: soft, anchor: 'end' }).moveTo([IN[0] - 0.5, IN[1]], [1, 0]), 'ring:arg');
        // The value the next push hands the buffer, so two states that differ only there look different.
        add(new Text(`next ${st.next}`, { fontSize: 0.2, font: 'mono', color: soft, anchor: 'end' }).moveTo([IN[0] - 0.5, IN[1] - 0.36], [1, 0]), `ring:next:${st.next}`);
      }
      if (st.tray) {
        // The most recent values that fit left of the code; the label counts the rest.
        const all = st.tray.values;
        let shown = all.length, label = trayLabelAt(st.tray.label);
        for (; shown > 1; shown--) {
          label = trayLabelAt(shown < all.length ? `${st.tray.label.slice(0, -1)} (+${all.length - shown}):` : st.tray.label);
          if (label.box()![2] + 0.55 + (shown - 1) * 0.95 + 0.32 <= TRAY_END) break;
        }
        const x = label.box()![2] + 0.55;
        add(label, `ring:tray:${st.tray.label}`);
        all.forEach((value, i) => {
          const k = i - (all.length - shown);
          if (k < 0) return;
          const bad = new Group(token(value, st.tray!.refused)).moveTo([x + k * 0.95, TRAY_Y]);
          add(bad, `ring:tray:${i}`);
          if (st.tray!.refused) add(new Cross(bad, { stroke: s.bad, strokeWidth: 0.035, scale: 0.95 }), `ring:tray:${i}:cross`);
        });
      }
      return new Group(...parts);
    };
    // What the ring shows, in words.
    const ringWords = () => {
      const st = this.state as unknown as RingState;
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
    };

    // The queue the ring replaces: an array whose pop moves every value left.
    await s.steps(readerFrames(), { kind: 'short' });
    const shifted = [arrayQueue([1, 2, 3, 4, 5]), arrayQueue([2, 3, 4, 5])];
    await this.step('slots', {
      title: 'Answer: keep the values still, and move two markers instead',
      line: 'Predict: after five pushes, where are head and tail?',
      caption:
        'Keep five fixed slots and remember two positions: head, the slot pop reads next, and tail, the slot push writes next. Push writes at tail and moves tail on; pop reads at head and moves head on. Values stay in their slots while head and tail move, and both wrap back to slot 0 to reuse freed slots. Queue order starts at head, not at the leftmost or lowest-numbered slot. The three fields start at 0.',
    });
    await s.clear();
    const start = ringStart(SLOTS);
    this.state = { ...start } as unknown as SceneState;
    const ring = (this.ring = view(this, (st) => ringPicture(st as unknown as RingState), { place: false }));
    s.keep(ring, { describe: ringWords });
    // What the ring marks, as emphasis the phone's close-ups visit first and review holds to the
    // caption: each outlined slot, and the value the tray took last. Read from state.
    s.emphasise(() => {
      const st = this.state as unknown as RingState, out: [Mobject, string][] = [];
      const at = (key: string, what: string) => { const m = ring.current.find(key); if (m) out.push([m, what]); };
      for (const m of st.marks) at(`ring:mark:${m.slot}`, `outlined: ${m.kind} at slot ${m.slot}`);
      const last = (st.tray?.values.length ?? 0) - 1;
      if (last >= 0) at(`ring:tray:${last}`, `${st.tray!.label} ${st.tray!.values[last]}`);
      return out;
    });
    // Checked on every frame by rayner check: a pointer moving between slots goes round the ring,
    // never across it, so its arrow always starts on the pointers' circle.
    const arrowBase = (ptr: Mobject) => ptr.children[0]!.children[0]!.pointArrays()[0]!;
    const pointerRadius = Math.hypot(arrowBase(pointer('head', 0))[0]! - C[0], arrowBase(pointer('head', 0))[1]! - C[1]);
    this.addInvariant('pointers stay on their circle', (scene) => {
      let checked = false;
      for (const name of ['head', 'tail']) {
        const ptr = scene.find(`ring:pointer:${name}`);
        if (!ptr) continue;
        const [x, y] = arrowBase(ptr), r = Math.hypot(x! - C[0], y! - C[1]);
        if (Math.abs(r - pointerRadius) > 1e-3) return `the ${name} arrow starts ${r.toFixed(3)} from the centre, not ${pointerRadius.toFixed(3)}`;
        checked = true;
      }
      return checked;
    });
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
    s.keep(readout, { describe: ringWords });
    await this.play(new FadeIn(ring));
    await this.play(new FadeIn(readout));
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

    // The reader could press push or pop; each press is one model step, its motion authored below.
    // A transition morphs the ring's parts in turn; anything it does not name lands at the end.
    const fields = () => together([readout.sync({ runTime: 0.45 }), results.sync({ runTime: 0.45 })]);
    /** One angle drives a pointer round the ring, the short way, drawn afresh at each sampled angle. */
    const turn = (c: Choreography, name: 'head' | 'tail', from: number, to: number) => {
      const a0 = angle(from), a1 = a0 + turnBetween(from, to);
      return new Follow({ from: a0, to: a1, draw: (a) => (a === a1 ? pointer(name, to) : pointerAt(name, a)) }, { targets: [c.own(`ring:pointer:${name}`)], runTime: 0.45 });
    };
    /** The last operation's outlines go, and push(v) shows this operation's argument. */
    const arrive = (c: Choreography, before: RingState, after: RingState, keepMarks: boolean) => {
      const out: ScheduledAnimation[] = [];
      // Outlines the new state does not keep go; one that stays on the same slot stays put.
      if (!keepMarks) for (const m of before.marks) if (!after.marks.some((n) => n.slot === m.slot && n.kind === m.kind)) out.push(c.leave(`ring:mark:${m.slot}`, { runTime: 0.3 }));
      const was = `ring:incoming:${pushArg(before.operation) ?? 'none'}`, now = `ring:incoming:${pushArg(after.operation) ?? 'none'}`;
      if (was !== now) out.push(c.leave(was, { runTime: 0.4 }), c.enter(now, {}, { runTime: 0.4 }));
      if (!c.has('ring:arg', 'from')) out.push(c.enter('ring:arg', {}, { runTime: 0.3 }));
      return together(out);
    };
    /** The outline on `slot`, drawn unless it was already there (then it lands with the rest). */
    const outline = (c: Choreography, slot: number, runTime: number): ScheduledAnimation[] =>
      c.has(`ring:mark:${slot}`, 'from') ? [] : [c.enter(`ring:mark:${slot}`, { create: true }, { runTime })];
    /** A new tray run: the old tray leaves and the new label comes in. */
    const newTray = (c: Choreography, before: RingState, after: RingState) => {
      if (before.tray?.label === after.tray!.label && after.tray!.values.length > 1) return [];
      const out: ScheduledAnimation[] = c.keys('from').filter((k) => k.startsWith('ring:tray:')).map((k) => c.leave(k, { runTime: 0.3 }));
      out.push(c.enter(`ring:tray:${after.tray!.label}`, {}, { runTime: 0.3 }));
      return [together(out)];
    };
    const machine = new Machine<RingState, RingEvent>(this, {
      start,
      events: ['push', 'pop'],
      next: ringNext,
      // The ring would take 10 and on; this story pushes the values 1 to 9.
      bound: (st, event) => (event === 'push' && st.next > 9 ? 'This story pushes the values 1 to 9' : undefined),
      views: [ring, readout, results],
      // A push takes 1.8 s, a pop 2.1 s and a refused push, which travels, is crossed and is trayed, 3 s.
      runTime: ({ event, after }) => (event === 'pop' ? 2.1 : after.error ? 3 : 1.8),
      transition: {
        push: (t) => {
          const { before, after } = t, c = t.choreograph(ring);
          const slot = before.tail;
          if (after.error) {
            // Refused: the value travels toward the slot it would have taken and goes no further,
            // is crossed out there, and goes to the tray. Built in the order it plays.
            const k = after.tray!.values.length - 1, near = polar(angle(slot), R + SLOT + 0.38);
            const first = arrive(c, before, after, false), tray = newTray(c, before, after), drawn = outline(c, slot, 0.35);
            const to = c.to(`ring:tray:${k}`), cross = c.to(`ring:tray:${k}:cross`);
            const by: Vec = [near[0] - to.center()[0], near[1] - to.center()[1]];
            const bad = c.insert(`ring:tray:${k}`, c.from(`ring:incoming:${pushArg(after.operation)}`));
            const crossed = c.insert(`ring:tray:${k}:cross`, cross.copy().shift(by));
            crossed.setOpacity(0);
            return new Succession([
              first,
              ...tray,
              ...drawn,
              new Transform(bad, to.copy().shift(by), { runTime: 0.6 }),
              new Transform(crossed, cross.copy().shift(by), { runTime: 0.4 }),
              together([new Transform(bad, to, { runTime: 0.5 }), new Transform(crossed, cross, { runTime: 0.5 })]),
              together([fields(), c.rest({ runTime: 0.45 })]),
            ]);
          }
          // The slot at tail is outlined first, then the value is copied into it, then tail moves on.
          return new Succession([
            arrive(c, before, after, false),
            ...outline(c, slot, 0.35),
            together([
              c.enter(`ring:value:${slot}`, { from: `ring:incoming:${pushArg(after.operation)}` }, { runTime: 0.6 }),
              c.morph(`ring:slot:${slot}`, { runTime: 0.6 }),
            ]),
            together([turn(c, 'tail', before.tail, after.tail), fields(), c.rest({ runTime: 0.45 })]),
          ]);
        },
        pop: (t) => {
          const { before, after } = t, c = t.choreograph(ring);
          const slot = before.head, k = after.tray!.values.length - 1;
          // The value at head is copied out to the tray, its slot empties, and head moves on.
          return new Succession([
            arrive(c, before, after, before.operation === 'pop'),
            ...newTray(c, before, after),
            together([
              ...outline(c, slot, 0.4),
              c.enter(`ring:tray:${k}`, { from: `ring:value:${slot}` }, { runTime: 0.6 }),
            ]),
            together([c.morph(`ring:slot:${slot}`, { runTime: 0.35 }), c.leave(`ring:value:${slot}`, { runTime: 0.35 })]),
            together([turn(c, 'head', before.head, after.head), fields(), c.rest({ runTime: 0.45 })]),
          ]);
        },
      },
    });

    const story = ringStory(which);
    const replays: RingEvent[][] = which === 'wrap' ? [['push', 'push', 'push', 'push', 'push'], ['pop', 'pop'], ['push', 'push']] : [['push', 'push', 'push', 'push', 'push'], ['push'], ['push']];
    for (let g = 0; g < replays.length; g++) {
      const last = (this.state as unknown as RingState);
      const ending = replays[g]!.reduce((st, e) => ringNext(st, e)!, last);
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
                : `Read from head, slot ${story.at(-1)!.result.head}: ${queueOrder(story.at(-1)!.result).join(', ')}.`
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
      await code.focus(ending.error ? 1 : replays[g]![0] === 'pop' ? [8, 12] : [2, 4]);
      await this.play(machine.replay(replays[g]!));
      // The card's Result row is marked once, when push first throws Full; it stays marked.
      if (ending.error && !resultMarked) {
        resultMarked = true;
        await card.mark('Result');
      }
    }
  }
}

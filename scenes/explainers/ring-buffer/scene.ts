import {
  Scene,
  SetState,
  AnimationGroup,
  Succession,
  Text,
  Group,
  FadeIn,
  FadeOut,
  Create,
  Transform,
  TransformFromCopy,
  Follow,
  StateReadout,
  Machine,
  choreograph,
  view,
  linear,
} from '../../../src/index.ts';
import type { ScheduledAnimation, Vec, Mobject, SceneState, View, Choreography } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card } from '../../../explain/index.ts';
import { ringStory, ringStart, ringNext } from './model.ts';
import type { RingState, RingEvent } from './model.ts';
import { frames as readerFrames, arrayQueue, SLOTS, C, R, SLOT, angle, polar, pushArg, pointer, pointerAt, drawRing, sayRing } from './picture.ts';
import type { Ink } from './picture.ts';

type Snapshot = ReturnType<typeof ringStory>[number]['result'];
// RingBuffer from ./model.ts, without the `this.`s.
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
/** The turn from one slot to another, the short way round. */
const turnBetween = (from: number, to: number) => {
  const d = angle(to) - angle(from);
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
};
/** Animations side by side in group time that does not ease, so each member's own easing is not compounded. */
const together = (anims: ScheduledAnimation[]) => new AnimationGroup(anims, { rateFunc: linear });

// The title, answer and check questions come from script.md's intent header.
export default class RingBufferExplainer extends Scene {
  static meta = {
    id: 'ring-buffer',
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/ring-buffer.doc.json',
      'https://tc39.es/ecma262/2025/#sec-array.prototype.shift',
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

    const look: Ink = { ink, soft, paper: s.palette.paper, head, bad: s.bad };
    const ringPicture = (st: RingState) => drawRing(st, look);
    // What the ring shows, in words.
    const ringWords = () => sayRing(this.state as unknown as RingState);

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
      const st = this.state as unknown as RingState, last = (st.tray?.values.length ?? 0) - 1;
      return [
        ...st.marks.map((m) => [`ring:mark:${m.slot}`, `outlined: ${m.kind} at slot ${m.slot}`] as const),
        ...(last >= 0 ? [[`ring:tray:${last}`, `${st.tray!.label} ${st.tray!.values[last]}`] as const] : []),
      ];
    });
    // Checked on every frame by rayner check: a pointer moving between slots goes round the ring,
    // never across it, so its arrow always starts on the pointers' circle.
    const arrowBase = (ptr: Mobject) => ptr.children[0]!.children[0]!.pointArrays()[0]!;
    const pointerRadius = Math.hypot(arrowBase(pointer(look, 'head', 0))[0]! - C[0], arrowBase(pointer(look, 'head', 0))[1]! - C[1]);
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
      return new Follow({ from: a0, to: a1, draw: (a) => (a === a1 ? pointer(look, name, to) : pointerAt(look, name, a)) }, { targets: [c.own(`ring:pointer:${name}`)], runTime: 0.45 });
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
      const ending = replays[g]!.reduce((st, e) => machine.after(st, e)!, last);
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

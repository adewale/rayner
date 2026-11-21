// A request and its answer, with one authored transition per send: a ticket flies from the client to
// the server, the answer is written under the server, and a marker on a track counts the sends.
// The default export choreographs it with the drawing kit as the Poppy series' motion audit left its
// transitions; `motionFixture(defect)` brings back one kind of defect that audit found by filming,
// which the keyed motion check (src/keyed-motion.ts) now finds without a browser:
//
//   jump     from the second send on, the transition is longer than the event's run time, so it is
//            squeezed into it, and the marker's 0.15 s slide becomes a snap of under a frame (issue
//            #101, item 12: five chapters)
//   flicker  the server's name, which no send changes, goes out and comes back mid-flight
//   early    the answer is written as the ticket sets off, readable before the ticket lands (#101,
//            item 14: "an answer or changed value readable before its cause arrived")
//
// As in the series, each defect is in presses a reader can make, which only filming saw: the run's
// own send plays the jump's first send, which is not squeezed, so before the keyed motion check every
// check passed all three. test/keyed-motion.test.ts checks that each defect fails and the fixed
// scene passes.
import { AnimationGroup, Group, Rectangle, Scene, Succession, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, Machine, view } from '../../../explain/index.ts';
import type { DrawContext, Transition } from '../../../explain/index.ts';
import { TYPE, beats, flight, tile, label } from '../../../explain/drawing.ts';

type Post = { sent: number };
type Send = 'send';
export type Defect = 'none' | 'jump' | 'flicker' | 'early';

const CLIENT: Vec = [-5, 1.2], SERVER: Vec = [5, 1.2];
const markerAt = (n: number): Vec => [-3 + 1.5 * n, -2.6];

/** The client and the server, the ticket and the answer after a send, and the marker on its track. */
function drawPost(st: Post, s: DrawContext): Group {
  // A ground the size of the stage, so the picture keeps its place as the ticket and the answer come and go.
  const ground = keyed(new Rectangle({ width: 15.5, height: 8.5, fill: s.look.paper, stroke: 'none' }), 'ground');
  const box = (name: string, at: Vec) => tile(s, name, { at, key: name, raised: true, size: TYPE.small }).children;
  const parts: Mobject[] = [ground, ...box('client', CLIENT), ...box('server', SERVER)];
  const track = keyed(new Rectangle({ width: 7.5, height: 0.06, fill: s.look.muted, stroke: 'none' }).moveTo([0, -2.6]), 'track');
  const marker = keyed(new Rectangle({ width: 0.4, height: 0.4, fill: s.look.emphasis, stroke: 'none' }).moveTo(markerAt(st.sent)), 'marker');
  parts.push(track, marker);
  if (st.sent > 0) {
    const ticket = keyed(new Group(
      new Rectangle({ width: 1.4, height: 0.7, fill: s.look.raised, stroke: s.look.ink, strokeWidth: 0.06 }),
      keyed(label(s, `#${st.sent}`, { mono: true }), 'ticket:number'),
    ).moveTo([SERVER[0], 0]), 'ticket');
    parts.push(ticket, keyed(label(s, `200 OK, request ${st.sent}`, { at: [SERVER[0], -1.1], size: TYPE.label }), 'answer'));
  }
  const g = new Group();
  for (const p of parts) g.add(p);
  return g;
}

/** The scene, with its transition choreographed well (`'none'`) or with one defect brought back. */
export function motionFixture(defect: Defect) {
  return class MotionFixture extends Scene {
    static meta = { id: 'motion', title: 'A request and its answer' };
    override state: Post = { sent: 0 };
    override async construct() {
      const s = stage(this, { heading: false });
      const post = view(this, (st: Post, _shown, drawing) => drawPost(st, drawing), { drawing: s.drawing });
      const send = (t: Transition<Post, Send>) => {
        const c = t.choreograph(post);
        // It sets off just under the client, not over the client's name.
        const fly = flight(c, 'ticket', [[CLIENT[0], CLIENT[1] - 1.3]], { appear: 0.25, move: 1.0, leave: 0.2 });
        if (defect === 'early') {
          // The answer is written while the ticket is still in the air.
          const had = c.has('answer', 'from') ? [c.leave('answer', { runTime: 0.15 })] : [];
          const answer = new Succession([...had, c.enter('answer', {}, { runTime: 0.3 })]);
          return new Succession([new AnimationGroup([new Succession(fly()), answer]), c.rest({ runTime: 0.45 })]);
        }
        if (defect === 'flicker') {
          // The server's name blinks as the ticket flies, though no send changes it.
          const blink = new Succession([c.leave('server:label', { runTime: 0.2 }), c.enter('server:label', {}, { runTime: 0.2 })]);
          return beats(c, () => [new AnimationGroup([new Succession(fly()), blink])], { fresh: ['answer'] });
        }
        // The marker slides in 0.15 s once the ticket lands: within the transition's own 2.3 s it is a
        // slide; squeezed into an event run time of 0.4 s (`jump`), it is a snap.
        return beats(c, () => [...fly(), c.morph('marker', { runTime: 0.15 })], { fresh: ['answer'] });
      };
      const machine = new Machine<Post, Send>(this, {
        start: { sent: 0 }, events: ['send'], views: [post],
        next: (st) => ({ sent: st.sent + 1 }),
        bound: (st) => (st.sent >= 3 ? 'Three requests show the pattern' : undefined),
        // The transition's own length: the old answer leaves (0.25 s, from the second send on), the
        // ticket flies (1.45 s), the marker slides (0.15 s), the new answer comes as the rest settles (0.45 s).
        runTime: ({ before }) => (before.sent === 0 ? 2.05 : defect === 'jump' ? 0.4 : 2.3),
        transition: { send },
      });
      await this.step('idle', { title: 'Before any request', caption: 'The client has sent nothing yet.' });
      await s.enter(post, { describe: () => `A client and a server; ${this.state.sent} requests sent` });
      await this.step('sent', { title: 'One request', caption: 'The client sends a request; the server answers it.' });
      await this.play(machine.send('send'));
    }
  };
}

export default motionFixture('none');

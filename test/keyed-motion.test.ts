// The keyed motion check (src/keyed-motion.ts): each keyed part followed from frame to frame within
// one transition, in a run's plays and in every transition a reader can press, for jumps, flicker and
// words readable before what causes them lands. The fixture (test/fixtures/motion/scene.ts) brings
// back one kind of defect at a time that filming the Poppy series found and every check passed
// (issue #101, items 12 and 14); each fails here, and the scene as fixed passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Rectangle, Scene, Text, Line, Succession, keyed } from '../src/index.ts';
import { choreograph } from '../explain/choreograph.ts';
import type { Vec } from '../src/index.ts';
import { KeyedMotionSink, keyedMotionLine } from '../src/internal.ts';
import { loadFonts } from '../explain/testing.ts';
import { Machine, stage, view } from '../explain/index.ts';
import type { Transition } from '../explain/index.ts';
import { beats, flight, label } from '../explain/drawing.ts';
import { exploreMachines, keyedMotionSink } from '../tools/lib/explain-check.ts';
import { motionFixture } from './fixtures/motion/scene.ts';
import type { Defect } from './fixtures/motion/scene.ts';

await loadFonts();

test('travelling duplicate words fail, while a separate readable label does not', async () => {
  const findings = async (labelY: number, mask: 'none' | 'back' | 'front' | 'translucent' = 'none') => {
    class Duplicates extends Scene {
      override async construct() {
        await this.step('send');
        const current = new Group(keyed(new Text('TOKEN', {fontSize: 0.6}).moveTo([0, labelY]), 'rest'));
        this.add(current);
        const c = choreograph(current, current.copy());
        const trip = c.travel('token', new Text('TOKEN', {fontSize: 0.6}), new Line([-2,0],[2,0]), {appear: 0.2, move: 2, leave: 0.2});
        if(mask!=='none'){
          const token=current.children.find(m=>m.key==='token')!;
          const paper=new Rectangle({width:3,height:1,fill:'#fff',stroke:'none',fillOpacity:mask==='translucent'?.5:1});
          current.insert(0,paper);
          if(mask==='back'||mask==='translucent')current.insert(0,token);
        }
        await this.play(new Succession([trip.appear, trip.move, trip.leave]));
      }
    }
    const sink = new KeyedMotionSink();
    await new Duplicates(sink).run();
    return sink.finish();
  };
  assert.ok((await findings(0)).some(f => f.kind === 'duplicate words'));
  assert.ok(!(await findings(2)).some(f => f.kind === 'duplicate words'));
  assert.ok(!(await findings(0,'back')).some(f=>f.kind==='duplicate words'),'an opaque foreground plate masks the approaching word');
  assert.ok((await findings(0,'front')).some(f=>f.kind==='duplicate words'),'a token drawn over the fixed copy still rejects');
  assert.ok((await findings(0,'translucent')).some(f=>f.kind==='duplicate words'),'a translucent plate cannot erase duplicate ink');
});

test('motion over five seconds fails without counting trailing reading holds', async () => {
  const findings = async (duration: number) => {
    class Long extends Scene {
      override async construct() {
        await this.step('move');
        const part = keyed(new Rectangle({width: 1, height: 1}), 'part');
        this.add(part);
        await this.play(part.animate.shift([2,0]), {runTime: duration});
        await this.wait(8);
      }
    }
    const sink = new KeyedMotionSink();
    await new Long(sink).run();
    return sink.finish();
  };
  assert.ok((await findings(6)).some(f => f.kind === 'long transition'));
  assert.ok(!(await findings(0.5)).some(f => f.kind === 'long transition'));
});

/** What the check finds in the fixture with `defect`: in every transition a reader can press, and in the run's plays. */
async function found(defect: Defect): Promise<{ pressed: string[]; played: string[] }> {
  const Fixture = motionFixture(defect);
  const sink = new KeyedMotionSink();
  const ran = await new Fixture(sink).run();
  const [explored] = await exploreMachines(ran, Fixture);
  assert.deepEqual(explored!.problems, [], 'the fixture is otherwise a sound machine explainer');
  return { pressed: explored!.motion, played: sink.finish().map((f) => `${f.segment}: ${keyedMotionLine(f)}`) };
}

test('the fixture as the motion audit left it passes: a ticket that flies, words that wait for it, a marker that slides', async () => {
  assert.deepEqual(await found('none'), { pressed: [], played: [] });
});

test('a squeezed transition is refused with its event and both durations before it can snap', async () => {
  await assert.rejects(found('jump'), /machine.send\("send"\): authored transition lasts 2.300 s but the event allows 0.400 s/);
});

test('deliberate defect: words no event changes going out and coming back mid-flight are flicker', async () => {
  const { pressed, played } = await found('flicker');
  assert.equal(pressed.length, 3, pressed.join('\n'));
  for (const line of pressed)
    assert.match(line, /: flicker: part “server:label” at \d\.\d{3} s went from alpha 0\.\d\d to 0\.\d\d and came back 0\.\d\d s later, unchanged and in the same place \(“server”\); fix: leave it alone/);
  assert.match(played.join('\n'), /^step "sent", play 1, event 1: flicker: part “server:label”/);
});

test('deliberate defect: an answer readable while its ticket is still in the air is early words', async () => {
  const { pressed } = await found('early');
  // The first send writes the answer before the ticket sets off, which the rule leaves alone (see the
  // module: words before any token moves may be the request's own); from the second on, mid-flight.
  assert.equal(pressed.length, 2, pressed.join('\n'));
  for (const line of pressed)
    assert.match(line, /^after send(, send)+: early words: part “answer” at 0\.\d{3} s “200 OK, request \d” is readable \(alpha 0\.\d\d\) while “ticket:flight” still has \d\.\d\d of its \d+\.\d\d units to travel; fix: bring the words in after “ticket:flight” lands/);
});

// ---- the rules on small pictures -------------------------------------------------------------

type N = { n: number };
/**
 * A machine whose picture is a status word (unchanged by every press) and a box, with a transition
 * written by `transition`; its one press is played in the run, and the run's findings returned.
 */
async function played(transition: (t: Transition<N, 'go'>, post: ReturnType<typeof view<N, {}, Group>>) => ReturnType<typeof beats>, runTime: number): Promise<string[]> {
  class Small extends Scene {
    override state: N = { n: 0 };
    override async construct() {
      const s = stage(this, { heading: false });
      const post = view(this, (st: N) => new Group(
        keyed(new Rectangle({ width: 15, height: 8, fill: s.look.paper, stroke: 'none' }), 'ground'),
        keyed(label(s.drawing, 'status: ready', { at: [0, 2] }), 'status'),
        keyed(label(s.drawing, `count ${st.n}`, { at: [0, -2] }), 'count'),
        keyed(new Rectangle({ width: 0.8, height: 0.5, fill: s.look.emphasis, stroke: 'none' }).moveTo([4, 0]), 'box'),
      ));
      const machine = new Machine<N, 'go'>(this, { start: { n: 0 }, events: ['go'], views: [post], next: (st) => ({ n: st.n + 1 }), runTime, transition: { go: (t) => transition(t, post) } });
      await this.step('one');
      await s.enter(post, { describe: () => `count ${this.state.n}` });
      await this.step('two');
      await this.play(machine.send('go'));
    }
  }
  // As rayner check makes it: able to judge words by their size.
  const sink = keyedMotionSink();
  await new Small(sink).run();
  return sink.finish().map((f) => `${f.kind} ${f.key}`);
}
const LEFT: Vec = [-6, 0];

test('the kit\'s word replacement is not flicker: changed words, and fresh words hidden until a token lands', async () => {
  // beats replaces "count 0" with "count 1": the words change, so their leave and enter are a change.
  assert.deepEqual(await played((t, post) => beats(t.choreograph(post)), 1.2), []);
  // Fresh words that come back unchanged after the box's flight lands: the event's result, shown again when its cause arrives.
  assert.deepEqual(await played((t, post) => { const c = t.choreograph(post); return beats(c, flight(c, 'box', [LEFT]), { fresh: ['status'] }); }, 2.6), []);
  // With nothing travelling, the same fresh words only blink.
  assert.deepEqual(await played((t, post) => beats(t.choreograph(post), () => [], { fresh: ['status'] }), 1.2), ['flicker status']);
});

test('fast travel is not a jump; a one-frame move is, and so is a size snap', async () => {
  const run = async (body: (s: Scene, m: Rectangle) => Promise<void>) => {
    class Moves extends Scene {
      override async construct() {
        const m = keyed(new Rectangle({ width: 1, height: 1 }), 'm');
        this.add(m);
        await this.step('moves');
        await body(this, m);
      }
    }
    const sink = new KeyedMotionSink();
    await new Moves(sink).run();
    return sink.finish().map((f) => `${f.kind} ${f.key} ${f.detail}`);
  };
  // Twelve units in 0.4 s, eased: over a unit a frame at its fastest, and smooth.
  assert.deepEqual(await run((s, m) => s.play(m.animate.shift([12, 0]), { runTime: 0.4 })), []);
  // Moved while nothing plays, then a slow play: the move shows as a jump in the play's first frame.
  const snapped = await run(async (s, m) => { await s.play(m.animate.shift([1, 0]), { runTime: 1 }); m.shift([3, 0]); await s.play(m.animate.shift([1, 0]), { runTime: 1 }); });
  assert.equal(snapped.length, 1, snapped.join('\n'));
  assert.match(snapped[0]!, /^jump m moved 3\.\d\d units in one 0\.033 s frame/);
  const grown = await run(async (s, m) => { await s.play(m.animate.shift([1, 0]), { runTime: 1 }); m.scale(2); await s.play(m.animate.shift([1, 0]), { runTime: 1 }); });
  assert.deepEqual(grown.map((g) => g.split(' ').slice(0, 2).join(' ')), ['jump m']);
  assert.match(grown[0]!, /changed size by 50% in one 0\.033 s frame/);
});

test('a token drawn over a label for a run of frames covers it; one that passes beside it, or under it, does not', async () => {
  // Flown at four times its size along the status line: its ink hides "status: ready" for most of the flight.
  assert.deepEqual(await played((t, post) => { const c = t.choreograph(post); return beats(c, flight(c, 'box', [[-6, 2], [2, 2]], { scale: 4 })); }, 2.6), ['covers box:flight']);
  // The same flight at its own size, a line below the words: it passes them by.
  assert.deepEqual(await played((t, post) => { const c = t.choreograph(post); return beats(c, flight(c, 'box', [[-6, 1.2], [2, 1.2]])); }, 2.6), []);
});

test('words scaled down to travel, smaller than a phone reads and than every label at rest, are small words', async () => {
  // The status line travels in from the bottom at a third of its size: under the 0.54 units a phone reads on the whole picture.
  const small = await played((t, post) => { const c = t.choreograph(post); return beats(c, flight(c, 'status', [[0, -4]], { scale: 0.33 })); }, 2.6);
  assert.ok(small.includes('small words status:flight'), small.join('\n'));
  // At its own size it reads as it does at rest.
  const whole = await played((t, post) => { const c = t.choreograph(post); return beats(c, flight(c, 'status', [[0, -4]])); }, 2.6);
  assert.ok(!whole.some((f) => f.startsWith('small words')), whole.join('\n'));
});

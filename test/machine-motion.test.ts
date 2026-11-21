import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationGroup, Circle, Group, Scene, Succession, keyed, renderFrame, toSvgString } from '../src/index.ts';
import { Machine, view } from '../explain/index.ts';
import { carry, pass } from '../explain/drawing.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';
import { MachineMotionCheck } from '../tools/lib/explain-motion-rules.ts';

type Fault = 'none' | 'source retained' | 'context gone' | 'early arrival' | 'missing travel' | 'missing transition'
  | 'wrong subject' | 'clipped context' | 'invisible travel' | 'ambiguous subject' | 'repeated' | 'simultaneous';
const ring = () => new Circle({radius: 0.3, fill: '#ffeebb', stroke: 'none'});
const side = (n: number) => n % 2 ? 'wax' : 'hook';

function story(fault: Fault) {
  return class Delivery extends Scene<{n: number}> {
    override state = {n: 0};
    override async construct() {
      const picture = view(this, ({n}) => {
        const outline = new Circle({radius: 0.8, fill: 'none', stroke: '#f00', strokeWidth: 0.1});
        const ledger = keyed(new Group(outline), 'ledger');
        // The clip meets the outline's bounds but contains only its unpainted centre.
        if (fault === 'clipped context') outline.clipBox = [-0.15, -0.15, 0.15, 0.15];
        const pieces = [ledger, keyed(ring().moveTo([n % 2 ? 2 : -2, 0]), side(n))];
        const other = new Group(...(fault === 'ambiguous subject' ? [keyed(ring(), 'ledger')] : []));
        return new Group(...pieces, keyed(other, 'other'));
      }, {place: false});
      const machine = new Machine(this, {
        events: ['send'] as const, start: {n: 0}, views: [picture], runTime: 1.8,
        next: ({n}) => n < 2 ? {n: n + 1} : undefined,
        motion: ({before, after}) => [{
          view: picture, during: 'ring:travel',
          present: [fault === 'wrong subject' ? 'ledger:typo' : 'ledger'],
          absent: [side(before.n), side(after.n)],
        }],
        transition: fault === 'missing transition' ? {} : {send: t => {
          const c = t.choreograph(picture), from = side(t.before.n), to = side(t.after.n);
          const times = {appear: 0.1, move: 0.4, leave: 0.1};
          const drop = c.to(to).center() as [number, number];
          const trip = () => pass(c, 'ring:travel', ring(), [c.from(from).center() as [number, number], drop], times);
          if (fault === 'missing travel') return c.rest({runTime: 0.6});
          if (fault === 'source retained') return new Succession([...trip(), c.rest({runTime: 0.1})]);
          if (fault === 'repeated' || fault === 'simultaneous') {
            const a = trip(), b = trip();
            const moves = fault === 'repeated' ? [...a, ...b] : [new AnimationGroup([new Succession(a), new Succession(b)])];
            return new Succession([c.leave(from, {runTime: 0.1}), ...moves, c.rest({runTime: 0.1})]);
          }
          const first = fault === 'context gone' ? [c.leave('ledger', {runTime: 0.1})]
            : fault === 'early arrival' ? [c.enter(to, {}, {runTime: 0.1})] : [];
          const token = fault === 'invisible travel' ? ring().setOpacity(0) : ring();
          const movement = fault === 'early arrival'
            ? carry(c, 'ring:travel', from, [drop], {...times, token})
            : carry(c, 'ring:travel', from, [], {...times, token, to});
          return new Succession([...first, ...movement, c.rest({runTime: 0.1})]);
        }},
      });
      await this.step('delivery');
      this.add(picture);
      await this.play(machine.replay(['send', 'send']));
    }
  };
}

async function observed(fault: Fault) {
  const Source = story(fault), check = new MachineMotionCheck();
  const scene = new Source(check);
  await check.during(scene, () => scene.run());
  return {check, scene, Source};
}

test('a wordless transfer leaves its source, stays visible in motion, and hands off to a different destination on repeated replay and reader sends', async () => {
  const {check, scene, Source} = await observed('none');
  assert.deepEqual(check.findings, []);
  assert.equal(scene.state.n, 2);
  const [explored] = await exploreMachines(scene, Source);
  assert.ok(explored);
  assert.deepEqual(explored.motion.filter(m => m.includes('motion contract')), []);
  const wrong = await observed('source retained');
  assert.equal(wrong.check.findings.length, 2);
  assert.match(wrong.check.findings[0]!, /during "ring:travel", subject "hook" must be absent/);
  assert.match(wrong.check.findings[1]!, /during "ring:travel", subject "wax" must be absent/);
  const [bad] = await exploreMachines(wrong.scene, wrong.Source);
  assert.ok(bad);
  assert.ok(bad.motion.some(m => /after send, send: motion contract.+"wax" must be absent/.test(m)));
});

test('the declared moving interval distinguishes stable context, early arrival, missing or invisible travel, and misspelt or ambiguous subjects', async () => {
  const examples: [Fault, RegExp][] = [
    ['context gone', /subject "ledger" must be present/],
    ['clipped context', /subject "ledger" must be present/],
    ['early arrival', /subject "wax" must be absent/],
    ['wrong subject', /subject "ledger:typo" must identify one part/],
    ['ambiguous subject', /subject "ledger" must identify one part/],
    ['missing travel', /declared travel was never constructed/],
    ['missing transition', /declared travel was never constructed/],
    ['invisible travel', /no sampled, visibly moving frame/],
    ['simultaneous', /more than one trip with this key is active/],
  ];
  for (const [fault, expected] of examples) {
    const {check} = await observed(fault);
    assert.ok(check.findings.some(s => expected.test(s)), `${fault}: ${check.findings.join('\n')}`);
  }
  assert.deepEqual((await observed('repeated')).check.findings, []);
});

test('observing transfer phases preserves the exact seeked pictures inside and after each transfer', async () => {
  const Source = story('none'), check = new MachineMotionCheck();
  const frames = [5, 12, 27, 59, 78, 103];
  const svg = new Map<number, string>();
  const scene = new Source({async frame(s) {
    await check.frame(s);
    if (frames.includes(s.frameCount)) svg.set(s.frameCount, toSvgString(s));
  }});
  await check.during(scene, () => scene.run());
  assert.deepEqual(check.findings, []);
  assert.equal(svg.size, frames.length);
  for (const frame of frames) assert.equal(toSvgString(await renderFrame(Source, frame)), svg.get(frame));
});

test('a borrowed source returns on the later receipt while reading a separate copy leaves its printed value in place', async () => {
  async function checkBorrow(hidePrint: boolean) {
    class Borrow extends Scene<{sent: boolean}> {
      override state = {sent: false};
      override async construct() {
        const picture = view(this, () => new Group(keyed(ring().shift([-2,0]), 'hook'), keyed(ring().shift([0,2]), 'printed')), {place: false});
        const other = view(this, () => new Group(keyed(ring().shift([3,2]), 'printed')), {place: false});
        const times = {appear: 0.1, move: 0.3, leave: 0.1};
        const machine = new Machine(this, {
          events: ['borrow'] as const, start: this.state, views: [picture, other], next: () => ({sent: true}), runTime: 2.1,
          motion: () => ['borrowed', 'read-copy', 'receipt'].map(during => ({view: picture, during, absent: ['hook'], present: ['printed']})),
          transition: {borrow: t => {
            const c = t.choreograph(picture);
            const borrow = carry(c, 'borrowed', 'hook', [[1,0]], times);
            const read = pass(c, 'read-copy', c.from('printed').copy(), [[0.7,2], [2,2]], times);
            const receipt = pass(c, 'receipt', ring(), [[1,0], [-2,0]], times);
            const gone = hidePrint ? [c.leave('printed', {runTime: 0.1})] : [];
            return new Succession([...borrow, ...gone, ...read, ...receipt, c.enter('hook', {}, {runTime: 0.1}), c.rest({runTime: 0.1})]);
          }},
        });
        this.add(picture, other);
        await this.step('borrow');
        await this.play(machine.send('borrow'));
      }
    }
    const audit = new MachineMotionCheck();
    const scene = new Borrow(audit);
    await audit.during(scene, () => scene.run());
    const hook = scene.find('hook');
    assert.ok(hook && hook.style.opacity > 0);
    return audit.findings;
  }
  assert.deepEqual(await checkBorrow(false), []);
  const lost = await checkBorrow(true);
  assert.equal(lost.length, 2);
  assert.match(lost[0]!, /during "read-copy", subject "printed" must be present/);
  assert.match(lost[1]!, /during "receipt", subject "printed" must be present/);
});

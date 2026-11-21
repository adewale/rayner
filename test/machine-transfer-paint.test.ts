import assert from 'node:assert/strict';
import test from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { Circle, Group, Rectangle, Scene, Succession, keyed, toSvgString } from '../src/index.ts';
import { Machine, view } from '../explain/index.ts';
import { carry, pass } from '../explain/drawing.ts';
import { MachineMotionCheck } from '../tools/lib/explain-motion-rules.ts';

/** Count resting green ink at the two ends and a magenta traveller between them in the real picture. */
function transferInk(scene: Scene) {
  const { pixels, width } = new Resvg(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}}).render();
  let source = 0, destination = 0, traveller = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const x = i / 4 % width, r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
    if (r < 70 && g > 140 && b < 130) {
      if (x < width * 0.4) source++;
      if (x > width * 0.6) destination++;
    }
    if (x > width * 0.46 && x < width * 0.54 && r > 165 && g < 85 && b > 110) traveller++;
  }
  return { source, destination, traveller };
}

async function transfer(retainSource: boolean) {
  const audit = new MachineMotionCheck();
  const frames: ReturnType<typeof transferInk>[] = [];
  let before: ReturnType<typeof transferInk> | undefined;
  class Parcel extends Scene {
    override state = {received: false};
    override async construct() {
      const shelf = view(this, ({received}) => new Group(keyed(
        new Rectangle({width: 0.55, height: 0.4, stroke: 'none', fill: '#00b044'}).moveTo([received ? 3 : -3, 0]),
        received ? 'delivered' : 'on hook',
      )), {place: false});
      const machine = new Machine(this, {
        events: ['send'] as const, start: this.state, views: [shelf], runTime: 1.6,
        next: ({received}) => received ? undefined : {received: true},
        motion: () => [{view: shelf, during: 'parcel', absent: ['on hook', 'delivered']}],
        transition: {send: t => {
          const c = t.choreograph(shelf);
          const times = {appear: 0.15, move: 0.8, leave: 0.15};
          const token = new Circle({radius: 0.22, fill: '#d622a8', stroke: 'none'});
          const moving = retainSource ? pass(c, 'parcel', token, [[-3, 0], [3, 0]], times)
            : carry(c, 'parcel', 'on hook', [], {...times, token, to: 'delivered'});
          return new Succession([...moving, c.rest({runTime: 0.2})]);
        }},
      });
      this.add(shelf);
      await this.step('deliver');
      await this.wait(0.15);
      before = transferInk(this);
      await this.play(machine.send('send'));
    }
  }
  const scene = new Parcel({frame(s) { frames.push(transferInk(s)); return audit.frame(s); }});
  await audit.during(scene, () => scene.run());
  assert.ok(before);
  return {before, inFlight: frames.filter(p => p.traveller > 20), after: transferInk(scene), findings: audit.findings};
}

test('carrying an initially visible parcel clears its source and reports a copy left there during the visible trip', async () => {
  const good = await transfer(false), damaged = await transfer(true);
  for (const run of [good, damaged]) {
    assert.ok(run.before.source > 100, 'the original green parcel was visible at the source');
    assert.equal(run.before.destination + run.before.traveller, 0);
    assert.ok(run.inFlight.length >= 3, 'the magenta parcel traversed the middle of the stage');
    assert.ok(run.inFlight.every(frame => frame.destination === 0), 'the destination has not received it');
    assert.ok(run.after.destination > 100, 'the green parcel visibly arrived at the destination');
    assert.equal(run.after.source + run.after.traveller, 0);
  }
  assert.ok(good.inFlight.every(frame => frame.source === 0));
  assert.ok(damaged.inFlight.every(frame => frame.source === damaged.before.source));
  assert.deepEqual(good.findings, []);
  assert.equal(damaged.findings.length, 1);
  assert.match(damaged.findings[0]!, /during "parcel", subject "on hook" must be absent/);
});

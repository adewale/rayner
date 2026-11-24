import assert from 'node:assert/strict';
import test from 'node:test';
import { Animation, AnimationGroup, Circle, Group, Rectangle, Scene, Succession, Text, keyed, renderFrame, toSvgString } from '../src/index.ts';
import { Machine, view } from '../explain/index.ts';
import { liveSteps, runLive } from '../explain/internal.ts';
import { carry, pass } from '../explain/drawing.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';
import { MachineMotionCheck } from '../tools/lib/explain-motion-rules.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';
import { loadFonts } from '../explain/testing.ts';

type Fault = 'none' | 'source retained' | 'context gone' | 'early arrival' | 'missing travel' | 'missing transition'
  | 'wrong subject' | 'clipped context' | 'invisible travel' | 'ambiguous subject' | 'repeated' | 'simultaneous';
const ring = () => new Circle({radius: 0.3, fill: '#ffeebb', stroke: 'none'});
const side = (n: number) => n % 2 ? 'wax' : 'hook';

function story(fault: Fault) {
  return class Delivery extends Scene {
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
      await this.play(machine.sendSequence(['send', 'send']));
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
    ['invisible travel', /did not paint at two distinct screen positions/],
    ['simultaneous', /more than one trip with this key is active/],
  ];
  for (const [fault, expected] of examples) {
    const {check} = await observed(fault);
    assert.ok(check.findings.some(s => expected.test(s)), `${fault}: ${check.findings.join('\n')}`);
  }
  assert.deepEqual((await observed('repeated')).check.findings, []);
});

test('a trip needs two composited paint positions and keeps its declared context throughout an offstage excursion', async () => {
  type Trial = 'flash' | 'two glints' | 'fixed aperture' | 'opaque screen' | 'clear screen' | 'offstage' | 'offstage context lost' | 'offstage receipt early';
  const square = (size: number, color: string) => new Rectangle({width: size, height: size, fill: color, stroke: 'none'});
  async function replay(trial: Trial) {
    const offstage = trial.startsWith('offstage');
    let trip: Animation;
    class Shipment extends Scene {
      override state = {sent: false};
      override async construct() {
        const world = view(this, () => new Group(
          keyed(square(0.28, '#00cc00').moveTo([-3, 2]), 'caption'),
          keyed(square(0.28, '#0000ff').moveTo([3, 2]).setOpacity(0), 'receipt'),
        ), {place: false});
        const foreground = view(this, () => new Group(new Rectangle({
          width: 6, height: 1, fill: '#444444', stroke: 'none', opacity: trial === 'opaque screen' ? 1 : 0,
        })), {place: false});
        const machine = new Machine(this, {
          events: ['ship'] as const, views: [world, foreground], start: this.state, next: () => ({sent: true}), runTime: 1.6,
          motion: () => [{view: world, during: 'parcel', present: ['caption'], absent: ['receipt']}],
          transition: {ship: t => {
            const c = t.choreograph(world);
            const token = trial === 'fixed aperture'
              ? new Rectangle({width: 10, height: 0.35, fill: '#ff0000', stroke: 'none'})
              : square(trial === 'flash' || trial === 'two glints' ? 0.06 : 0.35, '#ff0000');
            if (trial === 'flash') token.clipBox = [-0.025, -0.025, 0.025, 0.025];
            if (trial === 'two glints' || trial === 'fixed aperture') token.clipBox = [-0.075, -0.075, 0.075, 0.075];
            const beats = pass(c, 'parcel', token, offstage ? [[-2,0], [11,0], [2,0]] : [[-2,0], [2,0]], {appear: 0.1, move: 0.8, leave: 0.1});
            assert.ok(beats[1] instanceof Animation);
            trip = beats[1];
            return new Succession([...beats, c.rest({runTime: 0.1})]);
          }},
        });
        const controller = new Group();
        controller.addUpdater(() => {
          const outside = trip?.phase === 'begun' && trip.mobject.center()[0] > 8.3;
          if (trial === 'offstage context lost') world.current.find('caption')!.setOpacity(outside ? 0 : 1);
          if (trial === 'offstage receipt early') world.current.find('receipt')!.setOpacity(outside ? 1 : 0);
        });
        this.add(world, foreground, controller);
        await this.step('shipment');
        await this.play(machine.send('ship'));
      }
    }
    const check = new MachineMotionCheck(), red: (number | null)[] = [];
    let missingCaption = 0, earlyReceipt = 0;
    const scene = new Shipment({async frame(s) {
      await check.frame(s);
      if (trip?.phase !== 'begun') return;
      const {pixels} = await rasterize(toSvgString(s, {width: 800}));
      let sum = 0, count = 0, caption = false, receipt = false;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        // White paper and a gray screen have equal channels. Count even antialiased red at the aperture.
        if (r > g && g === b) { sum += i / 4 % 800; count++; }
        if (g > 140 && r < 80 && b < 80) caption = true;
        if (b > 140 && r < 80 && g < 80) receipt = true;
      }
      red.push(count ? sum / count : null);
      if (!count && !caption) missingCaption++;
      if (!count && receipt) earlyReceipt++;
    }});
    await check.during(scene, () => scene.run());
    return {findings: check.findings, drawn: red.filter(x => x !== null), hidden: red.includes(null), missingCaption, earlyReceipt};
  }
  for (const trial of ['flash', 'fixed aperture', 'opaque screen'] as const) {
    const {findings, drawn} = await replay(trial);
    assert.equal(findings.length, 1, trial);
    assert.match(findings[0]!, /did not paint at two distinct screen positions/);
    if (trial === 'flash') assert.equal(drawn.length, 1);
    if (trial === 'opaque screen') assert.equal(drawn.length, 0);
    if (trial === 'fixed aperture') {
      assert.ok(drawn.length > 2);
      assert.equal(new Set(drawn).size, 1);
    }
  }
  for (const trial of ['clear screen', 'offstage', 'two glints'] as const) {
    const {findings, drawn, hidden} = await replay(trial);
    assert.deepEqual(findings, [], trial);
    assert.ok(new Set(drawn).size > 1);
    assert.equal(hidden, trial !== 'clear screen');
    if (trial === 'two glints') assert.equal(drawn.length, 2);
  }
  const lost = await replay('offstage context lost'), early = await replay('offstage receipt early');
  assert.ok(lost.missingCaption > 0 && early.earlyReceipt > 0);
  assert.equal(lost.findings.length, 1);
  assert.match(lost.findings[0]!, /"caption" must be present/);
  assert.equal(early.findings.length, 1);
  assert.match(early.findings[0]!, /"receipt" must be absent/);
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
    class Borrow extends Scene {
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

test('reader histories with the same model retain each incoming result as the next trip context', async () => {
  function responseScene(poison: boolean) {
    return class Responses extends Scene {
      override state = {ready: true};
      override shown: {result?: {marked: boolean}} = {};
      override async construct() {
        const picture = view(this, (_st, shown) => new Group(keyed(new Rectangle({
          width: 0.6, height: 0.4, fill: shown.result?.marked ? '#ff0000' : '#00cc00', stroke: 'none',
        }).moveTo([0, 2]), 'context')), {place: false});
        const machine = new Machine(this, {
          start: this.state, events: ['mark', 'ship'] as const, views: [picture], runTime: 1.2,
          next: st => ({...st}), result: ({event}) => event === 'mark' ? {marked: true} : undefined,
          motion: ({event}) => event === 'ship' ? [{view: picture, during: 'parcel', present: ['context']}] : [],
          transition: {ship: t => {
            const c = t.choreograph(picture);
            const hide = poison && c.from('context').style.fill === '#ff0000';
            return new Succession([
              ...(hide ? [c.leave('context', {runTime: 0.1})] : []),
              ...pass(c, 'parcel', ring().setStyle({fill: '#dd00dd'}), [[-2, 0], [2, 0]], {appear: 0.1, move: 0.4, leave: 0.1}),
              c.rest({runTime: 0.1}),
            ]);
          }},
        });
        this.add(picture);
        await this.step('offer');
        machine.offer();
      }
    };
  }
  const good = responseScene(false), bad = responseScene(true);
  const [kept] = await exploreMachines(await new good({async frame() {}}).run(), good);
  const [poisoned] = await exploreMachines(await new bad({async frame() {}}).run(), bad);
  assert.equal(kept!.states, 1, 'results do not become durable model states');
  assert.deepEqual(kept!.motion.filter(m => m.includes('motion contract')), []);
  assert.ok(poisoned!.motion.some(m => /after mark, ship: motion contract.+"context" must be present/.test(m)), poisoned!.motion.join('\n'));
  // Independently observe the actual reader log: the red prerequisite is present after mark,
  // and the poison removes it while the magenta parcel traverses the centre of the stage.
  for (const [Source, damaged] of [[good, false], [bad, true]] as const) {
    const scene = await new Source({async frame() {}}).run(), place = liveSteps(scene).get('offer')!;
    const marked = await runLive(Source, 'offer', place, ['mark']);
    const rgb = async (s: Scene) => {
      const {pixels, width} = await rasterize(toSvgString(s, {width: 800}));
      let red = 0, transit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const x = i / 4 % width, r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        if (r > 170 && g < 50 && b < 50) red++;
        if (x > 375 && x < 425 && r > 150 && g < 50 && b > 150) transit++;
      }
      return {red, transit};
    };
    assert.ok((await rgb(marked.scene)).red > 100);
    const middle: {red: number; transit: number}[] = [];
    await runLive(Source, 'offer', place, ['mark', 'ship'], {animate: {async frame(s) {
      const ink = await rgb(s);
      if (ink.transit > 20) middle.push(ink);
    }}});
    assert.ok(middle.length >= 2);
    assert.equal(middle.every(ink => ink.red === 0), damaged);
    assert.equal(middle.every(ink => ink.red > 100), !damaged);
  }
});

test('required context contributes composited ink through changing foreground views while absent sources remain retired', async () => {
  type Trial = 'clear' | 'opaque' | 'same-color' | 'late-view' | 'delayed-cover' | 'unrelated-change'
    | 'ancestor-clip' | 'descendant-clip' | 'edge-strip' | 'hidden-source';
  const trials: Trial[] = ['clear', 'opaque', 'same-color', 'late-view', 'delayed-cover', 'unrelated-change',
    'ancestor-clip', 'descendant-clip', 'edge-strip', 'hidden-source'];
  for (const trial of trials) {
    class Context extends Scene {
      override state = {n: 0};
      override async construct() {
        const picture = view(this, () => {
          const mark = new Rectangle({width: 1, height: 0.5, fill: trial === 'unrelated-change' ? '#fff' : '#f00', stroke: 'none'}).moveTo([0, 2]);
          if (trial === 'descendant-clip') mark.clipBox = [-0.1, -0.1, 0.1, 0.1];
          const context = keyed(new Group(mark), 'context');
          if (trial === 'ancestor-clip') context.clipBox = [-0.1, -0.1, 0.1, 0.1];
          if (trial === 'edge-strip') context.clipBox = [0, 2, 0.01, 2.2];
          const covered = ['opaque', 'same-color', 'hidden-source'].includes(trial);
          const cover = keyed(new Rectangle({width: 1.2, height: 0.7,
            fill: trial === 'same-color' ? '#f00' : '#000', stroke: 'none', opacity: covered ? 1 : 0}).moveTo([0, 2]), 'cover');
          return new Group(context, cover);
        }, {place: false});
        const machine = new Machine(this, {start: this.state, events: ['ship'], views: [picture], runTime: 1,
          next: ({n}) => ({n: n + 1}),
          motion: () => [{view: picture, during: 'parcel', [trial === 'hidden-source' ? 'absent' : 'present']: ['context']}],
          transition: {ship: t => {
            const c = t.choreograph(picture);
            return new Succession([...pass(c, 'parcel', new Rectangle({width: 0.3, height: 0.3, fill: '#0f0', stroke: 'none'}),
              [[-2, 0], [2, 0]], {appear: 0.1, move: 0.5, leave: 0.1}), c.rest({runTime: 0.1})]);
          }},
        });
        this.add(picture);
        if (trial === 'late-view') this.add(view(this, () => new Group(new Rectangle({width: 1.2, height: 0.7, fill: '#000', stroke: 'none'}).moveTo([0, 2])), {place: false}));
        this.add(keyed(new Rectangle({width: 0.3, height: 0.3, fill: '#00f', stroke: 'none'}).moveTo([4, 2]), 'unrelated'));
        await this.play(machine.send('ship'));
      }
    }
    const check = new MachineMotionCheck();
    const witnesses: {actual: string; removed: string}[] = [];
    let frames = 0;
    const scene = new Context({async frame(s) {
      frames++;
      if (trial === 'delayed-cover' && s.time >= 0.3) s.find('cover')?.setOpacity(1);
      if (trial === 'unrelated-change') s.find('unrelated')?.setFill(frames % 2 ? '#00f' : '#000');
      await check.frame(s);
      if (s.time < 0.2 || s.time > 0.5 || !s.find('parcel')) return;
      const subject = s.find('context')!, actual = toSvgString(s, {width: 800});
      subject.setOpacity(0);
      const removed = toSvgString(s, {width: 800});
      subject.setOpacity(1);
      witnesses.push({actual, removed});
    }});
    await check.during(scene, () => scene.run());
    const visible = trial === 'clear' || trial === 'edge-strip';
    if (visible) assert.deepEqual(check.findings, [], trial);
    else {
      assert.equal(check.findings.length, 1, `${trial}: one exact context issue`);
      assert.match(check.findings[0]!, trial === 'hidden-source' ? /subject "context" must be absent/ : /subject "context" must be present/, trial);
    }
    assert.ok(witnesses.length >= 2, `${trial}: independent native samples during the moving interval`);
    const samples = [witnesses[0]!, witnesses.at(-1)!];
    const green: number[] = [];
    const contributes: boolean[] = [];
    for (const sample of samples) {
      const [actual, removed] = await Promise.all([rasterize(sample.actual), rasterize(sample.removed)]);
      const a = actual.pixels, b = removed.pixels;
      contributes.push(a.some((value, i) => i % 4 !== 3 && value !== b[i]));
      let x = 0, n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] === 0 && a[i + 1] === 255 && a[i + 2] === 0) { x += (i / 4) % 800; n++; }
      assert.ok(n > 0, `${trial}: the independently moving traveller really paints`);
      green.push(x / n);
    }
    assert.notEqual(green[0], green[1], `${trial}: two composited traveller positions`);
    assert.deepEqual(contributes, trial === 'delayed-cover' ? [true, false] : [visible, visible], `${trial}: native subject knockout`);
  }
});

test('a required keyed glyph keeps its own composited identity across text runs and camera crops', async () => {
  await loadFonts();
  for (const trial of ['uniform', 'split-visible', 'split-covered', 'zoomed', 'letterboxed', 'letterbox-black'] as const) {
    class GlyphContext extends Scene {
      override state = {n: 0};
      override async construct() {
        if (trial === 'zoomed') this.frame.scale(0.7).shift([0.0173, 0.0281]);
        if (trial === 'letterboxed') this.frame.setWidth(12, true).shift([0.0173, 0.0281]);
        if (trial === 'letterbox-black') this.frame.setWidth(10, true);
        const picture = view(this, () => {
          const text = new Text('ABC', {fontSize: 1, color: trial === 'letterbox-black' ? '#000' : '#f00'}).moveTo(trial === 'letterbox-black' ? [6, 0] : [0, 2]);
          // A merged Text record may own several glyphs. The first glyph alone is
          // this contract's subject; the other letters cannot provide its ink.
          const glyph = keyed(text.children[0]!, 'context');
          if (trial.startsWith('split')) text.children[2]!.setFill('#00f');
          const parts: (Text | Rectangle)[] = [text];
          if (trial === 'split-covered') {
            const b = glyph.box()!;
            parts.push(new Rectangle({width: b[2] - b[0] + 0.04, height: b[3] - b[1] + 0.04, fill: '#000', stroke: 'none'})
              .moveTo([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]));
          }
          return new Group(...parts);
        }, {place: false});
        const machine = new Machine(this, {start: this.state, events: ['ship'], views: [picture], runTime: 1,
          next: ({n}) => ({n: n + 1}), motion: () => [{view: picture, during: 'parcel', present: ['context']}],
          transition: {ship: t => {
            const c = t.choreograph(picture);
            return new Succession([...pass(c, 'parcel', ring(), [[-2, 0], [2, 0]], {appear: 0.1, move: 0.5, leave: 0.1}), c.rest({runTime: 0.1})]);
          }},
        });
        this.add(picture);
        await this.play(machine.send('ship'));
      }
    }
    const check = new MachineMotionCheck();
    let witness: {actual: string; omitted: string} | undefined;
    const scene = new GlyphContext({async frame(s) {
      await check.frame(s);
      if (witness || s.time < 0.2 || !s.find('parcel')) return;
      const glyph = s.find('context')!, actual = toSvgString(s, {width: 800});
      glyph.setOpacity(0); const omitted = toSvgString(s, {width: 800}); glyph.setOpacity(1);
      witness = {actual, omitted};
    }});
    await check.during(scene, () => scene.run());
    assert.ok(witness, `${trial}: an independent full-stage native witness`);
    const [drawn, removed] = await Promise.all([rasterize(witness.actual), rasterize(witness.omitted)]);
    const a = drawn.pixels, b = removed.pixels;
    const paints = a.some((value, i) => value !== b[i]);
    assert.equal(paints, trial !== 'split-covered', trial);
    if (paints) assert.deepEqual(check.findings, [], trial);
    else {
      assert.equal(check.findings.length, 1);
      assert.match(check.findings[0]!, /subject "context" must be present/);
    }
  }
});

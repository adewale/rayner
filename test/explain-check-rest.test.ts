// `rayner check` reaches each step's resting picture one way, as the step ends, the way describe
// and the shots do; the last-frame check holds that picture to the step's last played frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle, Group, FadeIn, Transform } from '../src/index.ts';
import { toSvgString } from '../src/svg.ts';
import { stage, withoutHeading } from '../explain/stage.ts';
import { FanSink, FrameCaptureSink, LastFrameSink, LegibilitySink, LookWordsSink, RestingSink } from '../tools/lib/explain-check.ts';
import { restingPictures } from '../tools/lib/explain-shots.ts';
import { traceScene } from '../explain/testing.ts';

test('paper collisions use glyph ink, accept a contained label, and reject an edge crossing', async () => {
  const {loadFonts} = await import('../explain/testing.ts');
  await loadFonts();
  const findings = async (x: number) => {
    class Paper extends Scene {
      override async construct() {
        await this.step('paper');
        this.add(new Rectangle({width: 3, height: 2, fill: '#fff'}).moveTo([2,0]), new Text('status', {fontSize: 0.6}).moveTo([x,0]));
      }
    }
    const sink = new RestingSink();
    await new Paper(sink).run();
    return sink.collisions;
  };
  assert.ok((await findings(0.5)).some(p => p.includes('crosses the edge')));
  assert.deepEqual(await findings(2), []);
});

test('a framed cell permits its label across coloured fill segments but still rejects its outside edge', async () => {
  const findings=async(x:number)=>{
    class Stripes extends Scene {override async construct(){await this.step('cell');this.add(new Group(
      new Rectangle({width:1,height:1,fill:'#fff',stroke:'none'}).moveTo([-.5,0]),
      new Rectangle({width:1,height:1,fill:'#eee',stroke:'none'}).moveTo([.5,0]),
      new Rectangle({width:2,height:1,fill:'none'}),new Text('value',{fontSize:.5}).moveTo([x,0])));}}
    const sink=new RestingSink();await new Stripes(sink).run();return sink.collisions;
  };
  assert.deepEqual(await findings(0),[]);
  assert.ok((await findings(.95)).some(p=>p.includes('crosses the edge')));
});

test('legibility measures flat-rendered glyph paint and ignores a wholly invisible proxy label', async()=>{
  const sink=new LegibilitySink(new Map(),1);
  class Painted extends Scene{override async construct(){
    await this.step('paint');
    const visible=new Text('painted',{fontSize:.6});
    visible.style.opacity=0; // Containers emit no SVG paint; the glyphs still do.
    this.add(visible,new Text('ghost',{fontSize:.01}).setOpacity(0));await this.wait(.1);
  }}
  await new Painted(sink).run();
  assert.deepEqual([...sink.labels.values()].map(r=>r.text),['painted']);
  assert.ok([...sink.labels.values()][0]!.px>=47);
});

test('legibility measures complete matched words without inventing labels for partial morph shells', async () => {
  const sink = new LegibilitySink(new Map(), 1);
  class Shorten extends Scene {
    override async construct() {
      await this.step('shorten');
      const long = new Text('0.3000000000000000444089…', {fontSize:.6, font:'mono'});
      this.add(long);
      await this.wait(.1);
      const copy = long.copy();this.add(copy);
      await this.play(new Transform(copy, new Text('0.3', {fontSize:.6, font:'mono', weight:'bold'}).shift([0,-1]), {match:'text',runTime:1.2}));
    }
  }
  await new Shorten(sink).run();
  assert.ok(sink.labels.size >= 2, 'the source and landed words are both measured');
  assert.ok([...sink.labels.values()].every(r => r.px >= 14), JSON.stringify([...sink.labels.values()]));

  const faint = new LegibilitySink(new Map(), 1);
  class Faint extends Scene {
    override async construct() {
      await this.step('faint');this.add(new Text('required but faint', {fontSize:.6}).setOpacity(.5));await this.wait(.1);
    }
  }
  await new Faint(faint).run();
  assert.equal([...faint.labels.values()].find(r => r.text === 'required but faint')?.px, 0, 'an unreadable resting label still rejects');
});

class Two extends Scene {
  override state: { after?: boolean } = {};
  override async construct() {
    const s = stage(this);
    await this.step('one', { caption: 'A box.' });
    const box = new Rectangle({ width: 1, height: 1 });
    await s.enter(box, { describe: 'a box' });
    await this.step('two', { caption: 'A word beside it.' });
    await this.play(new FadeIn(new Text('word', { fontSize: 0.4 }).moveTo([2, 0])), box.animate.shift([-1, 0]));
    // Code after the step's last play, before the next step: it changes the state, not the picture.
    this.state.after = true;
    await this.step('three', { caption: 'Smaller.' });
    await this.play(box.animate.scale(0.5));
  }
}

test('check reads each step\'s resting picture as the step ends: the picture the contact sheet draws, and the step\'s last played frame', async () => {
  const trace = await traceScene(Two);
  const capture = new FrameCaptureSink(new Set(trace.steps.map((s) => s.frame1)));
  const lastFrame = new LastFrameSink(capture.frames), resting = new RestingSink(), looks = new LookWordsSink();
  const legibility = new LegibilitySink(new Map(trace.steps.map((s) => [s.step, { k: 1, views: [] }])), 1);
  await new Two(new FanSink([capture, lastFrame, resting, legibility, looks])).run();
  assert.deepEqual(lastFrame.differing, [], 'every step lands on its last played frame');
  const shots = await restingPictures(Two, (scene) => withoutHeading(scene, () => toSvgString(scene)));
  assert.deepEqual([...resting.resting.keys()], trace.steps.map((s) => s.step), 'one resting picture per step, by name');
  assert.deepEqual([...resting.resting], [...shots], 'the shots\' picture of every step');
  // The phone's close-ups are measured at each step's end, named by the step.
  assert.ok([...legibility.labels.values()].some((l) => l.text === 'word' && l.phoneStep === 'two'));
});

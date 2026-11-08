// `rayner check` reaches each step's resting picture one way, as the step ends, the way describe
// and the shots do; the landing check holds that picture to the step's last played frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle, FadeIn } from '../src/index.ts';
import { toSvgString } from '../src/output.ts';
import { stage, isHeading } from '../explain/stage.ts';
import { FanSink, FrameCaptureSink, LandingSink, LegibilitySink, LookWordsSink, RestingSink } from '../tools/lib/explain-check.ts';
import { restingPictures } from '../tools/lib/explain-shots.ts';
import { traceScene } from '../explain/testing.ts';

class Two extends Scene {
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

test('check reads each step\'s resting picture as the step ends: the picture the shots draw, and the step\'s last played frame', async () => {
  const trace = await traceScene(Two);
  const capture = new FrameCaptureSink(new Set(trace.steps.map((s) => s.frame1!)));
  const landing = new LandingSink(capture.frames), resting = new RestingSink(), looks = new LookWordsSink();
  const legibility = new LegibilitySink(new Map(trace.steps.map((s) => [s.step, { k: 1, views: [] }])), 1);
  await new Two(new FanSink([capture, landing, resting, legibility, looks])).run();
  assert.deepEqual(landing.landed, [], 'every step lands on its last played frame');
  const shots = await restingPictures(Two, (scene) => {
    const all = scene.mobjects;
    scene.mobjects = all.filter((m) => !isHeading(m));
    const svg = toSvgString(scene);
    scene.mobjects = all;
    return svg;
  });
  assert.deepEqual([...resting.resting.keys()], trace.steps.map((s) => s.step), 'one resting picture per step, by name');
  assert.deepEqual([...resting.resting], [...shots], 'the shots\' picture of every step');
  // The phone's close-ups are measured at each step's end, named by the step.
  assert.ok([...legibility.labels.values()].some((l) => l.text === 'word' && l.phoneStep === 'two'));
});

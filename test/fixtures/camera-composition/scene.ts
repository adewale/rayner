import { Scene, Text, Rectangle } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';

/** An explicit author-camera move, independent of any catalog scene's layout. */
export default class CameraComposition extends Scene {
  static meta = { id: 'camera-composition', title: 'Author camera and reader zoom' };

  override async construct() {
    const s = stage(this, { heading: false });
    await this.step('focus', { title: 'Inspect the detail', caption: 'The author frames a detail inside the stage.' });
    await s.enter(
      new Rectangle({ width: 6, height: 3, stroke: s.look.ink }),
      new Text('Detail inside the author frame', { fontSize: 0.2, color: s.look.ink }).moveTo([0, 0.8]),
    );
    await s.focus([-4, -2.25, 4, 2.25], { exact: true });
    await this.step('home', { title: 'Return to the stage', caption: 'Clearing glides the author camera home.' });
    await s.clear();
    await s.enter(new Text('Whole stage', { fontSize: 0.6, color: s.look.ink }));
  }
}

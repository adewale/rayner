import { Scene, Text } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
export default class Comparison extends Scene {
  static meta = { id: 'reading-comparison', title: 'Compare two values, then inspect the implementation' };
  override async construct() {
    const s = stage(this, { heading: false });
    await this.step('compare', {
      title: 'Before and after',
      caption: 'Both values belong together. The implementation note has its own detail view.',
    });
    const before = new Text('Before: 1', { fontSize: 0.7 }).moveTo([-2, 1]);
    const after = new Text('After: 2', { fontSize: 0.7 }).moveTo([2, -1]);
    const detail = new Text('Implementation details', { fontSize: 0.22 }).moveTo([4, -3]);
    await s.enter(before, after, detail);
    s.reading(before, after);
  }
}

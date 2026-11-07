import { Scene } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { journey, source } from '../../../scenes/explainers/gnome-files/model.ts';

/**
 * P3's middle four tasks, all scored 5: a journey whose curve is flat. The gnome-files explainer now
 * shows only each participant's first four tasks, none of them flat, so this fixture pins the flat case
 * that test/explain-gnome-files.test.ts describes.
 */
export const FLAT = source(journey('P3', 1));

export default class JourneyFlat extends Scene {
  static meta = { id: 'journey-flat', title: 'A flat journey' };
  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.54 });
    await this.step('flat', { title: 'One score throughout', caption: 'P3 scored 5 on all four tasks.' });
    await s.show({ source: FLAT }, { box: 'full' });
  }
}

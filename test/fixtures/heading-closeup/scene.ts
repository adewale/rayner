import { Scene, Text, Rectangle } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Mobject } from '../../../src/index.ts';

/**
 * A drawing that fills the stage with labels larger than the stage heading's line. The
 * phone close-ups keep below the heading, so the heading's legibility must not depend on
 * how far they zoom. With `reach: 'into'` a frame is drawn up into the heading, so the
 * close-ups do show it, and there it must still be measured.
 */
export default class HeadingCloseUp extends Scene {
  static meta = { id: 'heading-closeup', title: 'A large drawing under a heading line' };
  static settings = [
    {
      id: 'reach',
      label: 'Drawing',
      default: 'below',
      options: [
        { value: 'below', label: 'Below the heading' },
        { value: 'into', label: 'Reaching into the heading' },
      ],
    },
  ];
  override async construct() {
    const s = stage(this);
    await this.step('fill', {
      title: 'Six boxes fill the stage',
      line: 'Each box is labelled larger than this line.',
      caption: 'The boxes use the whole stage below the heading.',
    });
    const parts: Mobject[] = [];
    for (const [i, x] of [-5, 0, 5].entries())
      for (const [j, y] of [1.4, -2].entries()) {
        parts.push(new Rectangle({ width: 4, height: 1.6, stroke: s.soft, strokeWidth: 0.03, fill: 'none' }).moveTo([x, y]));
        parts.push(new Text(`box ${i * 2 + j + 1}`, { fontSize: 0.42 }).moveTo([x, y]));
      }
    if (settingsOf(this).reach === 'into')
      parts.push(new Rectangle({ width: 15.2, height: 8.6, stroke: s.soft, strokeWidth: 0.03, fill: 'none' }).moveTo([0, 0.05]));
    await s.enter(...parts, { describe: 'Six labelled boxes' });
  }
}

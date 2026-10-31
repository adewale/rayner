import { Scene, Text, Rectangle } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
export default class References extends Scene {
  static meta = { id: 'references', title: 'Reference navigation' };
  static settings = [
    {
      id: 'case',
      label: 'Case',
      default: 'one',
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
        { value: 'all', label: 'All notes' },
      ],
    },
  ];
  override async construct() {
    const s = stage(this);
    for (const [id, detail] of [
      ['alpha', false],
      ['note', true],
      ['omega', false],
      ['source', true],
    ] as const) {
      await this.step(id, {
        title: id,
        caption: `${id} in ${settingsOf(this).case}`,
        detail: settingsOf(this).case === 'all' || detail,
      });
      await s.clear();
      if (detail) await s.enter(new Rectangle({ width: 4, height: 2, fill: '#ff0044', stroke: 'none' }));
      await s.enter(new Text(id, { fontSize: 1, color: s.palette.ink }));
    }
  }
}

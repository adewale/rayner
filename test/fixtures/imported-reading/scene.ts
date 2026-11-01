import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { Diagram, labelOf } from '../../../explain/diagrams.ts';
import snapshot from '../../../scenes/explainers/font-metrics/scene.snapshots/4ee0d75a90dc9b78.json' with { type: 'json' };
import type { DiagramSnapshot } from '../../../explain/index.ts';

export default class ImportedReading extends Scene {
  static meta = { id: 'imported-reading', title: 'Read the imported label' };
  static settings = [{ id: 'width', label: 'Label width', default: 'normal', options: [
    { value: 'normal', label: 'Normal' }, { value: 'thin', label: 'Compressed' },
  ] }];
  override async construct() {
    const s = stage(this);
    await this.step('opening', { caption: 'Read Paper.' });
    const captured = snapshot as DiagramSnapshot;
    const d = new Diagram(this, captured.spec, captured);
    const label = d.get('B').family().find((m) => labelOf(m)?.text === 'Paper')!;
    label.parent!.remove(label);
    label.scale(0.8 / (label.height() * labelOf(label)!.emRatio));
    if (settingsOf(this).width === 'thin') label.stretch(0.01, 0);
    label.moveTo([0, 0]);
    label.key = 'paper';
    s.reading(label);
    this.add(label);
  }
}

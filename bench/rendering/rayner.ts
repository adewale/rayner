// The Rayner arm: only rendering and stepping live here; subjects and words are shared.
import { Scene, Group, Rectangle, Text, keyed } from '../../src/index.ts';
import { stage, settingsOf } from '../../explain/index.ts';
import { PACKETS, cells, summary } from './shared.ts';
import type { Model } from './shared.ts';
const copy = (state: Model): Model => JSON.parse(JSON.stringify(state)) as Model;

export function sceneFor(topic: number) {
  const packet = PACKETS[topic]!;
  return class Comparison extends Scene {
    static settings = [{ id: 'case', label: 'Case', default: packet.cases[0]!.id, options: packet.cases.map((c) => ({ value: c.id, label: c.label })) }];
    override state: { model: Model } = { model: copy(packet.cases[0]!.steps[0]!.state) };
    override async construct() {
      const selected = packet.cases.find((c) => c.id === settingsOf(this).case)!;
      const s = stage(this, { heading: false, palette: { paper: '#ffffff', ink: '#172033', accent: '#2563eb', muted: '#64748b' } });
      await s.steps(selected.steps.map((step) => ({ ...step, state: { model: step.state }, draw: ({ model: state }: { model: Model }) => {
        const tiles = cells(state), start = -(tiles.length - 1) * 1.1;
        return new Group(
          keyed(new Text(step.title, { fontSize: 0.65, color: s.look.ink }).shift([0, 3.4]), 'title'),
          keyed(new Text(summary(state), { fontSize: 0.62, color: s.look.ink }).shift([0, 2.4]), 'summary'),
          ...tiles.flatMap((tile, i) => [
            keyed(new Rectangle({ width: 2, height: 1.4, fill: tile.active ? '#dbeafe' : '#ffffff', stroke: '#334155', strokeWidth: 0.035 }).shift([start + i * 2.2, 0]), `box:${i}`),
            keyed(new Text(tile.label, { fontSize: 0.65, color: s.look.ink }).shift([start + i * 2.2, 0]), `value:${i}`),
            keyed(new Text(String(i), { fontSize: 0.6, color: s.look.ink }).shift([start + i * 2.2, -1.3]), `index:${i}`),
          ]),
        );
      }, describe: ({ model: state }: { model: Model }) => `${summary(state)}. Slots: ${cells(state).map((c) => c.label).join(', ')}.` })));
    }
  };
}

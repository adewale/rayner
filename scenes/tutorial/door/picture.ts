import { Group, Rectangle, Text, keyed } from '../../../src/index.ts';
import type { DoorState } from './model.ts';

/** The stage's colours a door is drawn in. */
export type Ink = { ink: string; paper: string; soft: string; emphasis: string };

/** The door as the state says: its frame, its panel (shut, or swung open at the hinge), the bolt when locked, and the word. */
export function drawDoor(st: DoorState, { ink, paper, soft, emphasis }: Ink): Group {
  const shut = st.door !== 'open';
  const frame = new Rectangle({ width: 2.6, height: 4, stroke: ink, strokeWidth: 0.06, fill: paper }).moveTo([0, 0.1]);
  const panel = new Rectangle({ width: shut ? 2.3 : 0.5, height: shut ? 3.7 : 3.9, stroke: ink, strokeWidth: 0.04, fill: soft, fillOpacity: 0.35 })
    .moveTo([shut ? 0 : -1.1, 0.1]);
  const word = new Text(st.door, { fontSize: 0.6, color: st.door === 'locked' ? emphasis : ink }).moveTo([0, -2.55]);
  const parts: [string, Rectangle | Text][] = [['door:frame', frame], ['door:panel', panel], ['door:word', word]];
  if (st.door === 'locked') parts.push(['door:bolt', new Rectangle({ width: 0.7, height: 0.32, stroke: 'none', fill: emphasis }).moveTo([0.95, 0.1])]);
  return new Group(...parts.map(([key, part]) => keyed(part, key)));
}

import { VMobject, Group, Text, Scene, FadeIn, Transform, TEAL } from 'rayner';
import type { Style } from 'rayner';

/** Use VMobject's public path builder; copies own their point buffers. */
export class Diamond extends VMobject {
  constructor(style: Style = {}) {
    super(style);
    this.setPolygon([[0, 1], [1, 0], [0, -1], [-1, 0]]);
  }
}

/** Prefer children/getters to duplicated references to mutable child objects. */
export class StatusBadge extends Group {
  constructor(label: string) {
    const shape = new Diamond({ stroke: TEAL, fill: TEAL, fillOpacity: 0.12 });
    const text = new Text(label, { fontSize: 0.25 }).moveTo([0, -1.4]);
    super(shape, text);
  }
  get shape(): Diamond { return this.children[0] as Diamond; }
  get label(): Text { return this.children[1] as Text; }
  // No copyData override is needed: the only state is the inherited children.
}

/** An ordinary function is already a useful extension unit. */
export function statusRow(labels: readonly string[]): Group {
  return new Group(...labels.map(label => new StatusBadge(label))).arrange([1, 0], 1);
}

export default class ExtensionScene extends Scene {
  override async construct() {
    const row = statusRow(['queued', 'running', 'done']);
    await this.step('badges', { caption: 'A custom path and a composite participate in the ordinary animation API.' });
    await this.play(new FadeIn(row), { runTime: 0.4 });
    const middle = row.children[1] as StatusBadge;
    await this.step('rename', { caption: 'Change one label while keeping the same badge and diamond.' });
    const next = middle.label.copy().setText('working');
    await this.play(new Transform(middle.label, next), { runTime: 0.5 });
    this.state = { labels: row.children.map(m => (m as StatusBadge).label.text) };
    await this.step('result');
    await this.wait(0.2);
  }
}


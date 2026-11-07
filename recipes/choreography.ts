import { Scene, Rectangle, Dot, Line, GrowFromEdge, PulseAlongPath, Succession } from 'rayner';
import { SetState, view, stage } from 'rayner/explain';
import { card } from 'rayner/drawing';

export default class ChoreographyScene extends Scene<{count: number}, {}> {
  override state = { count: 0 };

  override async construct() {
    const bar = new Rectangle({ width: 2, height: 3, fill: '#58c4dd', fillOpacity: 0.3 }).moveTo([-3, 0]);
    const route = new Line([0, 0], [4, 0]);
    const token = new Dot().moveTo([0, 0]);
    const s = stage(this, { style: 'github-dark', heading: false });
    const readout = view(this, (st) => card(s, [['count', st.count]], { at: [1.6, -2], panel: false, key: 'readout' }), { place: false });
    this.add(route, readout);
    await this.step('grow-and-travel');
    await this.play(new GrowFromEdge(bar, [0, -1]), new PulseAlongPath(token, route), { runTime: 1 });

    await this.step('model-samples');
    await this.play(new Succession([
      new SetState(this, { count: 3 }), readout.sync({ runTime: 0.4 }),
      new SetState(this, { count: 9 }), readout.sync({ runTime: 0.4 }),
    ]));
    await this.step('result', { caption: 'The bar grew from its baseline, the token passed along the route, and each readout followed its own state update.' });
    await this.wait(0.2);
  }
}

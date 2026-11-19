// Two independently mounted views share one physical sample, through the public atomic operation.
import { Scene, Dot, Line, Circle, keyed, linear } from 'rayner';
import { view, tweenState } from 'rayner/explain';

export default class SharedOrbit extends Scene<{ angle: number }, {}> {
  override state = { angle: 0 };
  override async construct() {
    const point = view(this, st => new Dot({ radius: 0.16 }).moveTo([3 * Math.cos(st.angle), 3 * Math.sin(st.angle)]), { place: false });
    const radius = view(this, st => new Line([0, 0], [3 * Math.cos(st.angle), 3 * Math.sin(st.angle)]), { place: false });
    keyed(point, 'orbit:point'); keyed(radius, 'orbit:radius');
    this.add(new Circle({ radius: 3 }), radius, point);
    await this.step('start');
    await tweenState(this, t => ({ angle: Math.PI * t }), { views: [radius, point], runTime: 1, rateFunc: linear });
    await this.step('end');
  }
}

// A supported recipe using the Animation extension point by hand. A view's `tween` does the same
// through the scene's state, redrawing the view at every frame (docs/VIEWS.md); this shows what it wraps.
import { Scene, Group, Circle, Dot, Line, DecimalNumber, Animation, linear } from 'rayner';
import type { Vec, AnimOpts } from 'rayner';

/** One immutable model sample, shared by every dependent drawing. */
export function orbit(angle: number): Readonly<{ angle: number; position: Readonly<Vec> }> {
  if (!Number.isFinite(angle) || angle < 0 || angle > Math.PI) throw new RangeError('angle must be finite and in [0, pi]');
  return Object.freeze({ angle, position: Object.freeze([3 * Math.cos(angle), 3 * Math.sin(angle)] as Vec) });
}

export function makeOrbit() {
  const circle = new Circle({ radius: 3 });
  const dot = new Dot({ radius: 0.1 }).moveTo([3, 0]);
  const radius = new Line([0, 0], [3, 0]);
  const readout = new DecimalNumber(0, { decimals: 2 }).moveTo([0, -3.6]);
  return { root: new Group(circle, radius, dot, readout), dot, radius, readout, angle: 0 };
}
export type OrbitDrawing = ReturnType<typeof makeOrbit>;

/**
 * One animation owns all dependent objects, so Scene.play's overlap check sees
 * them. Absolute updates keep object identity and do not integrate over dt.
 */
export class FollowAngle extends Animation {
  rig: OrbitDrawing;
  target: number;
  from = 0;
  publish: (sample: ReturnType<typeof orbit>) => void;
  constructor(rig: OrbitDrawing, target: number, publish: (sample: ReturnType<typeof orbit>) => void = () => {}, opts: AnimOpts = {}) {
    orbit(target); // validate without changing the drawing
    super(rig.root, opts);
    this.rig = rig; this.target = target; this.publish = publish;
  }
  override begin(): void {
    // Capture when this play begins, including when nested in Succession.
    this.from = this.rig.angle;
    super.begin();
  }
  override interpolate(alpha: number): void {
    const angle = alpha === 0 ? this.from : alpha === 1 ? this.target : this.from + (this.target - this.from) * alpha;
    const sample = orbit(angle);
    this.rig.angle = sample.angle;
    this.rig.dot.moveTo(sample.position);
    this.rig.radius.putStartAndEndOn([0, 0], sample.position);
    this.rig.readout.setValue(sample.angle);
    this.publish(sample);
  }
}

export default class ContinuousScene extends Scene<{ angle: number; x: number; y: number }, {}> {
  override state = { angle: 0, x: 3, y: 0 };
  override async construct() {
    const rig = makeOrbit();
    this.add(rig.root);
    // No caption hold before the next step: [0, 1] is exactly the sweep interval.
    await this.step('sweep');
    await this.play(new FollowAngle(rig, Math.PI, sample => {
      this.state = { angle: sample.angle, x: sample.position[0], y: sample.position[1] };
    }), { runTime: 1, rateFunc: linear });
    await this.step('result', { caption: 'The point stays on the circle while the radius and number follow the same angle.' });
    await this.wait(0.2);
  }
}

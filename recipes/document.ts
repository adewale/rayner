// The native-scene equivalent of Lantern's nodes/code/state/steps document.
// Imports are public package imports, so this also runs from an installed archive.
import { Scene, Rectangle, Labeled, Text, Code, Arrow, FadeIn, Create, Indicate, Transform, StateReadout, view, jsonObject } from 'rayner';

export interface RequestInput { cached: boolean }
export function route(input: RequestInput): 'cache' | 'database' {
  return input.cached ? 'cache' : 'database';
}

/** Bind ordinary data to a SceneClass; renderAt/traceScene need no special format. */
export function requestScene(input: RequestInput) {
  // Validate and copy the input under the trace's JSON rules, so later mutation by the caller cannot
  // change a replay and a function or NaN is refused here, with its path, rather than in the trace.
  const copy = jsonObject(input, 'input');
  if (typeof copy.cached !== 'boolean') throw new TypeError('cached must be a boolean');
  const cached = copy.cached;
  return class RequestScene extends Scene<{ cached: boolean; destination: string }> {
    override state = { cached, destination: 'pending' };
    override async construct() {
      const request = new Labeled(new Rectangle({ width: 2.4, height: 1 }), new Text('Request', { fontSize: 0.3 })).moveTo([-4, 1]);
      const destination = new Labeled(new Rectangle({ width: 2.4, height: 1 }), new Text('Pending', { fontSize: 0.3 })).moveTo([1, 1]);
      const edge = new Arrow([-2.7, 1], [-0.3, 1]);
      const code = new Code(['if (cached) return cache;', 'return database;'], { fontSize: 0.28 }).moveTo([-2, -1]);
      const readout = view(this, (s) => new StateReadout([['cached', s.cached], ['destination', s.destination]], { at: [3, -1.5] }), { place: 'left' });
      await this.step('intro', { caption: 'A request can use a cached result or read the database.' });
      await this.play(new FadeIn(request), new FadeIn(destination), new Create(edge), new FadeIn(code), new FadeIn(readout), { runTime: 0.4 });

      await this.step('route', { caption: cached ? 'A cached result sends this request to the cache.' : 'Without a cached result this request reads the database.' });
      this.state.destination = route({ cached });
      const next = new Text(this.state.destination, { fontSize: 0.3 }).moveTo(destination.label!);
      // Semantic state is assigned; the picture is derived from that state.
      await this.play(new Transform(destination.label!, next), readout.sync(), new Indicate(code.lines[cached ? 0 : 1]!), { runTime: 0.5 });
      this.record('route', { cached, destination: this.state.destination });
      await this.step('result', { caption: `The request uses the ${this.state.destination}.` });
      await this.wait(0.2);
    }
  };
}

export default requestScene({ cached: true });

import { Scene, Rectangle, renderFrame } from 'rayner';
import { stage, tweenState, view } from 'rayner/explain';
import { traceScene, loadProject } from 'rayner/testing';
import type { TraceOf } from 'rayner/testing';
import type { SceneClass } from 'rayner';

class TypedState extends Scene {
  override state = { count: 1 };
  override shown = { label: 'one' };

  override async construct() {
    const bar = view(this, (st) => new Rectangle({ width: st.count }));
    const square = view(this, (st) => new Rectangle({ width: st.count, height: st.count }));
    await tweenState(this, (t) => ({ count: t }), { views: [bar, square] });
    // @ts-expect-error a sampled state must satisfy the scene model
    tweenState(this, (t) => ({ other: t }), { views: [bar] });
    // @ts-expect-error a sampled picture has no independent parts to stagger
    tweenState(this, (t) => ({ count: t }), { views: [bar], lagRatio: 0.5 });
    class Words extends Scene { override state = { word: 'one' }; }
    const incompatible = new Words({ async frame() {} });
    const word = view(incompatible, (st) => new Rectangle({ width: st.word.length }));
    // @ts-expect-error every selected view must draw this model type
    tweenState(this, (t) => ({ count: t }), { views: [word] });
    const s = stage(this);
    await s.steps([
      { id: 'count', title: 'Count', line: 'Count.', caption: 'Count.', state: { n: 2 }, draw: (st) => new Rectangle({ width: st.n }) },
      { id: 'name', title: 'Name', line: 'Name.', caption: 'Name.', state: { label: 'three' }, draw: (st) => new Rectangle({ width: st.label.length }) },
    ]);
    const stillNumber: number = this.state.count;
    void stillNumber;
    // @ts-expect-error local step keys never become persistent model keys
    this.state.label;
    await s.steps([{
      id: 'wrong', title: 'Wrong', line: 'Wrong.', caption: 'Wrong.', state: { n: 1 },
      // @ts-expect-error each draw is inferred from its own specimen
      draw: (st) => new Rectangle({ width: st.label.length }),
    }]);
  }
}

declare const trace: TraceOf<typeof TypedState>;
const persistent: number = trace.steps[0]!.after.count;
const specimen: unknown = trace.steps[0]!.state?.label;
// @ts-expect-error arbitrary staged data is not promised by the scene's model type
const unsound: string = trace.steps[0]!.state?.label;
void [persistent, specimen, unsound];

interface Counter { count: number }
interface Labels { label: string }
const initial = (): Counter => ({ count: 7 });
class InterfaceState extends Scene {
  override state: Counter = initial();
  override shown: Labels = { label: 'seven' };
}
const accepted: SceneClass = InterfaceState;
const instance = new accepted({ async frame() {} });
// @ts-expect-error an erased model's keys must be narrowed before use
instance.state.missing.toUpperCase();
// @ts-expect-error what an erased scene shows has no known keys either
instance.shown.missing.toFixed();
// @ts-expect-error a scene model is an object
instance.state = 7;
// @ts-expect-error what a scene shows is an object
instance.shown = 'seven';
const json = instance.stateJson().count;
if (typeof json === 'number') json.toFixed();
const counted: Promise<number> = traceScene(InterfaceState).then((t) => t.steps[0]!.after.count);
const framed: Promise<number> = renderFrame(InterfaceState, 0).then((scene) => scene.state.count);
loadProject(InterfaceState, '.');
void [accepted, counted, framed];

// A typed field must be initialized, and its initial value must satisfy every required key.
class MissingState extends Scene {
  // @ts-expect-error an interface annotation alone cannot initialize a model
  override state: Counter;
}
class IncompleteShown extends Scene {
  // @ts-expect-error the authored presentation requires its label at frame zero
  override shown: Labels = {};
}
// @ts-expect-error a subclass cannot claim initial model and shown types independently of a value
class Uninitialized extends Scene<Counter, Labels> {}
class Dictionary extends Scene {
  override state: Record<string, unknown> = {};
}
const dictionary = new Dictionary({ async frame() {} });
dictionary.state.optional = 'value';
const raw = new Scene({ async frame() {} });
// @ts-expect-error a raw scene has no declared domain key
raw.state.count;
void [MissingState, IncompleteShown, Uninitialized, dictionary, raw];

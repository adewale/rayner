import { Scene, Rectangle } from 'rayner';
import { stage, tweenState, view } from 'rayner/explain';
import { traceScene, loadProject } from 'rayner/testing';
import type { TraceOf } from 'rayner/testing';
import type { SceneClass } from 'rayner';

class TypedState extends Scene<{ count: number }, { label: string }> {
  override async construct() {
    this.state = { count: 1 };
    this.shown = { label: 'one' };
    const bar = view(this, (st) => new Rectangle({ width: st.count }));
    const square = view(this, (st) => new Rectangle({ width: st.count, height: st.count }));
    await tweenState(this, (t) => ({ count: t }), { views: [bar, square] });
    // @ts-expect-error a sampled state must satisfy the scene model
    tweenState(this, (t) => ({ other: t }), { views: [bar] });
    // @ts-expect-error a sampled picture has no independent parts to stagger
    tweenState(this, (t) => ({ count: t }), { views: [bar], lagRatio: 0.5 });
    const incompatible = new Scene<{ word: string }>({ async frame() {} });
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
const initial = (): Counter => ({ count: 7 });
class InterfaceState extends Scene<Counter, {}> { override state = initial(); }
const accepted: SceneClass = InterfaceState;
const counted: Promise<number> = traceScene(InterfaceState).then((t) => t.steps[0]!.after.count);
loadProject(InterfaceState, '.');
void [accepted, counted];

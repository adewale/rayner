import { Scene, Text } from '../../../src/index.ts';
import { stage, view } from '../../../explain/index.ts';
import { start, type State } from './model.ts';

// rayner init --blank's scene, filled in: one step, the reader's array and what sort() makes of it.
export default class Explainer extends Scene<State, {}> {
  override state = start();

  override async construct() {
    const s = stage(this);
    const picture = view(this, (st) => new Text(`${st.input} sorts to ${st.sorted}`, { fontSize: 0.7, color: s.look.ink }));

    await this.step('start', {
      title: 'Ten sorts before nine',
      line: 'Read each number as text: "1", "10", "9".',
      caption: 'With no compare function, sort() compares the elements as strings. As text, "10" begins with "1", so it comes before "9", whatever the numbers are worth.',
    });
    await s.enter(picture);
  }
}

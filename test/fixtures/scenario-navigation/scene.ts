import { Scene, Text } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting } from '../../../explain/index.ts';

/**
 * A scene that starts each scenario at its first step (`scenarioNavigation: 'first'`): choosing
 * another option opens its `question`, whichever step the reader was on, and the transcript links
 * each scenario's first step only. A direct link to a later step still opens it.
 */
export default class ScenarioNavigation extends Scene {
  static meta = { id: 'scenario-navigation', title: 'Each scenario from its start', scenarioNavigation: 'first' } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'pick',
      label: 'Pick',
      default: 'one',
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
        { value: 'three', label: 'Three' },
      ],
    },
  ] satisfies readonly Setting[];
  override async construct() {
    const s = stage(this), pick = settingsOf(this).pick;
    await this.step('question', { title: 'The question', caption: `What does ${pick} leave?` });
    await s.enter(new Text(`${pick}?`, { fontSize: 1, color: s.look.ink }));
    await this.step('answer', { title: 'The answer', caption: `${pick} leaves its answer.` });
    await s.clear();
    await s.enter(new Text(`${pick}!`, { fontSize: 1, color: s.look.ink }));
  }
}

import { Scene } from '../../../src/index.ts';
import { Machine, answerOf, settingsOf, stage, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting } from '../../../explain/index.ts';
import { beats, flight } from '../../../explain/drawing.ts';
import { EVENTS, bound, next, sorted, start, type SortEvent, type State } from './model.ts';
import { drawSort } from './picture.ts';

const PLACES = ['First', 'Between 1 and 9', 'Last'];

export default class SortAsText extends Scene<State, {}> {
  static meta = {
    sources: ['https://tc39.es/ecma262/2025/#sec-sortcompare'],
  } satisfies ExplainerMeta;
  static settings = [
    { id: 'compare', label: 'Compare function', default: 'none', options: [{ value: 'none', label: 'none' }, { value: 'numbers', label: '(a, b) => a - b' }] },
  ] as const satisfies readonly Setting[];

  override state = start('none');

  override async construct() {
    const s = stage(this);
    const compare = settingsOf(this, SortAsText).compare;
    const asText = compare === 'none';
    this.state = start(compare);
    const picture = view(this, (st) => drawSort(s, st));
    // The reader's buttons: each puts a number on the end of the array. Its sorted box flies down
    // from just under where the number joins the array, along the gap between the rows and down into
    // its place, over no other number, after the boxes it passes have made room.
    const machine = new Machine<State, SortEvent>(this, {
      start: { ...start(compare), sorted: true },
      events: EVENTS,
      next,
      bound,
      views: [picture],
      transition: Object.fromEntries(EVENTS.map((event) => [event, (t) => {
        const n = event.slice(4), c = t.choreograph(picture), [x] = c.to(`array:${n}`).center(), [to] = c.to(`sorted:${n}`).center();
        return beats(c, flight(c, `sorted:${n}`, [[x!, -0.2], [to!, -0.2]]), { fresh: [`sorted:${n}`], lead: ['array:', 'sorted:'] });
      }])),
      runTime: 2.2,
    });

    const tenGoes = PLACES[sorted(this.state.values, compare).indexOf(10)]!;
    await this.step('ask', {
      title: 'Where does 10 go?',
      line: 'Predict, then press Next.',
      caption: asText
        ? 'You call sort() on [10, 9, 1] and pass no compare function. Where in the sorted array does 10 end up?'
        : 'You call sort() on [10, 9, 1] and pass the compare function (a, b) => a - b. Where in the sorted array does 10 end up?',
      predict: { options: PLACES, answer: tenGoes },
    });
    await s.enter(picture);

    await this.step('answer', {
      title: asText ? 'Answer: 10 sorts before 9' : 'Answer: 10 sorts last',
      line: asText ? 'As text, "10" begins with "1".' : 'a - b is negative when a is smaller.',
      caption: asText
        ? `With no compare function, ${answerOf(this)}. "10" begins with "1", which comes before "9", so 10 goes between 1 and 9, whatever the numbers are worth.`
        : `With no compare function, ${answerOf(this)}, and 10 would go before 9. (a, b) => a - b compares them as numbers: a negative result puts a first, so 10, the largest, goes last.`,
    });
    this.state = { ...this.state, sorted: true };
    await picture.sync();

    await this.step('add', {
      title: asText ? '100 lands before 9' : '100 lands last',
      line: 'Press add: where will each number land?',
      caption: asText
        ? 'Add 100 to the end of the array and sort() puts it after 10 and before 9: as text, "100" begins with "10". Press add 2 or add 25, predict where it lands, then watch.'
        : 'Add 100 to the end of the array and sort() puts it last, the largest number. Press add 2 or add 25, predict where it lands, then watch.',
    });
    await this.play(machine.replay(['add 100']));
  }
}

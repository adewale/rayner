import { Scene, Group, Rectangle, Text, Machine, view } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { DOOR_EVENTS, doorNext, doorStart, type DoorEvent, type DoorState } from './model.ts';

// A machine explainer: the model in model.ts drives the door, the picture is a view of the state,
// and the step where the machine last plays is live, so the reader presses the events there.
export default class DoorMachine extends Scene<DoorState> {
  static meta = {
    id: 'door',
    title: 'When can a locked door open?',
    answer: 'A locked door must unlock before it opens',
    checks: [{ question: 'The door is open. Which events, in order, leave it locked?', answer: 'close, then lock: an open door cannot lock.' }],
  };
  override state = doorStart();

  override async construct() {
    const s = stage(this);
    const { ink, paper } = s.palette;
    /** The door as the state says: its frame, its panel (shut, or swung open at the hinge), the bolt when locked, and the word. */
    const draw = (st: DoorState) => {
      const shut = st.door !== 'open';
      const frame = new Rectangle({ width: 2.6, height: 4, stroke: ink, strokeWidth: 0.06, fill: paper }).moveTo([0, 0.1]);
      const panel = new Rectangle({ width: shut ? 2.3 : 0.5, height: shut ? 3.7 : 3.9, stroke: ink, strokeWidth: 0.04, fill: s.soft, fillOpacity: 0.35 })
        .moveTo([shut ? 0 : -1.1, 0.1]);
      const word = new Text(st.door, { fontSize: 0.6, color: st.door === 'locked' ? s.emphasis : ink }).moveTo([0, -2.55]);
      const parts: [string, Rectangle | Text][] = [['door:frame', frame], ['door:panel', panel], ['door:word', word]];
      if (st.door === 'locked') parts.push(['door:bolt', new Rectangle({ width: 0.7, height: 0.32, stroke: 'none', fill: s.emphasis }).moveTo([0.95, 0.1])]);
      return new Group(...parts.map(([key, part]) => Object.assign(part, { key })));
    };
    const door = view(this, draw);
    // The model, its events and the picture of its state. `next` returns refuse(reason) where the
    // door refuses an event, and the player says that reason on the event's button.
    const machine = new Machine<DoorState, DoorEvent>(this, { start: doorStart(), events: DOOR_EVENTS, next: doorNext, views: [door] });

    await this.step('door', {
      title: 'A door that can lock',
      line: 'Predict: can a locked door open?',
      caption: 'The door is open. It can close, a closed door can lock, and a locked door can unlock. Each is an event, and the model says what each event does to the door, or why the door refuses it.',
    });
    await s.enter(door, { describe: () => `A door, ${this.state.door}` });

    await this.step('locked', {
      title: 'Answer: it must unlock first',
      line: 'Press the events: a refused one says why.',
      caption: 'Close the door, then lock it. A locked door must unlock before it opens: open is refused now, and the model says why. Press the events to drive the door yourself.',
    });
    await this.play(machine.replay(['close', 'lock']));
  }
}

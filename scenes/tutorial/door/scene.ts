import { Scene, Machine, view } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { DOOR_EVENTS, doorNext, doorStart, type DoorEvent, type DoorState } from './model.ts';
import { drawDoor } from './picture.ts';

// A machine explainer: the model in model.ts drives the door, the picture is a view of the state,
// and the step where the machine last plays is live, so the reader presses the events there. The
// title, answer and check questions come from script.md's intent header.
export default class DoorMachine extends Scene<DoorState> {
  static meta = { id: 'door' };
  override state = doorStart();

  override async construct() {
    const s = stage(this);
    const door = view(this, (st: DoorState) => drawDoor(st, { ...s.palette, soft: s.soft, emphasis: s.emphasis }));
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

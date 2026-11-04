import { Scene } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';

/** A composite state with one transition leaving it, drawn by Mermaid. */
export const COMPOSITE = `stateDiagram-v2
  direction TB
  off --> on: POWER_ON
  state on {
    direction LR
    [*] --> idle
    idle --> brewing: START
    brewing --> ready: BREWED
    ready --> idle: TAKE
  }
  on --> off: POWER_OFF`;

/** A composite split into two concurrent regions, each with its own start. */
export const REGIONS = `stateDiagram-v2
  direction LR
  [*] --> off
  off --> on: POWER
  state on {
    direction TB
    [*] --> paused
    paused --> playing: PLAY
    playing --> paused: PAUSE
    --
    [*] --> unmuted
    unmuted --> muted: MUTE
    muted --> unmuted: UNMUTE
  }
  on --> off: POWER_OFF`;

export default class StateComposite extends Scene {
  static meta = { id: 'state-composite', title: 'Composite states and regions' };
  override async construct() {
    const s = stage(this, { headingSize: 0.54 });
    await this.step('composite', { title: 'A composite state', caption: 'One POWER_OFF arrow leaves on.' });
    const d = await s.show({ source: COMPOSITE }, { box: 'full' });
    await d.mark(['brewing'], { as: 'current' });
    await this.step('regions', { title: 'Two regions', caption: 'Each region is in one state at once.' });
    await s.clear();
    const r = await s.show({ source: REGIONS }, { box: 'full' });
    await r.dim(['on']);
  }
}

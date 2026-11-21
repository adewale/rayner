import type { Scene, Step } from '../src/scene.ts';

// An offer belongs to this run's step, even if the same machine plays or is offered again later.
const owners = new WeakMap<Step, object>();

export function offerMachine(scene: Pick<Scene, 'currentStep'>, machine: object): void {
  const step = scene.currentStep;
  if (!step || step.t1 !== null) throw new Error('machine.offer(): begin the step where readers can send events before offering the machine');
  const owner = owners.get(step);
  if (owner && owner !== machine) throw new Error(`machine.offer(): another machine already offers controls at step ${JSON.stringify(step.path)}; offer one machine per step`);
  owners.set(step, machine);
}

export const offeredMachine = (step: Step): object | undefined => owners.get(step);

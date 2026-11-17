import { Scene } from '../../../src/index.ts';
import { stage, settingsOf, view } from '../../../explain/index.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { ANSWER, GROOVE, IDEAS, PAIN, RUN, riseToAnswer, start, throwAgain, throwMachine, throwYou, type Feeling, type State } from './model.ts';
import { drawCompare, drawLanes, sayCompare, sayLanes } from './picture.ts';

type Shown = { chapter: 'lanes' | 'compare'; readout: boolean };

export default class MachineThinking extends Scene<State, Shown> {
  static meta = {
    sources: ['https://glazkov.com/2025/01/20/machine-thinking/'],
    claims: [
      { says: 'It rolls only to lower ground and stops where nothing beside it feels lower', test: "model.test.ts: the person's ball only rolls to lower felt ground" },
      { says: 'the hurt never moved the ball', test: 'model.test.ts: the feeling changes what the machine says, never where its ball goes' },
      { says: 'a feeling would never move its ball', test: 'model.test.ts: the feeling changes what the machine says, never where its ball goes' },
      { says: 'Every spot your ball crossed is now 0.6 lower', test: "model.test.ts: a throw wears grooves into the person's slope" },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'feeling',
      label: 'Admitting “I’m the cause”',
      default: 'painful',
      options: [
        { value: 'painful', label: 'hurts' },
        { value: 'neutral', label: 'does not hurt' },
      ],
    },
  ];
  override state = start('painful');
  override shown: Shown = { chapter: 'lanes', readout: false };

  override async construct() {
    const feeling = settingsOf(this).feeling as Feeling, hurts = feeling === 'painful';
    this.state = start(feeling);
    const s = stage(this);
    const picture = view(this, (st, sh) => (sh.chapter === 'compare' ? drawCompare(s) : drawLanes(st, s, { readout: sh.readout })));

    // Play a run of states, one sync each.
    const roll = async (frames: State[]) => {
      for (const f of frames) { this.state = f; await this.play(picture.sync({ runTime: 0.6 })); }
    };

    const you = throwYou(this.state.you, feeling), stopYou = you.at(-1)!;
    const machine = throwMachine(this.state.machine), stopMachine = machine.at(-1)!;
    const youAt = IDEAS[stopYou.at], machineAt = IDEAS[stopMachine.at];
    const rise = riseToAnswer(stopYou, feeling);

    await this.step('slope', {
      title: 'Throw a thought down a slope',
      line: 'The slope is your mental models; each dip is an idea.',
      caption: `Dimitri Glazkov pictures thinking as a ball rolling down a bumpy slope, shaped by your mental models. Here the ball is a question, why is the team's work late, and the slope falls from it past Tight plans and Work harder to the lowest ground, I'm the cause. Your ball is on top. Below, a machine gets the same throw onto the same slope.${hurts ? ' The raised line marked pain is how admitting the lowest idea feels to you.' : ''}`,
    });
    await s.enter(picture, { describe: () => (this.shown.chapter === 'compare' ? sayCompare() : sayLanes(this.state)) });
    s.opening(picture, { keep: true });

    await this.step('pulled', {
      title: 'Your ball is pulled downhill',
      line: hurts ? `It stops at ${youAt}, short of lower ground.` : `It rolls all the way to ${youAt}.`,
      caption: hurts
        ? `What pulls your ball is homeostasis, the need to save energy and stay alive. It rolls only to lower ground and stops where nothing beside it feels lower. It stops at ${youAt}. ${IDEAS[ANSWER]} is lower ground, but admitting it hurts, and the pain makes it feel ${PAIN} higher. To reach it, your ball would have to climb ${rise}.`
        : `What pulls your ball is homeostasis, the need to save energy and stay alive. It rolls only to lower ground and stops where nothing beside it feels lower. Admitting ${IDEAS[ANSWER]} does not hurt here, so nothing raises it, and your ball rolls down to it and stops: it is the lowest ground.`,
    });
    await roll(you.slice(1).map((b) => ({ ...this.state, you: b })));

    await this.step('predict', {
      title: 'The machine gets the same throw',
      line: 'Predict: where does its ball stop?',
      caption: `The machine learned the same slope from what people write, including how its ideas feel, as words about them. Nothing pulls its ball. It moves each time it is run, ${RUN} pushes here, each to the lowest next spot it has not visited, uphill or down. Where will it stop?`,
      predict: { options: IDEAS.slice(1), answer: machineAt },
    });
    this.shown = { ...this.shown, readout: true };
    await this.play(picture.sync());

    await this.step('pushed', {
      title: `Answer: ${machineAt}`,
      line: 'Same slope, but pushed, not pulled, and feeling nothing.',
      caption: hurts
        ? `It stops at ${machineAt}, ground yours could not reach. It rolls over the same terrain of ideas, but it is pushed rather than pulled, and it feels nothing. Its words say the idea would hurt, but the hurt never moved the ball: it can reason about a feeling without having one, which Glazkov calls logic-feeling. It stopped because its ${RUN} pushes ran out, not because it found rest.`
        : `It stops at ${machineAt}, where yours did. It rolls over the same terrain of ideas, but it is pushed rather than pulled, and it feels nothing. Yours stopped because nothing beside it was lower; the machine's stopped because its ${RUN} pushes ran out. Its words describe how the idea feels, but a feeling would never move its ball.`,
    });
    await roll(machine.slice(1).map((b) => ({ ...this.state, machine: b })));

    const again = throwAgain(this.state);
    const you2 = throwYou(again.you, feeling), machine2 = throwMachine(again.machine);
    const rise2 = riseToAnswer(you2.at(-1)!, feeling);
    await this.step('again', {
      title: 'Throw again: your ball wore a groove',
      line: hurts ? `The rise to the answer grows from ${rise} to ${rise2}.` : 'Your route is now a groove; the machine’s slope is unchanged.',
      caption: hurts
        ? `Thinking changes your slope as you go. Every spot your ball crossed is now ${GROOVE} lower, so the second throw takes the same route and settles deeper at ${IDEAS[you2.at(-1)!.at]}: the climb to the answer grows from ${rise} to ${rise2}. The machine's slope is as it was, and its second run repeats the first. Running it does not change what it learned.`
        : `Thinking changes your slope as you go. Every spot your ball crossed is now ${GROOVE} lower, a groove from the question down to ${IDEAS[ANSWER]}, so the route is now a habit. The machine's slope is as it was, and its second run repeats the first. Running it does not change what it learned.`,
    });
    this.state = again;
    await this.play(picture.sync({ runTime: 0.8 }));
    const ticks = Math.max(you2.length, machine2.length);
    await roll(Array.from({ length: ticks - 1 }, (_, k) => ({ ...again, you: you2[Math.min(k + 1, you2.length - 1)]!, machine: machine2[Math.min(k + 1, machine2.length - 1)]! })));

    await this.step('frays', {
      title: 'Where the likeness frays',
      line: 'The paths match until a feeling, a need or a habit would steer.',
      caption: `Most of the time the two balls end in the same place, which is why machine thinking looks like ours. They part where a feeling, the need to save energy, or a worn groove would steer a person. Glazkov compares prompting to pinball: we get good with the flippers, and each miss disappoints more. His advice is to treat machine thinking as its own kind, and use it for what it does well.`,
    });
    this.shown = { ...this.shown, chapter: 'compare' };
    await this.play(picture.sync({ runTime: 1 }));
  }
}

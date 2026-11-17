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
      { says: 'it rolls only to lower ground and stops where nothing beside it feels lower', test: "model.test.ts: the person's ball only rolls to lower felt ground" },
      { says: 'a feeling it can describe puts no force on its ball', test: 'model.test.ts: the feeling changes what the machine says, never where its ball goes' },
      { says: 'a feeling would never move its ball', test: 'model.test.ts: the feeling changes what the machine says, never where its ball goes' },
      { says: 'every spot your ball crossed is now 0.6 lower', test: "model.test.ts: a throw wears grooves into the person's slope" },
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
      caption: `Dimitri Glazkov pictures thinking as a ball rolling down a bumpy slope whose dips are the ideas you hold. Here the ball is the question why the team's work is late, and the slope falls past Tight plans and Work harder to its lowest idea, I'm the cause. Your ball is on top, and a machine's ball gets the same throw below.${hurts ? ' The raised line marked pain shows how admitting the lowest idea feels to you.' : ''}`,
    });
    await s.enter(picture, { describe: () => (this.shown.chapter === 'compare' ? sayCompare() : sayLanes(this.state)) });
    s.opening(picture, { keep: true });

    await this.step('pulled', {
      title: 'Your ball is pulled downhill',
      line: hurts ? `It stops at ${youAt}, short of lower ground.` : `It rolls all the way to ${youAt}.`,
      caption: hurts
        ? `Homeostasis, the need to save energy and stay alive, pulls your ball, so it rolls only to lower ground and stops where nothing beside it feels lower. ${IDEAS[ANSWER]} is lower ground than ${youAt}, but admitting it hurts, and the pain raises it by ${PAIN} as you feel it. Your ball therefore stops at ${youAt}, where reaching the answer would mean climbing ${rise}.`
        : `Homeostasis, the need to save energy and stay alive, pulls your ball, so it rolls only to lower ground and stops where nothing beside it feels lower. Because admitting ${IDEAS[ANSWER]} does not hurt here, nothing raises it, and your ball rolls down to it and rests on the lowest ground of the slope.`,
    });
    await roll(you.slice(1).map((b) => ({ ...this.state, you: b })));

    await this.step('predict', {
      title: 'The machine gets the same throw',
      line: 'Predict: where does its ball stop?',
      caption: `The machine learned the same slope from what people have written. That writing also says how ideas feel, so the machine's slope carries feelings as words attached to ideas, with no effect on height. Its ball moves once each time the machine is run, ${RUN} times here, to whichever unvisited neighbour is lowest, even if that means going uphill. Where will it stop?`,
      predict: { options: IDEAS.slice(1), answer: machineAt },
    });
    this.shown = { ...this.shown, readout: true };
    await this.play(picture.sync());

    await this.step('pushed', {
      title: `Answer: ${machineAt}`,
      line: 'Same slope; it moves when run and feels nothing.',
      caption: hurts
        ? `It stops at ${machineAt}, ground your ball could not reach. It rolls over the same terrain of ideas, but it is pushed rather than pulled, and it feels nothing. Its words say the idea would hurt, yet the ball rolled on, because a feeling it can describe puts no force on its ball; Glazkov calls this logic-feeling. It stopped when its ${RUN} pushes ran out, whereas yours stopped because nothing beside it felt lower.`
        : `It stops at ${machineAt}, where yours did. It rolls over the same terrain of ideas, but it is pushed rather than pulled, and it feels nothing. The two balls reached one spot for different reasons: yours stopped because nothing beside it was lower, and the machine's because its ${RUN} pushes ran out. Its words describe how the idea feels, but a feeling would never move its ball.`,
    });
    await roll(machine.slice(1).map((b) => ({ ...this.state, machine: b })));

    const again = throwAgain(this.state);
    const you2 = throwYou(again.you, feeling), machine2 = throwMachine(again.machine);
    const rise2 = riseToAnswer(you2.at(-1)!, feeling);
    await this.step('again', {
      title: 'Throw again: your ball wore a groove',
      line: hurts ? `The rise to the answer grows from ${rise} to ${rise2}.` : 'Your route is now a groove; the machine’s slope is unchanged.',
      caption: hurts
        ? `Your first throw wore a groove: every spot your ball crossed is now ${GROOVE} lower. The second throw follows the same route and settles deeper at ${IDEAS[you2.at(-1)!.at]}, so the climb to the answer grows from ${rise} to ${rise2} and the avoided answer gets harder to reach. The machine's slope is unchanged, because running a model does not change what it learned, and its second run repeats the first.`
        : `Your first throw wore a groove: every spot your ball crossed is now ${GROOVE} lower, from the question down to ${IDEAS[ANSWER]}, so the route to the answer has become a habit. The machine's slope is unchanged, because running a model does not change what it learned, and its second run repeats the first.`,
    });
    this.state = again;
    await this.play(picture.sync({ runTime: 0.8 }));
    const ticks = Math.max(you2.length, machine2.length);
    await roll(Array.from({ length: ticks - 1 }, (_, k) => ({ ...again, you: you2[Math.min(k + 1, you2.length - 1)]!, machine: machine2[Math.min(k + 1, machine2.length - 1)]! })));

    await this.step('frays', {
      title: 'Where the likeness frays',
      line: 'The balls part where pain, energy or habit would steer a person.',
      caption: `${hurts ? `Set the answer to painless and both balls end on ${IDEAS[ANSWER]}.` : `Here both balls end on ${IDEAS[ANSWER]}.`} From outside you see where a ball stopped and not why, so machine thinking passes for ours. The paths part where something a person has does the steering: pain, the pull to save energy, the groove from the last throw. Glazkov compares prompting to pinball: as players master the flippers, each miss disappoints more. Expecting the machine's ball to roll like ours sets up those misses.`,
    });
    this.shown = { ...this.shown, chapter: 'compare' };
    await this.play(picture.sync({ runTime: 1 }));
  }
}

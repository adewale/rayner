import { Scene, Group, Dot, FadeIn, AnimationGroup, Succession, matchByKey, CurvedArrow } from '../../../src/index.ts';
import type { Transition, ExplainerMeta } from '../../../explain/index.ts';
import type { MatchKey, Box, Mobject, Arrow } from '../../../src/index.ts';
import { stage, regionBox, view, having, Machine } from '../../../explain/index.ts';
import { CONTROLS, RUNS, player, coffee, coffeeWithFrother, flatten, run, activeStates, chartCounts, flatCounts, send, drivenStart, drivenNext, events as chartEvents } from './model.ts';
import type { StateNode, Driven } from './model.ts';
import { PLAYBACK, VOLUME, SUBTITLES, cellKey, cellOf, FLAT, CHART, TRACE, COFFEE, fit, scaleFor, coffeeLayout, coffeePicture, flatPicture, chartPicture, tracePicture } from './picture.ts';
import type { Drawn } from './picture.ts';

/** Morphs pair parts by key: shapes by their place in the keyed part, a keyed word only with the same word. */
const byKey: MatchKey = matchByKey({ text: 'whole' });
type Chapter = 'machine' | 'copies' | 'parent' | 'multiply' | 'grid' | 'regions' | 'flatten' | 'question' | 'frother';
// The picture is a function of the model and of which picture is shown. The model, for the two
// charts a reader could drive, is their configuration (`config`) and the boxes it is in
// (`current`); otherwise just the boxes followed, if any. Which picture is `shown.chapter`. So a View
// checks it against the trace, and rayner check can draw any state a Machine reaches.
type Model = Driven | { current: string[] | null };
type Shown = { chapter: Chapter };

export default class Statecharts extends Scene<Model, Shown> {
  static meta = {
    sources: [
      'https://x.com/DavidKPiano/status/2116523008323981315',
      'https://www.state-machine.com/doc/Harel87.pdf',
      'https://www.w3.org/TR/2015/REC-scxml-20150901/',
      'https://www.npmjs.com/package/xstate/v/5.33.3',
    ],
    watch: { current: 'Current states' },
    // Sentences that reach past the charts on screen, and the test that holds each against the model and XState.
    claims: [
      { says: 'is always in exactly one of four boxes', test: 'model.test.ts: the coffee machine is always in exactly one state' },
      { says: 'A POWER_OFF copied onto every state, and one copy missed', shown: true as const },
      { says: 'playback and volume never affect each other', test: 'model.test.ts: every arrow between them changes one word and keeps the other' },
      { says: 'Every name is two words, one per feature', test: 'model.test.ts: every flat state while on names one state per region' },
      { says: 'a further feature adds a region of two states where the flat machine doubles', test: 'model.test.ts: each on/off feature adds a region of two states' },
      { says: 'Only the drawing changes', test: 'model.test.ts: flattening each drawn chart reaches the configurations and transitions XState reaches' },
      { says: 'every state while on would pair one of the four brewing states with still or frothing', test: 'model.test.ts: every pair is reachable' },
    ],
  } satisfies ExplainerMeta;

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.54 });
    const playerChart = player(2),
      coffeeFlat = flatCounts(flatten(coffee())),
      coffeePlain = flatten(coffee()).transitions.filter((t) => t.from !== 'off' && t.to !== 'off').length,
      coffeeChart = chartCounts(coffee()),
      frotherFlat = flatCounts(flatten(coffeeWithFrother())),
      frotherChart = chartCounts(coffeeWithFrother()),
      playerFlat = flatCounts(flatten(playerChart)),
      // A third feature, as the regions step counts it: the flat machine's states while on, and the chart's states in its regions.
      threeFlat = flatCounts(flatten(player(3))).states - 1,
      threeChart = CONTROLS.slice(0, 3).reduce((n, c) => n + c.states.length, 0);

    const FULL = regionBox('full', { top: 3.05 });
    const big = (b: Box) => fit(b, FULL, scaleFor(b, FULL));

    const [, playing] = PLAYBACK.states,
      [, muted] = VOLUME.states;
    const followCell = cellKey(cellOf([playing, muted]));
    const ACTIVE = activeStates(playerChart, run(playerChart, RUNS.player)[2]!.config);
    let drawn: Drawn = { group: new Group(), words: [] };
    const picture = (st: Model, { chapter }: Shown): Drawn => {
      switch (chapter) {
        case 'machine':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'plain', { follow: [], lit: [] });
        case 'copies':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'flat', { follow: [], lit: Object.keys(COFFEE.ys).map((id) => `c:arrow:${id}:POWER_OFF:off`) });
        case 'parent':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'chart', { follow: 'config' in st ? st.config : [], lit: ['c:arrow:grinding:POWER_OFF:off'] }, true);
        case 'multiply':
          return flatPicture(s, playerChart, big(FLAT.bounds), { follow: [], lit: [] });
        case 'grid':
          return chartPicture(s, playerChart, 'boxed', big(CHART.bounds), { follow: [followCell], lit: [] }, false);
        case 'regions':
          return chartPicture(s, playerChart, 'regions', big(CHART.bounds), { follow: ACTIVE, lit: ['r:arrow:0,0:PLAY:1,0', 'r:arrow:1,0:PAUSE:0,0', 'r:arrow:0,0:MUTE:0,1', 'r:arrow:0,1:UNMUTE:0,0'] });
        case 'flatten':
          return tracePicture(s, big(TRACE));
        case 'question':
          return coffeePicture(s, big(coffeeLayout('question').bounds), 'question', { follow: [], lit: [] });
        case 'frother':
          return coffeePicture(s, big(coffeeLayout('frother').bounds), 'frother', { follow: st.current ?? [], lit: [] });
      }
    };
    this.state = { current: null } satisfies Model;
    this.shown = { chapter: 'machine' } satisfies Shown;
    const main = view(this, (st, sh) => (drawn = picture(st, sh)).group, { place: false });
    const describe = { describe: () => drawn.words.join('; ') };
    const show = (chapter: Chapter) => { this.shown = { chapter } satisfies Shown; };
    /** A new picture: clear the stage and fade the next one in. */
    const fresh = async (next: Chapter) => {
      await s.clear({ runTime: 0.35 });
      show(next);
      main.rebuild();
      s.keep(main, describe);
      await this.play(new FadeIn(main, { runTime: 0.6 }));
    };
    const morph = async (next: Chapter) => {
      show(next);
      await this.play(main.sync({ match: byKey, staged: false, runTime: 1.2 }));
    };
    // The two charts a reader could drive, as Machines: each event is the model's send(), and
    // rayner check draws every configuration the events reach. The parent step replays a brew
    // that starts; the frother step the transfer answer's events.
    /** The boxes the picture draws green for a state: the parent step follows the configuration, the frother step every box it is in. */
    const followed = (st: Driven) => (this.shown.chapter === 'parent' ? st.config : st.current);
    /** The arrow an event takes: the transition written on the state that handled it (its own, or its parent's), keyed as coffeePicture keys it. */
    /** The line an arrow of the chart is drawn along: a straight arrow's line, a curved one's arc. */
    const shaft = (arrow: Mobject) => (arrow instanceof CurvedArrow ? arrow.arc : (arrow as Arrow).line);
    const arrowFor = (chart: StateNode, from: string, event: string) => {
      const find = (n: StateNode): StateNode | undefined => (n.id === from ? n : (n.children ?? []).map(find).find(Boolean));
      const to = find(chart)!.on![event]!;
      return from === 'on' ? 'c:arrow:grinding:POWER_OFF:off' : to === 'on' ? 'c:arrow:off:POWER_ON:idle' : `c:arrow:${from}:${event}:${to}`;
    };
    // An event the configuration does not handle is discarded (SCXML), so its button would be
    // disabled: the model refuses it, naming the boxes without its arrow. One that is handled travels: the boxes it leaves stop being
    // green, a token runs along the arrow of the state that took it (on's own POWER_OFF when the
    // current state has none), and the boxes it enters turn green.
    const driven = (chart: StateNode) =>
      new Machine<Model, string>(this, {
        start: drivenStart(chart),
        events: chartEvents(chart),
        next: (state, event) => drivenNext(chart, having(state, 'config'), event),
        views: [main],
        match: byKey,
        // 0.35 s to leave, 0.8 s along the arrow, 0.5 s to arrive.
        runTime: 1.65,
        transition: Object.fromEntries(
          chartEvents(chart).map((event) => [
            event,
            (t: Transition<Model, string>) => {
              const before = having(t.before, 'config'), after = having(t.after, 'config'), c = t.choreograph(main);
              const was = followed(before), now = followed(after);
              const leaving = was.filter((id) => !now.includes(id)), entering = now.filter((id) => !was.includes(id));
              // One token per state that handled the event, travelling its arrow.
              const walks = send(chart, before.config, event).sources.map((from, i) =>
                c.travel(`walk:token:${i}`, new Dot({ radius: 0.11, color: s.look.emphasis }), shaft(c.from(arrowFor(chart, from, event))), { appear: 0.35, move: 0.8, leave: 0.25 }));
              return new Succession([
                new AnimationGroup([...leaving.map((id) => c.morph(`c:${id}`, { runTime: 0.35 })), ...walks.map((w) => w.appear)]),
                new AnimationGroup(walks.map((w) => w.move)),
                new AnimationGroup([
                  ...walks.map((w) => w.leave),
                  ...entering.map((id) => c.morph(`c:${id}`, { runTime: 0.5 })),
                  c.rest({ runTime: 0.5 }),
                ]),
              ]);
            },
          ]),
        ),
      });
    const brew = driven(coffee());
    const frother = driven(coffeeWithFrother());
    /** Start a chart in its picture, then replay its events through the model. */
    const replay = async (machine: typeof brew, chapter: 'parent' | 'frother', events: readonly string[]) => {
      show(chapter);
      this.state = machine.spec.start;
      await this.play(main.sync({ match: byKey, staged: false, runTime: 1.2 }));
      await this.play(machine.replay(events));
    };

    // 1. A concrete machine, and the change that will hurt it.
    await this.step('machine', {
      title: 'A coffee machine, one box at a time',
      line: 'Predict: a power button must switch it off from any state. How many arrows does that add?',
      // The flat machine's transitions beyond the plain cycle's, from the model.
      predict: { options: ['1', '2', '4', '5'], answer: String(coffeeFlat.transitions - coffeePlain) },
      caption: `This coffee machine is always in exactly one of four boxes: idle, grinding, brewing or ready. Each event moves it along one of ${coffeePlain} arrows: START, GROUND, BREWED and TAKE. The boxes are called states, the arrows transitions, and the whole drawing a state machine. Now give it a power button: the event POWER_OFF switches it off from whichever state it is in, and POWER_ON switches it back on.`,
    });
    main.rebuild();
    s.keep(main, describe);
    await this.play(new FadeIn(main, { runTime: 0.7 }));

    // 2. Shared behaviour is copied.
    await this.step('copies', {
      title: 'A POWER_OFF copied onto every state, and one copy missed',
      line: 'Predict: the marked arrows all do the same thing. How could one arrow do the job?',
      caption: `In this hand-copied machine brewing’s POWER_OFF is missing, so the power button does nothing until the brew finishes. In a plain state machine an arrow leaves one state: idle, grinding, brewing and ready each need their own POWER_OFF and off a POWER_ON, ${coffeeFlat.transitions - coffeePlain} more arrows and ${coffeeFlat.transitions} in all. A state added later would need its own copy. One event leading from several states to the same place is the first of two signs in a flat machine.`,
    });
    await morph('copies');

    // 3. The box: a parent takes what its children don't. The name arrives here.
    await this.step('parent', {
      title: 'A box around the four states takes the one POWER_OFF',
      line: 'In XState and SCXML, the current state is asked first, then the box around it.',
      caption: `Put the four in a box called on and give the box the one POWER_OFF: the ${coffeeFlat.transitions} transitions a complete flat machine needs become ${coffeeChart.transitions}. Brewing has no POWER_OFF arrow, so the event goes to the box around it, its parent. The box is half of the answer: a statechart is a state machine whose states can contain other states, active one at a time or several at once. Inside on, one state is active at a time.`,
    });
    // The machine starts off; switching it on and starting a brew takes it to brewing, where POWER_OFF arrives.
    await replay(brew, 'parent', RUNS.coffee.slice(0, 3));

    // 4. Independent features multiply.
    await this.step('multiply', {
      title: 'A media player: two on/off features make four flat states',
      line: `Predict: add a third on/off feature, ${SUBTITLES.region}. How many combinations must the flat states name?`,
      predict: { options: ['6', '8', '9', '12'], answer: String(threeFlat) },
      caption: `A media player is playing or paused, and muted or unmuted, and playback and volume never affect each other. A plain state machine is in one state at a time, so each state must name both: four combinations, which with off make ${playerFlat.states} states and ${playerFlat.transitions} transitions. Every name is two words, one per feature, and every arrow between them changes one word and keeps the other. States named by two independent words are the second sign.`,
    });
    await fresh('multiply');
    this.state = { current: null } satisfies Model; // the coffee machine's configuration ends with its pictures

    // 5. Regions: the grid's own words move into two small machines.
    await this.step('regions', {
      title: 'Split the box on into two small machines, called regions',
      line: 'Predict: can a statechart do anything a state machine can’t?',
      // No, when the flattened player ends every event of the run in the chart's own configuration, as the next step's rows show.
      predict: {
        options: ['Yes', 'No'],
        answer: ((flat) => {
          let at = flat.initial;
          return run(playerChart, RUNS.player).every((st) => {
            at = flat.transitions.find((t) => t.from === at && t.event === st.event)?.to ?? at;
            return JSON.stringify([...flat.configurations[at]!].sort()) === JSON.stringify([...st.config].sort());
          });
        })(flatten(playerChart)) ? 'No' : 'Yes',
      },
      caption: `Draw a line through on and give each side one feature: playing · muted becomes playing on one side, muted on the other. Each side is a region, a small machine in one state at a time, and both run at once. A region’s state names only its own feature, so a further feature adds a region of two states where the flat machine doubles: ${SUBTITLES.region} would make ${threeFlat} combinations, against ${threeChart} states in three regions.`,
    });
    await fresh('grid');
    await morph('regions');
    this.state = { current: ACTIVE } satisfies Model;

    // 6. Same behaviour, smaller drawing.
    await this.step('flatten', {
      title: 'No: flattened, a statechart is an ordinary state machine',
      line: 'Flatten the player and send the same events through both machines.',
      caption:
        'Each row sends the next event to the statechart and to its flat version, and both end in the same states. At run time the player is still in one combination of playback and volume. Only the drawing changes: the statechart describes each feature separately, while the flat machine repeats it for the combinations. The possible combinations still exist; writing their shared behaviour once is what saves space.',
    });
    await fresh('flatten');
    this.state = { current: null } satisfies Model;

    // 7. Transfer: the reader places a new feature.
    await this.step('question', {
      title: 'Your turn: add a milk frother',
      line: 'Predict: where does the frother go, and how big is the flat machine?',
      predict: { prompt: 'How many states would a flat machine need, off included?', options: ['6', '8', '9', '16'], answer: String(frotherFlat.states) },
      caption:
        'The frother can be still or frothing at any time while the machine is on, whatever the brewing cycle is doing. Is it a new parent, a new region, or more states in the cycle? And how many states would a flat machine need?',
    });
    await fresh('question');

    // 8. The transfer answer: a second region.
    await this.step('frother', {
      title: 'The frother is a second region, beside the brewing cycle',
      line: `A flat machine would need ${frotherFlat.states} states and ${frotherFlat.transitions} transitions; the statechart draws ${frotherChart.transitions} arrows.`,
      caption: `In a flat machine every state while on would pair one of the four brewing states with still or frothing, like grinding · frothing, all ${frotherFlat.states - 1} pairs reachable, and every arrow between them would change one word and keep the other: the second sign. So the frother goes in a second region inside on, and on’s one POWER_OFF covers both regions. The highlighted boxes are where the machine is after POWER_ON, START and FROTH: grinding and frothing, both at once.`,
    });
    // The machine starts off; the transfer answer's events take it to grinding and frothing.
    await replay(frother, 'frother', RUNS.frother.slice(0, 3));
  }
}

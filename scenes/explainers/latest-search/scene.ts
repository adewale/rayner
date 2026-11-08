import { Scene, Transform, AnimationGroup, Succession, Cross, rushInto } from '../../../src/index.ts';
import type { Choreography, View, Transition, ExplainerMeta } from '../../../explain/index.ts';
import type { ScheduledAnimation } from '../../../src/index.ts';
import { stage, settingsOf, answerOf, Machine, view, having } from '../../../explain/index.ts';
import { story, raceTimeline, raceTracks, raceWords, tickX, trackY } from './picture.ts';
import type { RaceStep, LatestSearchState } from './picture.ts';
import { raceStart, raceNext, raceShowsStale, RACE_EVENTS } from './model.ts';
import type { CompletionOrder, RaceState, RaceEvent } from './model.ts';

// The story (script.md): the race without a guard first, then the ticket as its fix. Search A is
// the keystroke "ca", search B the latest keystroke "cat". The two timelines that show the page are
// machines: each event is a search starting or its response landing, through the same handler
// createSearch runs, so `rayner check` explores every interleaving under each rule.
export default class LatestSearchExplainer extends Scene<LatestSearchState, {}> {
  static meta = {
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/latest-search/model.ts',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then',
    ],
    // Three requests, finishing newest first: only the newest ticket publishes, and the two older ones stay stale.
    claims: [
      { says: 'publish only the latest', test: 'model.test.ts: tickets distinguish repeated query text' },
      { says: 'publish it only if its ticket is still the latest', test: 'model.test.ts: tickets distinguish repeated query text' },
      { says: 'makes every older ticket stale', test: 'model.test.ts: tickets distinguish repeated query text' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'order',
      label: 'Which search answers first',
      default: 'new-first',
      options: [
        { value: 'new-first', label: '“cat” answers first' },
        { value: 'old-first', label: '“ca” answers first' },
      ],
    },
  ];
  override async construct() {
    const order = settingsOf(this).order as CompletionOrder;
    const s = stage(this, { style: 'github-dark', headingSize: 0.6 });
    const { race, overwrite, middle, guard, events } = await story(order, answerOf(this));
    const isRace = (st: object): st is RaceState => 'log' in st && 'guarded' in st;
    /** The race a machine plays, from the scene's state: a TypeError for a staged step's state. */
    const raceOf = (st: LatestSearchState): RaceState => having(st, 'log', 'guarded');

    // Checked on every frame by rayner check, and on every explored state and transition: under the
    // guard the page never shows a result that landed after a newer search started.
    this.addInvariant('the guarded page never shows a stale result', (scene) => {
      const st: object = scene.state;
      if (!isRace(st) || !st.guarded) return;
      return raceShowsStale(st) ? `after ${st.log.join(', ')}, the guarded page shows ${st.page}, which landed after a newer search started` : true;
    });

    const together = (anims: ScheduledAnimation[]) => new AnimationGroup(anims);
    /** A response leaves its search's dot, runs down the dashed line to each page, and is published or dropped there. */
    const land = (t: Transition<LatestSearchState, RaceEvent>, c: Choreography) => {
      const before = raceOf(t.before), after = raceOf(t.after);
      const query = after.log.at(-1)!.split(' ')[0] as 'A' | 'B';
      const x = tickX(after.log.length - 1);
      const was = raceTracks(before), now = raceTracks(after);
      // The search's bar reaches the landing and its dot appears; the line drops to the pages.
      const reach = together([c.morph(`timeline-search:${query}:bar`, { runTime: 0.4 }), c.enter(`timeline-search:${query}:dot`, {}, { runTime: 0.4 })]);
      const drop = c.enter(`timeline-drop:${query}`, { create: true }, { runTime: 0.35 });
      // One copy of the response per page, each arriving at its page's top edge.
      const dot = c.to(`timeline-search:${query}:dot`);
      const arrive: ScheduledAnimation[] = [], settle: ScheduledAnimation[] = [];
      now.forEach((track, i) => {
        const key = `response:${track.key}`;
        const response = c.insert(key, dot);
        const top = dot.copy().moveTo([x, trackY(i) + 0.45]);
        // rushInto: the response gathers speed down the line and hits the page's edge at full speed, where it is published or dropped.
        arrive.push(new Succession([new Transform(response, dot.copy(), { runTime: 0.01 }), new Transform(response, top, { runTime: 0.5, rateFunc: rushInto })]));
        const published = track.page.length > was[i]!.page.length;
        if (published) {
          // Published: the page's last span ends here, and the new span takes the response's place.
          const j = track.page.length - 1;
          settle.push(c.morph(`${track.key}:span:${j - 1}`, { runTime: 0.6 }), c.enter(`${track.key}:span:${j}`, {}, { runTime: 0.6 }), c.leave(key, { runTime: 0.6 }));
        } else {
          // Dropped: the guard crosses the response out at the page's edge, and the page stays as it was.
          const cross = c.insert(`dropped:${track.key}`, new Cross(top, { stroke: s.look.bad, strokeWidth: 0.05, scale: 1.4 }));
          settle.push(new Succession([new Transform(cross, new Cross(top, { stroke: s.look.bad, strokeWidth: 0.05, scale: 1.4 }), { runTime: 0.3 }), together([c.leave(key, { runTime: 0.3 }), c.leave(`dropped:${track.key}`, { runTime: 0.3 })])]));
        }
      });
      return new Succession([reach, drop, together(arrive), together([...settle, c.rest({ runTime: 0.6 })])]);
    };
    /** A search starts: its row appears and its bar grows from the keystroke; a running bar reaches on. */
    const start = (t: Transition<LatestSearchState, RaceEvent>, c: Choreography) => {
      const after = raceOf(t.after);
      const query = after.log.at(-1)!.split(' ')[1] as 'A' | 'B';
      const bar = c.to(`timeline-search:${query}:bar`);
      const grown = c.insert(`timeline-search:${query}:bar`, bar.copy().stretch(0.02, 0, { aboutPoint: [bar.box()![0], bar.center()[1]] }));
      return new Succession([
        c.enter(`timeline-search:${query}:label`, {}, { runTime: 0.3 }),
        together([new Transform(grown, bar, { runTime: 0.5 }), c.rest({ runTime: 0.5 })]),
      ]);
    };
    /** Each event's transition, on the timeline view it plays on. */
    const transitionOn = (timeline: View) =>
      Object.fromEntries(RACE_EVENTS.map((e) => [e, (t: Transition<LatestSearchState, RaceEvent>) => (e.startsWith('start') ? start : land)(t, t.choreograph(timeline))]));

    /** One machine per rule, each with its own timeline view: the race's events, under that rule's handler. */
    const raceMachine = (guarded: boolean) => {
      const timeline = view(this, (st) => raceTimeline(s, isRace(st) ? st : raceStart(guarded)), { place: false });
      const machine = new Machine<LatestSearchState, RaceEvent>(this, {
        start: raceStart(guarded),
        events: RACE_EVENTS,
        next: (st, event) => raceNext(raceOf(st), event),
        views: [timeline],
        transition: transitionOn(timeline),
        runTime: ({ event }) => (event.startsWith('start') ? 0.8 : 1.86),
      });
      return { timeline, machine };
    };
    const off = raceMachine(false), on = raceMachine(true);
    /** A step whose timeline a machine plays: the race starts empty and the scenario's events play through it. */
    const played = async (words: RaceStep, { timeline, machine }: { timeline: View; machine: Machine<LatestSearchState, RaceEvent> }, guarded: boolean) => {
      await this.step(words.id, { title: words.title, line: words.line, caption: words.caption, kind: 'short' });
      await s.clear({ runTime: 0.18 });
      this.state = { ...raceStart(guarded) };
      timeline.rebuild();
      s.opening(timeline);
      await s.enter(timeline, { runTime: 0.24, describe: () => raceWords(raceOf(this.state)) });
      await this.play(machine.replay(events));
    };

    await s.steps([race], { kind: 'short' });
    await played(overwrite, off, false);
    await s.steps(middle, { kind: 'short' });
    await played(guard, on, true);
  }
}

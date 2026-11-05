import { Scene, Transform, AnimationGroup, Succession, Cross, Machine, choreograph, view } from '../../../src/index.ts';
import type { Mobject, ScheduledAnimation, Choreography, View, Transition, SceneState } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { emphasises } from '../../../explain/look.ts';
import { story, ANSWER, raceTimeline, raceTracks, raceWords, tickX, trackY } from '../lib/readers/latest-search.ts';
import type { RaceStep } from '../lib/readers/latest-search.ts';
import { raceStart, raceNext, raceShowsStale, RACE_EVENTS } from '../lib/latest-search.ts';
import type { CompletionOrder, RaceState, RaceEvent } from '../lib/latest-search.ts';

// The story (script.md): the race without a guard first, then the ticket as its fix. Search A is
// the keystroke "ca", search B the latest keystroke "cat". The two timelines that show the page are
// machines: each event is a search starting or its response landing, through the same handler
// createSearch runs, so `rayner check` explores every interleaving under each rule.
export default class LatestSearchExplainer extends Scene {
  static meta = {
    id: 'latest-search',
    title: 'Why can an older search replace the latest result?',
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/latest-search.ts',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then',
    ],
    // check holds the overwrite step to stating the answer, in both completion orders.
    answer: ANSWER,
    // Three requests, finishing newest first: only the newest ticket publishes, and the two older ones stay stale.
    claims: [
      { says: 'publish only the latest', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
      { says: 'publish it only if its ticket is still the latest', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
      { says: 'makes every older ticket stale', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
    ],
    checks: [
      {
        question: 'The user types “ca”, then “cat”, then “ca” again, starting requests with tickets 1, 2 and 3. Request 3 finishes first; request 1 finishes last. Should request 1 be published because its query text matches the current input?',
        answer: 'No. The current request is ticket 3. Ticket 1 is an older request even though its text is also “ca”; it may contain older data. Compare request tickets, not query strings, and leave request 3’s result on the page.',
      },
      {
        question: 'Suppose the newest request fails, then an older successful request arrives. Does the ticket guard publish the older result as a fallback?',
        answer: 'No. Its ticket is still stale. The guard enforces which request may publish; it does not choose a fallback or handle the newest request’s error. An application needs an explicit error or fallback policy.',
      },
    ],
  };
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
    const { race, overwrite, middle, guard, events } = await story(order);
    const isRace = (st: object): st is RaceState => 'log' in st && 'guarded' in st;

    // Checked on every frame by rayner check, and on every explored state and transition: under the
    // guard the page never shows a result that landed after a newer search started.
    this.addInvariant('the guarded page never shows a stale result', (scene) => {
      const st = scene.state as object;
      if (!isRace(st) || !st.guarded) return;
      return raceShowsStale(st) ? `after ${st.log.join(', ')}, the guarded page shows ${st.page}, which landed after a newer search started` : true;
    });

    const together = (anims: ScheduledAnimation[]) => new AnimationGroup(anims);
    /** A response leaves its search's dot, runs down the dashed line to each page, and is published or dropped there. */
    const land = ({ before, after }: Transition<RaceState, RaceEvent>, c: Choreography) => {
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
        arrive.push(new Succession([new Transform(response, dot.copy(), { runTime: 0.01 }), new Transform(response, top, { runTime: 0.5 })]));
        const published = track.page.length > was[i]!.page.length;
        if (published) {
          // Published: the page's last span ends here, and the new span takes the response's place.
          const j = track.page.length - 1;
          settle.push(c.morph(`${track.key}:span:${j - 1}`, { runTime: 0.6 }), c.enter(`${track.key}:span:${j}`, {}, { runTime: 0.6 }), c.leave(key, { runTime: 0.6 }));
        } else {
          // Dropped: the guard crosses the response out at the page's edge, and the page stays as it was.
          const cross = c.insert(`dropped:${track.key}`, new Cross(top, { stroke: s.bad, strokeWidth: 0.05, scale: 1.4 }));
          settle.push(new Succession([new Transform(cross, new Cross(top, { stroke: s.bad, strokeWidth: 0.05, scale: 1.4 }), { runTime: 0.3 }), together([c.leave(key, { runTime: 0.3 }), c.leave(`dropped:${track.key}`, { runTime: 0.3 })])]));
        }
      });
      return new Succession([reach, drop, together(arrive), together([...settle, c.rest({ runTime: 0.6 })])]);
    };
    /** A search starts: its row appears and its bar grows from the keystroke; a running bar reaches on. */
    const start = ({ after }: Transition<RaceState, RaceEvent>, c: Choreography) => {
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
      Object.fromEntries(RACE_EVENTS.map((e) => [e, (t: Transition<RaceState, RaceEvent>) => (e.startsWith('start') ? start : land)(t, t.choreograph(timeline))])) as unknown as Record<RaceEvent, (t: Transition<RaceState, RaceEvent>) => ScheduledAnimation>;

    /** One machine per rule, each with its own timeline view: the race's events, under that rule's handler. */
    const raceMachine = (guarded: boolean) => {
      const timeline = view(this, (st) => raceTimeline(s, (isRace(st) ? st : raceStart(guarded)) as RaceState), { place: false });
      const machine = new Machine<RaceState, RaceEvent>(this, {
        start: raceStart(guarded),
        events: RACE_EVENTS,
        next: raceNext,
        views: [timeline],
        transition: transitionOn(timeline),
        runTime: ({ event }) => (event.startsWith('start') ? 0.8 : 1.86),
      });
      return { timeline, machine };
    };
    const off = raceMachine(false), on = raceMachine(true);
    // What a timeline marks, as emphasis the phone's close-ups visit first and review holds to the
    // caption: each page span outlined in red, a stale result on the page. Read from state.
    emphasises(this, () => {
      const st = this.state as object;
      if (!isRace(st)) return [];
      const v = st.guarded ? on.timeline : off.timeline, out: [Mobject, string][] = [];
      for (const track of raceTracks(st))
        track.page.forEach((span, j) => {
          const m = span.stale ? v.current.find(`${track.key}:span:${j}`) : undefined;
          if (m) out.push([m, `${track.name}: stale ${span.shown}`]);
        });
      return out;
    });
    /** A step whose timeline a machine plays: the race starts empty and the scenario's events play through it. */
    const played = async (words: RaceStep, { timeline, machine }: { timeline: View; machine: Machine<RaceState, RaceEvent> }, guarded: boolean) => {
      await this.step(words.id, { title: words.title, line: words.line, caption: words.caption, kind: 'short' });
      await s.clear({ runTime: 0.18 });
      this.state = { ...raceStart(guarded) } as unknown as SceneState;
      timeline.rebuild();
      s.opening(timeline);
      await s.enter(timeline, { runTime: 0.24, describe: () => raceWords(this.state as unknown as RaceState) });
      await this.play(machine.replay(events));
    };

    await s.steps([race], { kind: 'short' });
    await played(overwrite, off, false);
    await s.steps(middle, { kind: 'short' });
    await played(guard, on, true);
  }
}

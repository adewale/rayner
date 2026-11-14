import { frames as readerFrames, RING, drawSessionCard, reducerSpans, drawTrails, drawRing, drawReading, walkToken } from './picture.ts';
import { Scene, Text, FadeIn, Create, Transform, AnimationGroup, Succession, keyed } from '../../../src/index.ts';
import type { Animation } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, answerOf, Machine, view } from '../../../explain/index.ts';
import { code } from '../../../explain/drawing.ts';
import type { Card, CodeBlock } from '../../../explain/drawing.ts';
import type { View, Choreography, Transition, ExplainerMeta } from '../../../explain/index.ts';
import { reduceSession, sessionStart, sessionNext, SESSION_EVENTS } from './model.ts';
import type { SessionState, SessionEvent } from './model.ts';
const SOURCE =
  'stateDiagram-v2\n direction LR\n idle --> connecting: CONNECT\n connecting --> open: OPENED\n connecting --> closed: ERROR\n open --> closed: CLOSE';
// The reducer in ./model.ts, as the reader sees it.
const REDUCER = [
  'const next = {',
  "  'idle:CONNECT':      'connecting',",
  "  'connecting:OPENED': 'open',",
  "  'connecting:ERROR':  'closed',",
  "  'open:CLOSE':        'closed',",
  '};',
  'function reduceSession(state, event) {',
  '  const result = next[`${state}:${event}`];',
  '  if (!result) throw new InvalidTransition();',
  '  return result;',
  '}',
];
const THROW = 8;
const DIAGRAM = regionBox('top', { bottom: 0.2 }),
  CODE = regionBox('full', { right: 2.05, top: -0.05 }),
  CARD = regionBox('full', { left: 2.35, top: -0.05 });
export default class StateMachineExplainer extends Scene<SessionState, {}> {
  static meta = {
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/state-machine.ts'],
    claims: [
      {
        says: 'accepts an event only in a state that has a row for it',
        test: 'model.test.ts: both session histories come from the reducer; closed rejects all modeled events',
      },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'events',
      label: 'Session history',
      default: 'success',
      options: [
        { value: 'success', label: 'Connect then close' },
        { value: 'failure', label: 'Connection fails' },
      ],
    },
  ];
  /** The Session card, rebuilt from scene.state at every sync. */
  readout!: View<Card>;
  override async construct() {
    const which = settingsOf(this).events,
      s = stage(this, { headingSize: 0.6, style: 'dracula' });
    await readerFrames(s, which!, answerOf(this), { kind: 'short' });
    await this.step('machine', {
      kind: 'detail',
      title: 'Four reducer rows, one per arrow',
      line: 'The session starts idle; a pair with no row throws.',
      caption:
        'The ring marks the current state. Each arrow corresponds to a defined state-and-event pair in the reducer table. This reducer rejects a pair with no row by throwing an error; another machine could choose to ignore that event instead.',
    });
    await s.clear();
    const d = await s.show({ source: SOURCE }, { box: DIAGRAM });
    const start = sessionStart();
    this.state = { ...start };
    // The reducer's code is a view of the state too: its lit bar is on the table until the
    // first event arrives, when the box on one row takes over.
    const codeView = view(
      this,
      (st) => {
        // At 0.19 the throw line, the widest, fits whole in one of the live step's phone close-ups, where it reads 13 px.
        const panel = code(s, REDUCER, { at: CODE, size: 0.19, lit: st.event == null ? { lines: [1, 4] } : null, key: 'code' });
        // The table's rows and the throw are keyed by what they mean, not by their text as the key option
        // keys them: scene.review.json and the embed tests target these keys.
        ['idle:CONNECT', 'connecting:OPENED', 'connecting:ERROR', 'open:CLOSE'].forEach((row, i) => {
          keyed(panel.code.lines[i + 1]!, `reducer:${row}`);
        });
        keyed(panel.code.lines[THROW]!, 'reducer:throw');
        return panel;
      },
      { place: false },
    );
    const codeLines = () => (codeView.current as CodeBlock).code.lines;
    await s.enter(codeView, { runTime: 0.4 });
    // The card shows the state, not a copy of it: each sync rebuilds it from scene.state.
    const readout = (this.readout = view(this, (st) => drawSessionCard(s, st, CARD), { place: false }));
    // The card describes itself, its lit row included.
    s.keep(readout);

    // What the machine marks on the diagram and the reducer, drawn from the session's state: the
    // ring on the state it is in, the links it travelled, and the row it read or the throw it hit.
    const rowOf = (row: string) => REDUCER.findIndex((l) => l.includes(`'${row}'`));
    const spans = reducerSpans((codeView.current as CodeBlock).code, REDUCER, THROW);
    const session = () => this.state;
    // Three pictures of the session's state, each its own view so each change is its own region.
    // The drawn diagram takes the live one's place: the live diagram leaves the stage, still the
    // source of geometry and of the diagram's description, and the reader sees the state's picture.
    const diagram = view(this, (st) => drawTrails(d, st), { place: false });
    const ring = view(this, (st) => drawRing(d, st), { place: false });
    const reducer = view(this, (st) => drawReading(st, spans), { place: false });
    // The diagram picture says its travelled links itself.
    s.keep(diagram);
    s.keep(ring, { describe: () => `A ring around ${session().session}, the state the session is in` });
    s.keep(reducer, {
      describe: () => {
        const st = session();
        if (st.row) return `A box around line ${rowOf(st.row) + 1} of the reducer: '${st.row}': '${REDUCER[rowOf(st.row)]!.split("'")[3]}', the row the reducer reads, in the ring's colour`;
        if (st.invalid) return `A box around line ${THROW + 1} of the reducer: the throw, in red, since no row matches ${st.session}:${st.event}`;
        return '';
      },
    });
    await this.play(new FadeIn(readout, { runTime: 0.35, shift: [0, -0.08] }));
    this.add(diagram, reducer, ring);
    d.showBy(diagram);
    await this.play(new Create(ring.current.find(`session:ring:${start.session}`)!, { runTime: RING.runTime }));

    /** The card's value for `field` crossfades to its new text. */
    const swap = (k: Choreography, field: string, runTime: number): Animation[] =>
      k.from(`session:${field}`) && (k.from(`session:${field}`) as Text).text !== (k.to(`session:${field}`) as Text).text
        ? [k.leave(`session:${field}`, { runTime }), k.enter(`session:${field}`, {}, { runTime })]
        : [];
    /** The last event's lit row, or the throw when `keepThrow` is false, is put back. */
    const putBack = (c: Choreography, before: SessionState, keepThrow = false): Animation[] => [
      ...(before.row ? [c.leave(`reducer:lit:${before.row}`, { runTime: 0.4 }), c.leave(`reducer:box:${before.row}`, { runTime: 0.4 })] : []),
      ...(before.invalid && !keepThrow ? [c.leave('reducer:throw-lit', { runTime: 0.4 }), c.leave('reducer:throw-box', { runTime: 0.4 })] : []),
    ];
    /** Bring a part in unless it is already there (a throw after a throw stays lit). */
    const show = (c: Choreography, key: string, how: { create?: boolean }, runTime: number): Animation[] =>
      c.has(key, 'from') ? [] : [c.enter(key, how, { runTime })];
    const machine = new Machine<SessionState, SessionEvent>(this, {
      start,
      events: SESSION_EVENTS,
      next: sessionNext,
      views: [diagram, ring, reducer, readout, codeView],
      // An event the table has a row for walks the link (3.7 s); a throw only lights the throw (1.4 s).
      runTime: ({ after }) => (after.invalid ? 1.35 : 3.66),
      transition: Object.fromEntries(
        SESSION_EVENTS.map((event) => [
          event,
          (t: Transition<SessionState, SessionEvent>) => {
            const { before, after } = t;
            const g = t.choreograph(diagram), o = t.choreograph(ring), c = t.choreograph(reducer), k = t.choreograph(readout), p = t.choreograph(codeView);
            // The focus bar on the table gives way to the box on one row as the first event arrives.
            const unfocus = p.morph('code:bar', { runTime: 0.4 });
            if (after.invalid) {
              // No row: the card shows the event and the throw, and the throw lights.
              return new Succession([
                new AnimationGroup([...swap(k, 'event', 0.45), ...swap(k, 'returns', 0.45), k.morph('session:bar', { runTime: 0.45 }), ...putBack(c, before, true), unfocus]),
                ...show(c, 'reducer:throw-lit', {}, 0.4),
                ...show(c, 'reducer:throw-box', { create: true }, 0.5),
                new AnimationGroup([g.rest({ runTime: 0.01 }), o.rest({ runTime: 0.01 }), c.rest({ runTime: 0.01 }), k.rest({ runTime: 0.01 }), p.rest({ runTime: 0.01 })]),
              ]);
            }
            // The event arrives on the card, the last lit row is put back, the row lights and is
            // boxed, the ring leaves its state, a token walks the link and leaves a trail, and the
            // ring goes where the reducer's answer says the session now is.
            const barAtEvent = k.to('session:bar').copy().moveTo([k.to('session:bar').center()[0], (k.to('session:event') as Text).anchorPoint()[1]]);
            const bar = k.own('session:bar'), link = d.link(before.session, after.session);
            const walk = g.travel('walk:token', walkToken(d), link.route, { appear: 0.18, move: 0.8, leave: 0.18 });
            return new Succession([
              new AnimationGroup([...swap(k, 'event', 0.45), new Transform(bar, barAtEvent, { runTime: 0.45 }), ...putBack(c, before), unfocus]),
              c.enter(`reducer:lit:${after.row}`, {}, { runTime: 0.4 }),
              c.enter(`reducer:box:${after.row}`, { create: true }, { runTime: 0.5 }),
              o.leave(`session:ring:${before.session}`, { runTime: 0.35 }),
              walk.appear,
              new AnimationGroup([walk.move, g.morph('diagram', { runTime: 0.8 })]),
              walk.leave,
              new AnimationGroup([
                o.enter(`session:ring:${after.session}`, { create: true }, { runTime: 0.8 }),
                ...swap(k, 'state', 0.8),
                ...swap(k, 'returns', 0.8),
                new Transform(bar, k.to('session:bar'), { runTime: 0.8 }),
                g.rest({ runTime: 0.8 }),
                o.rest({ runTime: 0.8 }),
                c.rest({ runTime: 0.8 }),
                k.rest({ runTime: 0.8 }),
                p.rest({ runTime: 0.8 }),
              ]),
            ]);
          },
        ]),
      ),
    });

    const events: SessionEvent[] = which === 'success' ? ['CONNECT', 'OPENED', 'CLOSE'] : ['CONNECT', 'ERROR'];
    let state = start.session;
    for (const event of events) {
      const next = reduceSession(state, event);
      await this.step(event.toLowerCase(), {
        kind: 'detail',
        title: `${event}: ${state} → ${next}`,
        line: `Row ${state}:${event} returns ${next}, and the ring moves there.`,
        caption: `${event} arrives while the session is ${state}. The reducer finds the boxed row ${state}:${event} and returns ${next}, where the ring now sits.`,
      });
      await this.play(machine.replay([event]));
      state = next;
    }
    await this.step('terminal', {
      kind: 'detail',
      title: 'Closed has no row, so OPENED throws',
      line: `The reducer, reduceSession, throws InvalidTransition; the ring stays on ${state}.`,
      caption:
        'No row starts at closed. A late OPENED finds no closed:OPENED entry, so reduceSession throws InvalidTransition at the boxed line and the ring stays on closed.',
    });
    await this.play(machine.replay(['OPENED']));
    s.opening(...codeLines().slice(1, 5), codeLines()[THROW]!, diagram.current.find('diagram')!, ring.current.find(`session:ring:${state}`)!, readout.current);
  }
}

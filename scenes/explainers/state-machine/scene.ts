import { frames as readerFrames, ANSWER } from '../lib/readers/state-machine.ts';
import {
  Scene,
  Text,
  Group,
  Dot,
  VMobject,
  FadeIn,
  Create,
  Transform,
  AnimationGroup,
  Succession,
  SurroundingRectangle,
  Machine,
  choreograph,
  view,
} from '../../../src/index.ts';
import type { Animation, MatchKey, Mobject, SceneState, View, CodeSpan, Choreography, Transition } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card } from '../../../explain/index.ts';
import { reduceSession, sessionAttempt, sessionStart, sessionNext, SESSION_EVENTS } from '../lib/models.ts';
import type { SessionState, SessionEvent } from '../lib/models.ts';
const SOURCE =
  'stateDiagram-v2\n direction LR\n idle --> connecting: CONNECT\n connecting --> open: OPENED\n connecting --> closed: ERROR\n open --> closed: CLOSE';
// The reducer in scenes/explainers/lib/models.ts, as the reader sees it.
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
/** The first check question, asked of the reducer: CONNECT while open. */
const SECOND_CONNECT = sessionAttempt('open', 'CONNECT');
const DIAGRAM = regionBox('top', { bottom: 0.2 }),
  CODE = regionBox('full', { right: 2.05, top: -0.05 }),
  CARD = regionBox('full', { left: 2.35, top: -0.05 });
// One colour says "the machine is here": the ring on the diagram and the row in the code.
const NOW = '#f1fa8c',
  REJECT = '#ff5555';
const RING = { keep: true, color: NOW, buff: 0.07, cornerRadius: 0.08, strokeWidth: 0.03, runTime: 0.8 };
/** Recolour a span's glyphs in the time given: a Transform of its line to a recoloured copy. */
const recolor = (span: CodeSpan, color: string, runTime = 0.4): Transform => {
  const target = span.owner.copy();
  for (const g of span.children) target.children[span.owner.children.indexOf(g)]!.setFill(color);
  return new Transform(span.owner, target, { runTime });
};
// Readout glyphs pair only with the same text in the same row, so a changed value
// crossfades and everything else stays still; the panel and its bar pair by shape.
/** The card row the bar lights: the error, the new state, or the event that just arrived. */
const litRow = (st: SceneState) => (st.invalid ? 'Returns' : st.returns ? 'State' : st.event ? 'Event' : null);
const sameRow: MatchKey = (p) => {
  const t = p.parent;
  if (t instanceof Text)
    return `${Math.round(t.anchorPoint()[1] * 100)} ${t.text} ${(p as { cluster?: number }).cluster}`;
  return p instanceof VMobject ? 'shape ' + p.shapeKey() : undefined;
};
export default class StateMachineExplainer extends Scene {
  static meta = {
    id: 'state-machine',
    title: 'Which events can change this session?',
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/state-machine.ts'],
    answer: ANSWER,
    claims: [
      {
        says: 'accepts an event only in a state that has a row for it',
        test: 'test/explain-models.test.ts: both session histories come from the reducer; closed rejects all modeled events',
      },
    ],
    checks: [
      {
        question: 'In the success history, a second CONNECT arrives while the session is open. What does the reducer do?',
        answer: `It ${SECOND_CONNECT.error ? `throws ${SECOND_CONNECT.error} and the session stays open` : `returns ${SECOND_CONNECT.state}`}, because the table has no open:CONNECT row. An event name the machine knows is still refused in a state with no row for it.`,
      },
      {
        question: 'You add one row, connecting:CLOSE → closed, so a user can cancel while connecting. Can the late OPENED that follows the cancel reopen the session?',
        answer: 'No. The cancel moves the session to closed, and closed still has no OPENED row, so the late OPENED still throws. The new row changes which events reach closed, not what closed accepts.',
      },
      {
        question: 'A new state, reconnecting, gets a row reconnecting:OPENED → open. A late OPENED from the abandoned first attempt arrives while the session is reconnecting. What happens, and what does that say about the table?',
        answer: 'The row exists, so the session moves to open on the old attempt’s reply. The table matches states and event names; it cannot tell which attempt an OPENED came from. Telling them apart needs something the event carries, such as an attempt number, which this reducer does not model.',
      },
    ],
  };
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
    await s.steps(readerFrames(which!), { kind: 'short' });
    await this.step('machine', {
      kind: 'detail',
      title: 'Four reducer rows, one per arrow',
      line: 'The session starts idle; a pair with no row throws.',
      caption:
        'The ring marks the current state. Each arrow corresponds to a defined state-and-event pair in the reducer table. This reducer rejects a pair with no row by throwing an error; another machine could choose to ignore that event instead.',
    });
    await s.clear();
    const d = await s.show({ source: SOURCE }, { box: DIAGRAM });
    const code = await s.code(REDUCER, { at: CODE, fontSize: 0.195 });
    ['idle:CONNECT', 'connecting:OPENED', 'connecting:ERROR', 'open:CLOSE'].forEach((row, i) => {
      code.code.lines[i + 1]!.key = `reducer:${row}`;
    });
    code.code.lines[THROW]!.key = 'reducer:throw';
    const start = sessionStart();
    this.state = { ...start } as unknown as SceneState;
    // The card shows the state, not a copy of it: each sync rebuilds it from scene.state.
    const readout = (this.readout = view(
      this,
      (st: SceneState) => {
        const card = new Card(
          this,
          s.palette,
          [
            ['State', st.session],
            ['Event', st.event ?? '–'],
            ['Returns', st.returns ?? (st.event ? '…' : '–')],
          ],
          // The row the session last changed is lit, drawn with the card: described and emphasised with it.
          { at: CARD, fontSize: 0.28, width: 4.8, lit: litRow(st) },
        );
        for (const field of ['State', 'Event', 'Returns'])
          card.values.get(field)!.key = `session:${field.toLowerCase()}`;
        card.bar.key = 'session:bar';
        return card;
      },
      { place: false },
    ));
    // The card describes itself, its lit row included.
    s.keep(readout);

    // What the machine marks on the diagram and the reducer, drawn from the session's state: the
    // ring on the state it is in, the links it travelled, and the row it read or the throw it hit.
    // A lit row is the row's glyphs again, in the ring's colour, over the code.
    const rowOf = (row: string) => REDUCER.findIndex((l) => l.includes(`'${row}'`));
    const rowSpan = (row: string) => {
      const line = rowOf(row), next = REDUCER[line]!.split("'")[3]!;
      return code.code.span(line, code.code.token(line, `'${row}'`).from, code.code.token(line, `'${next}'`).to);
    };
    const thrown = () => code.code.span(THROW, code.code.token(THROW, 'if').from, REDUCER[THROW]!.length);
    const lit = (span: CodeSpan, color: string) => new Group(...span.children.map((g) => g.copy().setFill(color)));
    const boxOf = (span: CodeSpan, color: string) =>
      new SurroundingRectangle(span.box()!, { buff: 0.035, cornerRadius: 0.04, stroke: color, strokeWidth: 0.02 });
    // Three pictures of the session's state, each its own view so each change is its own region:
    // the diagram with its travelled links in the trail's colour, the ring on the state the
    // session is in, and the reducer row it read (or the throw it hit), lit and boxed.
    const keyed = (m: Mobject, key: string) => Object.assign(m, { key });
    const trails = (st: SessionState) => new Group(keyed(d.picture(Object.fromEntries(st.travelled.map((l) => { const [from, to] = l.split(':'); return [d.link(from!, to!).id, d.accent]; }))), 'diagram'));
    const ringOf = (st: SessionState) => new Group(keyed(new SurroundingRectangle(d.get(st.session), { buff: RING.buff, cornerRadius: RING.cornerRadius, stroke: NOW, strokeWidth: RING.strokeWidth }), `session:ring:${st.session}`));
    const reading = (st: SessionState) => {
      const parts: Mobject[] = [];
      if (st.row) parts.push(keyed(lit(rowSpan(st.row), NOW), `reducer:lit:${st.row}`), keyed(boxOf(rowSpan(st.row), NOW), `reducer:box:${st.row}`));
      if (st.invalid) parts.push(keyed(lit(thrown(), REJECT), 'reducer:throw-lit'), keyed(boxOf(thrown(), REJECT), 'reducer:throw-box'));
      return new Group(...parts);
    };
    const session = () => this.state as unknown as SessionState;
    // The drawn diagram takes the live one's place: the live diagram leaves the stage, still the
    // source of geometry and of the diagram's description, and the reader sees the state's picture.
    const diagram = view(this, (st) => trails(st as unknown as SessionState), { place: false });
    const ring = view(this, (st) => ringOf(st as unknown as SessionState), { place: false });
    const reducer = view(this, (st) => reading(st as unknown as SessionState), { place: false });
    s.keep(diagram, { describe: () => session().travelled.length ? `Travelled: ${session().travelled.map((l) => { const [from, to, event] = l.split(':'); return `${from} → ${to}: ${event}`; }).join('; ')}` : '' });
    s.keep(ring, { describe: () => `A ring around ${session().session}, the state the session is in` });
    s.keep(reducer, {
      describe: () => {
        const st = session();
        if (st.row) return `A box around line ${rowOf(st.row) + 1} of the reducer: '${st.row}': '${REDUCER[rowOf(st.row)]!.split("'")[3]}', the row the reducer reads, in the ring's colour`;
        if (st.invalid) return `A box around line ${THROW + 1} of the reducer: the throw, in red, since no row matches ${st.session}:${st.event}`;
        return '';
      },
    });
    // What the views mark, as emphasis the phone's close-ups visit first and review holds to the
    // caption: the ring, the row read or the throw hit, and each link travelled, read from state.
    s.emphasise(() => {
      const st = session();
      return [
        [`session:ring:${st.session}`, `ring: ${st.session}`],
        ...(st.row ? [[`reducer:box:${st.row}`, `row: ${st.row}`] as const] : []),
        ...(st.invalid ? [['reducer:throw-box', `throw: ${st.session}:${st.event}`] as const] : []),
        ...st.travelled.map((l) => { const [from, to] = l.split(':'); return [d.link(from!, to!).id, 'travelled'] as const; }),
      ];
    });
    await this.play(new FadeIn(readout, { runTime: 0.35, shift: [0, -0.08] }));
    this.add(diagram, reducer, ring);
    this.remove(d.root);
    d.showBy(diagram);
    await this.play(new Create(ring.current.find(`session:ring:${start.session}`)!, { runTime: RING.runTime }));
    await code.focus([1, 4]);

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
      views: [diagram, ring, reducer, readout],
      // An event the table has a row for walks the link (3.7 s); a throw only lights the throw (1.4 s).
      runTime: ({ after }) => (after.invalid ? 1.35 : 3.66),
      transition: Object.fromEntries(
        SESSION_EVENTS.map((event) => [
          event,
          (t: Transition<SessionState, SessionEvent>) => {
            const { before, after } = t;
            const g = t.choreograph(diagram), o = t.choreograph(ring), c = t.choreograph(reducer), k = t.choreograph(readout);
            if (after.invalid) {
              // No row: the card shows the event and the throw, and the throw lights.
              return new Succession([
                new AnimationGroup([...swap(k, 'event', 0.45), ...swap(k, 'returns', 0.45), k.morph('session:bar', { runTime: 0.45 }), ...putBack(c, before, true)]),
                ...show(c, 'reducer:throw-lit', {}, 0.4),
                ...show(c, 'reducer:throw-box', { create: true }, 0.5),
                new AnimationGroup([g.rest({ runTime: 0.01 }), o.rest({ runTime: 0.01 }), c.rest({ runTime: 0.01 }), k.rest({ runTime: 0.01 })]),
              ]);
            }
            // The event arrives on the card, the last lit row is put back, the row lights and is
            // boxed, the ring leaves its state, a token walks the link and leaves a trail, and the
            // ring goes where the reducer's answer says the session now is.
            const barAtEvent = k.to('session:bar').copy().moveTo([k.to('session:bar').center()[0], (k.to('session:event') as Text).anchorPoint()[1]]);
            const bar = k.own('session:bar'), link = d.link(before.session, after.session);
            const walk = g.travel('walk:token', new Dot({ radius: 0.08, color: d.accent }), link.route, { appear: 0.18, move: 0.8, leave: 0.18 });
            return new Succession([
              new AnimationGroup([...swap(k, 'event', 0.45), new Transform(bar, barAtEvent, { runTime: 0.45 }), ...putBack(c, before)]),
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
              ]),
            ]);
          },
        ]),
      ) as unknown as Record<SessionEvent, (t: Transition<SessionState, SessionEvent>) => Animation | AnimationGroup>,
    });

    const events: SessionEvent[] = which === 'success' ? ['CONNECT', 'OPENED', 'CLOSE'] : ['CONNECT', 'ERROR'];
    let state = start.session;
    for (const [i, event] of events.entries()) {
      const next = reduceSession(state, event);
      await this.step(event.toLowerCase(), {
        kind: 'detail',
        title: `${event}: ${state} → ${next}`,
        line: `Row ${state}:${event} returns ${next}, and the ring moves there.`,
        caption: `${event} arrives while the session is ${state}. The reducer finds the boxed row ${state}:${event} and returns ${next}, where the ring now sits.`,
      });
      // The focus bar on the table gives way to the box on one row.
      if (i === 0) await code.focus(null);
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
    s.opening(...code.code.lines.slice(1, 5), code.code.lines[THROW]!, diagram.current.find('diagram')!, ring.current.find(`session:ring:${state}`)!, readout.current);
  }
}

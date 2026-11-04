import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames, ANSWER } from '../lib/readers/state-machine.ts';
import {
  Scene,
  Text,
  VMobject,
  FadeIn,
  FadeOut,
  Create,
  Transform,
  AnimationGroup,
  Succession,
  Restore,
  Circumscribe,
  SurroundingRectangle,
  view,
} from '../../../src/index.ts';
import type { Animation, MatchKey, SceneState, View, CodeSpan } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { Card } from '../../../explain/panels.ts';
import { reduceSession, sessionAttempt } from '../lib/models.ts';
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
    await readerFirst(this, s, readerFrames(which!));
    await this.step('machine', {
      detail: true,
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
    let state = 'idle';
    this.state.session = state;
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
          { at: CARD, fontSize: 0.28, width: 4.8 },
        );
        for (const field of ['State', 'Event', 'Returns'])
          card.values.get(field)!.key = `session:${field.toLowerCase()}`;
        const lit = litRow(st);
        if (lit) card.bar.moveTo([card.panel.center()[0], card.values.get(lit)!.anchorPoint()[1]]).setOpacity(1);
        return card;
      },
      { place: false },
    ));
    s.keep(readout, {
      describe: () => {
        const lit = litRow(this.state);
        return `The session card: ${[...readout.current.values]
          .map(([label, v]) => `${label}: ${v.text}${label === lit ? ' (marked)' : ''}`)
          .join(', ')}`;
      },
    });
    await this.play(new FadeIn(readout, { runTime: 0.35, shift: [0, -0.08] }));
    // The ring stays on the state the session is in; each new ring is kept with the same words.
    const ringWords = () => `A ring around ${state}, the state the session is in`;
    let ring = new Circumscribe(d.get(state), RING);
    ring.outline.key = `session:ring:${state}`;
    s.keep(ring.outline, { describe: ringWords });
    await this.play(ring);
    await code.focus([1, 4]);
    // Each line's plain style, so the row lit for one event can be put back when the next arrives.
    for (const l of code.code.lines) l.saveState();
    let lit: { line: Text; box: SurroundingRectangle } | null = null;
    /** A box on a span of reducer line `i`, kept with words that say what the boxed code means. */
    const boxLine = (span: CodeSpan, i: number, color: string, says: string) =>
      s.keep(
        new SurroundingRectangle(span.box()!, { buff: 0.035, cornerRadius: 0.04, stroke: color, strokeWidth: 0.02 }),
        { describe: `A box around line ${i + 1} of the reducer: ${says}` },
      );
    const putBack = (): Animation[] =>
      lit ? [new Restore(lit.line, { runTime: 0.4 }), new FadeOut(lit.box, { runTime: 0.4 })] : [];
    const sync = () => readout.sync({ match: sameRow, runTime: 0.45 });

    const events = which === 'success' ? ['CONNECT', 'OPENED', 'CLOSE'] : ['CONNECT', 'ERROR'];
    for (const event of events) {
      const next = reduceSession(state, event);
      await this.step(event.toLowerCase(), {
        detail: true,
        title: `${event}: ${state} → ${next}`,
        line: `Row ${state}:${event} returns ${next}, and the ring moves there.`,
        caption: `${event} arrives while the session is ${state}. The reducer finds the boxed row ${state}:${event} and returns ${next}, where the ring now sits.`,
      });
      // The row the reducer reads, found by its key; the value on it must be what reduceSession returned.
      const line = REDUCER.findIndex((l) => l.includes(`'${state}:${event}'`));
      const key = code.code.token(line, `'${state}:${event}'`),
        value = code.code.token(line, `'${next}'`);
      const row = code.code.span(line, key.from, value.to);
      this.state.event = event;
      this.state.returns = null;
      // The focus bar on the table gives way to the box on one row.
      if (!lit) await code.focus(null);
      // The event arrives: last event's row is put back and the card shows the event.
      const arrive: Animation[] = [sync(), ...putBack()];
      const box = boxLine(
        row,
        line,
        NOW,
        `'${state}:${event}': '${next}', the row the reducer reads, in the ring's colour`,
      );
      lit = { line: code.code.lines[line]!, box };
      // Then the row lights, and the machine leaves its state.
      await this.play(
        new Succession([
          new AnimationGroup(arrive),
          recolor(row, NOW),
          new Create(box, { runTime: 0.5 }),
          new FadeOut(ring.outline, { runTime: 0.35 }),
        ]),
      );
      await d.walk([[state, next]], { trail: true });
      state = next;
      this.state.session = state;
      this.state.returns = next;
      // The ring goes where the reducer's answer says the session now is.
      ring = new Circumscribe(d.get(state), RING);
      ring.outline.key = `session:ring:${state}`;
      s.keep(ring.outline, { describe: ringWords });
      await this.play(ring, sync());
    }
    await this.step('terminal', {
      detail: true,
      title: 'Closed has no row, so OPENED throws',
      line: `The reducer, reduceSession, throws InvalidTransition; the ring stays on ${state}.`,
      caption:
        'No row starts at closed. A late OPENED finds no closed:OPENED entry, so reduceSession throws InvalidTransition at the boxed line and the ring stays on closed.',
    });
    const invalid = sessionAttempt(state, 'OPENED');
    this.state.invalid = invalid;
    this.state.event = 'OPENED';
    this.state.returns = invalid.error ?? invalid.state;
    const thrown = code.code.span(THROW, code.code.token(THROW, 'if').from, REDUCER[THROW]!.length);
    const throwBox = boxLine(thrown, THROW, REJECT, `the throw, in red, since no row matches ${state}:OPENED`);
    throwBox.key = 'reducer:throw-box';
    await this.play(
      new Succession([
        new AnimationGroup([sync(), ...putBack()]),
        recolor(thrown, REJECT),
        new Create(throwBox, {
          runTime: 0.5,
        }),
      ]),
    );
    this.state.terminal = true;
    s.reading(...code.code.lines.slice(1, 5), code.code.lines[THROW]!, d.get('closed'), ring.outline, readout.current);
  }
}

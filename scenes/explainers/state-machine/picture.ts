import { Group, Dot, SurroundingRectangle, keyed } from '../../../src/index.ts';
import type { Mobject, Code, CodeSpan } from '../../../src/index.ts';
import { reduceSession, sessionAttempt } from './model.ts';
import type { SessionState } from './model.ts';
import { flow, label, tile, emphasised, card } from '../../../explain/drawing.ts';
import type { CardOptions, Card } from '../../../explain/drawing.ts';
import type { Stage, StagedStepsOptions, Diagram } from '../../../explain/index.ts';


export function frames(stage: Stage, which: string, answer: string, opts?: StagedStepsOptions): Promise<void> {
  const event = which === 'success' ? 'OPENED' : 'ERROR',
    next = reduceSession('connecting', event);
  const closed = which === 'success' ? reduceSession(next, 'CLOSE') : next;
  const rejected = sessionAttempt(closed, 'OPENED');
  const ended = which === 'success' ? 'CLOSE moves open to closed' : `ERROR already moved connecting to ${closed}`;
  return stage.steps([
    {
      id: 'reader-path',
      title: 'Should a late OPENED reopen a closed session?',
      line: `Predict: the session ends in ${closed}, then an OPENED arrives. What happens?`,
      caption: `A session connects in two moves: CONNECT takes it from idle to connecting, and the network’s reply, OPENED or ERROR, decides where it goes next. Here the reply is ${event}, which moves it to ${next}${which === 'success' ? ', and later CLOSE moves it to closed' : ''}. Then a reply from an earlier attempt turns up: OPENED. Read on its own, OPENED means open. Should the session reopen? The code that decides is a reducer: a function given the current state and an event, which returns the next state.`,
      state: { event, next },
      draw: (st, s) =>
        new Group(
          flow(s, ['idle', 'connecting', st.next], { key: 'reader-flow' }),
          label(s, 'CONNECT', { at: [-2.55, 2.25], color: s.look.emphasis, size: 0.65 }),
          label(s, st.event, { at: [2.55, 2.25], color: s.look.emphasis, size: 0.65 }),
          label(s, 'Current state + event → next state', { at: [0, -1.8], size: 0.7 }),
        ),
    },
    {
      id: 'reader-reject',
      title: 'Answer: no. Closed has no row for OPENED',
      line: 'The reducer looks up the current state and the event together.',
      caption: `${answer}. ${ended}. The reducer then looks up the pair closed:OPENED, finds no row and throws InvalidTransition, an error, so the state stays closed.`,
      // `via`: the event that closed the session before the late OPENED.
      state: { state: closed, event: 'OPENED', result: rejected, via: which === 'success' ? 'CLOSE' : event },
      draw: (st, s) =>
        new Group(
          label(s, `${st.via} → ${st.state}`, { at: [0, 2.65], size: 0.7 }),
          tile(s, st.state, { at: [-4.7, 1], width: 3.8, height: 1.3, active: true }),
          tile(s, st.event, { at: [0, 1], width: 3.8, height: 1.3 }),
          // The rejected event leaves the state where it was.
          tile(s, st.result.state ?? st.state, { at: [4.7, 1], width: 3.8, height: 1.3, active: true }),
          label(s, '×', { at: [2.35, 1], color: s.look.bad, size: 1 }),
          keyed(label(s, st.result.error!, { at: [0, -1.4], color: s.look.bad, size: 0.8 }), 'rejection'),
          label(s, `State stays ${st.state}`, { at: [0, -2.8], size: 0.7 }),
        ),
    },
  ], opts);
}

// One colour says "the machine is here": the ring on the diagram and the row in the code.
export const NOW = '#f1fa8c',
  REJECT = '#ff5555';
export const RING = { keep: true, color: NOW, buff: 0.07, cornerRadius: 0.08, strokeWidth: 0.03, runTime: 0.8 };

/** The card row the bar lights: the error, the new state, or the event that just arrived. */
const litRow = (st: SessionState) => (st.invalid ? 'Returns' : st.returns ? 'State' : st.event ? 'Event' : null);

/** The Session card for one state: state, event and return value, the row the session last changed lit. */
export function drawSessionCard(s: Stage, st: SessionState, at: CardOptions['at']): Card {
  const row = litRow(st);
  const drawn = card(
    s,
    [
      ['State', st.session],
      ['Event', st.event ?? '–'],
      ['Returns', st.returns ?? (st.event ? '…' : '–')],
    ],
    // The row the session last changed is lit, drawn with the card: described and emphasised with it.
    { at, size: 0.28, width: 4.8, lit: row && { row } },
  );
  for (const field of ['State', 'Event', 'Returns'])
    keyed(drawn.values.get(field)!, `session:${field.toLowerCase()}`);
  keyed(drawn.bar, 'session:bar');
  return drawn;
}

/** Where a reducer row (from its key to its answer) and the throw sit in the drawn code. */
export function reducerSpans(code: Code, lines: readonly string[], throwLine: number) {
  const rowOf = (row: string) => lines.findIndex((l) => l.includes(`'${row}'`));
  return {
    row: (row: string) => {
      const line = rowOf(row), next = lines[line]!.split("'")[3]!;
      return code.span(line, code.token(line, `'${row}'`).from, code.token(line, `'${next}'`).to);
    },
    thrown: () => code.span(throwLine, code.token(throwLine, 'if').from, lines[throwLine]!.length),
  };
}

// A lit row is the row's glyphs again, in the ring's colour, over the code.
const lit = (span: CodeSpan, color: string) => new Group(...span.children.map((g) => g.copy().setFill(color)));
const boxOf = (span: CodeSpan, color: string) =>
  new SurroundingRectangle(span.box()!, { buff: 0.035, cornerRadius: 0.04, stroke: color, strokeWidth: 0.02 });

/** The diagram with the links the session travelled in the trail's colour. */
export const drawTrails = (d: Diagram, st: SessionState) =>
  new Group(keyed(d.picture(d.trail(st.travelled.map((l) => l.split(':').slice(0, 2) as [string, string]))), 'diagram'));
// What the views mark is emphasis the phone's close-ups visit first and review holds to the caption:
// the ring, the row read or the throw hit, each tagged where it is drawn; the travelled links are the
// diagram picture's marks, which report themselves.
/** The ring on the state the session is in. */
export const drawRing = (d: Diagram, st: SessionState) =>
  new Group(keyed(emphasised(new SurroundingRectangle(d.get(st.session), { buff: RING.buff, cornerRadius: RING.cornerRadius, stroke: NOW, strokeWidth: RING.strokeWidth }), `ring: ${st.session}`), `session:ring:${st.session}`));
/** The reducer row the session read, or the throw it hit, lit and boxed. */
export const drawReading = (st: SessionState, spans: ReturnType<typeof reducerSpans>) => {
  const parts: Mobject[] = [];
  if (st.row) parts.push(keyed(lit(spans.row(st.row), NOW), `reducer:lit:${st.row}`), keyed(emphasised(boxOf(spans.row(st.row), NOW), `row: ${st.row}`), `reducer:box:${st.row}`));
  if (st.invalid) parts.push(keyed(lit(spans.thrown(), REJECT), 'reducer:throw-lit'), keyed(emphasised(boxOf(spans.thrown(), REJECT), `throw: ${st.session}:${st.event}`), 'reducer:throw-box'));
  return new Group(...parts);
};
/** The token that walks a link. */
export const walkToken = (d: Diagram) => new Dot({ radius: 0.08, color: d.emphasis });

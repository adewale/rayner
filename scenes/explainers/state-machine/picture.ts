import { Group, Dot, SurroundingRectangle, keyed } from '../../../src/index.ts';
import type { Mobject, Code, CodeSpan, Box } from '../../../src/index.ts';
import { SEND_CODE, BRANCH_LINES } from './model.ts';
import type { SocketState, Branch } from './model.ts';
import { label, emphasised, card, code } from '../../../explain/drawing.ts';
import type { CardOptions, Card } from '../../../explain/drawing.ts';
import type { Stage, DrawContext, StagedStepsOptions, Diagram } from '../../../explain/index.ts';

/** The reader's program for each scenario, and the line whose send() the page asks about. */
export const PROGRAMS = {
  connecting: { lines: ['const ws = new WebSocket(url);', 'ws.send("hi");'], ask: 1, server: 'The server has not answered yet' },
  closing: { lines: ['const ws = new WebSocket(url);', 'ws.onopen = () => {', '  ws.send("hi");', '  ws.close();', '  ws.send("bye");', '};'], ask: 4, server: 'The server accepted, so open fired' },
} as const;
export type When = keyof typeof PROGRAMS;

/** The opening step: the reader's program, the line asked about lit, and what the server has done. */
export function frames(stage: Stage, which: When, predict: { options: string[]; answer: string }, opts?: StagedStepsOptions): Promise<void> {
  const program = PROGRAMS[which];
  return stage.steps([
    {
      id: 'ask',
      title: 'What does this send() do?',
      line: 'Predict, then press Next.',
      caption:
        which === 'connecting'
          ? 'You create a WebSocket and, on the very next line, call ws.send("hi"). The server has not answered the handshake yet. Does send() throw, send the message, or return without sending it?'
          : 'Your socket opens, and its open handler sends "hi", calls ws.close(), then calls ws.send("bye") on the next line. Does that last send() throw, send the message, or return without sending it?',
      predict,
      state: { lines: [...program.lines], ask: program.ask, server: program.server },
      draw: (st, s) => {
        // The program, and right under it what the server has done, so a phone's opening holds both.
        const program = code(s, st.lines, { at: [0, 0.9], size: 0.42, lit: { lines: st.ask, as: 'asked about' }, key: 'program' });
        return new Group(program, label(s, st.server, { at: [0, program.box()![1] - 0.55], size: 0.56 }));
      },
    },
  ], opts);
}

// One colour says "the socket is here": the ring on the diagram and the branch of send() it ran.
export const NOW = '#f1fa8c',
  REJECT = '#ff5555';
export const RING = { keep: true, color: NOW, buff: 0.07, cornerRadius: 0.08, strokeWidth: 0.03, runTime: 0.8 };

/** The card row the bar lights: what the last event did, or the readyState before the first event. */
const litRow = (st: SocketState) => (st.result ? 'Result' : 'readyState');
const messages = (n: number) => `${n} message${n === 1 ? '' : 's'}`;

/** The socket's card: readyState, the last event, what it did and what the server has received. */
export function drawSocketCard(s: DrawContext, st: SocketState, at: CardOptions['at']): Card {
  const row = litRow(st);
  const drawn = card(
    s,
    [
      ['readyState', st.ready],
      ['Event', st.event ?? '–'],
      ['Result', st.result ?? '–'],
      ['Server got', messages(st.delivered)],
    ],
    { at, size: 0.28, width: 5.2, lit: { row } },
  );
  for (const [field, key] of [['readyState', 'ready'], ['Event', 'event'], ['Result', 'result'], ['Server got', 'delivered']] as const)
    keyed(drawn.values.get(field)!, `socket:${key}`);
  keyed(drawn.bar, 'socket:bar');
  return drawn;
}

/** The lines of send() as the panel shows them. */
export const SEND_LINES = SEND_CODE.map((l) => l.text);

/** Where each branch of send() sits in the drawn code: its lines, from their first word to their end. */
export function branchSpans(drawn: Code) {
  return (branch: Branch): CodeSpan[] =>
    BRANCH_LINES[branch].map((line) => {
      const text = SEND_LINES[line]!;
      return drawn.span(line, text.length - text.trimStart().length, text.length);
    });
}

/** The box around every span: from the leftmost glyph to the rightmost, the top line to the bottom. */
const around = (spans: CodeSpan[]): Box => {
  const boxes = spans.map((span) => span.box()!);
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
};
const boxOf = (spans: CodeSpan[], color: string) =>
  new SurroundingRectangle(around(spans), { buff: 0.035, cornerRadius: 0.04, stroke: color, strokeWidth: 0.02 });

/** The diagram with the links the socket travelled in the trail's colour. */
export const drawTrails = (d: Diagram, st: SocketState) =>
  new Group(keyed(d.picture(d.trail(st.travelled.map((l) => l.split(':') as [string, string]))), 'diagram'));
// What the views mark is emphasis the phone's close-ups visit first and review holds to the caption:
// the ring and the branch of send() run, each tagged where it is drawn; the travelled links are the
// diagram picture's marks, which report themselves.
/** The ring on the readyState the socket is in. */
export const drawRing = (d: Diagram, st: SocketState) =>
  new Group(keyed(emphasised(new SurroundingRectangle(d.get(st.ready), { buff: RING.buff, cornerRadius: RING.cornerRadius, stroke: NOW, strokeWidth: RING.strokeWidth }), `ring: ${st.ready}`), `socket:ring:${st.ready}`));
/** The branch of send() the last event ran, boxed: the throw in red, the return or the queue in the ring's colour. */
export const drawBranch = (st: SocketState, spans: ReturnType<typeof branchSpans>) => {
  const parts: Mobject[] = [];
  if (st.branch) {
    const color = st.branch === 'throw' ? REJECT : NOW, b = spans(st.branch);
    parts.push(keyed(emphasised(boxOf(b, color), `${st.branch === 'throw' ? 'throw' : st.branch}: ${st.result}`), `send:box:${st.branch}`));
  }
  return new Group(...parts);
};
/** The token that walks a link. */
export const walkToken = (d: Diagram) => new Dot({ radius: 0.08, color: d.emphasis });

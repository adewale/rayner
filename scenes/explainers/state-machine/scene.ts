import { frames, RING, drawSocketCard, branchSpans, drawTrails, drawRing, drawBranch, walkToken, SEND_LINES } from './picture.ts';
import { Scene, Text, Create, FadeIn, AnimationGroup, Succession } from '../../../src/index.ts';
import type { ScheduledAnimation } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, answerOf, Machine, view } from '../../../explain/index.ts';
import { code } from '../../../explain/drawing.ts';
import type { Card, CodeBlock } from '../../../explain/drawing.ts';
import type { View, Choreography, Transition, ExplainerMeta, Setting } from '../../../explain/index.ts';
import { RESULT, BRANCH_LINES, SOCKET_EVENTS, socketNext, socketBound, socketReplay, socketStart } from './model.ts';
import type { SocketState, SocketEvent } from './model.ts';

// The socket's readyStates and the arrows between them; send() is no arrow, since it never moves the socket.
const SOURCE = [
  'stateDiagram-v2',
  ' direction LR',
  ' CONNECTING --> OPEN: accepted',
  ' OPEN --> CLOSING: close()',
  ' CLOSING --> CLOSED: answered',
].join('\n');
const DIAGRAM = regionBox('top', { left: -7.9, right: 7.9, bottom: 0.85 }),
  CODE = regionBox('full', { right: 2.05, top: 0.7 }),
  CARD = regionBox('full', { left: 2.35, top: 0.7 });
const OPTIONS = ['It throws an error', 'It sends the message', 'It returns, sends nothing'];

export default class StateMachineExplainer extends Scene<SocketState, {}> {
  static meta = {
    sources: [
      'https://websockets.spec.whatwg.org/#dom-websocket-send',
      'https://github.com/nodejs/undici/blob/v7.30.1/lib/web/websocket/websocket.js',
      'https://github.com/nodejs/undici/blob/v7.30.1/lib/web/websocket/connection.js',
    ],
    claims: [
      {
        says: 'sends only in OPEN',
        test: 'model.test.ts: Node’s own WebSocket does what the model says, in every state the live step reaches',
      },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'when',
      label: 'When send() is called',
      default: 'connecting',
      options: [
        { value: 'connecting', label: 'Right after new WebSocket()' },
        { value: 'closing', label: 'Right after close()' },
      ],
    },
  ] as const satisfies readonly Setting[];
  override state = socketStart();
  /** The socket's card, rebuilt from scene.state at every sync. */
  readout!: View<Card>;

  override async construct() {
    const which = settingsOf(this, StateMachineExplainer).when,
      s = stage(this, { headingSize: 0.6, style: 'dracula' });
    // Where the page's machine starts: a new socket, or one whose open handler has sent "hi".
    const start: SocketState = which === 'connecting' ? socketStart() : { ...socketReplay(['server accepts', 'send()']), event: null, result: null, branch: null };
    // The program's send() on the asked-about line, run on the model: what the reader predicts.
    const asked = socketReplay(which === 'connecting' ? ['send()'] : ['close()', 'send()'], start);
    const answer = asked.result === RESULT.threw ? OPTIONS[0]! : asked.result === RESULT.sent ? OPTIONS[1]! : OPTIONS[2]!;
    await frames(s, which, { options: OPTIONS, answer });

    const said = answerOf(this);
    await this.step('answer', {
      title: which === 'connecting' ? 'Answer: it throws InvalidStateError' : 'Answer: no error, and nothing is sent',
      line: which === 'connecting' ? 'readyState is CONNECTING, and send() throws there.' : 'close() made it CLOSING at once, and send() returns there.',
      caption:
        which === 'connecting'
          ? `${said}. Here the server has not accepted the handshake, so readyState is still CONNECTING, and send()'s first check throws at the boxed line. The ring marks the state: send() moves it along no arrow.`
          : `${said}. close() moves readyState from OPEN to CLOSING at once, before the server answers, so send()'s second check returns at the boxed line: no error, and the server has only "hi".`,
    });
    await s.clear();
    const d = await s.show({ source: SOURCE }, { box: DIAGRAM });
    this.state = { ...start };
    // send()'s code is drawn once; what the socket ran is boxed over it by the branch view.
    // Its lit bar is on the branch the last event ran, so the panel is a view of the state too.
    const codeView = view(
      this,
      (st) => {
        const lines = st.branch && BRANCH_LINES[st.branch];
        return code(s, SEND_LINES, { at: CODE, size: 0.19, key: 'code', lit: lines ? { lines: [lines[0]!, lines.at(-1)!], as: 'run' } : null });
      },
      { place: false },
    );
    await s.enter(codeView, { runTime: 0.4 });
    const codeLines = () => (codeView.current as CodeBlock).code.lines;
    // The card shows the state, not a copy of it: each sync rebuilds it from scene.state.
    const readout = (this.readout = view(this, (st) => drawSocketCard(s, st, CARD), { place: false }));
    s.keep(readout);

    const spans = branchSpans((codeView.current as CodeBlock).code);
    const socket = () => this.state;
    // Three pictures of the socket's state, each its own view so each change is its own region. The
    // drawn diagram takes the live one's place: the live diagram stays the source of geometry and of
    // the diagram's description, and the reader sees the state's picture.
    const diagram = view(this, (st) => drawTrails(d, st), { place: false });
    const ring = view(this, (st) => drawRing(d, st), { place: false });
    const branch = view(this, (st) => drawBranch(st, spans), { place: false });
    s.keep(diagram);
    s.keep(ring, { describe: () => `A ring around ${socket().ready}, the readyState the socket is in` });
    s.keep(branch, {
      describe: () => {
        const st = socket();
        if (st.branch === 'throw') return 'A red box around the throw in send(): readyState is CONNECTING';
        if (st.branch === 'return') return `A box around send()'s return: readyState is ${st.ready}, not OPEN`;
        if (st.branch === 'queue') return 'A box around the line that queues the message: readyState is OPEN';
        return '';
      },
    });
    await this.play(new FadeIn(readout, { runTime: 0.35, shift: [0, -0.08] }));
    this.add(diagram, branch, ring);
    d.showBy(diagram);
    await this.play(new Create(ring.current.find(`socket:ring:${start.ready}`)!, { runTime: RING.runTime }));

    /** The card's value for `field` is replaced: the old text fades out, then the new one fades in, never both at once. */
    const swap = (k: Choreography, field: string, runTime: number): ScheduledAnimation[] =>
      k.from(`socket:${field}`) && (k.from(`socket:${field}`) as Text).text !== (k.to(`socket:${field}`) as Text).text
        ? [new Succession([k.leave(`socket:${field}`, { runTime: runTime / 2 }), k.enter(`socket:${field}`, {}, { runTime: runTime / 2 })])]
        : [];
    const machine = new Machine<SocketState, SocketEvent>(this, {
      start,
      events: SOCKET_EVENTS,
      next: socketNext,
      bound: socketBound,
      views: [diagram, ring, branch, readout, codeView],
      // An event that moves the socket walks its arrow (3.7 s); one that does not lights send()'s branch (1.4 s).
      runTime: ({ before, after }) => (after.ready !== before.ready ? 3.66 : 1.35),
      transition: Object.fromEntries(
        SOCKET_EVENTS.map((event) => [
          event,
          (t: Transition<SocketState, SocketEvent>) => {
            const { before, after } = t;
            const g = t.choreograph(diagram), o = t.choreograph(ring), c = t.choreograph(branch), k = t.choreograph(readout), p = t.choreograph(codeView);
            const same = before.branch !== null && before.branch === after.branch;
            // The last event's lit branch is put back, unless this event runs the same one.
            const putBack = before.branch && !same ? [c.leave(`send:box:${before.branch}`, { runTime: 0.4 })] : [];
            // The code's lit bar (always there, unseen when nothing is lit) moves to the branch run, or fades.
            const bar = before.branch !== after.branch ? [p.morph('code:bar', { runTime: 0.4 })] : [];
            const rest = (runTime: number) => [g.rest({ runTime }), o.rest({ runTime }), c.rest({ runTime }), k.rest({ runTime }), p.rest({ runTime })];
            if (after.ready === before.ready) {
              // The socket stays: the event arrives on the card, send()'s branch lights, and only then
              // does the card say what the event did.
              const changed = (['result', 'delivered'] as const).filter(
                (f) => (k.from(`socket:${f}`) as Text).text !== (k.to(`socket:${f}`) as Text).text,
              );
              return new Succession([
                new AnimationGroup([
                  ...swap(k, 'event', 0.45),
                  ...changed.map((f) => k.leave(`socket:${f}`, { runTime: 0.45 })),
                  k.morph('socket:bar', { runTime: 0.45 }),
                  ...putBack,
                  ...(after.branch ? [] : bar),
                ]),
                ...(after.branch && !same
                  ? [new AnimationGroup([...bar, c.enter(`send:box:${after.branch}`, { create: true }, { runTime: 0.5 })])]
                  : []),
                new AnimationGroup([...changed.map((f) => k.enter(`socket:${f}`, {}, { runTime: 0.4 })), ...rest(0.4)]),
              ]);
            }
            // The socket moves: the event arrives on the card, the ring leaves its state, a token walks
            // the arrow and leaves a trail, and the ring lands where the socket now is.
            const link = d.link(before.ready, after.ready);
            const resultChanges = (k.from('socket:result') as Text).text !== (k.to('socket:result') as Text).text;
            // The token rides just above the arrow, so it passes over the arrow's label rather than through it.
            const walk = g.travel('walk:token', walkToken(d), link.route.copy().shift([0, 0.24]), { appear: 0.18, move: 0.8, leave: 0.18 });
            return new Succession([
              // The last event's result leaves as this event arrives; its own comes when the ring lands.
              new AnimationGroup([...swap(k, 'event', 0.45), k.morph('socket:bar', { runTime: 0.45 }), ...putBack, ...bar, ...(resultChanges ? [k.leave('socket:result', { runTime: 0.45 })] : [])]),
              o.leave(`socket:ring:${before.ready}`, { runTime: 0.35 }),
              walk.appear,
              new AnimationGroup([walk.move, g.morph('diagram', { runTime: 0.8 })]),
              walk.leave,
              new AnimationGroup([
                o.enter(`socket:ring:${after.ready}`, { create: true }, { runTime: 0.8 }),
                ...swap(k, 'ready', 0.8),
                ...(resultChanges ? [k.enter('socket:result', {}, { runTime: 0.8 })] : []),
                ...rest(0.8),
              ]),
            ]);
          },
        ]),
      ),
    });

    await this.play(machine.sendSequence(which === 'connecting' ? ['send()'] : ['close()', 'send()']));
    // A phone opens on the check send() failed and the line it ran, which is the answer.
    const ran = which === 'connecting' ? [2, 3, ...BRANCH_LINES.throw] : [8, 9, 10, 11, ...BRANCH_LINES.return];
    s.opening(...ran.map((i) => codeLines()[i]!), branch.current.find(`send:box:${this.state.branch}`)!);
    let at = this.state;
    if (which === 'connecting') {
      await this.step('open', {
        title: 'The server accepts: OPEN',
        line: 'The open event fires, and send() can work from here.',
        caption: 'When the server accepts the handshake, the ring walks to OPEN and the open event fires. The open event is the moment readyState becomes OPEN, so it is the first moment send() can send.',
      });
      await this.play(machine.sendSequence(['server accepts']));
      await this.step('send', {
        title: 'The same send(), now sent',
        line: 'Press close(), then send(): what happens now?',
        caption: 'In OPEN the same send() passes both checks and queues the message, and the server gets it. So send from the open handler, or check ws.readyState === WebSocket.OPEN first. Press close(), then send(), and see the other half of the answer.',
      });
      await this.play(machine.sendSequence(['send()']));
    } else {
      await this.step('closed', {
        title: 'The server answers: CLOSED',
        line: 'Press send() or close(): neither changes anything now.',
        caption: 'The server answers the close frame, the ring walks to CLOSED and the close event fires. send() returns quietly here too, so code that must not lose a message checks ws.readyState === WebSocket.OPEN before it sends.',
      });
      await this.play(machine.sendSequence(['server answers close()']));
    }
    at = this.state;
    s.opening(...codeLines(), diagram.current.find('diagram')!, ring.current.find(`socket:ring:${at.ready}`)!, readout.current);
  }
}

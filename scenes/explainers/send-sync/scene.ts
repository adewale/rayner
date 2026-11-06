import { Scene, Group } from '../../../src/index.ts';
import { stage, settingsOf, Card, answerOf, view } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
import { SINGLES, WRAPS, OPENING, OPENING_TYPE, build, nameOf, isSend, isSync, quadrantOf, threads } from './model.ts';
import type { Inner, Wrapper, Quadrant, Layer } from './model.ts';
import { SIZE, SPOT, QUADRANT, chart, LEFT, RIGHT, ZOOM, valueName, columnLines, quadrantMap } from './picture.ts';

// Sources, all at rust-lang/rust tag 1.99.1 unless named otherwise; lines are quoted in model.ts
// and model.test.ts.
const RUST = 'https://github.com/rust-lang/rust/blob/1.99.1/library/';
const REFERENCE =
  'https://github.com/rust-lang/reference/blob/d9d9ed57a120e3c87033fd598f191bbb84aad097/src/types/closure.md';
const NOMICON =
  'https://github.com/rust-lang/nomicon/blob/60ed8f3bb9d22a60865197a0ac74911436703430/src/send-and-sync.md';

const WRAPPER_LABEL: Record<Wrapper, string> = { arc: 'Arc<T>', mutex: 'Mutex<T>', 'arc-mutex': 'Arc<Mutex<T>>' };
const yesNo = (b: boolean) => (b ? 'yes' : 'no');
const traits = (send: boolean, sync: boolean) =>
  send && sync ? 'Send and Sync' : send ? 'Send but not Sync' : sync ? 'Sync but not Send' : 'neither Send nor Sync';
/** The script's one-sentence answer (script.md); the arc-cell step's caption opens with it. */
/** What the steps record, accumulated: the fields the views below draw from. */
interface SendSyncState {
  /** The quadrant the step's point is in, which the small map fills. */
  here: Quadrant;
  /** In a wrapper step: the wrapper, and the type it wraps. */
  wrap: { ctor: string; inside: Layer };
  threads: { name: string; spawnMove: boolean; scopeBorrow: boolean };
}

export default class SendSyncExplainer extends Scene {
  static meta = {
    sources: [
      RUST + 'alloc/src/sync.rs#L284-L286',
      RUST + 'alloc/src/rc.rs#L334-L342',
      RUST + 'core/src/cell.rs#L320-L328',
      RUST + 'std/src/sync/poison/mutex.rs#L233-L294',
      RUST + 'core/src/marker.rs#L69-L105',
      RUST + 'core/src/marker.rs#L513-L548',
      RUST + 'std/src/thread/functions.rs#L125-L129',
      RUST + 'std/src/thread/scoped.rs#L201-L204',
      REFERENCE + '#L729-L734',
      NOMICON + '#L8-L29',
    ],
    // The sentences that reach beyond the scenario on screen, and what holds them. The rule table test reads the
    // impl lines; the evaluator test holds the model to rustc 1.99.1's answers.
    claims: [
      { says: 'Arc<T> is Send only when T is both Send and Sync', test: 'model.test.ts: the rule table is the standard library’s impl lines' },
      { says: 'Mutex<T> needs only T: Send', test: 'model.test.ts: the rule table is the standard library’s impl lines' },
      { says: 'a move closure that owns x is Send only if', test: 'model.test.ts: the evaluator gives rustc’s answers' },
      { says: 'every combination occurs', shown: true as const },
      // The quadrant's name, as the chart labels it.
      { says: '“Send only”', shown: true as const },
    ],
  };
  static settings = [
    {
      id: 'wrapper',
      label: 'Wrapper',
      // The default builds the fix for the opening's Cell; Arc<T> alone rebuilds the refused x.
      default: 'arc-mutex',
      options: [
        { value: 'arc', label: 'Arc<T>' },
        { value: 'mutex', label: 'Mutex<T>' },
        { value: 'arc-mutex', label: 'Arc<Mutex<T>>' },
      ],
    },
    {
      id: 'inner',
      label: 'T',
      default: 'cell',
      options: [
        { value: 'i32', label: 'i32' },
        { value: 'cell', label: 'Cell<i32>' },
        { value: 'rc', label: 'Rc<i32>' },
      ],
    },
  ];

  override async construct() {
    const answer = answerOf(this);
    const values = settingsOf(this);
    const wrapper = values.wrapper as Wrapper,
      inner = values.inner as Inner;
    const s = stage(this, { style: 'hand-drawn', headingSize: 0.6 });
    const ink = s.palette.ink;
    const st = () => this.state as unknown as SendSyncState;

    /** Lines of text at the reader's size, wrapped to the right column, from `top` down. */
    const lines = (rows: readonly (string | { text: string; head: true })[], top: number) => columnLines(rows, top, { ink, emphasis: s.emphasis });
    /** A card at the top of the right column, drawn from the state by `rows`: a view check holds to it. */
    const column = async (rows: (st: SendSyncState) => readonly (readonly [string, string])[], title?: string) => {
      const card = view(
        this,
        (state) => {
          const c = new Card(this, s.palette, rows(state as unknown as SendSyncState), {
            at: RIGHT,
            align: 'top',
            fontSize: SIZE,
            ...(title ? { title } : {}),
          });
          // Left-aligned with the column's lines.
          c.shift([RIGHT[0] + 0.1 - c.box()![0], 0]);
          return c;
        },
        { place: false },
      );
      await s.enter(card);
      return card;
    };

    /**
     * A small map of the four quadrants under the right column, the one in view filled, so a close-up
     * of one quadrant keeps its place in the 2 × 2.
     */
    const locator = async (here: Quadrant) => {
      this.state.here = here;
      const map = view(this, (state) => quadrantMap((state as unknown as SendSyncState).here, { ink, paper: s.palette.paper, emphasis: s.emphasis, soft: s.soft }), { place: false });
      await s.enter(map, { describe: () => `Map of the four quadrants, “${QUADRANT[st().here]}” filled` });
    };
    /** A point's two answers, said on the point, with the column's words and the map beside the chart. */
    const tell = async (
      chartOf: Diagram,
      point: string,
      send: boolean,
      sync: boolean,
      here: Quadrant,
      // Words drawn from the state are a view of it; fixed words are just words.
      words: readonly string[] | ((st: SendSyncState) => readonly string[]),
    ) => {
      await chartOf.note(`point:${point}:label`, `Send: ${yesNo(send)}, Sync: ${yesNo(sync)}`, {
        side: 'below',
        size: SIZE,
      });
      await s.enter(typeof words === 'function'
        ? view(this, (state) => new Group(...lines(words(state as unknown as SendSyncState), RIGHT[3])), { place: false })
        : new Group(...lines(words, RIGHT[3])));
      await locator(here);
    };

    // ------------------------------------------------------------------ the refused program
    // The opening is the same in every scenario: the Arc<Cell<i32>> rustc refuses. The setting picks
    // the type built at the end.
    const opening = build('arc', 'cell'),
      openRun = threads('arc', 'cell');
    const [cellLayer, arcCell] = opening as [Layer, Layer];
    if (openRun.spawnMove || nameOf(OPENING_TYPE) !== arcCell.name)
      throw new Error('The opening program must be one the model says rustc refuses');
    await this.step('spawn', {
      title: 'rustc refuses to send this Arc to another thread',
      line: 'Predict: isn’t Arc the thread-safe pointer? Why is x refused?',
      // functions.rs:125-129: spawn needs F: Send + 'static. The error lines are rustc's, checked in
      // model.test.ts.
      caption: `x is an Arc, the pointer the standard library provides for sharing one value between threads; here it holds a Cell<i32>. thread::spawn runs a closure on a new thread, and move hands x to that closure. rustc refuses with error E0277, and the error names two traits: Sync, which Cell<i32> lacks, and Send, which ${arcCell.name} needed for the move.`,
    });
    const opener = await s.code(
      [
        ...OPENING,
        // rustc's lines, wrapped to the reader's size.
        'error[E0277]: `Cell<i32>` cannot be shared',
        '              between threads safely',
        '= help: the trait `Sync` is not implemented',
        '        for `Cell<i32>`',
        '= note: required for `Arc<Cell<i32>>` to',
        '        implement `Send`',
      ],
      { at: [-7.8, -3.6, 7.8, 2.75], fontSize: SIZE },
    );
    await opener.focus([4, 7], { as: 'the two traits' });
    this.state.opening = openRun;

    // ------------------------------------------------------------------ the two questions
    await this.step('questions', {
      title: 'Send and Sync: the two questions in that error',
      line: 'Predict: Cell::set writes through a shared &self. Which quadrant holds Cell<i32>?',
      caption:
        'thread::spawn needs everything its closure owns to be Send: safe to move to another thread. Sync is the other question: can several threads hold a shared reference &T to it at once? The standard library defines T as Sync exactly when &T is Send. rustc answers both questions for a type, so the type lands in one of four quadrants.',
    });
    await s.clear();
    const singles = SINGLES.map((type) => ({
      name: nameOf(type),
      q: quadrantOf(type),
      send: isSend(type),
      sync: isSync(type),
    }));
    let d = await s.show({ source: chart(singles) }, { box: LEFT, build: 'frame' });
    await d.reveal(([1, 2, 3, 4] as const).map((n) => `quadrant-label:${n}`));
    await s.enter(
      ...lines(
        [
          { text: 'Send', head: true },
          'Can a value move to another thread?',
          { text: 'Sync', head: true },
          'Can two threads share a &T to it at once?',
        ],
        RIGHT[3],
      ),
    );
    this.state.singles = Object.fromEntries(singles.map((p) => [p.name, { send: p.send, sync: p.sync }]));

    // ------------------------------------------------------------------ the culprit, then the aha
    const SINGLE_STEPS: Record<string, { id: string; title: string; line: string; caption: string; source: string }> = {
      'Cell<i32>': {
        id: 'cell',
        title: 'Answer: Cell<i32> can move but cannot be shared',
        line: 'Predict: now wrap it in Arc. Which quadrant does Arc<Cell<i32>> land in?',
        // marker.rs:541-548: Cell::set takes &self and performs no synchronization, so Cell cannot
        // be Sync. cell.rs:320 Send where T: Send; cell.rs:328 !Sync.
        caption:
          'Cell::set writes through a shared &self without synchronisation. Two threads sharing &Cell could therefore write to the same value at once, so Cell is not Sync. Moving ownership is different: the old owner gives up the Cell rather than keeping shared access to it. Cell<T> is Send when T is, so a whole Cell<i32> can move to another thread.',
        source: 'See cell.rs:320, 328.',
      },
      'Rc<i32>': {
        id: 'rc',
        title: 'Rc<i32> is neither Send nor Sync, whatever it holds',
        line: 'Rc is the single-threaded Arc: its owner count is a plain integer.',
        // marker.rs:74-79: two threads cloning Rcs to one value could update the count at once,
        // undefined behaviour because Rc does not use atomic operations. rc.rs:334 and :342.
        caption:
          'Rc is the single-threaded version of Arc: it counts its owners with a plain integer, not an atomic one. Two threads cloning Rcs that share one count could update it at the same moment, which is undefined behaviour. Rc is therefore neither Send nor Sync, whatever it holds. Arc’s atomic count fixes exactly that, and nothing about the value inside.',
        source: 'See rc.rs:334, 342.',
      },
      i32: {
        id: 'i32',
        title: 'i32 is Send and Sync',
        line: 'Predict: three quadrants are filled. What could be Sync but not Send?',
        // marker.rs:92 and :657 declare both as auto traits; :521 says primitive types are Sync;
        // the Nomicon (lines 20-23) says almost all primitives are Send and Sync.
        caption:
          'Send and Sync are auto traits: a type made of parts that have them gets them too, unless its library opts out, as Rc does for both and Cell does for Sync. Primitives such as i32 have both, so i32 sits in the top-right quadrant. A point’s place inside its quadrant means nothing.',
        source: 'Both are auto traits.',
      },
      'MutexGuard<i32>': {
        id: 'guard',
        title: 'Answer: MutexGuard<i32> can be shared but cannot move',
        line: 'Predict: what could make the opening’s Cell safe to share?',
        // mutex.rs:282-289: not Send because with POSIX threads a lock must be released on the thread
        // that acquired it. mutex.rs:291-294: Sync if T: Sync, because &MutexGuard gives &T.
        caption:
          'Dropping a MutexGuard unlocks its mutex. Rust supports platforms that require the unlocking thread to be the one that took the lock, so the guard cannot move to another thread: it is not Send. A shared &MutexGuard gives access through &i32 without moving the guard, so it is Sync when the value inside is Sync. Send and Sync really are two separate questions: every combination occurs.',
        source: 'See mutex.rs:289, 294.',
      },
    };
    const single = (name: string) => singles.find((p) => p.name === name)!;
    const place = async (name: string, prepare?: () => Promise<void>) => {
      const p = single(name),
        meta = SINGLE_STEPS[name]!;
      await this.step(meta.id, { title: meta.title, line: meta.line, caption: meta.caption });
      if (prepare) await prepare();
      else await s.clearOverlays();
      const chartOf = d;
      await chartOf.reveal([`point:${p.name}`, `point:${p.name}:label`]);
      await chartOf.focus([`plate:${p.q}`], { zoom: ZOOM });
      await tell(chartOf, p.name, p.send, p.sync, p.q, [
        meta.source,
        ...(p.name === 'i32' ? ['Only the quadrant counts: a point’s place inside it means nothing.'] : []),
      ]);
      this.state.shown = p.name;
    };
    await place(cellLayer.name);

    // Arc<Cell<i32>>: the point leaves "Send only" for "Neither".
    await this.step('arc-cell', {
      title: `Answer: ${arcCell.name} is ${traits(arcCell.send, arcCell.sync)}`,
      line: 'Arc makes its count thread-safe, not the value inside.',
      // sync.rs:135-147: Arc gives shared ownership of the data but adds no thread safety to it.
      // sync.rs:284, 286: Send and Sync for Arc<T> both need T: Send + Sync.
      caption: `${answer}, and the same holds for Sync. Cloning an Arc gives another owner of the same T, so a clone moved to another thread shares T between threads, and Arc adds no locking around it. ${cellLayer.name} is ${traits(cellLayer.send, cellLayer.sync)}, so ${arcCell.name} is ${traits(arcCell.send, arcCell.sync)}: the point moves from “${QUADRANT[cellLayer.quadrant]}” to “${QUADRANT[arcCell.quadrant]}”, and thread::spawn refuses x.`,
    });
    await s.clear();
    const shared = valueName(arcCell.name);
    d = await s.show({ source: chart([{ name: cellLayer.name, q: cellLayer.quadrant }]) }, { box: LEFT });
    await d.morph(
      { source: chart([{ name: shared, q: cellLayer.quadrant }]) },
      { ops: [{ kind: 'rename_point', from: cellLayer.name, to: shared }] },
    );
    const [ax, ay] = SPOT[arcCell.quadrant];
    await d.morph(
      { source: chart([{ name: shared, q: arcCell.quadrant }]) },
      { ops: [{ kind: 'move_point', label: shared, x: ax, y: ay }] },
    );
    await d.focus([`plate:${arcCell.quadrant}`], { zoom: ZOOM });
    // The opening's wrap is the same in every scenario.
    await tell(d, shared, arcCell.send, arcCell.sync, arcCell.quadrant, [
      'Arc needs T: Send + Sync',
      `T here: ${cellLayer.name}`,
      'See sync.rs:284, 286.',
    ]);
    this.state.opened = arcCell;

    // ------------------------------------------------------------------ the rest of the map
    // Back to the map of single types, with Cell<i32> already on it, to fill the other quadrants.
    for (const [i, name] of ['Rc<i32>', 'i32', 'MutexGuard<i32>'].entries())
      await place(
        name,
        i
          ? undefined
          : async () => {
              await s.clear();
              d = await s.show({ source: chart(singles) }, { box: LEFT, build: 'frame' });
              await d.reveal([
                ...([1, 2, 3, 4] as const).map((n) => `quadrant-label:${n}`),
                `point:${cellLayer.name}`,
                `point:${cellLayer.name}:label`,
              ]);
            },
      );

    // ------------------------------------------------------------------ the wrapper rules
    const layers = build(wrapper, inner);
    const ctors = WRAPS[wrapper];
    await this.step('rules', {
      title: 'The fix: Mutex<T> needs only T: Send, and is Sync too',
      line:
        wrapper === 'arc'
          ? 'Arc clones on several threads reach one T with no added safety.'
          : wrapper === 'mutex'
            ? 'One thread at a time holds the lock, so T need not be Sync.'
            : 'With T: Send, Mutex<T> is Send and Sync, as Arc needs.',
      // sync.rs:135-147: Arc gives shared ownership of the data but adds no thread safety to it.
      // mutex.rs:240-256: Mutex gives one thread at a time access to T, so T need not be Sync.
      caption:
        'A Mutex lets one thread at a time use the value inside, behind its lock, so Mutex<T> needs only T: Send, and is then Sync as well: the lock supplies the synchronisation Cell lacks. Arc<T>, as before, needs T to be both. The lines omit ?Sized and the allocator. The setting picks the type built next, from the inside out.',
    });
    await s.clear();
    const code = await s.code(
      [
        '// alloc/src/sync.rs:284, 286',
        'unsafe impl<T: Send + Sync> Send for Arc<T> {}',
        'unsafe impl<T: Send + Sync> Sync for Arc<T> {}',
        '// std/src/sync/poison/mutex.rs:238, 257',
        'unsafe impl<T: Send> Send for Mutex<T> {}',
        'unsafe impl<T: Send> Sync for Mutex<T> {}',
      ],
      { at: [-7.8, -2.6, 7.8, 3.05], fontSize: SIZE },
    );
    await code.focus(wrapper === 'arc' ? [1, 2] : wrapper === 'mutex' ? [4, 5] : [1, 5], {
      as: wrapper === 'arc-mutex' ? 'both wrappers' : 'this wrapper',
    });
    await s.note(`Highlighted: the rules for ${WRAPPER_LABEL[wrapper]}`, { at: [0, -3.4], size: SIZE });
    this.state.layers = layers;

    // ------------------------------------------------------------------ built from the inside out
    let q: Diagram | null = null;
    let points: { name: string; q: Quadrant }[] = [{ name: layers[0]!.name, q: layers[0]!.quadrant }];
    for (let i = 1; i < layers.length; i++) {
      const was = layers[i - 1]!,
        now: Layer = layers[i]!,
        ctor = ctors[i - 1]!;
      const needs = ctor === 'Arc' ? 'both Send and Sync' : 'Send';
      const moved = was.quadrant !== now.quadrant;
      const why =
        ctor === 'Mutex' && now.sync && !was.sync
          ? ' The lock lets one thread at a time reach the value, so Mutex adds Sync.'
          : ctor === 'Arc' && !now.send && was.send
            ? ' Clones of one Arc on several threads would all reach the one value.'
            : '';
      await this.step(`wrap-${ctor.toLowerCase()}`, {
        title: `${now.name} is ${traits(now.send, now.sync)}`,
        line: `${ctor} needs T: ${ctor === 'Arc' ? 'Send + Sync' : 'Send'}; ${was.name} is ${traits(was.send, was.sync)}.`,
        caption:
          `Wrapping ${was.name} in ${ctor} gives ${now.name}. ${ctor} needs the type inside to be ${needs}, and ${was.name} is ${traits(was.send, was.sync)}, so ${now.name} is ${traits(now.send, now.sync)}.${why} ` +
          (moved
            ? `The point moves from “${QUADRANT[was.quadrant]}” to “${QUADRANT[now.quadrant]}”.`
            : `The point stays in “${QUADRANT[now.quadrant]}”.`) +
          (now.name === arcCell.name ? ' This is the opening’s x.' : ''),
      });
      await s.clearOverlays();
      if (!q) q = await s.show({ source: chart(points) }, { box: LEFT });
      const from = i === 1 ? was.name : valueName(was.name),
        to = valueName(now.name);
      points = [{ name: to, q: was.quadrant }];
      await q.morph({ source: chart(points) }, { ops: [{ kind: 'rename_point', from, to }] });
      if (moved) {
        points = [{ name: to, q: now.quadrant }];
        const [x, y] = SPOT[now.quadrant];
        await q.morph({ source: chart(points) }, { ops: [{ kind: 'move_point', label: to, x, y }] });
      }
      await q.focus([`plate:${now.quadrant}`], { zoom: ZOOM });
      this.state.built = now;
      // The wrapper and the type it wraps, which the column's lines state.
      this.state.wrap = { ctor, inside: was };
      await tell(q, to, now.send, now.sync, now.quadrant, (st) => [
        `${st.wrap.ctor} needs T: ${st.wrap.ctor === 'Arc' ? 'Send + Sync' : 'Send'}`,
        `T here: ${st.wrap.inside.name}`,
      ]);
    }

    // ------------------------------------------------------------------ what the thread APIs accept
    const run = threads(wrapper, inner);
    const both = run.spawnMove && run.scopeBorrow,
      none = !run.spawnMove && !run.scopeBorrow;
    await this.step('threads', {
      title: both
        ? 'Both thread APIs accept x'
        : none
          ? 'Neither thread API accepts x'
          : run.spawnMove
            ? 'thread::spawn accepts x; thread::scope cannot share it'
            : 'thread::scope can share x; thread::spawn cannot take it',
      line: `Here x is ${traits(run.spawnMove, run.scopeBorrow)}: spawn needs Send, scope Sync.`,
      // functions.rs:125-129: spawn needs F: Send + 'static. scoped.rs:201-204: Scope::spawn needs
      // F: Send + 'scope. The Reference (types/closure.md:734): a closure is Send if values it captures
      // by shared reference are Sync and values it captures by move are Send (marker.rs:105, :537).
      caption: `thread::spawn needs a Send closure, and a move closure that owns x is Send only if ${run.name} is. thread::scope lets threads borrow &x instead, and a closure holding &x is Send only if ${run.name} is Sync. rustc 1.99.1 ${
        both
          ? 'accepts both'
          : none
            ? 'rejects both'
            : run.spawnMove
              ? 'accepts the move and rejects the borrow'
              : 'accepts the borrow and rejects the move'
      } for x: ${run.name}.${inner === 'cell' && both ? ' The opening’s Cell can cross once a Mutex guards it.' : ''}`,
    });
    await s.clearOverlays();
    await q!.mark([`point:${valueName(run.name)}`], {
      color: both ? s.good : s.bad,
      as: both ? 'accepted' : 'rejected',
    });
    this.state.threads = run;
    await column(
      (st) => [
        ['spawn, needs Send', yesNo(st.threads.spawnMove)],
        ['scope, needs Sync', yesNo(st.threads.scopeBorrow)],
      ],
      'Compiles?',
    );
    await locator(layers.at(-1)!.quadrant);
  }
}

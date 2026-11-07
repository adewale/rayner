import { frames as readerFrames, FILE, files, prints, shellsPicture, shellsWords, commandLine, faded } from './picture.ts';
import type { Choreography, Transition, Diagram, PictureNote, View, CardRow } from '../../../explain/index.ts';
import { Scene, Text, Transform, AnimationGroup, Succession, FadeIn, FadeOut } from '../../../src/index.ts';
import type { Animation, Box, SceneState } from '../../../src/index.ts';
import { stage, regionBox, answerOf, Machine, view, Card, CodeBlock } from '../../../explain/index.ts';
import { exec } from './model.ts';
import type { Shell } from './model.ts';
import { sessionOfShells, sessionNextShell, scriptBound, BASH_EVENTS } from './model.ts';
import type { ShellSession, BashEvent } from './model.ts';
const STYLE = 'chalkboard';
const PIPELINE = [
  ['echo', 'hello'],
  ['tr', 'a-z', 'A-Z'],
] as const;
const q = (v: string) => JSON.stringify(v);
/** The word a diagram's mark gives its parts by default, in this explainer's language. */
const MARKED = 'marked';
/** How a diagram is shown besides its source, kept in `shown`: its marks (trails included) and its notes. */
type DiagramShown = { marks: Record<string, string | { color: string; as?: string }>; notes: PictureNote[] };
const PLAIN: DiagramShown = { marks: {}, notes: [] };
type Focus = number | [number, number] | null;
/** Ask the model whether it can run a command name. Pure: no animation inside the catch. */
function lookup(name: string): 'builtin' | 'unsupported' {
  try {
    exec({ fs: {}, steps: 0 }, [[name]]);
    return 'builtin';
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unknown model command')) return 'unsupported';
    throw error;
  }
}
const TOP = regionBox('top', { bottom: -0.2 }),
  BOTTOM = regionBox('bottom', { top: -0.5 }),
  BOTTOM_LEFT = regionBox('left', { top: -0.5 }),
  BOTTOM_RIGHT = regionBox('right', { top: -0.5 });
export default class BashExplainer extends Scene {
  static meta = {
    sources: [
      'https://github.com/elixir-ai-tools/just_bash',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/just-bash.ts',
    ],
    claims: [
      { says: 'leaves the shell you passed in unchanged', test: 'model.test.ts: exec leaves any shell it is given unchanged' },
      { says: 'only the returned one holds shout.txt', shown: true as const },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE }),
      ink = s.palette.ink,
      accent = s.emphasis;
    const old: Shell = { fs: {}, steps: 0 };
    // How each picture is shown, apart from the model: a code panel's focus, a diagram's marks and
    // notes, a card's lit row. That is `shown`, under each picture's name; views draw it.
    const shownOf = <T>(name: string) => this.shown[name] as T;
    const show = async (v: View, name: string, value: unknown, runTime = 0.45) => {
      this.shown = { ...this.shown, [name]: value };
      await this.play(v.sync({ match: 'key', staged: true, runTime }));
    };
    /** A code panel as s.code draws it, its focus bar on `shown[name]`. */
    const codePanel = async (lines: readonly string[], opts: { at: Box | 'side'; fontSize: number }, name: string) => {
      const v = view(this, (_st, sh) => new CodeBlock(this, s.palette, lines, { ...opts, focus: (sh[name] ?? null) as Focus, key: name }), { place: false });
      await s.enter(v, { runTime: 0.4 });
      return v;
    };
    const focus = (v: View, name: string, lines: Focus) => show(v, name, lines, 0.4);
    /** Diagram `d` shown by a view of `shown[name]`. */
    const diagramView = (d: Diagram, name: string) => {
      this.shown = { ...this.shown, [name]: PLAIN };
      return s.diagramView(d, (_st, sh) => sh[name] as DiagramShown);
    };
    /** These changes to how diagram `name` is shown, synced. */
    const showDiagram = (v: View, name: string, change: (was: DiagramShown) => Partial<DiagramShown>) =>
      show(v, name, { ...shownOf<DiagramShown>(name), ...change(shownOf<DiagramShown>(name)) });
    /** A walk's token, then its trail left in `shown[name]`, in `color` (the diagram's accent by default). */
    const walked = async (d: Diagram, v: View, name: string, hops: [string, string][], color?: string) => {
      await d.walk(hops);
      await showDiagram(v, name, (was) => ({ marks: { ...was.marks, ...d.trail(hops, color) } }));
    };
    const noted = (v: View, name: string, note: PictureNote) => showDiagram(v, name, (was) => ({ notes: [...was.notes, note] }));
    /** A card as s.card draws it, its lit row on `shown[name]`. */
    const cardView = async (rows: (st: SceneState, sh: SceneState) => readonly CardRow[], opts: Omit<ConstructorParameters<typeof Card>[3], 'lit' | 'key'>, name: string) => {
      const v = view(this, (st, sh) => new Card(this, s.palette, rows(st, sh), { ...opts, lit: (sh[name] ?? null) as string | null, key: name }), { place: false });
      await s.enter(v, { runTime: 0.35, shift: [0, -0.08] });
      return v;
    };
    // ── command: a line of text and a shell value ──────────────────────
    await s.steps(readerFrames(answerOf(this)), { kind: 'short' });
    await this.step('command', {
      kind: 'detail',
      title: 'A command line and the empty shell it runs on',
      line: 'Two commands, a pipe and a redirect; the shell starts with no files.',
      caption:
        'This executable model follows the JustBash example: a pipeline transforms strings and a redirect writes an in-memory filesystem. The shell starts as a plain value with no files.',
    });
    await s.clear();
    const parts: [string, string][] = [
      ['echo hello', 'command'],
      ['|', 'pipe'],
      ['tr a-z A-Z', 'command'],
      ['>', 'redirect'],
      [FILE, 'file'],
    ];
    const { line, roles } = commandLine(parts, ink, accent, s.soft);
    await s.enter(line, { runTime: 0.5 });
    await s.enter(roles, { runTime: 0.5 });
    const api = await codePanel(
      [
        `shell = { fs: ${JSON.stringify(old.fs)}, steps: ${old.steps} }`,
        'exec(shell, pipeline, redirect)',
        '  → { shell, stdout }',
      ],
      { at: BOTTOM, fontSize: 0.3 },
      'api',
    );
    await focus(api, 'api', 0);
    // ── parse: the command is a tree ────────────────────────────────────
    await this.step('parse', {
      kind: 'detail',
      title: 'The command line parses into a tree',
      line: 'Echo and tr sit under the pipeline; the redirect is not a command.',
      caption:
        'A script holds a pipeline of two commands, echo and tr; the redirect records where the final output goes. The tree becomes the arguments the executor receives.',
    });
    await s.clear();
    const ast = await s.show(
      {
        source:
          'graph TD\nScript[Script] --> Pipeline[Pipeline]\nPipeline --> Echo[echo hello]\nPipeline --> Tr[tr a-z A-Z]\nScript --> Redirect[redirect to shout.txt]',
      },
      { box: 'main' },
    );
    const astView = diagramView(ast, 'ast');
    const call = await codePanel(
      ['exec(shell,', '  [["echo", "hello"],', '   ["tr", "a-z", "A-Z"]],', `  "${FILE}")`],
      {
        at: 'side',
        fontSize: 0.3,
      },
      'call',
    );
    await showDiagram(astView, 'ast', () => ({ marks: { Echo: { color: ast.accent, as: MARKED }, Tr: { color: ast.accent, as: MARKED } } }));
    await focus(call, 'call', [1, 2]);
    await noted(astView, 'ast', { id: 'Redirect', text: 'not a command', side: 'below' });
    // ── reduce: stdout threads through the builtins ─────────────────────
    const afterEcho = exec(old, [PIPELINE[0]]).stdout,
      afterTr = exec(old, PIPELINE).stdout;
    await this.step('reduce', {
      kind: 'detail',
      title: 'A pipeline is a reduce over strings',
      line: `Echo sets stdout to ${q(afterEcho)}; tr turns it into ${q(afterTr)}.`,
      caption:
        'Start with empty text. Echo replaces it with hello and a newline, and tr uppercases it. The note under each builtin is stdout after it runs: one string handed to the next, with no kernel pipe between them.',
    });
    await s.clear();
    const flow = await s.show(
      {
        source: `graph LR\nInput[empty stdin] --> Echo[echo hello]\nEcho --> Tr[tr a-z A-Z]\nTr --> Output[stdout]`,
      },
      { box: TOP },
    );
    let flowView = diagramView(flow, 'flow');
    const loop = await codePanel(
      [
        'stdout = ""',
        'for each [name, ...args] in stages:',
        '  echo: stdout = args + "\\n"',
        '  tr:   stdout = upper(stdout)',
      ],
      { at: BOTTOM, fontSize: 0.3 },
      'loop',
    );
    await focus(loop, 'loop', 0);
    await walked(flow, flowView, 'flow', [['Input', 'Echo']]);
    await focus(loop, 'loop', 2);
    await noted(flowView, 'flow', { id: 'Echo', text: q(afterEcho), side: 'below' });
    await walked(flow, flowView, 'flow', [['Echo', 'Tr']]);
    await focus(loop, 'loop', 3);
    await noted(flowView, 'flow', { id: 'Tr', text: q(afterTr), side: 'below' });
    await walked(flow, flowView, 'flow', [['Tr', 'Output']]);
    const run = exec(old, PIPELINE, FILE);
    this.state = { oldShell: old, newShell: run.shell, stdout: run.stdout };
    // ── redirect: the write lands in a new value ────────────────────────
    await this.step('redirect', {
      title: 'The redirect writes into a copy, and exec returns the copy',
      line: `The returned shell holds ${FILE}; the original still has no files.`,
      caption:
        'The redirect stores HELLO in shout.txt and empties stdout, but the file does not go into the shell the caller passed in. exec copies that shell’s files into a new shell value, adds shout.txt there and returns it, so the original shell on the left still has no files and its step count is still 0.',
    });
    // The code panel goes, and the diagram's notes and trail with it; the live diagram takes the edit.
    this.shown = { ...this.shown, flow: PLAIN };
    await this.play(flowView.sync({ match: 'key', staged: true, runTime: 0.3 }), new FadeOut(loop, { runTime: 0.3 }));
    s.liveDiagram(flow);
    await flow.morph({
      source: `graph LR\nInput[empty stdin] --> Echo[echo hello]\nEcho --> Tr[tr a-z A-Z]\nTr --> File[${FILE}]`,
    });
    flowView = s.diagramView(flow, (_st, sh) => sh.flow as DiagramShown);
    await noted(flowView, 'flow', { id: 'File', text: q(run.shell.fs[FILE]!), side: 'below' });
    type Shells = { oldShell: Shell; newShell: Shell; stdout: string };
    const before = await cardView(
      (st) => [
        ['files', files((st as unknown as Shells).oldShell)],
        ['steps run', (st as unknown as Shells).oldShell.steps],
      ],
      { at: BOTTOM_LEFT, align: 'top', title: 'Original shell', fontSize: 0.3, width: 5.2 },
      'before',
    );
    // The returned shell's card starts as the copy exec makes, then shows what the redirect wrote.
    const after = await cardView(
      (st, sh) => {
        const { newShell, stdout } = st as unknown as Shells;
        return sh.written
          ? [
              ['files', files(newShell)],
              [FILE, q(newShell.fs[FILE]!)],
              ['steps run', newShell.steps],
              ['stdout', q(stdout)],
            ]
          : [
              ['files', files(old)],
              [FILE, '—'],
              ['steps run', old.steps],
              ['stdout', q(afterTr)],
            ];
      },
      { at: BOTTOM_RIGHT, align: 'top', title: 'Returned shell', fontSize: 0.3, width: 5.2 },
      'after',
    );
    await show(after, 'written', true);
    await show(after, 'after', FILE, 0.4);
    await show(before, 'before', 'files', 0.4);
    // ── lookup: names resolve through a policy ──────────────────────────
    await this.step('lookup', {
      kind: 'detail',
      title: 'The model runs echo, tr and cat and refuses ls',
      line: 'A name with no branch falls to the last line and throws.',
      caption:
        'Exec dispatches on the command name: echo, tr and cat each have a branch, and any other name, such as ls, falls through to the last line and throws “Unknown model command”.',
    });
    await s.clear();
    const names = ['echo', 'tr', 'cat', 'ls'],
      found = names.map((n) => [n, lookup(n)] as const);
    const policy = await s.show(
      {
        source:
          'graph LR\nName[command name] --> Builtin[look up the builtin]\nBuiltin --> Run[found: run on values]\nBuiltin --> Error[missing: refuse]',
      },
      { box: TOP },
    );
    const policyView = diagramView(policy, 'policy');
    const dispatch = await codePanel(
      [
        'if (name === "echo") …',
        'else if (name === "tr") …',
        'else if (name === "cat") …',
        'else throw Error("Unknown model command")',
      ],
      { at: BOTTOM, fontSize: 0.3 },
      'dispatch',
    );
    await walked(policy, policyView, 'policy', [
      ['Name', 'Builtin'],
      ['Builtin', 'Run'],
    ]);
    await noted(policyView, 'policy', {
      id: 'Run',
      text: found
        .filter(([, r]) => r === 'builtin')
        .map(([n]) => n)
        .join(' · '),
      side: 'above',
    });
    await walked(policy, policyView, 'policy', [['Builtin', 'Error']], s.bad);
    await noted(policyView, 'policy', {
      id: 'Error',
      text: found
        .filter(([, r]) => r === 'unsupported')
        .map(([n]) => n)
        .join(' · '),
      side: 'below',
    });
    await focus(dispatch, 'dispatch', 3);
    // ── cat: the same command against two shells ────────────────────────
    const chosen = run.shell,
      result = exec(chosen, [['cat', FILE]]),
      other = exec(old, [['cat', FILE]]);
    await this.step('cat', {
      kind: 'detail',
      title: 'cat reads the returned shell',
      line: `The returned shell has ${FILE}, so cat ${prints(result.stdout)}.`,
      caption:
        'Cat receives the returned shell, finds shout.txt and prints HELLO. The write is visible because the caller passed exec’s returned shell to this call; the original would print nothing.',
    });
    await s.clear();
    await s.code([`exec(${'returned'}, [["cat", "${FILE}"]])`], {
      at: regionBox('top', { bottom: 1.6 }),
      fontSize: 0.4,
    });
    const shellRows = (sh: Shell, out: string): CardRow[] => [
      ['files', files(sh)],
      [FILE, sh.fs[FILE] == null ? 'missing' : q(sh.fs[FILE]!)],
      ['cat stdout', q(out)],
    ];
    const oldResult = other.stdout,
      newResult = result.stdout;
    const oldCard = await s.card(shellRows(old, oldResult), { at: regionBox('left', { top: 1.3 }), title: 'Original shell', fontSize: 0.32 });
    // The returned shell's card is the one cat reads: its cat stdout row lights, from `shown`.
    const newCard = await cardView(() => shellRows(run.shell, newResult), { at: regionBox('right', { top: 1.3 }), title: 'Returned shell', fontSize: 0.32 }, 'picked');
    await this.play(new Transform(oldCard, faded(oldCard), { runTime: 0.4 }));
    await show(newCard, 'picked', 'cat stdout', 0.4);
    this.state.cat = result.stdout;
    // ── lesson: the shell as a chain of values ──────────────────────────
    const viaNew = exec(run.shell, [['cat', FILE]]).stdout,
      viaOld = exec(old, [['cat', FILE]]).stdout;
    await this.step('lesson', {
      title: 'Keep the returned shell: the caller holds both and can cat either',
      line: `On s1 cat ${prints(viaNew)}, on s0 it ${prints(viaOld)}; s0.fs is still ${JSON.stringify(old.fs)}.`,
      caption:
        'Call the starting shell s0 and the shell exec returned s1. exec gives back the next shell and leaves its input alone, so the caller holds both at once: cat on s1 prints HELLO and cat on s0 prints nothing. Code that passes s1 to the next command sees the file; code that keeps using s0 has lost it, although the command ran.',
    });
    await s.clear();
    // The caller's shells, drawn from the session: each command line is an event of a machine whose model is exec.
    const start = sessionOfShells();
    this.state = { ...start } as unknown as SceneState;
    const chain = view(this, (st) => shellsPicture(st as unknown as ShellSession, s), { place: false });
    const session = () => this.state as unknown as ShellSession;
    s.keep(chain, { describe: () => shellsWords(session()) });
    // Checked on every frame, and through every transition from every state rayner check reaches: whatever ran, s0
    // is the empty shell the caller started with, in the model and in the picture.
    this.addInvariant('s0 stays the empty shell', (scene) => {
      const st = scene.state as unknown as ShellSession;
      if (!Array.isArray(st.shells)) return false;
      if (JSON.stringify(st.shells[0]) !== JSON.stringify(old)) return `s0 is ${JSON.stringify(st.shells[0])}`;
      const said = chain.current.find('shell:0:files')?.family().filter((m): m is Text => m instanceof Text).map((t) => t.text) ?? [];
      if (said.length && said.join(' ') !== `files: ${files(old)}`) return `the picture says s0 holds ${said.join(' ')}`;
      return true;
    });
    await this.play(new FadeIn(chain, { runTime: 0.4 }));
    // The script's code, its focus bar on the line the lesson runs next: shown, set between replays.
    this.shown = { story: 0 };
    const story = view(
      this,
      (_st, sh) =>
        new CodeBlock(
          this,
          s.palette,
          [
            `s1 = exec(s0, pipeline, "${FILE}").shell`,
            `exec(s1, [["cat", "${FILE}"]]).stdout   // ${q(viaNew)}`,
            `exec(s0, [["cat", "${FILE}"]]).stdout   // ${q(viaOld)}`,
            `s0.fs                               // ${JSON.stringify(old.fs)}`,
          ],
          { at: BOTTOM, fontSize: 0.3, focus: sh.story as number, key: 'story' },
        ),
      { place: false },
    );
    const machine = new Machine<ShellSession, BashEvent>(this, {
      start,
      events: BASH_EVENTS,
      // What the player's buttons say: the script's lines as the reader would run them.
      labels: { RUN_PIPELINE: 'Run the pipeline', CAT_NEWEST: 'cat on the newest shell', CAT_S0: 'cat on s0', LS: 'ls' },
      next: sessionNextShell,
      bound: scriptBound,
      views: [chain],
      runTime: ({ event }) => (event === 'RUN_PIPELINE' ? 1.6 : 1.2),
      transition: Object.fromEntries(
        BASH_EVENTS.map((event) => [event, (t: Transition<ShellSession, BashEvent>) => commandRuns(t.choreograph(chain))]),
      ) as unknown as Record<BashEvent, (t: Transition<ShellSession, BashEvent>) => Animation>,
    });
    await s.enter(story, { runTime: 0.4 });
    // The lesson's three lines, in order: the write on s0, whose returned shell is kept, then cat on each shell.
    for (const [line, event] of [[0, 'RUN_PIPELINE'], [1, 'CAT_NEWEST'], [2, 'CAT_S0']] as const) {
      await focus(story, 'story', line);
      await this.play(machine.replay([event]));
    }
    await focus(story, 'story', 1);
  }
}

/**
 * A command line's motion: each part it adds comes in, in order. A new shell's box grows out of the box it was copied
 * from and its words follow; an arrow is drawn from where it starts; then what cat printed fades in under it.
 * Everything else lands with the rest. A command that adds nothing (cat run again on the same shell) only lands.
 */
function commandRuns(c: Choreography): Animation | AnimationGroup {
  const before = new Set(c.keys('from')), added = c.keys('to').filter((k) => !before.has(k));
  const moves: (Animation | AnimationGroup)[] = [];
  for (const key of added.filter((k) => /^shell:\d+:box$/.test(k))) {
    const i = Number(key.split(':')[1]);
    moves.push(new AnimationGroup([c.enter(`run:${i}`, { create: true }, { runTime: 0.7 }), c.enter(key, { from: `shell:${i - 1}:box` }, { runTime: 0.7 })]));
    moves.push(new AnimationGroup([c.enter(`shell:${i}:name`, {}, { runTime: 0.35 }), c.enter(`shell:${i}:files`, {}, { runTime: 0.35 })]));
  }
  for (const key of added.filter((k) => k.startsWith('cat:'))) {
    const i = key.split(':')[1];
    moves.push(c.enter(key, { create: true }, { runTime: 0.5 }));
    moves.push(c.enter(`out:${i}`, {}, { runTime: 0.4 }));
  }
  return new Succession([...moves, c.rest({ runTime: 0.4 })]);
}

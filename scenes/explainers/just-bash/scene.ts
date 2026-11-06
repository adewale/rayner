import { frames as readerFrames, FILE, files, prints, shellsPicture, shellsWords, commandLine, faded } from './picture.ts';
import { Scene, Text, Transform, AnimationGroup, Succession, FadeIn, Machine, view } from '../../../src/index.ts';
import type { Animation, Box, Choreography, SceneState, Transition } from '../../../src/index.ts';
import { stage, regionBox, answerOf } from '../../../explain/index.ts';
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
      { says: 'leaves the shell you passed in unchanged', test: 'test/explain-models.test.ts: exec leaves any shell it is given unchanged' },
      { says: 'only the returned one holds shout.txt', shown: true as const },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE }),
      ink = s.palette.ink,
      accent = s.emphasis;
    const old: Shell = { fs: {}, steps: 0 };
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
    const api = await s.code(
      [
        `shell = { fs: ${JSON.stringify(old.fs)}, steps: ${old.steps} }`,
        'exec(shell, pipeline, redirect)',
        '  → { shell, stdout }',
      ],
      { at: BOTTOM, fontSize: 0.3 },
    );
    await api.focus(0);
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
    const call = await s.code(
      ['exec(shell,', '  [["echo", "hello"],', '   ["tr", "a-z", "A-Z"]],', `  "${FILE}")`],
      {
        at: 'side',
        fontSize: 0.3,
      },
    );
    await ast.mark(['Echo', 'Tr']);
    await call.focus([1, 2]);
    await ast.note('Redirect', 'not a command', { side: 'below' });
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
    const loop = await s.code(
      [
        'stdout = ""',
        'for each [name, ...args] in stages:',
        '  echo: stdout = args + "\\n"',
        '  tr:   stdout = upper(stdout)',
      ],
      { at: BOTTOM, fontSize: 0.3 },
    );
    await loop.focus(0);
    await flow.walk([['Input', 'Echo']], { trail: true });
    await loop.focus(2);
    await flow.note('Echo', q(afterEcho), { side: 'below' });
    await flow.walk([['Echo', 'Tr']], { trail: true });
    await loop.focus(3);
    await flow.note('Tr', q(afterTr), { side: 'below' });
    await flow.walk([['Tr', 'Output']], { trail: true });
    const run = exec(old, PIPELINE, FILE);
    this.state = { oldShell: old, newShell: run.shell, stdout: run.stdout };
    // ── redirect: the write lands in a new value ────────────────────────
    await this.step('redirect', {
      title: 'The redirect writes into a copy, and exec returns the copy',
      line: `The returned shell holds ${FILE}; the original still has no files.`,
      caption:
        'The redirect stores HELLO in shout.txt and empties stdout, but the file does not go into the shell the caller passed in. exec copies that shell’s files into a new shell value, adds shout.txt there and returns it, so the original shell on the left still has no files and its step count is still 0.',
    });
    await s.clearOverlays();
    await flow.morph({
      source: `graph LR\nInput[empty stdin] --> Echo[echo hello]\nEcho --> Tr[tr a-z A-Z]\nTr --> File[${FILE}]`,
    });
    await flow.note('File', q(run.shell.fs[FILE]!), { side: 'below' });
    const before = await s.card(
      [
        ['files', files(old)],
        ['steps run', old.steps],
      ],
      { at: BOTTOM_LEFT, align: 'top', title: 'Original shell', fontSize: 0.3, width: 5.2 },
    );
    const after = await s.card(
      [
        ['files', files(old)],
        [FILE, '—'],
        ['steps run', old.steps],
        ['stdout', q(afterTr)],
      ],
      { at: BOTTOM_RIGHT, align: 'top', title: 'Returned shell', fontSize: 0.3, width: 5.2 },
    );
    await after.set({
      files: files(run.shell),
      [FILE]: q(run.shell.fs[FILE]!),
      'steps run': run.shell.steps,
      stdout: q(run.stdout),
    });
    await after.mark(FILE);
    await before.mark('files');
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
    const dispatch = await s.code(
      [
        'if (name === "echo") …',
        'else if (name === "tr") …',
        'else if (name === "cat") …',
        'else throw Error("Unknown model command")',
      ],
      { at: BOTTOM, fontSize: 0.3 },
    );
    await policy.walk(
      [
        ['Name', 'Builtin'],
        ['Builtin', 'Run'],
      ],
      { trail: true },
    );
    await policy.note(
      'Run',
      found
        .filter(([, r]) => r === 'builtin')
        .map(([n]) => n)
        .join(' · '),
      { side: 'above' },
    );
    await policy.walk([['Builtin', 'Error']], { trail: s.bad });
    await policy.note(
      'Error',
      found
        .filter(([, r]) => r === 'unsupported')
        .map(([n]) => n)
        .join(' · '),
      { side: 'below' },
    );
    await dispatch.focus(3);
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
    const shellCard = (sh: Shell, out: string, title: string, at: Box) =>
      s.card(
        [
          ['files', files(sh)],
          [FILE, sh.fs[FILE] == null ? 'missing' : q(sh.fs[FILE]!)],
          ['cat stdout', q(out)],
        ],
        { at, title, fontSize: 0.32 },
      );
    const oldResult = other.stdout,
      newResult = result.stdout;
    const oldCard = await shellCard(old, oldResult, 'Original shell', regionBox('left', { top: 1.3 })),
      newCard = await shellCard(run.shell, newResult, 'Returned shell', regionBox('right', { top: 1.3 }));
    const [picked, unpicked] = [newCard, oldCard];
    await this.play(new Transform(unpicked, faded(unpicked), { runTime: 0.4 }));
    await picked.mark('cat stdout');
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
    // What the picture marks: the shell the caller keeps, and what each cat printed.
    s.emphasise(() => {
      const st = session(), newest = st.shells.length - 1;
      return [
        [`shell:${newest}:box`, `kept: s${newest}`],
        ...st.cats.flatMap((c, i) => (c === null ? [] : [[`out:${i}`, `cat on s${i}: ${prints(c)}`] as const])),
      ];
    });
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
    const story = await s.code(
      [
        `s1 = exec(s0, pipeline, "${FILE}").shell`,
        `exec(s1, [["cat", "${FILE}"]]).stdout   // ${q(viaNew)}`,
        `exec(s0, [["cat", "${FILE}"]]).stdout   // ${q(viaOld)}`,
        `s0.fs                               // ${JSON.stringify(old.fs)}`,
      ],
      { at: BOTTOM, fontSize: 0.3 },
    );
    // The lesson's three lines, in order: the write on s0, whose returned shell is kept, then cat on each shell.
    for (const [line, event] of [[0, 'RUN_PIPELINE'], [1, 'CAT_NEWEST'], [2, 'CAT_S0']] as const) {
      await story.focus(line);
      await this.play(machine.replay([event]));
    }
    await story.focus(1);
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

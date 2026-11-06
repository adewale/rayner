import { frames as readerFrames, ANSWER } from '../lib/readers/just-bash.ts';
import { Scene, Text, Group, Rectangle, Transform, Arrow, AnimationGroup, Succession, FadeIn, Machine, choreograph, view } from '../../../src/index.ts';
import type { Animation, Box, Choreography, Mobject, SceneState, Transition } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
import { keyedParts } from '../../../explain/drawing.ts';
import { exec } from '../lib/models.ts';
import type { Shell } from '../lib/models.ts';
import { sessionOfShells, sessionNextShell, scriptBound, BASH_EVENTS } from '../lib/just-bash.ts';
import type { ShellSession, BashEvent } from '../lib/just-bash.ts';
const STYLE = 'chalkboard';
const PIPELINE = [
  ['echo', 'hello'],
  ['tr', 'a-z', 'A-Z'],
] as const;
const FILE = 'shout.txt';
const q = (v: string) => JSON.stringify(v);
const files = (sh: Shell) => Object.keys(sh.fs).join(', ') || 'none';
/** What cat's stdout amounts to, in words. */
const prints = (out: string) => (out ? `prints ${out.trim()}` : 'prints nothing');
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
/** The check answers, from the model: two writes from the same starting shell, a pipeline with no redirect, and ls. */
const CHECK = (() => {
  const empty: Shell = { fs: {}, steps: 0 },
    first = exec(empty, [['echo', 'hi']], 'a.txt').shell,
    second = exec(empty, [['echo', 'bye']], 'b.txt').shell,
    plain = exec(empty, PIPELINE);
  let ls = '';
  try {
    exec(first, [['ls']]);
  } catch (error) {
    ls = error instanceof Error ? error.message : String(error);
  }
  if (!('a.txt' in first.fs) || 'a.txt' in second.fs) throw new Error('a.txt should be in the first result alone');
  return { branch: { first: files(first), second: files(second) }, plain: { stdout: plain.stdout, files: files(plain.shell) }, ls };
})();
const TOP = regionBox('top', { bottom: -0.2 }),
  BOTTOM = regionBox('bottom', { top: -0.5 }),
  BOTTOM_LEFT = regionBox('left', { top: -0.5 }),
  BOTTOM_RIGHT = regionBox('right', { top: -0.5 });
export default class BashExplainer extends Scene {
  static meta = {
    id: 'just-bash',
    title: 'Why must you keep the returned shell?',
    sources: [
      'https://github.com/elixir-ai-tools/just_bash',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/just-bash.ts',
    ],
    // The script's answer; check holds reader-values to stating it.
    answer: ANSWER,
    claims: [
      { says: 'leaves the shell you passed in unchanged', test: 'test/explain-models.test.ts: exec leaves any shell it is given unchanged' },
      { says: 'only the returned one holds shout.txt', shown: true as const },
    ],
    // Commands no step runs, each answered by the same exec.
    checks: [
      {
        question: 'From the empty shell, a caller runs echo hi > a.txt and keeps the returned shell. Then it runs echo bye > b.txt on the empty shell again and keeps that result too. Which files does the second result hold, and where is a.txt?',
        answer: `The second result holds ${CHECK.branch.second} and nothing else. a.txt is in the first result, because the second command started from the empty shell, which never received the first write.`,
      },
      {
        question: 'Run echo hello | tr a-z A-Z with no redirect. What does exec print, and does the returned shell gain a file?',
        answer: `It prints ${q(CHECK.plain.stdout)}, and the returned shell holds ${CHECK.plain.files === 'none' ? 'no files' : CHECK.plain.files}. Without a redirect the text stays on standard output, so there is no write for the returned shell to carry.`,
      },
      {
        question: 'To check whether shout.txt exists, a caller runs ls on the returned shell. What happens, and what does that tell it about the file?',
        answer: `exec throws “${CHECK.ls}”, because this model has branches only for echo, tr and cat. The error says nothing about shout.txt; cat on the returned shell would print its contents.`,
      },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE }),
      ink = s.palette.ink,
      accent = s.emphasis;
    const old: Shell = { fs: {}, steps: 0 };
    // ── command: a line of text and a shell value ──────────────────────
    await s.steps(readerFrames(), { kind: 'short' });
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
    const tokens = parts.map(([t]) => new Text(t, { fontSize: 0.56, font: 'mono', color: ink }));
    const line = new Group(...tokens).arrange([1, 0], 0.42).moveTo([0, 1.9]);
    const roles = parts.map(([, role], i) => {
      const tok = tokens[i]!,
        [a, , b] = tok.box()!,
        isOp = role === 'pipe' || role === 'redirect';
      const bar = new Rectangle({
        width: Math.max(0.3, b - a),
        height: 0.035,
        fill: isOp ? accent : ink,
        stroke: 'none',
      }).moveTo([(a + b) / 2, 1.4]);
      const label = new Text(role, { fontSize: 0.24, color: isOp ? accent : s.soft }).moveTo([
        (a + b) / 2,
        1.05,
      ]);
      return new Group(bar, label);
    });
    await s.enter(line, { runTime: 0.5 });
    await s.enter(new Group(...roles), { runTime: 0.5 });
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
    const faded = unpicked.copy();
    faded.family().forEach((m, i) => {
      if (unpicked.family()[i] !== unpicked.bar) m.style.opacity = 0.4;
    });
    await this.play(new Transform(unpicked, faded, { runTime: 0.4 }));
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

// ---- the session's picture ------------------------------------------------------------------

/** Where each shell's box sits: s0 on the left, the shell the write returned to its right. */
const SHELL_X = [-4.5, 3.1],
  SHELL_Y = 2.25,
  OUT_Y = 0.2,
  BOX_W = 3.6,
  BOX_H = 1.1;

/**
 * The caller's shells drawn from the session: a box for each shell (the newest, which the caller keeps, outlined in
 * the accent), an arrow from s0 to the shell the write returned, and under each shell cat has read, an arrow to what it
 * printed. Every part is keyed, so a command's transition can bring in exactly what it adds.
 */
function shellsPicture(st: ShellSession, s: ReturnType<typeof stage>): Group {
  const ink = s.palette.ink, newest = st.shells.length - 1, { add, group } = keyedParts();
  st.shells.forEach((sh, i) => {
    const x = SHELL_X[i]!, kept = i === newest;
    add(new Rectangle({ width: BOX_W, height: BOX_H, cornerRadius: 0.12, fill: kept ? s.emphasis : ink, fillOpacity: kept ? 0.1 : 0.04, stroke: kept ? s.emphasis : s.soft, strokeWidth: kept ? 0.05 : 0.03 }).moveTo([x, SHELL_Y]), `shell:${i}:box`);
    add(new Text(`s${i}: ${i === 0 ? 'original' : 'returned'} shell`, { fontSize: 0.3, color: ink, weight: 'bold' }).moveTo([x, SHELL_Y + 0.2]), `shell:${i}:name`);
    add(new Text(`files: ${files(sh)}`, { fontSize: 0.28, font: 'mono', color: ink }).moveTo([x, SHELL_Y - 0.24]), `shell:${i}:files`);
    if (i > 0) {
      const arrow = new Arrow([SHELL_X[i - 1]! + BOX_W / 2 + 0.1, SHELL_Y], [x - BOX_W / 2 - 0.1, SHELL_Y], { stroke: s.emphasis, strokeWidth: 0.04, tipLength: 0.22, tipWidth: 0.18 });
      add(new Group(arrow, new Text('echo, tr, redirect', { fontSize: 0.26, color: ink }).moveTo([(SHELL_X[i - 1]! + x) / 2, SHELL_Y + 0.32])), `run:${i}`);
    }
  });
  st.cats.forEach((out, i) => {
    if (out === null) return;
    const x = SHELL_X[i]!, color = i === newest ? s.emphasis : s.soft;
    const arrow = new Arrow([x, SHELL_Y - BOX_H / 2 - 0.08], [x, OUT_Y + 0.3 + 0.08], { stroke: color, strokeWidth: 0.035, tipLength: 0.2, tipWidth: 0.16 });
    add(new Group(arrow, new Text(`cat ${FILE}`, { fontSize: 0.26, font: 'mono', color: ink, anchor: 'start' }).moveTo([x + 0.22, (SHELL_Y - BOX_H / 2 + OUT_Y + 0.3) / 2], [-1, 0])), `cat:${i}`);
    add(new Group(
      new Rectangle({ width: 3.0, height: 0.6, cornerRadius: 0.1, fill: s.palette.paper, stroke: color, strokeWidth: 0.03 }).moveTo([x, OUT_Y]),
      new Text(prints(out), { fontSize: 0.3, color: out ? ink : s.bad }).moveTo([x, OUT_Y]),
    ), `out:${i}`);
  });
  return group();
}

/** The session's picture in words. */
function shellsWords(st: ShellSession): string {
  const newest = st.shells.length - 1;
  return [
    ...st.shells.map((sh, i) => `s${i}, the ${i === 0 ? 'original' : 'returned'} shell${i === newest ? ', which the caller keeps' : ''}, holds files: ${files(sh)}`),
    ...st.shells.slice(1).map((_, k) => `An arrow from s${k} to s${k + 1}: echo, tr, redirect`),
    ...st.cats.flatMap((c, i) => (c === null ? [] : [`cat ${FILE} on s${i} ${prints(c)}`])),
  ].join('. ') + '.';
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

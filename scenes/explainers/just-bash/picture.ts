import { Arrow, Group, Rectangle, Text } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { exec } from './model.ts';
import type { Shell, ShellSession } from './model.ts';
import { flow, keyedParts, label, table, emphasised } from '../../../explain/drawing.ts';
import type { Stage, StagedStepsOptions } from '../../../explain/index.ts';

export const FILE = 'shout.txt';
export const files = (sh: Shell) => Object.keys(sh.fs).join(', ') || 'none';
/** What cat's stdout amounts to, in words. */
export const prints = (out: string) => (out ? `prints ${out.trim()}` : 'prints nothing');


export function frames(s: Stage, answer: string, opts?: StagedStepsOptions): Promise<void> {
  const original = { fs: {}, steps: 0 },
    run = exec(
      original,
      [
        ['echo', 'hello'],
        ['tr', 'a-z', 'A-Z'],
      ],
      'shout.txt',
    );
  const old = exec(original, [['cat', 'shout.txt']]).stdout,
    next = exec(run.shell, [['cat', 'shout.txt']]).stdout;
  return s.steps([
    {
      id: 'reader-pipeline',
      title: 'The command ran, yet cat finds nothing in shout.txt',
      line: 'Predict: where did HELLO go?',
      caption: `Run echo hello | tr a-z A-Z > shout.txt in a small in-memory shell. echo produces hello and a newline, tr uppercases it, and the redirect stores HELLO in shout.txt instead of printing it. Then run cat shout.txt on the shell you started with: it ${prints(old)}, and nothing reported an error. This model hands strings from command to command; it does not run an operating-system shell.`,
      state: { file: run.shell.fs['shout.txt']!, stdout: run.stdout, startingCat: old },
      draw: (st, s) =>
        new Group(
          flow(s, ['echo hello', `tr → ${st.file.trim()}`, 'shout.txt']),
          label('hello', -2.55, 2.25, s.emphasis, 0.65),
          label(st.file.trim(), 2.55, 2.25, s.emphasis, 0.65),
          label('cat shout.txt on the starting shell:', 0, -1.15, s.palette.ink, 0.62),
          label(prints(st.startingCat), 0, -2.05, s.bad, 0.7),
        ),
    },
    {
      id: 'reader-values',
      title: 'Answer: the file is in the shell exec returned',
      line: 'Same command, two shell values: only the returned one holds shout.txt.',
      caption: `In this model, ${answer}. cat ${prints(next)} with the returned shell and ${prints(old)} with the original, which still has no files. A caller that drops the return value has thrown away the shell that holds the write, although the command ran.`,
      state: { old, next, file: run.shell.fs['shout.txt']! },
      draw: (st, s) =>
        table(
          ['Shell', 'shout.txt', 'cat prints'],
          [
            ['original', 'missing', st.old.trim() || 'nothing'],
            ['returned', st.file.trim(), st.next.trim()],
          ],
          s,
          { xs: [-5, 0, 5], y: 2, gap: 1.6 },
        ),
    },
  ], opts);
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
export function shellsPicture(st: ShellSession, s: Stage): Group {
  const ink = s.palette.ink, newest = st.shells.length - 1, { add, group } = keyedParts();
  st.shells.forEach((sh, i) => {
    const x = SHELL_X[i]!, kept = i === newest;
    // What the picture marks is emphasis the phone's close-ups visit first and review holds to the
    // caption: the shell the caller keeps, and (below) what each cat printed.
    const box = new Rectangle({ width: BOX_W, height: BOX_H, cornerRadius: 0.12, fill: kept ? s.emphasis : ink, fillOpacity: kept ? 0.1 : 0.04, stroke: kept ? s.emphasis : s.soft, strokeWidth: kept ? 0.05 : 0.03 }).moveTo([x, SHELL_Y]);
    add(emphasised(box, kept ? `kept: s${i}` : null), `shell:${i}:box`);
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
    add(emphasised(new Group(
      new Rectangle({ width: 3.0, height: 0.6, cornerRadius: 0.1, fill: s.palette.paper, stroke: color, strokeWidth: 0.03 }).moveTo([x, OUT_Y]),
      new Text(prints(out), { fontSize: 0.3, color: out ? ink : s.bad }).moveTo([x, OUT_Y]),
    ), `cat on s${i}: ${prints(out)}`), `out:${i}`);
  });
  return group();
}

/** The session's picture in words. */
export function shellsWords(st: ShellSession): string {
  const newest = st.shells.length - 1;
  return [
    ...st.shells.map((sh, i) => `s${i}, the ${i === 0 ? 'original' : 'returned'} shell${i === newest ? ', which the caller keeps' : ''}, holds files: ${files(sh)}`),
    ...st.shells.slice(1).map((_, k) => `An arrow from s${k} to s${k + 1}: echo, tr, redirect`),
    ...st.cats.flatMap((c, i) => (c === null ? [] : [`cat ${FILE} on s${i} ${prints(c)}`])),
  ].join('. ') + '.';
}

/**
 * The command line as tokens in a row, and under each token a bar and its role: operators (the pipe and the
 * redirect) in the accent colour, everything else in ink with a soft label.
 */
export function commandLine(parts: readonly (readonly [string, string])[], ink: string, accent: string, soft: string): { line: Group; roles: Group } {
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
    const label = new Text(role, { fontSize: 0.24, color: isOp ? accent : soft }).moveTo([
      (a + b) / 2,
      1.05,
    ]);
    return new Group(bar, label);
  });
  return { line, roles: new Group(...roles) };
}

/** A copy of a card with everything but its bar faded to 40%: the shell not picked. */
export function faded<T extends Mobject & { bar: Mobject }>(card: T): Mobject {
  const copy = card.copy();
  copy.family().forEach((m, i) => {
    if (card.family()[i] !== card.bar) m.style.opacity = 0.4;
  });
  return copy;
}

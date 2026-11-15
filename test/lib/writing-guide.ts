// docs/WRITING.md builds scenes/tutorial/sort-as-text from `rayner init --blank`, stage by stage, and
// prints what `rayner check` says at each. This reads the guide's stages and builds each one in a
// folder as an author would have it, so test/explain-writing.test.ts can run the guide's own command
// there and compare what it prints with what the guide prints.
//
//   <!-- check: <stage> -->       before a ```text or ```json block: what `rayner check` prints at <stage>
//   <!-- draft: <stage> <file> --> before a ```diff block: <file> at <stage> is the finished file with
//                                  each hunk's `+` lines (and context) replaced by its `-` lines (and
//                                  context); hunks are separated by `@@` lines
//   <!-- receipt -->               before a ```text block: the page's receipt sentence for the script's Grounding line
//   <!-- review -->                before a ```text block: the counts `rayner review` prints
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { blankStarter, packageImports } from '../../tools/lib/explain-init.ts';

export const GUIDE = 'docs/WRITING.md';
/** The finished explainer the guide builds. */
export const FINISHED = 'scenes/tutorial/sort-as-text';
export const FINISHED_FILES = ['script.md', 'model.ts', 'model.test.ts', 'picture.ts', 'scene.ts'] as const;
/** The command line, run as the guide's `npx rayner`. */
export const CLI = join(import.meta.dirname, '../../tools/explain.ts');

export const guideText = (root = '.'): string => readFileSync(join(root, GUIDE), 'utf8');

/** The guide's `npx rayner init --blank` command: the folder it names and the question. */
export function initCommand(doc: string): { name: string; question: string } {
  const m = /^npx rayner init --blank (\S+) --question "([^"]+)"$/m.exec(doc);
  if (!m) throw new Error(`${GUIDE} prints no npx rayner init --blank <folder> --question "…" line`);
  return { name: m[1]!, question: m[2]! };
}

/** Each `<!-- check: stage -->` block, by stage: what the guide says `rayner check` prints there. */
export function printedOutputs(doc: string): Map<string, string> {
  return new Map([...doc.matchAll(/<!-- check: ([\w-]+) -->\n```(?:text|json)\n([\s\S]*?)```/g)].map((m) => [m[1]!, m[2]!]));
}

/** The block after `<!-- marker -->`. */
export function printedBlock(doc: string, marker: string): string | undefined {
  return new RegExp(`<!-- ${marker} -->\\n\`\`\`\\w*\\n([\\s\\S]*?)\`\`\``).exec(doc)?.[1];
}

/** Each draft diff: its stage, the finished file it changes, and its hunks as [finished text, draft text]. */
export function drafts(doc: string): { stage: string; file: string; hunks: [string, string][] }[] {
  return [...doc.matchAll(/<!-- draft: ([\w-]+) ([\w.-]+\/[\w.-]+) -->\n```diff\n([\s\S]*?)```/g)].map((m) => {
    const hunks = m[3]!.replace(/\n$/, '').split(/\n@@[^\n]*\n/).map((hunk): [string, string] => {
      const finished: string[] = [], draft: string[] = [];
      for (const line of hunk.split('\n')) {
        const [mark, text] = [line[0], line.slice(1)];
        if (mark === '+' || mark === ' ') finished.push(text);
        if (mark === '-' || mark === ' ') draft.push(text);
        if (mark !== '+' && mark !== '-' && mark !== ' ') throw new Error(`${GUIDE}: a diff line must start with +, - or a space: ${JSON.stringify(line)}`);
      }
      return [finished.join('\n'), draft.join('\n')];
    });
    return { stage: m[1]!, file: m[2]!, hunks };
  });
}

/** A finished file as the guide prints it: with package imports. */
export const finished = (file: string, root = '.'): string => packageImports(readFileSync(join(root, FINISHED, file), 'utf8'));

/** `text` with `from` replaced by `to`, where `from` occurs exactly once. */
function replaceOnce(text: string, from: string, to: string, where: string): string {
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + 1) >= 0) throw new Error(`${where}: the diff's finished lines must occur exactly once in the finished file:\n${from}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** The intent header's line for `label` in a script. */
const headerLine = (script: string, label: string) => script.split('\n').find((l) => l.startsWith(`- **${label}:**`))!;

/**
 * Write the guide's explainer at `stage` into `folder`/<name>, as a reader following the guide has it:
 * the stages before the picture from `rayner init --blank` and the finished files written so far (at
 * 'model', with the guide's wrong model), and every later stage from the finished files with that
 * stage's drafts applied.
 */
export async function buildStage(doc: string, stage: string, folder: string, root = '.'): Promise<string> {
  const { name, question } = initCommand(doc);
  const dir = join(folder, name);
  execFileSync(process.execPath, [CLI, 'init', '--blank', name, '--question', question], { cwd: folder, stdio: 'pipe' });
  const blank = blankStarter(question);
  const put = (file: string, text: string) => writeFile(join(dir, file), text);
  const script = finished('script.md', root);
  switch (stage) {
    case 'blank':
      return dir;
    case 'intent': {
      let text = script;
      for (const label of ['Checked against', 'Grounding']) text = text.replace(headerLine(text, label), headerLine(blank['script.md'], label));
      await put('script.md', text);
      return dir;
    }
    case 'grounded':
      await put('script.md', script);
      await put('model.ts', finished('model.ts', root));
      return dir;
    case 'model':
    case 'tested': {
      // The reader has the script, the model and its test, and still the blank scene init wrote.
      // At 'model' the model is the guide's first, wrong draft.
      const files: Record<string, string> = Object.fromEntries(['script.md', 'model.ts', 'model.test.ts'].map((f) => [f, finished(f, root)]));
      if (stage === 'model') applyDrafts(doc, stage, files);
      for (const [file, text] of Object.entries(files)) await put(file, text);
      return dir;
    }
  }
  const files: Record<string, string> = Object.fromEntries(FINISHED_FILES.map((f) => [f, finished(f, root)]));
  applyDrafts(doc, stage, files);
  for (const [file, text] of Object.entries(files)) await put(file, text);
  return dir;
}

/** Apply the guide's drafts for `stage` to `files`, a finished file's name to its text. */
function applyDrafts(doc: string, stage: string, files: Record<string, string>): void {
  for (const draft of drafts(doc).filter((d) => d.stage === stage)) {
    const file = draft.file.slice(draft.file.indexOf('/') + 1);
    if (!(file in files)) throw new Error(`${GUIDE}: draft ${stage} changes ${file}, which the reader has not written at that stage`);
    for (const [from, to] of draft.hunks) files[file] = replaceOnce(files[file]!, from, to, `${GUIDE}, draft ${stage} of ${draft.file}`);
  }
}

/** stderr without Node's own warnings: Node 24.0.0 prints an ExperimentalWarning for type stripping, and later 24.x releases do not. */
export const withoutNodeWarnings = (stderr: string) => stderr.replace(/^\(node:\d+\) ExperimentalWarning: .*\n(?:\(Use `node --trace-warnings .*\n)?/gm, '');

/** `rayner check` as the guide runs it, from `folder`: its exit status and what it printed. */
export function check(doc: string, folder: string) {
  const { name } = initCommand(doc);
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, 'check', `${name}/scene.ts`], { cwd: folder, encoding: 'utf8' });
  return { status, stdout, stderr: withoutNodeWarnings(stderr) };
}

/** The part of a passing check's report the guide prints: the oracle test's run and the first scenario's gates. */
export function reportExcerpt(stdout: string): string {
  const report = JSON.parse(stdout), first = report.scenarios[0];
  return JSON.stringify({ model: report.model, settings: first.settings, script: first.script, predictions: first.predictions, machines: first.machines }, null, 2) + '\n';
}

/** The counts the guide prints from `rayner review`'s receipt. */
export function reviewCounts(stdout: string): string {
  const { scenarios, stepWidths, liveStateWidths } = JSON.parse(stdout);
  return JSON.stringify({ scenarios, stepWidths, liveStateWidths }, null, 2) + '\n';
}

// docs/WRITING.md, the guide to writing an explainer from `rayner init --blank`, prints the finished
// explainer's files (test/explain-tutorial.test.ts holds them to scenes/tutorial/sort-as-text), and
// what `rayner check` prints at each stage of writing it. These tests build each stage as an author
// would have it, run the guide's own command there and compare: so the guide cannot drift from the
// tool. test/browser/explain-writing-review.test.ts does the same for `rayner review`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groundingSentence, parseGrounding } from '../explain/grounding.ts';
import { DOCS, docBlocks } from '../tools/repo/lib/docs-code.ts';
import { ROOT } from '../tools/lib/explain-project.ts';
import { FINISHED as FINISHED_DIR, FINISHED_FILES, GUIDE, buildStage, check, drafts, finished, guideText, initCommand, printedBlock, printedOutputs, reportExcerpt } from './lib/writing-guide.ts';

const doc = guideText();
const printed = printedOutputs(doc);
/** Every stage the guide shows `rayner check` at, in the order it shows them. */
const STAGES = ['blank', 'intent', 'grounded', 'model', 'tested', 'heading', 'phone', 'caption', 'motion', 'done'];

test('the guide shows rayner check at every stage, in order, and its finished explainer in full', () => {
  assert.deepEqual([...printed.keys()], STAGES);
  for (const draft of drafts(doc)) assert.ok(printed.has(draft.stage), `draft ${draft.stage} has no check output`);
  assert.deepEqual(new Set(drafts(doc).map((d) => d.stage)), new Set(['model', 'heading', 'phone', 'caption', 'motion']));
  assert.ok(DOCS.includes(GUIDE));
  const files = docBlocks(ROOT, GUIDE).map((b) => b.file);
  assert.deepEqual(files.sort(), FINISHED_FILES.map((f) => `sort-as-text/${f}`).sort(), 'the guide prints each finished file');
  // Its commands name the folder init made.
  const { name } = initCommand(doc);
  for (const line of doc.match(/^npx rayner (?:check|review|see) \S+/gm) ?? []) assert.ok(line.includes(` ${name}/scene.ts`), line);
});

for (const stage of STAGES)
  test(`rayner check at the guide's "${stage}" stage prints what the guide prints`, async () => {
    const folder = await mkdtemp(join(tmpdir(), `rayner-writing-${stage}-`));
    try {
      await buildStage(doc, stage, folder);
      const run = check(doc, folder);
      if (stage === 'done') {
        assert.equal(run.status, 0, run.stderr);
        assert.equal(reportExcerpt(run.stdout), printed.get(stage));
      } else {
        assert.equal(run.status, 1, `${stage} should fail`);
        // A code block holds no trailing blank line, so the comparison leaves the output's off.
        assert.equal(run.stderr.replace(/\n+$/, '\n'), printed.get(stage));
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

test('the guide prints the finished script\'s Checked against and Grounding lines, and the receipt the page makes of them', () => {
  const script = finished('script.md');
  const block = /This explainer's lines:\n\n```md\n([\s\S]*?)```/.exec(doc)?.[1];
  assert.ok(block, 'the guide prints the two lines');
  for (const line of block.trim().split('\n')) assert.ok(script.split('\n').includes(line), `script.md has ${line}`);
  const grounding = script.split('\n').find((l) => l.startsWith('- **Grounding:**'))!.replace('- **Grounding:** ', '');
  assert.equal(printedBlock(doc, 'receipt'), groundingSentence(parseGrounding(grounding)) + '\n');
});

test('the drawing kit\'s refusal the guide quotes is what words() throws', async () => {
  const { words } = await import('../explain/drawing.ts');
  const quoted = /\(`(words\(\): [^`]+)`\)/.exec(doc)?.[1];
  assert.ok(quoted);
  assert.throws(() => words({ look: { ink: '#000' } } as never, '10', { size: 0.3 }), { message: quoted });
});

test('the README and the tutorial point a new author at the guide', () => {
  for (const file of ['README.md', 'docs/TUTORIAL.md', 'skills/rayner-explainers/SKILL.md', 'docs/REFERENCE.md'])
    assert.match(readFileSync(file, 'utf8'), /WRITING\.md/, `${file} links the guide`);
});

test('"What it costs" counts the finished explainer\'s lines as they are', () => {
  const row = /^\| sort-as-text \(this guide\) \| live \| (.+) \|$/m.exec(doc)?.[1]?.split(' | ').map(Number);
  assert.ok(row, 'the guide counts sort-as-text');
  const lines = (file: string) => readFileSync(join(FINISHED_DIR, file), 'utf8').split('\n').length - 1;
  const files = ['script.md', 'model.ts', 'model.test.ts', 'scene.ts', 'picture.ts'];
  assert.deepEqual(row, [...files.map(lines), readdirSync(FINISHED_DIR).reduce((n, f) => n + lines(f), 0)]);
});

// rayner check's folder evidence (tools/lib/explain-evidence.ts): the model test it runs, the reader
// questions' answers it computes from the model, and the files the script's Checked against line names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkedAgainstFiles, compareAnswers, namedPaths, runModelTest } from '../tools/lib/explain-evidence.ts';
import { intentMeta, parseIntent } from '../explain/intent.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';

async function folder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-evidence-'));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), text);
  }
  return dir;
}

test('the model test beside the scene runs in a child process: its count, and each failing test by name and first lines', async () => {
  const dir = await folder({
    'model.test.ts': [
      "import { test, describe } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { isRefusal } from 'rayner/explain';",
      "test('holds', () => assert.equal(isRefusal({ refused: 'no' }), false));",
      "describe('a suite', () => { test('fails', () => assert.equal(1 + 1, 3)); test('also holds', () => {}); });",
      "test.skip('skipped', () => {});",
    ].join('\n'),
  });
  try {
    // From a folder with no Rayner installed, `rayner` is the Rayner running the check.
    const report = await runModelTest(join(dir, 'scene.ts'));
    assert.equal(report?.tests, 3);
    assert.equal(report?.passed, 2);
    assert.equal(report?.skipped, 1, 'the skipped test is counted apart');
    assert.equal(report?.failed.length, 1);
    assert.match(report!.failed[0]!, /^a suite > fails \(Expected values to be strictly equal: 2 !== 3\)$/);
    assert.equal(await runModelTest(join(tmpdir(), 'no-such-explainer', 'scene.ts')), undefined, 'no model test, no report');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a model test that cannot load fails the run, saying so', async () => {
  const dir = await folder({ 'model.test.ts': "import { nothing } from './missing.ts';\nnothing();\n" });
  try {
    const report = await runModelTest(join(dir, 'scene.ts'));
    assert.equal(report?.passed, 0);
    assert.equal(report?.failed.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('answers.ts holds the script’s answer and its reader questions’ answers, by number or by question, as the answer gate compares them', async () => {
  const meta = {
    answer: 'Seven moves',
    questions: [
      { question: 'How many for 4 disks?', answer: '15: the three-disk tower twice, and disk 4 once.' },
      { question: 'And for five?', answer: '31.' },
    ],
  };
  const scene = join(import.meta.dirname, 'scene.ts'); // a folder with answers.ts: this one has none
  assert.equal(await compareAnswers(scene, meta, async () => ({})), undefined);
  const dir = await folder({ 'answers.ts': '' });
  try {
    const at = join(dir, 'scene.ts');
    const n = 4;
    const right = await compareAnswers(at, meta, async () => ({
      answer: () => 'seven moves.',
      questions: { 1: () => ({ question: `How many for ${n} disks?`, answer: `${2 ** n - 1}: the three-disk tower twice, and disk ${n} once` }), 'And for five?': () => `${2 ** 5 - 1}` },
    }));
    assert.deepEqual(right?.problems, []);
    assert.equal(right?.compared, 3);
    const wrong = await compareAnswers(at, meta, async () => ({
      answer: () => 'Eight moves',
      questions: { 1: () => ({ question: 'How many for three disks?', answer: '15: the three-disk tower twice, and disk 4 once.' }), 2: () => '32', 3: () => 'none', 'And for six?': () => '63', },
    }));
    assert.deepEqual(wrong?.problems, [
      'The answer: script.md says "Seven moves", the model gives "Eight moves"',
      'Question 1: script.md says "How many for 4 disks?", the model gives "How many for three disks?"',
      'The answer to question 2 ("And for five?"): script.md says "31.", the model gives "32"',
      'answers.ts computes question 3, and the script asks 2',
      'answers.ts computes the answer to "And for six?", and the script asks no such question',
    ]);
    const empty = await compareAnswers(at, meta, async () => ({ answers: {} }));
    assert.deepEqual(empty?.problems, ['answers.ts exports neither answer nor questions']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a backticked path in Checked against must be in the explainer’s folder; code in backticks is not a path', async () => {
  assert.deepEqual(
    namedPaths('XState in `fixtures/x.json` and `model.test.ts`; `rate.NewLimiter(r, 5).AllowN`, `req.ip`, `hd2ae`, `int(\'²\')`, `oracle/token-bucket/` and https://example.com/a.json'),
    ['fixtures/x.json', 'model.test.ts', 'oracle/token-bucket/'],
  );
  const dir = await folder({ 'model.test.ts': '', 'fixtures/x.json': '{}', 'oracle/run.py': '' });
  try {
    const at = join(dir, 'scene.ts');
    assert.deepEqual(await checkedAgainstFiles(at, 'Its vectors in `fixtures/x.json`, run by `oracle/run.py`, in `model.test.ts`; the folder `oracle/`.'), {
      files: ['fixtures/x.json', 'oracle/run.py', 'model.test.ts', 'oracle/'],
      problems: [],
    });
    const { problems } = (await checkedAgainstFiles(at, 'In `test/explain-x.test.ts`, `../lib/format.ts` and `/etc/hosts.txt`.'))!;
    assert.equal(problems.length, 3);
    assert.match(problems[0]!, /^`test\/explain-x\.test\.ts` is not in the explainer's folder/);
    assert.match(problems[1]!, /^`\.\.\/lib\/format\.ts` is outside the explainer's folder/);
    assert.match(problems[2]!, /^`\/etc\/hosts\.txt` is outside the explainer's folder/);
    assert.equal(await checkedAgainstFiles(at, undefined), undefined, 'no intent, nothing to hold');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('every explainer’s Checked against line names its evidence by files in its own folder, each there', async () => {
  const dirs = [...EXPLAINERS.map((e) => `scenes/explainers/${e.id}`), 'scenes/tutorial/door', 'scenes/tutorial/hanoi', 'scenes/tutorial/lru-mru'];
  const named: string[] = [];
  for (const dir of dirs) {
    const file = join(dir, 'script.md');
    const { checkedAgainst } = intentMeta(parseIntent(readFileSync(file, 'utf8'), file)!);
    const report = await checkedAgainstFiles(join(dir, 'scene.ts'), checkedAgainst);
    assert.deepEqual(report?.problems, [], dir);
    assert.ok(report!.files.length > 0, `${dir}: Checked against names no file of the folder`);
    named.push(...report!.files.map((f) => `${dir}/${f}`));
  }
  assert.ok(named.length >= dirs.length, `${named.length} files named`);
});

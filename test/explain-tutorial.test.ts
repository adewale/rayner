import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { BLANK_FILES, MACHINE_STARTER_FILES, STARTER_FILES, packageImports } from '../tools/lib/explain-init.ts';
import { parseIntent } from '../explain/intent.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { DOCS, docBlocks } from '../tools/repo/lib/docs-code.ts';
import type { Picture } from '../explain/trace.ts';
import { assertStepState, assertSteps } from '../explain/testing.ts';
import { run } from '../scenes/tutorial/lru-mru/model.ts';
import { withoutNodeWarnings } from './lib/writing-guide.ts';
// The tutorials' own model tests (Wikipedia's worked LRU and MRU examples, every door event from every
// state, no Hanoi route shorter than 7 or 15 moves) run beside them: npm test runs scenes/*/*/*.test.ts,
// and rayner check runs each folder's model.test.ts.

const DIR = 'scenes/tutorial/lru-mru/';

test('`rayner init` writes the tutorial\'s explainer as it is checked in, with package imports', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-init-'));
  try {
    execFileSync(process.execPath, ['tools/explain.ts', 'init', join(folder, 'lru-mru')], { stdio: 'pipe' });
    assert.deepEqual((await readdir(join(folder, 'lru-mru'))).sort(), [...STARTER_FILES].sort());
    for (const file of STARTER_FILES) {
      const written = readFileSync(join(folder, 'lru-mru', file), 'utf8');
      assert.equal(written, packageImports(readFileSync(DIR + file, 'utf8')), `${file} is the checked-in file with package imports`);
      assert.doesNotMatch(written, /\.\.\/\.\.\/\.\.\//, `${file} has no repository imports`);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('`rayner init --machine` writes the machine starter, and `rayner check` passes it as written', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-init-machine-'));
  try {
    const dir = join(folder, 'door');
    execFileSync(process.execPath, ['tools/explain.ts', 'init', '--machine', dir], { stdio: 'pipe' });
    assert.deepEqual((await readdir(dir)).sort(), [...MACHINE_STARTER_FILES].sort());
    for (const file of MACHINE_STARTER_FILES) {
      const written = readFileSync(join(dir, file), 'utf8');
      assert.equal(written, packageImports(readFileSync('scenes/tutorial/door/' + file, 'utf8')), `${file} is the checked-in file with package imports`);
      assert.doesNotMatch(written, /\.\.\/\.\.\/\.\.\//, `${file} has no repository imports`);
    }
    // What it starts from: a model that refuses with reasons, a view of the state, and a live last step.
    assert.match(readFileSync(join(dir, 'model.ts'), 'utf8'), /refuse\('the door is locked, so unlock it first'\)/);
    const report = JSON.parse(execFileSync(process.execPath, ['tools/explain.ts', 'check', join(dir, 'scene.ts'), '--out', join(folder, 'checks')], { encoding: 'utf8' }));
    // check runs the model test beside the scene, which imports rayner: from a folder that installs
    // no Rayner, the Rayner running the check.
    assert.deepEqual(report.model, { file: join(dir, 'model.test.ts'), tests: 2, passed: 2 });
    const scenario = report.scenarios[0];
    assert.deepEqual(scenario.machines, [{ events: ['open', 'close', 'lock', 'unlock'], states: 3 }]);
    assert.deepEqual(scenario.claims.scope, [], 'no sweeping sentence goes unbacked');
    // An option for init alone.
    assert.throws(() => execFileSync(process.execPath, ['tools/explain.ts', 'check', join(dir, 'scene.ts'), '--machine'], { stdio: 'pipe' }), /--machine is an option of rayner init alone/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

/** `rayner check` on a folder, as a reader of its output sees it: the exit status and what it printed. */
const checkFolder = (dir: string, out: string) => {
  const { status, stdout, stderr } = spawnSync(process.execPath, ['tools/explain.ts', 'check', join(dir, 'scene.ts'), '--out', out], { encoding: 'utf8' });
  return { status, stdout, stderr: withoutNodeWarnings(stderr) };
};
/** The labels of a script's intent header, in order. */
const labels = (script: string) => [...script.matchAll(/^- \*\*([^*:]+):\*\*/gm)].map((m) => m[1]);
const BLANK_HEADER = ['Reader', 'Answer', 'Changed condition', "Reader's own work", 'Checked against', 'Grounding', 'Leaves out'];
/** What `rayner check` lists to do on a fresh `rayner init --blank`, in order. */
const BLANK_TODO = [
  "script.md: fill in the intent header: write the # question, Reader, Answer, Changed condition, Reader's own work, Leaves out, Check yourself question 1 and Why this explainer in place of each TODO",
  'script.md: write Checked against and Grounding: the real system model.test.ts compares the model with, and how (live, recorded, read or none, then the system and its version)',
  'model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)',
  'scene.ts: step "start" still says TODO in its title, line and caption: draw the model\'s state and say what the picture shows',
];
/** The failure `rayner check` prints for these to-do items, numbered from 1. */
const todoOutput = (items: readonly string[]) =>
  ['rayner: This explainer still has placeholders, each marked TODO:. To do, in order:', ...items.map((item, i) => `${i + 1}. ${item}`)].join('\n') + '\n';

test('`rayner init --blank` writes an explainer to write: an unfilled intent header, a model stub, a failing oracle test and a one-step scene', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-init-blank-'));
  try {
    const dir = join(folder, 'mine');
    const said = execFileSync(process.execPath, ['tools/explain.ts', 'init', '--blank', dir], { encoding: 'utf8' });
    assert.match(said, /the script's intent header, its Checked against and Grounding lines, the model's oracle test, then the picture/);
    assert.deepEqual((await readdir(dir)).sort(), [...BLANK_FILES].sort());
    const read = (file: string) => readFileSync(join(dir, file), 'utf8');
    // Every labelled line of the header is there, and says what to write instead of saying it.
    const script = read('script.md');
    assert.deepEqual(labels(script), BLANK_HEADER);
    const intent = parseIntent(script)!;
    assert.match(intent.question, /^TODO: /);
    for (const label of BLANK_HEADER) assert.match(intent.fields[label]!, /^TODO: \S/, label);
    assert.match(intent.questions[0]!.question + intent.questions[0]!.answer, /^TODO: .+TODO: /);
    // The oracle test fails, saying what to do; the scene imports the package and draws the model's state.
    assert.match(read('model.test.ts'), /assert\.fail\('TODO: replace this placeholder with a comparison of the model against something real/);
    assert.match(read('scene.ts'), /^import \{ Scene, Text \} from 'rayner';\nimport \{ stage, view \} from 'rayner\/explain';\nimport \{ start, type State \} from '\.\/model\.ts';/);
    // --question seeds the title.
    const asked = join(folder, 'asked');
    execFileSync(process.execPath, ['tools/explain.ts', 'init', '--blank', '--question', 'Why does [10, 9, 1].sort() give [1, 10, 9]?', asked], { stdio: 'pipe' });
    assert.match(readFileSync(join(asked, 'script.md'), 'utf8'), /^# Why does \[10, 9, 1\]\.sort\(\) give \[1, 10, 9\]\?\n\n- \*\*Reader:\*\* TODO: /);
    // Options of init --blank alone, and not with --machine; a refused option writes nothing.
    const refused = (args: string[], message: RegExp) => {
      const run = spawnSync(process.execPath, ['tools/explain.ts', ...args], { encoding: 'utf8' });
      assert.equal(run.status, 1, args.join(' '));
      assert.match(run.stderr, message);
    };
    refused(['init', '--blank', '--machine', join(folder, 'both')], /takes --blank or --machine, not both/);
    refused(['init', '--question', 'Why?', join(folder, 'tutorial')], /--question is an option of rayner init --blank alone/);
    refused(['init', '--blank', '--question', ' ', join(folder, 'empty')], /--question takes the reader's question as one line of text/);
    refused(['check', join(dir, 'scene.ts'), '--blank'], /--blank is an option of rayner init alone/);
    assert.deepEqual((await readdir(folder)).sort(), ['asked', 'mine']);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('`rayner check` fails a fresh blank explainer with what is left to write, in order, and passes it once every placeholder is filled with a real subject', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-init-blank-check-'));
  try {
    const dir = join(folder, 'sort-as-text'), out = join(folder, 'checks');
    execFileSync(process.execPath, ['tools/explain.ts', 'init', '--blank', dir], { stdio: 'pipe' });
    const blankScript = readFileSync(join(dir, 'script.md'), 'utf8'), blankTest = readFileSync(join(dir, 'model.test.ts'), 'utf8');
    // The fixture fills every placeholder: Array.prototype.sort with no compare function, its model
    // checked live against Node's own sort.
    const filled = (file: string) => packageImports(readFileSync(join('test/fixtures/blank-filled', file), 'utf8'));
    const fill = (file: string, text = filled(file)) => writeFile(join(dir, file), text);
    assert.deepEqual(labels(filled('script.md')), labels(blankScript), 'the fixture fills the blank header line by line');

    let run = checkFolder(dir, out);
    assert.equal(run.status, 1);
    assert.equal(run.stderr, todoOutput(BLANK_TODO));
    // The header written, but not yet what the model is checked against: the evidence comes next.
    const line = (script: string, label: string) => script.split('\n').find((l) => l.startsWith(`- **${label}:**`))!;
    let script = filled('script.md');
    for (const label of ['Checked against', 'Grounding']) script = script.replace(line(script, label), line(blankScript, label));
    await fill('script.md', script);
    assert.equal(checkFolder(dir, out).stderr, todoOutput(BLANK_TODO.slice(1)));
    // Then the model's oracle test, then the picture.
    await fill('script.md');
    assert.equal(checkFolder(dir, out).stderr, todoOutput(BLANK_TODO.slice(2)));
    await fill('model.ts');
    await fill('model.test.ts');
    assert.equal(checkFolder(dir, out).stderr, todoOutput(BLANK_TODO.slice(3)));
    // A filled picture over the placeholder oracle test still fails, by the model test.
    await fill('scene.ts');
    await fill('model.test.ts', blankTest);
    run = checkFolder(dir, out);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^rayner: The model test fails \(.*model\.test\.ts\): the model agrees with the real system \(TODO: replace this placeholder with a comparison of the model against something real/);
    // Every placeholder filled: check passes, with the oracle test run and the answer stated.
    await fill('model.test.ts');
    run = checkFolder(dir, out);
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.deepEqual([report.model.tests, report.model.passed], [1, 1]);
    assert.deepEqual(report.scenarios[0].script.answer, { step: 'start', at: 1 });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('the tutorial\'s "Start your own" prints the command whose to-do list docs/WRITING.md prints', async () => {
  const doc = readFileSync('docs/TUTORIAL.md', 'utf8');
  const section = doc.slice(doc.indexOf('## Start your own\n'), doc.indexOf('\n## Next'));
  const [, dir, question] = /^npx rayner init --blank (\S+) --question "([^"]+)"$/m.exec(section)!;
  // explain-writing.test.ts holds WRITING.md's copy of the list to what check prints.
  const writing = readFileSync('docs/WRITING.md', 'utf8');
  const printed = /<!-- check: blank -->\n```text\n([\s\S]*?)```/.exec(writing)![1];
  const folder = await mkdtemp(join(tmpdir(), 'rayner-init-blank-doc-'));
  try {
    execFileSync(process.execPath, ['tools/explain.ts', 'init', '--blank', join(folder, dir!), '--question', question!], { stdio: 'pipe' });
    assert.equal(checkFolder(join(folder, dir!), join(folder, 'checks')).stderr, printed);
    // The README's command is the tutorial's.
    assert.ok(readFileSync('README.md', 'utf8').includes(`npx rayner init --blank ${dir} --question "${question}"\nnpx rayner check ${dir}/scene.ts\n`));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('the machine starter is live at its last step, from a state that refuses open with its reason and takes unlock', async () => {
  const project = await collectProject('scenes/tutorial/door/', { write: false });
  const [scenario] = project.scenarios;
  const live = scenario!.live!.get('locked')!;
  assert.deepEqual([...scenario!.live!.keys()], ['locked']);
  assert.deepEqual(live.machine.outcome({ door: 'locked' }, 'open'), { refused: 'the door is locked, so unlock it first' });
  assert.deepEqual(live.machine.outcome({ door: 'locked' }, 'unlock'), { next: { door: 'closed' } });
  assertStepState(scenario!.trace, 'locked', { door: 'locked' });
});

const SEQ = { loop: [...'ABCDABCD'], reuse: [...'ABCDCDCD'] };

test('each scenario shows the counts, evictions and cache contents the model gives', async () => {
  const project = await collectProject(DIR, { write: false });
  assert.deepEqual(project.scenarios.map((v) => v.values.next).sort(), ['loop', 'reuse']);
  for (const { values, trace } of project.scenarios) {
    assertSteps(trace, ['full', 'evict', 'rest', 'verdict']);
    const requests = SEQ[values.next as keyof typeof SEQ];
    for (const [step, n] of [['full', 3], ['evict', 4], ['rest', 8], ['verdict', 8]] as const) {
      // One card, one column per policy: [LRU, MRU] in each row.
      const both = (cell: (r: ReturnType<typeof run>) => string) => (['lru', 'mru'] as const).map((p) => cell(run(p, 3, requests).slice(0, n)));
      const hits = (done: ReturnType<typeof run>) => done.filter((r) => r.hit).map((r) => r.key);
      const expected = {
        Requests: requests.slice(0, n).join(' '),
        'Newest first': both((done) => done.at(-1)!.cache.join(' ')),
        Evicted: both((done) => done.flatMap((r) => r.evicted ?? []).join(' ') || 'none'),
        Hits: both((done) => (hits(done).length ? `${hits(done).length}: ${hits(done).join(' ')}` : '0')),
      };
      assertStepState(trace, step, expected);
      // Read the card's own description, independently of the scene's copied model state.
      const picture = trace.steps.find((s) => s.step === step)!.shown?.picture as Picture | undefined;
      assert.ok(picture, `${values.next}.${step} has a resting picture`);
      assert.equal(picture.entries.length, 1, 'one comparison card');
      const entry = picture.entries[0]!;
      const shown = [...entry.items, ...Object.values(entry.marked ?? {}).flat()];
      const wanted = Object.entries({ ...expected, Slots: 3 }).flatMap(([label, value]) =>
        Array.isArray(value) ? value.map((cell, j) => `${label} (${['LRU', 'MRU'][j]}): ${cell}`) : [`${label}: ${value}`],
      );
      // Emphasis groups change the reading order, but every row/column binding must agree.
      assert.deepEqual(shown.sort(), wanted.sort(), `${values.next}.${step} card disagrees with the model`);
    }
  }
});

test('the hand-written captions say what the model does', async () => {
  const project = await collectProject(DIR, { write: false });
  const meta = (next: string, step: string) =>
    project.scenarios.find((v) => v.values.next === next)!.trace.steps.find((s) => s.step === step)!.meta as Record<string, string>;
  // Both scenarios: "both hold C, B, A"; on D, "LRU drops A ... MRU drops C".
  for (const next of ['loop', 'reuse'] as const) {
    const lru = run('lru', 3, SEQ[next]), mru = run('mru', 3, SEQ[next]);
    assert.deepEqual([lru[2]!.cache, mru[2]!.cache], [['C', 'B', 'A'], ['C', 'B', 'A']]);
    assert.deepEqual([lru[3]!.evicted, mru[3]!.evicted], ['A', 'C']);
    assert.match(meta(next, 'evict').line!, /LRU drops A, the oldest; MRU drops C, the newest/);
  }
  // Loop: each item LRU evicts is the next one the loop asks for; all eight miss.
  // MRU evicted C for D, so on the second pass A, B and D hit and only C misses.
  const loopLru = run('lru', 3, SEQ.loop), loopMru = run('mru', 3, SEQ.loop);
  loopLru.forEach((r, i) => r.evicted && assert.equal(r.evicted, 'ABCD'[(i + 1) % 4], `eviction at request ${i + 1}`));
  assert.ok(loopLru.every((r) => !r.hit));
  assert.deepEqual(loopMru.slice(4).map((r) => (r.hit ? r.key : `miss ${r.key}`)), ['A', 'B', 'miss C', 'D']);
  assert.match(meta('loop', 'rest').caption!, /all eight requests miss.*A, B and D hit and only C misses/);
  // Reuse: LRU still holds C and D after evicting A, so all four repeats hit. MRU evicts the item
  // requested just before, which is always the next one requested, so all four repeats miss.
  const reuseLru = run('lru', 3, SEQ.reuse), reuseMru = run('mru', 3, SEQ.reuse);
  assert.ok(['C', 'D'].every((k) => reuseLru[3]!.cache.includes(k)));
  assert.ok(reuseLru.slice(4).every((r) => r.hit));
  reuseMru.forEach((r, i) => {
    if (!r.evicted) return;
    assert.equal(r.evicted, SEQ.reuse[i - 1], `request ${i + 1} evicts the item requested just before`);
    if (i + 1 < SEQ.reuse.length) assert.equal(SEQ.reuse[i + 1], r.evicted, `which request ${i + 2} asks for`);
  });
  assert.ok(reuseMru.slice(4).every((r) => !r.hit));
  assert.match(meta('reuse', 'rest').caption!, /all four repeats hit.*all four repeats miss/);
  // The loop's ending: "Four items do not fit in three slots". With four slots the loop fits,
  // and both policies hit on every repeat, so the gap needs a loop larger than the cache.
  for (const policy of ['lru', 'mru'] as const) assert.equal(run(policy, 4, SEQ.loop).filter((r) => r.hit).length, 4);
  assert.match(meta('loop', 'verdict').caption!, /MRU hits 3 times and LRU 0/);
  assert.match(meta('reuse', 'verdict').caption!, /LRU hits 4 times and MRU 0/);
});

test('the README and the tutorial print each tutorial file exactly as it is checked in, with package imports', () => {
  const printed = DOCS.flatMap((doc) => docBlocks(ROOT, doc).map((b) => ({ ...b, doc })));
  // What each guide must print: the tutorial's whole explainer, and the README's Hanoi.
  for (const file of STARTER_FILES) assert.ok(printed.some((b) => b.doc === 'docs/TUTORIAL.md' && b.file === `lru-mru/${file}`), `docs/TUTORIAL.md prints lru-mru/${file}`);
  for (const file of ['script.md', 'model.ts', 'scene.ts']) assert.ok(printed.some((b) => b.doc === 'README.md' && b.file === `hanoi/${file}`), `README.md prints hanoi/${file}`);
  for (const b of printed) assert.equal(b.shown, b.source, `${b.doc} prints ${b.file} as checked in; run node tools/repo/docs-code.ts --write`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MACHINE_STARTER_FILES, STARTER_FILES, packageImports } from '../tools/lib/explain-init.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { DOCS, docBlocks } from '../tools/repo/lib/docs-code.ts';
import type { Picture } from '../explain/trace.ts';
import { assertStepState } from './lib/explainer-state.ts';
import { assertSteps } from './lib/steps.ts';
import { run } from '../scenes/tutorial/lru-mru/model.ts';
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

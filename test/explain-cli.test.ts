import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { traceScene } from '../src/index.ts';
import { collectProject, defaultVariant, ROOT } from '../tools/lib/explain-project.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { seeStep, seeText } from '../tools/lib/explain-see.ts';
import { describeExplainer } from '../explain/index.ts';
import { describeCase } from '../explain/describe.ts';
import type { CaseDescription } from '../explain/index.ts';

/** The error a child process failed with, or undefined when it succeeded. */
const failure = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error as { status: number; stderr: Buffer };
  }
};

// The gates `rayner check` runs, each with a seeded defect, are in explain-gates.test.ts.
test('external source and compiled ESM scenes share the CLI engine; source hashes ignore checkout paths', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-cli-'));
  try {
    const source = `import{Scene,Text,FadeIn}from'rayner';import{stage}from'rayner/explain';export default class Author extends Scene{static meta={id:'author',title:'External author'};async construct(){const s=stage(this);await this.step('one',{caption:'A real native scene.'});await this.play(new FadeIn(new Text('hello',{color:s.palette.ink})));this.state.answer=42;}}`;
    const a = join(folder, 'a', 'scene.ts'),
      b = join(folder, 'b', 'scene.ts');
    await mkdir(join(folder, 'a'));
    await mkdir(join(folder, 'b'));
    await writeFile(a, source);
    await writeFile(b, source);
    const first = await collectProject(a, { write: false }),
      second = await collectProject(b, { write: false });
    assert.equal(first.sourceHash, second.sourceHash);
    const compiled = join(folder, 'compiled.js');
    await build({
      entryPoints: [a],
      bundle: false,
      format: 'esm',
      platform: 'neutral',
      outfile: compiled,
      logLevel: 'silent',
    });
    const loaded = await collectProject(compiled, { write: false });
    assert.deepEqual(await traceScene(loaded.Scene), await traceScene(first.Scene));
    const cli = join(ROOT, 'tools/explain.ts');
    const output = execFileSync(
      process.execPath,
      [cli, 'build', compiled, '--out', join(folder, 'page.html')],
      { encoding: 'utf8' },
    );
    assert.match(output, /Built/);
    const html = await readFile(join(folder, 'page.html'), 'utf8');
    assert.match(html, /External author/);
    // The notices every built page carries: the MIT licence (Lantern's and the fork's) and the fonts' OFL.
    assert.match(html, /Copyright \(c\) 2026 Ivar Vong/);
    assert.match(html, /SIL OPEN FONT LICENSE/);
    const refused = failure(() => execFileSync(process.execPath, [cli, 'not-a-command', a], { stdio: 'pipe' }));
    assert.equal(refused?.status, 1, 'an unknown command must exit 1');
    // Node 24.0 emits its type-stripping warning before the source CLI runs.
    // Require the CLI's own error line without assuming it owns all of stderr.
    assert.match(String(refused?.stderr), /^rayner: Unknown command: not-a-command$/m);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('`rayner --version` and `rayner version` print the version; the word as an option value does not', async () => {
  const cli = join(ROOT, 'tools/explain.ts'),
    { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  for (const args of [['--version'], ['version']])
    assert.equal(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }).trim(), version, args.join(' '));
  const scene = join(ROOT, 'scenes/explainers/fork/scene.ts');
  for (const args of [['shots', scene, '--case', 'x=--version'], ['shots', scene, '--out', '--version']]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(r.stdout.trim(), version, args.join(' '));
    assert.equal(r.status, 1, args.join(' '));
  }
});

test('`rayner describe` prints the explainer as JSON, every case and step', async () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'tools/explain.ts'), 'describe', join(ROOT, 'scenes/explainers/oauth-pkce/scene.ts')], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const d = JSON.parse(out) as { schema: number; id: string; cases: { values: Record<string, string>; steps: { step: string; drawing?: string }[] }[] };
  assert.equal(d.schema, 1);
  assert.equal(d.id, 'oauth-pkce');
  assert.deepEqual(d.cases.map((c) => c.values.attacker).sort(), ['no', 'yes']);
  assert.ok(d.cases.every((c) => c.steps.length && c.steps.every((s) => typeof s.drawing === 'string')));
});

test('`rayner see` prints a step: its resting picture as text, title, caption, picture and state changes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'explain-see-'));
  try {
    const cli = join(ROOT, 'tools/explain.ts'),
      scene = join(ROOT, 'scenes/explainers/ring-buffer/scene.ts'),
      svg = join(folder, 'result.svg');
    const out = execFileSync(process.execPath, [cli, 'see', scene, 'result', '--out', svg], { encoding: 'utf8' });
    assert.match(out, /^ring-buffer · step 6 of 6: result/m);
    assert.match(out, /^Title: \S/m);
    assert.match(out, /^Caption: \S/m);
    // What the step changed, from the trace: the model's ring after the last pushes.
    assert.match(out, /^Changed: .*tail: 0 → 2/m);
    // The drawing comes before the facts, and the heading is left out of it.
    assert.match(out.slice(0, out.indexOf('ring-buffer ·')), /[┌─│]/);
    assert.match(await readFile(svg, 'utf8'), /^<svg /);
    const missing = failure(() => execFileSync(process.execPath, [cli, 'see', scene, 'nope'], { stdio: 'pipe' }));
    assert.equal(missing?.status, 1);
    assert.match(String(missing?.stderr), /No step "nope"\. Steps: .*result/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('`rayner see` prints describeExplainer\'s words for the step, so the two cannot disagree', async () => {
  const project = await collectProject(join(ROOT, 'scenes/explainers/oauth-pkce'), { write: false });
  const d = await describeExplainer(project.Scene, { snapshots: project.store });
  // The case without the attacker, so the case name is printed from the description too.
  const v = project.variants.find((v) => v.values.attacker === 'no')!,
    c = d.cases.find((c) => c.values.attacker === 'no')!;
  for (const s of c.steps) assert.equal(await seeStep(project, v, s.step), seeText('oauth-pkce', c, s.step));
  // The text is the description's fields and nothing else: a made-up description prints as it says.
  const step = { step: 'a', title: 'One', line: '', caption: '', start: 0, end: 1, state: {}, changed: {}, picture: '' };
  const made: CaseDescription = {
    values: {},
    name: 'Size: 3',
    duration: 2,
    steps: [
      step,
      { ...step, step: 'b', title: 'Two', line: 'A line.', caption: 'Cap.', state: { n: 1 }, changed: { n: { after: 1 }, gone: { before: 'x' } }, picture: 'A box.', drawing: 'DRAWN' },
    ],
  };
  assert.equal(seeText('x', made), 'DRAWN\n\nx · step 2 of 2: b · Size: 3\nTitle: Two\nLine: A line.\nCaption: Cap.\nPicture: A box.\nChanged: n: — → 1; gone: "x" → —');
  assert.equal(seeText('x', made, 'a'), '\n\nx · step 1 of 2: a · Size: 3\nTitle: One\nChanged: nothing in scene.state');
  assert.throws(() => seeText('x', made, 'c'), /No step "c"\. Steps: a, b/);
});

// `see` draws only the step it shows; its text must still be what the whole description gives.
test(
  '`rayner see` prints what the whole description gives: each case\'s last step, and the first step by name in other cases, for every explainer',
  { skip: !process.env.FULL && 'set FULL=1 (npm run test:full): it describes every case of every explainer' },
  async () => {
    for (const { id } of EXPLAINERS) {
      const project = await collectProject(join(ROOT, 'scenes/explainers', id), { write: false });
      for (const v of project.variants) {
        const c = await describeCase(project.Scene, v.values, { snapshots: project.store });
        assert.equal(await seeStep(project, v), seeText(id, c), `${id} ${JSON.stringify(v.values)}: the last step`);
        // In a case other than the default, its first step, by name.
        const named = c.steps[0]!.step;
        if (v !== defaultVariant(project)) assert.equal(await seeStep(project, v, named), seeText(id, c, named), `${id} ${JSON.stringify(v.values)}: ${named}`);
      }
    }
  },
);

test('lettering errors name the rayner capture command', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-missing-lettering-'));
  try {
    const file = join(folder, 'scene.ts');
    await writeFile(file, `import{Scene}from'rayner';export default class L extends Scene{static meta={id:'missing',lettering:{scripts:['Arab']}};async construct(){await this.step('one');}}`);
    const result = spawnSync(process.execPath, [join(ROOT, 'tools/explain.ts'), 'check', file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stale lettering snapshot; run rayner snapshots /);
    assert.doesNotMatch(result.stderr, /run explain snapshots/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

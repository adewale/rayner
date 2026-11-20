// Exercise the same author boundary in the source CLI and the installed package gate.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Result { status: number | null; stdout: string; stderr: string }
type Run = (args: string[]) => Promise<Result>;

/** Help and invalid invocations must work before loading a scene or producing artifacts. */
export async function assertCommandHelp(run: Run): Promise<void> {
  const root = await run(['--help']);
  assert.equal(root.status, 0, root.stderr);
  for (const args of [[], ['-h'], ['help']]) assert.deepEqual(await run(args), root, args.join(' '));
  assert.match(root.stdout, /contact-sheet\s+Write/);
  assert.doesNotMatch(root.stdout, /\bshots\b/);
  for (const command of ['init', 'snapshots', 'check', 'build', 'review', 'preview', 'contact-sheet', 'describe', 'see', 'version', 'help']) {
    const shown = await run([command, '--help']);
    assert.equal(shown.status, 0, shown.stderr);
    assert.ok(shown.stdout.startsWith(`Usage: rayner ${command}`), command);
    assert.match(shown.stdout, /Examples:/);
    assert.deepEqual(await run(['help', command]), shown, `help ${command}`);
  }
  const check = await run(['check', '-h']), build = await run(['build', '-h']), review = await run(['review', '-h']);
  assert.match(check.stdout, /model tests/);
  assert.match(check.stdout, /does not test the served browser page/);
  assert.match(build.stdout, /does not run check/);
  assert.match(review.stdout, /Runs check, builds the page/);
  assert.match((await run(['see', '-h'])).stdout, /last step of the default scenario/);
  assert.match((await run(['describe', '-h'])).stdout, /every scenario and step/);
  for (const [args, expected] of [
    [['biuld'], /did you mean rayner build/],
    [['help', 'biuld'], /did you mean rayner build/],
    [['shots'], /is not a command/],
    [['build'], /needs a scene file or directory[\s\S]*Usage: rayner build/],
    [['init'], /needs a new directory/],
    [['build', 'no-such-scene', '--watch'], /--watch is not an option of rayner build/],
    [['check', 'no-such-scene', '--port', '5174'], /--port is not an option of rayner check/],
    [['review', 'no-such-scene', '--scenario', 'x=y'], /--scenario is not an option of rayner review/],
    [['describe', 'no-such-scene', '--scenario', 'x=y'], /--scenario is not an option of rayner describe/],
    [['init', 'no-such-scene', '--out', 'ignored'], /--out is not an option of rayner init/],
    [['snapshots', 'no-such-scene', '--out', 'ignored'], /--out is not an option of rayner snapshots/],
    [['see', 'no-such-scene', '--subjects', 'ignored'], /--subjects is not an option of rayner see/],
    [['contact-sheet', 'no-such-scene', '--refresh'], /--refresh is not an option of rayner contact-sheet/],
    [['contact-sheet', 'no-such-scene', '--out', 'sheet.svg'], /--out names a PNG file/],
    [['preview', 'no-such-scene', '--port', 'NaN'], /--port must be an integer/],
    [['preview', 'no-such-scene', '--port', '65536'], /--port must be an integer/],
    [['see', 'no-such-scene', '--scenario', 'invalid'], /--scenario takes id=value/],
    [['version', 'ignored'], /one argument too many/],
    [['see', 'no-such-scene', 'one', 'two'], /one argument too many/],
  ] as const) {
    const result = await run([...args]);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, expected, args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
  }
  // An option value or an operand after -- is not a request for help.
  const literal = await run(['describe', '--', '--help']);
  assert.equal(literal.status, 1);
  assert.doesNotMatch(literal.stdout, /Usage:/);
}

async function tree(folder: string): Promise<Record<string, { bytes: string; modified: string }>> {
  const files: Record<string, { bytes: string; modified: string }> = {};
  for (const entry of await readdir(folder, { withFileTypes: true, recursive: true })) if (entry.isFile()) {
    const path = join(entry.parentPath, entry.name);
    files[path.slice(folder.length + 1)] = { bytes: (await readFile(path)).toString('base64'), modified: (await stat(path, { bigint: true })).mtimeNs.toString() };
  }
  return files;
}

/** Preserve unused pins as well as active source; refuse capture before reaching its tools. */
export async function assertPinnedCommandInputs(run: Run, folder: string): Promise<void> {
  const source = join(folder, 'source'), scene = join(source, 'scene.ts');
  await mkdir(join(source, 'scene.snapshots'), { recursive: true });
  await writeFile(join(source, 'scene.snapshots/unused.json'), '{"retain":"unused pinned asset"}\n');
  await writeFile(join(source, 'scene.lettering.json'), '{"retain":"unused lettering"}\n');
  const module = (body: string, meta = '') => `import{Scene,Text}from'rayner';import{stage}from'rayner/explain';export default class Pinned extends Scene{static meta={id:'cli-pinned',title:'Pinned inputs'${meta}};async construct(){const s=stage(this);await this.step('one',{caption:'One view.'});${body}}}`;
  await writeFile(scene, module(`await s.enter(new Text('hello',{color:s.look.ink}),{describe:'hello'});`));
  let before = await tree(source);
  for (const args of [['see', scene], ['describe', scene], ['contact-sheet', scene, '--out', join(folder, 'sheet.png')], ['build', scene, '--out', join(folder, 'page.html')]]) {
    const result = await run(args);
    assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
    assert.deepEqual(await tree(source), before, `${args[0]} must not rewrite or prune source assets`);
  }
  assert.deepEqual((await readFile(join(folder, 'sheet.png'))).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.match(await readFile(join(folder, 'sheet.svg'), 'utf8'), /^<svg /);

  await writeFile(scene, module(`await s.show({source:'graph LR\\nA --> B'});`));
  before = await tree(source);
  for (const command of ['check', 'build', 'review', 'contact-sheet', 'see', 'describe']) {
    const result = await run([command, scene]);
    assert.equal(result.status, 1, command);
    assert.match(result.stderr, /scene\.snapshots: no current snapshot for "graph LR"; run rayner snapshots /, command);
    assert.ok(result.stderr.includes(scene), command);
    assert.deepEqual(await tree(source), before, `${command} must refuse without capturing or pruning`);
  }
  // Both subset and outline lettering have capture paths. Neither can prepare during inspection.
  for (const script of ['Grek', 'Arab']) {
    await writeFile(scene, module(`await s.enter(new Text('hello',{color:s.look.ink}),{describe:'hello'});`, `,lettering:{scripts:['${script}']}`));
    before = await tree(source);
    for (const command of ['see', 'describe']) {
      const result = await run([command, scene]);
      assert.equal(result.status, 1, `${command}, ${script}`);
      assert.match(result.stderr, /scene\.lettering\.json: it is missing or stale; run rayner snapshots /);
      assert.deepEqual(await tree(source), before, `${command}, ${script}: lettering capture must not run`);
    }
  }
}

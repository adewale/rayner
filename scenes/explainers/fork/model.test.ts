import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The checkout the fork explainer speaks of: Rayner's own tree, three folders up. */
const ROOT = join(import.meta.dirname, '../../..');

// The fork explainer's claims about Lantern, held to Lantern's code at the fork base and to this tree.
test('fork: what it says Lantern had and the fork deleted matches both trees', async (t) => {
  const BASE = '2c7bad533be25fbd56d26a9a2b6c5651743f011e';
  for (const gone of ['app/worker.ts', 'app/player.ts', 'src/doc.ts', 'src/mermaid.ts', 'wrangler.toml'])
    assert.ok(!existsSync(join(ROOT, gone)), `${gone} is still here`);
  assert.match(readFileSync(join(ROOT, 'docs/UPSTREAM.md'), 'utf8'), /None has been offered upstream/);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git('cat-file', '-e', `${BASE}^{commit}`);
  } catch {
    return t.skip('the fork base is not in this clone (shallow checkout)');
  }
  const show = (path: string) => git('show', `${BASE}:${path}`);
  const worker = show('app/worker.ts');
  for (const route of ['/frame.svg', '/text', '/trace.json', '/llms.txt']) assert.ok(worker.includes(`'${route}'`), route);
  // The fork scene's opening: the Worker rendered any step or time on request and cached nothing.
  assert.match(worker, /url\.searchParams\.has\('t'\)/);
  assert.match(worker, /Seeking re-runs the scene to the requested time \(~10ms\), so nothing is\n\/\/ cached here/);
  assert.match(show('src/mermaid.ts'), /expected "flowchart <dir>" or "graph <dir>"/);
  const scenes = git('ls-tree', '--name-only', `${BASE}:scenes`)
    .split('\n')
    .filter((f) => /\.ts$/.test(f) && f !== 'index.ts');
  assert.equal(scenes.length, 9, scenes.join(', '));
  const tools = git('ls-tree', '-r', '--name-only', BASE, 'tools', 'app', 'src').split('\n').filter(Boolean);
  assert.ok(!tools.some((f) => /ffmpeg|\.mp4|webm/i.test(show(f))), 'Lantern encodes no video');
  assert.equal(JSON.parse(show('package.json')).dependencies, undefined, 'Lantern has no runtime dependencies');
});

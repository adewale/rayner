// Diagram capture and lettering capture are add-ons (tools/lib/addons.ts): a scene that asks for neither
// runs every authoring command with Node alone, and a scene that asks for one without it installed is
// told what to install. Each command runs in a child process, as an author runs it, with
// test/lib/addon-hooks.mjs to treat packages as absent and to list the modules the command loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../tools/lib/explain-project.ts';

const CLI = join(ROOT, 'tools/explain.ts'), HOOKS = join(ROOT, 'test/lib/addon-hooks.mjs');
const DIAGRAM_ADDON = ['agentic-mermaid', 'svgpath'];
/** Run the source command with only `env` (and a HOME), as an author's shell would. */
const rayner = (args: string[], env: Record<string, string>, cwd = ROOT) =>
  spawnSync(process.execPath, ['--import', HOOKS, CLI, ...args], { cwd, encoding: 'utf8', env: { HOME: process.env.HOME ?? tmpdir(), ...env } });
/** The CLI's own error line, whatever else (Node's warnings) stderr holds. */
const errorLine = (stderr: string) => stderr.split('\n').find((line) => line.startsWith('rayner: ')) ?? stderr;
const DIAGRAM_SCENE = `import { Scene } from 'rayner';
import { stage } from 'rayner/explain';
export default class Drawn extends Scene {
  static meta = { id: 'diagram-addon', title: 'One diagram' };
  async construct() {
    const s = stage(this);
    await this.step('one', { caption: 'A diagram from Mermaid source.' });
    await s.show({ source: 'graph LR\\nA --> B' });
  }
}
`;

test('a scene with no diagrams or lettering inits, checks, sees, describes, builds and shoots with no browser, no Python and no add-on loaded', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-addons-'));
  try {
    // PATH holds node and nothing else, so no python3 or pyftsubset; Playwright looks for its browsers
    // where there are none, and no Chromium is named. The add-ons' packages count as not installed.
    const bin = join(folder, 'bin');
    await mkdir(bin);
    await symlink(process.execPath, join(bin, 'node'));
    const loaded = join(folder, 'loaded.txt');
    const env = { PATH: bin, PLAYWRIGHT_BROWSERS_PATH: join(folder, 'no-browsers'), RAYNER_TEST_ABSENT: [...DIAGRAM_ADDON, 'playwright-core'].join(','), RAYNER_TEST_LOADED: loaded };
    const run = (...args: string[]) => {
      const r = rayner(args, env, folder);
      assert.equal(r.status, 0, `rayner ${args.join(' ')}: ${r.stderr}`);
      return r.stdout;
    };
    run('init', 'first');
    const check = JSON.parse(run('check', 'first', '--out', join(folder, 'checks')));
    assert.equal(check.model.passed, check.model.tests, 'the starter model test passes');
    assert.ok(check.model.tests > 0);
    assert.equal(check.diagrams, 0);
    assert.match(run('see', 'first'), /^Picture: /m);
    assert.ok(JSON.parse(run('describe', 'first')).scenarios.length > 0);
    assert.match(run('build', 'first', '--out', join(folder, 'public/first.html')), /^Built /);
    assert.match(await readFile(join(folder, 'public/first.html'), 'utf8'), /<html/);
    // A contact sheet is drawn by resvg, not by a browser.
    run('shots', 'first', '--out', join(folder, 'first.png'));
    assert.ok(existsSync(join(folder, 'first.png')));
    assert.equal(existsSync(join(folder, 'first/scene.snapshots')), false, 'a scene with no diagrams keeps no snapshots');
    // Nothing of either add-on, or of the browser, was loaded by any of those commands.
    const urls = new Set((await readFile(loaded, 'utf8')).split('\n').filter(Boolean));
    assert.ok([...urls].some((url) => url.endsWith('/tools/lib/explain-project.ts')), 'the module list records the command');
    for (const module of ['tools/lib/browser.ts', 'tools/lib/lettering.ts', 'tools/lib/explain-morph.ts', 'integrations/agentic-mermaid/index.ts', 'integrations/agentic-mermaid/measurement.ts', 'vendor/glyph-math.js'])
      assert.ok(!urls.has(pathToFileURL(join(ROOT, module)).href), `a scene without add-ons loaded ${module}`);
    assert.deepEqual([...urls].filter((url) => /node_modules\/(?:agentic-mermaid|svgpath|playwright-core)\//.test(url)), []);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a diagram the snapshots lack, without the diagram add-on, fails naming the scene, the diagram and the install command', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-addons-'));
  try {
    await writeFile(join(folder, 'scene.ts'), DIAGRAM_SCENE);
    for (const command of ['check', 'build']) {
      const r = rayner([command, folder, '--out', join(folder, command === 'build' ? 'page.html' : 'checks')], { PATH: process.env.PATH ?? '', RAYNER_TEST_ABSENT: DIAGRAM_ADDON.join(',') });
      assert.equal(r.status, 1, command);
      const line = errorLine(r.stderr);
      assert.ok(line.startsWith(`rayner: ${join(folder, 'scene.ts')}: capturing the diagram "graph LR", which scene.snapshots/ does not hold, needs the diagram add-on, and agentic-mermaid is not installed.`), line);
      assert.match(line, /Install it with: npm install --save-dev agentic-mermaid@0\.5\.1 svgpath@2\.6\.0\./);
      assert.match(line, /npx playwright-core install chromium/);
    }
    assert.equal(existsSync(join(folder, 'page.html')), false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('capturing a diagram with no Chromium to be found says how to install it', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-addons-'));
  try {
    await writeFile(join(folder, 'scene.ts'), DIAGRAM_SCENE);
    const r = rayner(['check', folder, '--out', join(folder, 'checks')], { PATH: process.env.PATH ?? '', PLAYWRIGHT_BROWSERS_PATH: join(folder, 'no-browsers') });
    assert.equal(r.status, 1);
    assert.equal(errorLine(r.stderr), 'rayner: Capturing a Mermaid diagram needs Chromium, and none was found. Install it once with npx playwright-core install chromium, or set CHROMIUM_EXECUTABLE_PATH to a Chromium or Chrome executable. Writing, checking and building a scene without new diagrams needs no browser.');
    const named = rayner(['check', folder, '--out', join(folder, 'checks')], { PATH: process.env.PATH ?? '', CHROMIUM_EXECUTABLE_PATH: join(folder, 'no-chromium') });
    assert.equal(named.status, 1);
    assert.match(errorLine(named.stderr), new RegExp(`needs Chromium, and none was found at CHROMIUM_EXECUTABLE_PATH \\(${join(folder, 'no-chromium').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\)`));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('pinned diagrams replay without the diagram add-on; checking a morph\'s edits asks for it by name', () => {
  const env = { PATH: process.env.PATH ?? '', RAYNER_TEST_ABSENT: DIAGRAM_ADDON.join(',') };
  // font-metrics pins natural-lettering diagrams, whose measurements collection checks against its fonts.
  const natural = rayner(['describe', 'scenes/explainers/font-metrics'], env);
  assert.equal(natural.status, 0, natural.stderr);
  assert.ok(JSON.parse(natural.stdout).scenarios.length > 1);
  // mr-cache morphs a diagram with edits, which collection replays through Agentic Mermaid.
  const morph = rayner(['describe', 'scenes/explainers/mr-cache'], env);
  assert.equal(morph.status, 1);
  assert.match(errorLine(morph.stderr), /scenes\/explainers\/mr-cache\/scene\.ts: checking the edits d\.morph\(\) makes to the diagram "graph LR" needs the diagram add-on, and agentic-mermaid is not installed\. Install it with: npm install --save-dev agentic-mermaid@0\.5\.1 svgpath@2\.6\.0\./);
});

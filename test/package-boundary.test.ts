// The boundary between Rayner's two packages and the repository (docs/RELEASING.md, "Two packages").
// rayner is the vocabulary and runtime scenes and hosts import, with no dependencies; rayner-cli is
// the command, its player and its capture tools; tools/repo/ (and the oracles in tools/oracle/) is
// repository-only tooling that neither ships. Both archives are listed by a dry-run pack, the
// command's after building it into a temporary folder, so nothing in the checkout changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { ROOT, buildCli, CLI_FILES, libraryModule } from '../tools/repo/build-cli.ts';
import { LIBRARY } from '../tools/lib/roots.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = (cwd: string): string[] =>
  (JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 })) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
/** Repository-only files: tooling, tests, the catalog, benchmarks and specs. */
const REPO_ONLY = /^(?:tools\/repo\/|tools\/oracle\/|test\/|scenes\/explainers\/|bench\/|specs\/|cli\/|\.github\/)/;

test('rayner ships the vocabulary and runtime, with no dependencies, no command and no capture code', async () => {
  const pkg = await json(join(ROOT, 'package.json'));
  assert.equal(pkg.name, 'rayner');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bin']) assert.equal(pkg[field], undefined, `rayner has no ${field}`);
  // Its entry points are the only modules an outside project can import: no pattern exposes the rest of dist/.
  assert.deepEqual(Object.keys(pkg.exports).filter((subpath) => subpath.includes('*')), [], 'rayner exports its entry points only');
  const files = packed(ROOT);
  const leaked = files.filter((f) =>
    REPO_ONLY.test(f) || /^(?:tools\/|app\/|dist\/tools\/|dist\/app\/)/.test(f) || /^(?:dist\/)?integrations\//.test(f) ||
    /^(?:dist\/)?vendor\/(?:glyph-math|lettering\/)/.test(f) || /\.(?:py|sh|txt)$/.test(f) && !f.startsWith('vendor/licenses/'));
  assert.deepEqual(leaked, [], 'rayner ships only what scenes, hosts and snapshot replay need');
  for (const f of ['src/index.ts', 'src/lettering-outlines.ts', 'explain/diagrams.ts', 'explain/diagram-snapshot.ts', 'vendor/glyph.d.ts', 'scenes/tutorial/lru-mru/scene.ts', 'skills/rayner-explainers/SKILL.md'])
    assert.ok(files.includes(f), `rayner ships ${f}`);
  // The shaper ships once, in dist/vendor/ beside the compiled modules that import it (tools/repo/copy-vendor.ts
  // puts it there when the package is built); the command's page build reads it there. The page build's own
  // inputs, the SFNT faces and the shaper's pin, ship with the command.
  assert.ok(pkg.files.includes('dist/vendor'), 'rayner ships dist/vendor/');
  for (const f of ['vendor/glyph.js', 'vendor/glyph.pin.json', 'vendor/font-data-sfnt.json']) assert.ok(!files.includes(f), `rayner does not ship ${f}`);
});

test('rayner-cli is the command at the library\'s version, depending on exactly what its bundle imports', async () => {
  const root = await json(join(ROOT, 'package.json')), cli = await json(join(ROOT, 'cli/package.json'));
  assert.equal(cli.name, 'rayner-cli');
  assert.equal(cli.version, root.version, 'one version for both packages');
  assert.deepEqual(cli.bin, { rayner: 'dist/tools/explain.js' });
  const { rayner, ...tools } = cli.dependencies as Record<string, string>;
  assert.equal(rayner, root.version, 'rayner-cli requires rayner at exactly its own version');
  for (const [name, version] of Object.entries(tools))
    assert.equal(root.devDependencies[name], version, `the checkout develops with the ${name} rayner-cli ships`);
  const out = await mkdtemp(join(tmpdir(), 'rayner-cli-'));
  try {
    const meta = await buildCli(out);
    // The packages the bundle leaves to node_modules are its dependencies, no more and no fewer.
    const external = new Set<string>(), internal = new Set<string>();
    for (const output of Object.values(meta.outputs))
      for (const { path, external: outside } of output.imports) {
        if (!outside || path.startsWith('node:') || builtinModules.includes(path) || path.startsWith('./')) continue;
        if (path.startsWith(LIBRARY)) internal.add(path.slice(LIBRARY.length));
        else external.add(path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0]!);
      }
    assert.deepEqual([...external].sort(), Object.keys(tools).sort(), 'cli/package.json lists what the command imports');
    // The engine comes from the installed library, by modules the library compiles and ships, through
    // the private specifier the command's own resolve hook answers (tools/installed.ts), not an export.
    // It reaches the library as an outside project does, through the entry points, and beyond them through
    // the two internal barrels and the vendored shaper only (docs/ENGINE.md, "The internal interface").
    const entries = Object.values(root.exports as Record<string, string | { default: string }>).flatMap((t) => (typeof t === 'object' ? [t.default.replace(/^\.\/dist\//, '')] : []));
    for (const barrel of ['src/internal.js', 'explain/internal.js', 'vendor/glyph.js']) assert.ok(internal.has(barrel), `the command imports ${LIBRARY}${barrel}`);
    for (const file of internal) {
      const source = existsSync(join(ROOT, file)) ? file : file.replace(/\.js$/, '.ts');
      assert.ok(libraryModule(source) && existsSync(join(ROOT, source)), `${LIBRARY}${file} is a library module`);
      assert.ok(entries.includes(file) || ['src/internal.js', 'explain/internal.js', 'vendor/glyph.js'].includes(file), `${LIBRARY}${file} is an entry point or an internal barrel`);
    }
    const inputs = Object.keys(meta.inputs);
    assert.deepEqual(inputs.filter((f) => libraryModule(f)), [], 'the command bundles no copy of the library or its shaper');
    assert.deepEqual(inputs.filter((f) => REPO_ONLY.test(f)), [], 'the command imports no repository-only code');
    // tools/ outside tools/repo/ and tools/oracle/ is the command: each module is in its bundle, each
    // other file one it ships.
    const commandTools = (await readdir(join(ROOT, 'tools'), { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(ROOT.length).replaceAll('\\', '/'))
      // Python's bytecode cache, written beside tools/lettering.py when capture runs, is not a source.
      .filter((f) => !REPO_ONLY.test(f) && !f.includes('/__pycache__/'));
    for (const f of commandTools)
      assert.ok(f.endsWith('.ts') ? inputs.includes(f) : CLI_FILES.includes(f), `${f} belongs in the command or in tools/repo/`);
    const files = packed(out);
    assert.deepEqual(files.filter((f) => REPO_ONLY.test(f) || /^(?:src|explain|scenes|docs|skills|recipes)\//.test(f) || /^tools\/(?:lib|repo)\//.test(f)), [],
      'rayner-cli ships the command, the player and the capture tools, not the library or the repository');
    for (const f of ['dist/tools/explain.js', 'app/embed.ts', 'app/loader.ts', 'tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/lettering-outline-fonts.sh', 'vendor/glyph-math.js', 'vendor/font-data-sfnt.json', 'vendor/glyph.pin.json', 'vendor/licenses/glyph-MIT.txt', 'LICENSE', 'README.md'])
      assert.ok(files.includes(f), `rayner-cli ships ${f}`);
    // Its README is read on npm, outside this repository: every link is absolute.
    const readme = await readFile(join(out, 'README.md'), 'utf8');
    assert.deepEqual([...readme.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!).filter((link) => !/^https:\/\//.test(link)), []);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

// The boundary between the rayner package and the repository (docs/RELEASING.md, "One package").
// rayner is the vocabulary and runtime scenes and hosts import, and the rayner command with its
// player and capture tools; tools/repo/ (and the oracles in tools/oracle/) is repository-only
// tooling that it does not ship. The archive is listed by a dry-run pack, and the command is built
// into a temporary folder, so nothing in the checkout changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { builtinModules } from 'node:module';
import { ROOT, buildCommand, COMMAND_FILES, libraryModule } from '../tools/repo/build-command.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = (cwd: string): string[] =>
  (JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 })) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
/** Repository-only files: tooling, tests, the catalog, benchmarks and specs. */
const REPO_ONLY = /^(?:tools\/repo\/|tools\/oracle\/|test\/|scenes\/explainers\/|bench\/|specs\/|cli\/|out\/|\.github\/)/;
/** A file the package ships as one of COMMAND_FILES (a file, or a file inside one of its folders). */
const commandFile = (f: string) => COMMAND_FILES.some((c) => f === c || f.startsWith(c + '/'));

test('rayner ships the library and the command, and nothing from the repository\'s own tooling', async () => {
  const pkg = await json(join(ROOT, 'package.json'));
  assert.equal(pkg.name, 'rayner');
  // Its entry points are the only modules an outside project can import: no pattern exposes the rest of
  // dist/, and the command is a bin, not an export.
  assert.deepEqual(Object.keys(pkg.exports).filter((subpath) => subpath.includes('*')), [], 'rayner exports its entry points only');
  assert.deepEqual(Object.values(pkg.exports as Record<string, { default: string }>).filter((t) => /tools|app/.test(t.default)), [], 'the command is not an export');
  assert.ok(pkg.files.includes('dist/tools'), 'rayner ships the command bundle, dist/tools/');
  for (const f of COMMAND_FILES) assert.ok(pkg.files.some((entry: string) => f === entry || f.startsWith(entry + '/')), `"files" lists ${f}, which the command reads at run time`);
  const files = packed(ROOT);
  const leaked = files.filter((f) =>
    REPO_ONLY.test(f) || /^tools\//.test(f) && !commandFile(f) || /^dist\/app\//.test(f) || /^(?:dist\/)?integrations\//.test(f) ||
    /\.(?:py|sh|txt)$/.test(f) && !commandFile(f));
  assert.deepEqual(leaked, [], 'rayner ships what scenes, hosts and the command need, not the repository');
  for (const f of ['src/index.ts', 'src/lettering-outlines.ts', 'explain/diagrams.ts', 'explain/diagram-snapshot.ts', 'vendor/glyph.d.ts', 'scenes/tutorial/lru-mru/scene.ts', 'skills/rayner-explainers/SKILL.md',
    'app/embed.ts', 'app/loader.ts', 'tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/lettering-outline-fonts.sh', 'vendor/glyph-math.js', 'vendor/font-data-sfnt.json', 'vendor/glyph.pin.json',
    'vendor/lettering/inter.woff2', 'vendor/licenses/glyph-MIT.txt', 'LICENSE', 'README.md'])
    assert.ok(files.includes(f), `rayner ships ${f}`);
  // The shaper ships once, in dist/vendor/ beside the compiled modules that import it (tools/repo/copy-vendor.ts
  // puts it there when the package is built); the command's page build reads it there.
  assert.ok(pkg.files.includes('dist/vendor'), 'rayner ships dist/vendor/');
  assert.ok(!files.includes('vendor/glyph.js'), 'rayner does not ship the shaper a second time, as vendor/glyph.js');
});

test('the command is rayner\'s bin, depending on exactly what its bundle imports, the diagram add-on as optional peers it loads lazily, sharing the library\'s compiled modules', async () => {
  const pkg = await json(join(ROOT, 'package.json'));
  assert.deepEqual(pkg.bin, { rayner: 'dist/tools/explain.js' });
  const tools = pkg.dependencies as Record<string, string>;
  // The diagram add-on's packages are optional peers: an author installs them for a scene that draws a
  // Mermaid diagram (tools/lib/addons.ts), and a plain install leaves them out.
  const peers = pkg.peerDependencies as Record<string, string>;
  assert.deepEqual(Object.keys(peers).sort(), ['agentic-mermaid', 'svgpath']);
  for (const name of Object.keys(peers)) assert.deepEqual(pkg.peerDependenciesMeta?.[name], { optional: true }, `${name} is an optional peer`);
  for (const name of Object.keys(peers)) assert.equal(tools[name], undefined, `${name} is a peer, not a dependency`);
  for (const [name, version] of Object.entries(peers))
    assert.equal(pkg.devDependencies[name], version, `the checkout develops with the ${name} the add-on pins`);
  for (const name of Object.keys(tools)) assert.equal(pkg.devDependencies[name], undefined, `${name} is a dependency, listed once`);
  const out = await mkdtemp(join(tmpdir(), 'rayner-command-'));
  try {
    const meta = await buildCommand(out);
    // buildCommand refuses a chunk outside the output folder, so '../src/…' from any chunk is dist/src/.
    // The packages the bundle leaves to node_modules are its dependencies and peers, no more and no fewer;
    // the library is reached by relative paths out of dist/tools/.
    const external = new Set<string>(), library = new Set<string>();
    for (const output of Object.values(meta.outputs))
      for (const { path, external: outside } of output.imports) {
        if (!outside || path.startsWith('node:') || builtinModules.includes(path) || path.startsWith('./')) continue;
        if (path.startsWith('../')) library.add(posix.join('tools', path));
        else external.add(path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0]!);
      }
    assert.deepEqual([...external].sort(), Object.keys({ ...tools, ...peers }).sort(), 'package.json lists what the command imports');
    // What the command loads before any scene asks for more: the entry chunk and every chunk it imports
    // statically. Browser, PNG, diagram-capture and lettering-capture code lie behind dynamic imports.
    const outputs = meta.outputs, entry = Object.keys(outputs).find((o) => outputs[o]!.entryPoint === 'tools/explain.ts')!;
    const statically = new Set<string>([entry]), queue = [entry];
    for (let at = queue.shift(); at; at = queue.shift())
      for (const { path, kind, external: outside } of outputs[at]!.imports)
        if (kind === 'import-statement' && (outside || !statically.has(path))) {
          statically.add(path);
          if (!outside) queue.push(path);
        }
    for (const lazy of ['agentic-mermaid', 'agentic-mermaid/agent', 'svgpath', 'playwright-core', '@resvg/resvg-js'])
      assert.ok(!statically.has(lazy), `the command imports ${lazy} before a scene asks for it`);
    const eager = [...statically].filter((o) => outputs[o]).flatMap((o) => Object.keys(outputs[o]!.inputs));
    for (const lazy of ['tools/lib/browser.ts', 'tools/lib/lettering.ts', 'tools/lib/explain-morph.ts', 'integrations/agentic-mermaid/index.ts', 'integrations/agentic-mermaid/measurement.ts', 'vendor/glyph-math.js'])
      assert.ok(!eager.includes(lazy), `the command loads ${lazy} before a scene asks for it`);
    assert.ok(eager.includes('tools/lib/explain-project.ts'), 'the walk reaches the eagerly loaded modules');
    // One engine. A scene imports `rayner`, which is dist/src/index.js; the command imports the same
    // compiled files by relative path from dist/tools/, so Node loads each once and the scene's Scene
    // is the command's. It reaches the library as an outside project does, through the entry points,
    // and beyond them through the two internal barrels and the vendored shaper only (docs/ENGINE.md,
    // "The internal interface"), and bundles no copy of any of it.
    const entries = Object.values(pkg.exports as Record<string, { default: string }>).map((t) => t.default.replace(/^\.\/dist\//, ''));
    const barrels = ['src/internal.js', 'explain/internal.js', 'vendor/glyph.js'];
    for (const barrel of barrels) assert.ok(library.has(barrel), `the command imports dist/${barrel}`);
    for (const file of library) {
      const source = existsSync(join(ROOT, file)) ? file : file.replace(/\.js$/, '.ts');
      assert.ok(libraryModule(source) && existsSync(join(ROOT, source)), `dist/${file} is a library module`);
      assert.ok(entries.includes(file) || barrels.includes(file), `dist/${file} is an entry point or an internal barrel`);
    }
    const inputs = Object.keys(meta.inputs);
    assert.deepEqual(inputs.filter((f) => libraryModule(f)), [], 'the command bundles no copy of the library or its shaper');
    assert.deepEqual(inputs.filter((f) => REPO_ONLY.test(f)), [], 'the command imports no repository-only code');
    // tools/ outside tools/repo/ and tools/oracle/ is the command: each module is in its bundle, each
    // other file one the package ships for it.
    const commandTools = (await readdir(join(ROOT, 'tools'), { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(ROOT.length).replaceAll('\\', '/'))
      // Python's bytecode cache, written beside tools/lettering.py when capture runs, is not a source.
      .filter((f) => !REPO_ONLY.test(f) && !f.includes('/__pycache__/'));
    for (const f of commandTools)
      assert.ok(f.endsWith('.ts') ? inputs.includes(f) : COMMAND_FILES.includes(f), `${f} belongs in the command or in tools/repo/`);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

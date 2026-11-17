#!/usr/bin/env node
// Explicit distribution gate: pack rayner, install the one archive in a fresh author project with a
// plain `npm install`, and run the installed command there.
import { mkdtemp, mkdir, writeFile, readFile, copyFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename, posix } from 'node:path';
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/explain-project.ts';
import { entryPoints, packageImports } from '../lib/entry-points.ts';
import { integrity as integrityOf, listTree, relativePosix } from '../lib/hash.ts';
import { options as authoredOptions, typeCheckAuthored } from './lib/authored-types.ts';

/** Poll `predicate` every 100 ms for up to 30 s, failing with `message` after; `meanwhile` asserts what must hold while it waits. */
async function waitUntil(predicate: () => boolean, message: () => string, meanwhile: () => void = () => {}): Promise<void> {
  const until = Date.now() + 30_000;
  while (!predicate()) {
    meanwhile();
    assert.ok(Date.now() < until, message());
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const run = promisify(execFile),
  folder = await mkdtemp(join(tmpdir(), 'rayner-package-'));
try {
  const { values } = parseArgs({ options: { archive: { type: 'string' }, manifest: { type: 'string' } } });
  if (values.archive && values.manifest) throw new Error('Choose --archive or --manifest');
  let candidate: { name: string; filename: string; integrity: string; sourceCommit: string } | undefined;
  if (values.manifest) {
    candidate = JSON.parse(await readFile(resolve(values.manifest), 'utf8'));
    assert.ok(candidate && typeof candidate === 'object', 'invalid candidate manifest');
    assert.equal(candidate.name, 'rayner', 'the candidate is the rayner package');
    assert.ok(typeof candidate.filename === 'string' && basename(candidate.filename) === candidate.filename && candidate.filename.endsWith('.tgz'), 'invalid candidate filename');
    const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
    assert.equal(candidate.sourceCommit, commit, 'candidate comes from another source commit');
  }
  let archive: string;
  if (candidate) archive = join(dirname(resolve(values.manifest!)), candidate.filename);
  else if (values.archive) archive = resolve(values.archive);
  else {
    // npm pack runs prepack, `npm run build`: the library (build:lib), then the command (build:command).
    const packed = await run('npm', ['pack', '--json', '--pack-destination', folder], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
    archive = join(folder, JSON.parse(packed.stdout)[0].filename);
  }
  const integrity = async (file: string) => integrityOf(await readFile(file));
  const checkCandidate = async (when: string) => {
    if (candidate) assert.equal(await integrity(archive), candidate.integrity, `candidate archive integrity mismatch${when}`);
  };
  await checkCandidate('');
  const source = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const { version } = source;

  // A plain install of the one archive: the library, the command and the command's dependencies,
  // and neither add-on, whose packages are optional peers that npm leaves out until an author asks.
  await writeFile(join(folder, 'package.json'), JSON.stringify({ name: 'outside-author', private: true, type: 'module' }));
  await run('npm', ['install', '--no-audit', '--no-fund', archive], { cwd: folder, maxBuffer: 4 * 1024 * 1024 });
  const installed = join(folder, 'node_modules/rayner');
  const installedManifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedManifest.version, version);
  assert.deepEqual(installedManifest.bin, { rayner: 'dist/tools/explain.js' }, 'the package carries the rayner command');
  assert.deepEqual(installedManifest.dependencies, source.dependencies, 'the archive declares the dependencies the checkout pins');
  assert.deepEqual(Object.keys(installedManifest.peerDependencies).sort(), ['agentic-mermaid', 'svgpath']);
  for (const name of Object.keys(installedManifest.peerDependencies)) {
    assert.deepEqual(installedManifest.peerDependenciesMeta?.[name], { optional: true }, `${name} is an optional peer`);
    assert.ok(!existsSync(join(folder, 'node_modules', name)), `a plain install brings ${name}`);
  }
  // PNG and browser tools ship in the plain install: they are dependencies.
  for (const name of Object.keys(installedManifest.dependencies)) assert.ok(existsSync(join(folder, 'node_modules', name)), `a plain install is missing ${name}`);
  const cli = join(installed, 'dist/tools/explain.js');
  const bin = join(folder, 'node_modules/.bin/rayner');
  // The command works straight after the install, from npm's bin link.
  assert.ok((await run(bin, ['--help'], { cwd: folder })).stdout.startsWith(`Rayner ${version} (Node 24+)`));
  assert.equal((await run(bin, ['--version'], { cwd: folder })).stdout.trim(), version);
  for (const entry of entryPoints(ROOT).keys())
    await run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(entry)})`], { cwd: folder });
  // Nothing else: the compiled modules behind the entry points, and the command, are not importable.
  // rayner/kit was folded into rayner/drawing before any release, so it is not an entry point either.
  for (const specifier of ['rayner/internal/src/scene.js', 'rayner/dist/src/scene.js', 'rayner/dist/tools/explain.js', 'rayner/kit']) {
    const tried = await run(process.execPath, ['--input-type=module', '-e', `try{await import(${JSON.stringify(specifier)});console.log('imported')}catch(e){console.log(e.code)}`], { cwd: folder });
    assert.equal(tried.stdout.trim(), 'ERR_PACKAGE_PATH_NOT_EXPORTED', `an outside project imports ${specifier}`);
  }
  // Nothing outside "files" ships (npm adds package.json and the README itself), and nothing from the
  // repository's own tooling, tests, catalog or build output.
  const shipped = (await listTree(installed)).filter((e) => e.isFile()).map((e) => relativePosix(installed, join(e.parentPath, e.name)));
  const listed = (installedManifest.files as string[]).map((pattern) => pattern.endsWith('*.md') ? (f: string) => posix.dirname(f) === posix.dirname(pattern) && f.endsWith('.md') : (f: string) => f === pattern || f.startsWith(pattern + '/'));
  assert.deepEqual(shipped.filter((f) => !['package.json', 'README.md'].includes(f) && !listed.some((matches) => matches(f))), [], 'the archive ships only what "files" lists');
  assert.deepEqual(shipped.filter((f) => /^(?:tools\/(?:repo|lib|oracle)\/|test\/|scenes\/explainers\/|bench\/|specs\/|out\/|cli\/|integrations\/|dist\/integrations\/)/.test(f) || /\.test\.ts$/.test(f) && !f.startsWith('scenes/tutorial/')), [],
    'the archive ships no repository-only file');
  // What the library needs, for scenes, hosts and snapshot replay, and what the command reads at run time.
  for (const file of ['explain/audio.ts', 'src/lettering-outlines.ts', 'explain/diagram-snapshot.ts', 'explain/diagrams.ts', 'dist/vendor/glyph.js', 'vendor/licenses/glyph-MIT.txt', 'LICENSE',
    'dist/tools/explain.js', 'app/embed.ts', 'app/embed-audio.ts', 'app/embed-audio.css', 'app/loader.ts', 'tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/lettering-outline-fonts.sh',
    'vendor/glyph-math.js', 'vendor/font-data-sfnt.json', 'vendor/glyph.pin.json', 'vendor/lettering/inter.woff2', 'vendor/licenses/LatinModernMath-GUST.txt', 'scenes/tutorial/lru-mru/scene.ts'])
    assert.ok(shipped.includes(file), `the archive is missing ${file}`);
  // The shaper ships once, beside the compiled modules that import it.
  assert.ok(!shipped.includes('vendor/glyph.js'), 'the archive ships the shaper twice');
  // One engine: the command's chunks are in dist/tools/ and reach the library only through its compiled
  // modules beside them (the entry points, the two internal barrels and the shaper), never a copy.
  const chunks = shipped.filter((f) => f.startsWith('dist/tools/'));
  assert.ok(chunks.every((f) => posix.dirname(f) === 'dist/tools' && f.endsWith('.js')), 'the command is JavaScript chunks directly in dist/tools/');
  const reached = new Set<string>();
  for (const chunk of chunks)
    for (const [, specifier] of (await readFile(join(installed, chunk), 'utf8')).matchAll(/(?:from|import\()\s*"(\.\.\/[^"]+)"/g))
      reached.add(posix.join('dist/tools', specifier!));
  const library = Object.values(installedManifest.exports as Record<string, { default: string }>).map((t) => t.default.replace(/^\.\//, ''));
  assert.deepEqual([...reached].filter((f) => !library.includes(f) && !['dist/src/internal.js', 'dist/explain/internal.js', 'dist/vendor/glyph.js'].includes(f)), [], 'the command reaches the library through its entry points, internal barrels and shaper only');
  for (const f of ['dist/src/index.js', 'dist/src/internal.js', 'dist/explain/internal.js']) assert.ok(reached.has(f), `the command imports ${f}`);
  for (const f of reached) assert.ok(shipped.includes(f), `the command imports ${f}, which the archive does not ship`);
  // Copy the real authoring examples into the outside project, each folder whole (its scene,
  // model and picture modules). Engine imports use the installed package; other imports keep
  // their relative paths, so a dependency outside the explainer's folder still fails.
  const copyAuthorSource = async (source: string, target: string) => {
    const code = packageImports(await readFile(source, 'utf8'), ROOT);
    await writeFile(target, code);
  };
  /** Copy an explainer's folder into the outside project as `<prefix><name>`, with its script and the tests its claims name. */
  const copyExample = async (name: string, source: string, prefix = 'outline-') => {
    const target = join(folder, prefix + name);
    await mkdir(target);
    for (const file of (await readdir(source)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')))
      await copyAuthorSource(join(source, file), join(target, file));
    // The script holds the explainer's intent (its answer among it), which check reads beside the scene.
    if (existsSync(join(source, 'script.md'))) await copyFile(join(source, 'script.md'), join(target, 'script.md'));
    // A claim names the test that backs it, found in the scene's folder first. An outside project
    // keeps its tests beside its scenes, so carry each named test file over (with its fixtures);
    // check still fails if the named test is not in it.
    for (const [, file] of (await readFile(join(source, 'scene.ts'), 'utf8')).matchAll(/test:\s*['"`]([^'"`:]+\.test\.ts):/g)) {
      if (existsSync(join(source, file!))) {
        await mkdir(dirname(join(target, file!)), { recursive: true });
        await copyAuthorSource(join(source, file!), join(target, file!));
        if (existsSync(join(source, 'fixtures')) && !existsSync(join(target, 'fixtures'))) await cp(join(source, 'fixtures'), join(target, 'fixtures'), { recursive: true });
      } else {
        await mkdir(dirname(join(folder, file!)), { recursive: true });
        await copyFile(join(ROOT, file!), join(folder, file!));
      }
    }
    return target;
  };
  // The diagram add-on, from the installed command. Without it, a diagram that scene.snapshots/ lacks
  // is refused with the line that installs it, and pinned natural diagrams (font-metrics) replay.
  await mkdir(join(folder, 'drawn'));
  await writeFile(join(folder, 'drawn/scene.ts'), `import{Scene}from'rayner';import{stage}from'rayner/explain';export default class Drawn extends Scene{static meta={id:'drawn',title:'One diagram'};async construct(){const s=stage(this);await this.step('one',{caption:'A diagram from Mermaid source.'});await s.show({source:'graph LR\\nA --> B'});}}`);
  const addOn = Object.entries(installedManifest.peerDependencies as Record<string, string>).map(([name, range]) => `${name}@${range}`);
  const refused = await run(process.execPath, [cli, 'check', 'drawn'], { cwd: folder }).then(() => undefined, (error: { stderr: string }) => error);
  assert.ok(refused, 'a diagram to capture without the diagram add-on is refused');
  assert.match(refused.stderr, /capturing the diagram "graph LR", which scene\.snapshots\/ does not hold, needs the diagram add-on/);
  assert.ok(refused.stderr.includes(`Install it with: npm install --save-dev ${addOn.join(' ')}.`), refused.stderr);
  const bare = await copyExample('font-metrics', join(ROOT, 'scenes/explainers/font-metrics'), 'without-diagram-addon-');
  for (const pinned of ['scene.lettering.json', 'scene.snapshots'])
    await cp(join(ROOT, 'scenes/explainers/font-metrics', pinned), join(bare, pinned), { recursive: true });
  await run(process.execPath, [cli, 'build', bare, '--out', 'public/without-diagram-addon.html'], {
    cwd: folder, env: { ...process.env, RAYNER_LETTERING_PYTHON: join(folder, 'no-python-here'), RAYNER_LETTERING_FONTS: join(folder, 'no-source-fonts-here') },
  });
  // The collection's own tests import Agentic Mermaid, and they type-check below: install the add-on now.
  await run('npm', ['install', '--no-audit', '--no-fund', '--save-dev', ...addOn], { cwd: folder, maxBuffer: 4 * 1024 * 1024 });
  // Public-API extension recipes must work from the installed archive too.
  await run(process.execPath, [join(installed, 'dist/recipes/render.js'), '--out', join(folder, 'recipe-output')], { cwd: folder });
  const recipeTrace = JSON.parse(await readFile(join(folder, 'recipe-output/document.trace.json'), 'utf8'));
  assert.equal(recipeTrace.steps.find((s: {step: string}) => s.step === 'result').after.destination, 'cache');
  assert.ok(Math.abs(JSON.parse(await readFile(join(folder, 'recipe-output/continuous.state.json'), 'utf8')).angle - Math.PI / 2) < 1e-9);
  const choreographyTrace = JSON.parse(await readFile(join(folder, 'recipe-output/choreography.trace.json'), 'utf8'));
  assert.equal(choreographyTrace.steps.at(-1).after.count, 9);
  assert.ok(existsSync(join(folder, 'recipe-output/invariants.trace.json')), 'the invariant recipe runs from the archive');
  // The drawing kit resolves from the installed archive as rayner/drawing.
  const kit = await run(process.execPath, ['--input-type=module', '-e', "const k = await import('rayner/drawing'); console.log(Object.keys(k).sort().join(','))"], { cwd: folder });
  // The same names the checkout's kit exports (test/drawing.test.ts pins those), 3D included.
  const sourceKit = Object.keys(await import(pathToFileURL(join(ROOT, 'explain/drawing.ts')).href)).sort().join(',');
  assert.equal(kit.stdout.trim(), sourceKit);
  // So do the extras and testing entry points, with the checkout's names.
  for (const [entry, source] of [['rayner/extras', 'extras/index.ts'], ['rayner/testing', 'explain/testing.ts']] as const) {
    const names = await run(process.execPath, ['--input-type=module', '-e', `const k = await import('${entry}'); console.log(Object.keys(k).sort().join(','))`], { cwd: folder });
    assert.equal(names.stdout.trim(), Object.keys(await import(pathToFileURL(join(ROOT, source)).href)).sort().join(','), entry);
  }
  await copyFile(join(ROOT, 'test/consumer/consumer.ts'), join(folder, 'consumer.ts'));
  await copyFile(join(ROOT, 'test/consumer/tsconfig.json'), join(folder, 'tsconfig.json'));
  await run(join(folder, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: folder });
  // Every explainer, its tests and every recipe, engine imports rewritten to the entry points, type-check
  // against the packed declarations, where @internal members are left out.
  const authored = await typeCheckAuthored(ROOT, folder, join(folder, 'node_modules/.bin/tsc'));
  assert.ok(authored.scenes > 100 && authored.tests > 60 && authored.recipes >= 5,
    `type-checked only ${authored.scenes} scene files, ${authored.tests} tests and ${authored.recipes} recipes`);

  await run(process.execPath, [cli, 'init', 'first'], { cwd: folder });
  // The starter is the tutorial's LRU/MRU explainer. Its model test runs as the tutorial says,
  // and it draws no diagram, so it checks without a browser. check takes the scene to be the export
  // that extends the command's own Scene class, so it passes only if the scene and the command
  // loaded one engine.
  await run(process.execPath, ['--test', 'first/model.test.ts'], { cwd: folder });
  await run(process.execPath, [cli, 'check', 'first'], { cwd: folder });
  // Evidence references must resolve in the author's project, not the installed package.
  const starter = join(folder, 'first/scene.ts');
  await writeFile(starter, (await readFile(starter, 'utf8')).replace('static meta = {',
    `static meta = { claims: [{ says: 'LRU evicts the item used longest ago', test: "first/model.test.ts: LRU matches Wikipedia" }],`));
  await run(process.execPath, [cli, 'check', 'first'], { cwd: folder });
  // The blank starter: its files type-check against the packed declarations, and check fails it with
  // its to-do list, the script first and the picture last.
  await run(process.execPath, [cli, 'init', '--blank', 'blank'], { cwd: folder });
  await writeFile(join(folder, 'blank/tsconfig.json'), JSON.stringify({
    compilerOptions: { ...authoredOptions, types: ['node'], typeRoots: [join(ROOT, 'node_modules/@types')] }, include: ['*.ts'],
  }));
  await run(join(folder, 'node_modules/.bin/tsc'), ['-p', 'blank/tsconfig.json'], { cwd: folder });
  const blankCheck = await run(process.execPath, [cli, 'check', 'blank'], { cwd: folder }).then(() => ({ stderr: 'passed' }), (error: { stderr: string }) => error);
  assert.match(blankCheck.stderr, /To do, in order:\n1\. script\.md: fill in the intent header[^\n]*\n2\. script\.md: write Checked against and Grounding[^\n]*\n3\. model\.test\.ts fails: [^\n]*TODO: replace this placeholder[^\n]*\n4\. scene\.ts: step "start" still says TODO/);
  if (process.env.EXPLAIN_BROWSER) {
    await run(bin, ['snapshots', 'first', '--refresh'], { cwd: folder });
    // The starter draws no diagrams, so it keeps no snapshots.
    assert.equal(existsSync(join(folder, 'first/scene.snapshots')), false);
    await run(bin, ['check', 'first'], { cwd: folder });
    await run(bin, ['build', 'first', '--out', 'public/first.html'], { cwd: folder });
    // The documented starter must actually serve with the normal authoring dependencies.
    const preview = spawn(bin, ['preview', 'first', '--watch', '--port', '0'], { cwd: folder, env: process.env });
    let browser: Awaited<ReturnType<typeof import('../lib/browser.ts').launch>> | undefined;
    let log = '';
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Installed starter preview timed out: ${log}`)), 30_000);
        const finish = (error?: Error, url?: string) => {
          clearTimeout(timeout);
          error ? reject(error) : resolve(url!);
        };
        preview.on('error', (error) => finish(error));
        preview.on('exit', (code) => finish(new Error(`Installed starter preview exited ${code}: ${log}`)));
        preview.stderr.on('data', (data) => { log += String(data); });
        preview.stdout.on('data', (data) => {
          log += String(data);
          const match = /Preview (http:\/\/127\.0\.0\.1:\d+)\//.exec(log);
          if (match) finish(undefined, match[1]);
        });
      });
      browser = await (await import('../lib/browser.ts')).launch();
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url);
      await page.waitForSelector('[data-ready=true]');
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === 'evict');
      assert.match(await page.locator('.caption').innerText(), /LRU evicts the item used longest ago, A/);
      // meta.id defaults to the starter's folder name, so the page is first.html.
      await page.goto(url + '/first.html?next=reuse&step=rest');
      await page.waitForSelector('[data-ready=true]');
      assert.match(await page.locator('.caption').innerText(), /all four repeats miss/);
      const source = join(folder, 'first/scene.ts');
      await writeFile(source, (await readFile(source, 'utf8')).replace('so all four repeats miss.', 'so every repeat misses.'));
      // Wait for the watch rebuild before reload; this also covers macOS fs.watch.
      await waitUntil(() => log.includes('Rebuilt'), () => `Installed watch rebuild timed out: ${log}`);
      await page.reload();
      await page.waitForSelector('[data-ready=true]');
      assert.match(await page.locator('.caption').innerText(), /every repeat misses/);
      assert.deepEqual(errors, []);
    } finally {
      try { await browser?.close(); }
      finally {
        if (preview.exitCode === null && preview.signalCode === null) {
          const stopped = new Promise<void>((resolve) => preview.once('exit', () => resolve()));
          preview.kill('SIGTERM');
          await stopped;
        }
      }
    }
  }
  // Use native objects only, so this distribution smoke needs no browser.
  const native = `import{Scene,Text,FadeIn}from'rayner';import{stage,settingsOf}from'rayner/explain';export default class Outside extends Scene{static meta={id:'outside',title:'An outside author'};static settings=[{id:'case',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];async construct(){const s=stage(this);await this.step('one',{title:'First step',caption:'A native scene outside the checkout.'});await this.play(new FadeIn(new Text(settingsOf(this).case,{color:s.look.ink})));}}`;
  // This author keeps the title in the scene, so the starter's script.md (its other home) goes.
  await rm(join(folder, 'first/script.md'));
  await writeFile(join(folder, 'first/scene.ts'), native);
  await run(process.execPath, [cli, 'check', 'first'], { cwd: folder });
  // `see` reads a step from the terminal with no browser installed.
  const seen = await run(process.execPath, [cli, 'see', 'first', 'one', '--scenario', 'case=b'], { cwd: folder });
  assert.match(seen.stdout, /^outside · step 1 of 1: one · Case: B$/m);
  await run(process.execPath, [cli, 'build', 'first', '--out', 'public/outside.html'], { cwd: folder });
  const html = await readFile(join(folder, 'public/outside.html'), 'utf8');
  assert.match(html, /An outside author/);
  assert.match(html, /id="licenses"/);
  assert.ok(!html.includes('node_modules/agentic-mermaid'));
  if (process.env.EXPLAIN_BROWSER) {
    await writeFile(join(folder, 'first/scene.review.json'), JSON.stringify({ version: 2, subjects: [{ step: 'one', settings: { case: 'b' }, opening: true, targets: [{ text: 'b' }] }] }));
    await run(bin, ['review', 'first', '--out', 'review'], { cwd: folder });
    const reviewed = JSON.parse(await readFile(join(folder, 'review/review.json'), 'utf8'));
    assert.equal(reviewed.scenarios, 2);
    assert.equal(reviewed.stepWidths, 4);
    assert.deepEqual(reviewed.consoleErrors, []);
    assert.equal(reviewed.artifactHash, JSON.parse(await readFile(join(folder, 'public/outside.html.receipt.json'), 'utf8')).artifactHash, 'review checks the same page that build publishes');
    const originalCli = await readFile(cli);
    try {
      await writeFile(cli, Buffer.concat([originalCli, Buffer.from('\n// independently changed installed command\n')]));
      await run(bin, ['review', 'first', '--out', 'review-after-command-edit'], { cwd: folder });
      const changed = JSON.parse(await readFile(join(folder, 'review-after-command-edit/review.json'), 'utf8'));
      assert.notEqual(changed.buildHash, reviewed.buildHash, 'installed JS is part of the artifact identity');
    } finally { await writeFile(cli, originalCli); }
  }
  // The optional score module and its CSS must resolve from the installed archive.
  await writeFile(join(folder, 'played.ts'), `import{Scene,Text,FadeIn}from'rayner';import type{AudioClip}from'rayner/explain';const clip:AudioClip={id:'a',label:'Play middle C',bpm:96,beats:4,notes:[{midi:60,at:0,duration:1}],plot:[-6,-2,6,2]};export default class Played extends Scene{static meta={id:'played',title:'A locally played note'};async construct(){await this.step('listen',{title:'Middle C',caption:'Press Play to hear middle C.',audio:{clips:[clip]}});await this.play(new FadeIn(new Text('C')));}}`);
  await run(bin, ['build', 'played.ts', '--out', 'public/played.html'], {cwd: folder});
  assert.match(await readFile(join(folder, 'public/played.html'), 'utf8'), /score-audio/);
  assert.ok(!html.includes('score-audio'), 'the installed opt-out page omits sound code');
  if (process.env.EXPLAIN_BROWSER) {
    const soundServer=await (await import('../lib/explain-serve.ts')).serve(join(folder,'public'),0,'played.html');
    const soundBrowser=await (await import('../lib/browser.ts')).launch();
    try {
      const page=await soundBrowser.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(soundServer.url+'/played.html');await page.waitForSelector('[data-ready=true]');
      assert.equal(await page.locator('.score-playhead').count(),0);
      await page.getByRole('button',{name:'Play A: Play middle C',exact:true}).click();
      await page.waitForSelector('.score-playhead',{state:'attached'});
      const ink=await page.locator('.score-playhead').evaluate(node=>{const style=getComputedStyle(node);return {stroke:style.stroke,width:parseFloat(style.strokeWidth),opacity:parseFloat(style.opacity),height:(node as SVGGraphicsElement).getBBox().height};});
      assert.ok(ink.stroke!=='none'&&ink.width>0&&ink.opacity>0&&ink.height>0,'the installed playhead has painted stroke');
      await page.getByRole('button',{name:'Stop',exact:true}).click();
      assert.equal(await page.locator('.score-playhead').count(),0);assert.deepEqual(errors,[]);
    } finally {await soundBrowser.close();soundServer.close();}
  }
  // Lettering on request from the installed package: the fixture scene with its pinned cuts,
  // so the build reads vendor/lettering/ and src/lettering.js from the archive and needs no fonttools.
  const fixture = join(ROOT, 'test/fixtures/lettering');
  await mkdir(join(folder, 'greek'));
  await writeFile(
    join(folder, 'greek/scene.ts'),
    packageImports(await readFile(join(fixture, 'scene.ts'), 'utf8'), ROOT),
  );
  await copyFile(join(fixture, 'scene.lettering.json'), join(folder, 'greek/scene.lettering.json'));
  await run(process.execPath, [cli, 'build', 'greek', '--out', 'public/greek.html'], {
    cwd: folder,
    env: { ...process.env, PYFTSUBSET: join(folder, 'no-fonttools-here') },
  });
  const lettered = JSON.parse(await readFile(join(folder, 'public/greek.html.receipt.json'), 'utf8'));
  assert.deepEqual(lettered.lettering.scripts, ['Grek']);
  assert.ok(!JSON.parse(await readFile(join(folder, 'public/outside.html.receipt.json'), 'utf8')).lettering);
  // Outline snapshots captured against source .ts must remain fresh against
  // the archive's compiled .js engine, without Python or source font caches.
  const outlineFixtures = ['arabic', 'devanagari', 'hebrew', 'math', 'matching', 'style', 'styles'].map((name): [string, string] => [name, join(ROOT, 'test/lettering', name)]);
  // Exercise new authoring options through the installed compiled CLI as well:
  // capture-free natural font replay and explicit panel direction are distinct
  // from the source-checkout properties.
  const replayFixtures: [string, string][] = [...outlineFixtures,
    ['font-metrics', join(ROOT, 'scenes/explainers/font-metrics')],
    ['layout-direction', join(ROOT, 'scenes/explainers/layout-direction')],
  ];
  for (const [name, source] of replayFixtures) {
    const target = await copyExample(name, source);
    if (name !== 'layout-direction') await copyFile(join(source, 'scene.lettering.json'), join(target, 'scene.lettering.json'));
    if (name === 'style' || name === 'font-metrics') {
      await cp(join(source, 'scene.snapshots'), join(target, 'scene.snapshots'), { recursive: true });
    }
    const env = {
      ...process.env,
      RAYNER_LETTERING_PYTHON: join(folder, 'no-python-here'),
      RAYNER_LETTERING_FONTS: join(folder, 'no-source-fonts-here'),
    };
    await run(process.execPath, [cli, 'check', target, '--out', join(folder, 'checks', name)], { cwd: folder, env });
    await run(process.execPath, [cli, 'build', target, '--out', `public/outline-${name}.html`], { cwd: folder, env });
    const receipt = JSON.parse(await readFile(join(folder, `public/outline-${name}.html.receipt.json`), 'utf8'));
    assert.equal(!!receipt.letteringHash, name !== 'layout-direction', name);
  }
  // With the diagram add-on installed (above), the morph edits a pinned explainer makes replay through
  // Agentic Mermaid as the build collects it.
  const morphing = await copyExample('agentic-mermaid', join(ROOT, 'scenes/explainers/agentic-mermaid'), 'diagram-');
  await cp(join(ROOT, 'scenes/explainers/agentic-mermaid/scene.snapshots'), join(morphing, 'scene.snapshots'), { recursive: true });
  await run(process.execPath, [cli, 'build', morphing, '--out', 'public/diagram-agentic-mermaid.html'], { cwd: folder });
  if (process.env.EXPLAIN_BROWSER) {
    // And with Chromium, the command captures the new diagram.
    await run(bin, ['snapshots', 'drawn'], { cwd: folder });
    assert.ok(existsSync(join(folder, 'drawn/scene.snapshots/index.json')), 'the installed command captured the diagram');
    await run(bin, ['build', 'drawn', '--out', 'public/drawn.html'], { cwd: folder });
  }
  if (process.env.EXPLAIN_LETTERING === '1') {
    const target = join(folder, 'captured-lettering');
    await mkdir(target);
    await writeFile(join(target, 'scene.ts'), `import{Scene,Text,MathTex}from'rayner';import{stage}from'rayner/explain';export default class L extends Scene{static meta={id:'captured-lettering',title:'Captured lettering',lettering:{scripts:['Arab'],math:true}};async construct(){const s=stage(this,{heading:false});await this.step('arabic',{caption:'Arabic'});await s.enter(new Text('السَّلَامُ عَلَيْكُمْ',{color:s.look.ink}));await this.step('math',{caption:'Maths'});await s.clear();await s.enter(new MathTex('\\\\frac{1}{2}+x^2',{color:s.look.ink}));}}`);
    await run(bin, ['snapshots', target, '--refresh'], {
      cwd: folder,
      env: { ...process.env, RAYNER_LETTERING_FONTS: process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts') },
    });
    const env = { ...process.env, RAYNER_LETTERING_PYTHON: join(folder, 'no-python-here'), RAYNER_LETTERING_FONTS: join(folder, 'no-source-fonts-here') };
    await run(bin, ['check', target], { cwd: folder, env });
    await run(bin, ['build', target, '--out', 'public/captured-lettering.html'], { cwd: folder, env });
    const receipt = JSON.parse(await readFile(join(folder, 'public/captured-lettering.html.receipt.json'), 'utf8'));
    assert.ok(receipt.letteringHash);
    if (process.env.EXPLAIN_BROWSER) {
      // A caption edit invalidates the outline source hash. Watch must capture
      // again, just as its initial preview does, rather than keep the old page.
      const captureEnv = { ...process.env, RAYNER_LETTERING_FONTS: process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts') };
      const preview = spawn(bin, ['preview', target, '--watch', '--port', '0', '--out', 'public/watched-lettering.html'], { cwd: folder, env: captureEnv });
      let log = '';
      preview.stdout.on('data', data => { log += String(data); });
      preview.stderr.on('data', data => { log += String(data); });
      const waitFor = (predicate: () => boolean) => waitUntil(predicate, () => log, () => {
        assert.equal(preview.exitCode, null, log);
        assert.ok(!log.includes('still serving the last good build'), log);
      });
      let browser: Awaited<ReturnType<typeof import('../lib/browser.ts').launch>> | undefined;
      try {
        await waitFor(() => /Preview http:\/\/127\.0\.0\.1:\d+/.test(log));
        const url = /Preview (http:\/\/127\.0\.0\.1:\d+)/.exec(log)![1]!;
        browser = await (await import('../lib/browser.ts')).launch();
        const page = await browser.newPage();
        await page.goto(url);
        await page.waitForSelector('[data-ready=true]');
        assert.equal(await page.locator('.caption').innerText(), 'Arabic');
        const sceneFile = join(target, 'scene.ts');
        await writeFile(sceneFile, (await readFile(sceneFile, 'utf8')).replace("caption:'Arabic'", "caption:'Arabic after an edit'"));
        await waitFor(() => log.includes('Rebuilt'));
        await page.reload();
        await page.waitForSelector('[data-ready=true]');
        assert.equal(await page.locator('.caption').innerText(), 'Arabic after an edit');
      } finally {
        await browser?.close();
        if (preview.exitCode === null && preview.signalCode === null) {
          const stopped = new Promise<void>(resolve => preview.once('exit', () => resolve()));
          preview.kill('SIGTERM');
          await stopped;
        }
      }
    }
  }
  const result = await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import{Scene}from'rayner';import{stage}from'rayner/explain';const scene=new Scene({skipUntil:Infinity,async frame(){}});await scene.run();stage(scene);console.log(scene.mobjects.length);`,
    ],
    { cwd: folder },
  );
  // The stage adds the paper, the heading's band and the heading.
  assert.equal(result.stdout.trim(), '3');
  // describeExplainer from the installed package: the outside author's scene, both scenarios.
  const described = await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import{describeExplainer}from'rayner/testing';import S from'./first/scene.ts';const d=await describeExplainer(S);console.log(d.scenarios.map((c)=>c.values.case+':'+c.steps.map((s)=>s.step).join(',')).join(' '));`,
    ],
    { cwd: folder },
  );
  assert.equal(described.stdout.trim(), 'a:one b:one');
  // The example in REFERENCE "Describe", verbatim, on the `rayner init` starter, which draws no diagrams and so keeps no snapshot index.
  const describeSection = (await readFile(join(ROOT, 'docs/REFERENCE.md'), 'utf8')).split(/^## /m).find((s) => s.startsWith('Describe\n')),
    example = /^```ts\n([\s\S]*?)^```/m.exec(describeSection ?? '')?.[1];
  assert.ok(example, 'docs/REFERENCE.md "Describe" has a ts example');
  await run(process.execPath, [cli, 'init', 'my-explainer'], { cwd: folder });
  await run(process.execPath, [cli, 'snapshots', 'my-explainer'], { cwd: folder });
  await writeFile(join(folder, 'describe.ts'), example);
  const walked = (await run(process.execPath, ['describe.ts'], { cwd: folder })).stdout;
  assert.match(walked, /^After A B C D, request: C D C D · rest: .+\n  changed: .*\bHits\b/m);

  console.log(
    'Package gate passed: one tested archive installed plainly, its entry points the only modules it exports and nothing outside its files; the command working from its bin link with PNG authoring and without the diagram add-on (an optional peer), which a diagram to capture asks for by its install line and which then replays morph edits; installed TypeScript consumer, every explainer, its tests and every recipe type-checked against the packed declarations, executable JS bin, external native author, settings, checks, the blank starter type-checked and its to-do list, see, build, optional score audio, describeExplainer and its REFERENCE example, notices, lettering on request, one compiled engine shared by the command and its scenes' +
      (process.env.EXPLAIN_LETTERING === '1' ? ', installed Arabic and maths capture' : '') +
      (process.env.EXPLAIN_BROWSER ? ', installed diagram capture' : '') +
      '.',
  );
  await checkCandidate(' after the package checks');
} finally {
  await rm(folder, { recursive: true, force: true });
}

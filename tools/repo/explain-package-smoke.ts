#!/usr/bin/env node
// Explicit distribution gate: pack rayner and rayner-cli, install both in a fresh author project,
// run the installed command there. The library is also installed alone, to show it needs nothing.
import { mkdtemp, mkdir, writeFile, readFile, copyFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/explain-project.ts';
const run = promisify(execFile),
  folder = await mkdtemp(join(tmpdir(), 'rayner-package-'));
/** The two packages, in install order: the library, then the command that depends on it. */
const PACKAGES = [{ name: 'rayner', directory: '.' }, { name: 'rayner-cli', directory: 'cli' }] as const;
try {
  const { values } = parseArgs({ options: { archive: { type: 'string' }, 'cli-archive': { type: 'string' }, manifest: { type: 'string' } } });
  if ((values.archive || values['cli-archive']) && values.manifest) throw new Error('Choose --archive and --cli-archive, or --manifest');
  if (!values.archive !== !values['cli-archive']) throw new Error('Give both --archive (rayner) and --cli-archive (rayner-cli)');
  type Packed = { name: string; filename: string; integrity: string };
  let candidate: { sourceCommit: string; packages: Packed[] } | undefined;
  if (values.manifest) {
    candidate = JSON.parse(await readFile(resolve(values.manifest), 'utf8'));
    assert.ok(candidate && Array.isArray(candidate.packages), 'invalid candidate manifest');
    assert.deepEqual(candidate.packages.map((p) => p.name), PACKAGES.map((p) => p.name), 'the candidate holds rayner and rayner-cli');
    for (const p of candidate.packages)
      assert.ok(typeof p.filename === 'string' && basename(p.filename) === p.filename && p.filename.endsWith('.tgz'), 'invalid candidate filename');
    const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
    assert.equal(candidate.sourceCommit, commit, 'candidate comes from another source commit');
  }
  const archives: string[] = [];
  for (const [i, p] of PACKAGES.entries()) {
    const selected = candidate ? join(dirname(resolve(values.manifest!)), candidate.packages[i]!.filename) : i === 0 ? values.archive : values['cli-archive'];
    if (selected) archives.push(resolve(selected));
    else {
      // npm pack runs each package's prepack: build:lib for rayner, tools/repo/build-cli.ts for rayner-cli.
      const packed = await run('npm', ['pack', '--json', '--pack-destination', folder], { cwd: join(ROOT, p.directory), maxBuffer: 4 * 1024 * 1024 });
      archives.push(join(folder, JSON.parse(packed.stdout)[0].filename));
    }
  }
  const [archive, cliArchive] = archives as [string, string];
  const integrity = async (file: string) => 'sha512-' + createHash('sha512').update(await readFile(file)).digest('base64');
  const checkCandidate = async (when: string) => {
    if (candidate) for (const [i, file] of archives.entries()) assert.equal(await integrity(file), candidate.packages[i]!.integrity, `candidate archive integrity mismatch${when}`);
  };
  await checkCandidate('');
  const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

  // The library alone: no dependencies, so its install is the package and nothing else, and every
  // entry point loads from it.
  const alone = join(folder, 'library-alone');
  await mkdir(alone);
  await writeFile(join(alone, 'package.json'), JSON.stringify({ name: 'library-alone', private: true, type: 'module' }));
  await run('npm', ['install', '--no-audit', '--no-fund', archive], { cwd: alone, maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual((await readdir(join(alone, 'node_modules'))).filter((name) => !name.startsWith('.')), ['rayner'], 'rayner installs no dependencies');
  const library = JSON.parse(await readFile(join(alone, 'node_modules/rayner/package.json'), 'utf8'));
  assert.equal(library.version, version);
  assert.equal(library.dependencies, undefined, 'rayner has no runtime dependencies');
  assert.equal(library.bin, undefined, 'the rayner command ships in rayner-cli');
  for (const entry of ['rayner', 'rayner/explain', 'rayner/drawing', 'rayner/geo', 'rayner/audio', 'rayner/extras', 'rayner/lettering', 'rayner/output', 'rayner/testing'])
    await run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(entry)})`], { cwd: alone });
  // Capture and the command stay out of the library: no tools, player, Python, capture code or typesetter.
  for (const file of ['tools', 'app', 'dist/tools', 'integrations/agentic-mermaid/build', 'dist/integrations/agentic-mermaid/build', 'vendor/glyph-math.js', 'dist/vendor/glyph-math.js', 'vendor/lettering'])
    assert.ok(!existsSync(join(alone, 'node_modules/rayner', file)), `rayner ships ${file}`);
  for (const file of ['explain/audio.ts', 'src/lettering-outlines.ts', 'integrations/agentic-mermaid/snapshot.ts', 'explain/diagrams.ts', 'vendor/glyph.js', 'vendor/licenses/glyph-MIT.txt', 'LICENSE'])
    assert.ok(existsSync(join(alone, 'node_modules/rayner', file)), `rayner is missing ${file}`);

  await writeFile(
    join(folder, 'package.json'),
    JSON.stringify({ name: 'outside-author', private: true, type: 'module' }),
  );
  // Both archives at once: rayner-cli's exact rayner dependency is satisfied by the rayner archive.
  await run('npm', ['install', '--no-audit', '--no-fund', archive, cliArchive], {
    cwd: folder,
    maxBuffer: 4 * 1024 * 1024,
  });
  const cli = join(folder, 'node_modules/rayner-cli/dist/tools/explain.js');
  const bin = join(folder, 'node_modules/.bin/rayner');
  assert.ok((await run(bin, ['--help'], { cwd: folder })).stdout.startsWith(`Rayner ${version} (Node 24+)`));
  assert.equal((await run(bin, ['--version'], { cwd: folder })).stdout.trim(), version);
  const installed = join(folder, 'node_modules/rayner'), command = join(folder, 'node_modules/rayner-cli');
  assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, version);
  const commandManifest = JSON.parse(await readFile(join(command, 'package.json'), 'utf8'));
  assert.equal(commandManifest.version, version);
  assert.equal(commandManifest.dependencies.rayner, version, 'rayner-cli requires rayner at exactly its own version');
  assert.ok(!existsSync(join(command, 'node_modules/rayner')), 'one rayner: the command uses the author\'s');
  for (const file of ['app/embed-audio.ts', 'app/embed-audio.css', 'tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/lettering-outline-fonts.sh', 'vendor/glyph-math.js', 'vendor/lettering/inter.woff2', 'vendor/licenses/LatinModernMath-GUST.txt', 'vendor/licenses/glyph-MIT.txt', 'LICENSE'])
    assert.ok(existsSync(join(command, file)), `rayner-cli is missing ${file}`);
  // Public-API extension recipes must work from the installed archive too.
  await run(process.execPath, [join(installed, 'dist/recipes/render.js'), '--out', join(folder, 'recipe-output')], { cwd: folder });
  const recipeTrace = JSON.parse(await readFile(join(folder, 'recipe-output/document.trace.json'), 'utf8'));
  assert.equal(recipeTrace.steps.find((s: {step: string}) => s.step === 'result').after.destination, 'cache');
  assert.match(await readFile(join(folder, 'recipe-output/continuous.txt'), 'utf8'), /1\.57/);
  const choreographyTrace = JSON.parse(await readFile(join(folder, 'recipe-output/choreography.trace.json'), 'utf8'));
  assert.equal(choreographyTrace.steps.at(-1).after.count, 9);
  assert.ok(existsSync(join(folder, 'recipe-output/invariants.trace.json')), 'the invariant recipe runs from the archive');
  // The drawing kit resolves from the installed archive as rayner/drawing.
  const kit = await run(process.execPath, ['--input-type=module', '-e', "const k = await import('rayner/drawing'); console.log(Object.keys(k).sort().join(','))"], { cwd: folder });
  // The same names the checkout's kit exports (test/drawing.test.ts pins those), 3D included.
  const sourceKit = Object.keys(await import(pathToFileURL(join(ROOT, 'explain/drawing.ts')).href)).sort().join(',');
  assert.equal(kit.stdout.trim(), sourceKit);
  // So do the output and testing entry points, with the checkout's names.
  for (const [entry, source] of [['rayner/output', 'src/output.ts'], ['rayner/testing', 'explain/testing.ts']] as const) {
    const names = await run(process.execPath, ['--input-type=module', '-e', `const k = await import('${entry}'); console.log(Object.keys(k).sort().join(','))`], { cwd: folder });
    assert.equal(names.stdout.trim(), Object.keys(await import(pathToFileURL(join(ROOT, source)).href)).sort().join(','), entry);
  }
  await copyFile(join(ROOT, 'test/consumer/consumer.ts'), join(folder, 'consumer.ts'));
  await copyFile(join(ROOT, 'test/consumer/tsconfig.json'), join(folder, 'tsconfig.json'));
  await run(join(folder, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: folder });

  await run(process.execPath, [cli, 'init', 'first'], { cwd: folder });
  // The starter is the tutorial's LRU/MRU explainer. Its model test runs as the tutorial says,
  // and it draws no diagram, so it checks without a browser.
  await run(process.execPath, ['--test', 'first/model.test.ts'], { cwd: folder });
  await run(process.execPath, [cli, 'check', 'first'], { cwd: folder });
  // Evidence references must resolve in the author's project, not the installed package.
  const starter = join(folder, 'first/scene.ts');
  await writeFile(starter, (await readFile(starter, 'utf8')).replace('static meta = {',
    `static meta = { claims: [{ says: 'LRU evicts the item used longest ago', test: "first/model.test.ts: LRU matches Wikipedia" }],`));
  await run(process.execPath, [cli, 'check', 'first'], { cwd: folder });
  // Diagram capture and PNG tools ship in the default authoring install.
  assert.ok(existsSync(join(folder, 'node_modules/@resvg/resvg-js')));
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
      const deadline = Date.now() + 30_000;
      while (!log.includes('Rebuilt')) {
        assert.ok(Date.now() < deadline, `Installed watch rebuild timed out: ${log}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
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
  const native = `import{Scene,Text,FadeIn}from'rayner';import{stage,settingsOf}from'rayner/explain';export default class Outside extends Scene{static meta={id:'outside',title:'An outside author'};static settings=[{id:'case',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];async construct(){const s=stage(this);await this.step('one',{title:'First step',caption:'A native scene outside the checkout.'});await this.play(new FadeIn(new Text(settingsOf(this).case,{color:s.palette.ink})));}}`;
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
    (await readFile(join(fixture, 'scene.ts'), 'utf8'))
      .replace("'../../../src/index.ts'", "'rayner'")
      .replace("'../../../explain/index.ts'", "'rayner/explain'")
      .replace("'../../../src/lettering.ts'", "'rayner/lettering'"),
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
  // Copy the real authoring examples into the outside project, each folder whole (its scene,
  // model and picture modules). Engine imports use the installed package; other imports keep
  // their relative paths, so a dependency outside the explainer's folder still fails.
  const copyAuthorSource = async (source: string, target: string) => {
    const code = (await readFile(source, 'utf8')).replace(
      /(['"])(?:\.\.\/)+(src\/index|src\/output|src\/extras|explain\/index|explain\/drawing|explain\/geo|explain\/score)\.ts\1/g,
      (_match, quote: string, area: string) =>
        `${quote}${({ 'src/index': 'rayner', 'src/output': 'rayner/output', 'src/extras': 'rayner/extras', 'explain/index': 'rayner/explain', 'explain/drawing': 'rayner/drawing', 'explain/geo': 'rayner/geo', 'explain/score': 'rayner/audio' } as Record<string, string>)[area]}${quote}`,
    );
    await writeFile(target, code);
  };
  for (const [name, source] of replayFixtures) {
    const target = join(folder, 'outline-' + name);
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
  if (process.env.EXPLAIN_LETTERING === '1') {
    const target = join(folder, 'captured-lettering');
    await mkdir(target);
    await writeFile(join(target, 'scene.ts'), `import{Scene,Text,MathTex}from'rayner';import{stage}from'rayner/explain';export default class L extends Scene{static meta={id:'captured-lettering',title:'Captured lettering',lettering:{scripts:['Arab'],math:true}};async construct(){const s=stage(this,{heading:false});await this.step('arabic',{caption:'Arabic'});await s.enter(new Text('السَّلَامُ عَلَيْكُمْ',{color:s.palette.ink}));await this.step('math',{caption:'Maths'});await s.clear();await s.enter(new MathTex('\\\\frac{1}{2}+x^2',{color:s.palette.ink}));}}`);
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
      const waitFor = async (predicate: () => boolean) => {
        const until = Date.now() + 30_000;
        while (!predicate()) {
          assert.equal(preview.exitCode, null, log);
          assert.ok(!log.includes('still serving the last good build'), log);
          assert.ok(Date.now() < until, log);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
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
      `import{Scene}from'rayner';import{NullSink}from'rayner/output';import{stage}from'rayner/explain';const scene=new Scene(new NullSink());await scene.run();stage(scene);console.log(scene.mobjects.length);`,
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
    'Package gate passed: rayner alone with no dependencies; both tested archives installed with diagram and PNG authoring, installed TypeScript consumer, executable JS bin, external native author, settings, checks, see, build, optional score audio, describeExplainer and its REFERENCE example, notices, lettering on request, one compiled engine' +
      (process.env.EXPLAIN_LETTERING === '1' ? ', installed Arabic and maths capture' : '') +
      (process.env.EXPLAIN_BROWSER ? ', installed diagram capture' : '') +
      '.',
  );
  await checkCandidate(' after the package checks');
} finally {
  await rm(folder, { recursive: true, force: true });
}

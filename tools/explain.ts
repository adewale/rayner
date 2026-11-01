#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from './lib/explain-serve.ts';
import { collectProject, defaultVariant, sceneSlug, ROOT } from './lib/explain-project.ts';
import { buildExplainer, buildLoader } from './lib/explain-build.ts';
import { STARTER, STARTER_FILES, packageImports } from './lib/explain-init.ts';

// Authoring packages, grouped for installation error messages.
const CAPTURE = ['agentic-mermaid', 'playwright-core', 'svgpath'],
  RASTER = ['@resvg/resvg-js'];
const pkg: { version: string; dependencies: Record<string, string> } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const peers = pkg.dependencies;
const install = (names: string[]) => 'npm i ' + names.map((n) => `${n}@${peers[n]}`).join(' ');
const HELP = `Rayner ${pkg.version} (Node 24+)

Usage: rayner <command> <scene.ts | directory> [options]

Commands:
  init <directory>    Write the tutorial's LRU/MRU explainer: scene, model, test
  preview <scene>     Build and serve on localhost
  snapshots <scene>   Run every case, capture/verify diagrams and replay morph edits
  check <scene>       Every case: seek, motion, skipped trace, bare runtime, step
                      change, still after the caption hold, text collision,
                      legibility, words for every drawing, catch lint
  review <scene>      Check every case, then review its served reader at phone
                      and desktop widths; retain reviewed HTML with --out page.html
  build <scene>       HTML, receipt, header recipe, loader.js
  shots <scene>       Step contact sheet as SVG and PNG
  describe <scene>    Every case and step as JSON for agents: words, state, what
                      changed, the picture in words and drawn as text
  see <scene> [step]  One step's resting picture as text, with its caption, its
                      picture in words and what it changed in scene.state
                      (the last step by default; --out file.svg also writes it)
  version             Print the version (also --version)

Every command fails on text the embedded fonts cannot draw, unless the scene
asks for that script with meta.lettering.

Options:
  --out <path>        Artifact destination
  --refresh           Re-render snapshots instead of using the pinned cache
  --case id=value     Show (shots, see) one case; repeat for multiple settings
  --port <integer>    Preview server port (default 5174)
  --watch             Preview: rebuild the page on save
  --claims <path>     Review: use this JSON file instead of <scene>.review.json
  --version           Print the version

Diagram capture is included. Install Chromium once:
  npx playwright-core install chromium
  or set CHROMIUM_EXECUTABLE_PATH
PNG output is included.
`;
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (!args.length || args.includes('--help') || args[0] === 'help') {
    console.log(HELP);
    return;
  }
  if (args[0] === '--version' || args[0] === 'version') {
    console.log(pkg.version);
    return;
  }
  const { values: flags, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      case: { type: 'string', multiple: true },
      port: { type: 'string', default: '5174' },
      refresh: { type: 'boolean' },
      watch: { type: 'boolean' },
      claims: { type: 'string' },
    },
  });
  const [command, input, ...extra] = positionals;
  if (!input) throw new Error('Supply a scene file or directory. Use --help for usage.');
  // `see` takes the step to show as a second argument.
  const step = command === 'see' ? extra.shift() : undefined;
  if (extra.length) throw new Error(`Unexpected argument: ${extra[0]}`);
  if (command === 'init') {
    const dir = resolve(input);
    await mkdir(dirname(dir), { recursive: true });
    await mkdir(dir, { recursive: false });
    for (const file of STARTER_FILES)
      await writeFile(join(dir, file), packageImports(await readFile(join(STARTER, file), 'utf8')));
    console.log(`Created ${join(dir, 'scene.ts')}, with its model in model.ts and the model's test in model.test.ts`);
    return;
  }
  if (!['preview', 'snapshots', 'check', 'review', 'build', 'shots', 'describe', 'see'].includes(command!))
    throw new Error(`Unknown command: ${command}`);
  const collection = { refresh: flags.refresh, captureLettering: command === 'snapshots' || command === 'preview' };
  const project = await collectProject(input, collection);
  const slug = sceneSlug(project);
  if (command === 'review') {
    const { reviewScene } = await import('./lib/explain-review-scene.ts');
    const artifact = flags.out?.endsWith('.html') ? resolve(flags.out) : undefined;
    const directory = artifact ? resolve('out/review', slug) : flags.out ?? resolve('out/review', slug);
    console.log(JSON.stringify(await reviewScene(project, directory, flags.claims, artifact), null, 2));
    return;
  }
  if (command === 'snapshots') {
    console.log(
      JSON.stringify(
        {
          scene: slug,
          variants: project.variants.length,
          diagrams: Object.keys(project.store).length,
          replayedEdits: project.edits,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'describe') {
    const { describeExplainer } = await import('../explain/describe.ts');
    const json = JSON.stringify(await describeExplainer(project.Scene, { snapshots: project.store }), null, 2) + '\n';
    if (flags.out) await writeFile(flags.out, json);
    else process.stdout.write(json);
    return;
  }
  if (command === 'check') {
    const { checkProject } = await import('./lib/explain-check.ts');
    console.log(
      JSON.stringify(await checkProject(project, flags.out ?? resolve('out/checks', slug)), null, 2),
    );
    return;
  }
  /** The case every --case id=value chooses, other settings at their defaults. */
  function selectedVariant() {
    const values: Record<string, string> = {};
    for (const assignment of flags.case ?? []) {
      const at = assignment.indexOf('=');
      if (at < 1) throw new Error('--case requires id=value');
      values[assignment.slice(0, at)] = assignment.slice(at + 1);
    }
    return defaultVariant(project, values);
  }
  if (command === 'see') {
    const { see } = await import('./lib/explain-see.ts');
    console.log(await see(project, selectedVariant(), step, flags.out));
    return;
  }
  if (command === 'shots') {
    const { contactSheet } = await import('./lib/explain-shots.ts');
    console.log(
      await contactSheet(project, flags.out ?? resolve('out/shots', slug + '.png'), selectedVariant()),
    );
    return;
  }
  const out = flags.out ?? resolve('out/explainers', slug + '.html');
  const result = await buildExplainer(project, out);
  await buildLoader(join(dirname(resolve(out)), 'loader.js'));
  console.log(
    `Built ${out} (${Math.round(Buffer.byteLength(result.html) / 1024)} KiB; ${project.variants.length} cases)`,
  );
  if (command === 'preview') {
    // The page is served from disk with its header recipe, so a rebuild shows on reload.
    const { url } = await serve(dirname(out), Number(flags.port), basename(out));
    console.log(
      `Preview ${url}/ (Ctrl-C to stop; ${flags.watch ? 'rebuilds on save' : 'rerun after edits, or pass --watch'})`,
    );
    if (flags.watch) {
      // Rebuild when anything beside the scene changes; keep serving the last good build on error.
      const { watch } = await import('node:fs');
      let timer: ReturnType<typeof setTimeout> | undefined,
        running = Promise.resolve();
      watch(dirname(project.file), { recursive: true }, (_, name) => {
        // Source edits only: the rebuild's own outputs (page, sheet, snapshots) must not retrigger it.
        if (!name || !/\.(ts|mts|js|mjs)$/.test(name) || /\.snapshots(\/|\.json$)/.test(name)) return;
        if (resolve(dirname(project.file), name) === resolve(out)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          running = running.then(async () => {
            try {
              const next = await collectProject(input!, collection);
              await buildExplainer(next, out);
              console.log(`Rebuilt ${slug}: ${next.variants.length} cases`);
            } catch (error) {
              console.error(`rayner: ${(error as Error).message} (still serving the last good build)`);
            }
          });
        }, 200);
      });
    }
  }
}
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
)
  main().catch((error) => {
    // Diagnose an incomplete authoring install with the pinned dependency versions.
    const missing = error.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package '([^']+)'/.exec(error.message)?.[1];
    const group = missing && [CAPTURE, RASTER].find((g) => g.includes(missing));
    console.error(
      missing
        ? `rayner: this command needs ${missing}${group ? `. Install: ${install(group)}` : ''}`
        : `rayner: ${error.message}`,
    );
    process.exitCode = 1;
  });

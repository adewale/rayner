#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync, existsSync, watch } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from './lib/explain-serve.ts';
import { collectProject, defaultScenario, sceneSlug } from './lib/explain-project.ts';
import { buildExplainer, buildLoader } from './lib/explain-build.ts';
import { BLANK_FILES, MACHINE_STARTER, MACHINE_STARTER_FILES, STARTER, STARTER_FILES, blankStarter, packageImports } from './lib/explain-init.ts';
import { DIAGRAM_PACKAGES, installCommand, missingPackage } from './lib/addons.ts';
import { invocation } from './lib/explain-cli.ts';

// Authoring packages, grouped for installation error messages: the diagram add-on's optional peers,
// then the browser and PNG dependencies the package installs itself.
const GROUPS: readonly (readonly string[])[] = [DIAGRAM_PACKAGES, ['playwright-core'], ['@resvg/resvg-js']];
export async function main(args = process.argv.slice(2)): Promise<void> {
  const request = invocation(args);
  if (request.command === 'help') {
    console.log(request.text);
    return;
  }
  if (request.command === 'version') {
    const { manifest } = await import('./lib/roots.ts');
    console.log(manifest.version);
    return;
  }
  const { command, input, step, flags } = request;
  if (command === 'init') {
    const dir = resolve(input);
    const blank = flags.blank ? blankStarter(flags.question) : undefined;
    await mkdir(dirname(dir), { recursive: true });
    await mkdir(dir, { recursive: false });
    if (blank) {
      for (const file of BLANK_FILES) await writeFile(join(dir, file), blank[file]);
      console.log(`Created ${join(dir, 'script.md')}, model.ts, model.test.ts and scene.ts beside it: an explainer to write, each part still to write marked TODO:. rayner check ${join(dir, 'scene.ts')} lists them in order: the script's intent header, its Checked against and Grounding lines, the model's oracle test, then the picture`);
      return;
    }
    const [from, files] = flags.machine ? [MACHINE_STARTER, MACHINE_STARTER_FILES] : [STARTER, STARTER_FILES];
    for (const file of files)
      await writeFile(join(dir, file), packageImports(await readFile(join(from, file), 'utf8')));
    console.log(flags.machine
      ? `Created ${join(dir, 'script.md')}, the intent to write first, and ${join(dir, 'scene.ts')}, a machine explainer: its picture in picture.ts, its model in model.ts (next refuses with a reason), the model's test in model.test.ts, and the review's subjects in scene.review.json`
      : `Created ${join(dir, 'script.md')}, the intent to write first, and ${join(dir, 'scene.ts')}, with its model in model.ts and the model's test in model.test.ts`);
    return;
  }
  const preparing = command === 'snapshots' || command === 'preview';
  const collection = { refresh: flags.refresh, write: preparing, capture: preparing, captureLettering: preparing };
  const project = await collectProject(input, collection);
  const slug = sceneSlug(project);
  if (command === 'review') {
    const { reviewScene } = await import('./lib/explain-review-scene.ts');
    const artifact = flags.out?.endsWith('.html') ? resolve(flags.out) : undefined;
    const directory = artifact ? resolve('out/review', slug) : flags.out ?? resolve('out/review', slug);
    console.log(JSON.stringify(await reviewScene(project, directory, flags.subjects, artifact, (line) => console.error(line)), null, 2));
    return;
  }
  if (command === 'snapshots') {
    console.log(
      JSON.stringify(
        {
          scene: slug,
          scenarios: project.scenarios.length,
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
    const { describeExplainer } = await import('../explain/testing.ts');
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
  /** The scenario every --scenario id=value chooses, other settings at their defaults. */
  function selectedScenario() {
    const values: Record<string, string> = Object.create(null);
    for (const assignment of flags.scenario ?? []) {
      const at = assignment.indexOf('=');
      values[assignment.slice(0, at)] = assignment.slice(at + 1);
    }
    return defaultScenario(project, values);
  }
  if (command === 'see') {
    const { see } = await import('./lib/explain-see.ts');
    console.log(await see(project, selectedScenario(), step, flags.out));
    return;
  }
  if (command === 'contact-sheet') {
    const { contactSheet } = await import('./lib/explain-shots.ts');
    console.log(
      await contactSheet(project, flags.out ?? resolve('out/contact-sheets', slug + '.png'), selectedScenario()),
    );
    return;
  }
  const out = flags.out ?? resolve('out/explainers', slug + '.html');
  const result = await buildExplainer(project, out);
  await buildLoader(join(dirname(resolve(out)), 'loader.js'));
  console.log(
    `Built ${out} (${Math.round(Buffer.byteLength(result.html) / 1024)} KiB; ${project.scenarios.length} scenarios)`,
  );
  if (command === 'preview') {
    // The page is served from disk with its header recipe, so a rebuild shows on reload.
    const { url } = await serve(dirname(out), Number(flags.port ?? '5174'), basename(out));
    console.log(
      `Preview ${url}/ (Ctrl-C to stop; ${flags.watch ? 'rebuilds on save' : 'rerun after edits, or pass --watch'})`,
    );
    if (flags.watch)
      watchAndRebuild(dirname(project.file), out, async () => {
        const next = await collectProject(input, collection);
        await buildExplainer(next, out);
        return `Rebuilt ${slug}: ${next.scenarios.length} scenarios`;
      });
  }
}
/**
 * `preview --watch`: rebuild the page when a source file beside the scene or its script.md changes,
 * and keep serving the last good build on error. One rebuild runs at a time; saves made while it
 * runs mark it dirty, and it runs once more when it ends, however many saves there were.
 */
export function watchAndRebuild(folder: string, out: string, rebuild: () => Promise<string>) {
  let rebuilding: 'idle' | 'building' | 'dirty' = 'idle',
    loop: Promise<void> = Promise.resolve(),
    timer: ReturnType<typeof setTimeout> | undefined;
  /** Start a rebuild, or mark the one running dirty; resolves when the page is current. */
  const run = (): Promise<void> => {
    if (rebuilding !== 'idle') {
      rebuilding = 'dirty';
      return loop;
    }
    loop = (async () => {
      do {
        rebuilding = 'building';
        try {
          console.log(await rebuild());
        } catch (error) {
          console.error(`rayner: ${(error as Error).message} (still serving the last good build)`);
        }
      } while ((rebuilding as string) === 'dirty');
      rebuilding = 'idle';
    })();
    return loop;
  };
  const watcher = watch(folder, { recursive: true }, (_, name) => {
    // Sources and the script only: the rebuild's own outputs (page, sheet, snapshots) must not retrigger it.
    if (!name || !(/\.(ts|mts|js|mjs)$/.test(name) || basename(name) === 'script.md') || /\.snapshots(\/|\.json$)/.test(name)) return;
    if (resolve(folder, name) === resolve(out)) return;
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });
  return { watcher, run };
}
/** Run the command line, reporting a failure on stderr with exit code 1 (the installed command, dist/tools/explain.js, runs it too). */
export const run = (): Promise<void> =>
  main().catch((error) => {
    // Diagnose an incomplete authoring install with the pinned dependency versions.
    const missing = missingPackage(error);
    const group = missing && GROUPS.find((g) => g.includes(missing));
    console.error(
      missing
        ? `rayner: this command needs ${missing}${group ? `. Install: ${installCommand(group)}` : ''}`
        : `rayner: ${error.message}`,
    );
    process.exitCode = 1;
  });
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
)
  void run();

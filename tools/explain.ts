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
/** Command-owned output. Runtime warnings and third-party diagnostics are separate from these writers. */
interface CommandIO {
  stdout(text: string): void;
  stderr(text: string): void;
}
export async function main(args: string[], io: CommandIO): Promise<void> {
  const print = (text: string) => io.stdout(text + '\n');
  const warn = (text: string) => io.stderr(text + '\n');
  const request = invocation(args);
  if (request.command === 'help') {
    print(request.text);
    return;
  }
  if (request.command === 'version') {
    const { manifest } = await import('./lib/roots.ts');
    print(manifest.version);
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
      print(`Created ${join(dir, 'script.md')}, model.ts, model.test.ts and scene.ts beside it: an explainer to write, each part still to write marked TODO:. rayner check ${join(dir, 'scene.ts')} lists them in order: the script's intent header, its Checked against and Grounding lines, the model's oracle test, then the picture`);
      return;
    }
    const [from, files] = flags.machine ? [MACHINE_STARTER, MACHINE_STARTER_FILES] : [STARTER, STARTER_FILES];
    for (const file of files)
      await writeFile(join(dir, file), packageImports(await readFile(join(from, file), 'utf8')));
    print(flags.machine
      ? `Created ${join(dir, 'script.md')}, the intent to write first, and ${join(dir, 'scene.ts')}, a machine explainer: its picture in picture.ts, its model in model.ts (next refuses with a reason), the model's test in model.test.ts, and the review's subjects in scene.review.json`
      : `Created ${join(dir, 'script.md')}, the intent to write first, and ${join(dir, 'scene.ts')}, with its model in model.ts and the model's test in model.test.ts`);
    return;
  }
  const preparing = command === 'snapshots' || command === 'preview';
  const collection = { refresh: flags.refresh, write: preparing, capture: preparing, captureLettering: preparing };
  const project = await collectProject(input, collection);
  const slug = sceneSlug(project);
  const parent = dirname(dirname(project.file));
  if (basename(parent) === 'explainers') {
    const catalog = await readFile(join(parent, 'catalog.ts'), 'utf8').catch(() => null);
    if (catalog && ![...catalog.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].some(m => m[1] === slug))
      warn(`Catalog warning: ${project.file} is under scenes/explainers but ${slug} is absent from catalog.ts. Add its entry, fidelity evidence, answer checks and generated reference, then run the complete catalog checks and review.`);
  }
  if (command === 'film') {
    const {filmProject} = await import('./lib/explain-film.ts');
    const directory = flags.out ?? resolve('out/films', slug);
    const report = await filmProject(project, directory);
    print(`Filmed ${report.films.length} sequences, ${report.frames} frames. Open ${resolve(directory, 'index.html')}`);
    return;
  }
  if (command === 'review') {
    const { reviewScene } = await import('./lib/explain-review-scene.ts');
    const artifact = flags.out?.endsWith('.html') ? resolve(flags.out) : undefined;
    const directory = artifact ? resolve('out/review', slug) : flags.out ?? resolve('out/review', slug);
    const report = await reviewScene(project, directory, flags.subjects, artifact, (line) => warn(line));
    if (flags.json) print(JSON.stringify(report, null, 2));
    const phone = report.results.flatMap(s => [...s.steps, ...s.framedSteps]).filter(s => s.width === 390);
    const maximumViews = Math.max(0, ...phone.map(s => s.views));
    const maximumOverlap = Math.max(0, ...phone.map(s => s.maximumTourOverlap));
    const minima = phone.flatMap(s => s.minimumLabelPxWholeStage === null ? [] : [s.minimumLabelPxWholeStage]);
    const smallest = minima.length ? Math.min(...minima).toFixed(1) + ' px' : 'no labels';
    const clipped = phone.reduce((n, s) => n + s.partiallyVisibleLabels.reduce((m, v) => m + v.labels.length, 0), 0);
    const omitted=phone.reduce((n,s)=>n+s.omittedContextLabels.reduce((m,v)=>m+v.labels.length,0),0);
    warn(`Phone: whole-picture minimum ${smallest}; ${clipped} partly visible labels; ${omitted} context-label omissions across views; up to ${maximumViews} views per step; greatest tour-view overlap ${Math.round(maximumOverlap * 100)}%. Screenshots: ${resolve(directory)}`);
    (flags.json ? (text: string) => io.stderr(text + '\n') : print)(`Review passed: ${report.scenarios} scenarios, ${report.stepWidths} step/width checks, ${report.liveStateWidths} live-state/width checks, ${report.framedStepWidths} framed phone steps and ${report.framedLiveStateWidths} framed live states. Report: ${resolve(directory, 'review.json')}`);
    return;
  }
  if (command === 'snapshots') {
    print(
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
    else io.stdout(json);
    return;
  }
  if (command === 'check') {
    const { checkProject } = await import('./lib/explain-check.ts');
    const directory = flags.out ?? resolve('out/checks', slug);
    const report = await checkProject(project, directory);
    if (flags.json) print(JSON.stringify(report, null, 2));
    const scenarios = report.scenarios as {steps: number; machines?: {states: number; sampled?: boolean; phoneWarnings?: string[]}[]; legibility: {minLabelPx1280: number | null; minLabelPx390: number | null; minLabelPx390WholeStage: number | null}}[];
    const warnings = scenarios.flatMap(s => (s.machines ?? []).flatMap(m => m.phoneWarnings ?? []));
    for (const warning of [...new Set(warnings)].slice(0, 5)) warn(`Phone warning: ${warning}`);
    const min = (key: keyof typeof scenarios[number]['legibility']) => {
      const sizes = scenarios.flatMap(s => typeof s.legibility[key] === 'number' ? [s.legibility[key]!] : []);
      return sizes.length ? Math.min(...sizes).toFixed(1) + ' px' : 'no labels';
    };
    const {stepLayouts, closeUps, narrowAspect} = await import('../app/embed-closeup.ts');
    let views = 1;
    for (const scenario of project.scenarios) {
      const layouts = await stepLayouts(scenario.Scene), height = 358 * narrowAspect(layouts.values(), 358);
      for (const layout of layouts.values()) views = Math.max(views, closeUps(layout, 358, height).length);
    }
    // A sum over explorations: each scenario's machines, once per step offering controls.
    const states = scenarios.reduce((n, s) => n + (s.machines ?? []).reduce((m, machine) => m + machine.states, 0), 0);
    const explorations = scenarios.reduce((n, s) => n + (s.machines ?? []).length, 0);
    const sampled = scenarios.some(s => s.machines?.some(machine => machine.sampled));
    const tests = (report.model as {passed?: number} | undefined)?.passed ?? 0;
    (flags.json ? (text: string) => io.stderr(text + '\n') : print)(`Check passed: ${scenarios.length} scenarios, ${scenarios.reduce((n,s) => n + s.steps,0)} steps, ${states} checked states${explorations > 1 ? ` over ${explorations} machine explorations` : ''}${sampled ? ' (bounded sample)' : ''}, ${tests} model tests, 0 problems, ${warnings.length} phone warnings. Labels: ${min('minLabelPx1280')} at 1280; phone ${min('minLabelPx390')} in close-ups, ${min('minLabelPx390WholeStage')} whole; up to ${views} views per step. Report: ${resolve(directory, 'report.json')}`);
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
    print(await see(project, selectedScenario(), step, flags.out));
    return;
  }
  if (command === 'contact-sheet') {
    const { contactSheet } = await import('./lib/explain-shots.ts');
    print(
      await contactSheet(project, flags.out ?? resolve('out/contact-sheets', slug + '.png'), selectedScenario()),
    );
    return;
  }
  const out = flags.out ?? resolve('out/explainers', slug + '.html');
  const result = await buildExplainer(project, out);
  await buildLoader(join(dirname(resolve(out)), 'loader.js'));
  if (flags['embed-sizes']) {
    const {measureEmbed} = await import('./lib/explain-embed-size.ts');
    const {launch} = await import('./lib/browser.ts');
    const server = await serve(dirname(resolve(out)), 0, basename(out));
    let browser: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      browser = await launch('rayner build --embed-sizes');
      await writeFile(resolve(out).replace(/\.html$/, '') + '.embed.json', JSON.stringify(await measureEmbed(browser, server.url, basename(out)), null, 2) + '\n');
    } finally { await browser?.close(); server.close(); }
  }
  print(
    `Built ${out} (${Math.round(Buffer.byteLength(result.html) / 1024)} KiB; ${project.scenarios.length} scenarios)`,
  );
  if (command === 'preview') {
    // The page is served from disk with its header recipe, so a rebuild shows on reload.
    const { url } = await serve(dirname(out), Number(flags.port ?? '5174'), basename(out));
  print(
      `Preview ${url}/ (Ctrl-C to stop; ${flags.watch ? 'rebuilds on save' : 'rerun after edits, or pass --watch'})`,
    );
    if (flags.watch)
      watchAndRebuild(dirname(project.file), out, async () => {
        const next = await collectProject(input, collection);
        await buildExplainer(next, out);
        return `Rebuilt ${slug}: ${next.scenarios.length} scenarios`;
      }, io);
  }
}
/**
 * `preview --watch`: rebuild the page when a source file beside the scene or its script.md changes,
 * and keep serving the last good build on error. One rebuild runs at a time; saves made while it
 * runs mark it dirty, and it runs once more when it ends, however many saves there were.
 */
export function watchAndRebuild(folder: string, out: string, rebuild: () => Promise<string>, io: CommandIO) {
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
          io.stdout(await rebuild() + '\n');
        } catch (error) {
          io.stderr(`rayner: ${(error as Error).message} (still serving the last good build)\n`);
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
/** Run one invocation, returning its status without changing the host process. */
export async function run(args: string[], io: CommandIO): Promise<0 | 1> {
  try {
    await main(args, io);
    return 0;
  } catch (error) {
    // Diagnose an incomplete authoring install with the pinned dependency versions.
    const missing = missingPackage(error);
    const group = missing && GROUPS.find((g) => g.includes(missing));
    const message = missing
      ? `rayner: this command needs ${missing}${group ? `. Install: ${installCommand(group)}` : ''}`
      : `rayner: ${error instanceof Error ? error.message : String(error)}`;
    io.stderr(message + '\n');
    return 1;
  }
}
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
)
  void run(process.argv.slice(2), {
    stdout: text => { process.stdout.write(text); },
    stderr: text => { process.stderr.write(text); },
  }).then(status => { process.exitCode = status; });

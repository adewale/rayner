import { mkdir, mkdtemp, writeFile, readFile, rename, rm, rmdir, readdir } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { toSvgString } from '../../src/index.ts';
import type { Scene, Sink } from '../../src/index.ts';
import { logStart, runLive, withoutHeading, htmlEscape } from '../../explain/internal.ts';
import { rasterize } from './explain-raster.ts';
import { useProjectLettering } from './explain-lettering.ts';
import type { Project } from './explain-project.ts';
import { pictureInventory, picturePath } from './explain-picture-inventory.ts';

interface FilmFrame { time: number; step: string | null; svg: string; png: string }
interface Film { name: string; settings: Record<string, string>; event?: string; path?: string[]; outcome?: unknown; frames: FilmFrame[] }
interface FilmExploration { scenario: number; step: string; from: 'rest' | 'start'; states: number; presentations: number; presses: number; complete: boolean }

/** Actual stage frames, sampled at 200 ms, plus each transition's first and final frames. */
function filmSink(directory: string, prefix: string, generation = '') {
  const frames: FilmFrame[] = [];
  let next = -Infinity, lastStep: string | null = null, last = '';
  const capture = async (scene: Scene, force = false) => {
    const step = scene.currentStep?.path ?? null;
    if (!force && scene.time + 1e-8 < next && step === lastStep) return;
    const svg = withoutHeading(scene, () => toSvgString(scene, {width: 1180, cull: true}));
    if (svg === last && !force) return;
    last = svg; lastStep = step; next = scene.time + 0.2;
    const name = `${prefix}-${String(frames.length).padStart(5, '0')}`;
    await writeFile(join(directory, `${name}.svg`), svg);
    await writeFile(join(directory, `${name}.png`), (await rasterize(svg)).asPng());
    frames.push({time: Math.round(scene.time * 1000) / 1000, step, svg: `${generation}${name}.svg`, png: `${generation}${name}.png`});
  };
  const sink: Sink = {
    async frame(scene) { await capture(scene); },
    async stepEnd(scene) { await capture(scene, true); },
  };
  return {sink, frames, capture};
}

/** Film every authored scenario and every accepted/refused event from bounded reachable states.
 * Direct model events avoid UI scrolling and comma-delimited event-label parsing. */
export async function filmProject(project: Project, directory: string): Promise<{films: Film[]; frames: number; explorations: FilmExploration[]}> {
  await useProjectLettering(project);
  const framesDirectory = join(directory, 'frames');
  await mkdir(framesDirectory, {recursive: true});
  const output = await mkdtemp(join(framesDirectory, 'run-'));
  const generation = basename(output) + '/';
  const films: Film[] = [];
  const explorations: FilmExploration[] = [];
  let published = false;
  try {
  for (const [index, scenario] of project.scenarios.entries()) {
    const story = filmSink(output, `scenario-${index}`, generation);
    const scene = await new scenario.Scene(story.sink).run();
    await story.capture(scene, true);
    films.push({name: `Scenario ${index + 1}: authored steps`, settings: scenario.values, frames: story.frames});
    for (const [step, place] of scenario.live ?? []) {
      const resting = await runLive(scenario.Scene, step, place, []);
      const machine = resting.machine, base = logStart(machine, resting.rest);
      if (!base) continue;
      const shown = {...resting.shown};
      if (base.from === 'start' && machine.spec.result) delete shown.result;
      const inventory = pictureInventory(machine, [{state: base.state, shown}]);
      explorations.push({scenario: index, step, from: base.from, states: inventory.states, presentations: inventory.origins.length,
        presses: inventory.edges.length, complete: inventory.complete});
      for (const [edgeIndex, edge] of inventory.edges.entries()) {
        const {event, outcome} = edge, path = picturePath(edge.from);
        const strip = filmSink(output, `scenario-${index}-live-${films.length}-${edgeIndex}`, generation);
        const accepted = 'next' in outcome;
        const log = accepted ? [...path, event] : path;
        const run = await runLive(scenario.Scene, step, place, log, accepted ? {from: base.from, animate: strip.sink} : {from: base.from, sink: strip.sink});
        await strip.capture(run.scene, true);
        films.push({name: `${step}: ${machine.spec.labels?.[event] ?? event}`, settings: scenario.values, event, path,
          outcome, frames: strip.frames});
      }
    }
  }
  const report = {version: 2, generation: basename(output), intervalMs: 200, sourceHash: project.sourceHash, explorations, films};
  await writeFile(join(output, 'film.json.pending'), JSON.stringify(report, null, 2) + '\n');
  const rows = films.map(f => `<section><h2>${htmlEscape(f.name)}</h2><p>${htmlEscape(JSON.stringify({settings:f.settings,path:f.path,outcome:f.outcome}))}</p><div>${f.frames.map(frame => `<figure><a href="frames/${frame.svg}"><img loading="lazy" src="frames/${frame.png}" width="358" alt="${htmlEscape(frame.step ?? f.name)} at ${frame.time} seconds"></a><figcaption>${frame.time}s</figcaption></figure>`).join('')}</div></section>`).join('');
  await writeFile(join(output, 'index.html.pending'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rayner film</title><style>body{font:16px system-ui;margin:24px}section>div{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}img{max-width:100%;height:auto;border:1px solid #888}p{overflow-wrap:anywhere}</style><h1>Motion filmstrips</h1><p>Actual stage frames at 200 ms, including refused events. SVG links retain full resolution. Reachability follows each machine's declared bound and limit.</p>${rows}`);
  // Serialize only publication. A concurrent producer may finish its private generation, but
  // must retry if another publisher holds this lock; no invocation removes another's work.
  const lock = join(directory, '.film-publish.lock');
  await mkdir(lock);
  try {
    const previous = await readFile(join(directory, 'film.json'), 'utf8').catch(() => undefined);
    const oldIndex = await readFile(join(directory, 'index.html')).catch(() => undefined);
    let indexPublished = false;
    try {
      await rename(join(output, 'index.html.pending'), join(directory, 'index.html'));
      indexPublished = true;
      // The manifest is the commit point: every file it references already exists.
      await rename(join(output, 'film.json.pending'), join(directory, 'film.json'));
      published = true;
    } catch (error) {
      if (indexPublished) {
        if (oldIndex) {
          await writeFile(join(output, 'index.html.rollback'), oldIndex);
          await rename(join(output, 'index.html.rollback'), join(directory, 'index.html'));
        } else await rm(join(directory, 'index.html'), {force: true});
      }
      throw error;
    }
    // Retire only files named by our last successful manifest, never the caller's frames tree.
    if (previous) {
      try {
        const old = JSON.parse(previous) as {version?: number; films?: Film[]};
        if ((old.version === 1 || old.version === 2) && Array.isArray(old.films)) {
          const directories = new Set<string>();
          for (const film of old.films) for (const frame of film.frames ?? []) for (const name of [frame.svg, frame.png]) {
            if (typeof name !== 'string' || !/^(?:run-[A-Za-z0-9]+\/)?[A-Za-z0-9-]+\.(?:svg|png)$/.test(name)) continue;
            const path = resolve(framesDirectory, name);
            if (!path.startsWith(resolve(framesDirectory) + sep) || path.startsWith(resolve(output) + sep)) continue;
            await rm(path, {force: true});
            if (name.includes('/')) directories.add(join(framesDirectory, name.split('/')[0]!));
          }
          for (const dir of directories) await rmdir(dir).catch(() => {});
        }
      } catch { /* A foreign or damaged prior manifest grants no deletion authority. */ }
    }
  } finally { await rmdir(lock); }
  return {films, explorations, frames: films.reduce((n, f) => n + f.frames.length, 0)};
  } finally { if (!published) await rm(output, {recursive: true, force: true}); }
}

/** Two actual mid-play stage samples per step, before the caption-reading hold. */
export async function midplayFrames(scenario: Project['scenarios'][number], directory: string): Promise<void> {
  for(const file of await readdir(directory)) if(/\.mid[12]\.(?:svg|png)$/.test(file)) await rm(join(directory,file));
  const samples = new Map<number, string[]>();
  for (const step of scenario.trace.steps) for (const [index, fraction] of [1 / 3, 2 / 3].entries()) {
    const end = step.holdFrame ?? step.frame1;
    const frame = step.frame0 + Math.max(1, Math.round((end - step.frame0) * fraction));
    samples.set(frame, [...samples.get(frame) ?? [], `${encodeURIComponent(step.step)}.mid${index + 1}`]);
  }
  await new scenario.Scene({async frame(scene) {
    const names = samples.get(scene.frameCount);
    if (!names) return;
    const svg = withoutHeading(scene, () => toSvgString(scene, {width: 1180, cull: true}));
    const png = (await rasterize(svg)).asPng();
    for (const name of names) {
      await writeFile(join(directory, name + '.svg'), svg);
      await writeFile(join(directory, name + '.png'), png);
    }
  }}).run();
}

/** All retained phone stops plus the two native motion samples, as a browsable contact sheet. */
export async function reviewContactSheet(directory: string): Promise<void> {
  const files = (await readdir(directory)).filter(f => /\.(?:390(?:\.view\d+|\.whole)?|mid[12])\.png$/.test(f)).sort();
  await writeFile(join(directory, 'phone-views.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Phone views and motion</title><style>body{font:16px system-ui;margin:24px}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:358px}img{max-width:100%;height:auto;border:1px solid #888}figcaption{overflow-wrap:anywhere}</style><h1>Phone views and motion</h1><p>390 px images are actual served-reader screenshots, including every tour stop and Whole picture. Mid-play images are native stage samples before the caption hold; they do not test browser chrome or CSS. Framed screenshots have their own contact sheet in framed/.</p><main>${files.map(f => `<figure><a href="${encodeURIComponent(f)}"><img loading="lazy" src="${encodeURIComponent(f)}" alt="${htmlEscape(decodeURIComponent(f))}"></a><figcaption>${htmlEscape(decodeURIComponent(f))}</figcaption></figure>`).join('')}</main>`);
}

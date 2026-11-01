#!/usr/bin/env node
// Copy the built collection into a static site, with the response headers it needs.
//   npm run demos:build && npm run site:export -- <site-root> [--path /projects/rayner] [--origin https://example.org]
// Writes <site-root><path>/{<id>.html, <id>.png, loader.js}, each step's resting
// picture as <id>/<step>.png, and the `_headers` block for those files to out/site-headers.txt (each
// page's CSP pins its own inline script and style). With --origin (https), also a share page per
// step, <id>/<step>.html, whose link preview is that step, and the same Open Graph and Twitter card
// tags in each explainer page, for its cover step (tools/lib/explain-share.ts); then checks them.
// Each explainer's describeExplainer JSON, as demos:build wrote it, is copied to <id>.json, with an
// llms.txt at the site root (tools/lib/explain-site-describe.ts). Each page's known framed heights go
// beside it as <id>.embed.json; with --origin, also an oEmbed response, <id>.oembed.json, named by a
// discovery link in the page. Fails, before writing anything, if
// demos:build has not run since a scene, its folder or the engine changed.
import { copyFile, mkdir, readFile, writeFile, access, mkdtemp, rename, rm, readdir } from 'node:fs/promises';
import { sharePage, publishedPage, checkCards, writeEmbedFiles } from './lib/explain-share.ts';
import type { ShareManifest } from './lib/explain-share.ts';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { ROOT, collectProject, defaultVariant } from './lib/explain-project.ts';
import { writeDescriptions, checkBuilt } from './lib/explain-site-describe.ts';
import { replaceHeaderBlocks } from './lib/site-headers.ts';
import { buildInputs } from './lib/build-inputs.ts';
import { checkBuiltOutput } from './lib/explain-built-files.ts';
import { selectExport } from './lib/explain-export-selection.ts';
import type { ExportCatalog, ExportEvidence } from './lib/explain-export-selection.ts';
import { cardPng } from './lib/explain-shots.ts';
import { useProjectLettering } from './lib/explain-lettering.ts';
import { galleryPage } from './lib/explain-gallery.ts';
import { restingTime } from '../explain/trace.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    path: { type: 'string', default: '/projects/rayner' },
    origin: { type: 'string' },
    only: { type: 'string' },
    entry: { type: 'string' },
  },
});
const root = positionals[0];
if (!root)
  throw new Error(
    'usage: npm run site:export -- <site-root> [--path /projects/rayner] [--origin https://example.org] [--only id,id] [--entry id]',
  );
const origin = values.origin;
// Link previews need absolute https URLs: crawlers fetch the pictures from the public site.
if (origin && !/^https:\/\/[^/]+\/?$/.test(origin))
  throw new Error(`--origin must be an https site origin like https://example.org, not ${origin}`);
const path = values.path.replace(/\/$/, '');
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(path))
  throw new Error('--path must be an absolute URL path without dot segments');
const destination = resolve(root);
const built = join(ROOT, 'out/explainers');
const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );
const selected = selectExport(
  values.only,
  JSON.parse(await readFile(join(built, 'catalog.json'), 'utf8')) as ExportCatalog,
  JSON.parse(await readFile(join(built, 'evidence.json'), 'utf8')) as ExportEvidence,
  values.entry,
);
const items = EXPLAINERS.filter((item) => selected.ids.includes(item.id));
if (items.length !== selected.ids.length || items.some((item, i) => item.id !== selected.ids[i]))
  throw new Error('Built catalog and checkout explainers mismatch');

// Refuse an explainer whose scene, scene folder or engine changed since demos:build built it;
// check them all before copying any.
for (const { id } of EXPLAINERS) await checkBuilt(join(built, id), join(ROOT, 'scenes/explainers', id));
await checkBuiltOutput(
  built,
  EXPLAINERS.map((e) => e.id),
);

// Validate an isolated copy before changing any of the host's files.
await mkdir(dirname(destination), { recursive: true });
const staging = await mkdtemp(join(dirname(destination), '.rayner-export-'));
const target = join(staging, path);
try {
  // Stage only the new catalog; copying the old tree would keep removed lessons public.
  if (await exists(join(destination, 'llms.txt')))
    await copyFile(join(destination, 'llms.txt'), join(staging, 'llms.txt'));
  await mkdir(target, { recursive: true });
  const blocks: string[] = [];
  let shared = 0;
  for (const { id } of items) {
    const page = join(built, id + '.html');
    if (!(await exists(page))) throw new Error(`Missing ${page}: run npm run demos:build first`);
    const share = JSON.parse(await readFile(join(built, id, 'steps.json'), 'utf8')) as ShareManifest;
    // With an origin, the page carries the same preview tags as its share pages, for its cover step.
    if (origin)
      await writeFile(
        join(target, id + '.html'),
        publishedPage(await readFile(page, 'utf8'), share, origin, path),
      );
    else await copyFile(page, join(target, id + '.html'));
    await copyFile(join(built, id + '.png'), join(target, id + '.png'));
    await writeEmbedFiles(target, built, share, origin, path);
    await mkdir(join(target, id), { recursive: true });
    const project = await collectProject(join(ROOT, 'scenes/explainers', id), { write: false });
    const variant = defaultVariant(project);
    await useProjectLettering(project);
    for (const s of share.steps) {
      const step = variant.trace.steps.find((step) => step.step === s.step);
      if (!step || step.meta.detail) throw new Error(`Invalid public step: ${id}/${s.step}`);
      await writeFile(
        join(target, id, s.step + '.png'),
        await cardPng(variant.Scene, restingTime(step, variant.trace.fps)),
      );
      if (origin) await writeFile(join(target, id, s.step + '.html'), sharePage(share, s, origin, path));
      shared++;
    }
    const headers = JSON.parse(await readFile(join(built, id + '.html.headers.json'), 'utf8')) as Record<
      string,
      string
    >;
    const lines = Object.entries(headers)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    // The host serves /x.html at /x, so the rule covers both spellings.
    blocks.push(`${path}/${id}\n${lines}\n\n${path}/${id}.html\n${lines}`);
  }
  await copyFile(join(built, 'loader.js'), join(target, 'loader.js'));
  if (values.only === undefined)
    await copyFile(join(built, 'embed-lab.html'), join(target, 'embed-lab.html'));
  const css = await readFile(join(ROOT, 'app/embed.css'), 'utf8');
  await writeFile(
    join(target, 'index.html'),
    galleryPage(selected.catalog, css.slice(0, css.indexOf('\nbody{')), values.only === undefined),
  );
  await writeFile(join(target, 'evidence.json'), JSON.stringify(selected.evidence, null, 2) + '\n');
  await writeFile(join(target, 'catalog.json'), JSON.stringify(selected.catalog, null, 2) + '\n');
  // For agents: each explainer's describeExplainer object as <id>.json beside its page, and llms.txt at the site root.
  const described = await writeDescriptions(staging, path, items, built, origin);
  console.log(
    `Wrote ${items.length} <id>.json files (${described.json} bytes) and ${join(resolve(root), 'llms.txt')} (${described.llms} bytes).`,
  );
  if (origin) {
    const { pages, problems } = await checkCards(staging, origin, path, selected.ids);
    if (problems.length) throw new Error(`Link preview tags are wrong:\n${problems.join('\n')}`);
    console.log(
      `${pages} pages carry every Open Graph and Twitter card tag, with their pictures at the declared size`,
    );
  }
  const headers = `# Rayner explainers: generated by \`npm run site:export\`; regenerate rather than edit.\n${blocks.join('\n\n')}\n`;
  const headersFile = join(ROOT, 'out/site-headers.txt');
  const manifestFiles = [];
  for (const entry of await readdir(target, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'deployment.json') continue;
    const file = join(entry.parentPath, entry.name);
    const name = file.slice(staging.length).replaceAll('\\', '/');
    manifestFiles.push({
      path: name,
      sha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    });
  }
  const hostHeaders = await readFile(join(destination, '_headers'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const ownedPaths = items.flatMap(({ id }) => [`${path}/${id}`, `${path}/${id}.html`]);
  const publishedHeaders = replaceHeaderBlocks(hostHeaders, headers, ownedPaths);
  await writeFile(join(staging, '_headers'), publishedHeaders);
  manifestFiles.push({
    path: '/_headers',
    sha256: createHash('sha256').update(publishedHeaders).digest('hex'),
  });
  await writeFile(
    join(target, 'deployment.json'),
    JSON.stringify(
      {
        version: 1,
        build: await buildInputs(ROOT),
        files: manifestFiles.sort((a, b) => a.path.localeCompare(b.path)),
      },
      null,
      2,
    ) + '\n',
  );

  // Replace the dedicated subtree, then its host-level sidecars. Roll back on an I/O failure.
  await mkdir(dirname(join(destination, path)), { recursive: true });
  const backup = join(staging, '.previous');
  const hadTarget = await exists(join(destination, path));
  const previousLlms = await readFile(join(destination, 'llms.txt')).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  const hadHeaders = await exists(join(destination, '_headers'));
  if (hadTarget) await rename(join(destination, path), backup);
  try {
    await rename(target, join(destination, path));
    await copyFile(join(staging, 'llms.txt'), join(destination, 'llms.txt'));
    await copyFile(join(staging, '_headers'), join(destination, '_headers'));
  } catch (error) {
    await rm(join(destination, path), { recursive: true, force: true });
    if (hadTarget) await rename(backup, join(destination, path));
    if (previousLlms) await writeFile(join(destination, 'llms.txt'), previousLlms);
    else await rm(join(destination, 'llms.txt'), { force: true });
    if (hadHeaders) await writeFile(join(destination, '_headers'), hostHeaders);
    else await rm(join(destination, '_headers'), { force: true });
    throw error;
  }
  await writeFile(headersFile, headers);
  console.log(
    `Exported ${items.length} explainers and ${shared} step pictures to ${join(destination, path)}` +
      (origin ? `, with a share page for each step` : '; pass --origin to add a share page for each step') +
      `\nUpdated ${join(destination, '_headers')} by replacing this collection's URL rules. Header recipe: ${headersFile}.`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}

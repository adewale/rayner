#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EXPLAINERS, PRODUCT, SHOWCASE } from '../scenes/explainers/catalog.ts';
import { collectProject, defaultVariant, ROOT, baseReceipt, sceneInputs } from './lib/explain-project.ts';
import { describeProject, checkBuilt } from './lib/explain-site-describe.ts';
import { restingTime, htmlEscape, pictureSummary, stepWords } from '../explain/trace.ts';
import { buildExplainer, buildLoader } from './lib/explain-build.ts';
import { stillPng } from './lib/explain-shots.ts';
import { checkProject } from './lib/explain-check.ts';
import { shareable } from './lib/explain-share.ts';
import { useProjectLettering } from './lib/explain-lettering.ts';
import { galleryPage } from './lib/explain-gallery.ts';
import { builtOutputHashes } from './lib/explain-built-files.ts';
import type { ShareManifest } from './lib/explain-share.ts';
import { measureEmbed, embedSizeProblems } from './lib/explain-embed-size.ts';
import { serve } from './lib/explain-serve.ts';
import { launch } from './lib/browser.ts';
import { reviewClaims } from './lib/explain-review-scene.ts';
import { narrowOpeningPlan } from './lib/explain-story-review.ts';
import type { NarrowOpeningObligation } from './lib/explain-review-plan.ts';
import { buildInputs } from './lib/build-inputs.ts';
import { selectedIds, selectExport } from './lib/explain-export-selection.ts';

const { values } = parseArgs({ options: {
  check: { type: 'boolean' }, only: { type: 'string' }, entry: { type: 'string' }, out: { type: 'string' },
} });
const requested = selectedIds(values.only, EXPLAINERS.map(item => item.id));
if (values.entry && !requested.includes(values.entry)) throw new Error(`--entry must name a selected explainer: ${values.entry}`);
const items = EXPLAINERS.filter(item => requested.includes(item.id));
const collection = items.length === EXPLAINERS.length;
const check = values.check;
const directory = resolve(values.out ?? join(ROOT, 'out/explainers'));
const inputs = await buildInputs(ROOT);
await mkdir(directory, { recursive: true });
// An interrupted rebuild must not leave an old output pin vouching for changed bytes.
await rm(join(directory, 'output-hashes.json'), { force: true });
// What the gallery and docs point at, with source and snapshot fingerprints.
const evidence: import('./lib/explain-artifacts.ts').EvidenceScene[] = [];
for (const item of items) {
  // Remove the record of what this explainer's files were built from now and write it last (below),
  // so a build that stops part way leaves no record for site:export to trust.
  await rm(join(directory, item.id, 'inputs.json'), { force: true });
  const project = await collectProject(join(ROOT, 'scenes/explainers', item.id));
  // For agents: what site:export publishes as <id>.json, described right after the run, as
  // `rayner describe` does.
  const described = await describeProject(project);
  const { html, receipt } = await buildExplainer(project, join(directory, item.id + '.html'));
  assert.equal(
    'lettering' in receipt,
    !!project.lettering,
    `${item.id}: only a requested page reports lettering`,
  );
  assert.equal(
    'letteringHash' in receipt,
    !!project.outlineLettering,
    `${item.id}: requested outlines have a hash`,
  );
  assert.equal(Buffer.byteLength(html), receipt.bytes, `${item.id}: receipt reports actual page bytes`);
  // The poster uses a representative step of the default case; tile links start at step one.
  const variant = defaultVariant(project),
    step = variant.trace.steps.find((s) => s.step === item.step) ?? variant.trace.steps[0]!;
  await writeFile(
    join(directory, item.id + '.png'),
    await stillPng(variant.Scene, restingTime(step, variant.trace.fps), 960),
  );
  // Export renders cards for selected public teaching steps; collection checks need only metadata.
  await mkdir(join(directory, item.id), { recursive: true });
  const pictured = variant.trace.steps.filter((x) => !x.meta.detail && shareable(x.step));
  const share: ShareManifest = {
    id: item.id,
    title: project.Scene.meta?.title ?? item.id,
    lang: project.Scene.meta?.lang ?? 'en',
    // The explainer's own page previews as its gallery tile's step.
    cover: (pictured.find((x) => x.step === step.step) ?? pictured[0])?.step ?? '',
    steps: [],
  };
  // The pictures draw with the project's lettering, as its page and contact sheet do.
  await useProjectLettering(project);
  for (const s of pictured) {
    share.steps.push({
      step: s.step,
      title: stepWords(s).title,
      caption: stepWords(s).caption,
      picture: pictureSummary(s.after),
    });
  }
  await writeFile(join(directory, item.id, 'steps.json'), JSON.stringify(share, null, 2) + '\n');
  await writeFile(join(directory, item.id, 'describe.json'), described);
  if (check) await checkProject(project, join(ROOT, 'out/checks', item.id));
  // Last, after the checks, so it vouches for every file above: what they were built from, which
  // site:export compares with the checkout.
  await writeFile(
    join(directory, item.id, 'inputs.json'),
    JSON.stringify(await sceneInputs(project, inputs.hash), null, 2) + '\n',
  );
  const claims = await reviewClaims(project);
  const narrowOpenings = [];
  for (const variant of project.variants)
    narrowOpenings.push({ settings: variant.values, steps: await narrowOpeningPlan(variant, claims) });
  evidence.push({
    id: item.id,
    title: project.Scene.meta?.title ?? item.id,
    lang: project.Scene.meta?.lang ?? 'en',
    cases: project.variants.map((v) => v.values),
    narrowOpenings,
    diagrams: Object.keys(project.store).length,
    styles: [...new Set(Object.values(project.store).map((s) => s.spec.style ?? 'default'))],
    families: [...new Set(Object.values(project.store).map((s) => s.family))],
    entry: {
      step: variant.trace.steps.find((step) => !step.meta.detail)?.step ?? variant.trace.steps[0]!.step,
      settings: variant.values,
    },
    sourceHash: project.sourceHash,
    engineHash: project.engineHash,
    snapshotHashes: baseReceipt(project).snapshotHashes,
  });
  console.log(
    `${item.id}: ${project.variants.length} cases · ${Object.keys(project.store).length} diagrams${check ? ' · checks passed' : ''}`,
  );
}
await buildLoader(join(directory, 'loader.js'));
// Known heights (tools/lib/explain-embed-size.ts): each page as the loader frames it, served from here.
{
  const server = await serve(directory, 0, 'index.html'),
    browser = await launch();
  try {
    for (const item of items) {
      const size = await measureEmbed(browser, server.url, item.id + '.html'),
        problems = embedSizeProblems(size);
      if (problems.length) throw new Error(`${item.id}/embed.json: ${problems.join('; ')}`);
      await writeFile(join(directory, item.id, 'embed.json'), JSON.stringify(size, null, 2) + '\n');
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`Embed heights at 390, 640 and 900 px: ${items.length} explainers`);
}
const cases = evidence.reduce((n, s) => n + s.cases.length, 0),
  diagrams = evidence.reduce((n, s) => n + s.diagrams, 0),
  styles = new Set(evidence.flatMap((s) => s.styles)),
  families = new Set(evidence.flatMap((s) => s.families));
const totals = {
  explainers: evidence.length,
  cases,
  diagrams,
  styles: styles.size,
  families: families.size,
};
const evidenceDocument: import('./lib/explain-artifacts.ts').CatalogEvidence = { version: 2, checked: !!check, totals, scenes: evidence };
const catalog: import('./lib/explain-artifacts.ts').Catalog = {
  version: 1,
  product: PRODUCT,
  totals,
  scenes: items.map((item) => {
    const data = evidence.find((scene) => scene.id === item.id)!;
    return {
      ...item,
      title: data.title,
      lang: data.lang,
      cases: data.cases.length,
      entry: data.entry,
      showcase: SHOWCASE.some((id) => id === item.id),
    };
  }),
};
const selected = selectExport(values.only, catalog, evidenceDocument, values.entry);
await writeFile(join(directory, 'evidence.json'), JSON.stringify(selected.evidence, null, 2) + '\n');
await writeFile(join(directory, 'catalog.json'), JSON.stringify(selected.catalog, null, 2) + '\n');
const css = await readFile(join(ROOT, 'app/embed.css'), 'utf8'),
  tokens = css.slice(0, css.indexOf('\nbody{'));
await writeFile(join(directory, 'index.html'), galleryPage(selected.catalog, tokens, collection));
// Two embeds in a host's articles. The tile is the edge: the host draws no card around an embed, and
// its own text above and below each one shows where the explainer begins and ends.
const article = (id: string, src: string, title: string, before: string, after: string) =>
  `<article><h2>${htmlEscape(title)}</h2><p>${htmlEscape(before)}</p><div id="${id}"></div><p>${htmlEscape(after)}</p><script src="loader.js" data-src="${htmlEscape(src)}" data-target="${id}" data-title="${htmlEscape(title)}"></script></article>`;
if (collection) await writeFile(
  join(directory, 'embed-lab.html'),
  `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two embeds on one host page</title><style>${tokens}:root{color-scheme:light}body{max-width:1200px;margin:0 auto;padding:32px 16px 64px;background:#fbf8f3;color:#2b2520;font:17px/1.65 Georgia,"Times New Roman",serif}h1{font-size:1.5rem;font-weight:650;letter-spacing:-.015em;margin:0 0 8px;text-wrap:balance}h2{font-size:1.15rem;margin:0 0 8px}a{color:var(--accent);text-underline-offset:.2em}main{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:24px;align-items:start}article{min-width:0}article p{margin:16px 0;text-wrap:pretty}@media(max-width:850px){main{grid-template-columns:1fr}}</style><h1>Two embeds, each sized to its own content</h1><a href="index.html">All explainers</a><main>${article('git', 'exgit.html', 'Git object ids', 'Git names every object by a hash of its content. Step through how a commit gets its id below.', 'Change one byte and every id above it changes, which is what makes the history tamper-evident.')}${article('cache', 'mr-cache.html?request=miss', 'Cache request', 'We put a key-value cache in front of D1. Follow a request that misses it below.', 'The next request for the same user is a hit and never reaches D1.')}</main></html>`,
);
assert.equal((await buildInputs(ROOT)).hash, inputs.hash, 'build inputs changed during collection build');
for (const {id} of items) await checkBuilt(join(directory, id), join(ROOT, 'scenes/explainers', id), inputs.hash);
await writeFile(
  join(directory, 'output-hashes.json'),
  JSON.stringify(
    await builtOutputHashes(
      directory,
      items.map((e) => e.id),
      collection,
    ),
    null,
    2,
  ) + '\n',
);
console.log(`Gallery: ${join(directory, 'index.html')}\n${JSON.stringify(totals)}`);

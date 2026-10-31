#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';
import { collectProject, defaultVariant, ROOT, baseReceipt, sceneInputs } from './lib/explain-project.ts';
import { describeProject } from './lib/explain-site-describe.ts';
import { restingTime, htmlEscape, pictureSummary, stepWords } from '../explain/trace.ts';
import { buildExplainer, buildLoader } from './lib/explain-build.ts';
import { contactSheet, stillPng, cardPng } from './lib/explain-shots.ts';
import { checkProject } from './lib/explain-check.ts';
import { shareable } from './lib/explain-share.ts';
import { useProjectLettering } from './lib/explain-lettering.ts';
import { galleryTile } from './lib/explain-gallery.ts';
import { builtOutputHashes } from './lib/explain-built-files.ts';
import type { ShareManifest } from './lib/explain-share.ts';
import { measureEmbed, embedSizeProblems } from './lib/explain-embed-size.ts';
import { serve } from './lib/explain-serve.ts';
import { launch } from './lib/browser.ts';
import {reviewClaims} from './lib/explain-review-scene.ts';
import {STORY_CLAIMS, narrowOpeningPlan} from './lib/explain-story-review.ts';
import type {NarrowOpeningObligation} from './lib/explain-review-plan.ts';

const directory = join(ROOT, 'out/explainers');
await mkdir(directory, { recursive: true });
// An interrupted rebuild must not leave an old output pin vouching for changed bytes.
await rm(join(directory, 'output-hashes.json'), { force: true });
const { check } = parseArgs({
  options: { check: { type: 'boolean' } },
}).values;
// What the gallery and docs point at, with source and snapshot fingerprints.
const evidence: {
  id: string;
  title: string;
  lang: string;
  cases: Record<string, string>[];
  narrowOpenings: {settings: Record<string, string>; steps: NarrowOpeningObligation[]}[];
  diagrams: number;
  styles: string[];
  families: string[];
  sourceHash: string;
  engineHash: string;
  snapshotHashes: string[];
}[] = [];
for (const item of EXPLAINERS) {
  // Remove the record of what this explainer's files were built from now and write it last (below),
  // so a build that stops part way leaves no record for site:export to trust.
  await rm(join(directory, item.id, 'inputs.json'), { force: true });
  const project = await collectProject(join(ROOT, 'scenes/explainers', item.id));
  // For agents: what site:export publishes as <id>.json, described right after the run, as
  // `rayner describe` does.
  const described = await describeProject(project);
  const { html, receipt } = await buildExplainer(project, join(directory, item.id + '.html'));
  assert.equal('lettering' in receipt, !!project.lettering, `${item.id}: only a requested page reports lettering`);
  assert.equal('letteringHash' in receipt, !!project.outlineLettering, `${item.id}: requested outlines have a hash`);
  assert.equal(Buffer.byteLength(html), receipt.bytes, `${item.id}: receipt reports actual page bytes`);
  // The poster uses a representative step of the default case; tile links start at step one.
  const variant = defaultVariant(project),
    step = variant.trace.steps.find((s) => s.step === item.step) ?? variant.trace.steps[0]!;
  await writeFile(join(directory, item.id + '.png'), await stillPng(variant.Scene, restingTime(step, variant.trace.fps), 960));
  await contactSheet(project, join(directory, item.id + '.steps.png'));
  // Share pages (tools/lib/explain-share.ts): a picture and the words for every step of the default
  // case, so site:export can give each step a URL whose link preview is that step.
  await mkdir(join(directory, item.id), { recursive: true });
  const pictured = variant.trace.steps.filter((x) => shareable(x.step));
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
    await writeFile(join(directory, item.id, s.step + '.png'), await cardPng(variant.Scene, restingTime(s, variant.trace.fps)));
    share.steps.push({ step: s.step, title: stepWords(s).title, caption: stepWords(s).caption, picture: pictureSummary(s.after) });
  }
  await writeFile(join(directory, item.id, 'steps.json'), JSON.stringify(share, null, 2) + '\n');
  await writeFile(join(directory, item.id, 'describe.json'), described);
  if (check) await checkProject(project, join(ROOT, 'out/checks', item.id));
  // Last, after the checks, so it vouches for every file above: what they were built from, which
  // site:export compares with the checkout.
  await writeFile(join(directory, item.id, 'inputs.json'), JSON.stringify(await sceneInputs(project), null, 2) + '\n');
  const claims = await reviewClaims(project, undefined, STORY_CLAIMS[item.id]);
  const narrowOpenings = [];
  for (const variant of project.variants)
    narrowOpenings.push({settings: variant.values, steps: await narrowOpeningPlan(variant, claims)});
  evidence.push({
    id: item.id,
    title: project.Scene.meta?.title ?? item.id,
    lang: project.Scene.meta?.lang ?? 'en',
    cases: project.variants.map((v) => v.values),
    narrowOpenings,
    diagrams: Object.keys(project.store).length,
    styles: [...new Set(Object.values(project.store).map((s) => s.spec.style ?? 'default'))],
    families: [...new Set(Object.values(project.store).map((s) => s.family))],
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
    for (const item of EXPLAINERS) {
      const size = await measureEmbed(browser, server.url, item.id + '.html'),
        problems = embedSizeProblems(size);
      if (problems.length) throw new Error(`${item.id}/embed.json: ${problems.join('; ')}`);
      await writeFile(join(directory, item.id, 'embed.json'), JSON.stringify(size, null, 2) + '\n');
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`Embed heights at 390, 640 and 900 px: ${EXPLAINERS.length} explainers`);
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
await writeFile(
  join(directory, 'evidence.json'),
  // A failing check throws before this is written, so `checked` means every case passed.
  JSON.stringify({ version: 2, checked: !!check, totals, scenes: evidence }, null, 2) + '\n',
);
await writeFile(join(directory, 'catalog.json'), JSON.stringify({
  version: 1, product: PRODUCT, totals,
  scenes: EXPLAINERS.map(item => {
    const data = evidence.find(scene => scene.id === item.id)!;
    return { ...item, title: data.title, lang: data.lang, cases: data.cases.length };
  }),
}, null, 2) + '\n');
const tile = (item: (typeof EXPLAINERS)[number], lead = false) => {
  const data = evidence.find((s) => s.id === item.id)!;
  return galleryTile({ id: item.id, title: data.title, lang: data.lang }, lead);
};
const topics = EXPLAINERS.filter((e) => e.group === 'topic'),
  toolchain = EXPLAINERS.filter((e) => e.group === 'toolchain');
const entryUrl = `${PRODUCT.entry.id}.html?${new URLSearchParams({step: PRODUCT.entry.step, ...PRODUCT.entry.settings})}`;
// The embed's colour tokens, type and resets (everything before its body rule), so the gallery matches the pages.
const css = await readFile(join(ROOT, 'app/embed.css'), 'utf8'),
  tokens = css.slice(0, css.indexOf('\nbody{'));
// Experience surface: the pictures lead, each tile is a picture and the claim it makes.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rayner</title><style>
${tokens}
:root{--outline:rgb(0 0 0/.1)}
@media(prefers-color-scheme:dark){:root{--outline:rgb(255 255 255/.1)}}
body{margin:0;background:var(--bg);color:var(--fg)}
main{max-width:1180px;margin:0 auto;padding:40px 16px 64px}
.intro{max-width:68ch;line-height:1.6;margin:0 0 16px}.intro a{color:var(--accent);text-underline-offset:.2em}h1{font-size:clamp(1.75rem,4vw,2.5rem);line-height:1.15;letter-spacing:-.02em;font-weight:650;margin:0 0 32px;text-wrap:balance}
h2{font-size:1.125rem;font-weight:650;margin:64px 0 16px;padding-top:24px;border-top:1px solid var(--line)}
ul.tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:32px 24px}
ul.tiles .lead{grid-column:1/-1}
@media(min-width:760px){ul.tiles .lead{grid-column:span 2;grid-row:span 2}}
.tiles a{display:block;color:inherit;text-decoration:none;border-radius:12px}
.tiles img{display:block;width:100%;height:auto;aspect-ratio:16/9;border-radius:10px;outline:1px solid var(--outline);outline-offset:-1px;transition:transform 200ms cubic-bezier(.23,1,.32,1)}
.tiles span{display:block;margin-top:12px;font-weight:600;line-height:1.35;text-wrap:balance}
.tiles .lead span{font-size:1.25rem}
.tiles a:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
@media(hover:hover) and (pointer:fine){.tiles a:hover img{transform:scale(1.01)}.tiles a:hover span{color:var(--accent)}}
.more{display:flex;flex-wrap:wrap;gap:8px 24px;margin:24px 0 0;padding:0;list-style:none}
.more a{color:var(--accent);text-underline-offset:.2em}
footer{margin-top:64px;font-size:.875rem;color:var(--muted)}
footer a{color:inherit}
@media(prefers-reduced-motion:reduce){.tiles img{transition:none}}
</style></head><body><main><h1>Rayner</h1><p class="intro">${htmlEscape(PRODUCT.summary)} ${htmlEscape(PRODUCT.description)}</p><p class="intro">${htmlEscape(PRODUCT.audience)} <a href="${PRODUCT.tutorial}">Write your first explainer</a>, use the <a href="${PRODUCT.reference}">authoring reference</a>, or follow the <a href="${PRODUCT.skill}">agent authoring skill</a>.</p><p><a href="${htmlEscape(entryUrl)}">${htmlEscape(PRODUCT.entry.label)}</a></p><ul class="tiles">${topics.map((t, i) => tile(t, i === 0)).join('')}</ul><h2>How these are made</h2><ul class="tiles">${toolchain.map((t) => tile(t)).join('')}</ul><ul class="more"><li><a href="embed-lab.html">Two embeds on one host page</a></li><li><a href="evidence.json">Build evidence</a></li></ul><footer>Built on <a href="https://github.com/ivarvong/lantern">Lantern</a> by Ivar Vong (MIT) and <a href="https://github.com/adewale/agentic-mermaid">Agentic Mermaid</a>.</footer></main></body></html>`;
await writeFile(join(directory, 'index.html'), html);
// Two embeds in a host's articles. The tile is the edge: the host draws no card around an embed, and
// its own text above and below each one shows where the explainer begins and ends.
const article = (id: string, src: string, title: string, before: string, after: string) =>
  `<article><h2>${htmlEscape(title)}</h2><p>${htmlEscape(before)}</p><div id="${id}"></div><p>${htmlEscape(after)}</p><script src="loader.js" data-src="${htmlEscape(src)}" data-target="${id}" data-title="${htmlEscape(title)}"></script></article>`;
await writeFile(
  join(directory, 'embed-lab.html'),
  `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two embeds on one host page</title><style>${tokens}:root{color-scheme:light}body{max-width:1200px;margin:0 auto;padding:32px 16px 64px;background:#fbf8f3;color:#2b2520;font:17px/1.65 Georgia,"Times New Roman",serif}h1{font-size:1.5rem;font-weight:650;letter-spacing:-.015em;margin:0 0 8px;text-wrap:balance}h2{font-size:1.15rem;margin:0 0 8px}a{color:var(--accent);text-underline-offset:.2em}main{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:24px;align-items:start}article{min-width:0}article p{margin:16px 0;text-wrap:pretty}@media(max-width:850px){main{grid-template-columns:1fr}}</style><h1>Two embeds, each sized to its own content</h1><a href="index.html">All explainers</a><main>${article('git', 'exgit.html', 'Git object ids', 'Git names every object by a hash of its content. Step through how a commit gets its id below.', 'Change one byte and every id above it changes, which is what makes the history tamper-evident.')}${article('cache', 'mr-cache.html?request=miss', 'Cache request', 'We put a key-value cache in front of D1. Follow a request that misses it below.', 'The next request for the same user is a hit and never reaches D1.')}</main></html>`,
);
await writeFile(join(directory, 'output-hashes.json'), JSON.stringify(await builtOutputHashes(directory, EXPLAINERS.map(e => e.id)), null, 2) + '\n');
console.log(`Gallery: ${join(directory, 'index.html')}\n${JSON.stringify(totals)}`);

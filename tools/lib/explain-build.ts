import { build } from 'esbuild';
import { browserFonts } from './explain-browser-fonts.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pageSize } from './page-budget.ts';
import { pageSnapshots, packPageSnapshots } from './page-snapshots.ts';
import { SnapshotSink, renderAt } from '../../src/index.ts';
import { chromeFor, caseNameIn, changeText, descriptionLang } from '../../app/embed-strings.ts';
import { restingTime, pictureHtml, htmlEscape, stepWords, watchedChanges, wordsHtml } from '../../explain/trace.ts';
import { ROOT, engineAlias, defaultVariant, hash, scriptEscape, sceneSlug, baseReceipt } from './explain-project.ts';
import type { Project } from './explain-project.ts';
import { pageFaces, letteringReport, useProjectLettering } from './explain-lettering.ts';
import { letteringLicences, pageSnapshot } from './lettering.ts';
import { RTL_SCRIPTS } from '../../src/lettering-outlines.ts';
import { playerCss } from '../../app/embed-style.ts';
import {stepAudio} from '../../explain/audio.ts';

/**
 * A page whose lettering asks for a right-to-left script sets the direction of
 * each title, caption and transcript line from its own first letter (UAX #9
 * P2-P3), so an Arabic or Hebrew caption reads and aligns right to left while
 * the player's controls stay as they are. Every other page's style is as it was.
 */
const RTL_CSS = '\nh1,.caption,.lede,.lede *,.changes span,.transcript h2,.transcript a,.transcript p,.steps button span,.steps .line{unicode-bidi:plaintext;text-align:start}\n';
const rightToLeftPage = (project: Project) =>
  !!project.outlineLettering?.request.scripts?.some((script) => RTL_SCRIPTS.includes(script));

export async function buildExplainer(
  project: Project,
  out: string,
): Promise<{ html: string; receipt: Record<string, unknown> }> {
  const v = defaultVariant(project),
    first = v.trace.steps[0]!;
  // The page's own words follow the scene's language, and so do the picture descriptions where
  // explain/words.ts has words for it; elsewhere they are English, marked lang="en".
  const title = project.Scene.meta?.title ?? sceneSlug(project),
    lang = project.Scene.meta?.lang ?? 'en',
    t = chromeFor(lang);
  await useProjectLettering(project);
  let withAudio=false;
  // Validate every step, including clips after the first sound-bearing step.
  for(const variant of project.variants) for(const step of variant.trace.steps)
    if(stepAudio(step.meta.audio)) withAudio=true;
  const sink = new SnapshotSink();
  await renderAt(v.Scene, restingTime(first, v.trace.fps), sink);
  // A page that asked for lettering puts its faces in place before the player shapes anything.
  // Every other page's entry is as it was: it never imports src/lettering.ts.
  const snapshots = pageSnapshots(project.store);
  const rawSnapshots = JSON.stringify(snapshots);
  const rawCompressed = gzipSync(rawSnapshots, {level: 9});
  const packedCompressed = gzipSync(JSON.stringify(packPageSnapshots(snapshots)), {level: 9});
  const compressed = (packedCompressed.length < rawCompressed.length ? packedCompressed : rawCompressed).toString('base64');
  const zipped = compressed.length + 512 < rawSnapshots.length;
  const payload = zipped ? `await inflateSnapshots(${JSON.stringify(compressed)})` : rawSnapshots;
  const snapshotImport = zipped ? `import{inflateSnapshots}from ${JSON.stringify(join(ROOT, 'app/embed-snapshots.ts'))};` : '';
  const soundImport=withAudio ? `import{mountAudio}from ${JSON.stringify(join(ROOT,'app/embed-audio.ts'))};` : '';
  const mount = `mountEmbed(root,Source,${payload}${withAudio?',mountAudio':''})`,
    lettered = project.lettering
      ? `import{useLettering}from ${JSON.stringify(join(ROOT, 'src/lettering.ts'))};`
      : '';
  const author = project.outlineLettering
    ? `import Original from 'virtual:author';import{bindLettering}from ${JSON.stringify(join(ROOT, 'src/lettering-outlines.ts'))};const Source=bindLettering(Original,${JSON.stringify(await pageSnapshot(project.outlineLettering))});`
    : `import Source from 'virtual:author';`;
  const entry = `${author}import{mountEmbed}from ${JSON.stringify(join(ROOT, 'app/embed.ts'))};${soundImport}${lettered}${snapshotImport}const root=document.getElementById('content');(async()=>{${lettered ? `await useLettering(${JSON.stringify(pageFaces(project.lettering))});` : ''}await ${mount};root.dataset.ready='true'})().catch(error=>{console.error(error);const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=${JSON.stringify(t.failed)};root.append(p)});`;
  const bundled = await build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'explainer-entry.ts', loader: 'ts' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: true,
    metafile: true,
    plugins: [
      {
        name: 'author-scene',
        setup(b) {
          b.onResolve({ filter: /^virtual:author$/ }, () => ({ path: 'author', namespace: 'author' }));
          b.onLoad({ filter: /.*/, namespace: 'author' }, () => ({
            contents: `export { ${project.exportName === 'default' ? 'default' : project.exportName + ' as default'} } from ${JSON.stringify(project.file)};`,
            resolveDir: dirname(project.file),
            loader: 'ts',
          }));
        },
      },
      ...(!project.lettering && !project.outlineLettering ? [browserFonts(ROOT)] : []),
      engineAlias(false, !!project.outlineLettering),
    ],
    logLevel: 'silent',
  });
  if (
    Object.keys(bundled.metafile!.inputs).some(
      (p) => p.includes('node_modules/agentic-mermaid') || p.includes('integrations/agentic-mermaid/build/') || p.includes('vendor/glyph-math.js') || p.includes('tools/lettering'),
    )
  )
    throw new Error('Build-time diagram renderer leaked into browser artifact');
  // Framed (specs/player-tile.md T4), the page draws only the tile. This runs before the body is
  // laid out, so a frame never shows the padded page first; the CSP pins it by its own hash.
  const framedJs = "if(parent!==window)document.documentElement.dataset.framed=''";
  const js = scriptEscape(bundled.outputFiles[0]!.text),
    css = (await readFile(join(ROOT, 'app/embed.css'), 'utf8')) + (rightToLeftPage(project) ? RTL_CSS : '') +
      (withAudio ? '\n'+await readFile(join(ROOT,'app/embed-audio.css'),'utf8') : '') + playerCss(project.Scene.meta?.player, v.palette);
  // Every case, every step: a link to it, its caption, what it changed of the state the author
  // watches (meta.watch) and what its resting picture shows.
  // The player shows the current case's section; without JavaScript every case shows.
  const transcript = project.variants
    .map(({ values, trace }) => {
      const key = new URLSearchParams(values).toString(),
        name = caseNameIn(lang, project.Scene, values);
      const steps = trace.steps.map((s, i) => {
        const href = `?${key ? key + '&' : ''}${new URLSearchParams({ step: s.step })}`,
          shows = pictureHtml(s.after, trace.steps[i - 1]?.after),
          words = stepWords(s),
          changes = watchedChanges(s, project.Scene.meta?.watch, lang).map((c) => changeText(t, c));
        const entry = project.Scene.meta?.caseNavigation === 'first' && i > 0
          ? `<span>${htmlEscape(words.title)}</span>`
          : `<a href="${htmlEscape(href)}">${htmlEscape(words.title)}</a>`;
        return `<li>${entry}${wordsHtml(words)}${changes.length ? `<p>${htmlEscape(t.changes(...changes))}</p>` : ''}${shows ? `<div${descriptionLang(lang)}>${shows}</div>` : ''}</li>`;
      });
      return `<section data-case="${htmlEscape(key)}">${name ? `<h2>${htmlEscape(name)}</h2>` : ''}<ol>${steps.join('')}</ol></section>`;
    })
    .join('');
  // The scene's check questions after every case: the questions, each answer behind a disclosure.
  const checks = (project.Scene.meta?.checks ?? [])
    .map((c) => `<li><p>${htmlEscape(c.question)}</p><details><summary>${htmlEscape(t.showAnswer)}</summary><p>${htmlEscape(c.answer)}</p></details></li>`)
    .join('');
  const sources = (project.Scene.meta?.sources ?? [])
    .map((url) => `<li><a href="${htmlEscape(url)}" target="_blank" rel="noopener">${htmlEscape(url)}</a></li>`)
    .join('');
  const notices = await Promise.all(
    ['LICENSE', 'vendor/licenses/Inter-OFL.txt', 'vendor/licenses/JetBrainsMono-OFL.txt', 'vendor/licenses/Noto-OFL.txt', 'vendor/licenses/glyph-MIT.txt'].map((file) =>
      readFile(join(ROOT, file), 'utf8'),
    ),
  );
  // A requested face's notice joins the block unless the block already holds that text.
  const licenses = notices.join('\n\n') + (project.outlineLettering
    ? letteringLicences(project.outlineLettering).filter((notice) => !notices.includes(notice)).map((notice) => '\n\n' + notice).join('')
    : '');
  const html = `<!doctype html>\n<html lang="${htmlEscape(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><meta name="generator" content="Rayner"><style>${css}</style></head><body><script>${framedJs}</script><main id="content"><div class="layout tile"><section class="player"><h1>${htmlEscape(title)}</h1><div class="stage poster">${sink.svg}</div><p class="caption">${htmlEscape(stepWords(first).caption)}</p><details class="transcript" open><summary>${htmlEscape(t.transcript)}</summary>${transcript}${checks ? `<h2>${htmlEscape(t.checkYourself)}</h2><ol class="check-questions">${checks}</ol>` : ''}${sources ? `<h2>${htmlEscape(t.sources)}</h2><ul>${sources}</ul>` : ''}</details></section></div></main><template id="licenses"><pre>${htmlEscape(licenses)}</pre></template><script>${js}</script></body></html>\n`;
  const sri = (value: string) => "'sha256-" + createHash('sha256').update(value).digest('base64') + "'";
  const policy = `default-src 'none'; script-src ${sri(framedJs)} ${sri(js)}; style-src ${sri(css)}; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors *`;
  const receipt = {
    ...baseReceipt(project),
    title,
    artifactHash: hash(html),
    variants: project.variants.map((v) => ({
      settings: v.values,
      steps: v.trace.steps.length,
      duration: v.trace.duration,
    })),
    ...pageSize(html),
    headers: { 'Content-Security-Policy': policy, 'Cache-Control': 'public, max-age=0, must-revalidate' },
    // Only a page that asked for lettering says what it weighs; every other receipt is as it was.
    ...(project.lettering ? { lettering: letteringReport(project.lettering) } : {}),
  };
  out = resolve(out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  await writeFile(out + '.receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  // Sidecar deployment recipe: static hosts must apply these as response headers.
  await writeFile(out + '.headers.json', JSON.stringify(receipt.headers, null, 2) + '\n');
  return { html, receipt };
}
export async function buildLoader(out: string): Promise<void> {
  const result = await build({
    entryPoints: [join(ROOT, 'app/loader.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'RaynerEmbed',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: true,
  });
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(out, result.outputFiles[0]!.text);
}

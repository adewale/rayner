import { htmlEscape } from '../../explain/trace.ts';

/** Poster frames are curated; opening a tile starts the reader at step one. */
export function galleryTile(item: { id: string; title: string; lang: string }, lead = false): string {
  const href = `${item.id}.html`;
  const lang = item.lang === 'en' ? '' : ` lang="${htmlEscape(item.lang)}"`;
  const hreflang = item.lang === 'en' ? '' : ` hreflang="${htmlEscape(item.lang)}"`;
  return `<li${lead ? ' class="lead"' : ''}><a href="${htmlEscape(href)}"${hreflang}><img src="${htmlEscape(item.id)}.png" width="960" height="540" alt="" loading="${lead ? 'eager' : 'lazy'}"><span${lang}>${htmlEscape(item.title)}</span></a></li>`;
}

interface GalleryCatalog {
  product: {
    entry: { id: string; step?: string; settings?: Record<string, string>; label?: string };
    [key: string]: unknown;
  };
  scenes: { id: string; title?: string; lang?: string; group?: unknown; showcase?: unknown }[];
}
/** Full collections lead with the showcase; an explicit subset shows its selected cards. */
export function galleryPage(catalog: GalleryCatalog, tokens: string, collection = true): string {
  const { product, scenes } = catalog,
    entry = product.entry;
  const text = (key: string) => (typeof product[key] === 'string' ? (product[key] as string) : '');
  const tile = (item: GalleryCatalog['scenes'][number], lead = false) =>
    galleryTile({ id: item.id, title: item.title ?? item.id, lang: item.lang ?? 'en' }, lead);
  const featured = collection
    ? scenes.filter((scene) => scene.showcase === true || scene.id === entry.id)
    : scenes;
  const topics = [
    ...featured.filter((scene) => scene.id === entry.id),
    ...featured.filter((scene) => scene.id !== entry.id),
  ];
  const library = collection
    ? scenes.filter((scene) => scene.group === 'topic' && !featured.includes(scene))
    : [];
  const toolchain = collection
    ? scenes.filter((scene) => scene.group === 'toolchain' && !featured.includes(scene))
    : [];
  const query = new URLSearchParams({ ...entry.settings, ...(entry.step ? { step: entry.step } : {}) });
  const entryUrl = entry.id + '.html' + (query.size ? '?' + query : '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rayner</title><style>
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
.library{margin-top:48px}.library>summary{cursor:pointer;font-weight:600;margin-bottom:24px}.more{display:flex;flex-wrap:wrap;gap:8px 24px;margin:24px 0 0;padding:0;list-style:none}
.more a{color:var(--accent);text-underline-offset:.2em}
footer{margin-top:64px;font-size:.875rem;color:var(--muted)}
footer a{color:inherit}
@media(prefers-reduced-motion:reduce){.tiles img{transition:none}}
</style></head><body><main><h1>Rayner</h1><p class="intro">${htmlEscape(text('summary'))} ${htmlEscape(text('description'))}</p><p class="intro">${htmlEscape(text('audience'))} <a href="${htmlEscape(text('tutorial'))}">Write your first explainer</a>, use the <a href="${htmlEscape(text('reference'))}">authoring reference</a>, or follow the <a href="${htmlEscape(text('skill'))}">agent authoring skill</a>.</p><p><a href="${htmlEscape(entryUrl)}">${htmlEscape(entry.label ?? entry.id)}</a></p><ul class="tiles">${topics.map((t, i) => tile(t, i === 0)).join('')}</ul>${library.length ? `<details class="library"><summary>More subject lessons</summary><ul class="tiles">${library.map((t) => tile(t)).join('')}</ul></details>` : ''}${toolchain.length ? `<details class="library"><summary>Authoring recipes and how Rayner works</summary><ul class="tiles">${toolchain.map((t) => tile(t)).join('')}</ul></details>` : ''}<ul class="more">${collection ? '<li><a href="embed-lab.html">Two embeds on one host page</a></li>' : ''}<li><a href="evidence.json">Build evidence</a></li></ul><footer>Built on <a href="https://github.com/ivarvong/lantern">Lantern</a> by Ivar Vong (MIT) and <a href="https://github.com/adewale/agentic-mermaid">Agentic Mermaid</a>.</footer></main></body></html>`;
}

// Link previews: one small static page per step, so a link to a step previews that step, and the
// same tags on each explainer's own page. Link previews (Open Graph, and X's Twitter card tags)
// come from the HTML a crawler fetches, and a static host sends the same HTML for every `?step=`;
// so each step gets its own URL, <path>/<id>/<step>, whose page names the step, carries its
// resting picture and sends a reader on to the player at that step (<path>/<id>?step=<step>).
// No script, no styles. Crawlers read the tags of the page they fetched and do not follow its
// meta refresh, so the preview is the share page's.
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { htmlEscape } from '../../explain/trace.ts';
import { HOME, SHARE_META, SHARE_STEPS_META, shareable } from '../../app/embed-share.ts';
import type { EmbedSize } from './explain-embed-size.ts';

export { shareable };

/**
 * A preview picture: the 960 × 540 still centred on a 1080 × 540 (2:1) canvas of the stage's
 * background, drawn by cardPng (tools/lib/explain-shots.ts). X takes PNG up to 5 MB and at least
 * 300 × 157, and shows summary_large_image at 2:1.
 */
export const CARD = { width: 1080, height: 540, inner: 960, background: '#1a1a1a' } as const;
/** X's limits: twitter:image:alt is at most 420 characters, and X cuts twitter:title at 70. */
const ALT_MAX = 420,
  TITLE_MAX = 70;

/** A step of an explainer's default case, as the share pages need it. */
export interface ShareStep {
  step: string;
  title: string;
  caption: string;
  /** The resting picture in words: the preview image's alt text. */
  picture: string;
}
/** What `demos:build` writes beside each explainer as `<id>/steps.json`. */
export interface ShareManifest {
  id: string;
  title: string;
  lang: string;
  /** The step the explainer's own page previews as: its gallery tile's step when it has a share picture. */
  cover: string;
  steps: ShareStep[];
}

/** At most `max` characters, cut at a word, with an ellipsis when cut. */
export function clip(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,.;:–—-]+$/, '') + '…';
}

/** The tags every preview carries, Open Graph and X's own, which X reads before falling back to og:. */
export const CARD_TAGS = [
  'og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt',
] as const;

function cardTags(c: { title: string; description: string; url: string; image: string; alt: string }): string {
  const a = htmlEscape,
    alt = clip(c.alt, ALT_MAX);
  return [
    ['name', 'description', c.description],
    ['property', 'og:type', 'article'],
    ['property', 'og:title', c.title],
    ['property', 'og:description', c.description],
    ['property', 'og:url', c.url],
    ['property', 'og:image', c.image],
    ['property', 'og:image:width', String(CARD.width)],
    ['property', 'og:image:height', String(CARD.height)],
    ['property', 'og:image:alt', alt],
    ['name', 'twitter:card', 'summary_large_image'],
    // Cut at a word here rather than mid-word by X.
    ['name', 'twitter:title', clip(c.title, TITLE_MAX)],
    ['name', 'twitter:description', c.description],
    ['name', 'twitter:image', c.image],
    ['name', 'twitter:image:alt', alt],
  ]
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${a(value!)}">`)
    .join('\n');
}
const folder = (origin: string, path: string) => origin.replace(/\/$/, '') + path.replace(/\/$/, '');
const card = (m: ShareManifest, s: ShareStep, origin: string, title: string, url: string, path: string) => ({
  title,
  url,
  description: clip(s.caption),
  image: `${folder(origin, path)}/${m.id}/${s.step}.png`,
  // Alt text is the picture in words; a step with none is named by its title.
  alt: s.picture || s.title,
});

/**
 * The share page for one step. `origin` is the site's origin (https://example.org) and `path`
 * the explainers' folder on it (/projects/rayner): Open Graph needs absolute URLs.
 */
export function sharePage(m: ShareManifest, s: ShareStep, origin: string, path: string): string {
  const base = folder(origin, path),
    url = `${base}/${m.id}/${s.step}`,
    player = `${path.replace(/\/$/, '')}/${m.id}?step=${encodeURIComponent(s.step)}`,
    title = `${s.title} · ${m.title}`,
    a = htmlEscape;
  return `<!doctype html>
<html lang="${a(m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${a(title)}</title>
<link rel="canonical" href="${a(base + '/' + m.id + '?step=' + encodeURIComponent(s.step))}">
${cardTags(card(m, s, origin, title, url, path))}
<meta http-equiv="refresh" content="0; url=${a(player)}">
</head><body><p><a href="${a(player)}">${a(title)}</a></p></body></html>
`;
}

/**
 * The explainer's own page as `site:export --origin` publishes it: the built page with the same
 * tags in its head, previewing as its cover step, and SHARE_META naming <origin><path>/<id>/, so
 * the player's Copy link gives a step's share page (app/embed.ts). Its CSP pins only its inline
 * script and style, so tags in the head need no new header.
 */
export function publishedPage(html: string, m: ShareManifest, origin: string, path: string): string {
  const cover = m.steps.find((s) => s.step === m.cover);
  if (!cover) throw new Error(`${m.id}: cover step ${m.cover} has no share picture`);
  const at = html.indexOf('</head>');
  if (at < 0) throw new Error(`No </head> in the page for ${m.id}`);
  const tags =
    cardTags(card(m, cover, origin, m.title, `${folder(origin, path)}/${m.id}`, path)) +
    `\n<meta name="${SHARE_META}" content="${htmlEscape(`${folder(origin, path)}/${m.id}/`)}">` +
    `\n<meta name="${SHARE_STEPS_META}" content="${htmlEscape(m.steps.map(s => s.step).join(' '))}">` +
    `\n${oembedLink(m, origin, path)}`;
  return html.slice(0, at) + tags + html.slice(at);
}

/** oEmbed discovery: the link a CMS reads to turn a pasted page URL into its embed. */
const oembedLink = (m: { id: string; title: string }, origin: string, path: string) =>
  `<link rel="alternate" type="application/json+oembed" href="${htmlEscape(`${folder(origin, path)}/${m.id}.oembed.json`)}" title="${htmlEscape(m.title)}">`;
const OEMBED_LINK = /<link rel="alternate" type="application\/json\+oembed" href="([^"]*)" title="[^"]*">/g;

/**
 * The explainer's oEmbed response (https://oembed.com, type "rich"), fixed at 640 px wide: a static
 * host cannot honour `maxwidth`, and the iframe shrinks with max-width:100%. Its height is the page's
 * framed height at 640 (embed.json); the thumbnail is the poster, at its own size.
 */
export function oembed(m: { id: string; title: string }, size: EmbedSize, thumbnail: { width: number; height: number }, origin: string, path: string) {
  const base = folder(origin, path),
    a = htmlEscape,
    height = size.heights['640'];
  return {
    version: '1.0',
    type: 'rich',
    provider_name: 'Rayner',
    provider_url: HOME,
    title: m.title,
    thumbnail_url: `${base}/${m.id}.png`,
    thumbnail_width: thumbnail.width,
    thumbnail_height: thumbnail.height,
    width: 640,
    height,
    html: `<iframe src="${a(`${base}/${m.id}.html?theme=light`)}" title="${a(m.title)}" width="640" height="${height}" style="border:0;border-radius:12px;display:block;max-width:100%" allow="fullscreen" loading="lazy"></iframe>`,
    cache_age: 86400,
  };
}

/**
 * Beside an exported page in `target`: its known heights as <id>.embed.json, and with an origin its
 * oEmbed response as <id>.oembed.json. `built` is demos:build's folder.
 */
export async function writeEmbedFiles(target: string, built: string, m: { id: string; title: string }, origin: string | undefined, path: string): Promise<void> {
  await copyFile(join(built, m.id, 'embed.json'), join(target, m.id + '.embed.json'));
  if (!origin) return;
  const size = JSON.parse(await readFile(join(built, m.id, 'embed.json'), 'utf8')) as EmbedSize,
    thumbnail = pngSize(await readFile(join(built, m.id + '.png')));
  await writeFile(join(target, m.id + '.oembed.json'), JSON.stringify(oembed(m, size, thumbnail, origin, path), null, 2) + '\n');
}

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescape = (value: string) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => entities[e]!);

/** Width and height from a PNG's header. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Check a `site:export --origin` folder: for each explainer id, its page (<id>.html) and every
 * share page (<id>/<step>.html) has each of CARD_TAGS once, its URLs are absolute https URLs on
 * `origin`, and the picture each names exists at that path with the declared size; an explainer
 * page also names its share pages' folder in SHARE_META. Returns the problems found.
 */
export async function checkCards(
  root: string,
  origin: string,
  path: string,
  ids: readonly string[],
): Promise<{ pages: number; problems: string[] }> {
  const site = folder(origin, path),
    dir = join(root, path),
    problems: string[] = [],
    pages: string[] = [];
  for (const id of ids) {
    pages.push(id + '.html');
    const shares = (await readdir(join(dir, id)).catch(() => [])).filter((f) => f.endsWith('.html'));
    if (!shares.length) problems.push(`${id}: no share pages`);
    pages.push(...shares.map((f) => `${id}/${f}`));
  }
  for (const page of pages) {
    const html = await readFile(join(dir, page), 'utf8').catch(() => '');
    if (!html) {
      problems.push(`${page}: missing`);
      continue;
    }
    const head = html.slice(0, html.indexOf('</head>')),
      tags = new Map<string, string[]>();
    for (const [, key, value] of head.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)">/g))
      tags.set(key!, [...(tags.get(key!) ?? []), unescape(value!)]);
    const say = (problem: string) => problems.push(`${page}: ${problem}`);
    for (const key of CARD_TAGS) {
      const n = tags.get(key)?.length ?? 0;
      if (n !== 1) say(`${n} ${key} tags`);
    }
    if (tags.get('twitter:card')?.[0] !== 'summary_large_image') say('twitter:card is not summary_large_image');
    if ((tags.get('twitter:title')?.[0]?.length ?? 0) > TITLE_MAX) say(`twitter:title is over ${TITLE_MAX} characters`);
    // The player's Copy link reads this to give a step's share page.
    if (!page.includes('/') && tags.get(SHARE_META)?.join() !== `${site}/${page.replace(/\.html$/, '')}/`) say(`${SHARE_META} is not ${site}/${page.replace(/\.html$/, '')}/`);
    // An explainer's page names its oEmbed response once, and the response is there.
    if (!page.includes('/')) {
      const id = page.replace(/\.html$/, ''),
        links = [...head.matchAll(OEMBED_LINK)].map((l) => unescape(l[1]!));
      if (links.length !== 1 || links[0] !== `${site}/${id}.oembed.json`) say(`${links.length} oEmbed links, not one to ${site}/${id}.oembed.json`);
      const response = await readFile(join(dir, id + '.oembed.json'), 'utf8').then((t) => JSON.parse(t) as { type?: string; version?: string; html?: string }, () => undefined);
      if (!response) say(`${id}.oembed.json is missing`);
      else if (response.type !== 'rich' || response.version !== '1.0' || !/^<iframe [^>]*><\/iframe>$/.test(response.html ?? '')) say(`${id}.oembed.json is not a rich oEmbed 1.0 response with one iframe`);
    }
    for (const key of ['og:url', 'og:image', 'twitter:image'])
      for (const url of tags.get(key) ?? []) if (!url.startsWith('https://') || !url.startsWith(site + '/')) say(`${key} ${url} is not an https URL under ${site}`);
    const image = tags.get('og:image')?.[0];
    if (image && tags.get('twitter:image')?.[0] !== image) say('twitter:image differs from og:image');
    for (const key of ['og:image:alt', 'twitter:image:alt']) {
      const alt = tags.get(key)?.[0];
      if (alt !== undefined && (!alt.trim() || alt.length > ALT_MAX)) say(`${key} is empty or over ${ALT_MAX} characters`);
    }
    if (!image?.startsWith(site + '/')) continue;
    const png = await readFile(join(dir, image.slice(site.length))).catch(() => undefined);
    if (!png) {
      say(`${image} is missing`);
      continue;
    }
    const size = pngSize(png);
    if (String(size.width) !== tags.get('og:image:width')?.[0] || String(size.height) !== tags.get('og:image:height')?.[0])
      say(`${image} is ${size.width} × ${size.height}, not the declared ${tags.get('og:image:width')} × ${tags.get('og:image:height')}`);
    if (png.length >= 5 * 1024 * 1024) say(`${image} is 5 MB or more, over X's limit`);
  }
  return { pages: pages.length, problems };
}

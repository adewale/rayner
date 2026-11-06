import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sharePage, publishedPage, checkCards, clip, shareable, pngSize, writeEmbedFiles, CARD, CARD_TAGS } from '../tools/lib/explain-share.ts';
import type { ShareManifest } from '../tools/lib/explain-share.ts';
import { cardPng } from '../tools/lib/explain-shots.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';
import { Scene, Text, FadeIn } from '../src/index.ts';
import { stage } from '../explain/index.ts';

const manifest: ShareManifest = {
  id: 'token-bucket',
  title: 'A token bucket refills when a request arrives',
  lang: 'en',
  cover: 'burst',
  steps: [{ step: 'burst', title: 'Six at once: five 200s, then a 429', caption: 'R1–R5 take "the" five tokens & R6 finds none.', picture: 'The bucket, empty.' }],
};
const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];

test('a share page names the step, previews its picture by absolute URL and sends readers to the player at that step', () => {
  const html = sharePage(manifest, manifest.steps[0]!, 'https://example.org/', '/projects/rayner/');
  assert.equal(meta(html, 'og:image'), 'https://example.org/projects/rayner/token-bucket/burst.png');
  assert.equal(meta(html, 'twitter:image'), 'https://example.org/projects/rayner/token-bucket/burst.png');
  assert.equal(meta(html, 'og:url'), 'https://example.org/projects/rayner/token-bucket/burst');
  assert.equal(meta(html, 'og:title'), 'Six at once: five 200s, then a 429 · A token bucket refills when a request arrives');
  // X cuts a title at 70 characters; this one is cut at a word first.
  assert.equal(meta(html, 'twitter:title'), 'Six at once: five 200s, then a 429 · A token bucket refills when a…');
  // Quotes and ampersands in a caption cannot break out of the attribute.
  assert.equal(meta(html, 'og:description'), 'R1–R5 take &quot;the&quot; five tokens &amp; R6 finds none.');
  assert.equal(meta(html, 'twitter:description'), meta(html, 'og:description'));
  assert.equal(meta(html, 'og:image:alt'), 'The bucket, empty.');
  assert.equal(meta(html, 'twitter:image:alt'), 'The bucket, empty.');
  assert.equal(meta(html, 'og:image:width'), String(CARD.width));
  assert.equal(meta(html, 'og:image:height'), String(CARD.height));
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/projects\/rayner\/token-bucket\?step=burst">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.org\/projects\/rayner\/token-bucket\?step=burst">/);
  assert.match(html, /<html lang="en">/);
  // Nothing a CSP would have to allow.
  assert.doesNotMatch(html, /<script|<style|style=/);
});

test('a step with no picture description is named by its title in the alt text, never left empty', () => {
  const html = sharePage(manifest, { ...manifest.steps[0]!, picture: '' }, 'https://example.org', '/x');
  assert.equal(meta(html, 'og:image:alt'), 'Six at once: five 200s, then a 429');
  assert.equal(meta(html, 'twitter:image:alt'), 'Six at once: five 200s, then a 429');
  // X takes at most 420 characters of alt text.
  const long = sharePage(manifest, { ...manifest.steps[0]!, picture: 'a picture '.repeat(100) }, 'https://example.org', '/x');
  assert.ok(meta(long, 'twitter:image:alt')!.length <= 420);
});

test('descriptions are cut at a word, and only path-safe step names get a page', () => {
  assert.equal(clip('short caption'), 'short caption');
  const long = 'word '.repeat(80);
  const cut = clip(long, 50);
  assert.ok(cut.length <= 50 && cut.endsWith('…') && !cut.includes('wor…'), cut);
  assert.ok(shareable('other-rule') && shareable('v22'));
  assert.ok(!shareable('a/b') && !shareable('a b') && !shareable(''));
});

// A site:export --origin folder in miniature: one explainer page, one share page, one picture.
const folder = await mkdtemp(join(tmpdir(), 'rayner-share-'));
after(() => rm(folder, { recursive: true, force: true }));
const origin = 'https://example.org',
  path = '/projects/rayner',
  dir = join(folder, path);
/** A PNG header of the given size: all checkCards reads. */
function png(width: number, height: number) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(b);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
const page = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>T</title><style>a{}</style></head><body><script>1</script></body></html>\n';
async function exported(edit: { page?: (html: string) => string; share?: (html: string) => string; picture?: Buffer | null; oembed?: string | null } = {}) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, manifest.id), { recursive: true });
  const id = (html: string) => html;
  await writeFile(join(dir, manifest.id + '.html'), (edit.page ?? id)(publishedPage(page, manifest, origin, path)));
  await writeFile(join(dir, manifest.id, 'burst.html'), (edit.share ?? id)(sharePage(manifest, manifest.steps[0]!, origin, path)));
  if (edit.picture !== null) await writeFile(join(dir, manifest.id, 'burst.png'), edit.picture ?? png(CARD.width, CARD.height));
  if (edit.oembed !== null) await writeFile(join(dir, manifest.id + '.oembed.json'), edit.oembed ?? JSON.stringify({ version: '1.0', type: 'rich', html: '<iframe src="x"></iframe>' }));
  return (await checkCards(folder, origin, path, [manifest.id])).problems;
}

test('an exported explainer page keeps its page and adds the cover step\'s preview tags, with its own URL and title', async () => {
  const html = publishedPage(page, manifest, origin, path);
  assert.equal(html.replace(/<meta (?:property|name)="[^"]+" content="[^"]*">\n?|<link rel="alternate" type="application\/json\+oembed" [^>]*>\n?/g, ''), page);
  // oEmbed discovery (player-tile T6), once, naming <id>.oembed.json beside the page.
  assert.deepEqual([...html.matchAll(/<link rel="alternate" type="application\/json\+oembed" href="([^"]*)" title="([^"]*)">/g)].map((m) => [m[1], m[2]]),
    [['https://example.org/projects/rayner/token-bucket.oembed.json', manifest.title]]);
  assert.equal(meta(html, 'og:url'), 'https://example.org/projects/rayner/token-bucket');
  assert.equal(meta(html, 'twitter:title'), manifest.title);
  assert.equal(meta(html, 'twitter:image'), 'https://example.org/projects/rayner/token-bucket/burst.png');
  // Where its share pages are, for the player's Copy link.
  assert.equal(meta(html, 'rayner:share'), 'https://example.org/projects/rayner/token-bucket/');
  assert.equal(meta(sharePage(manifest, manifest.steps[0]!, origin, path), 'rayner:share'), undefined);
  assert.throws(() => publishedPage(page, { ...manifest, cover: 'gone' }, origin, path), /cover step gone/);
  assert.deepEqual(await exported(), []);
  assert.deepEqual(pngSize(await readFile(join(dir, manifest.id, 'burst.png'))), { width: CARD.width, height: CARD.height });
});

test('checkCards finds a missing tag on either page, a page with no share marker, a non-https or off-site URL, and a missing or mis-sized picture', async () => {
  // This protocol inventory is independent of the implementation's CARD_TAGS.
  const required = ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt',
    'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'];
  assert.deepEqual([...CARD_TAGS], required);
  for (const key of required) {
    const drop = (html: string) => html.replace(new RegExp(`<meta (?:property|name)="${key}" content="[^"]*">`), '');
    for (const [where, edit] of [['token-bucket/burst.html', { share: drop }], ['token-bucket.html', { page: drop }]] as const) {
      const problems = await exported(edit);
      assert.ok(problems.includes(`${where}: 0 ${key} tags`), `${where} without ${key}: ${problems.join('; ')}`);
      assert.ok(problems.every((p) => p.startsWith(where + ':')), problems.join('; '));
    }
  }
  const undiscovered = (html: string) => html.replace(/<link rel="alternate" type="application\/json\+oembed" [^>]*>/, '');
  assert.deepEqual(await exported({ page: undiscovered }), ['token-bucket.html: 0 oEmbed links, not one to https://example.org/projects/rayner/token-bucket.oembed.json']);
  assert.deepEqual(await exported({ oembed: null }), ['token-bucket.html: token-bucket.oembed.json is missing']);
  assert.deepEqual(await exported({ oembed: '{"version":"1.0","type":"video"}' }), ['token-bucket.html: token-bucket.oembed.json is not a rich oEmbed 1.0 response with one iframe']);
  const unmarked = (html: string) => html.replace(/<meta name="rayner:share" content="[^"]*">/, '');
  assert.deepEqual(await exported({ page: unmarked }), ['token-bucket.html: rayner:share is not https://example.org/projects/rayner/token-bucket/']);
  const http = (html: string) => html.replaceAll('content="https://example.org/', 'content="http://example.org/');
  assert.ok((await exported({ share: http })).some((p) => /og:image http:\/\/example\.org\S+ is not an https URL/.test(p)));
  const elsewhere = (html: string) => html.replaceAll('https://example.org/', 'https://cdn.example.net/');
  assert.ok((await exported({ page: elsewhere })).some((p) => /twitter:image https:\/\/cdn\.example\.net\S+ is not an https URL under/.test(p)));
  assert.deepEqual(await exported({ picture: null }), [
    'token-bucket.html: https://example.org/projects/rayner/token-bucket/burst.png is missing',
    'token-bucket/burst.html: https://example.org/projects/rayner/token-bucket/burst.png is missing',
  ]);
  assert.deepEqual(await exported({ picture: png(960, 540) }), [
    'token-bucket.html: https://example.org/projects/rayner/token-bucket/burst.png is 960 × 540, not the declared 1080 × 540',
    'token-bucket/burst.html: https://example.org/projects/rayner/token-bucket/burst.png is 960 × 540, not the declared 1080 × 540',
  ]);
});

// player-tile T6: beside each exported page its known heights, and with an origin its oEmbed response.
test('site:export writes <id>.embed.json beside each page, and <id>.oembed.json only with an origin: a fixed 640 px rich response whose html is one iframe', async () => {
  const built = join(folder, 'built'), size = { schema: 1, aspect: '16/9', heights: { '390': 1100, '640': 1012, '900': 1180 } } as const;
  await mkdir(join(built, manifest.id), { recursive: true });
  await writeFile(join(built, manifest.id, 'embed.json'), JSON.stringify(size));
  await writeFile(join(built, manifest.id + '.png'), png(960, 540));
  for (const withOrigin of [false, true]) {
    const target = join(folder, withOrigin ? 'with-origin' : 'without-origin');
    await mkdir(target, { recursive: true });
    await writeEmbedFiles(target, built, manifest, withOrigin ? origin : undefined, path);
    assert.deepEqual(JSON.parse(await readFile(join(target, manifest.id + '.embed.json'), 'utf8')), size);
    const response = await readFile(join(target, manifest.id + '.oembed.json'), 'utf8').then((t) => JSON.parse(t), () => undefined);
    if (!withOrigin) {
      assert.equal(response, undefined, 'no oEmbed response without an origin');
      continue;
    }
    const { html, ...rest } = response;
    assert.deepEqual(rest, {
      version: '1.0', type: 'rich', provider_name: 'Rayner', provider_url: 'https://github.com/adewale/rayner', title: manifest.title,
      thumbnail_url: 'https://example.org/projects/rayner/token-bucket.png', thumbnail_width: 960, thumbnail_height: 540,
      width: 640, height: 1012, cache_age: 86400,
    });
    // The html parses to exactly one iframe with the snippet's attributes.
    const tags = [...(html as string).matchAll(/<(\w+)([^>]*)>/g)];
    assert.deepEqual(tags.map((t) => t[1]), ['iframe']);
    assert.ok((html as string).endsWith('</iframe>'));
    const attrs = Object.fromEntries([...tags[0]![2]!.matchAll(/ ([a-z]+)="([^"]*)"/g)].map((a) => [a[1], a[2]!.replaceAll('&amp;', '&')]));
    assert.deepEqual(attrs, {
      src: 'https://example.org/projects/rayner/token-bucket.html?theme=light', title: manifest.title, width: '640', height: '1012',
      style: 'border:0;border-radius:12px;display:block;max-width:100%', allow: 'fullscreen', loading: 'lazy',
    });
  }
});

test('a preview picture is the 16:9 still on a 2:1 canvas of the stage\'s paper colour', async () => {
  class Card extends Scene {
    override async construct() {
      stage(this);
      await this.step('one', { caption: 'A word.' });
      await this.play(new FadeIn(new Text('one')));
    }
  }
  const png = await cardPng(Card, 1);
  assert.deepEqual(pngSize(png), { width: CARD.width, height: CARD.height });
  // The bands are the paper's colour, as the still's own edge is: a 2:1 crop shows no seam.
  const { pixels } = await rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}"><image width="${CARD.width}" height="${CARD.height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>`);
  const at = (x: number, y: number) => [...pixels.subarray((y * CARD.width + x) * 4, (y * CARD.width + x) * 4 + 4)].join(',');
  const inside = (CARD.width - CARD.inner) / 2 + 2;
  assert.equal(at(2, 270), at(inside, 270));
  assert.equal(at(CARD.width - 3, 10), at(CARD.width - inside - 1, 10));
  assert.notEqual(at(2, 270), '26,26,26,255', 'the paper, not the fallback background');
});

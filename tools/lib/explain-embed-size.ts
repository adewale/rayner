// Known heights (specs/player-tile.md T6): each explainer's natural framed height at three widths, so
// a host can size its iframe before the page loads. Measured as the loader shows the page: in a frame
// whose parentOrigin is the host's, so --player-reserve is 0 and the page draws only the tile, the
// frame following the page's height. Default scenario, first step, transcript and steps rows closed.
import type { Browser } from 'playwright-core';

export const EMBED_WIDTHS = [390, 640, 900] as const;
export interface EmbedSize {
  schema: 1;
  aspect: '16/9';
  heights: Record<'390' | '640' | '900', number>;
}

/**
 * The least a framed page can be at `width`: the 16:9 stage, plus the stepper row (61 px). The header,
 * the words, the rows and the footer all add to it, so a measured height at or under it is wrong.
 */
export const embedFloor = (width: number) => (width * 9) / 16 + 61;

/** The problems with an embed.json's content, or none. */
export function embedSizeProblems(size: unknown): string[] {
  const s = size as Partial<EmbedSize> | null;
  if (!s || typeof s !== 'object') return ['not an object'];
  const problems: string[] = [];
  if (s.schema !== 1) problems.push(`schema ${JSON.stringify(s.schema)} is not 1`);
  if (s.aspect !== '16/9') problems.push(`aspect ${JSON.stringify(s.aspect)} is not 16/9`);
  const heights = (s.heights ?? {}) as Record<string, unknown>;
  if (Object.keys(heights).sort().join() !== EMBED_WIDTHS.map(String).sort().join()) problems.push(`heights are for ${Object.keys(heights).join(', ') || 'no widths'}, not ${EMBED_WIDTHS.join(', ')}`);
  for (const width of EMBED_WIDTHS) {
    const h = heights[width];
    if (!Number.isInteger(h) || (h as number) <= embedFloor(width)) problems.push(`height at ${width} is ${JSON.stringify(h)}, not an integer over ${embedFloor(width)}`);
  }
  return problems;
}

/** A host page that mounts `src` with the loader, as embed-lab.html does, at the page's full width. */
export const loaderHost = (loader: string, src: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:0}</style><div id="embed"></div><script src="${loader}" data-src="${src}" data-target="embed" data-title="Explainer"></script></html>`;

/**
 * The frame's settled height for the page at `src` (served on `origin`, with loader.js beside it) at
 * each width. The host page is answered on `origin` itself, so the frame's parentOrigin is exact.
 */
export async function measureEmbed(browser: Browser, origin: string, src: string): Promise<EmbedSize> {
  const heights = {} as EmbedSize['heights'];
  for (const width of EMBED_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce', colorScheme: 'light' });
    try {
      const page = await context.newPage();
      const hostUrl = `${origin}/__rayner-embed-host.html`;
      await page.route(hostUrl, (r) => r.fulfill({ contentType: 'text/html', body: loaderHost(`${origin}/loader.js`, `${origin}/${src}`) }));
      await page.goto(hostUrl);
      await page.waitForFunction(() => !!document.querySelector('iframe'));
      const frame = await (await page.locator('iframe').elementHandle())!.contentFrame();
      if (!frame) throw new Error(`${src}: no frame`);
      await frame.waitForSelector('#content[data-ready=true]');
      // Settled: the frame's height is the page's, and stays so across two animation frames.
      let last = -1;
      for (const until = Date.now() + 10_000; ; await page.waitForTimeout(100)) {
        const seen = await frame.evaluate(() => ({ scroll: document.documentElement.scrollHeight, content: Math.ceil(document.getElementById('content')!.getBoundingClientRect().height), height: innerHeight }));
        if (seen.height === seen.content && seen.scroll === seen.content && seen.content === last) {
          heights[String(width) as keyof EmbedSize['heights']] = seen.scroll;
          break;
        }
        last = seen.height === seen.content ? seen.content : -1;
        if (Date.now() > until) throw new Error(`${src} at ${width}: the frame did not settle (${JSON.stringify(seen)})`);
      }
    } finally {
      await context.close();
    }
  }
  return { schema: 1, aspect: '16/9', heights };
}

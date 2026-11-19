import type { Frame, Page } from 'playwright-core';
import { htmlEscape } from '../../explain/internal.ts';

const hosts = new WeakSet<Page>();

/** Open the actual loader and its iframe for a framed review, or the artifact directly. */
export async function openReviewReader(page: Page, url: string, framed = false): Promise<Frame> {
  if (!framed) {
    await page.goto(url);
    return page.mainFrame();
  }
  const host = new URL('/__rayner_review_host__', url);
  if (!hosts.has(page)) {
    await page.route('**/__rayner_review_host__?*', async route => {
      const source = new URL(route.request().url()).searchParams.get('source')!;
      const loader = new URL('loader.js', source).href;
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Explainer embed review</title><style>body{margin:0}</style><div id="explainer"></div><script src="${htmlEscape(loader)}" data-src="${htmlEscape(source)}" data-target="explainer" data-title="Reviewed explainer"></script></html>` });
    });
    hosts.add(page);
  }
  host.searchParams.set('source', url);
  await page.goto(host.href);
  const iframe = await page.waitForSelector('iframe');
  const reader = await iframe.contentFrame();
  if (!reader) throw new Error('review loader did not create an iframe');
  await reader.waitForSelector('[data-ready=true]');
  return reader;
}

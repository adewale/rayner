import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';

const options = { skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for Poppy reader history checks' };
const landed = (page: Page, log: readonly string[]) => page.waitForFunction(sent => {
  const row = document.querySelector<HTMLElement>('.live');
  return !!row && !row.hidden && row.dataset.drawn === sent && !document.querySelector('.stage[aria-busy], svg.leaving, #content.loading');
}, log.join(','));
const picture = (page: Page) => page.locator('.stage svg:not(.leaving)').evaluate(svg => svg.outerHTML);
const words = (page: Page) => page.locator('.described').textContent();

test('Poppy readers drive discovery through sign-out, reload their history and Reset in both approval scenarios', options, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-poppy-live-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    const project = await collectProject('scenes/explainers/poppy', { write: false });
    await buildExplainer(project, join(directory, 'poppy.html'));
    server = await serve(directory, 0, 'poppy.html');
    assert.deepEqual(project.scenarios.map(s => s.values.approve).sort(), ['read-only', 'read-write']);
    const history = ['discover', 'cart', 'browse', 'chat', 'exchange', 'sign-in', 'exchange', 'thief', 'sign-out'];
    for (const approve of ['read-write', 'read-only']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      try {
        await page.goto(`${server.url}/poppy.html?approve=${approve}&step=sign-out`);
        await landed(page, []);
        const authored = await picture(page), authoredWords = await words(page);
        assert.match(authoredWords ?? '', /revoked its refresh token/);
        assert.match(authoredWords ?? '', /cart holds the medium/);
        const discovery = page.locator('.live-events button[data-event="discover"]');
        assert.equal(await discovery.getAttribute('aria-disabled'), null, `${approve}: discovery is available from the first reader press`);
        assert.equal(await page.locator('.live-events button[data-event="cart"]').getAttribute('aria-disabled'), 'true', 'the reader has not discovered the endpoints yet');
        const sent: string[] = [];
        for (const event of history) {
          const button = page.locator(`.live-events button[data-event="${event}"]`);
          assert.equal(await button.getAttribute('aria-disabled'), null, `${approve}: ${event} is accepted after ${sent.join(',')}`);
          await button.click();
          sent.push(event);
          await landed(page, sent);
          assert.equal(new URL(page.url()).searchParams.get('sent'), sent.join(','));
          const said = await words(page) ?? '';
          if (sent.length === 1) {
            assert.match(said, /read the Company’s poppy.json/);
            assert.match(said, /Company knows nothing yet/);
          }
          if (sent.length === 5) assert.match(said, /answered 401, naming orders:write/);
          if (sent.length === 7) assert.match(said, approve === 'read-write' ? /answered 200/ : /answered 403 insufficient_scope, naming orders:write/);
        }
        assert.match(await words(page) ?? '', /account is signed out/);
        const driven = await picture(page), link = page.url();
        await page.reload();
        await landed(page, sent);
        assert.equal(page.url(), link);
        assert.equal(await picture(page), driven, 'reloading the reader history keeps its actual SVG picture');
        await page.getByRole('button', { name: 'Reset: the step’s own picture', exact: true }).click();
        await landed(page, []);
        assert.equal(new URL(page.url()).searchParams.has('sent'), false);
        assert.equal(await picture(page), authored, 'Reset restores the authored final picture');
        assert.equal(await words(page), authoredWords);
        assert.equal(await discovery.getAttribute('aria-disabled'), null, 'Reset lets the next history begin at discovery again');
        await discovery.click();
        await landed(page, ['discover']);
        assert.match(await words(page) ?? '', /Company knows nothing yet/);
      } finally { await page.close(); }
    }
  } finally {
    await browser.close(); server?.close(); await rm(directory, { recursive: true, force: true });
  }
});

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {webkit} from 'playwright-core';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectProject} from '../tools/lib/explain-project.ts';
import type {Project} from '../tools/lib/explain-project.ts';
import {buildExplainer, buildLoader} from '../tools/lib/explain-build.ts';
import {serve} from '../tools/lib/explain-serve.ts';
import {reviewStoryVariant} from '../tools/lib/explain-story-review.ts';
import {reviewClaims} from '../tools/lib/explain-review-scene.ts';

const names = ['mr-cache', 'token-bucket', 'oauth-pkce', 'font-metrics', 'melody-rhythm', 'periodic-groups'];
const projects = new Map<string, Project>();
let folder: string, server: Awaited<ReturnType<typeof serve>> | undefined;
const enabled = process.env.EXPLAIN_WEBKIT || process.env.EXPLAIN_SAFARI;
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'rayner-cross-browser-'));
  for (const name of names) {
    const project = await collectProject(`scenes/explainers/${name}`, {write: false});
    projects.set(name, project);
    await buildExplainer(project, join(folder, name + '.html'));
  }
  await buildLoader(join(folder, 'loader.js'));
  await writeFile(join(folder, 'host.html'), '<!doctype html><div id="reader"></div><script src="loader.js" data-src="mr-cache.html" data-target="reader" data-title="Cache"></script>');
  server = await serve(folder, 0, 'mr-cache.html');
});
after(async () => {
  server?.close();
  if (folder) await rm(folder, {recursive: true, force: true});
});

test('WebKit checks served paint for every case of the cache, rate, PKCE, requested-font, music and periodic-table journeys', {skip: !process.env.EXPLAIN_WEBKIT && 'set EXPLAIN_WEBKIT=1; install Playwright WebKit'}, async () => {
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    let cases = 0;
    const reviews = [];
    for (const [name, project] of projects) {
      const claims = await reviewClaims(project);
      for (const variant of project.variants) {
        reviews.push({id: name, settings: variant.values, steps: await reviewStoryVariant(page, `${server!.url}/${name}.html`, variant, claims)});
        cases++;
      }
    }
    assert.equal(cases, 17, 'exact case inventory: 2 cache, 3 rates, 2 PKCE, 1 face, 4 music, 5 periodic-table');
    await page.setViewportSize({width: 390, height: 667});
    await page.goto(server!.url + '/melody-rhythm.html');
    await page.waitForSelector('[data-ready=true]');
    assert.equal(await page.locator('.score-playhead').count(), 0);
    await page.getByRole('button', {name: 'Play A: even beats', exact: true}).tap();
    await page.waitForSelector('.score-playhead', {state: 'attached'});
    const playhead=await page.locator('.score-playhead').evaluate(node=>({height:(node as SVGGraphicsElement).getBBox().height,stroke:getComputedStyle(node).stroke,width:parseFloat(getComputedStyle(node).strokeWidth)}));
    assert.ok(playhead.height>0&&playhead.stroke!=='none'&&playhead.width>0);
    assert.equal(await page.evaluate(() => ['.stage', '.score-audio'].every(selector => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      return bounds.top >= -1 && bounds.bottom <= innerHeight + 1;
    })), true, 'WebKit keeps the complete score and sound controls on screen during playback');
    await page.getByRole('button', {name: 'Stop', exact: true}).tap();
    assert.equal(await page.locator('.score-playhead').count(), 0);
    await page.setViewportSize({width: 320, height: 844});
    await page.goto(server!.url + '/oauth-pkce.html?attacker=yes&step=attack');
    await page.waitForSelector('[data-ready=true]');
    assert.equal(await page.getByRole('button', {name: 'Next view', exact: true}).isVisible(), false);
    assert.equal(await page.locator('.view-help').isVisible(), false);
    await page.getByRole('button', {name: 'Next step', exact: true}).tap();
    await page.waitForFunction(() => document.querySelector('[aria-current=step]')?.getAttribute('data-step') === 'exchange');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await mkdir('out/validation', {recursive: true});
    await writeFile('out/validation/webkit.json', JSON.stringify({sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), browser: browser.version(), cases, reviews, errors, limitation: 'WebKit mobile emulation, not physical iPhone hardware.'}, null, 2) + '\n');
  } finally { await browser.close(); }
});

/** Safari's bundled W3C driver exercises the actual installed browser, not a renamed Chromium. */
class Safari {
  endpoint: string;
  session = '';
  constructor(port: number) { this.endpoint = `http://127.0.0.1:${port}`; }
  async command(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(this.endpoint + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const result = await response.json() as {value: {error?: string; message?: string}};
    assert.ok(response.ok && !result.value?.error, JSON.stringify(result.value));
    return result.value;
  }
  async execute<T>(script: string, args: unknown[] = []): Promise<T> {
    return await this.command(`/session/${this.session}/execute/sync`, {script, args}) as T;
  }
  async wait(script: string) {
    const end = Date.now() + 30_000;
    while (!await this.execute<boolean>(script)) {
      assert.ok(Date.now() < end, `Safari did not reach: ${script}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  async open(path: string) {
    await this.command(`/session/${this.session}/url`, {url: server!.url + path});
    await this.wait('return !!document.querySelector("[data-ready=true]")');
    await this.execute('window.__readyStep=null;document.addEventListener("rayner:step", e => { window.__readyStep=e.detail.step; })');
  }
  async click(selector: string) {
    const element = await this.command(`/session/${this.session}/element`, {using: 'css selector', value: selector}) as Record<string, string>;
    await this.command(`/session/${this.session}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  }
}

test('native macOS Safari runs the introduction, case changes, requested lettering and iframe reader', {skip: !process.env.EXPLAIN_SAFARI && 'set EXPLAIN_SAFARI=1 on macOS with safaridriver enabled'}, async () => {
  assert.equal(process.platform, 'darwin', 'this lane must run real Safari on Mac');
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = (reservation.address() as {port: number}).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const processDriver = spawn('/usr/bin/safaridriver', ['--port', String(port)], {stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  processDriver.stdout.on('data', d => { output += String(d); });
  processDriver.stderr.on('data', d => { output += String(d); });
  const driver = new Safari(port);
  try {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try { await driver.command('/status'); break; }
      catch { assert.ok(Date.now() < deadline, output || 'safaridriver startup timed out'); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const created = await driver.command('/session', {capabilities: {alwaysMatch: {browserName: 'safari'}}}) as {sessionId: string; capabilities: unknown};
    driver.session = created.sessionId;
    await driver.command(`/session/${driver.session}/window/rect`, {width: 1180, height: 900});
    await driver.open('/mr-cache.html');
    assert.equal(await driver.execute('return document.querySelector("[aria-current=step]").dataset.step'), 'reader-request');
    assert.equal(await driver.execute('return document.querySelector(".stepper .primary").disabled'), false);
    await driver.click('.stepper .primary');
    await driver.wait('return window.__readyStep==="reader-outcome"');
    // The source walkthrough remains reachable and follows source order after
    // being opened directly, in addition to the new default teaching path.
    await driver.open('/mr-cache.html?step=before');
    assert.equal(await driver.execute('return document.querySelector("[aria-current=step]").dataset.step'), 'before');
    await driver.click('.stepper .primary');
    await driver.wait('return window.__readyStep==="diff"');
    await driver.open('/mr-cache.html?request=hit&step=request');
    await driver.click('input[name=request][value=miss]');
    await driver.wait('return window.__readyStep==="request" && document.querySelector(".caption").textContent.startsWith("KV has no entry")');
    assert.equal(await driver.execute('return document.documentElement.scrollWidth>innerWidth'), false);
    await driver.open('/font-metrics.html?step=cuts');
    assert.equal(await driver.execute('return document.querySelectorAll(".stage path").length>=9'), true);
    assert.match(await driver.execute<string>('return document.querySelector(".described").textContent'), /EB Garamond/);
    await driver.open('/token-bucket.html?step=trace&rate=4');
    assert.match(await driver.execute<string>('return document.querySelector(".described").textContent'), /4 \/ s: R6 get 429/);
    await driver.open('/periodic-groups.html?element=cl&step=count');
    const periodic = await driver.execute<string>('return document.querySelector(".described").textContent');
    assert.match(periodic, /Al: 3, group 13/);
    assert.match(periodic, /Cl: 7, group 17/);
    assert.match(await driver.execute<string>('return document.querySelector(".caption").textContent'), /aluminium counts 3 in group 13/);
    await driver.open('/melody-rhythm.html');
    assert.equal(await driver.execute('return document.querySelectorAll(".score-playhead").length'), 0);
    await driver.click('.score-audio button[aria-label="Play A: even beats"]');
    await driver.wait('return !!document.querySelector(".score-playhead")');
    assert.equal(await driver.execute('return [".stage", ".score-audio"].every(selector => {const r=document.querySelector(selector).getBoundingClientRect();return r.top>=-1 && r.bottom<=innerHeight+1;})'), true,
      'Safari keeps the complete score and sound controls on screen during playback');
    await driver.click('.score-audio button:not([aria-label])');
    assert.equal(await driver.execute('return document.querySelectorAll(".score-playhead").length'), 0);
    await driver.command(`/session/${driver.session}/url`, {url: server!.url + '/host.html'});
    await driver.wait('return !!document.querySelector("iframe")');
    const frame = await driver.command(`/session/${driver.session}/element`, {using: 'css selector', value: 'iframe'});
    await driver.command(`/session/${driver.session}/frame`, {id: frame});
    await driver.wait('return !!document.querySelector("[data-ready=true]")');
    assert.equal(await driver.execute('return window.parent!==window'), true);
    await mkdir('out/validation', {recursive: true});
    await writeFile('out/validation/native-safari.json', JSON.stringify({sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), capabilities: created.capabilities, journeys: ['introduction', 'next', 'case-change', 'requested-face', 'rate-comparison', 'periodic-count', 'music-play-stop', 'iframe'], platform: process.platform}, null, 2) + '\n');
  } finally {
    if (driver.session) await fetch(`${driver.endpoint}/session/${driver.session}`, {method: 'DELETE'}).catch(() => {});
    processDriver.kill();
  }
});

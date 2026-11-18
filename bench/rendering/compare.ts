// Execute both fixed rendering adapters with the same inputs in one browser. No model judges.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platform, arch, loadavg, availableParallelism } from 'node:os';
import { PACKETS, cells, summary } from './shared.ts';
import { buildComparison, hash } from './build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch, chromiumUsed } from '../../tools/lib/browser.ts';

export async function compare(directory: string, repeats = 3) {
  assert.ok(Number.isInteger(repeats) && repeats >= 3, 'at least three balanced samples');
  const manifest = await buildComparison(directory);
  const manifestHash = hash(await readFile(join(directory, 'manifest.json')));
  const expected = JSON.parse(await readFile(join(directory, 'expected-paint.json'), 'utf8')) as Record<string, { paint: Record<string, string>[]; minLabelSize: number }>;
  const server = await serve(directory, 0, manifest.arms[0]!.file);
  const browser = await launch('controlled rendering comparison').catch((error) => { server.close(); throw error; });
  const browserInfo = chromiumUsed(browser);
  const rows: { topic: string; arm: string; case: string; step: string; width: number; minLabelPx: number }[] = [];
  const timing: { topic: string; arm: string; case: string; width: number; repeat: number; readyMs: number }[] = [];
  try {
    for (const [p, packet] of PACKETS.entries()) for (const [c, scenario] of packet.cases.entries()) for (const width of [390, 1180]) {
      // Alternate AB/BA, including which arm gets the first cold context for a topic/case.
      for (let repeat = 0; repeat < repeats; repeat++) {
        const arms = manifest.arms.filter((a) => a.topic === packet.id);
        if ((repeat + p + c) % 2) arms.reverse();
        for (const arm of arms) {
          assert.equal(hash(await readFile(join(directory, arm.file))), arm.artifactHash, 'measure the built bytes');
          const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          const page = await context.newPage();
          const errors: string[] = [], external: string[] = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.route('**/*', (route) => {
            if (new URL(route.request().url()).origin === server.url) return route.continue();
            external.push(route.request().url()); return route.abort();
          });
          await page.addInitScript(() => {
            document.addEventListener('rayner:step', (event) => {
              (window as unknown as { benchmarkReady: unknown }).benchmarkReady = (event as CustomEvent).detail;
            });
          });
          // Repetitions time first-load rendering only. Conformance visits every step on repeat 0.
          const steps = repeat === 0 ? scenario.steps : scenario.steps.slice(0, 1);
          for (const [i, step] of steps.entries()) {
            await page.goto(`${server.url}/${arm.file}?case=${scenario.id}&step=${step.id}`);
            await page.waitForFunction(({ step, selected }) => {
              const ready = (window as unknown as { benchmarkReady?: { step: string; settings: { case: string } } }).benchmarkReady;
              return ready?.step === step && ready.settings.case === selected;
            }, { step: step.id, selected: scenario.id });
            const readyMs = await page.evaluate(async (native) => {
              if (native) {
                const faces = await document.fonts.load('16px Shared');
                if (faces.length !== 1 || faces[0]!.status !== 'loaded') throw new Error('shared pinned font did not load');
              }
              await document.fonts.ready;
              await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
              return performance.now();
            }, arm.arm === 'native');
            if (i === 0) timing.push({ topic: packet.id, arm: arm.arm, case: scenario.id, width, repeat, readyMs });
            assert.equal((await page.locator('.caption').first().innerText()).trim(), step.caption);
            assert.deepEqual(errors, []); assert.deepEqual(external, []);
            if (repeat !== 0) continue;
            const svg = arm.arm === 'rayner' ? page.locator('.stage > svg').first() : page.locator('svg').first();
            if (arm.arm === 'native') {
              assert.deepEqual(await svg.locator('text').allTextContents(), [step.title, summary(step.state), ...cells(step.state).flatMap((x, n) => [x.label, String(n)])]);
            } else {
              const paths = await svg.locator('path').evaluateAll((paths) => paths.map((path) => Object.fromEntries([...path.attributes].map((a) => [a.name, a.value]))));
              assert.deepEqual(paths, expected[`${packet.id}/${scenario.id}/${step.id}`]!.paint, 'served Rayner paint equals the checked model drawing');
            }
            const minLabelPx = await svg.evaluate((node, args) => {
              const svg = node as SVGSVGElement;
              if (!args.native) {
                const m = svg.getScreenCTM()!;
                return args.size * 1000 * Math.hypot(m.c, m.d);
              }
              const frame = svg.getBoundingClientRect();
              return Math.min(...[...svg.querySelectorAll('text')].map((text) => {
                const style = getComputedStyle(text), box = text.getBoundingClientRect(), m = text.getScreenCTM()!;
                if (style.visibility !== 'visible' || +style.opacity < 0.95 || style.fill === 'none' || box.width <= 0 || box.height <= 0 || box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1) return 0;
                return parseFloat(style.fontSize) * Math.hypot(m.c, m.d);
              }));
            }, { native: arm.arm === 'native', size: expected[`${packet.id}/${scenario.id}/${step.id}`]!.minLabelSize });
            assert.ok(minLabelPx >= 12, `${packet.id}/${arm.arm}/${scenario.id}/${step.id}: ${minLabelPx}px`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page overflow');
            rows.push({ topic: packet.id, arm: arm.arm, case: scenario.id, step: step.id, width, minLabelPx });
            if (i === 0 || i === scenario.steps.length - 1)
              await page.screenshot({ path: join(directory, `${packet.id}-${arm.arm}-${scenario.id}-${step.id}-${width}.png`), fullPage: true });
          }
          await context.close();
        }
      }
    }
    const expectedRows = PACKETS.reduce((n, p) => n + p.cases.reduce((m, c) => m + c.steps.length * 4, 0), 0);
    assert.equal(rows.length, expectedRows, 'complete topic/case/step/arm/width inventory');
    assert.equal(timing.length, PACKETS.length * 2 * 2 * 2 * repeats);
    assert.equal(hash(await readFile(join(directory, 'manifest.json'))), manifestHash, 'manifest changed during browser measurement');
    const results = { version: 1, scope: manifest.scope, environment: { node: process.version, platform: platform(), arch: arch(), availableParallelism: availableParallelism(), loadAverage: loadavg(), browser: browserInfo }, repeats, manifestHash, inputHash: manifest.inputHash, rows, timing, artifacts: manifest.arms };
    await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    return results;
  } finally { try { await browser.close(); } finally { server.close(); } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? join(import.meta.dirname, '../../out/rendering-comparison'));
  const r = await compare(directory);
  console.log(JSON.stringify({ output: directory, checkedStates: r.rows.length, timingSamples: r.timing.length, artifacts: r.artifacts }, null, 2));
}

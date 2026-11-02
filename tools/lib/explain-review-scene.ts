import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { reviewCodeHash } from './explain-review-plan.ts';
import { buildExplainer, buildLoader } from './explain-build.ts';
import { checkProject } from './explain-check.ts';
import { buildInputs } from './build-inputs.ts';
import { ROOT, hash, loadScene } from './explain-project.ts';
import type { Project } from './explain-project.ts';
import { serve } from './explain-serve.ts';
import { launch } from './browser.ts';
import { reviewStoryVariant } from './explain-story-review.ts';
import type { StoryClaim } from './explain-story-review.ts';

/** Independent caption expectations belong beside the author's scene, outside its runtime. */
export async function reviewClaims(project: Project, file?: string): Promise<StoryClaim[]> {
  const path = file ? resolve(file) : project.file.replace(/\.[^.]+$/, '.review.json');
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (!file && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (raw === undefined) return [];
  const value = JSON.parse(raw);
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  assert.ok(object(value) && value.version === 1 && Array.isArray(value.claims), `${path}: expected { version: 1, claims: [...] }`);
  assert.ok(Object.keys(value).every(key => ['version', 'claims'].includes(key)), `${path}: unknown review field`);
  for (const claim of value.claims) {
    assert.ok(object(claim) && typeof claim.step === 'string' && claim.step.trim(), `${path}: a claim needs a step`);
    assert.ok(Object.keys(claim).every(key => ['step', 'settings', 'opening', 'targets'].includes(key)), `${path}: unknown claim field`);
    assert.ok(claim.opening === undefined || typeof claim.opening === 'boolean', `${path}: opening must be boolean`);
    assert.ok(claim.settings === undefined || (object(claim.settings) && Object.values(claim.settings).every(v => typeof v === 'string')), `${path}: settings must map names to values`);
    assert.ok(Array.isArray(claim.targets) && claim.targets.length, `${path}: a claim needs targets`);
    for (const target of claim.targets)
      assert.ok(object(target) && ((typeof target.key === 'string' && !!target.key.trim() && target.text === undefined) ||
        (typeof target.text === 'string' && !!target.text.trim() && target.key === undefined)) &&
        (target.paint === undefined || target.paint === 'stroke') && Object.keys(target).every(key => ['key', 'text', 'paint'].includes(key)), `${path}: targets need a key or text, with optional paint: "stroke"`);
    const applicable = project.variants.filter(v => Object.entries(claim.settings ?? {}).every(([key, value]) => v.values[key] === value));
    assert.ok(applicable.length, `${path}: claim settings select no case`);
    for (const variant of applicable)
      assert.ok(variant.trace.steps.some(s => s.step === claim.step), `${path}: ${claim.step} is missing from a selected case`);
  }
  return value.claims as StoryClaim[];
}

/** The same served-paint reviewer used by the catalog, for any installed author's scene. */
export async function reviewScene(project: Project, directory: string, claimsFile?: string, artifact?: string) {
  directory = resolve(directory);
  await mkdir(directory, { recursive: true });
  const receiptFile = join(directory, 'review.json');
  await rm(receiptFile, { force: true });
  const claims = await reviewClaims(project, claimsFile);
  const inputs = await buildInputs(ROOT);
  const reviewer = await reviewCodeHash(ROOT, inputs.hash);
  await checkProject(project, join(directory, 'checks'));
  const temporary = await mkdtemp(join(tmpdir(), 'rayner-review-'));
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const { receipt } = await buildExplainer(project, join(temporary, 'scene.html'));
    server = await serve(temporary, 0, 'scene.html');
    browser = await launch();
    const page = await browser.newPage();
    const errors: string[] = [], connections: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === server!.url) return route.continue();
      connections.push(route.request().url());
      return route.abort();
    });
    const results = [];
    try {
      for (const [index, variant] of project.variants.entries()) {
        const output = join(directory, String(index));
        await mkdir(output, { recursive: true });
        results.push({ settings: variant.values, steps: await reviewStoryVariant(page, server.url + '/scene.html', variant, claims, output) });
      }
      assert.deepEqual(errors, [], 'reader console errors');
      assert.deepEqual(connections, [], 'reader external connections');
    } catch (error) {
      await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {});
      await writeFile(join(directory, 'failure.json'), JSON.stringify({ error: String(error), errors, connections }, null, 2));
      throw error;
    }
    const after = await buildInputs(ROOT);
    assert.equal(after.hash, inputs.hash, 'build inputs changed during review');
    assert.equal(await reviewCodeHash(ROOT, after.hash), reviewer, 'review inputs changed during review');
    assert.equal((await loadScene(project.file)).sourceHash, project.sourceHash, 'scene changed during review');
    assert.deepEqual(await reviewClaims(project, claimsFile), claims, 'caption claims changed during review');
    const retained = resolve(artifact ?? join(directory, 'scene.html'));
    await mkdir(dirname(retained), { recursive: true });
    for (const suffix of ['', '.headers.json', '.receipt.json'])
      await copyFile(join(temporary, 'scene.html' + suffix), retained + suffix);
    assert.equal(hash(await readFile(retained)), receipt.artifactHash, 'retain the exact reviewed page');
    await buildLoader(join(dirname(retained), 'loader.js'));
    const report = {
      version: 1, scene: project.Scene.meta?.id ?? 'scene', sourceHash: project.sourceHash,
      buildHash: inputs.hash, reviewCodeHash: reviewer, artifact: retained, artifactHash: receipt.artifactHash, claimsHash: hash(JSON.stringify(claims)),
      cases: results.length, stepWidths: results.reduce((n, c) => n + c.steps.length, 0), results,
      consoleErrors: errors, runtimeConnections: connections,
    };
    await rm(join(directory, 'failure.json'), { force: true });
    await rm(join(directory, 'failure.png'), { force: true });
    await writeFile(receiptFile, JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    await browser?.close();
    server?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

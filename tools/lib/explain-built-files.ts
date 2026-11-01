// Byte pins for the built files site:export consumes. Source-input pins alone cannot detect
// a changed HTML page or picture in out/explainers after demos:build finished.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const rootFiles = ['loader.js', 'index.html', 'catalog.json', 'evidence.json'];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function outputNames(dir: string, ids: readonly string[], collection: boolean): Promise<string[]> {
  const paths = [...rootFiles, ...(collection ? ['embed-lab.html'] : [])];
  for (const id of ids) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid explainer id: ${id}`);
    paths.push(`${id}.html`, `${id}.html.headers.json`, `${id}.png`, `${id}/inputs.json`, `${id}/describe.json`, `${id}/steps.json`, `${id}/embed.json`);
    const share = JSON.parse(await readFile(join(dir, id, 'steps.json'), 'utf8')) as { steps: { step: string }[] };
    if (!Array.isArray(share.steps)) throw new Error(`Invalid ${id}/steps.json`);
    for (const { step } of share.steps) {
      if (!/^[A-Za-z0-9_-]+$/.test(step)) throw new Error(`Invalid shared step: ${id}/${step}`);
      // Step cards are produced in the isolated export, not the checked collection.
    }
  }
  return paths.sort();
}

export async function builtOutputHashes(dir: string, ids: readonly string[], collection = true): Promise<Record<string, string>> {
  const pins: Record<string, string> = {};
  for (const path of await outputNames(dir, ids, collection)) pins[path] = digest(await readFile(join(dir, path)));
  return pins;
}

export async function checkBuiltOutput(dir: string, ids: readonly string[], { collection = true, subset = false } = {}): Promise<void> {
  const file = join(dir, 'output-hashes.json');
  const expected = JSON.parse(await readFile(file, 'utf8').catch(error => {
    if (error.code === 'ENOENT') throw new Error(`${file} is missing: run npm run demos:build`);
    throw error;
  })) as Record<string, string>;
  const names = await outputNames(dir, ids, collection);
  if (!subset && Object.keys(expected).sort().join('\n') !== names.join('\n')) throw new Error('Built output manifest differs from catalog');
  for (const path of names) {
    if (digest(await readFile(join(dir, path))) !== expected[path]) throw new Error(`Built output changed: ${path}; run npm run demos:build`);
  }
}

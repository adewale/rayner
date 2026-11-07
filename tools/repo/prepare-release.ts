#!/usr/bin/env node
// Retain the exact archives installed by the package gate; this command never publishes.
// Rayner is two packages from this repository: rayner (the library) and rayner-cli (the command).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { ROOT } from '../lib/explain-project.ts';
import { integrity as integrityOf } from '../lib/hash.ts';

const run = promisify(execFile);
const sourceCommit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
const dirtyBefore = !!(await run('git', ['status', '--porcelain'], { cwd: ROOT })).stdout.trim();
const directory = join(ROOT, 'out/release');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
type Packed = { name: string; version: string; filename: string; integrity: string; shasum: string; size: number; unpackedSize: number; files: { path: string }[] };
const packages: Packed[] = [];
// npm pack runs each package's prepack: build:lib for rayner, tools/repo/build-cli.ts for rayner-cli.
for (const [name, folder] of [['rayner', '.'], ['rayner-cli', 'cli']] as const) {
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', directory], { cwd: join(ROOT, folder), maxBuffer: 4 * 1024 * 1024 });
  const [packed] = JSON.parse(stdout) as Packed[];
  assert.ok(packed);
  assert.equal(packed.name, name);
  assert.equal(basename(packed.filename), packed.filename);
  packages.push(packed);
}
const [library, command] = packages as [Packed, Packed];
assert.equal(command.version, library.version, 'rayner and rayner-cli share one version');
const integrity = async (packed: Packed) => integrityOf(await readFile(join(directory, packed.filename)));
for (const packed of packages) assert.equal(await integrity(packed), packed.integrity);
const result = await run(process.execPath, [join(ROOT, 'tools/repo/explain-package-smoke.ts'), '--archive', join(directory, library.filename), '--cli-archive', join(directory, command.filename)], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout);
for (const packed of packages) assert.equal(await integrity(packed), packed.integrity, `the tested ${packed.name} archive was modified`);
assert.equal((await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim(), sourceCommit, 'source commit changed during validation');
const dirty = dirtyBefore || !!(await run('git', ['status', '--porcelain'], { cwd: ROOT })).stdout.trim();
await writeFile(join(directory, 'manifest.json'), JSON.stringify({
  version: library.version, sourceCommit, dirty,
  node: process.version,
  gates: { package: true, browser: !!process.env.EXPLAIN_BROWSER, letteringCapture: process.env.EXPLAIN_LETTERING === '1' },
  packages: packages.map((packed) => ({
    name: packed.name, filename: packed.filename,
    integrity: packed.integrity, shasum: packed.shasum, size: packed.size, unpackedSize: packed.unpackedSize,
    files: packed.files.map((file) => file.path),
  })),
}, null, 2) + '\n');
for (const packed of packages) console.log(`Tested ${packed.name} archive retained at ${join(directory, packed.filename)}; integrity ${packed.integrity}`);

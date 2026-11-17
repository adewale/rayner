#!/usr/bin/env node
// Retain the exact archive installed by the package gate; this command never publishes.
// Rayner is one package, rayner: the library and the command, built by its prepack.
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
// npm pack runs prepack, `npm run build`: the library (build:lib), then the command (build:command).
const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', directory], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
const [packed] = JSON.parse(stdout) as Packed[];
assert.ok(packed);
assert.equal(packed.name, 'rayner');
assert.equal(basename(packed.filename), packed.filename);
const archive = join(directory, packed.filename);
const integrity = async () => integrityOf(await readFile(archive));
assert.equal(await integrity(), packed.integrity);
const result = await run(process.execPath, [join(ROOT, 'tools/repo/explain-package-smoke.ts'), '--archive', archive], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout);
assert.equal(await integrity(), packed.integrity, 'the tested archive was modified');
assert.equal((await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim(), sourceCommit, 'source commit changed during validation');
const dirty = dirtyBefore || !!(await run('git', ['status', '--porcelain'], { cwd: ROOT })).stdout.trim();
await writeFile(join(directory, 'manifest.json'), JSON.stringify({
  name: packed.name, version: packed.version, filename: packed.filename, sourceCommit, dirty,
  integrity: packed.integrity, shasum: packed.shasum, size: packed.size, unpackedSize: packed.unpackedSize,
  node: process.version,
  gates: { package: true, browser: !!process.env.EXPLAIN_BROWSER, letteringCapture: process.env.EXPLAIN_LETTERING === '1' },
  files: packed.files.map((file) => file.path),
}, null, 2) + '\n');
console.log(`Tested archive retained at ${archive}; integrity ${packed.integrity}`);

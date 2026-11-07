#!/usr/bin/env node
// Called only by the protected npm-publish job after the reusable CI workflow succeeds.
// Publishes the two tested archives, rayner then rayner-cli (which depends on it), at one version.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import assert from 'node:assert/strict';

const directory = 'out/release';
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'publish only from GitHub Actions');
assert.equal(process.env.GITHUB_REPOSITORY, 'adewale/rayner', 'publish only from the Rayner repository');
assert.ok(Array.isArray(manifest.packages), 'the manifest lists the tested packages');
assert.deepEqual(manifest.packages.map((p: { name: string }) => p.name), ['rayner', 'rayner-cli'], 'publish rayner and rayner-cli, in that order');
assert.equal(process.env.GITHUB_REF, `refs/tags/v${manifest.version}`, 'publish only the matching version tag');
assert.equal(manifest.sourceCommit, process.env.GITHUB_SHA, 'the archives must match the tagged source');
assert.equal(manifest.dirty, false, 'release archives must come from a clean checkout');
assert.ok(manifest.gates.package && manifest.gates.browser && manifest.gates.letteringCapture, 'package, browser and lettering-capture gates must pass');
assert.ok(['next', 'latest'].includes(process.env.NPM_DIST_TAG ?? ''), 'choose npm dist-tag next or latest');
const packages = manifest.packages as { name: string; filename: string; integrity: string }[];
for (const p of packages) {
  assert.equal(basename(p.filename), p.filename);
  assert.equal('sha512-' + createHash('sha512').update(await readFile(join(directory, p.filename))).digest('base64'), p.integrity, `the ${p.name} archive changed after validation`);
}
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim().split('.').map(Number);
assert.ok(npmVersion[0]! > 11 || npmVersion[0] === 11 && (npmVersion[1]! > 5 || npmVersion[1] === 5 && npmVersion[2]! >= 1), 'trusted publishing requires npm >=11.5.1');
const registryUrl = (name: string) => `https://registry.npmjs.org/${name}/${encodeURIComponent(manifest.version)}`;
for (const p of packages) assert.equal((await fetch(registryUrl(p.name))).status, 404, `the npm version of ${p.name} must be unpublished`);
const tag = `v${manifest.version}`;
const validation = ['browser-review.json', 'page-budgets.json', 'native-safari.json', 'webkit.json'].map(name => join(directory, 'validation', name));
for (const file of validation) {
  const report = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(report.sourceCommit, manifest.sourceCommit, `${file}: validation must match the tagged source`);
}
const notes = join(directory, 'release-notes.md');
const changelog = await readFile('CHANGELOG.md', 'utf8');
const section = changelog.split(/^## /m).find(part => part.startsWith(manifest.version + ' '));
assert.ok(section, 'the version needs a changelog entry');
assert.match(section.split('\n')[0]!, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? \(\d{4}-\d{2}-\d{2}\)$/, 'date the changelog before tagging');
await writeFile(notes, section.slice(section.indexOf('\n') + 1).trim() + '\n\nThe attached archives, rayner and rayner-cli, are the exact tarballs tested by CI and published to npm. Their manifest records source, integrity and validation gates.\n');
const archives = packages.map(p => join(directory, p.filename));
// Persist the reviewed bytes before npm publication. A failed publication leaves
// a draft for inspection; an existing tag's release assets are never overwritten.
execFileSync('gh', ['release', 'create', tag, ...archives, join(directory, 'manifest.json'), ...validation, '--verify-tag', '--draft', '--title', `Rayner ${manifest.version}`, '--notes-file', notes], {stdio: 'inherit'});
// The library first: rayner-cli depends on rayner at exactly this version.
for (const [i, p] of packages.entries()) {
  execFileSync('npm', ['publish', archives[i]!, '--tag', process.env.NPM_DIST_TAG!], { stdio: 'inherit' });
  let published: {dist?: {integrity?: string}} | undefined;
  const deadline = Date.now() + 30_000;
  do {
    const response = await fetch(registryUrl(p.name));
    if (response.ok) { published = await response.json() as typeof published; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  assert.equal(published?.dist?.integrity, p.integrity, `npm must serve the tested ${p.name} bytes before the release becomes public`);
}
execFileSync('gh', ['release', 'edit', tag, '--draft=false'], {stdio: 'inherit'});

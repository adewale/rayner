// Retrospectively validate and preserve an already-public npm version. This
// command never publishes npm bytes or moves a tag. Run by the manual archive job.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename, join, resolve} from 'node:path';

const version = process.env.ARCHIVE_VERSION ?? '';
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, 'adewale/rayner');
const source = resolve(process.env.ARCHIVE_SOURCE ?? '.');
const run = (command: string, args: string[]) => execFileSync(command, args, {cwd: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
const tag = `v${version}`;
const sourceCommit = run('git', ['rev-parse', 'HEAD']).trim();
assert.equal(run('git', ['rev-parse', `${tag}^{commit}`]).trim(), sourceCommit);
assert.equal(run('git', ['status', '--porcelain']).trim(), '');
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'rayner'); assert.equal(pkg.version, version);
// From 0.2.0 a version is two packages, rayner and rayner-cli (cli/package.json); before, rayner alone.
const split = existsSync(join(source, 'cli/package.json'));
if (split) {
  const cli = JSON.parse(await readFile(join(source, 'cli/package.json'), 'utf8'));
  assert.equal(cli.name, 'rayner-cli'); assert.equal(cli.version, version);
}
const names = split ? ['rayner', 'rayner-cli'] : ['rayner'];
const directory = join(source, 'out/published-release');
await mkdir(directory, {recursive: true});
const archives: {name: string; filename: string; archive: string; integrity: string; registry: unknown}[] = [];
for (const name of names) {
  const registry = JSON.parse(run('npm', ['view', `${name}@${version}`, 'dist', '--json']));
  const [packed] = JSON.parse(run('npm', ['pack', `${name}@${version}`, '--ignore-scripts', '--json', '--pack-destination', directory]));
  assert.equal(basename(packed.filename), packed.filename);
  const archive = join(directory, packed.filename);
  const integrity = 'sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64');
  assert.equal(integrity, registry.integrity, `retain the original npm bytes of ${name}`);
  archives.push({name, filename: packed.filename, archive, integrity, registry});
}
// The tagged source's own gate: tools/repo/ from 0.2.0, tools/ before.
const smoke = ['tools/repo/explain-package-smoke.ts', 'tools/explain-package-smoke.ts'].map(file => join(source, file)).find(file => existsSync(file));
assert.ok(smoke, 'the tagged source has no package smoke');
const output = run(process.execPath, [smoke, '--archive', archives[0]!.archive, ...(split ? ['--cli-archive', archives[1]!.archive] : [])]);
process.stdout.write(output);
for (const a of archives) assert.equal('sha512-' + createHash('sha512').update(await readFile(a.archive)).digest('base64'), a.integrity);
assert.equal(run('git', ['status', '--porcelain']).trim(), '');
const validationLog = join(directory, 'package-validation.log');
await writeFile(validationLog, output);
const manifest = join(directory, 'published-manifest.json');
await writeFile(manifest, JSON.stringify({
  version, tag, taggedSourceCommit: sourceCommit,
  packages: archives.map(({name, filename, integrity, registry}) => ({name, filename, integrity, registry})),
  node: process.version, validatedAt: new Date().toISOString(),
  validationTiming: 'Retrospective validation of the public npm archives, after publication; not original publication provenance.',
  validationGates: {package: true, browser: process.env.EXPLAIN_BROWSER === '1', letteringCapture: process.env.EXPLAIN_LETTERING === '1'},
  workflow: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
}, null, 2) + '\n');
assert.equal(process.env.EXPLAIN_BROWSER, '1'); assert.equal(process.env.EXPLAIN_LETTERING, '1');
const notes = join(directory, 'release-notes.md');
await writeFile(notes, `Rayner ${version}: TypeScript models become reader-paced technical explainers. Install with \`npm install --save-dev ${names.map(name => `${name}@${version}`).join(' ')}\`.\n\nThe ${split ? 'archives attached here are the exact public npm tarballs' : 'archive attached here is the exact public npm tarball'}, verified against ${split ? 'their' : 'its'} registry SHA-512. The manifest and log record retrospective installed-package, browser and lettering-capture validation. They do not claim original publishing-workflow provenance. The existing tag and npm bytes are preserved.\n\n[Examples](https://oshineye.dev/projects/rayner) · [Tutorial](https://github.com/adewale/rayner/blob/${tag}/docs/TUTORIAL.md)\n`);
// The tag endpoint can omit drafts. Inspect every page, including drafts, before
// deciding whether creation is safe. Upload/edit resolve by tag, so ambiguity
// must refuse rather than risk modifying a different release record.
type Release = {id: number; tag_name: string; draft: boolean; assets: unknown[]};
const matchingRelease = (): Release | undefined => {
  const lines = run('gh', ['api', '--paginate', '--jq', '.[] | @json', 'repos/adewale/rayner/releases?per_page=100']).trim();
  const releases = lines ? lines.split('\n').map(line => JSON.parse(line) as Release) : [];
  for (const release of releases) assert.ok(Number.isSafeInteger(release.id) && typeof release.tag_name === 'string' && typeof release.draft === 'boolean' && Array.isArray(release.assets), 'invalid release list response');
  const matches = releases.filter(release => release.tag_name === tag);
  assert.ok(matches.length <= 1, `multiple release records match ${tag}; resolve the duplicate records before archiving`);
  const release = matches[0];
  if (release) {
    assert.equal(release.draft, true, 'do not alter an existing public release');
    assert.equal(release.assets.length, 0, 'do not overwrite previously retained release evidence');
  }
  return release;
};
let release = matchingRelease();
if (!release) {
  run('gh', ['release', 'create', tag, '--verify-tag', '--draft', '--title', `Rayner ${version}`, '--notes-file', notes]);
  release = matchingRelease();
  assert.ok(release, 'created draft must be uniquely visible in the complete release list before uploading');
}
run('gh', ['release', 'upload', tag, ...archives.map(a => a.archive), manifest, validationLog]);
run('gh', ['release', 'edit', tag, '--draft=false', '--notes-file', notes, '--title', `Rayner ${version}`]);
console.log(`Preserved and published the release record for ${tag}`);

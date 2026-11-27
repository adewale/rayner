// The dated motion audits left the source tree but stay in its history (docs/evidence/README.md), at
// the last commit of #115 that carried them, which main reaches through that pull request's merge.
// The tree keeps one Git object hash per bundle in docs/evidence/archive.json: these tests hold that
// commit to those hashes, the index to the manifest, and the archive's corrections to the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
interface Unpushed { file: string; cites: string; note: string; repository: string[] }
interface Bundle { name: string; type: 'tree' | 'blob'; hash: string; title: string; unpushedCommits?: Unpushed[] }
const manifest = JSON.parse(readFileSync(join(ROOT, 'docs/evidence/archive.json'), 'utf8')) as {
  repository: string; commit: string; pullRequest: number; bundles: Bundle[];
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const resolves = (rev: string) => { try { git('cat-file', '-e', rev); return true; } catch { return false; } };
const shallow = git('rev-parse', '--is-shallow-repository') === 'true';
const SHALLOW = shallow && 'a shallow clone does not hold the archive commit; CI checks out full history (fetch-depth: 0)';

test('the archive commit is in the history of this checkout, so no branch is needed to keep it', { skip: SHALLOW }, () => {
  assert.ok(resolves(`${manifest.commit}^{commit}`), `the archive commit ${manifest.commit} is not in this clone`);
  assert.doesNotThrow(() => git('merge-base', '--is-ancestor', manifest.commit, 'HEAD'), `${manifest.commit} is not an ancestor of HEAD; it must stay reachable from main`);
});

test('every entry archived from docs/evidence is recorded, each with its Git object hash at the archive commit', { skip: SHALLOW }, () => {
  const archived = git('ls-tree', manifest.commit, 'docs/evidence/').split('\n').map((line) => {
    const [meta, path] = line.split('\t') as [string, string];
    const [, type, hash] = meta.split(' ');
    return { name: path.replace('docs/evidence/', ''), type, hash };
  });
  // What was there and is no longer in the source tree is what the archive holds.
  const gone = archived.filter(({ name }) => !existsSync(join(ROOT, 'docs/evidence', name)));
  assert.deepEqual(gone, manifest.bundles.map(({ name, type, hash }) => ({ name, type, hash })));
});

test('archived bundles stay out of the source tree, and the index links each at the archive commit', () => {
  const index = readFileSync(join(ROOT, 'docs/evidence/README.md'), 'utf8');
  for (const { name } of manifest.bundles) {
    assert.ok(!existsSync(join(ROOT, 'docs/evidence', name)), `docs/evidence/${name} is archived in history; do not commit it to the source tree again`);
    assert.ok(index.includes(`(https://github.com/${manifest.repository}/tree/${manifest.commit}/docs/evidence/${name})`), `docs/evidence/README.md does not link ${name} at ${manifest.commit}`);
  }
});

test('each correction names a citation the archive really makes, of a commit that is still absent, and repository commits that exist', { skip: SHALLOW }, () => {
  const index = readFileSync(join(ROOT, 'docs/evidence/README.md'), 'utf8');
  for (const bundle of manifest.bundles)
    for (const n of bundle.unpushedCommits ?? []) {
      const where = `${bundle.name}/${n.file}`;
      assert.ok(git('show', `${manifest.commit}:docs/evidence/${where}`).includes(n.cites), `${where} does not cite ${n.cites}`);
      // If the commit is ever pushed, the correction is stale: drop it and cite the commit.
      assert.ok(!resolves(`${n.cites}^{commit}`), `${n.cites} is now in the repository; remove the note on ${where}`);
      for (const sha of n.repository) assert.ok(resolves(`${sha}^{commit}`), `${where}: the note names ${sha}, which is not a commit here`);
      assert.ok(index.includes(`\`${where}\` cites \`${n.cites.slice(0, 8)}\``), `docs/evidence/README.md does not carry the note on ${where}`);
    }
});

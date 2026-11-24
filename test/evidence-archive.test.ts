// The dated motion audits live on the evidence branch, not in the source tree (docs/evidence/README.md).
// The tree keeps one Git object hash per bundle in docs/evidence/archive.json: these tests hold the
// branch to those hashes, the index to the manifest, and the archive's corrections to the repository.
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
  repository: string; branch: string; commit: string; movedFrom: { commit: string; pullRequest: number }; bundles: Bundle[];
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const resolves = (rev: string) => { try { git('cat-file', '-e', rev); return true; } catch { return false; } };
const fetchHint = `run: git fetch origin ${manifest.branch}`;

test('the evidence commit holds exactly the recorded bundles, each with its recorded Git object hash', () => {
  assert.ok(resolves(`${manifest.commit}^{commit}`), `the evidence commit ${manifest.commit} is not in this clone; ${fetchHint}`);
  const archived = git('ls-tree', manifest.commit, 'docs/evidence/').split('\n').map((line) => {
    const [meta, path] = line.split('\t') as [string, string];
    const [, type, hash] = meta.split(' ');
    return { name: path.replace('docs/evidence/', ''), type, hash };
  });
  assert.deepEqual(archived, manifest.bundles.map(({ name, type, hash }) => ({ name, type, hash })));
});

test('the evidence branch only grows: the recorded commit is on it', () => {
  const ref = `refs/remotes/origin/${manifest.branch}`;
  assert.ok(resolves(ref), `origin/${manifest.branch} is not in this clone; ${fetchHint}`);
  // A rewritten or force-pushed archive would leave the recorded commit off the branch.
  assert.doesNotThrow(() => git('merge-base', '--is-ancestor', manifest.commit, ref), `${manifest.commit} is not on origin/${manifest.branch}`);
});

test('archived bundles stay out of the source tree, and the index links each at the archived commit', () => {
  const index = readFileSync(join(ROOT, 'docs/evidence/README.md'), 'utf8');
  for (const { name } of manifest.bundles) {
    assert.ok(!existsSync(join(ROOT, 'docs/evidence', name)), `docs/evidence/${name} is archived on the ${manifest.branch} branch; do not commit it to the source tree`);
    assert.ok(index.includes(`(https://github.com/${manifest.repository}/tree/${manifest.commit}/docs/evidence/${name})`), `docs/evidence/README.md does not link ${name} at ${manifest.commit}`);
  }
});

test('each correction names a citation the archive really makes, of a commit that is still absent, and repository commits that exist', () => {
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

// Living docs cite only commits a clone of this repository can resolve, and permalinks only paths
// that exist at their commit. A cited commit outside main's history must be kept by a provenance/*
// tag, so pruning any branch cannot lose it. A commit made in a throwaway worktree and never pushed is a citation
// nobody can check; history kept elsewhere (another repository, a seed) is declared below instead.
// Archived records are not living docs: their own corrections live in docs/evidence/archive.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const resolves = (rev: string) => { try { git('cat-file', '-e', rev); return true; } catch { return false; } };
const shallow = git('rev-parse', '--is-shallow-repository') === 'true';
const SHALLOW = shallow && 'a shallow clone cannot resolve older commits; CI checks out full history (fetch-depth: 0)';

const markdown = (dir: string, deep = false): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (deep ? markdown(join(dir, e.name), true) : []) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);
const LIVING = ['README.md', 'CHANGELOG.md', 'docs/evidence/README.md', ...markdown('docs'), ...markdown('specs'), ...markdown('skills', true)];

/** Hex in backticks that is not a commit of this repository, and what it is. */
const FOREIGN: Record<string, string> = {
  '4904cfa': "a commit of a Lantern checkout's agentic-mermaid branch (specs/rayner.md)",
  'e011177': 'a commit of kitlangton/2password (specs/rayner.md)',
  '6398654': "the glyph typesetter's commit (docs/REFERENCE.md)",
  '698884227': 'a property-test seed (docs/TESTING.md)',
  'd65fd1d': 'a commit of ivarvong/lantern (docs/UPSTREAM.md)',
};
const archive = JSON.parse(readFileSync(join(ROOT, 'docs/evidence/archive.json'), 'utf8')) as { bundles: { unpushedCommits?: { cites: string }[] }[] };
const UNPUSHED = archive.bundles.flatMap((b) => (b.unpushedCommits ?? []).map((n) => n.cites));
const declared = (sha: string) => Object.hasOwn(FOREIGN, sha) || UNPUSHED.some((u) => u.startsWith(sha) || sha.startsWith(u));

const PERMALINK = /github\.com\/adewale\/rayner\/(?:blob|tree|commit)\/([0-9a-f]{7,40})(?:\/([^)\s#?"'`]*))?/g;
const citations = () => LIVING.flatMap((file) => {
  const text = readFileSync(join(ROOT, file), 'utf8');
  return [
    ...[...text.matchAll(/`([0-9a-f]{7,40})`/g)].map((m) => ({ file, sha: m[1]!, path: undefined as string | undefined })),
    ...[...text.matchAll(PERMALINK)].map((m) => ({ file, sha: m[1]!, path: m[2] ? decodeURIComponent(m[2]) : undefined })),
  ];
});

test('every commit of this repository a living doc cites resolves in this clone', { skip: SHALLOW }, () => {
  const missing = citations().filter(({ sha }) => !declared(sha) && !resolves(`${sha}^{commit}`)).map(({ file, sha }) => `${file}: ${sha}`);
  assert.deepEqual([...new Set(missing)], [], 'push the commit, cite one that exists, or, for another repository\'s history, declare it in FOREIGN');
});

test('every permalink into this repository names a path that exists at its commit', { skip: SHALLOW }, () => {
  const broken = citations().filter(({ sha, path }) => path && resolves(`${sha}^{commit}`) && !resolves(`${sha}:${path.replace(/\/$/, '')}`))
    .map(({ file, sha, path }) => `${file}: ${sha}/${path}`);
  assert.deepEqual([...new Set(broken)], []);
});

test('each declared foreign reference is still cited, and is not a commit of this repository', { skip: SHALLOW }, () => {
  const cited = new Set(citations().map((c) => c.sha));
  for (const [sha, what] of Object.entries(FOREIGN)) {
    assert.ok(cited.has(sha), `${sha} (${what}) is no longer cited; remove it from FOREIGN`);
    assert.ok(!resolves(`${sha}^{commit}`), `${sha} resolves here, so it is not foreign; remove it from FOREIGN`);
  }
});

test('every motion-corpus entry names the fix commit it reverts, and that commit resolves', { skip: SHALLOW }, async () => {
  const { CORPUS } = await import('./fixtures/motion-corpus/corpus.ts');
  const missing = [...new Set(CORPUS.map((e) => e.commit))].filter((sha) => !resolves(`${sha}^{commit}`));
  assert.deepEqual(missing, [], 'a corpus entry cites a fix commit this clone cannot resolve (its branch, claude/focused-newton-s7zxou, must stay)');
});

const inHistory = (sha: string) => { try { git('merge-base', '--is-ancestor', sha, 'HEAD'); return true; } catch { return false; } };
const tagged = (sha: string) => git('for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/tags/provenance/') !== '';

test('every cited commit outside main\'s history is kept by a provenance tag, so any branch can be pruned', { skip: SHALLOW }, async () => {
  const { CORPUS } = await import('./fixtures/motion-corpus/corpus.ts');
  const cited = new Set([...citations().map((c) => c.sha).filter((sha) => !declared(sha)), ...CORPUS.map((e) => e.commit)]);
  const unkept = [...cited].filter((sha) => resolves(`${sha}^{commit}`) && !inHistory(sha) && !tagged(sha));
  assert.deepEqual(unkept, [], 'tag each so pruning branches cannot lose it: git tag -a provenance/<first 8 hex> <sha> -m "<why it is cited>" && git push origin refs/tags/provenance/<first 8 hex>');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repo, AUTHOR } from '../scenes/explainers/exgit/model.ts';
import { secondCommit, type Change } from '../scenes/explainers/exgit/objects.ts';

/** A throwaway Git repository whose commits have exactly the model's author, committer and dates. */
function cli() {
  const dir = mkdtempSync(join(tmpdir(), 'exgit-'));
  const [, name, email, when, zone] = /^(\S+) <(.+)> (\d+) ([+-]\d{4})$/.exec(AUTHOR)!;
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: `${when} ${zone}`,
    GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: `${when} ${zone}`,
  };
  const git = (...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, env, encoding: 'utf8' }).trim();
  const objects = () => new Set(git('cat-file', '--batch-all-objects', '--batch-check=%(objectname)').split('\n').filter(Boolean));
  git('init', '-q', '-b', 'main');
  return { dir, git, objects, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const CHANGES: Change[] = ['add', 'edit', 'rename', 'copy'];

test('Git writes only the objects whose bytes are new: the Git CLI’s second commit writes the model’s objects', () => {
  for (const change of CHANGES) {
    const { dir, git, objects, done } = cli();
    try {
      writeFileSync(join(dir, 'hello.txt'), 'hello\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'first');
      const before = objects();
      if (change === 'add') writeFileSync(join(dir, 'world.txt'), 'world\n');
      if (change === 'edit') writeFileSync(join(dir, 'hello.txt'), 'hello again\n');
      if (change === 'rename') renameSync(join(dir, 'hello.txt'), join(dir, 'greeting.txt'));
      if (change === 'copy') writeFileSync(join(dir, 'copy.txt'), 'hello\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'second');
      const written = [...objects()].filter((id) => !before.has(id)).sort();
      const model = secondCommit(change);
      assert.equal(git('rev-parse', 'HEAD'), model.c2, change);
      assert.deepEqual(written, [...model.written].sort(), change);
      // What each change writes: changed bytes need a new blob; a new name or a copy needs only a tree and a commit.
      assert.deepEqual(
        model.written.map((id) => model.repo.objects[id]!.type).sort(),
        change === 'add' || change === 'edit' ? ['blob', 'commit', 'tree'] : ['commit', 'tree'],
        change,
      );
      // Changed bytes change every id above them: an edit leaves none of commit one's ids in commit two's snapshot.
      if (change === 'edit') assert.ok(!model.written.includes(model.hello) && model.written.includes(model.nextBlob!));
    } finally {
      done();
    }
  }
});

test('the same bytes get the same blob id in any repository', () => {
  assert.equal(new Repo().blob('hello\n'), secondCommit('copy').hello);
  assert.equal(new Repo().blob('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

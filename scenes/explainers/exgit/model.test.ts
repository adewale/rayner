import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Repo, AUTHOR } from './model.ts';
import { mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secondCommit, type Change } from './objects.ts';

test('blob ids are SHA-1 of the typed bytes, across the hash\'s padding boundaries and in UTF-8', () => {
  // With the 8-byte header "blob NN\0", 47, 48 and 56 bytes of content make 55, 56 and 64-byte
  // messages, SHA-1's one- and two-block padding edges.
  for (const content of ['', 'a', 'é', 'x'.repeat(47), 'x'.repeat(48), 'x'.repeat(56), 'x'.repeat(120), 'naïve 中文\n'.repeat(9)]) {
    const bytes = Buffer.from(content, 'utf8');
    const expected = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
    assert.equal(new Repo().blob(content), expected, JSON.stringify(content));
  }
});

test('both git scenarios hash the exact typed bytes used by the Git CLI', () => {
  for (const change of ['add', 'edit']) {
    const repo = new Repo(),
      hello = repo.blob('hello\n'),
      t1 = repo.tree([['100644', 'hello.txt', hello]]),
      c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' }),
      next = repo.blob(change === 'add' ? 'world\n' : 'hello again\n'),
      t2 = repo.tree(
        change === 'add'
          ? [
              ['100644', 'hello.txt', hello],
              ['100644', 'world.txt', next],
            ]
          : [['100644', 'hello.txt', next]],
      );
    repo.commit({ tree: t2, parents: [c1], author: AUTHOR, message: 'second\n' });
    for (const [id, obj] of Object.entries(repo.objects))
      assert.equal(
        execFileSync('git', ['hash-object', '-t', obj.type, '--stdin'], {
          input: obj.bytes,
          encoding: 'utf8',
        }).trim(),
        id,
      );
  }
});

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

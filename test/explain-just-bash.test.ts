import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec } from '../scenes/explainers/lib/models.ts';
import { sessionOfShells, sessionNextShell, scriptBound, BASH_EVENTS, PIPELINE, FILE } from '../scenes/explainers/lib/just-bash.ts';
import type { ShellSession, BashEvent } from '../scenes/explainers/lib/just-bash.ts';

/** Every session the script's command lines reach from the empty shell, with the shortest events to each. */
function reachable(): { state: ShellSession; path: BashEvent[] }[] {
  const seen = new Map<string, { state: ShellSession; path: BashEvent[] }>();
  const queue = [{ state: sessionOfShells(), path: [] as BashEvent[] }];
  while (queue.length) {
    const at = queue.shift()!;
    if (seen.has(JSON.stringify(at.state))) continue;
    seen.set(JSON.stringify(at.state), at);
    for (const e of BASH_EVENTS) {
      // The machine's bound first: the script writes once, though exec would go on.
      if (scriptBound(at.state, e) !== undefined) continue;
      const next = sessionNextShell(at.state, e);
      if (next) queue.push({ state: next, path: [...at.path, e] });
    }
  }
  return [...seen.values()];
}

test('in every order of the script’s commands, s0 stays empty and only the kept shell’s cat prints HELLO', () => {
  const empty = { fs: {}, steps: 0 },
    written = exec(empty, PIPELINE, FILE).shell;
  const states = reachable();
  // s0 alone or with s1, times which of them cat has read: 2 + 4.
  assert.equal(states.length, 6);
  for (const { state, path } of states) {
    const where = path.join(' ') || 'start';
    // exec never changes the shell it is given: s0 is the empty shell in every state.
    assert.deepEqual(state.shells[0], empty, where);
    // The write's shell is the model's, and the caller keeps it as the newest.
    if (state.shells.length > 1) assert.deepEqual(state.shells[1], written, where);
    // cat on s0 prints nothing whenever it ran, before or after the write; cat on s1 prints what the write stored.
    if (state.cats[0] !== null) assert.equal(state.cats[0], '', where);
    if (state.cats[1] != null) assert.equal(state.cats[1], 'HELLO\n', where);
  }
  // Both orders of the write and a cat on the kept shell are reached, and they print different things.
  const run = (events: BashEvent[]) => events.reduce<ShellSession | undefined>((s, e) => s && sessionNextShell(s, e), sessionOfShells());
  assert.deepEqual(run(['CAT_NEWEST', 'RUN_PIPELINE'])!.cats, ['', null]);
  assert.deepEqual(run(['RUN_PIPELINE', 'CAT_NEWEST'])!.cats, [null, 'HELLO\n']);
  // cat on s0 is the same before and after the write: the same state either way.
  assert.deepEqual(run(['CAT_S0', 'RUN_PIPELINE']), run(['RUN_PIPELINE', 'CAT_S0']));
});

test('the session refuses what exec refuses: ls in every state; and the script writes shout.txt once', () => {
  for (const { state, path } of reachable()) {
    assert.equal(sessionNextShell(state, 'LS'), undefined, path.join(' '));
    assert.throws(() => exec(state.shells.at(-1)!, [['ls']]), /Unknown model command/);
  }
  const once = sessionNextShell(sessionOfShells(), 'RUN_PIPELINE')!;
  // A second write is beyond the script, not refused by exec: exec would return a third shell.
  assert.equal(scriptBound(once, 'RUN_PIPELINE'), 'The script writes shout.txt once');
  assert.equal(sessionNextShell(once, 'RUN_PIPELINE')!.shells.length, 3);
  // A cat run again on the same shell prints the same and changes nothing.
  const read = sessionNextShell(once, 'CAT_NEWEST')!;
  assert.deepEqual(sessionNextShell(read, 'CAT_NEWEST'), read);
});

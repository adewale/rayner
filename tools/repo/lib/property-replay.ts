// The command that replays each failed fast-check property in a `node --test` log, from the seed
// and path fast-check printed and the failed test's file and name: tools/repo/ci-tests.ts prints
// them when a run fails, so the scheduled properties workflow's random seed leaves a reproduction.

const SHELL_SAFE = /^[\w./:=@%+-]+$/;
const quote = (s: string) => (SHELL_SAFE.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);
const literal = (s: string) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/**
 * One shell command per failed property in `log`'s failure summary (`✖ failing tests:`), run
 * with FULL=1 when `full` is set. A failed test that is not a fast-check property gives none.
 */
export function replayCommands(log: string, full = false): string[] {
  const start = log.lastIndexOf('✖ failing tests:');
  if (start < 0) return [];
  return log.slice(start).split(/^test at /m).slice(1).flatMap((block) => {
    const file = /^(.+):\d+:\d+$/m.exec(block)?.[1];
    const name = /^\s*✖ (.+) \(\d[\d.]*m?s\)$/m.exec(block)?.[1];
    const run = /\{ seed: (-?\d+), path: "([\d:]+)"/.exec(block);
    if (!file || !name || !run) return [];
    return [`FC_SEED=${run[1]} FC_PATH=${run[2]}${full ? ' FULL=1' : ''} node --test --test-name-pattern=${quote(`^${literal(name)}$`)} ${quote(file)}`];
  });
}

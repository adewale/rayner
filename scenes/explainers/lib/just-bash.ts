/**
 * The just-bash explainer's script as a machine: the caller runs its command lines through `exec` (lib/models.ts),
 * keeps the shell each write returns, and reads what cat prints on the newest shell or on the shell it started with.
 * No drawing here. Tested in test/explain-just-bash.test.ts.
 */
import { exec } from './models.ts';
import type { Shell } from './models.ts';

export const PIPELINE = [
  ['echo', 'hello'],
  ['tr', 'a-z', 'A-Z'],
] as const;
export const FILE = 'shout.txt';

/**
 * The script's command lines: the pipeline with its redirect, run on the newest shell, whose returned shell the caller
 * keeps; cat shout.txt on the newest shell; cat shout.txt on s0, the shell the caller started with; and ls.
 */
export type BashEvent = 'RUN_PIPELINE' | 'CAT_NEWEST' | 'CAT_S0' | 'LS';
export const BASH_EVENTS: readonly BashEvent[] = ['RUN_PIPELINE', 'CAT_NEWEST', 'CAT_S0', 'LS'];
/** The command line each event runs, as the reader types it. */
export const COMMAND: Record<BashEvent, string> = {
  RUN_PIPELINE: `echo hello | tr a-z A-Z > ${FILE}`,
  CAT_NEWEST: `cat ${FILE}`,
  CAT_S0: `cat ${FILE}`,
  LS: 'ls',
};

export interface ShellSession {
  /** Every shell the caller holds: s0, then the shell each write returned, newest last. */
  shells: Shell[];
  /** What cat shout.txt printed on each of those shells, or null where the caller has not run it. */
  cats: (string | null)[];
}

/** The caller holds the empty shell it started with and has run nothing. */
export function sessionOfShells(): ShellSession {
  return { shells: [{ fs: {}, steps: 0 }], cats: [null] };
}

/**
 * The session after one command line, or undefined when `exec` refuses it (ls: "Unknown model command"). The
 * pipeline's returned shell is kept as the newest; cat's stdout is read and the shell it returns is dropped, as the
 * explainer's code does, so running cat again on the same shell prints the same thing and changes nothing. Cat on s0
 * shows what s0 holds, however many writes came after it: exec never changed it. The script writes shout.txt once,
 * so a second RUN_PIPELINE, which would return a third shell, is beyond the script: see `scriptBound`.
 */
export function sessionNextShell(state: ShellSession, event: BashEvent): ShellSession | undefined {
  const newest = state.shells.length - 1;
  switch (event) {
    case 'RUN_PIPELINE': {
      const { shell } = exec(state.shells[newest]!, PIPELINE, FILE);
      return { shells: [...state.shells, shell], cats: [...state.cats, null] };
    }
    case 'CAT_NEWEST':
    case 'CAT_S0': {
      const on = event === 'CAT_S0' ? 0 : newest;
      const { stdout } = exec(state.shells[on]!, [['cat', FILE]]);
      return { ...state, cats: state.cats.map((c, i) => (i === on ? stdout : c)) };
    }
    case 'LS':
      try {
        exec(state.shells[newest]!, [['ls']]);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Unknown model command')) return undefined;
        throw error;
      }
      throw new Error('ls is expected to be refused by the model');
  }
}

/** Where the script stops though exec would go on: it writes shout.txt once. */
export function scriptBound(state: ShellSession, event: BashEvent): string | undefined {
  return event === 'RUN_PIPELINE' && state.shells.length > 1 ? 'The script writes shout.txt once' : undefined;
}

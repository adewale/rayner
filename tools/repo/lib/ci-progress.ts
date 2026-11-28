import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

interface Clock {
  now(): number;
  every(callback: () => void, milliseconds: number): () => void;
}
const realClock: Clock = {
  now: () => performance.now(),
  every(callback, milliseconds) {
    const timer = setInterval(callback, milliseconds);
    return () => clearInterval(timer);
  },
};

/** A live wrapper is distinct from test progress: even an entirely silent child gets a heartbeat. */
export function commandProgress(write: (line: string) => void, clock: Clock = realClock) {
  const started = clock.now();
  let lastOutput = started, finished = false;
  write('[ci] command started\n');
  const stop = clock.every(() => {
    if (!finished) write(`[ci] running ${Math.max(0, (clock.now() - started) / 1000).toFixed(0)}s; last child output ${Math.max(0, (clock.now() - lastOutput) / 1000).toFixed(0)}s ago\n`);
  }, 30_000);
  return {
    output() { lastOutput = clock.now(); },
    finish(code: number | null, signal: NodeJS.Signals | null) {
      if (finished) return;
      finished = true;
      stop();
      write(`[ci] finished in ${Math.max(0, (clock.now() - started) / 1000).toFixed(1)}s (${signal ?? `exit ${code ?? 1}`})\n`);
    },
  };
}

/** Keep the chosen result reporters and destinations; add live per-file events for Node test runs. */
export function progressArgs(args: readonly string[]): string[] {
  const boundary = args.indexOf('--');
  const options = boundary < 0 ? args : args.slice(0, boundary);
  if (!options.includes('--test') || !options[0]?.startsWith('-')) return [...args];
  const reporters: string[] = [], destinations: string[] = [], rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { rest.push(...args.slice(i)); break; }
    const match = /^(--test-reporter(?:-destination)?)(?:=(.*))?$/.exec(args[i]!);
    if (!match) { rest.push(args[i]!); continue; }
    const value = match[2] ?? args[++i];
    if (!value || value.startsWith('--')) return [...args]; // Let Node report invalid options.
    (match[1] === '--test-reporter' ? reporters : destinations).push(value);
  }
  // Do not mistake a script's own --test argument for Node's runner. Unknown leading
  // option/value pairs conservatively keep their original command and heartbeat only.
  if (rest.slice(0, rest.indexOf('--test')).some(arg => !arg.startsWith('-'))) return [...args];
  if (!reporters.length && !destinations.length) { reporters.push('spec'); destinations.push('stdout'); }
  else if (reporters.length === 1 && !destinations.length) destinations.push('stdout');
  if (reporters.length !== destinations.length) return [...args];
  return [
    ...reporters.flatMap((reporter, i) => [`--test-reporter=${reporter}`, `--test-reporter-destination=${destinations[i]}`]),
    `--test-reporter=${fileURLToPath(new URL('./ci-file-reporter.ts', import.meta.url))}`,
    '--test-reporter-destination=stderr',
    ...rest,
  ];
}

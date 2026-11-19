// Preserve full test output and a bounded failure annotation when hosted log
// downloads are unavailable, and print the command that replays each failed property.
// Arguments are passed directly to this Node version.
import {spawn} from 'node:child_process';
import {replayCommands} from './lib/property-replay.ts';
import {commandProgress, progressArgs} from './lib/ci-progress.ts';
const child = spawn(process.execPath, progressArgs(process.argv.slice(2)), {stdio: ['inherit', 'pipe', 'pipe']});
const progress = commandProgress(line => process.stderr.write(line));
let tail = '';
const retain = (data: Buffer) => { progress.output(); tail = (tail + data.toString()).slice(-32_000); };
child.stdout.on('data', data => { process.stdout.write(data); retain(data); });
child.stderr.on('data', data => { process.stderr.write(data); retain(data); });
child.on('error', error => { console.error(error); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('close', (code, signal) => {
  progress.finish(code, signal);
  if (code !== 0) {
    const start = tail.lastIndexOf('✖ failing tests:');
    const message = (start < 0 ? tail : tail.slice(start)).slice(-16_000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log('::error title=Tests failed::' + message);
    for (const command of replayCommands(tail, !!process.env.FULL)) console.log('::error title=Replay this failed property::' + command);
  }
  process.exitCode = code ?? 1;
});

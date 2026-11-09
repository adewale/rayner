// Preserve full test output and a bounded failure annotation when hosted log
// downloads are unavailable, and print the command that replays each failed property.
// Arguments are passed directly to this Node version.
import {spawn} from 'node:child_process';
import {replayCommands} from './lib/property-replay.ts';
const child = spawn(process.execPath, process.argv.slice(2), {stdio: ['inherit', 'pipe', 'pipe']});
let tail = '';
const retain = (data: Buffer) => { tail = (tail + data.toString()).slice(-32_000); };
child.stdout.on('data', data => { process.stdout.write(data); retain(data); });
child.stderr.on('data', data => { process.stderr.write(data); retain(data); });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('close', code => {
  if (code !== 0) {
    const start = tail.lastIndexOf('✖ failing tests:');
    const message = (start < 0 ? tail : tail.slice(start)).slice(-16_000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log('::error title=Tests failed::' + message);
    for (const command of replayCommands(tail, !!process.env.FULL)) console.log('::error title=Replay this failed property::' + command);
  }
  process.exitCode = code ?? 1;
});

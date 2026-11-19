import type {TestEvent} from 'node:test/reporters';
import {relative} from 'node:path';

// dequeue/complete are live events; spec's ordered results can wait behind a long earlier file.
export default async function* fileProgress(events: AsyncIterable<TestEvent>) {
  for await (const event of events) {
    if (event.type !== 'test:dequeue' && event.type !== 'test:complete') continue;
    const d = event.data;
    if (d.nesting !== 0 || !d.file || d.name !== d.file) continue;
    const file = relative(process.cwd(), d.file).replaceAll(/[\r\n]/g, ' ');
    if (event.type === 'test:dequeue') yield `[ci] file started: ${file}\n`;
    else yield `[ci] file ${event.data.details.passed ? 'passed' : 'failed'}: ${file} (${(event.data.details.duration_ms / 1000).toFixed(2)}s)\n`;
  }
}

// Regenerate browser SFNT copies from the committed embedded WOFF2 faces.
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { SANS, MONO, FALLBACK } from '../src/font-data.ts';
const root = new URL('../', import.meta.url);
const data: string[] = JSON.parse(
  execFileSync(
    process.env.RAYNER_LETTERING_PYTHON ?? 'python3',
    [new URL('tools/fonts-sfnt.py', root).pathname],
    {
      input: JSON.stringify([SANS, MONO, ...FALLBACK.map(([, data]) => data)]),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  ),
);
await writeFile(new URL('vendor/font-data-sfnt.json', root), JSON.stringify({
  SANS: data[0], MONO: data[1], FALLBACK: FALLBACK.map(([name], i) => [name, data[i + 2]]),
}) + '\n');

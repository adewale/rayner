// Regenerate browser SFNT copies from the committed embedded WOFF2 faces.
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SANS, MONO, FALLBACK } from '../../src/font-data.ts';
import { ROOT } from '../lib/roots.ts';
const data: string[] = JSON.parse(
  execFileSync(
    process.env.RAYNER_LETTERING_PYTHON ?? 'python3',
    [join(ROOT, 'tools/repo/fonts-sfnt.py')],
    {
      input: JSON.stringify([SANS, MONO, ...FALLBACK.map(([, data]) => data)]),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  ),
);
await writeFile(join(ROOT, 'vendor/font-data-sfnt.json'), JSON.stringify({
  SANS: data[0], MONO: data[1], FALLBACK: FALLBACK.map(([name], i) => [name, data[i + 2]]),
}) + '\n');

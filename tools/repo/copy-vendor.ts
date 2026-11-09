// The library ships the shaper once, in dist/vendor/: its compiled src/ imports ../vendor/glyph.js there, and the
// command's page build reads it there. The maths typesetter is capture-only and ships with rayner-cli.
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../lib/roots.ts';
await mkdir(join(ROOT, 'dist/vendor'), { recursive: true });
for (const file of ['glyph.js', 'glyph.d.ts'])
  await copyFile(join(ROOT, 'vendor', file), join(ROOT, 'dist/vendor', file));

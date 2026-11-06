// The library's compiled src/ imports ../vendor/glyph.js; the maths typesetter is capture-only and ships with rayner-cli.
import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
await mkdir(new URL('dist/vendor/', root), { recursive: true });
for (const file of ['glyph.js', 'glyph.d.ts'])
  await copyFile(new URL('vendor/' + file, root), new URL('dist/vendor/' + file, root));

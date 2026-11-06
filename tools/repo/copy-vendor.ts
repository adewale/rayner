import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
await mkdir(new URL('dist/vendor/', root), { recursive: true });
for (const file of ['glyph.js', 'glyph.d.ts', 'glyph-math.js', 'glyph-math.d.ts'])
  await copyFile(new URL('vendor/' + file, root), new URL('dist/vendor/' + file, root));

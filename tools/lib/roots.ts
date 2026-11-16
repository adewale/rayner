// Where the command finds its files. Rayner is one package: the library (src/, explain/, extras/ and
// their compiled dist/) and this command, which ships bundled into dist/tools/ beside the player in
// app/ and the capture tools. In a checkout the command runs from source; installed, its chunks sit in
// node_modules/rayner/dist/tools/. Either way ROOT is the package folder that holds both.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True in the installed command: its modules are bundled JavaScript, not the checkout's .ts. */
export const COMPILED = import.meta.url.endsWith('.js');
/** The package's files: src/ and explain/ (the page build's inputs), dist/, app/, tools/lettering.py, vendor/. */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** The package's manifest: its version, the pinned tool dependencies and the add-ons' optional peers. */
export const manifest: { name: string; version: string; dependencies: Record<string, string>; peerDependencies?: Record<string, string> } =
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
/**
 * The vendored shaper, which the package ships once, beside its compiled modules
 * (dist/vendor/glyph.js); a checkout has it in vendor/. The page build reads it from here.
 */
export const GLYPH = join(ROOT, COMPILED ? 'dist/vendor/glyph.js' : 'vendor/glyph.js');

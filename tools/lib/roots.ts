// Where the command finds its own files and the library's. Rayner publishes two packages from this
// repository: `rayner` (src/, explain/, the snapshot reader and their compiled dist/) and
// `rayner-cli` (this command, bundled into dist/tools/, with the player in app/ and the capture
// tools). In a checkout both are this folder. Installed, the command's chunks sit in
// node_modules/rayner-cli/dist/tools/ and the library is wherever its `rayner` dependency resolves.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True in the installed command: its modules are bundled JavaScript, not the checkout's .ts. */
export const COMPILED = import.meta.url.endsWith('.js');
/** The command's own files: app/, tools/lettering.py, vendor/lettering/, the bundle in dist/tools/. */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** The command's manifest: its version and the pinned tool dependencies. */
export const CLI_MANIFEST = join(ROOT, COMPILED ? 'package.json' : 'cli/package.json');
export const cliManifest: { name: string; version: string; dependencies: Record<string, string> } = JSON.parse(readFileSync(CLI_MANIFEST, 'utf8'));

function libraryRoot(): string {
  if (!COMPILED) return ROOT;
  let entry: string;
  try {
    entry = fileURLToPath(import.meta.resolve('rayner'));
  } catch {
    throw new Error(`rayner-cli ${cliManifest.version} needs the rayner package: npm install --save-dev rayner@${cliManifest.version}`);
  }
  // `rayner` is dist/src/index.js inside the package.
  const root = resolve(dirname(entry), '../..');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  if (version !== cliManifest.version)
    throw new Error(`rayner-cli ${cliManifest.version} needs rayner ${cliManifest.version}, found ${version}: npm install --save-dev rayner@${cliManifest.version}`);
  return root;
}
/** The library's files: src/, explain/, integrations/agentic-mermaid/*.ts, vendor/glyph.js and dist/. */
export const LIB_ROOT = libraryRoot();
/**
 * A file the diagram capture's metric policy hashes (integrations/agentic-mermaid/build/index.ts):
 * the capture's own sources ship with the command, the text and font code with the library.
 * The installed bundle reads each through this; a checkout reads both from one folder.
 */
export const policyFile = (file: string) => join(file.startsWith('integrations/agentic-mermaid/build/') ? ROOT : LIB_ROOT, file);

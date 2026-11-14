// The command's two opt-in add-ons, and the errors that say what to install when a scene asks for one.
// A scene that draws no Mermaid diagram and asks for no lettering never reaches this module's loaders:
// it checks, builds, describes and sees with Node alone (docs/REFERENCE.md, "Add-ons").
//
// - Diagram capture: the agentic-mermaid and svgpath packages (optional peers of rayner-cli), and
//   Chromium to capture a diagram that scene.snapshots/ does not hold. Pinned snapshots replay
//   without Chromium; checking a diagram's morph edits needs agentic-mermaid.
// - Lettering capture: Python with fonttools, brotli, uharfbuzz and python-bidi, and the source fonts
//   (docs/LETTERING.md). A committed lettering snapshot replays without them.
import { cliManifest } from './roots.ts';

/** The npm packages the diagram add-on needs, beyond rayner-cli's own dependencies. */
export const DIAGRAM_PACKAGES = ['agentic-mermaid', 'svgpath'] as const;

/** A package's pinned version: an optional peer's (an add-on's) or a dependency's. */
export const pinnedVersion = (name: string): string | undefined => cliManifest.peerDependencies?.[name] ?? cliManifest.dependencies[name];
/** The npm command that installs these packages at the versions rayner-cli pins. */
export const installCommand = (names: readonly string[]): string =>
  'npm install --save-dev ' + names.map((name) => `${name}@${pinnedVersion(name)}`).join(' ');

/** The package an import failed to find, as Node names it, or undefined for any other failure. */
export function missingPackage(error: unknown): string | undefined {
  const e = error as { code?: string; message?: string } | undefined;
  return e?.code === 'ERR_MODULE_NOT_FOUND' ? /Cannot find package '([^']+)'/.exec(String(e.message))?.[1] : undefined;
}

/**
 * Load part of the diagram add-on, for `need` (what the scene asked for, naming the scene file). When
 * its packages are not installed, fail with what to install, instead of Node's bare module error.
 */
export async function diagramAddOn<T>(need: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const name = missingPackage(error);
    if (!name || !(DIAGRAM_PACKAGES as readonly string[]).includes(name)) throw error;
    throw new Error(
      `${need} needs the diagram add-on, and ${name} is not installed. Install it with: ${installCommand(DIAGRAM_PACKAGES)}. ` +
        'Capturing a diagram also needs Chromium (npx playwright-core install chromium, or set CHROMIUM_EXECUTABLE_PATH). ' +
        'Scenes that draw no Mermaid diagram need neither.',
      { cause: error },
    );
  }
}

/** A diagram's first line of Mermaid (after any front matter and directives), to name it in an error. */
export function diagramName(source: string): string {
  const body = source.trim().replace(/^---\n[\s\S]*?\n---\n/, '');
  return JSON.stringify(body.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) ?? body.slice(0, 40));
}

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { adoptIntent, parseIntent } from '../../explain/intent.ts';
import type { Intent } from '../../explain/intent.ts';

export { REQUIRED, adoptIntent, intentMeta, parseIntent, withIntent } from '../../explain/intent.ts';
export type { Intent } from '../../explain/intent.ts';

/** The intent of the script beside `sceneFile`, or null when there is no script or it has no intent header. */
export async function readIntent(sceneFile: string): Promise<Intent | null> {
  const file = join(dirname(sceneFile), 'script.md');
  const text = await readFile(file, 'utf8').catch(() => null);
  return text === null ? null : parseIntent(text, file);
}

/**
 * Adopt the intent of the script beside `sceneFile` into `Scene`'s metadata, afresh on every call,
 * and return what it adopted (undefined when the script has no intent header). A loaded scene
 * module is shared within a process: `preview --watch` rebuilds with the same class while only
 * script.md changes. adoptIntent starts each adoption from the metadata the scene declares, so a
 * changed or removed line is not kept, and a script that lost its intent header, or was deleted,
 * leaves the scene's metadata as the scene declares it.
 */
export async function adoptScript(Scene: { meta?: Record<string, unknown> }, sceneFile: string): Promise<ReturnType<typeof adoptIntent>> {
  return adoptIntent(Scene, await readIntent(sceneFile), sceneFile);
}

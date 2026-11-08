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

/** The metadata keys each scene class took from its script at its last adoption (adoptScript). */
const adopted = new WeakMap<object, readonly string[]>();

/**
 * Adopt the intent of the script beside `sceneFile` into `Scene`'s metadata, afresh on every call,
 * and return what it adopted (undefined when the script has no intent header). A loaded scene
 * module is shared within a process: `preview --watch` rebuilds with the same class while only
 * script.md changes. adoptIntent starts each adoption from the metadata the scene declares, so a
 * changed or removed line is not kept; a script that lost its intent header, or was deleted, takes
 * out every key the last adoption put in, which the scene itself never declares.
 */
export async function adoptScript(Scene: { meta?: Record<string, unknown> }, sceneFile: string): Promise<ReturnType<typeof adoptIntent> | undefined> {
  const intent = await readIntent(sceneFile);
  if (intent) {
    const meta = adoptIntent(Scene, intent, sceneFile);
    adopted.set(Scene, Object.keys(meta));
    return meta;
  }
  const keys = adopted.get(Scene);
  if (keys && Scene.meta) Scene.meta = Object.fromEntries(Object.entries(Scene.meta).filter(([key]) => !keys.includes(key)));
  adopted.delete(Scene);
  return undefined;
}

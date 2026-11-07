import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseIntent } from '../../explain/intent.ts';
import type { Intent } from '../../explain/intent.ts';

export { REQUIRED, adoptIntent, intentMeta, parseIntent, withIntent } from '../../explain/intent.ts';
export type { Intent } from '../../explain/intent.ts';

/** The intent of the script beside `sceneFile`, or null when there is no script or it has no intent header. */
export async function readIntent(sceneFile: string): Promise<Intent | null> {
  const file = join(dirname(sceneFile), 'script.md');
  const text = await readFile(file, 'utf8').catch(() => null);
  return text === null ? null : parseIntent(text, file);
}

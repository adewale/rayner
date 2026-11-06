import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { intentMeta, parseIntent, withIntent } from '../../explain/intent.ts';
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
 * An explainer's metadata as its page has it: the scene's own, with its script's intent where the
 * script beside it has an intent header. For tests and tools that hold the scene class without
 * collecting the project (collectProject merges the same).
 */
export function explainerMeta<M extends object>(Scene: { meta?: M }, sceneDir: string): M & Partial<ReturnType<typeof intentMeta>> {
  const file = join(sceneDir, 'script.md');
  let text: string | null = null;
  try { text = readFileSync(file, 'utf8'); } catch { /* no script */ }
  const intent = text === null ? null : parseIntent(text, file);
  return { ...(Scene.meta ?? ({} as M)), ...(intent ? intentMeta(intent) : {}) };
}

/**
 * Adopt the intent of the script in `sceneDir` into a scene class that a test runs directly, as
 * collectProject does, so `answerOf` and the page's metadata work the same. Returns the class.
 */
export function withScriptIntent<S extends { meta?: Record<string, unknown> }>(Scene: S, sceneDir: string): S {
  const file = join(sceneDir, 'script.md');
  return withIntent(Scene, readFileSync(file, 'utf8'), file);
}


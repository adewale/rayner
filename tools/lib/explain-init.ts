import { join } from 'node:path';
import { LIB_ROOT } from './roots.ts';
import { packageImports as toPackageImports } from './entry-points.ts';

/** `rayner init` writes the tutorial's explainer (docs/TUTORIAL.md): its script, scene, model and the model's test. */
export const STARTER = join(LIB_ROOT, 'scenes/tutorial/lru-mru');
export const STARTER_FILES = ['script.md', 'scene.ts', 'model.ts', 'model.test.ts'] as const;

/**
 * `rayner init --machine` writes a machine explainer (docs/MACHINES.md): its intent script, a model whose
 * `next` refuses events with reasons, the model's test, a scene whose view (picture.ts) draws the state
 * and whose last step is live, and the review's subjects. It passes `rayner check` and `rayner review` as written.
 */
export const MACHINE_STARTER = join(LIB_ROOT, 'scenes/tutorial/door');
export const MACHINE_STARTER_FILES = ['script.md', 'scene.ts', 'picture.ts', 'model.ts', 'model.test.ts', 'scene.review.json'] as const;

/** A starter file as an author's project holds it: the repository's engine imports become the package's. */
export const packageImports = (source: string): string => toPackageImports(source);

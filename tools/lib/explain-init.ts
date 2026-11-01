import { join } from 'node:path';
import { ROOT } from './explain-project.ts';

/** `rayner init` writes the tutorial's explainer (docs/TUTORIAL.md): its script, scene, model and the model's test. */
export const STARTER = join(ROOT, 'scenes/tutorial/lru-mru');
export const STARTER_FILES = ['script.md', 'scene.ts', 'model.ts', 'model.test.ts'] as const;

/** A starter file as an author's project holds it: the repository's engine imports become the package's. */
export const packageImports = (source: string) =>
  source.replaceAll("from '../../../src/index.ts'", "from 'rayner'").replaceAll("from '../../../explain/index.ts'", "from 'rayner/explain'");

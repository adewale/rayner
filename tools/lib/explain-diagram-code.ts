// Diagram code only where it is used. A page whose scene shows no diagram in any scenario
// carries none of explain/diagrams.ts's Diagram, nor the Mermaid replay it draws with: the
// build answers every import of explain/diagrams.ts with a stand-in whose Diagram throws if
// it is ever reached. The helpers the player reads for every picture (the words and size of a
// label) live in explain/labels.ts, which the player imports itself.
import type { Plugin } from 'esbuild';
import { join, resolve } from 'node:path';
import type { Project } from './explain-project.ts';
import { LIB_ROOT, ROOT } from './roots.ts';
import { relativePosix } from './hash.ts';

/** Whether a project's page needs diagram code: some scenario made a diagram, or resolved a snapshot for one. */
export const showsDiagrams = (project: Pick<Project, 'store' | 'diagrams'>) => project.diagrams || Object.keys(project.store).length > 0;

/** The message the stand-in's Diagram throws with. */
export const NO_DIAGRAM_CODE =
  'new Diagram(): this page was built without diagram code, because no scenario made a diagram when it was built; build the page again from a scene that shows it';

/** The esbuild plugin that leaves diagram code out of a page whose project shows no diagram. */
export function withoutDiagramCode(root = LIB_ROOT): Plugin {
  const file = join(root, 'explain/diagrams.ts');
  return {
    name: 'without-diagram-code',
    setup(b) {
      // The library's module, wherever it is imported from: the engine's own files, the player
      // beside the command (ROOT), or a compiled scene's dist/ copy.
      b.onResolve({ filter: /diagrams(\.ts|\.js)?$/ }, (args) => {
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) return undefined;
        const path = resolve(args.resolveDir, args.path);
        const here = [LIB_ROOT, ROOT, root].some((base) => ['explain/diagrams.ts', 'dist/explain/diagrams.js'].includes(relativePosix(base, path)));
        return here ? { path: file, namespace: 'without-diagram-code' } : undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'without-diagram-code' }, () => ({
        contents: `export class Diagram { constructor() { throw new Error(${JSON.stringify(NO_DIAGRAM_CODE)}); } }`,
        resolveDir: root,
        loader: 'ts',
      }));
    },
  };
}

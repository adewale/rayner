// Every explainer and recipe as an outside author's project holds it, type-checked against an
// installed rayner's published declarations (npm run pack:smoke). The repository checks scenes
// against the engine's .ts source, where an @internal member is still visible; the packed .d.ts
// leaves it out (stripInternal), so a scene that uses an implementation detail fails here.
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { packageImports } from '../../lib/entry-points.ts';

const run = promisify(execFile);

/**
 * A scene's own source, as tsconfig.app.json checks it: not a folder's tests, fidelity checks or
 * oracles, not the shared property-test settings, and not the catalog, which lists the collection
 * for the site and the player rather than being an explainer (test/scene-imports.test.ts).
 */
export const authorSource = (file: string): boolean =>
  file.endsWith('.ts') && !file.endsWith('.test.ts') && !/(^|\/)fidelity\.ts$/.test(file) && !/(^|\/)oracle\//.test(file) &&
  file !== 'explainers/lib/pbt.ts' && file !== 'explainers/catalog.ts';

const options = {
  target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2023', 'dom', 'dom.iterable'],
  strict: true, noUncheckedIndexedAccess: true, noImplicitOverride: true, noFallthroughCasesInSwitch: true,
  verbatimModuleSyntax: true, erasableSyntaxOnly: true, isolatedModules: true, allowImportingTsExtensions: true, noEmit: true,
  skipLibCheck: true, forceConsistentCasingInFileNames: true,
};

/**
 * Copy scenes/ (each explainer and tutorial scene, with the collection's shared modules) and recipes/
 * from `root` into `project`/authored, engine imports rewritten to the package's entry points, and
 * type-check both with `tsc` against the rayner installed in `project`. Recipes run in Node, so they
 * see Node's types, from `root`'s @types/node; scenes see none. Throws with tsc's report on an error.
 */
export async function typeCheckAuthored(root: string, project: string, tsc: string): Promise<{ scenes: number; recipes: number }> {
  const out = join(project, 'authored');
  const copy = async (from: string, to: string) => {
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, packageImports(await readFile(from, 'utf8'), root));
  };
  const scenes = (await readdir(join(root, 'scenes'), { recursive: true })).map((f) => f.replaceAll('\\', '/')).filter(authorSource).sort();
  for (const file of scenes) await copy(join(root, 'scenes', file), join(out, 'scenes', file));
  const recipes = (await readdir(join(root, 'recipes'))).filter((f) => f.endsWith('.ts')).sort();
  for (const file of recipes) await copy(join(root, 'recipes', file), join(out, 'recipes', file));
  await writeFile(join(out, 'tsconfig.scenes.json'), JSON.stringify({ compilerOptions: { ...options, types: [] }, include: ['scenes/**/*.ts'] }));
  await writeFile(join(out, 'tsconfig.recipes.json'), JSON.stringify({
    compilerOptions: { ...options, types: ['node'], typeRoots: [join(root, 'node_modules/@types')] }, include: ['recipes/*.ts'],
  }));
  for (const config of ['tsconfig.scenes.json', 'tsconfig.recipes.json'])
    try {
      await run(tsc, ['-p', config], { cwd: out, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
      throw new Error(`${config}: the collection does not type-check against the packed rayner's declarations:\n${stdout}${stderr}`);
    }
  return { scenes: scenes.length, recipes: recipes.length };
}

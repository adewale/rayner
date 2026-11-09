// Every explainer, its tests and every recipe as an outside author's project holds them, type-checked
// against an installed rayner's published declarations (npm run pack:smoke). The repository checks
// scenes against the engine's .ts source, where an @internal member is still visible; the packed .d.ts
// leaves it out (stripInternal), so a scene or a scene's test that uses an implementation detail, or
// reaches a module no entry point exports, fails here.
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

/**
 * What a folder's tests may import beside the scene's source: the tests themselves, the oracles and
 * fixtures they read, the shared property-test settings, and a fidelity check that is written as an
 * outside author could write it. A fidelity check the repository's own harness types
 * (test/lib/fidelity.ts) stays out, so a test that imports one fails.
 */
const testSource = async (root: string, file: string): Promise<boolean> =>
  file.endsWith('.ts') && !authorSource(file) && file !== 'explainers/catalog.ts' &&
  !(/(^|\/)fidelity\.ts$/.test(file) && (await readFile(join(root, 'scenes', file), 'utf8')).includes('test/lib/'));

const options = {
  target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2023', 'dom', 'dom.iterable'],
  strict: true, noUncheckedIndexedAccess: true, noImplicitOverride: true, noFallthroughCasesInSwitch: true,
  verbatimModuleSyntax: true, erasableSyntaxOnly: true, isolatedModules: true, allowImportingTsExtensions: true, noEmit: true,
  skipLibCheck: true, forceConsistentCasingInFileNames: true,
};

/**
 * Copy scenes/ (each explainer and tutorial scene, with the collection's shared modules and each
 * folder's tests) and recipes/ from `root` into `project`/authored, engine imports rewritten to the
 * package's entry points, and type-check them with `tsc` against the rayner installed in `project`.
 * Scenes see no Node types; their tests and the recipes run in Node, so they see Node's, from
 * `root`'s @types/node. The tests' own packages are the project's: Agentic Mermaid comes with
 * rayner-cli, and fast-check, which an author adds for property tests, is linked from `root`.
 * Throws with tsc's report on an error.
 */
export async function typeCheckAuthored(root: string, project: string, tsc: string): Promise<{ scenes: number; tests: number; recipes: number }> {
  const out = join(project, 'authored');
  const copy = async (from: string, to: string) => {
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, packageImports(await readFile(from, 'utf8'), root));
  };
  const all = (await readdir(join(root, 'scenes'), { recursive: true })).map((f) => f.replaceAll('\\', '/')).sort();
  const scenes = all.filter(authorSource), support: string[] = [];
  for (const file of all) if (await testSource(root, file)) support.push(file);
  for (const file of [...scenes, ...support]) await copy(join(root, 'scenes', file), join(out, 'scenes', file));
  const tests = support.filter((f) => f.endsWith('.test.ts'));
  const recipes = (await readdir(join(root, 'recipes'))).filter((f) => f.endsWith('.ts')).sort();
  for (const file of recipes) await copy(join(root, 'recipes', file), join(out, 'recipes', file));
  const node = { types: ['node'], typeRoots: [join(root, 'node_modules/@types')] };
  if (!existsSync(join(project, 'node_modules/fast-check'))) await symlink(join(root, 'node_modules/fast-check'), join(project, 'node_modules/fast-check'), 'dir');
  await writeFile(join(out, 'tsconfig.scenes.json'), JSON.stringify({ compilerOptions: { ...options, types: [] }, include: ['scenes/**/*.ts'], exclude: support.map((f) => `scenes/${f}`) }));
  await writeFile(join(out, 'tsconfig.tests.json'), JSON.stringify({
    compilerOptions: { ...options, ...node, resolveJsonModule: true },
    include: tests.map((f) => `scenes/${f}`),
  }));
  await writeFile(join(out, 'tsconfig.recipes.json'), JSON.stringify({ compilerOptions: { ...options, ...node }, include: ['recipes/*.ts'] }));
  for (const config of ['tsconfig.scenes.json', 'tsconfig.tests.json', 'tsconfig.recipes.json'])
    try {
      await run(tsc, ['-p', config], { cwd: out, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
      throw new Error(`${config}: the collection does not type-check against the packed rayner's declarations:\n${stdout}${stderr}`);
    }
  return { scenes: scenes.length, tests: tests.length, recipes: recipes.length };
}

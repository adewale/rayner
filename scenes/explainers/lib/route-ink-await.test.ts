import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import ts from 'typescript';

test('every route observation awaits native completion before its caller advances the scene', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const helper = path.join(root, 'scenes/explainers/lib/route-ink/fidelity.ts');
  const config = ts.readConfigFile(path.join(root, 'tsconfig.node.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const observations = (input: ts.Program) => {
    const checker = input.getTypeChecker(), calls: ts.CallExpression[] = [];
    const options = input.getCompilerOptions(), cache = ts.createModuleResolutionCache(root, file => file, options);
    const dependents = new Map<string, Set<string>>();
    for (const source of input.getSourceFiles()) {
      if (source.isDeclarationFile || source.fileName.includes('/node_modules/')) continue;
      for (const imported of ts.preProcessFile(source.text, true, true).importedFiles) {
        const target = ts.resolveModuleName(imported.fileName, source.fileName, options, ts.sys, cache).resolvedModule?.resolvedFileName;
        if (!target) continue;
        const readers = dependents.get(target) ?? new Set<string>();
        readers.add(source.fileName); dependents.set(target, readers);
      }
    }
    // Resolve calls only in actual importers (including indirect ones). Asking the
    // checker for every unrelated generic call instantiates the whole repository.
    const relevant = new Set([helper]);
    for (const file of relevant) for (const reader of dependents.get(file) ?? []) relevant.add(reader);
    for (const source of input.getSourceFiles()) {
      if (!relevant.has(source.fileName)) continue;
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const owner = checker.getResolvedSignature(node)?.declaration;
          if (owner && ts.isMethodDeclaration(owner) && owner.getSourceFile().fileName === helper &&
              ts.isIdentifier(owner.name) && owner.name.text === 'frame') calls.push(node);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return calls;
  };
  const detached = (calls: ts.CallExpression[]) => calls.filter(call => !ts.isAwaitExpression(call.parent));
  const calls = observations(program);
  assert.ok(calls.length, 'the source inventory must resolve actual route observations');
  assert.deepEqual(detached(calls).map(call => `${path.relative(root, call.getSourceFile().fileName)}:${call.getText()}`), []);

  // Drop one real await in an in-memory source. The poison must retain the same route
  // observations and fail this boundary, without mutating a file or pinning source bytes.
  const call = calls[0]!, source = call.getSourceFile(), awaited = call.parent;
  // Parenthesizing the callee also defeats a syntactic `.frame(...)` name scan; the
  // declaration must still resolve, as it would for an alias or bracket access.
  const detachedCall = `(${call.expression.getText(source)})(${call.arguments.map(arg => arg.getText(source)).join(', ')})`;
  const poisoned = source.text.slice(0, awaited.getStart(source)) + detachedCall + source.text.slice(awaited.end);
  const host = ts.createCompilerHost(parsed.options), read = host.readFile;
  host.readFile = file => file === source.fileName ? poisoned : read(file);
  const altered = ts.createProgram({rootNames: parsed.fileNames, options: parsed.options, host, oldProgram: program});
  const alteredCalls = observations(altered);
  assert.equal(alteredCalls.length, calls.length);
  assert.equal(detached(alteredCalls).length, 1, 'a lost await must be detected even though TypeScript permits a floating Promise');
});

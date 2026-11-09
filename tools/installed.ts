#!/usr/bin/env node
// The installed command's entry (rayner-cli's dist/tools/explain.js). The bundle imports the
// library's compiled modules by the private specifier LIBRARY ('#rayner/src/scene.js'); a resolve
// hook maps it to the installed rayner package's dist/, the files its entry points load, so the
// command and the scenes it runs share one engine. The hook answers only the command's own modules:
// a scene, or any other package, still reaches the library through its entry points alone.
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  // roots.ts finds the installed rayner and checks its version, so it loads before the hook needs it.
  const { LIB_ROOT, LIBRARY } = await import('./lib/roots.ts');
  const command = new URL('./', import.meta.url).href,
    dist = pathToFileURL(join(LIB_ROOT, 'dist') + '/').href;
  registerHooks({
    resolve: (specifier, context, next) =>
      specifier.startsWith(LIBRARY) && context.parentURL?.startsWith(command)
        ? { url: dist + specifier.slice(LIBRARY.length), shortCircuit: true }
        : next(specifier, context),
  });
  const { run } = await import('./explain.ts');
  await run();
} catch (error) {
  console.error(`rayner: ${(error as Error).message}`);
  process.exitCode = 1;
}

// Loaded with `node --import` by test/explain-addons.test.ts, in the command it runs:
// RAYNER_TEST_ABSENT lists packages to treat as not installed, failing their import exactly as Node
// fails a package that is missing from node_modules; RAYNER_TEST_LOADED names a file that receives
// every module URL the process resolved, one per line, when it exits.
import { registerHooks } from 'node:module';
import { appendFileSync } from 'node:fs';

const absent = (process.env.RAYNER_TEST_ABSENT ?? '').split(',').filter(Boolean);
const loaded = new Set();
registerHooks({
  resolve(specifier, context, next) {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    if (absent.includes(name)) {
      const error = new Error(`Cannot find package '${name}' imported from ${context.parentURL}`);
      error.code = 'ERR_MODULE_NOT_FOUND';
      throw error;
    }
    const resolved = next(specifier, context);
    loaded.add(resolved.url);
    return resolved;
  },
});
if (process.env.RAYNER_TEST_LOADED)
  process.on('exit', () => appendFileSync(process.env.RAYNER_TEST_LOADED, [...loaded].join('\n') + '\n'));

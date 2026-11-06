#!/usr/bin/env node
// Serve the built collection locally: npm run demos:serve [-- --port 5175]
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '../lib/explain-project.ts';
import { serve } from '../lib/explain-serve.ts';

// Not 5174, the preview's port, so both can run at once.
const { values } = parseArgs({ options: { port: { type: 'string', default: '5175' } } });
const { url } = await serve(resolve(ROOT, 'out'), Number(values.port), 'explainers/');
console.log(`Rayner demos: ${url}/explainers/ (Ctrl-C to stop)`);

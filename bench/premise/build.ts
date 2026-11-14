// Builds the method-only pages: node bench/premise/build.ts
// Each page is one HTML file with its bundled script inline. The bundle includes the explainer's model.ts
// and answers.ts (imported, not copied) and nothing from src/ or explain/.
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const PAGES = [
  {
    dir: 'trust-proxy',
    title: 'Which address should Express call the client?',
    intro:
      'For an Express app behind a CDN and a load balancer. Pick a trust proxy setting and a request, then step through. Every number on this page is computed from a model of Express 5.3.0 that is tested against req.ip values recorded from real Express 5.3.0; the last step shows those recorded values.',
    leaves:
      'Leaves out: IPv6 and IPv4-mapped addresses; proxies that replace or strip X-Forwarded-For instead of appending; network rules that stop requests reaching the load balancer directly.',
  },
  {
    dir: 'pg-page',
    title: 'Why can int4 and int8 rows take the same space?',
    intro:
      'For someone designing Postgres tables. Pick a column type, then step through. Every number on this page is computed from a model of a Postgres 18 heap page that is tested against measurements from a real Postgres 18.6 server (64-bit, 8192-byte pages); the last step shows those measured values.',
    leaves:
      'Leaves out: 32-bit builds, nulls and the null bitmap, updates and dead tuples, TOAST, text needing a four-byte length header, other column orders, and storage beyond heap pages.',
  },
];

const CSS = `
:root { color-scheme: light; --ink:#1d1d1f; --soft:#6e6e73; --line:#d2d2d7; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 0.5rem 0; }
h2 { font-size: 1.15rem; line-height: 1.3; margin: 1rem 0 0.5rem; }
.intro, .leaves { color: var(--soft); font-size: 0.95rem; }
.controls { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0; }
.controls label { font-weight: 600; font-size: 0.95rem; }
select, button { font: inherit; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); }
button:disabled { opacity: 0.4; }
.nav { display: flex; align-items: center; gap: 12px; }
.counter { color: var(--soft); font-size: 0.9rem; }
.figure { border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin: 8px 0; }
.figure svg { display: block; max-width: 100%; height: auto; }
.caption { margin: 8px 0 16px; }
details { border-top: 1px solid var(--line); padding: 8px 0; }
summary { cursor: pointer; font-weight: 600; }
`;

for (const p of PAGES) {
  const out = await build({ entryPoints: [join(here, p.dir, 'method', 'main.ts')], bundle: true, format: 'iife', write: false, target: 'es2022', legalComments: 'none' });
  const js = out.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${p.title}</h1>
<p class="intro">${p.intro}</p>
<div id="app"></div>
<p class="leaves">${p.leaves}</p>
</main>
<script>${js}</script>
</body>
</html>
`;
  const file = join(here, p.dir, 'method.html');
  await writeFile(file, html);
  console.log(`wrote ${file} (${(html.length / 1024).toFixed(0)} KiB)`);
}

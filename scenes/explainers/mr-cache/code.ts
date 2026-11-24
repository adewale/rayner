import type { ColorSpan } from '../../../src/index.ts';

// The merge request's code, before and after: the two texts the diff step's
// TransformDiff morphs, and that fidelity.ts diffs with the
// real git CLI. (They began as the code in Lantern's engine example,
// scenes/mr-cache.ts, at 2c7bad5.)
export const BEFORE_CODE = [
  'async function getUser(id, env) {',
  '  return env.DB.prepare(SQL).bind(id).first();',
  '}',
];
export const AFTER_CODE = [
  'async function getUser(id, env) {',
  '  const hit = await env.KV.get(',
  '    `user:${id}`, "json");',
  '  if (hit) return hit;',
  '  const row = await env.DB.prepare(SQL)',
  '    .bind(id).first();',
  '  await env.KV.put(',
  '    `user:${id}`, JSON.stringify(row),',
  '    { expirationTtl: 300 });',
  '  return row;',
  '}',
];

// Syntax colours for the two blocks: build-time data, not a runtime highlighter.
// BEFORE_CODE and AFTER_CODE each saved to a .js file, then
//   node tools/tokens.ts block.js --theme light --engine shiki
// (shiki 4.5.0, a devDependency of this checkout: npm install; light, for the
// paper stage).
// Regenerate if the code above changes; fidelity.ts checks
// that every span lies inside its line.
export const BEFORE_SPANS: ColorSpan[] = [
  { line: 0, from: 0, to: 5, color: '#cf222e' },
  { line: 0, from: 6, to: 14, color: '#cf222e' },
  { line: 0, from: 15, to: 22, color: '#8250df' },
  { line: 1, from: 2, to: 8, color: '#cf222e' },
  { line: 1, from: 13, to: 15, color: '#0550ae' },
  { line: 1, from: 16, to: 23, color: '#8250df' },
  { line: 1, from: 24, to: 27, color: '#0550ae' },
  { line: 1, from: 29, to: 33, color: '#8250df' },
  { line: 1, from: 38, to: 43, color: '#8250df' },
];
export const AFTER_SPANS: ColorSpan[] = [
  {"line":0,"from":0,"to":5,"color":"#cf222e"},
  {"line":0,"from":6,"to":14,"color":"#cf222e"},
  {"line":0,"from":15,"to":22,"color":"#8250df"},
  {"line":1,"from":2,"to":7,"color":"#cf222e"},
  {"line":1,"from":8,"to":11,"color":"#0550ae"},
  {"line":1,"from":12,"to":13,"color":"#cf222e"},
  {"line":1,"from":14,"to":19,"color":"#cf222e"},
  {"line":1,"from":24,"to":26,"color":"#0550ae"},
  {"line":1,"from":27,"to":30,"color":"#8250df"},
  {"line":2,"from":4,"to":12,"color":"#0a3069"},
  {"line":2,"from":14,"to":16,"color":"#0a3069"},
  {"line":2,"from":18,"to":24,"color":"#0a3069"},
  {"line":3,"from":2,"to":4,"color":"#cf222e"},
  {"line":3,"from":11,"to":17,"color":"#cf222e"},
  {"line":4,"from":2,"to":7,"color":"#cf222e"},
  {"line":4,"from":8,"to":11,"color":"#0550ae"},
  {"line":4,"from":12,"to":13,"color":"#cf222e"},
  {"line":4,"from":14,"to":19,"color":"#cf222e"},
  {"line":4,"from":24,"to":26,"color":"#0550ae"},
  {"line":4,"from":27,"to":34,"color":"#8250df"},
  {"line":4,"from":35,"to":38,"color":"#0550ae"},
  {"line":5,"from":5,"to":9,"color":"#8250df"},
  {"line":5,"from":14,"to":19,"color":"#8250df"},
  {"line":6,"from":2,"to":7,"color":"#cf222e"},
  {"line":6,"from":12,"to":14,"color":"#0550ae"},
  {"line":6,"from":15,"to":18,"color":"#8250df"},
  {"line":7,"from":4,"to":12,"color":"#0a3069"},
  {"line":7,"from":14,"to":16,"color":"#0a3069"},
  {"line":7,"from":18,"to":22,"color":"#0550ae"},
  {"line":7,"from":23,"to":32,"color":"#8250df"},
  {"line":8,"from":21,"to":24,"color":"#0550ae"},
  {"line":9,"from":2,"to":8,"color":"#cf222e"}
];

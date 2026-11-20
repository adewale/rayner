// Controlled rendering fixture, not an author-productivity or learning experiment.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { PACKETS, cells, summary } from './shared.ts';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { checkProject } from '../../tools/lib/explain-check.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { renderElements } from '../../src/internal.ts';
import { readingLabelSize, labelOf, isHeading } from '../../explain/internal.ts';
import { buildInputs } from '../../tools/lib/build-inputs.ts';
import { SEED } from '../../scenes/explainers/lib/pbt.ts';

export const HERE = import.meta.dirname;
export const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
export const escapeHtml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const scriptJson = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
export interface Arm { topic: string; arm: 'rayner' | 'native'; file: string; bytes: number; gzipBytes: number; artifactHash: string; buildMs: number }
export async function buildComparison(directory: string) {
  directory = resolve(directory);
  await mkdir(directory, { recursive: true });
  const sourceFiles = ['shared.ts', 'rayner.ts', 'plain.ts', 'build.ts', 'compare.ts', 'model.test.ts'];
  const readSources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, hash(await readFile(join(HERE, file)))])));
  const sources = await readSources();
  const engineHash = (await buildInputs(resolve(HERE, '../..'))).hash;
  // Independent oracle tests precede both arms. Retain their actual output, including failures.
  const run = spawnSync(process.execPath, ['--test', join(HERE, 'model.test.ts')], { encoding: 'utf8' });
  const oracle = (run.stdout ?? '') + (run.stderr ?? '') + (run.error ? String(run.error) : '');
  await writeFile(join(directory, 'oracle.txt'), oracle);
  assert.equal(run.status, 0, `subject oracle tests failed: ${oracle}`);
  const font = JSON.parse(await readFile(join(HERE, '../../vendor/font-data-sfnt.json'), 'utf8')).SANS as string;
  const notices = (await readFile(join(HERE, '../../LICENSE'), 'utf8')) + '\n' + (await readFile(join(HERE, '../../vendor/licenses/Inter-OFL.txt'), 'utf8'));
  const frozen = JSON.stringify(PACKETS, null, 2) + '\n';
  await writeFile(join(directory, 'inputs.json'), frozen);
  const arms: Arm[] = [];
  const expected: Record<string, unknown> = {};
  for (const [topic, packet] of PACKETS.entries()) {
    const folder = join(directory, packet.id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'scene.ts'), `import {sceneFor} from ${JSON.stringify(join(HERE, 'rayner.ts'))}; export default sceneFor(${topic});\n`);
    await writeFile(join(folder, 'model.test.ts'), `import ${JSON.stringify(join(HERE, 'model.test.ts'))};\n`);
    const script = `# ${packet.question}\n\n- **Reader:** understands arrays and wants to predict the next operation.\n- **Answer:** ${packet.answer}\n- **Changed condition:** ${packet.cases.map((c) => c.label).join(' versus ')}.\n- **Reader's own work:** predict the next interval or queue contents, then change the case.\n- **Checked against:** JavaScript Array.findIndex and separate push/shift FIFO operations in \`model.test.ts\`; no outside runtime or learner study.\n- **Grounding:** live: JavaScript ${process.version}, independent Array operations in the model tests\n- **Leaves out:** ${packet.leaves}\n\n## Check yourself\n\n${packet.questions.map((q, i) => `${i + 1}. ${q.q}\n   ${q.a}`).join('\n')}\n`;
    await writeFile(join(folder, 'script.md'), script);
    const project = await collectProject(folder, { write: false });
    await checkProject(project, join(folder, 'checks'));
    // Trace/model parity is an admission condition, not inferred from a shared receipt hash.
    for (const c of packet.cases) {
      const scenario = project.scenarios.find((s) => s.values.case === c.id)!;
      assert.equal(scenario.trace.steps.length, c.steps.length);
      for (const [i, step] of c.steps.entries()) {
        const traced = scenario.trace.steps[i]!;
        assert.deepEqual((traced.state ?? traced.after).model, step.state);
        assert.equal(traced.meta.caption, step.caption);
        assert.equal(traced.meta.title, step.title);
      }
      await new scenario.Scene({
        skipUntil: Infinity, async frame() {},
        async stepEnd(scene, step) {
          expected[`${packet.id}/${c.id}/${step.name}`] = {
            paint: renderElements(scene, { relative: false }).map((r) => ({ ...r.attrs, ...(r.transform ? { transform: r.transform } : {}) })),
            minLabelSize: Math.min(...scene.familyMembers().filter((m) => !isHeading(m) && !!labelOf(m)?.text.trim() && m.style.opacity >= 0.95).map(readingLabelSize).filter((n): n is number => typeof n === 'number' && n > 0)),
          };
        },
      }).run();
    }
    let started = performance.now();
    const rayner = await buildExplainer(project, join(directory, `${packet.id}-rayner.html`));
    arms.push({ topic: packet.id, arm: 'rayner', file: `${packet.id}-rayner.html`, bytes: Buffer.byteLength(rayner.html), gzipBytes: gzipSync(rayner.html).length, artifactHash: hash(rayner.html), buildMs: performance.now() - started });
    started = performance.now();
    const result = await build({ entryPoints: [join(HERE, 'plain.ts')], bundle: true, format: 'iife', target: 'es2022', write: false, minify: true, metafile: true });
    assert.ok(Object.keys(result.metafile!.inputs).every((p) => !/(?:^|\/)(src|explain|app)\//.test(p)), 'native arm must not carry the engine or player');
    const js = result.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script');
    const first = packet.cases[0]!.steps[0]!;
    const posterCells = cells(first.state), start = -(posterCells.length - 1) * 1.1;
    const poster = `<text x="0" y="-3.4" font-size="0.65" text-anchor="middle">${escapeHtml(first.title)}</text><text x="0" y="-2.4" font-size="0.62" text-anchor="middle">${escapeHtml(summary(first.state))}</text>` + posterCells.map((tile, i) => {
      const x = start + i * 2.2;
      return `<rect x="${x - 1}" y="-0.7" width="2" height="1.4" fill="${tile.active ? '#dbeafe' : '#ffffff'}" stroke="#334155" stroke-width="0.035"/><text x="${x}" y="0" font-size="0.65" text-anchor="middle" dominant-baseline="middle">${escapeHtml(tile.label)}</text><text x="${x}" y="1.3" font-size="0.6" text-anchor="middle">${i}</text>`;
    }).join('');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(packet.question)}</title>
<style>@font-face{font-family:Shared;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font:16px/1.5 Shared,Arial,sans-serif}main{max-width:1100px;margin:auto;padding:16px}h1{font-size:1.5rem}svg{display:block;width:100%;height:auto;color:#172033;fill:currentColor}button,select{font:inherit;padding:8px}nav{display:flex;gap:12px}.caption{min-height:3em}</style>
<main><h1>${escapeHtml(packet.question)}</h1><label>Case <select id="case"></select></label><svg viewBox="-8 -4.5 16 9" role="img" aria-label="${escapeHtml(packet.question)}">${poster}</svg><nav><button id="back">Previous</button><button id="next">Next</button></nav><h2 id="step-title">${escapeHtml(first.title)}</h2><p id="line">${escapeHtml(first.line)}</p><p class="caption" aria-live="polite">${escapeHtml(first.caption)}</p><details><summary>Transcript</summary><div id="transcript">${packet.cases[0]!.steps.map((s) => `<p>${escapeHtml(`${s.title}. ${s.caption} ${summary(s.state)}. Slots: ${cells(s.state).map((c) => c.label).join(', ')}.`)}</p>`).join('')}</div></details><details><summary>Check yourself</summary>${packet.questions.map((q) => `<p>${escapeHtml(q.q)}</p><details><summary>Answer</summary>${escapeHtml(q.a)}</details>`).join('')}</details><p>${escapeHtml(packet.leaves)}</p></main>
<template id="licenses"><pre>${escapeHtml(notices)}</pre></template><script>window.packet=${scriptJson(packet)};${js}</script></html>`;
    const file = `${packet.id}-native.html`;
    await writeFile(join(directory, file), html);
    arms.push({ topic: packet.id, arm: 'native', file, bytes: Buffer.byteLength(html), gzipBytes: gzipSync(html).length, artifactHash: hash(html), buildMs: performance.now() - started });
  }
  assert.deepEqual(await readSources(), sources, 'adapter inputs changed during the campaign build');
  assert.equal(JSON.stringify(PACKETS, null, 2) + '\n', frozen, 'a rendering adapter mutated the shared inputs');
  assert.equal((await buildInputs(resolve(HERE, '../..'))).hash, engineHash, 'engine inputs changed during the campaign build');
  const manifest = { version: 1, scope: 'matched rendering fixture; no author-effort or learning outcomes', node: process.version,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { cwd: HERE, encoding: 'utf8' }).trim().length > 0,
    engineHash,
    seed: Number(process.env.FC_SEED ?? SEED), expanded: !!process.env.FULL,
    inputHash: hash(frozen), fontHash: hash(Buffer.from(font, 'base64')), sources, arms };
  await writeFile(join(directory, 'expected-paint.json'), JSON.stringify(expected) + '\n');
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await buildComparison(process.argv[2] ?? join(HERE, '../../out/rendering-comparison')), null, 2));

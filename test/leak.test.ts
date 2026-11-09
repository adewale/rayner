// Repeated seeks must not grow the heap: the embed re-runs the scene on every
// seek, and a reader may step back and forth for a long time.
// Memoized shaping and flattened glyph outlines are bounded by the fonts'
// glyph set, so after warm-up the heap must settle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/index.ts';
import { renderFrame, SnapshotSink } from '../src/output.ts';
import { traceScene, loadFonts } from '../explain/testing.ts';
import { explainer } from './lib/scenes.ts';

Scene.captionWpm = Infinity;

// --expose-gc puts gc() on the global object
const gc = (globalThis as { gc?: () => void }).gc;

test('50 seeks and traces leave the heap where 10 did (no per-run growth)', { skip: typeof gc !== 'function' && 'run with node --expose-gc' }, async () => {
  await loadFonts();
  const S = await explainer('token-bucket');
  const tr = await traceScene(S);
  const frames = tr.steps.map((s) => s.frame0 + 9);
  const heap = (): number => { gc!(); gc!(); return process.memoryUsage().heapUsed; };
  const cycle = async () => { for (const f of frames) await renderFrame(S, f, new SnapshotSink()); await traceScene(S); };
  for (let i = 0; i < 10; i++) await cycle();
  const after10 = heap();
  for (let i = 0; i < 40; i++) await cycle();
  const after50 = heap();
  const growth = (after50 - after10) / 1e6;
  assert.ok(growth < 8, `heap grew ${growth.toFixed(1)} MB over 40 extra cycles (${(after10 / 1e6).toFixed(0)} → ${(after50 / 1e6).toFixed(0)} MB)`);
});

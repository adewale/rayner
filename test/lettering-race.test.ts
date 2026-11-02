import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, NullSink, Text } from '../src/index.ts';
import { bindLettering } from '../src/lettering-outlines.ts';
import type { LetteringProvider } from '../src/lettering-outlines.ts';
// The compatibility adapter waits for plain runs already in progress when a
// lettered class is bound. Its constructor context cannot leak into those runs.
test('a plain run started before a lettered scene is bound never shapes text with its provider', async () => {
  const shapedByProvider: string[] = [];
  const provider: LetteringProvider = {
    shape(_font, text, size, fallback) {
      shapedByProvider.push(text);
      return fallback(text, size);
    },
    math() {
      throw new Error('no maths here');
    },
  };
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const running = new Promise<void>((r) => (started = r));
  // The lettered run remains active across the plain run's second Text.
  let releaseLettered!: () => void;
  const letteredGate = new Promise<void>((r) => (releaseLettered = r));

  class Plain extends Scene {
    override async construct() {
      new Text('before the lease', { fontSize: 0.4 });
      started();
      await gate;
      // Built while the lettered scene below is waiting for, or holding, its lease.
      new Text('plain words', { fontSize: 0.4 });
    }
  }
  class Lettered extends Scene {
    override async construct() {
      new Text('lettered words', { fontSize: 0.4 });
      await letteredGate;
    }
  }

  const plain = new Plain(new NullSink(), { skipUntil: Infinity }).run();
  await running;
  // Binding a lettered scene while Plain is mid-run.
  const Bound = bindLettering(Lettered, provider);
  const lettered = new Bound(new NullSink(), { skipUntil: Infinity }).run();
  // Let the lettered run reach its lease before Plain builds its second Text.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  release();
  await plain;
  releaseLettered();
  await lettered;

  assert.ok(shapedByProvider.includes('lettered words'), 'the lettered scene used its provider');
  assert.deepEqual(shapedByProvider.filter((t) => t !== 'lettered words'), [], 'the plain scene never used the lettered provider');
});

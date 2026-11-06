import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Scene } from '../src/index.ts';
import { SANS, MONO, FALLBACK } from '../src/font-data.ts';
import { prepareLettering } from '../tools/lib/lettering.ts';

test('concurrent captures publish complete embedded fonts without exposing partial writes', { timeout: 15_000 }, async (t) => {
  const folder = await fs.mkdtemp(join(tmpdir(), 'rayner-font-cache-'));
  const previous = process.env.RAYNER_LETTERING_FONTS;
  process.env.RAYNER_LETTERING_FONTS = folder;
  const expected = [SANS, MONO, ...FALLBACK.map(([, data]) => data)].map((data) => Buffer.from(data, 'base64'));
  class Styled extends Scene {
    static meta = { id: 'cache-audit', lettering: { styles: ['italic' as const] } };
    override async construct() {}
  }
  let started!: () => void, release!: () => void;
  const partial = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const write = fs.writeFile;
  let delayed = false;
  t.mock.method(fs, 'writeFile', async (...args: Parameters<typeof fs.writeFile>) => {
    if (!delayed && String(args[0]).endsWith('.woff2')) {
      delayed = true;
      // Hold the writer after a real open/truncate and a one-byte write.
      await write(args[0], Buffer.from(args[1] as Uint8Array).subarray(0, 1), args[2]);
      started();
      await held;
    }
    await write(...args);
  });
  syncBuiltinESMExports();
  let first: ReturnType<typeof prepareLettering> | undefined;
  try {
    const published = async () => {
      const files = (await fs.readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.woff2'));
      for (const file of files) {
        const bytes = await fs.readFile(join(folder, file.name));
        assert.ok(expected.some((font) => font.equals(bytes)), `${file.name}: readers must see a whole embedded font`);
      }
      return files.length;
    };
    first = prepareLettering(Styled, join(folder, 'first.ts'), true, false);
    await Promise.race([partial, first.then(() => { throw new Error('the controlled partial write was not exercised'); })]);
    await published(); // A pending cache entry may be absent, but never partial.
    assert.ok(await prepareLettering(Styled, join(folder, 'second.ts'), true, false));
    assert.equal(await published(), expected.length, 'the competing capture publishes every embedded font');
    release();
    assert.ok(await first);
    assert.equal(await published(), expected.length);
    assert.ok((await fs.readdir(folder, { withFileTypes: true })).every((entry) => entry.isFile()), 'temporary publication directories are removed');
  } finally {
    release();
    try { await first; } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      if (previous === undefined) delete process.env.RAYNER_LETTERING_FONTS;
      else process.env.RAYNER_LETTERING_FONTS = previous;
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
});

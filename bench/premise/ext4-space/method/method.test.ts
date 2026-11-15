// node --test bench/premise/ext4-space/method/method.test.ts
// The method's checks, without the engine: the model agrees with the oracle, and every step of every
// scenario renders words and pictures that state the recorded numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, GiB, RESERVES, SIZES, TiB, space } from '../../../../scenes/explainers/ext4-space/model.ts';
import type { Size } from '../../../../scenes/explainers/ext4-space/model.ts';
import { RUNS, metadataOf } from './oracle.ts';
import { CHECKS, SIZE_KEYS, steps } from './page.ts';

const BYTES: Record<string, number> = { '1g': GiB, '1t': TiB, '20t': 20 * TiB, '2g': 2 * GiB, '4194176m': 4194176 * 2 ** 20, '4t': 4 * TiB };

test('the model gives the recorded dumpe2fs, debugfs and statfs counts', () => {
  for (const [key, r] of Object.entries(RUNS)) {
    const [size, m] = key.split('/') as [string, string];
    const sp = space(BYTES[size]!, Number(m)),
      l = sp.layout;
    assert.deepEqual([l.blocks, sp.root, l.overhead, l.free, l.inodes, l.inodesPerGroup, l.reservedGdt], Object.values(r.dumpe2fs), key);
    assert.equal(l.files.root, r.debugfs.root / (BLOCK / 512), key);
    assert.equal(l.journal + l.files.journalTree, r.debugfs.journal / (BLOCK / 512), key);
    assert.equal(l.files.orphan, r.debugfs.orphan / (BLOCK / 512), key);
    assert.equal(l.files.lostFound, r.debugfs.lostFound / (BLOCK / 512), key);
    assert.equal(sp.users, r.statfs.bavail, key);
    assert.equal(l.metadata, metadataOf(r), key);
  }
});

test('every step of every scenario renders and states the recorded numbers', () => {
  for (const size of SIZE_KEYS)
    for (const m of RESERVES) {
      const all = steps(size as Size, m);
      assert.equal(all.length, m === 5 ? 6 : 7);
      for (const s of all) {
        for (const field of [s.title, s.caption, s.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object/, `${size} ${m} ${s.id}`);
        assert.match(s.svg, /^<svg [^>]*viewBox="0 0 400 \d+"/, `${size} ${m} ${s.id}`);
      }
      const r = RUNS[`${size}/${m}`]!;
      assert.ok(all[0]!.caption.includes(r.statfs.bavail.toLocaleString('en-US')), `${size} ${m}`);
      assert.ok(all[1]!.caption.includes(metadataOf(r).toLocaleString('en-US')), `${size} ${m}`);
    }
  assert.match(steps('1t', 5)[1]!.caption, /1\.0, 3\.0 and 12\.4 times all the metadata/);
  assert.equal(SIZES['1t'].label, '1 TiB');
});

test('the check answers are computed from the model', () => {
  assert.match(CHECKS[0]!.a, /26,214 reserved blocks against 26,284/);
  assert.match(CHECKS[1]!.a, /8,750,621 blocks against 17,138,715/);
  assert.match(CHECKS[2]!.a, /13,421,772 blocks/);
});

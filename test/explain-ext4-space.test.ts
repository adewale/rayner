// The ext4-space explainer's model, held to e2fsprogs's own rules and to real mkfs.ext4 runs, and its
// pies held to what Agentic Mermaid's legend prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Scene, NullSink, loadFonts } from '../src/index.ts';
import { Diagram } from '../explain/diagrams.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { readSnapshots } from '../tools/lib/explain-project.ts';
import {
  BLOCK,
  BLOCKS_PER_GROUP,
  GiB,
  INODE_RATIO,
  INODE_SIZE,
  JOURNAL_STEPS,
  RESERVES,
  SIZES,
  TiB,
  drawable,
  hasSuper,
  journalBlocks,
  kernelReserve,
  layout,
  legendShare,
  metadataPie,
  orphanBlocks,
  percent,
  rootReserve,
  sizeType,
  space,
  superGroups,
  wholePie,
} from '../scenes/explainers/lib/ext4-space.ts';
import type { Size } from '../scenes/explainers/lib/ext4-space.ts';

const MiB = 2 ** 20;

// ---------------------------------------------------------------- the source's own rules
test('the defaults and step tables are e2fsprogs v1.47.3’s', () => {
  // misc/mke2fs.conf.in:5-7 and :24-29.
  assert.deepEqual([BLOCK, INODE_SIZE], [4096, 256]);
  assert.deepEqual(INODE_RATIO, { default: 16384, big: 32768, huge: 65536 });
  assert.equal(BLOCKS_PER_GROUP, 32768);
  // misc/mke2fs.c:1433-1443: 512 MiB is default, 4 TiB is big, 16 TiB is huge.
  assert.throws(() => sizeType((512 * MiB) / BLOCK - 1));
  assert.equal(sizeType((512 * MiB) / BLOCK), 'default');
  assert.equal(sizeType((4 * TiB) / BLOCK - 1), 'default');
  assert.equal(sizeType((4 * TiB) / BLOCK), 'big');
  assert.equal(sizeType((16 * TiB) / BLOCK - 1), 'big');
  assert.equal(sizeType((16 * TiB) / BLOCK), 'huge');
  // lib/ext2fs/mkjournal.c:359-378, at each step and just under it.
  const table: [number, number][] = [
    [2047, -1],
    [2048, 1024],
    [32767, 1024],
    [32768, 4096],
    [256 * 1024, 8192],
    [512 * 1024, 16384],
    [4096 * 1024, 32768],
    [8192 * 1024, 65536],
    [16384 * 1024, 131072],
    [32768 * 1024, 262144],
    [2 ** 40, 262144],
  ];
  for (const [blocks, journal] of table) assert.equal(journalBlocks(blocks), journal, `${blocks} blocks`);
  // The scene's table: each step's first size and its journal, 16 MiB at 128 MiB up to 1 GiB at 128 GiB.
  assert.deepEqual(
    JOURNAL_STEPS.map((b) => [(b * BLOCK) / MiB, (journalBlocks(b) * BLOCK) / MiB]),
    [
      [128, 16],
      [1024, 32],
      [2048, 64],
      [16384, 128],
      [32768, 256],
      [65536, 512],
      [131072, 1024],
    ],
  );
  for (const b of JOURNAL_STEPS) assert.ok(journalBlocks(b - 1) < journalBlocks(b));
  // lib/ext2fs/orphan.c:222-232.
  assert.deepEqual([orphanBlocks(128 * 1024 - 1), orphanBlocks(128 * 1024), orphanBlocks(2 * 1024 * 1024 - 1), orphanBlocks(2 ** 40)], [32, 32, 511, 512]);
  // lib/ext2fs/closefs.c:23-55: the first groups with a superblock copy under sparse_super.
  assert.deepEqual(superGroups(130), [0, 1, 3, 5, 7, 9, 25, 27, 49, 81, 125]);
  // misc/mke2fs.c:2832-2833 in double arithmetic, truncated: 5% of 1 TiB is 13421772.8 blocks.
  assert.equal(rootReserve(2 ** 28, 5), 13421772);
  assert.equal(rootReserve(2 ** 28, 1), 2684354);
  // Linux fs/ext4/super.c:4276-4280: 2% or 4096 blocks, whichever is less.
  assert.deepEqual([kernelReserve(131072), kernelReserve(204800), kernelReserve(2 ** 28)], [2621, 4096, 4096]);
});

// ---------------------------------------------------------------- measured
// Measured on 2026-10-25 with e2fsprogs built from tag v1.47.3 (commit da631e117dcf8797bfda0f48bdaa05ac0fbcf7af,
// "mke2fs 1.47.3 (8-Jul-2025)", ./configure --disable-nls --disable-fuse2fs, installed mke2fs.conf identical to
// misc/mke2fs.conf.in) in debian:trixie-slim (debian@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad,
// linux/arm64), kernel 6.8.0-117-generic. For each size: truncate -s <size> on tmpfs; mkfs.ext4 -q -F -m <m>;
// dumpe2fs -h; debugfs -R "stat <ino>" Blockcount (512-byte sectors) for inodes 2 (root), 7 (resize),
// 8 (journal), 11 (lost+found) and 12 (orphan file); then mount -o loop and stat -f: f_blocks, f_bfree, f_bavail.
// [size, -m, [Block count, Reserved block count, Overhead clusters, Free blocks, Inode count, Inodes per group,
//  Reserved GDT blocks], [Blockcount of inodes 2, 7, 8, 11, 12], [f_blocks, f_bfree, f_bavail]]
type Run = [string, number, number[], number[], number[]];
const RUNS: Run[] = [
  ['512M', 5, [131072, 6553, 6347, 124687, 32768, 8192, 63], [8, 1520, 32768, 32, 256], [124725, 124687, 115513]],
  ['1G', 5, [262144, 13107, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 231922]],
  ['2G', 5, [524288, 26214, 26150, 498004, 131072, 8192, 255], [8, 12248, 131072, 32, 1024], [498138, 498004, 467694]],
  ['16G', 5, [4194304, 209715, 109857, 4083929, 1048576, 8192, 1024], [8, 90120, 262144, 32, 4096], [4084447, 4083929, 3870118]],
  ['32G', 5, [8388608, 419430, 209468, 8178622, 2097152, 8192, 1024], [8, 98312, 524288, 32, 4096], [8179140, 8178622, 7755096]],
  ['64G', 5, [16777216, 838860, 407669, 16369029, 4194304, 8192, 1024], [8, 106504, 1048576, 32, 4096], [16369547, 16369029, 15526073]],
  ['100G', 5, [26214400, 1310720, 557842, 25656040, 6553600, 8192, 1024], [8, 122888, 1048576, 32, 4096], [25656558, 25656040, 24341224]],
  ['128G', 5, [33554432, 1677721, 804095, 32749818, 8388608, 8192, 1024], [8, 122888, 2097160, 32, 4096], [32750337, 32749818, 31068001]],
  ['1T', 5, [268435456, 13421772, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 250514330]],
  ['4194176M', 5, [1073709056, 53685452, 17138196, 1056570341, 268427264, 8192, 1024], [8, 180232, 2097160, 32, 4096], [1056570860, 1056570341, 1002880793]],
  ['4T', 5, [1073741824, 53687091, 8750102, 1064991203, 134217728, 4096, 1024], [8, 180232, 2097160, 32, 4096], [1064991722, 1064991203, 1011300016]],
  ['8T', 5, [2147483648, 107374182, 17217559, 2130265570, 268435456, 4096, 1024], [8, 188424, 2097160, 32, 4096], [2130266089, 2130265570, 2022887292]],
  ['16777088M', 5, [4294934528, 214746726, 34129687, 4260804322, 536866816, 4096, 0], [8, 8, 2097160, 32, 4096], [4260804841, 4260804322, 4046053500]],
  ['16T', 5, [4294967296, 214748364, 17352729, 4277614049, 268435456, 2048, 0], [8, 0, 2097160, 32, 4096], [4277614567, 4277614049, 4062861589]],
  ['20T', 5, [5368709120, 268435456, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5078643681]],
  ['64T', 5, [17179869184, 858993459, 68640795, 17111227871, 1073741824, 2048, 0], [8, 0, 2097160, 32, 4096], [17111228389, 17111227871, 16252230316]],
  ['1G', 1, [262144, 2621, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 242408]],
  ['1G', 0, [262144, 0, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 245029]],
  ['1T', 1, [268435456, 2684354, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 261251748]],
  ['1T', 0, [268435456, 0, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 263936102]],
  ['20T', 1, [5368709120, 53687091, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5293392046]],
  ['20T', 0, [5368709120, 0, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5347079137]],
];
const bytesOf = (size: string) => Number(size.slice(0, -1)) * { M: MiB, G: GiB, T: TiB }[size.at(-1) as 'M' | 'G' | 'T'];

test('the model gives dumpe2fs’s counts for every measured size and reserve', () => {
  for (const [size, m, sb] of RUNS) {
    const sp = space(bytesOf(size), m),
      l = sp.layout;
    assert.deepEqual([l.blocks, sp.root, l.overhead, l.free, l.inodes, l.inodesPerGroup, l.reservedGdt], sb, `${size} -m ${m}`);
  }
});

test('the model gives debugfs’s block counts for the files mke2fs makes', () => {
  for (const [size, m, , files] of RUNS) {
    const l = layout(bytesOf(size));
    // The resize inode owns every reserved GDT block, in every group with a copy, plus its own index block.
    const resize = l.files.resize ? l.superGroups * l.reservedGdt + l.files.resize : 0;
    assert.deepEqual(
      files.map((sectors) => (sectors * 512) / BLOCK),
      [l.files.root, resize, l.journal + l.files.journalTree, l.files.lostFound, l.files.orphan],
      `${size} -m ${m}`,
    );
  }
});

test('the model gives the mounted kernel’s statfs: what users can write', () => {
  for (const [size, m, , , [fBlocks, fBfree, fBavail]] of RUNS) {
    const sp = space(bytesOf(size), m),
      l = sp.layout;
    // ext4_statfs: f_blocks leaves out the overhead; f_bavail leaves out both reserves.
    assert.deepEqual([l.blocks - l.overhead, l.free, sp.users], [fBlocks, fBfree, fBavail], `${size} -m ${m}`);
  }
});

test('the scene’s headline numbers', () => {
  const sp = space(TiB, 5),
    l = sp.layout;
  assert.equal(l.inodeTables, 4194304);
  assert.equal(l.journal, 262144);
  assert.equal(l.other, 38291 + 519);
  assert.equal(l.metadata, 4495258);
  assert.equal(percent(sp.users, l.blocks), '93.3%');
  assert.equal((sp.root / l.metadata).toFixed(2), '2.99');
  // At 1 GiB the kernel's 4096 blocks are 1.6% of the disk: users get 88.5%, not the 90.0% that free
  // blocks less the root reserve would give.
  const g = space(GiB, 5);
  assert.equal(percent(g.layout.free - g.root, g.layout.blocks), '90.0%');
  assert.equal(percent(g.users, g.layout.blocks), '88.5%');
  // At 20 TiB the huge type's inode tables are 1/256 of the disk.
  assert.equal(layout(20 * TiB).inodeTables * 256, 20 * TiB / BLOCK);
});

// ---------------------------------------------------------------- pies
test('every drawn slice’s legend share is the true share, rounded', () => {
  for (const size of Object.keys(SIZES) as Size[])
    for (const m of RESERVES) {
      const sp = space(SIZES[size].bytes, m),
        l = sp.layout;
      for (const stage of ['free', 'reserves', 'users'] as const) {
        const slices = wholePie(sp, stage);
        const sum = slices.reduce((n, s) => n + s.value, 0);
        for (const s of slices) assert.equal(legendShare(s.value / sum), legendShare(s.value / l.blocks), `${size} -m ${m} ${s.label}`);
        // Only a reserve too thin to draw is left out.
        const left = l.blocks - sum;
        assert.ok(left === 0 || (left === sp.kernel && !drawable(sp.kernel, l.blocks)), `${size} -m ${m} ${stage}`);
      }
      const meta = metadataPie(l);
      assert.equal(
        meta.reduce((n, s) => n + s.value, 0),
        l.metadata,
      );
      for (const s of meta) assert.ok(drawable(s.value, l.metadata));
    }
  // The legend's floor: a slice of 0.005% would read 0.1%, so it is not drawn.
  assert.equal(legendShare(0.00005), '0.1%');
  assert.equal(drawable(4096, 2 ** 28), false);
});

// ---------------------------------------------------------------- properties
const groupsOf128 = fc.integer({ min: 4, max: 524288 }).map((n) => n * BLOCKS_PER_GROUP * BLOCK);

test('every block is metadata or free, and the metadata is its parts', () => {
  fc.assert(
    fc.property(groupsOf128, fc.integer({ min: 0, max: 50 }), (bytes, m) => {
      const sp = space(bytes, m),
        l = sp.layout;
      assert.equal(l.metadata + l.free, l.blocks);
      assert.equal(l.inodeTables + l.journal + l.other, l.metadata);
      assert.equal(l.superCopies, superGroups(l.groups).length * (1 + l.descBlocks + l.reservedGdt));
      assert.equal(l.inodesPerGroup % 8, 0);
      assert.equal((l.inodesPerGroup * INODE_SIZE) % BLOCK, 0);
      assert.ok(l.inodes >= Math.floor((l.blocks * BLOCK) / l.inodeRatio));
      assert.ok(l.reservedGdt <= BLOCK / 4);
      assert.equal(sp.users, l.free - sp.root - sp.kernel);
      assert.ok(sp.root <= (l.blocks * m) / 100 && sp.root > (l.blocks * m) / 100 - 1);
    }),
    params(300),
  );
});

test('a group has a superblock copy exactly when it is 0, 1 or a power of 3, 5 or 7', () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 600000 }), (groups) => {
      const listed = new Set(superGroups(groups));
      for (const g of listed) assert.ok(hasSuper(g) && g < groups);
      // Spot-check groups not listed.
      for (const g of [groups - 1, Math.floor(groups / 2), Math.floor(groups / 3)]) if (!listed.has(g)) assert.ok(!hasSuper(g), `${g}`);
    }),
    params(300),
  );
});

test('a bigger disk never gets a smaller journal, nor a larger share of inode tables', () => {
  fc.assert(
    fc.property(groupsOf128, groupsOf128, (a, b) => {
      const [x, y] = a <= b ? [layout(a), layout(b)] : [layout(b), layout(a)];
      assert.ok(x.journal <= y.journal);
      assert.ok(y.inodeTables / y.blocks <= x.inodeTables / x.blocks);
    }),
    params(300),
  );
});

// ---------------------------------------------------------------- the captured pies
await loadFonts();
const store = await readSnapshots('scenes/explainers/ext4-space/scene');
async function described(text: string) {
  const s = Object.values(store).find((x): x is DiagramSnapshot => x.family === 'pie' && x.spec.source.includes(text));
  assert.ok(s, `no pinned pie with ${text}`);
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d.describe();
}

test('the captured 1 TiB pie says what users can write, as the model does', async () => {
  const sp = space(TiB, 5);
  // The answer's pie, not the opening's two-slice one, which also names what users can write.
  const seen = await described(`"Users can write" : ${sp.users}\n  "Root reserve" : ${sp.root}\n`);
  assert.equal(seen.what, 'Pie chart “Every 4 KiB block of 1 TiB”: 3 slices');
  assert.deepEqual(
    seen.parts.map((p) => p.name),
    ['Metadata: 1.7%', 'Users can write: 93.3%', 'Root reserve: 5.0%'],
  );
});

test('the captured 1 TiB opening pie says only what users can write and what they cannot', async () => {
  const sp = space(TiB, 5);
  const seen = await described(`"Not available" : ${sp.layout.blocks - sp.users}\n`);
  assert.equal(seen.what, 'Pie chart “Every 4 KiB block of 1 TiB”: 2 slices');
  assert.deepEqual(
    seen.parts.map((p) => p.name),
    ['Not available: 6.7%', 'Users can write: 93.3%'],
  );
});

test('at 2 GiB, a measured size, the default 5% root reserve falls short of the metadata, so meta.answer names its disks', () => {
  // From the recorded mkfs.ext4 run: metadata is every block statfs does not count as free.
  const [, , [blocks, root], , [, fBfree]] = RUNS.find(([size, m]) => size === '2G' && m === 5)!;
  assert.ok(root < blocks - fBfree, `measured 2 GiB: root ${root}, metadata ${blocks - fBfree}`);
  const sp = space(2 * GiB, 5);
  assert.deepEqual([sp.root, sp.layout.metadata], [root, blocks - fBfree]);
  assert.equal(sp.layout.journal, 2 * space(GiB, 5).layout.journal);
});

test('on each of the scene’s disks the default 5% root reserve is at least all the metadata, its meta.answer', () => {
  const cases: [number, string][] = [
    [GiB, '1.0'],
    [TiB, '3.0'],
    [20 * TiB, '12.4'],
  ];
  for (const [bytes, ratio] of cases) {
    const sp = space(bytes, 5);
    assert.ok(sp.root >= sp.layout.metadata, `${bytes}: root ${sp.root} < metadata ${sp.layout.metadata}`);
    assert.equal((sp.root / sp.layout.metadata).toFixed(1), ratio);
  }
});

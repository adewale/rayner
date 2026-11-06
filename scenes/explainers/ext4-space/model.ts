// Where the blocks of a new ext4 filesystem go, as `mkfs.ext4 -m <percent>` lays them out with its
// default settings, and how many of them a user other than root can then write.
// Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// Every constant and rule is transcribed from e2fsprogs at tag v1.47.3
// (commit da631e117dcf8797bfda0f48bdaa05ac0fbcf7af):
//   misc/mke2fs.conf.in:5-7      blocksize = 4096, inode_size = 256, inode_ratio = 16384
//   misc/mke2fs.conf.in:14       ext4 features: has_journal, extent, flex_bg, metadata_csum, 64bit, orphan_file, ...
//                                (base_features, :2, add sparse_super and resize_inode)
//   misc/mke2fs.conf.in:24-29    big = { inode_ratio = 32768 }, huge = { inode_ratio = 65536 }
//   misc/mke2fs.c:1433-1443      size type: small under 512 MiB, default under 4 TiB, big under 16 TiB, else huge
//   misc/mke2fs.c:2321-2323      a 64bit filesystem of more than 2^32 - 1 blocks drops resize_inode
//   misc/mke2fs.c:2375-2378      reserved_ratio defaults to 5.0
//   misc/mke2fs.c:2811-2812      inodes = blocks * blocksize / inode_ratio
//   misc/mke2fs.c:2832-2833      reserved blocks = reserved_ratio * blocks / 100.0, truncated
//   misc/mke2fs.c:3484-3486, 3602, 3648-3650  s_overhead_clusters: the blocks in use once the group
//                                metadata is laid out, plus the journal
//   misc/mke2fs.c:475-481, 520-555  the root directory (1 block) and lost+found (grown to 16 KiB, 4 blocks)
//   misc/mke2fs.c:3656-3667      the orphan file, of ext2fs_default_orphan_file_blocks
//   lib/ext2fs/initialize.c:58-86   calc_reserved_gdt_blocks: room for the descriptors of 1024 times the
//                                filesystem, or of 2^32 blocks, at most 1024 blocks
//   lib/ext2fs/initialize.c:266, 294-296, 306-307  blocks per group = blocksize * 8; groups and
//                                descriptor blocks rounded up
//   lib/ext2fs/initialize.c:323-376  inodes per group: rounded up to fill whole inode-table blocks, then
//                                down to a multiple of 8
//   lib/ext2fs/closefs.c:23-55   sparse_super: groups 0 and 1 and the powers of 3, 5 and 7 hold a copy of
//                                the superblock and the descriptors (with the reserved GDT blocks after them)
//   lib/ext2fs/ext2_fs.h:281     EXT2_MIN_DESC_SIZE_64BIT 64
//   lib/ext2fs/mkjournal.c:359-378  ext2fs_default_journal_size, from 1024 blocks up to 262144
//   lib/ext2fs/orphan.c:217-232  orphan file: 32 blocks, blocks / 4096, or 512
//   lib/ext2fs/ext3_extents.h:99 EXT_INIT_MAX_LEN 1 << 15; an inode's 60-byte i_block holds a 12-byte
//                                extent header and 4 extents of 12 bytes (lib/ext2fs/extent.c:181), so a
//                                journal of more than 4 extents takes one more block for the extent tree
// And from Linux v6.8, the kernel the measurements ran on (6.8.0):
//   fs/ext4/super.c:4255-4283    ext4_set_resv_clusters: at mount, 2% of the blocks or 4096, whichever is less
//   fs/ext4/balloc.c:620-666     ext4_has_free_clusters: a user other than root allocates only while free
//                                blocks exceed the root reserve plus that mount reserve
//   fs/ext4/super.c:6807-6829    ext4_statfs: f_bavail = free - (reserved + mount reserve)
//
// The model covers what the scene shows: a whole number of 128 MiB block groups from 512 MiB to 64 TiB,
// with the default mke2fs.conf. test/explain-ext4-space.test.ts holds it to mkfs.ext4 1.47.3 runs.

import { percent as formatPercent } from '../lib/format.ts';

export const BLOCK = 4096;
export const INODE_SIZE = 256;
export const BLOCKS_PER_GROUP = BLOCK * 8;
export const DESC_SIZE = 64;
export const DESC_PER_BLOCK = BLOCK / DESC_SIZE;
export const ADDR_PER_BLOCK = BLOCK / 4;
export const MAX_32 = 2 ** 32 - 1;
export const DEFAULT_RESERVE = 5;
export const KERNEL_RESERVE_MAX = 4096;
const EXTENT_MAX = 2 ** 15;
const EXTENTS_IN_INODE = 4;
const MiB = 2 ** 20;
export const GiB = 2 ** 30;
export const TiB = 2 ** 40;

export type SizeType = 'default' | 'big' | 'huge';
/** mke2fs.c:1433-1443, in 4 KiB blocks: `meg` is 256 blocks. */
export function sizeType(blocks: number): SizeType {
  const meg = MiB / BLOCK;
  if (blocks < 512 * meg) throw new Error('Under 512 MiB mke2fs picks the small type, with 1 KiB blocks');
  if (blocks < 4 * 1024 * 1024 * meg) return 'default';
  if (blocks < 16 * 1024 * 1024 * meg) return 'big';
  return 'huge';
}
export const INODE_RATIO: Record<SizeType, number> = { default: 16384, big: 32768, huge: 65536 };

/** ext2fs_default_journal_size (mkjournal.c:359-378), in blocks. */
export function journalBlocks(blocks: number): number {
  if (blocks < 2048) return -1;
  if (blocks < 32768) return 1024;
  if (blocks < 256 * 1024) return 4096;
  if (blocks < 512 * 1024) return 8192;
  if (blocks < 4096 * 1024) return 16384;
  if (blocks < 8192 * 1024) return 32768;
  if (blocks < 16384 * 1024) return 65536;
  if (blocks < 32768 * 1024) return 131072;
  return 262144;
}

/** The disk sizes, in blocks, from 128 MiB up, where the journal steps up: 16 MiB at 128 MiB, and so on. */
export const JOURNAL_STEPS = [32768, 256 * 1024, 512 * 1024, 4096 * 1024, 8192 * 1024, 16384 * 1024, 32768 * 1024] as const;

/** ext2fs_default_orphan_file_blocks (orphan.c:222-232). */
export function orphanBlocks(blocks: number): number {
  if (blocks < 128 * 1024) return 32;
  if (blocks < 2 * 1024 * 1024) return Math.floor(blocks / 4096);
  return 512;
}

/** test_root and ext2fs_bg_has_super (closefs.c:23-55) with sparse_super. */
export function hasSuper(group: number): boolean {
  if (group <= 1) return true;
  if (!(group & 1)) return false;
  const root = (a: number, b: number) => {
    for (;;) {
      if (a < b) return false;
      if (a === b) return true;
      if (a % b) return false;
      a = a / b;
    }
  };
  return root(group, 3) || root(group, 5) || root(group, 7);
}
/** The groups that hold a superblock copy: 0, 1 and the powers of 3, 5 and 7 below `groups`. */
export function superGroups(groups: number): number[] {
  const out = new Set<number>([0]);
  if (groups > 1) out.add(1);
  for (const b of [3, 5, 7]) for (let g = b; g < groups; g *= b) out.add(g);
  return [...out].sort((a, b) => a - b);
}

/** The layout mkfs.ext4 writes for a filesystem of `bytes`, in 4 KiB blocks. */
export interface Layout {
  bytes: number;
  blocks: number;
  type: SizeType;
  inodeRatio: number;
  groups: number;
  inodes: number;
  inodesPerGroup: number;
  /** Inode-table blocks in each group, and in all. */
  tableBlocksPerGroup: number;
  inodeTables: number;
  descBlocks: number;
  resizeInode: boolean;
  reservedGdt: number;
  /** Groups with a superblock copy; each holds 1 + descBlocks + reservedGdt blocks. */
  superGroups: number;
  superCopies: number;
  /** A block bitmap and an inode bitmap for every group. */
  bitmaps: number;
  journal: number;
  /** dumpe2fs's "Overhead clusters": superblock copies, bitmaps, inode tables and journal. */
  overhead: number;
  /** The files mke2fs makes: root directory, lost+found, orphan file, resize inode, journal extent block. */
  files: { root: number; lostFound: number; orphan: number; resize: number; journalTree: number };
  filesTotal: number;
  /** Superblock copies, bitmaps and the files: every used block but inode tables and journal. */
  other: number;
  /** Every block in use. */
  metadata: number;
  /** dumpe2fs's "Free blocks". */
  free: number;
}

export function layout(bytes: number): Layout {
  if (bytes % (BLOCKS_PER_GROUP * BLOCK)) throw new Error('The model covers whole 128 MiB block groups');
  if (bytes > 64 * TiB) throw new Error('The model is checked up to 64 TiB');
  const blocks = bytes / BLOCK;
  const type = sizeType(blocks);
  const inodeRatio = INODE_RATIO[type];
  const groups = Math.ceil(blocks / BLOCKS_PER_GROUP);
  // mke2fs.c:2788-2812: blocks * blocksize / inode_ratio, at most 2^32 - 1 with 64bit.
  const asked = Math.min(Math.floor((blocks * BLOCK) / inodeRatio), MAX_32);
  // initialize.c:323-376.
  let ipg = Math.ceil(asked / groups);
  if (ipg > BLOCK * 8) throw new Error('Outside the model: mke2fs would shrink the groups');
  let tableBlocksPerGroup = Math.ceil((ipg * INODE_SIZE) / BLOCK);
  ipg = (tableBlocksPerGroup * BLOCK) / INODE_SIZE;
  ipg = Math.max(ipg, 8) & ~7;
  tableBlocksPerGroup = Math.ceil((ipg * INODE_SIZE) / BLOCK);
  if (ipg * groups > MAX_32) throw new Error('Outside the model: mke2fs would trim the inodes per group');
  const inodes = ipg * groups;
  const descBlocks = Math.ceil(groups / DESC_PER_BLOCK);
  const resizeInode = blocks <= MAX_32;
  let reservedGdt = 0;
  if (resizeInode) {
    // initialize.c:58-86, with s_first_data_block 0 for 4 KiB blocks.
    const max = blocks < Math.floor(MAX_32 / 1024) ? blocks * 1024 : MAX_32;
    const rsvGroups = Math.ceil(max / BLOCKS_PER_GROUP);
    reservedGdt = Math.min(Math.max(Math.ceil(rsvGroups / DESC_PER_BLOCK) - descBlocks, 0), ADDR_PER_BLOCK);
  }
  const supers = superGroups(groups).length;
  const superCopies = supers * (1 + descBlocks + reservedGdt);
  const bitmaps = 2 * groups;
  const inodeTables = groups * tableBlocksPerGroup;
  const journal = journalBlocks(blocks);
  const overhead = superCopies + bitmaps + inodeTables + journal;
  const files = {
    root: 1,
    lostFound: 4,
    orphan: orphanBlocks(blocks),
    resize: resizeInode ? 1 : 0,
    journalTree: Math.ceil(journal / EXTENT_MAX) > EXTENTS_IN_INODE ? 1 : 0,
  };
  const filesTotal = files.root + files.lostFound + files.orphan + files.resize + files.journalTree;
  const metadata = overhead + filesTotal;
  return {
    bytes,
    blocks,
    type,
    inodeRatio,
    groups,
    inodes,
    inodesPerGroup: ipg,
    tableBlocksPerGroup,
    inodeTables,
    descBlocks,
    resizeInode,
    reservedGdt,
    superGroups: supers,
    superCopies,
    bitmaps,
    journal,
    overhead,
    files,
    filesTotal,
    other: superCopies + bitmaps + filesTotal,
    metadata,
    free: blocks - metadata,
  };
}

/** mke2fs.c:2832-2833: the double product, truncated when it is stored. */
export const rootReserve = (blocks: number, percent: number) => Math.floor((percent * blocks) / 100.0);
/** ext4_set_resv_clusters (super.c:4276-4280), with clusters equal to blocks. */
export const kernelReserve = (blocks: number) => Math.min(Math.floor(blocks / 50), KERNEL_RESERVE_MAX);

export interface Space {
  layout: Layout;
  percent: number;
  root: number;
  kernel: number;
  /** f_bavail once mounted: what a user other than root can write. */
  users: number;
}
export function space(bytes: number, percent: number): Space {
  const l = layout(bytes);
  const root = rootReserve(l.blocks, percent),
    kernel = kernelReserve(l.blocks);
  return { layout: l, percent, root, kernel, users: Math.max(l.free - root - kernel, 0) };
}

// ---------------------------------------------------------------- the scene's scenarios
export type Size = '1g' | '1t' | '20t';
export const SIZES: Record<Size, { bytes: number; label: string }> = {
  '1g': { bytes: GiB, label: '1 GiB' },
  '1t': { bytes: TiB, label: '1 TiB' },
  '20t': { bytes: 20 * TiB, label: '20 TiB' },
};
export const RESERVES = [5, 1, 0] as const;

// ---------------------------------------------------------------- pies
export interface Slice {
  label: string;
  value: number;
}
/** Agentic Mermaid 0.4.1's legend share: one decimal, and never under 0.1% for a slice it draws. */
export const legendShare = (fraction: number) =>
  fraction > 0 ? `${Math.max(0.1, Math.round(fraction * 1e3) / 10).toFixed(1)}%` : '0.0%';
/**
 * A slice is drawn only if the legend can state its share: from 0.05% up, the legend's rounding is
 * honest; under that it would print 0.1%. A slice left out is named in the caption and card instead.
 */
export const drawable = (value: number, whole: number) => value / whole >= 0.0005;

/** The metadata pie: its whole is every block in use. */
export const metadataPie = (l: Layout): Slice[] => [
  { label: 'Inode tables', value: l.inodeTables },
  { label: 'Journal', value: l.journal },
  { label: 'Other metadata', value: l.other },
];

export type WholeStage = 'free' | 'reserves' | 'users';
/**
 * The pie of every block. 'free' splits it into metadata and free blocks; 'reserves' takes both reserves
 * out of the free blocks; 'users' names what is left.
 */
export function wholePie(sp: Space, stage: WholeStage): Slice[] {
  const l = sp.layout;
  const slices: Slice[] = [{ label: 'Metadata', value: l.metadata }];
  if (stage === 'free') return [...slices, { label: 'Free', value: l.free }];
  slices.push({ label: stage === 'users' ? 'Users can write' : 'Free', value: sp.users });
  if (sp.kernel > 0 && drawable(sp.kernel, l.blocks)) slices.push({ label: 'Kernel reserve', value: sp.kernel });
  if (sp.root > 0 && drawable(sp.root, l.blocks)) slices.push({ label: 'Root reserve', value: sp.root });
  return slices;
}

// ---------------------------------------------------------------- words
/** 268435456 -> "268,435,456". */
export const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** A share of a whole: one decimal from 1% up, two significant digits under it (0.40%, 0.014%). */
export const percent = (part: number, whole: number): string => formatPercent(part, { of: whole, under1: { significant: 2 } });
/** Blocks of 4 KiB in the largest whole binary unit: 262144 -> "1 GiB", 4096 -> "16 MiB". */
export function bytesOf(blocks: number): string {
  const b = blocks * BLOCK;
  for (const [unit, size] of [
    ['TiB', TiB],
    ['GiB', GiB],
    ['MiB', MiB],
  ] as const)
    if (b >= size && b % size === 0) return `${b / size} ${unit}`;
  for (const [unit, size] of [
    ['TiB', TiB],
    ['GiB', GiB],
    ['MiB', MiB],
  ] as const)
    if (b >= size) return `${(b / size).toFixed(1)} ${unit}`;
  return `${b / 1024} KiB`;
}
/** "3.0 times" */
export const times = (a: number, b: number) => `${(a / b).toFixed(1)} times`;

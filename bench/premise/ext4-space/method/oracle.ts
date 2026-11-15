// The oracle: mkfs.ext4 1.47.3 runs on empty disks, mounted under Linux 6.8.0, copied from
// scenes/explainers/ext4-space/model.test.ts (RUNS, lines 34-55), where they were recorded on 2026-10-25.
// Each run: dumpe2fs's block count, reserved block count, overhead clusters, free blocks, inode count,
// inodes per group and reserved GDT blocks; debugfs's Blockcount (512-byte sectors) of inodes 2 (root),
// 7 (resize), 8 (journal), 11 (lost+found) and 12 (orphan file); then statfs's f_blocks, f_bfree and f_bavail.
// The method-only page draws its df step and its closing table from these values, not from the model, and
// method.test.ts requires the model to agree with them.
export interface Run {
  dumpe2fs: { blocks: number; reserved: number; overhead: number; free: number; inodes: number; inodesPerGroup: number; reservedGdt: number };
  /** 512-byte sectors, as debugfs's stat reports Blockcount. */
  debugfs: { root: number; resize: number; journal: number; lostFound: number; orphan: number };
  statfs: { blocks: number; bfree: number; bavail: number };
}
const run = (sb: number[], files: number[], st: number[]): Run => ({
  dumpe2fs: { blocks: sb[0]!, reserved: sb[1]!, overhead: sb[2]!, free: sb[3]!, inodes: sb[4]!, inodesPerGroup: sb[5]!, reservedGdt: sb[6]! },
  debugfs: { root: files[0]!, resize: files[1]!, journal: files[2]!, lostFound: files[3]!, orphan: files[4]! },
  statfs: { blocks: st[0]!, bfree: st[1]!, bavail: st[2]! },
});

/** Keyed by `${size}/${reserve}`: the scene's three disks at -m 5, 1 and 0, and the check questions' disks at -m 5. */
export const RUNS: Record<string, Run> = {
  '1g/5': run([262144, 13107, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 231922]),
  '1g/1': run([262144, 2621, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 242408]),
  '1g/0': run([262144, 0, 12949, 249125, 65536, 8192, 127], [8, 5088, 65536, 32, 512], [249195, 249125, 245029]),
  '1t/5': run([268435456, 13421772, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 250514330]),
  '1t/1': run([268435456, 2684354, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 261251748]),
  '1t/0': run([268435456, 0, 4494739, 263940198, 67108864, 8192, 1024], [8, 155656, 2097160, 32, 4096], [263940717, 263940198, 263936102]),
  '20t/5': run([5368709120, 268435456, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5078643681]),
  '20t/1': run([5368709120, 53687091, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5293392046]),
  '20t/0': run([5368709120, 0, 21625369, 5347083233, 335544320, 2048, 0], [8, 0, 2097160, 32, 4096], [5347083751, 5347083233, 5347079137]),
  '2g/5': run([524288, 26214, 26150, 498004, 131072, 8192, 255], [8, 12248, 131072, 32, 1024], [498138, 498004, 467694]),
  '4194176m/5': run([1073709056, 53685452, 17138196, 1056570341, 268427264, 8192, 1024], [8, 180232, 2097160, 32, 4096], [1056570860, 1056570341, 1002880793]),
  '4t/5': run([1073741824, 53687091, 8750102, 1064991203, 134217728, 4096, 1024], [8, 180232, 2097160, 32, 4096], [1064991722, 1064991203, 1011300016]),
};
/** Every block in use once mkfs is done: the block count less dumpe2fs's free blocks. */
export const metadataOf = (r: Run) => r.dumpe2fs.blocks - r.dumpe2fs.free;

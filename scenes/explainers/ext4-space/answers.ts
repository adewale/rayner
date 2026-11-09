// The script's answer and the answers to its reader questions, computed from the model: rayner check holds script.md's to these.
import { BLOCK, BLOCKS_PER_GROUP, DEFAULT_RESERVE, GiB, SIZES, TiB, bytesOf, space } from './model.ts';
import type { Size } from './model.ts';
import { grouped, listed } from '../lib/format.ts';

const keys = Object.keys(SIZES) as Size[];
const RATIOS = keys.map((k) => {
  const x = space(SIZES[k].bytes, DEFAULT_RESERVE);
  return (x.root / x.layout.metadata).toFixed(1);
});
/** The disks the answers compare: 1 and 2 GiB, either side of 4 TiB, and 1 TiB with and without the reserve. */
export const TWO = space(2 * GiB, DEFAULT_RESERVE),
  ONE = space(GiB, DEFAULT_RESERVE),
  BELOW = space(4 * TiB - BLOCKS_PER_GROUP * BLOCK, DEFAULT_RESERVE),
  BIG = space(4 * TiB, DEFAULT_RESERVE),
  T5 = space(TiB, DEFAULT_RESERVE),
  T0 = space(TiB, 0);

export const answer = () =>
  `Much of it is free space held back for root: the default 5% reserve is ${listed(RATIOS)} times all the metadata on the ${listed(keys.map((k) => SIZES[k].label))} disks`;

export const questions = {
  1: () => ({
    question: `On the 1 GiB disk the default reserve just covers the metadata. Going to 2 GiB doubles the reserve, and also doubles the journal, from ${bytesOf(ONE.layout.journal)} to ${bytesOf(TWO.layout.journal)}. Does the 5% reserve still cover all the metadata?`,
    answer: `No, it falls just short: ${grouped(TWO.root)} reserved blocks against ${grouped(TWO.layout.metadata)} of metadata, ${(TWO.root / TWO.layout.metadata).toFixed(3)} times. The journal is most of the metadata on a disk this small, so doubling it grows the metadata about as fast as the 5% reserve. These are the counts a recorded mkfs.ext4 1.47.3 run at 2 GiB gives.`,
  }),
  2: () =>
    `The bigger disk has less. Its inode tables are about half the size, so its metadata is ${grouped(BIG.layout.metadata)} blocks against ${grouped(BELOW.layout.metadata)}, and users can write ${bytesOf(BIG.users - BELOW.users)} more although the disk grew by only 128 MiB.`,
  3: () =>
    `They get back the root reserve, ${grouped(T5.root)} blocks or ${bytesOf(T5.root)}, which was free all along. The ${grouped(T5.layout.metadata)} blocks of inode tables, journal and other metadata stay, and so do the kernel’s ${grouped(T0.kernel)}.`,
};

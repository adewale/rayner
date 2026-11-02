# Script: where does an empty ext4 filesystem's space go?

Questions the reader brings: I formatted a new disk and df already shows less than I bought. Is it the inode tables? The journal? Can I get it back?

Start from a real run. mkfs.ext4 1.47.3 with no options on an empty 1 TiB disk, mounted and asked with statfs (what df reads): a user other than root can write 250,514,330 of its 268,435,456 blocks, 93.3%. 68.4 GiB is gone before a single file is written. Ask the reader to guess where.

Most readers guess metadata: inode tables, the journal. The answer is the reserve. Without -m, mke2fs reserves 5% of the blocks for root, 13,421,772 blocks, which only root may fill: 3.0 times all the metadata (4,495,258 blocks, 1.7%). The kernel holds back 4,096 more once mounted. Free blocks less both reserves is exactly what statfs reports. The default 5% reserve for root takes as much space as all the metadata, or more: about the same at 1 GiB, 3.0 times at 1 TiB, 12.4 times at 20 TiB.

Then the metadata itself, as a pie of its own. Inode tables are most of it: an inode records one file, and mke2fs sets a fixed number aside by the disk's size type (default: one 256-byte inode per 16 KiB of disk), 93.3% of the metadata on 1 TiB. The journal doubles with disk size and stops at 1 GiB, 5.8%. The rest is superblock copies in a sparse set of groups, two bitmaps a group and the first few files.

The settings are the lever. -m 1 or -m 0 shrinks only the root reserve; the metadata stays. Size shows that metadata shrinks as a share of the disk (5.0%, 1.7%, 0.40%) while a percentage reserve grows with it.

**The aha:** the opening pie's grey "Not available" slice splits, and most of it turns out to be the red root reserve, not metadata.

**Sentence to remember:** on a new ext4 disk the default 5% reserve for root takes as much space as all the metadata, or more, and -m changes it without touching the metadata.

**Check questions**, in `meta.checks`, asked after the last step:

1. A new 1 TiB ext4 disk shows 93.3% available. What takes most of the missing 6.7%?
2. Of the 1 TiB disk's metadata, what is the biggest part?
3. Would formatting the 1 TiB disk with -m 0 free any of the metadata?

Colours: one key across every whole-disk pie. Metadata is grey (as the opening's "Not available" slice it becomes), users green, the kernel reserve orange and the root reserve red; the metadata pie has its own three colours.

| Step | Script | Reader predicts |
| --- | --- | --- |
| df | paragraph 1: the measured run and the missing space | where it went |
| reserve | paragraph 2: the answer and the aha | what fills the metadata |
| inodes | paragraph 3: inode tables and the size type | |
| journal | paragraph 3: the journal | |
| other | paragraph 3: the rest | |
| chosen (only with -m 1 or 0) | paragraph 4: the reserve changed | |
| sizes | paragraph 4: three disk sizes | |

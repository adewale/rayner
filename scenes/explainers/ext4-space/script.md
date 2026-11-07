# Where does an empty ext4 filesystem’s space go?

- **Reader:** formats disks or runs Linux servers, has seen `df` report less space than the disk holds on a filesystem with nothing on it, and assumes the filesystem's own structures ate it.
- **Answer:** Much of it is free space held back for root: the default 5% reserve is 1.0, 3.0 and 12.4 times all the metadata on the 1 GiB, 1 TiB and 20 TiB disks
- **Changed condition:** the root reserve and the disk size. Formatting with `-m 1` or `-m 0` hands reserved blocks to ordinary users and leaves every inode table and the journal where they were, which shows the space was free all along. The size changes the balance: the reserve grows with the disk while the journal stops at 1 GiB and the largest disks get fewer inodes per byte, so at 20 TiB the reserve is twelve times the metadata and at 1 GiB it only just covers it.
- **Reader's own work:** predict where the missing space went, then what fills the metadata; choose a smaller reserve and another disk size; answer the check questions on a 2 GiB disk, the 4 TiB size-type switch and `tune2fs -m 0`.
- **Checked against:** mkfs.ext4 1.47.3 runs recorded for 22 sizes and reserves from 512 MiB to 64 TiB (dumpe2fs counts, debugfs block counts of the files mke2fs makes, and statfs on the filesystem mounted under Linux 6.8.0), frozen in `model.test.ts`; the model must reproduce every count, and `answers.ts` computes the answer and check answers from it. Its constants and rules are transcribed from e2fsprogs v1.47.3 and Linux v6.8 source, with the lines cited in `model.ts`.
- **Leaves out:** every mkfs option but `-m`, block sizes other than 4 KiB, quotas, snapshots and the space a working filesystem later uses; there is no fixed overhead percentage that holds for every ext4 filesystem.

## Check yourself

1. On the 1 GiB disk the default reserve just covers the metadata. Going to 2 GiB doubles the reserve, and also doubles the journal, from 32 MiB to 64 MiB. Does the 5% reserve still cover all the metadata?
   No, it falls just short: 26,214 reserved blocks against 26,284 of metadata, 0.997 times. The journal is most of the metadata on a disk this small, so doubling it grows the metadata about as fast as the 5% reserve. These are the counts a recorded mkfs.ext4 1.47.3 run at 2 GiB gives.
2. At 4 TiB mke2fs switches to its big type, with one inode per 32 KiB of disk instead of 16 KiB. How does a 4 TiB disk’s metadata compare with that of a disk 128 MiB smaller?
   The bigger disk has less. Its inode tables are about half the size, so its metadata is 8,750,621 blocks against 17,138,715, and users can write 32.1 GiB more although the disk grew by only 128 MiB.
3. An administrator runs tune2fs -m 0 on the 1 TiB disk to reclaim the filesystem’s overhead. What do users get back, and what stays?
   They get back the root reserve, 13,421,772 blocks or 51.2 GiB, which was free all along. The 4,495,258 blocks of inode tables, journal and other metadata stay, and so do the kernel’s 4,096.

## Why this explainer

A freshly formatted one-tebibyte disk lets an ordinary user write only 93.3% of it. The usual explanation, "filesystem overhead", runs two different things together: blocks the filesystem has already filled with its own structures, and blocks that are free but held back. The point of the explainer is that distinction. On the default disk the root reserve is three times all the metadata, so most of the "missing" space is not taken at all; "not available to me" does not mean "already filled".

The story opens on what `df` shows, a measured number, and asks where the rest went before naming any structure. The reserve is the answer; the metadata steps that follow show where the occupied part goes, inode tables first because they are a promise about files that do not exist yet, then the journal, then the rest. The kernel's small mount reserve is kept separate from the root reserve throughout, and neither is ever merged into metadata.

Lowering the reserve is the reader's lever because it is the experiment that separates the two kinds of block: users gain space and not one metadata block moves. Disk size is there because it changes the balance, and the 1 GiB disk is included so the reader does not conclude the reserve always dwarfs the metadata. Every figure comes from the model and the model reproduces the recorded mkfs runs, so the numbers on the page are what a real disk gives.

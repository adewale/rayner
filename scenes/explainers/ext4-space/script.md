# Where does an empty ext4 filesystem’s space go?

Format a one-tebibyte disk as ext4, mount it, and ask `df` how much you can write. No file has been written, yet an ordinary user can fill only 93.3% of the blocks. About 68.4 GiB is gone. Is all of that taken by the filesystem's own structures?

Most of it is not taken at all. With no options, mke2fs sets aside 5% of the blocks for root. Those blocks are free, but an ordinary user may not write to them, so `df` leaves them out of the space available. On this disk the reserve is three times all the metadata.

So the missing space has two kinds of block in it. Metadata blocks are already occupied. Reserved blocks are free and held back: the root reserve, plus a much smaller one the kernel keeps once the filesystem is mounted. "Not available to me" does not mean "already filled".

The metadata is still worth a look, because its biggest part is a promise about the future. Inode tables hold one record per file, and mke2fs builds them for every file the disk might ever hold, at one inode per 16 KiB of disk on this size of disk. They are most of the metadata here. The journal, which lets the filesystem recover after a crash, doubles in size with the disk and stops at one gibibyte. Superblock copies, bitmaps and the first few files make up the rest.

Lowering the reserve shows which part is which. Formatting with `-m 1` or `-m 0` hands some or all of the reserved blocks to ordinary users and leaves every inode table and the journal where they were. The space you get back was free all along.

Disk size changes the balance. The reserve is a percentage, so it grows with the disk, while the journal stops growing and the largest disks get fewer inodes per byte. At 20 TiB the reserve is twelve times the metadata. On small disks the two are close: at 1 GiB the reserve only just covers the metadata, which is mostly journal, so anything that makes the journal jump can tip the balance.

These figures come from mkfs.ext4 1.47.3's defaults with 4 KiB blocks, checked against recorded formatting runs and a mounted Linux 6.8 kernel. Other mkfs options, quotas and the space a workload later uses are outside them, and there is no fixed overhead percentage that holds for every ext4 filesystem.

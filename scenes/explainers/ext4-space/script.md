# Where does an empty ext4 filesystem’s space go?

A newly formatted one-tebibyte ext4 filesystem has no user files, yet an ordinary user can write only about 93.3% of its blocks. The missing share is roughly 68.4 GiB. Is all of it occupied by the filesystem’s own structures?

Most of it is a reservation. With the defaults used here, mke2fs sets aside 5% of the blocks for privileged use. Those blocks can be free while still excluded from the space available to an ordinary writer. On the one-tebibyte example that reserve is about three times the metadata.

The accounting separates these categories. Metadata already occupies blocks. Other blocks are free, but the root reserve and a smaller kernel reserve are held back from the ordinary-user availability reported by statfs. “Not available to me” therefore does not mean “already filled with metadata.”

The metadata has its own costs. Inode tables reserve records for files before those files exist, so their size follows the configured density of inodes. They make up most of this example’s metadata. The journal, which supports filesystem recovery, grows in size steps and then stops at one gibibyte. Superblock copies, bitmaps and the first few files account for the rest.

Lowering the root-reserve percentage changes which free blocks ordinary users may use. The settings for 1% and 0% leave the inode tables and journal in place. The recovered availability is not evidence that metadata has been removed.

Disk size changes the balance. A percentage reserve grows with the disk, while the journal reaches a cap and larger size classes allocate fewer inodes per byte. Across the shown larger disks the reserve becomes increasingly prominent. That comparison depends on these formatting defaults; it is not a fixed overhead percentage for every ext4 filesystem.

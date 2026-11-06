# ext4 accounting notes

The calculations follow e2fsprogs 1.47.3 defaults and Linux 6.8 ext4 accounting, with recorded formatting runs and mounted statfs values. Sizes are binary units. The opening’s one-tebibyte filesystem uses 4 KiB blocks; smaller size classes can use different block and inode settings.

The default root reserve is separate from the kernel’s mounted reserve. Neither should be merged into occupied metadata. The whole-disk pies preserve that distinction through their color mapping; the metadata-only pie changes the denominator and uses its own component colors.

The comparison changes reserve percentage and disk size while holding the modeled defaults fixed. It does not cover arbitrary mkfs options, space consumed by a working workload, quotas or snapshots.

"""Claims for ext4-space (rounds 2 and 3): the plain page, the Rayner page and the method-only page."""

T = 'scenes/explainers/ext4-space/model.test.ts'
M = 'scenes/explainers/ext4-space/model.ts'
CONF = 'misc/mke2fs.conf.in at e2fsprogs v1.47.3 (cited at ' + M + ':5-10)'
R1T = T + ':42 (1 TiB, -m 5): blocks 268435456, reserved 13421772, overhead 4494739, free 263940198, inodes 67108864, inodes/group 8192, reserved GDT 1024; debugfs sectors root 8, resize 155656, journal 2097160, lost+found 32, orphan 4096; statfs f_blocks 263940717, f_bfree 263940198, f_bavail 250514330'
R1G = T + ':35 (1 GiB, -m 5): blocks 262144, reserved 13107, overhead 12949, free 249125, inodes 65536; debugfs sectors root 8, resize 5088, journal 65536, lost+found 32, orphan 512; statfs 249195 / 249125 / 231922'
R20T = T + ':48 (20 TiB, -m 5): blocks 5368709120, reserved 268435456, overhead 21625369, free 5347083233, inodes 335544320, inodes/group 2048; statfs 5347083751 / 5347083233 / 5078643681'
R4T = T + ':44 (4 TiB, -m 5): inodes 134217728 (one per 32 KiB); ' + T + ':47 (16 TiB): inodes 268435456'
RM = T + ':50-55 (-m 1 and -m 0 runs at 1 GiB, 1 TiB, 20 TiB): f_bavail 242408, 245029, 261251748, 263936102, 5293392046, 5347079137'
STEPS = T + ':64-114 (journal steps from lib/ext2fs/mkjournal.c:359-378: 16 MiB at 128 MiB doubling to 1 GiB at 128 GiB; size types from misc/mke2fs.c:1433-1443; sparse_super groups from lib/ext2fs/closefs.c:23-55)'
KERNEL = M + ':32-35 (fs/ext4/super.c:4255-4283: at mount 2% of blocks or 4096, whichever is less; ext4_statfs: f_bavail = free - (reserved + mount reserve)); ' + T + ':137-145'
NONE = 'No recorded value, model rule or pinned source in the oracle covers this.'
BRACKET = 'The page uses a 1,000,204,886,016-byte drive, not a whole number of 128 MiB groups; compared with the model (' + M + ' layout/space) at 7,452 and 7,453 groups: Size 915.8-915.9 GiB, Avail 869.2-869.3 GiB, root reserve plus 16 MiB 46.59-46.60 GiB, structures 1.68% of the label, superblocks+descriptors+bitmaps 143 MiB (0.015%), 61,046,784 inodes, 14.55 GiB of inode tables, tables 84.8 and 58.2 MiB, 7,452 groups, 19 superblock copies of 1+117+1024 blocks'
DFMAP = "df's Size, Used and Avail taken as statfs f_blocks, f_blocks - f_bfree and f_bavail (coreutils behaviour; not part of the recording)."

ORACLE = ('22 recorded mkfs.ext4 1.47.3 runs in ' + T + ':34-55 (dumpe2fs counts, debugfs block counts of inodes 2, 7, 8, 11, 12, statfs under Linux 6.8.0), '
          'the model in ' + M + ' and the e2fsprogs v1.47.3 and Linux v6.8 lines it cites (' + M + ':5-35).')

PAGES = {
    'plain': {'file': 'bench/premise/ext4-space/plain.html', 'round': 2, 'how': 'Written by a fresh session with no repository from the question and Reader line (bench/premise/README.md, round 2).'},
    'rayner': {'file': 'scenes/explainers/ext4-space (rayner describe at 5e9d07d4)', 'round': 2, 'how': 'The catalogued explainer; text read from `rayner describe`.'},
    'method': {'file': 'bench/premise/ext4-space/method.html', 'round': 3, 'how': 'Method-only page (bench/premise/ext4-space/method/), built for round 3 with the model and oracle and no engine.'},
}

# (page, count, grade, claim, evidence, note)
CLAIMS = [
    ('plain', 1, 'right', 'A "1 TB" disk shows 916G Size and 870G Avail in df -h (lede and simulator)', BRACKET + ' ' + DFMAP, 'model, bracketed; df -h rounds up'),
    ('plain', 1, 'right', 'On a typical disk the structures are the smallest of three parts: units about 7%, reserve 5%, structures about 1.7%', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', '1,000 GB is 931 GiB; the unit change is about 7% (6.9%)', 'Arithmetic: 1e12 / 2^30 = 931.3; 1 - 931.3/1000 = 6.9%', 'arithmetic'),
    ('plain', 1, 'unverifiable', 'df -h counts in GiB but labels them G; df -H uses powers of 1000', NONE + ' (coreutils behaviour)', ''),
    ('plain', 1, 'right', 'The default reserve is 5% of the blocks, for root', R1T + '; ' + M + ':56 DEFAULT_RESERVE = 5 (misc/mke2fs.c:2375-2378)', ''),
    ('plain', 1, 'unverifiable', '...or for a chosen user or group', NONE, ''),
    ('plain', 1, 'unverifiable', 'df shows statfs\'s numbers', DFMAP, ''),
    ('plain', 1, 'right', 'The reserve is inside Size but in neither Used nor Avail, so Size - Used != Avail', R1T + ': the reserved blocks are counted in f_bfree but not in f_bavail', ''),
    ('plain', 1, 'right', 'On 1 TB the reserve is about 47 GiB (46.6 GiB in the simulator)', BRACKET, 'model, bracketed'),
    ('plain', 1, 'unverifiable', 'tune2fs -m and -r change the reserve, while mounted', NONE + ' Only mkfs runs were recorded.', ''),
    ('plain', 1, 'right', 'About 1.7% is the filesystem\'s own structures (1.68% of the label)', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'Nearly all of it is inode tables, 1.56%', R1T + ': 67108864 inodes x 256 bytes = 4,194,304 blocks of 268,435,456 (1.56%)', ''),
    ('plain', 1, 'right', 'A 1 GiB journal', R1T + ': journal 2097160 sectors = 262,145 blocks (262,144 journal + 1 extent block)', ''),
    ('plain', 1, 'right', 'Superblocks, descriptors and bitmaps are under 0.02%', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'Simulator: 61 M inodes, 14.6 GiB of inode tables (also in the table)', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'Superblocks, descriptors and bitmaps 143 MiB; table about 85 MiB and about 58 MiB', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'Reserved for root plus 16 MiB: 46.6 GiB', BRACKET, 'model, bracketed'),
    ('plain', 1, 'unverifiable', 'Partition table and alignment, 1 MiB', NONE + ' (outside the filesystem)', ''),
    ('plain', 1, 'wrong', 'df Used is 20K (21K with -H): "about 0 (root dir + lost+found)"; the page\'s code hard-codes 5 blocks', R1T + '; ' + R1G + '. f_blocks - f_bfree = 519 blocks at 1 TiB and 70 at 1 GiB. debugfs: root 1 block, lost+found 4, orphan file 512 (64 at 1 GiB), resize inode 1, journal index 1. ' + DFMAP, 'leaves out the orphan file'),
    ('plain', 1, 'right', '5.00% reserve, 6.7% in total', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'Metadata is subtracted before Size is reported (bsddf)', R1T + ': f_blocks 263940717 = blocks 268435456 - overhead 4494739', ''),
    ('plain', 1, 'unverifiable', 'minixdf reports the raw block count', NONE, ''),
    ('plain', 1, 'right', 'Metadata never appears in Used; partition bytes minus Size gives the metadata', R1T + ' (statfs f_blocks = blocks - overhead)', ''),
    ('plain', 1, 'right', 'Size - Used - Avail is the root reserve plus at most 16 MiB kept by ext4', KERNEL + '; ' + R1T + ': f_bfree - f_bavail = 13,425,868 = 13,421,772 + 4,096', ''),
    ('plain', 1, 'unverifiable', '...kept for delayed allocation', NONE, ''),
    ('plain', 1, 'unverifiable', 'Use% can pass 100% for root; a full disk still lets root write', NONE, ''),
    ('plain', 1, 'unverifiable', 'df computes Use% as Used / (Used + Avail)', NONE + ' (coreutils)', ''),
    ('plain', 1, 'right', 'Block groups of 32,768 blocks, 128 MiB', M + ':51 BLOCKS_PER_GROUP = BLOCK * 8 (lib/ext2fs/initialize.c:266); ' + T + ':64-70', ''),
    ('plain', 1, 'right', 'A 1 TB disk has about 7,450 groups', BRACKET, 'model, bracketed'),
    ('plain', 1, 'right', 'A group\'s inode table is 8,192 x 256 B = 2 MiB, 1/64 of the group', R1T + ': inodes per group 8192', ''),
    ('plain', 1, 'right', 'Bitmaps are 8 KiB per group', M + ' layout: bitmaps = 2 x groups; matches recorded overhead ' + T + ':116-123', 'model'),
    ('plain', 1, 'right', 'Superblock and descriptor copies only in groups 0, 1 and powers of 3, 5 and 7', STEPS + '; ' + T + ':209-220', ''),
    ('plain', 1, 'right', '19 copies on 1 TB, about 4.5 MiB each, with spare descriptor blocks', BRACKET, 'model, bracketed'),
    ('plain', 1, 'unverifiable', 'flex_bg packs 16 groups\' bitmaps and tables together', NONE, ''),
    ('plain', 1, 'right', 'Inode records are 256 bytes, all set aside at format time', CONF + ': inode_size = 256; recorded inode counts ' + T + ':34-55', ''),
    ('plain', 1, 'wrong', '"By default that\'s one inode for every 16 KiB of capacity", and the calculator\'s "16 KiB (default)" at every size', R4T + '; ' + R20T + ' (335,544,320 inodes = one per 64 KiB); ' + CONF + ': big = { inode_ratio = 32768 }, huge = { inode_ratio = 65536 }; size types from misc/mke2fs.c:1433-1443', 'true only below 4 TiB'),
    ('plain', 1, 'right', 'The journal grows in steps and stops at 1 GiB from 128 GiB; the calculator\'s step table', STEPS + '; recorded journals ' + T + ':41-48', ''),
    ('plain', 1, 'unverifiable', 'The journal is a write-ahead log for crash consistency', NONE, ''),
    ('plain', 1, 'unverifiable', 'Inodes cannot be added later; running out gives ENOSPC; df -i', NONE, ''),
    ('plain', 1, 'unverifiable', 'ext4lazyinit zeroes the inode tables after the first mount', NONE, ''),
    ('plain', 1, 'unverifiable', 'The reserve\'s purposes (logs when full, fragmentation)', NONE, ''),
    ('plain', 1, 'wrong', '-T largefile is 64 KiB per inode', CONF + ': largefile = { inode_ratio = 1048576 }', '1 MiB, not 64 KiB'),
    ('plain', 1, 'wrong', '-T largefile4 is 1 MiB per inode (option label and the "one inode per 1 MiB" comment)', CONF + ': largefile4 = { inode_ratio = 4194304 }', '4 MiB, not 1 MiB'),
    ('plain', 1, 'right', '4 KiB per inode for many tiny files', CONF + ': small and news have inode_ratio = 4096', ''),
    ('plain', 1, 'right', 'Defaults: 4 KiB blocks, 256-byte inodes, 64bit, flex_bg, sparse_super, resize_inode', CONF + ' lines 2-14 as cited at ' + M + ':7-9', ''),
    ('plain', 1, 'unverifiable', '"1 TB" drives commonly hold 1,000,204,886,016 bytes', NONE, ''),

    ('rayner', 3, 'right', 'The answer: the 5% reserve is 1.0, 3.0 and 12.4 times the metadata on 1 GiB, 1 TiB and 20 TiB', R1G + '; ' + R1T + '; ' + R20T + '; metadata = blocks - free; ' + T + ':243-254', 'recorded'),
    ('rayner', 3, 'right', 'Block counts of the three disks (262,144; 268,435,456; 5,368,709,120)', R1G + '; ' + R1T + '; ' + R20T, 'recorded'),
    ('rayner', 6, 'right', 'Blocks users can write, with shares (88.5%, 93.3%, 94.6%), and blocks unavailable to them, with sizes (118.1 MiB, 68.4 GiB, 1106.5 GiB)', 'statfs f_bavail in ' + R1G + '; ' + R1T + '; ' + R20T, 'recorded statfs'),
    ('rayner', 1, 'unverifiable', 'df reads statfs and shows f_bavail as Avail', DFMAP, ''),
    ('rayner', 3, 'right', 'Root reserves 13,107, 13,421,772 and 268,435,456', R1G + '; ' + R1T + '; ' + R20T, 'recorded'),
    ('rayner', 3, 'right', 'Metadata 13,019, 4,495,258 and 21,625,887 blocks: 5.0%, 1.7%, 0.40%', 'blocks - f_bfree in ' + R1G + '; ' + R1T + '; ' + R20T, 'recorded'),
    ('rayner', 2, 'right', 'The kernel holds back 4,096 more; users can write the free blocks less both reserves', KERNEL, 'recorded'),
    ('rayner', 1, 'right', 'Size types: one inode per 16 KiB from 512 MiB to under 4 TiB, 32 KiB under 16 TiB, 64 KiB above', STEPS + '; ' + CONF + '; ' + R4T, ''),
    ('rayner', 3, 'right', 'Inode counts, table blocks, shares of disk and of metadata for each disk', R1G + '; ' + R1T + '; ' + R20T, 'recorded'),
    ('rayner', 1, 'right', 'Journal steps: 16 MiB at 128 MiB, doubling to 1 GiB at 128 GiB', STEPS + '; recorded ' + T + ':34-41', ''),
    ('rayner', 3, 'right', 'Journal 32 MiB, 1 GiB, 1 GiB, with shares', 'debugfs journal sectors in ' + R1G + '; ' + R1T + '; ' + R20T, 'recorded'),
    ('rayner', 3, 'right', 'Superblock copies in 5 of 8, 19 of 8,192 and 25 of 163,840 groups', STEPS + '; recorded resize-inode counts ' + T + ':124-136', ''),
    ('rayner', 2, 'right', '127 and 1,024 spare descriptor blocks per copy', 'reserved GDT blocks in ' + R1G + '; ' + R1T, 'recorded'),
    ('rayner', 1, 'right', 'Two bitmaps in every group', M + ' layout: bitmaps = 2 x groups; matches recorded overhead ' + T + ':116-123', 'model'),
    ('rayner', 3, 'right', 'Other metadata 731, 38,810 and 392,223 blocks; the first files 70, 519 and 518 blocks', 'debugfs counts in ' + R1G + '; ' + R1T + '; ' + R20T + '; ' + T + ':124-136', 'recorded'),
    ('rayner', 3, 'right', 'Shares users can write at -m 5, 1 and 0 on all three disks', RM + '; ' + R1G + '; ' + R1T + '; ' + R20T, 'recorded, nine runs'),
    ('rayner', 1, 'right', 'Metadata\'s share falls because the journal stops at 1 GiB and large disks get fewer inodes per byte', STEPS + '; ' + R4T, ''),
    ('rayner', 2, 'right', 'At 20 TiB the 5% reserve is 1 TiB (12.4 times) and 1% is 204.8 GiB (2.5 times)', R20T + '; ' + T + ':54', 'recorded'),
    ('rayner', 3, 'right', '-m 1: reserves, blocks users can write and the gain on each disk', RM, 'recorded'),
    ('rayner', 3, 'right', '-m 0: only the kernel\'s 4,096 held back; blocks users can write and the gain', RM + '; ' + KERNEL, 'recorded'),
    ('rayner', 1, 'unverifiable', 'tune2fs -m changes the reserve without reformatting', NONE + ' Only mkfs runs were recorded.', ''),
    ('rayner', 1, 'right', 'With -m 0 root gets no more room than other users', T + ':51, 53, 55: reserved block count 0', 'recorded'),
    ('rayner', 1, 'right', 'Check 1: at 2 GiB the journal doubles to 64 MiB, and 26,214 reserved blocks fall short of 26,284, 0.997 times', T + ':36 (2 GiB): reserved 26214, blocks 524288 - free 498004 = 26284; journal 131072 sectors = 16384 blocks', 'recorded'),
    ('rayner', 1, 'right', 'Check 2: 4 TiB is big, with 8,750,621 metadata blocks against 17,138,715 at 128 MiB less, and 32.1 GiB more for users', T + ':43-44: 1073709056-1056570341 = 17138715; 1073741824-1064991203 = 8750621; f_bavail 1011300016 - 1002880793 = 8,419,223 blocks = 32.1 GiB', 'recorded'),
    ('rayner', 1, 'right', 'Check 3: 13,421,772 blocks (51.2 GiB) come back; 4,495,258 blocks of metadata and the kernel\'s 4,096 stay', T + ':42 and :53 (1 TiB at -m 5 and -m 0)', 'recorded -m 0 run'),
    ('rayner', 1, 'unverifiable', 'Check 3: tune2fs -m 0 on an existing filesystem gives that', NONE + ' Only mkfs -m 0 was recorded.', ''),
    ('rayner', 1, 'right', 'The reserve is free space, kept for privileged use', R1T + ': reserved blocks are counted in f_bfree; ' + KERNEL, 'recorded'),
    ('rayner', 1, 'right', 'An inode records one file; a fixed number of 256-byte inodes is set aside at mkfs', CONF + '; recorded inode counts ' + T + ':34-55', ''),
]

# The method-only page states the Rayner page's claims except the tune2fs -m sentence, plus its intro's provenance line.
for page, count, grade, claim, evidence, note in list(CLAIMS):
    if page != 'rayner' or claim == 'tune2fs -m changes the reserve without reformatting':
        continue
    c = claim.replace('(118.1 MiB, 68.4 GiB, 1106.5 GiB)', '(118.1 MiB, 68.4 GiB, 1.1 TiB)')
    CLAIMS.append(('method', count, grade, c, evidence, note))
CLAIMS.append(('method', 1, 'right', 'Intro: every number is computed from a model of mkfs.ext4 1.47.3 tested against mkfs.ext4 1.47.3 runs and a mounted Linux 6.8.0\'s statfs; the first and last steps show those recorded values',
               'bench/premise/ext4-space/method/oracle.ts (copied from ' + T + ':34-55); bench/premise/ext4-space/method/method.test.ts', ''))

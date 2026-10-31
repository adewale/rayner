import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/ext4-space.ts';
import { Scene } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
import {
  BLOCK,
  BLOCKS_PER_GROUP,
  DEFAULT_RESERVE,
  INODE_SIZE,
  JOURNAL_STEPS,
  RESERVES,
  SIZES,
  bytesOf,
  count,
  journalBlocks,
  metadataPie,
  percent,
  space,
  times,
  wholePie,
} from '../lib/ext4-space.ts';
import type { Size, Slice, Space, WholeStage } from '../lib/ext4-space.ts';

// Sources: e2fsprogs at tag v1.47.3 and Linux at tag v6.8; lines are quoted in lib/ext4-space.ts and
// test/explain-ext4-space.test.ts, which also freezes mkfs.ext4 1.47.3 runs and a mounted kernel's statfs.
const E2FS = 'https://github.com/tytso/e2fsprogs/blob/v1.47.3/';
const LINUX = 'https://github.com/torvalds/linux/blob/v6.8/fs/ext4/';
const STYLE = 'github-light';

// Slice colours by name. A pie's colours go by slice position and a morph keeps its config, so each
// pie's config lists the colours of the slices it will ever have, in order.
const COLORS: Record<string, string> = {
  'Inode tables': '#8250df',
  Journal: '#bf8700',
  'Other metadata': '#1b7c83',
  Metadata: '#6e7781',
  Free: '#4ac26b',
  'Users can write': '#4ac26b',
  'Kernel reserve': '#fb8f44',
  'Root reserve': '#cf222e',
};
const head = (names: readonly string[]) =>
  [
    '---',
    'config:',
    '  pie:',
    '    legendPosition: right',
    '    textPosition: 0.68',
    '  themeVariables:',
    ...names.map((n, i) => `    pie${i + 1}: '${COLORS[n]}'`),
    '    pieLegendTextSize: 17px',
    '    pieSectionTextSize: 15px',
    '    pieTitleTextSize: 18px',
    '---',
  ].join('\n');
const pie = (names: readonly string[], title: string, slices: readonly Slice[]) =>
  `${head(names)}\npie\n  title ${title}\n` + slices.map((s) => `  "${s.label}" : ${s.value}\n`).join('');

const SIZE = 0.34;
// The pie on the left, a card on the right: wider than the 'side' region so that 13-digit counts
// fit beside their labels at full size.
const PIE: Box = [-7.55, -4.25, 1.05, 3.25];
const CARD: Box = [1.35, -4.25, 7.55, 3.25];

export default class Ext4SpaceExplainer extends Scene {
  static meta = {
    id: 'ext4-space',
    title: 'Where does an empty ext4 filesystem’s space go?',
    sources: [
      E2FS + 'misc/mke2fs.conf.in#L1-L29',
      E2FS + 'misc/mke2fs.c#L1433-L1443',
      E2FS + 'misc/mke2fs.c#L2321-L2323',
      E2FS + 'misc/mke2fs.c#L2375-L2378',
      E2FS + 'misc/mke2fs.c#L2808-L2833',
      E2FS + 'misc/mke2fs.c#L3484-L3486',
      E2FS + 'misc/mke2fs.c#L3602',
      E2FS + 'misc/mke2fs.c#L3648-L3650',
      E2FS + 'misc/mke2fs.c#L520-L555',
      E2FS + 'misc/mke2fs.8.in#L637-L644',
      E2FS + 'misc/tune2fs.8.in#L475-L477',
      E2FS + 'lib/ext2fs/initialize.c#L58-L86',
      E2FS + 'lib/ext2fs/initialize.c#L266-L376',
      E2FS + 'lib/ext2fs/closefs.c#L23-L55',
      E2FS + 'lib/ext2fs/mkjournal.c#L359-L378',
      E2FS + 'lib/ext2fs/orphan.c#L217-L232',
      E2FS + 'lib/ext2fs/ext3_extents.h#L99',
      LINUX + 'super.c#L4255-L4283',
      LINUX + 'super.c#L6807-L6829',
      LINUX + 'balloc.c#L620-L666',
    ],
  };
  static settings = [
    {
      id: 'size',
      label: 'Size',
      default: '1t',
      options: (Object.keys(SIZES) as Size[]).map((k) => ({ value: k, label: SIZES[k].label })),
    },
    {
      id: 'reserve',
      label: 'Root reserve',
      default: String(DEFAULT_RESERVE),
      options: RESERVES.map((m) => ({
        value: String(m),
        label: m === DEFAULT_RESERVE ? `-m ${m} (default)` : `-m ${m}`,
      })),
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const size = values.size as Size,
      m = Number(values.reserve);
    const name = SIZES[size].label;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const sp = space(SIZES[size].bytes, DEFAULT_RESERVE),
      chosen = space(SIZES[size].bytes, m),
      l = sp.layout;
    const of = (n: number) => percent(n, l.blocks);
    const ofMeta = (n: number) => percent(n, l.metadata);

    // Every whole-disk pie in this case, so that one config colours all of them.
    const stages: [Space, WholeStage][] = [
      [sp, 'free'],
      [sp, 'reserves'],
      [sp, 'users'],
      [chosen, 'users'],
    ];
    const wholeNames = ['Metadata', 'Free', 'Kernel reserve', 'Root reserve'].filter((n) =>
      stages.some(([x, st]) =>
        wholePie(x, st).some((sl) => sl.label === n || (n === 'Free' && sl.label === 'Users can write')),
      ),
    );
    const wholeTitle = `Every 4 KiB block of ${name}`;
    const whole = (x: Space, st: WholeStage) => pie(wholeNames, wholeTitle, wholePie(x, st));

    // ------------------------------------------------------------------ the whole
    await readerFirst(this, s, readerFrames(size, m));
    await this.step('blocks', {
      detail: true,
      title: `mkfs.ext4 makes ${name} into ${count(l.blocks)} blocks of 4 KiB`,
      line: `${of(l.metadata)} of the blocks hold metadata before any file is written.`,
      // mke2fs.conf.in:5 blocksize = 4096; initialize.c:266 blocks per group = blocksize * 8.
      caption: `mke2fs.conf sets ${BLOCK}-byte blocks, so ${name} is ${count(l.blocks)} blocks in ${count(l.groups)} groups of ${count(
        BLOCKS_PER_GROUP,
      )}. Before any file is written, ${count(l.metadata)} blocks, ${of(l.metadata)}, already hold metadata: the filesystem’s own structures. The pie counts blocks as dumpe2fs reports them after a real mkfs.ext4 run. The question is how much of this new disk a regular user can write: metadata consumes blocks now, while the root and kernel reserves hold back some of the remaining free blocks.`,
    });
    await s.clear();
    await s.show({ source: whole(sp, 'free') }, { box: PIE });
    await s.card(
      [
        ['Size', name],
        ['Size type', l.type],
        ['Block size', `${BLOCK} bytes`],
        ['Blocks', count(l.blocks)],
        ['Block groups', count(l.groups)],
        ['Metadata', count(l.metadata)],
        ['Free', count(l.free)],
      ],
      { at: CARD, fontSize: SIZE, title: 'After mkfs.ext4' },
    );
    this.state.blocks = {
      blocks: l.blocks,
      groups: l.groups,
      metadata: l.metadata,
      free: l.free,
      pie: wholePie(sp, 'free'),
    };

    // ------------------------------------------------------------------ inode tables
    const perInode = l.inodeRatio / 1024;
    await this.step('inodes', {
      detail: true,
      title: `Inode tables are ${ofMeta(l.inodeTables)} of the metadata`,
      line: `One ${INODE_SIZE}-byte inode per ${perInode} KiB of disk: ${count(l.inodes)} inodes.`,
      // mke2fs.c:1433-1443 size types; mke2fs.conf.in:7, 24-29 inode_ratio; mke2fs.c:2811-2812.
      caption: `This pie’s whole is the ${count(l.metadata)} metadata blocks. mke2fs makes one inode per 16 KiB of disk from 512 MiB to under 4 TiB, per 32 KiB to under 16 TiB, and per 64 KiB above. ${name} gets ${count(
        l.inodes,
      )} inodes of ${INODE_SIZE} bytes, in tables set aside now: ${count(l.inodeTables)} blocks, ${of(l.inodeTables)} of the disk.`,
    });
    await s.clear();
    const d2: Diagram = await s.show(
      {
        source: pie(
          ['Inode tables', 'Journal', 'Other metadata'],
          `The ${count(l.metadata)} metadata blocks`,
          metadataPie(l),
        ),
      },
      { box: PIE },
    );
    await d2.mark(['slice:Inode tables'], { as: 'this step' });
    await s.card(
      [
        ['Size type', l.type],
        ['One inode per', `${perInode} KiB`],
        ['Inodes', count(l.inodes)],
        ['Bytes each', `${INODE_SIZE}`],
        ['Blocks', count(l.inodeTables)],
        ['Of the disk', of(l.inodeTables)],
      ],
      { at: CARD, fontSize: SIZE, title: 'Inode tables' },
    );
    this.state.inodes = {
      type: l.type,
      inodeRatio: l.inodeRatio,
      inodes: l.inodes,
      inodeTables: l.inodeTables,
      pie: metadataPie(l),
    };

    // ------------------------------------------------------------------ journal
    await this.step('journal', {
      detail: true,
      title:
        l.journal === 262144
          ? `The journal stops growing at 1 GiB`
          : `The journal is ${bytesOf(l.journal)}, ${ofMeta(l.journal)} of the metadata`,
      line: `It doubles with disk size from 16 MiB to 1 GiB; here ${of(l.journal)} of the disk.`,
      // mkjournal.c:359-378.
      caption: `mke2fs sizes the journal in steps of disk size, doubling from 16 MiB at 128 MiB to 1 GiB at 128 GiB, and no larger after that. ${name} gets ${count(
        l.journal,
      )} blocks, ${bytesOf(l.journal)}: ${ofMeta(l.journal)} of the metadata and ${of(l.journal)} of the disk.`,
    });
    await s.clearOverlays();
    await d2.unmark();
    await d2.mark(['slice:Journal'], { as: 'this step' });
    // The table's rows from the model: each step's first disk size and its journal.
    const steps = JOURNAL_STEPS.map((b) => [`From ${bytesOf(b)}`, bytesOf(journalBlocks(b))] as [string, string]);
    const journalCard = await s.card(steps, { at: CARD, fontSize: SIZE, title: 'Journal by disk size' });
    const row = steps.filter((_, i) => JOURNAL_STEPS[i]! <= l.blocks).at(-1)!;
    await journalCard.mark(row[0], { as: name });
    this.state.journal = { journal: l.journal };

    // ------------------------------------------------------------------ the rest
    const perCopy = 1 + l.descBlocks + l.reservedGdt;
    await this.step('other', {
      detail: true,
      title: `The other ${count(l.other)} blocks: copies, bitmaps and the first files`,
      line: `Superblock copies in ${l.superGroups} of ${count(l.groups)} groups; two bitmaps in every group.`,
      // closefs.c:23-55 (sparse_super); initialize.c:58-86 (reserved GDT); mke2fs.c:475-555, 3656-3667.
      caption: `Group 0, group 1 and groups that are powers of 3, 5 or 7 keep a copy of the superblock and group descriptors: ${l.superGroups} of ${count(
        l.groups,
      )} groups${l.reservedGdt ? `, each with ${l.reservedGdt} spare descriptor blocks for growing the filesystem` : ''}. Every group has two bitmaps. The root directory, lost+found, the orphan file and ${
        l.files.resize + l.files.journalTree > 1 ? 'two index blocks' : 'an index block'
      } take ${l.filesTotal} blocks.`,
    });
    await s.clearOverlays();
    await d2.unmark();
    await d2.mark(['slice:Other metadata'], { as: 'this step' });
    await s.card(
      [
        ['Groups with copies', `${l.superGroups}`],
        ['Blocks a copy', l.reservedGdt ? `1 + ${l.descBlocks} + ${l.reservedGdt}` : `1 + ${l.descBlocks}`],
        ['All copies', count(l.superCopies)],
        ['Bitmaps', count(l.bitmaps)],
        ['First files', count(l.filesTotal)],
        ['Other metadata', count(l.other)],
        ['Of the disk', of(l.other)],
      ],
      { at: CARD, fontSize: SIZE, title: 'Other metadata' },
    );
    this.state.other = {
      superGroups: l.superGroups,
      superCopies: l.superCopies,
      reservedGdt: l.reservedGdt,
      bitmaps: l.bitmaps,
      files: l.filesTotal,
      other: l.other,
    };

    // ------------------------------------------------------------------ the reserves
    const kernelDrawn = wholePie(sp, 'reserves').some((x) => x.label === 'Kernel reserve');
    const reserveOps = [
      { kind: 'set_slice_value', label: 'Free', value: sp.users },
      ...wholePie(sp, 'reserves')
        .slice(2)
        .map((x) => ({ kind: 'add_slice', label: x.label, value: x.value })),
    ];
    await this.step('reserve', {
      detail: true,
      title: `The default 5% reserve is ${count(sp.root)} blocks, ${times(sp.root, l.metadata)} the metadata`,
      line: `The kernel holds back ${count(sp.kernel)} more blocks; both come out of free blocks.`,
      // mke2fs.c:2375-2378, 2832-2833; mke2fs.8.in:637-644; Linux super.c:4255-4283.
      caption: `Without -m, mke2fs reserves 5% of the blocks for root: ${count(
        sp.root,
      )}. Its manual gives two reasons: less fragmentation, and root’s daemons keep working after other users are stopped. Once mounted, the kernel holds back ${count(sp.kernel)} more blocks${
        kernelDrawn ? '' : `, ${of(sp.kernel)}, too thin to draw`
      }. Both come out of the free blocks.`,
    });
    await s.clear();
    const d3: Diagram = await s.show({ source: whole(sp, 'free') }, { box: PIE });
    await d3.morph({ source: whole(sp, 'reserves') }, { ops: reserveOps });
    await d3.mark(['slice:Root reserve'], { as: 'this step' });
    await s.card(
      [
        ['Blocks', count(l.blocks)],
        ['Root, 5%', count(sp.root)],
        ['Kernel', count(sp.kernel)],
        ['Metadata', count(l.metadata)],
        ['Root / metadata', times(sp.root, l.metadata)],
      ],
      { at: CARD, fontSize: SIZE, title: 'Reserves' },
    );
    this.state.reserve = { root: sp.root, kernel: sp.kernel, pie: wholePie(sp, 'reserves') };

    // ------------------------------------------------------------------ what users can write
    await this.step('users', {
      detail: true,
      title: `Users can write ${of(sp.users)} of ${name}: ${count(sp.users)} blocks`,
      line: 'statfs f_bavail: the free blocks less the root and kernel reserves.',
      // Linux balloc.c:620-665, super.c:6807-6831; measured with statfs on the mounted filesystem.
      caption: `A user other than root can allocate blocks until only the two reserves are left: ${count(l.free)} - ${count(sp.root)} - ${count(
        sp.kernel,
      )} = ${count(sp.users)}. statfs on the mounted filesystem reports exactly that as f_bavail, which df shows as Avail.`,
    });
    await s.clearOverlays();
    await d3.morph(
      { source: whole(sp, 'users') },
      { ops: [{ kind: 'rename_slice', from: 'Free', to: 'Users can write' }] },
    );
    await d3.mark(['slice:Users can write'], { as: 'this step' });
    await s.card(
      [
        ['Free', count(l.free)],
        ['Root', `- ${count(sp.root)}`],
        ['Kernel', `- ${count(sp.kernel)}`],
        ['Users', count(sp.users)],
        ['Of the disk', of(sp.users)],
      ],
      { at: CARD, fontSize: SIZE, title: 'statfs f_bavail' },
    );
    this.state.users = { free: l.free, users: sp.users, pie: wholePie(sp, 'users') };

    // ------------------------------------------------------------------ the chosen reserve
    if (m !== DEFAULT_RESERVE) {
      const gained = chosen.users - sp.users;
      await this.step('chosen', {
        detail: true,
        title: `With -m ${m}, users can write ${of(chosen.users)}`,
        line:
          m === 0
            ? `Only the kernel’s ${count(chosen.kernel)} blocks are held back; users gain ${bytesOf(gained)}.`
            : `Root keeps ${count(chosen.root)} blocks; users gain ${bytesOf(gained)}.`,
        // mke2fs.c:1905-1907 reads -m; mke2fs.c:2832-2833; tune2fs.8.in:475-477 for tune2fs -m.
        caption:
          m === 0
            ? `mkfs.ext4 -m 0 reserves nothing for root, so only the kernel’s ${count(chosen.kernel)} blocks are held back. Users can write ${count(
                chosen.users,
              )} blocks, ${count(gained)} more than at the default, ${bytesOf(gained)}. Root then gets no more room than other users.`
            : `mkfs.ext4 -m ${m} reserves ${m}% for root: ${count(chosen.root)} blocks. Users can write ${count(chosen.users)} blocks, ${count(
                gained,
              )} more than at the default, ${bytesOf(gained)}. tune2fs -m changes the reserve later without reformatting.`,
      });
      await s.clearOverlays();
      const ops =
        m === 0
          ? [
              { kind: 'remove_slice', label: 'Root reserve' },
              { kind: 'set_slice_value', label: 'Users can write', value: chosen.users },
            ]
          : [
              { kind: 'set_slice_value', label: 'Users can write', value: chosen.users },
              { kind: 'set_slice_value', label: 'Root reserve', value: chosen.root },
            ];
      await d3.morph({ source: whole(chosen, 'users') }, { ops });
      await d3.mark(['slice:Users can write'], { as: 'changed' });
      await s.card(
        [
          [`Root, ${m}%`, count(chosen.root)],
          ['Kernel', count(chosen.kernel)],
          ['Users', count(chosen.users)],
          ['Of the disk', of(chosen.users)],
          ['Gained', bytesOf(gained)],
        ],
        { at: CARD, fontSize: SIZE, title: `mkfs.ext4 -m ${m}` },
      );
      this.state.chosen = {
        percent: m,
        root: chosen.root,
        users: chosen.users,
        gained,
        pie: wholePie(chosen, 'users'),
      };
    }

    // ------------------------------------------------------------------ three sizes
    const all = (Object.keys(SIZES) as Size[]).map((k) => ({ k, label: SIZES[k].label, x: space(SIZES[k].bytes, m) }));
    const share = (x: Space, n: number) => percent(n, x.layout.blocks);
    await this.step('sizes', {
      detail: true,
      title: `At -m ${m}, users can write ${all.map((a) => share(a.x, a.x.users)).join(', ')} of ${all.map((a) => a.label).join(', ')}`,
      line: `Metadata falls from ${all.map((a) => share(a.x, a.x.layout.metadata)).join(' to ')} of the disk as disks grow.`,
      caption: `Metadata shrinks as a share of the disk, from ${all.map((a) => share(a.x, a.x.layout.metadata)).join(' to ')}, because the journal stops at 1 GiB and larger disks get fewer inodes per byte. ${
        m === 0
          ? 'With no root reserve, almost everything else is for users.'
          : `A ${m}% reserve grows with the disk: at 20 TiB it is ${bytesOf(all[2]!.x.root)}, ${times(all[2]!.x.root, all[2]!.x.layout.metadata)} the metadata.`
      }`,
    });
    await s.clear();
    const sizeCard = await s.card(
      all.map(
        (a) =>
          [
            a.label,
            `metadata ${share(a.x, a.x.layout.metadata)}, root reserve ${share(a.x, a.x.root)}, users ${share(a.x, a.x.users)}`,
          ] as [string, string],
      ),
      {
        at: regionBox('full', { top: 2.6, bottom: -3.6 }),
        fontSize: 0.42,
        title: `mkfs.ext4 -m ${m}, shares of each disk`,
      },
    );
    await sizeCard.mark(name, { as: 'this case' });
    this.state.sizes = Object.fromEntries(
      all.map((a) => [a.k, { metadata: a.x.layout.metadata, root: a.x.root, users: a.x.users }]),
    );
  }
}

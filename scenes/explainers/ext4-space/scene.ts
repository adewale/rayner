import { Scene, FadeOut } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, mermaid, answerOf, view, having } from '../../../explain/index.ts';
import { card } from '../../../explain/drawing.ts';
import type { CardRow, CardOptions, Card } from '../../../explain/drawing.ts';
import type { Diagram, View, Having, ExplainerMeta } from '../../../explain/index.ts';
import {
  BLOCK,
  DEFAULT_RESERVE,
  INODE_SIZE,
  JOURNAL_STEPS,
  RESERVES,
  SIZES,
  bytesOf,
  journalBlocks,
  metadataPie,
  percent,
  space,
  times,
  wholePie,
} from './model.ts';
import { grouped } from '../lib/format.ts';
import type { Size, Slice, Space, WholeStage } from './model.ts';

// Sources: e2fsprogs at tag v1.47.3 and Linux at tag v6.8; lines are quoted in model.ts and
// model.test.ts, which also freezes mkfs.ext4 1.47.3 runs and a mounted kernel's statfs.
const E2FS = 'https://github.com/tytso/e2fsprogs/blob/v1.47.3/';
const LINUX = 'https://github.com/torvalds/linux/blob/v6.8/fs/ext4/';
const STYLE = 'github-light';

// Slice colours by name. A pie's colours go by slice position and a morph keeps its config, so each
// pie's config lists the colours of the slices it will ever have, in order. The whole-disk pies keep the
// root reserve, the kernel's reserve and the metadata in their own colours, so free-but-reserved blocks
// never read as occupied ones; the metadata-only pie has a different whole and its own component colours.
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
const pie = (names: readonly string[], title: string, slices: readonly Slice[]) =>
  mermaid.pie(slices, {
    title,
    config: {
      pie: { legendPosition: 'right', textPosition: 0.68 },
      themeVariables: {
        ...Object.fromEntries(names.map((n, i) => [`pie${i + 1}`, COLORS[n]!])),
        pieLegendTextSize: '17px',
        pieSectionTextSize: '15px',
        pieTitleTextSize: '18px',
      },
    },
  });

const SIZE = 0.34;
// The pie on the left, a card on the right: wider than the 'side' region so that 13-digit counts
// fit beside their labels at full size.
const PIE: Box = [-7.55, -4.25, 1.05, 3.25];
/** What the steps record, accumulated: the fields the cards below draw from, each from the step that records it. */
interface Ext4State {
  disk?: { size: Size; label: string; reserve: number };
  df?: { blocks: number; users: number; gone: number; pie: Slice[] };
  reserve?: { root: number; kernel: number; metadata: number; free: number; users: number; pie: Slice[] };
  inodes?: { type: string; inodeRatio: number; inodes: number; inodeTables: number; pie: Slice[] };
  journal?: { journal: number };
  other?: { groups: number; superGroups: number; superCopies: number; reservedGdt: number; bitmaps: number; files: number; other: number };
  descBlocks?: number;
  chosen?: { percent: number; root: number; users: number; gained: number; pie: Slice[] };
  chosenKernel?: number;
  sizes?: Record<string, { metadata: number; root: number; users: number }>;
  sizeBlocks?: Record<string, number>;
}
const CARD: Box = [1.35, -4.25, 7.55, 3.25];
// How a pie is shown apart from its slices, the slice it marks, is in `shown` under the pie's name.
type Marks = Record<string, { color: string; as: string }>;
type PieName = 'answer' | 'metadata' | 'chosen';
/** Each pie's marks, and the journal table's lit row. */
type Ext4Shown = { [name in PieName]?: Marks } & { journalRow?: string };

export default class Ext4SpaceExplainer extends Scene<Ext4State, Ext4Shown> {
  static meta = {
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
    // Sentences that reach past what one step draws, and the test that holds each.
    claims: [
      { says: 'users can write only', shown: true as const },
      { says: 'two bitmaps in every group', test: 'model.test.ts: the model gives dumpe2fs’s counts for every measured size and reserve' },
      { says: 'Every group has two bitmaps', test: 'model.test.ts: the model gives dumpe2fs’s counts for every measured size and reserve' },
      { says: 'only the kernel’s', test: 'model.test.ts: the model gives the mounted kernel’s statfs' },
    ],
  } satisfies ExplainerMeta;
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
    const answer = answerOf(this);
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
    /**
     * A card drawn from the state: a view that builds it from `rows(state)`, so check holds it to the state.
     * `needs` names the parts of the state it reads, which the steps before it have recorded.
     */
    const cardOf = <K extends keyof Ext4State>(
      needs: readonly [K, ...K[]],
      rows: (st: Having<Ext4State, K>) => readonly CardRow[],
      opts: CardOptions | ((st: Having<Ext4State, K>) => CardOptions),
    ): View<Card> =>
      view(
        this,
        (state) => {
          const st = having(state, ...needs);
          return card(s, rows(st), typeof opts === 'function' ? opts(st) : opts);
        },
        { place: false },
      );
    /** Enter a card view as s.card enters a card, described as the card describes itself. */
    const enterCard = async (card: View<Card>) => {
      await s.enter(card, { runTime: 0.35, shift: [0, -0.08] });
      return card.current;
    };
    /** The state's parts the steps so far have recorded. */
    const st = <K extends keyof Ext4State>(...needs: [K, ...K[]]) => having(this.state, ...needs);
    /** Diagram `d` shown by a view of `shown[name]`, its marks. */
    const pieView = (d: Diagram, name: PieName) => {
      this.shown = { ...this.shown, [name]: {} };
      return s.diagramView(d, (_st, sh) => ({ marks: having(sh, name)[name] }));
    };
    /** Pie `name` marks these slices, in the pie's accent, and nothing else. */
    const markSlices = async (v: View, d: Diagram, name: PieName, ids: string[], as: string) => {
      this.shown = { ...this.shown, [name]: Object.fromEntries(ids.map((id) => [id, { color: d.emphasis, as }])) };
      await this.play(v.sync({ runTime: 0.45 }));
    };
    /** The disk's blocks, from what the opening records. */
    const ofDisk = (state: Having<Ext4State, 'df'>, n: number) => percent(n, state.df.blocks);
    this.state.disk = { size, label: name, reserve: m };

    // Every whole-disk pie in this scenario, so that one config colours all of them.
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

    // ------------------------------------------------------------------ the question: df on a new disk
    const gone = l.blocks - sp.users;
    const gib = (blocks: number) => `${((blocks * BLOCK) / 2 ** 30).toFixed(1)} GiB`;
    // The opening pie names only what df shows: what users can write, and what they cannot.
    const openPie: Slice[] = [
      { label: 'Not available', value: gone },
      { label: 'Users can write', value: sp.users },
    ];
    // One config colours both pies (a morph keeps its config): Not available, in slice 1, takes
    // Metadata's grey, and becomes Metadata.
    const answerNames = ['Metadata', 'Users can write', 'Kernel reserve', 'Root reserve'].filter((n) =>
      ['Metadata', 'Users can write'].includes(n) || wholePie(sp, 'users').some((x) => x.label === n),
    );
    await this.step('df', {
      title: `A new ${name} disk: users can write only ${of(sp.users)} of it`,
      line: `Predict: no file is written yet. Where did ${size === '1g' ? bytesOf(gone) : gib(gone)} go?`,
      // The larger share of what users cannot write, from the model's layout: root's reserve or the metadata.
      predict: { options: ['Mostly the root reserve', 'Mostly metadata'], answer: sp.root > l.metadata ? 'Mostly the root reserve' : 'Mostly metadata' },
      // Linux super.c:6807-6831 ext4_statfs; measured with statfs on the mounted filesystem.
      caption: `We ran mkfs.ext4 1.47.3 with no options on an empty ${name} disk, ${grouped(l.blocks)} blocks of ${BLOCK} bytes, mounted it and asked the kernel’s statfs, which df reads. A user other than root can write ${grouped(sp.users)} blocks, which df shows as Avail: ${of(sp.users)} of the disk. The other ${grouped(gone)} blocks, ${of(gone)}, are unavailable to this writer before any user files are added. Does unavailable mean already occupied?`,
    });
    await s.clear();
    this.state.df = { blocks: l.blocks, users: sp.users, gone, pie: openPie };
    // The pies are drawn from the slices each step records.
    const d3: Diagram = await s.show({ source: pie(answerNames, `Every 4 KiB block of ${name}`, st('df').df.pie) }, { box: PIE });
    await enterCard(
      cardOf(
        ['disk', 'df'],
        (st) => [
          ['Disk', `${st.disk.label}, ${grouped(st.df.blocks)} blocks`],
          ['df Avail', `${grouped(st.df.users)} blocks`],
          ['Users can write', ofDisk(st, st.df.users)],
          ['Not available', `${grouped(st.df.gone)} blocks`],
        ],
        { at: CARD, size: SIZE, title: 'statfs after mkfs.ext4' },
      ),
    );

    // ------------------------------------------------------------------ the answer: the reserve
    const kernelDrawn = wholePie(sp, 'users').some((x) => x.label === 'Kernel reserve');
    const ratio = times(sp.root, l.metadata);
    await this.step('reserve', {
      title: `Answer: 5% is held back for root, ${ratio} all the metadata`,
      line: `Predict: what fills the ${grouped(l.metadata)} blocks of metadata?`,
      // mke2fs.c:2375-2378, 2832-2833; mke2fs.8.in:637-644; Linux super.c:4255-4283, balloc.c:620-665.
      caption: `${answer}. Without -m, mke2fs reserves 5% of the blocks for root, ${grouped(sp.root)} here, free but kept for privileged use. The metadata is ${grouped(l.metadata)} blocks, ${of(l.metadata)}; once mounted the kernel holds back ${grouped(sp.kernel)} more${
        kernelDrawn ? '' : `, ${of(sp.kernel)}, too thin to draw`
      }. Users can write the free blocks less both reserves.`,
    });
    await s.clearOverlays();
    this.state.reserve = {
      root: sp.root,
      kernel: sp.kernel,
      metadata: l.metadata,
      free: l.free,
      users: sp.users,
      pie: wholePie(sp, 'users'),
    };
    // Not available splits into its three parts, re-coloured from the answer's own config.
    await d3.morph(
      { source: pie(answerNames, `Every 4 KiB block of ${name}`, st('reserve').reserve.pie) },
      {
        ops: [
          { kind: 'rename_slice', from: 'Not available', to: 'Metadata' },
          { kind: 'set_slice_value', label: 'Metadata', value: st('reserve').reserve.metadata },
          ...st('reserve')
            .reserve.pie.slice(2)
            .map((x) => ({ kind: 'add_slice', label: x.label, value: x.value })),
        ],
      },
    );
    await markSlices(pieView(d3, 'answer'), d3, 'answer', ['slice:Root reserve'], 'the answer');
    await enterCard(
      cardOf(
        ['df', 'reserve'],
        (st) => [
          ['Blocks', grouped(st.df.blocks)],
          ['Metadata', `- ${grouped(st.reserve.metadata)}`],
          ['Free', grouped(st.reserve.free)],
          ['Root, 5%', `- ${grouped(st.reserve.root)}`],
          ['Kernel', `- ${grouped(st.reserve.kernel)}`],
          ['Users can write', grouped(st.reserve.users)],
          ['Root / metadata', times(st.reserve.root, st.reserve.metadata)],
        ],
        { at: CARD, size: SIZE, title: 'Where the blocks go' },
      ),
    );

    // ------------------------------------------------------------------ inode tables
    const perInode = l.inodeRatio / 1024;
    await this.step('inodes', {
      title: `Inode tables are ${ofMeta(l.inodeTables)} of the metadata`,
      line: `One ${INODE_SIZE}-byte inode per ${perInode} KiB of disk: ${grouped(l.inodes)} inodes.`,
      // mke2fs.c:1433-1443 size types; mke2fs.conf.in:7, 24-29 inode_ratio; mke2fs.c:2811-2812.
      caption: `This pie’s whole is the ${grouped(l.metadata)} metadata blocks. An inode records one file, so mke2fs sets aside a fixed number, by the disk’s size type: one inode per 16 KiB for the default type, 512 MiB to under 4 TiB; per 32 KiB for big, under 16 TiB; and per 64 KiB for huge, above that. ${name}, of the ${l.type} type, gets ${grouped(
        l.inodes,
      )} inodes of ${INODE_SIZE} bytes, in tables set aside now: ${grouped(l.inodeTables)} blocks, ${of(l.inodeTables)} of the disk.`,
    });
    await s.clear();
    this.state.inodes = {
      type: l.type,
      inodeRatio: l.inodeRatio,
      inodes: l.inodes,
      inodeTables: l.inodeTables,
      pie: metadataPie(l),
    };
    const d2: Diagram = await s.show(
      {
        source: pie(
          ['Inode tables', 'Journal', 'Other metadata'],
          `The ${grouped(st('reserve').reserve.metadata)} metadata blocks`,
          st('inodes').inodes.pie,
        ),
      },
      { box: PIE },
    );
    const d2View = pieView(d2, 'metadata');
    await markSlices(d2View, d2, 'metadata', ['slice:Inode tables'], 'this step');
    const inodeCard = cardOf(
        ['inodes', 'df'],
        (st) => [
          ['Size type', st.inodes.type],
          ['One inode per', `${st.inodes.inodeRatio / 1024} KiB`],
          ['Inodes', grouped(st.inodes.inodes)],
          ['Bytes each', `${INODE_SIZE}`],
          ['Blocks', grouped(st.inodes.inodeTables)],
          ['Of the disk', ofDisk(st, st.inodes.inodeTables)],
        ],
        { at: CARD, size: SIZE, title: 'Inode tables' },
      );
    await enterCard(inodeCard);

    // ------------------------------------------------------------------ journal
    await this.step('journal', {
      title:
        l.journal === 262144
          ? `The journal stops growing at 1 GiB`
          : `The journal is ${bytesOf(l.journal)}, ${ofMeta(l.journal)} of the metadata`,
      line: `It doubles with disk size from 16 MiB to 1 GiB; here ${of(l.journal)} of the disk.`,
      // mkjournal.c:359-378.
      caption: `mke2fs sizes the journal in steps of disk size, doubling from 16 MiB at 128 MiB to 1 GiB at 128 GiB, and no larger after that. ${name} gets ${grouped(
        l.journal,
      )} blocks, ${bytesOf(l.journal)}: ${ofMeta(l.journal)} of the metadata and ${of(l.journal)} of the disk.`,
    });
    // The last card goes (the pie, shown by its view, stays), and the pie marks this step's slice.
    await this.play(new FadeOut(inodeCard, { runTime: 0.3 }));
    await markSlices(d2View, d2, 'metadata', ['slice:Journal'], 'this step');
    // The table's rows from the model: each step's first disk size and its journal.
    const steps = JOURNAL_STEPS.map((b) => [`From ${bytesOf(b)}`, bytesOf(journalBlocks(b))] as [string, string]);
    this.state.journal = { journal: l.journal };
    // The table is the same in every scenario; its lit row, in `shown`, is the step this disk's blocks reach.
    const journalCard = view(
      this,
      (state, sh) =>
        card(s, steps, {
          at: CARD,
          size: SIZE,
          title: 'Journal by disk size',
          lit: sh.journalRow == null ? null : { row: sh.journalRow, as: having(state, 'disk').disk.label },
          key: 'journal',
        }),
      { place: false },
    );
    await enterCard(journalCard);
    const row = steps.filter((_, i) => JOURNAL_STEPS[i]! <= st('df').df.blocks).at(-1)!;
    this.shown = { ...this.shown, journalRow: row[0] };
    await this.play(journalCard.sync({ runTime: 0.4 }));

    // ------------------------------------------------------------------ the rest
    await this.step('other', {
      title: `The other ${grouped(l.other)} blocks: copies, bitmaps and the first files`,
      line: `Superblock copies in ${l.superGroups} of ${grouped(l.groups)} groups; two bitmaps in every group.`,
      // closefs.c:23-55 (sparse_super); initialize.c:58-86 (reserved GDT); mke2fs.c:475-555, 3656-3667.
      caption: `Group 0, group 1 and groups that are powers of 3, 5 or 7 keep a copy of the superblock and group descriptors: ${l.superGroups} of ${grouped(
        l.groups,
      )} groups${l.reservedGdt ? `, each with ${l.reservedGdt} spare descriptor blocks for growing the filesystem` : ''}. Every group has two bitmaps. The root directory, lost+found, the orphan file and ${
        l.files.resize + l.files.journalTree > 1 ? 'two index blocks' : 'an index block'
      } take ${l.filesTotal} blocks.`,
    });
    await this.play(new FadeOut(journalCard, { runTime: 0.3 }));
    await markSlices(d2View, d2, 'metadata', ['slice:Other metadata'], 'this step');
    // The descriptor blocks in each copy, which the card's "Blocks a copy" row adds up.
    this.state.descBlocks = l.descBlocks;
    this.state.other = {
      groups: l.groups,
      superGroups: l.superGroups,
      superCopies: l.superCopies,
      reservedGdt: l.reservedGdt,
      bitmaps: l.bitmaps,
      files: l.filesTotal,
      other: l.other,
    };
    await enterCard(
      cardOf(
        ['other', 'descBlocks', 'df'],
        (st) => [
          ['Groups with copies', `${st.other.superGroups}`],
          ['Blocks a copy', st.other.reservedGdt ? `1 + ${st.descBlocks} + ${st.other.reservedGdt}` : `1 + ${st.descBlocks}`],
          ['All copies', grouped(st.other.superCopies)],
          ['Bitmaps', grouped(st.other.bitmaps)],
          ['First files', grouped(st.other.files)],
          ['Other metadata', grouped(st.other.other)],
          ['Of the disk', ofDisk(st, st.other.other)],
        ],
        { at: CARD, size: SIZE, title: 'Other metadata' },
      ),
    );

    // ------------------------------------------------------------------ the chosen reserve
    if (m !== DEFAULT_RESERVE) {
      const gained = chosen.users - sp.users;
      await this.step('chosen', {
          title: `With -m ${m}, users can write ${of(chosen.users)}`,
        line:
          m === 0
            ? `Only the kernel’s ${grouped(chosen.kernel)} blocks are held back; users gain ${bytesOf(gained)}.`
            : `Root keeps ${grouped(chosen.root)} blocks; users gain ${bytesOf(gained)}.`,
        // mke2fs.c:1905-1907 reads -m; mke2fs.c:2832-2833; tune2fs.8.in:475-477 for tune2fs -m.
        caption:
          m === 0
            ? `mkfs.ext4 -m 0 reserves nothing for root, so only the kernel’s ${grouped(chosen.kernel)} blocks are held back. Users can write ${grouped(
                chosen.users,
              )} blocks, ${grouped(gained)} more than at the default, ${bytesOf(gained)}. Root then gets no more room than other users.`
            : `mkfs.ext4 -m ${m} reserves ${m}% for root: ${grouped(chosen.root)} blocks. Users can write ${grouped(chosen.users)} blocks, ${grouped(
                gained,
              )} more than at the default, ${bytesOf(gained)}. tune2fs -m changes the reserve later without reformatting.`,
      });
      await s.clear();
      const whole3: Diagram = await s.show({ source: whole(sp, 'users') }, { box: PIE });
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
      await whole3.morph({ source: whole(chosen, 'users') }, { ops });
      await markSlices(pieView(whole3, 'chosen'), whole3, 'chosen', ['slice:Users can write'], 'changed');
      this.state.chosen = {
        percent: m,
        root: chosen.root,
        users: chosen.users,
        gained,
        pie: wholePie(chosen, 'users'),
      };
      // The kernel's reserve with this root reserve, which the card states beside it.
      this.state.chosenKernel = chosen.kernel;
      await enterCard(
        cardOf(
        ['chosen', 'chosenKernel', 'df'],
          (st) => [
            [`Root, ${st.chosen.percent}%`, grouped(st.chosen.root)],
            ['Kernel', grouped(st.chosenKernel)],
            ['Users', grouped(st.chosen.users)],
            ['Of the disk', ofDisk(st, st.chosen.users)],
            ['Gained', bytesOf(st.chosen.gained)],
          ],
          (st) => ({ at: CARD, size: SIZE, title: `mkfs.ext4 -m ${st.chosen.percent}` }),
        ),
      );
    }

    // ------------------------------------------------------------------ three sizes
    const all = (Object.keys(SIZES) as Size[]).map((k) => ({ k, label: SIZES[k].label, x: space(SIZES[k].bytes, m) }));
    const share = (x: Space, n: number) => percent(n, x.layout.blocks);
    await this.step('sizes', {
      title: `At -m ${m}, users can write ${all.map((a) => share(a.x, a.x.users)).join(', ')} of ${all.map((a) => a.label).join(', ')}`,
      line: `Metadata falls from ${all.map((a) => share(a.x, a.x.layout.metadata)).join(' to ')} of the disk as disks grow.`,
      caption: `Metadata shrinks as a share of the disk, from ${all.map((a) => share(a.x, a.x.layout.metadata)).join(' to ')}, because the journal stops at 1 GiB and larger disks get fewer inodes per byte. ${
        m === 0
          ? 'With no root reserve, almost everything else is for users.'
          : `A ${m}% reserve grows with the disk: at 20 TiB it is ${bytesOf(all[2]!.x.root)}, ${times(all[2]!.x.root, all[2]!.x.layout.metadata)} the metadata.`
      }`,
    });
    await s.clear();
    this.state.sizes = Object.fromEntries(
      all.map((a) => [a.k, { metadata: a.x.layout.metadata, root: a.x.root, users: a.x.users }]),
    );
    // Each disk's blocks, the whole its shares are of.
    this.state.sizeBlocks = Object.fromEntries(all.map((a) => [a.k, a.x.layout.blocks]));
    await enterCard(
      cardOf(
        ['sizes', 'sizeBlocks', 'disk'],
        (st) =>
          (Object.entries(st.sizes) as [Size, (typeof st.sizes)[Size]][]).map(([k, x]) => {
            const of = (n: number) => percent(n, st.sizeBlocks[k]!);
            return [SIZES[k].label, `metadata ${of(x.metadata)}, root reserve ${of(x.root)}, users ${of(x.users)}`] as [string, string];
          }),
        (st) => ({
          at: regionBox('full', { top: 2.6, bottom: -3.6 }),
          size: 0.42,
          title: `mkfs.ext4 -m ${st.disk.reserve}, shares of each disk`,
          lit: { row: st.disk.label, as: 'this scenario' },
        }),
      ),
    );
  }
}

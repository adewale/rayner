// The method-only ext4-space page: the same script intent and model as scenes/explainers/ext4-space, with
// no engine. Every picture is a pure function from state to an SVG string; every step is a pure function from
// (size, reserve) to { title, caption, svg }. main.ts wires them to the shared shell.
import { BLOCK, DEFAULT_RESERVE, INODE_RATIO, INODE_SIZE, JOURNAL_STEPS, RESERVES, SIZES, bytesOf, journalBlocks, percent, space, times } from '../../../../scenes/explainers/ext4-space/model.ts';
import type { Size, Space } from '../../../../scenes/explainers/ext4-space/model.ts';
import { answer, questions } from '../../../../scenes/explainers/ext4-space/answers.ts';
import { C, W, fmt, rect, rows, svg, swatch, text } from '../../draw.ts';
import { RUNS, metadataOf } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}
export type Reserve = (typeof RESERVES)[number];
export const SIZE_KEYS = Object.keys(SIZES) as Size[];
export const DEFAULT: { size: Size; reserve: Reserve } = { size: '1t', reserve: 5 };
const g = fmt;
const runOf = (size: Size, reserve: Reserve) => RUNS[`${size}/${reserve}`]!;
const usersShare = (size: Size, reserve: Reserve) => percent(runOf(size, reserve).statfs.bavail, runOf(size, reserve).dumpe2fs.blocks);

// ------------------------------------------------------------------ pictures: state in, SVG out
/** One bar across the width for a whole disk, split into named parts in order. */
function stack(y: number, parts: { label: string; value: number; fill: string }[], whole: number, h = 34): string {
  let body = '',
    x = 8;
  const bw = W - 16;
  for (const p of parts) {
    const w = (p.value / whole) * bw;
    body += rect(x, y, w, h, p.fill, { stroke: C.line, sw: 0.5 });
    x += w;
  }
  return body + rect(8, y, bw, h, 'none');
}
function legend(y: number, parts: { label: string; value: number; fill: string }[], whole: number): { body: string; h: number } {
  let body = '';
  parts.forEach((p, i) => {
    const yy = y + i * 22;
    body += swatch(8, yy, p.fill, p.label) + text(W - 92, yy + 11, `${g(p.value)}`, { size: 12, anchor: 'end', mono: true }) + text(W - 8, yy + 11, percent(p.value, whole), { size: 12, anchor: 'end', mono: true });
  });
  return { body, h: parts.length * 22 };
}

/** The recorded statfs: what a user other than root can write, against the rest of the disk. */
export function dfSvg(size: Size, reserve: Reserve): string {
  const r = runOf(size, reserve),
    blocks = r.dumpe2fs.blocks;
  const parts = [
    { label: 'Avail: a user can write (f_bavail)', value: r.statfs.bavail, fill: C.goodFill },
    { label: 'Unavailable to that user', value: blocks - r.statfs.bavail, fill: C.d },
  ];
  let body = text(8, 16, `${SIZES[size].label}: ${g(blocks)} blocks of ${BLOCK} bytes`, { size: 12.5, weight: '600' });
  body += stack(26, parts, blocks);
  const l = legend(76, parts, blocks);
  body += l.body + text(8, 76 + l.h + 14, 'Recorded: mkfs.ext4 1.47.3, then statfs on Linux 6.8.0.', { size: 11.5, fill: C.soft });
  return svg(76 + l.h + 22, body, `${SIZES[size].label}: a user can write ${usersShare(size, reserve)} of the disk`);
}

/** The whole disk split by the model: metadata, root reserve, kernel reserve, what users can write. */
export function reserveSvg(sp: Space): string {
  const l = sp.layout;
  const parts = [
    { label: 'Metadata (occupied)', value: l.metadata, fill: C.b },
    { label: 'Root reserve (free, held back)', value: sp.root, fill: C.e },
    { label: 'Kernel reserve (free, held back)', value: sp.kernel, fill: C.a },
    { label: 'Users can write', value: sp.users, fill: C.goodFill },
  ].filter((p) => p.value > 0);
  let body = text(8, 16, `Every block of ${bytesOf(l.blocks)}, at -m ${sp.percent}`, { size: 12.5, weight: '600' });
  body += stack(26, parts, l.blocks);
  const lg = legend(76, parts, l.blocks);
  body += lg.body;
  return svg(76 + lg.h + 6, body, `Metadata ${l.metadata} blocks, root reserve ${sp.root}, kernel reserve ${sp.kernel}, users ${sp.users}`);
}

/** The metadata alone, split into inode tables, journal and the rest. */
export function metadataSvg(sp: Space, mark: 'inodes' | 'journal' | 'other'): string {
  const l = sp.layout;
  const parts = [
    { label: 'Inode tables', value: l.inodeTables, fill: mark === 'inodes' ? C.b : '#f8e1bd' },
    { label: 'Journal', value: l.journal, fill: mark === 'journal' ? C.b : '#f8e1bd' },
    { label: 'Other metadata', value: l.other, fill: mark === 'other' ? C.b : '#f8e1bd' },
  ];
  let body = text(8, 16, `The ${g(l.metadata)} metadata blocks of ${bytesOf(l.blocks)}`, { size: 12.5, weight: '600' });
  body += stack(26, parts, l.metadata);
  const lg = legend(76, parts, l.metadata);
  body += lg.body;
  let y = 76 + lg.h + 10;
  if (mark === 'inodes') {
    const r = rows(y + 14, [
      ['size type', l.type],
      ['one inode per', `${l.inodeRatio / 1024} KiB`],
      ['inodes', g(l.inodes)],
      ['inode size', `${INODE_SIZE} bytes`],
      ['inode-table blocks', `${g(l.inodeTables)} (${percent(l.inodeTables, l.blocks)} of disk)`],
    ]);
    body += r.body;
    y += r.h + 10;
  }
  if (mark === 'journal') {
    body += text(8, y + 12, 'Disk size from → journal', { size: 12, fill: C.soft });
    JOURNAL_STEPS.forEach((b, i) => {
      const yy = y + 32 + i * 20;
      const here = journalBlocks(l.blocks) === journalBlocks(b) && (i === JOURNAL_STEPS.length - 1 || l.blocks < JOURNAL_STEPS[i + 1]!);
      if (here) body += rect(6, yy - 14, W - 12, 19, C.hi, { stroke: 'none' });
      body += text(8, yy, bytesOf(b), { size: 12, mono: true }) + text(160, yy, `→ ${bytesOf(journalBlocks(b))}`, { size: 12, mono: true });
    });
    y += 32 + JOURNAL_STEPS.length * 20;
  }
  if (mark === 'other') {
    const r = rows(y + 14, [
      ['groups with a superblock copy', `${g(l.superGroups)} of ${g(l.groups)}`],
      ['blocks per copy (1 + descriptors + spare)', `1 + ${l.descBlocks} + ${l.reservedGdt}`],
      ['bitmaps (two per group)', g(l.bitmaps)],
      ['first files (root, lost+found, orphan, index)', g(l.filesTotal)],
    ]);
    body += r.body;
    y += r.h + 10;
  }
  return svg(y + 4, body, `Metadata of ${bytesOf(l.blocks)}: inode tables ${l.inodeTables}, journal ${l.journal}, other ${l.other}`);
}

/** The three disks at this reserve: recorded share users can write and the metadata's share. */
export function sizesSvg(size: Size, reserve: Reserve): string {
  const x0 = 170,
    cw = (W - x0 - 8) / 3;
  let body = '';
  SIZE_KEYS.forEach((k, i) => body += text(x0 + i * cw + cw / 2, 16, SIZES[k].label, { size: 12.5, anchor: 'middle', weight: '600' }));
  const lines: [string, (k: Size) => string][] = [
    ['users can write', (k) => usersShare(k, reserve)],
    ['metadata', (k) => percent(metadataOf(runOf(k, reserve)), runOf(k, reserve).dumpe2fs.blocks)],
    ['root reserve', (k) => percent(runOf(k, reserve).dumpe2fs.reserved, runOf(k, reserve).dumpe2fs.blocks)],
  ];
  lines.forEach(([label, f], r) => {
    const y = 28 + r * 32;
    body += text(8, y + 19, label, { size: 12.5 });
    SIZE_KEYS.forEach((k, i) => {
      body += rect(x0 + i * cw + 2, y + 2, cw - 4, 26, k === size ? C.hi : '#fff', { stroke: k === size ? C.ink : C.line });
      body += text(x0 + i * cw + cw / 2, y + 20, f(k), { size: 12.5, anchor: 'middle', mono: true });
    });
  });
  const h = 28 + lines.length * 32;
  body += text(8, h + 16, `Recorded: mkfs.ext4 1.47.3 -m ${reserve}, statfs on Linux 6.8.0.`, { size: 11.5, fill: C.soft });
  return svg(h + 24, body, `At -m ${reserve}, users can write ${SIZE_KEYS.map((k) => usersShare(k, reserve)).join(', ')} of the three disks`);
}

// ------------------------------------------------------------------ the steps
export function steps(size: Size, reserve: Reserve): Step[] {
  const sp = space(SIZES[size].bytes, reserve),
    def = space(SIZES[size].bytes, DEFAULT_RESERVE),
    l = sp.layout;
  const r = runOf(size, reserve);
  const label = SIZES[size].label;
  const blocks = r.dumpe2fs.blocks,
    unavailable = blocks - r.statfs.bavail;
  const out: Step[] = [];

  out.push({
    id: 'df',
    title: `A new ${label} disk: a user can write ${usersShare(size, reserve)} of it`,
    caption: `mkfs.ext4 1.47.3${reserve === DEFAULT_RESERVE ? ' with no options' : ` -m ${reserve}`} on an empty ${label} disk of ${g(blocks)} blocks of ${BLOCK} bytes, then mounted. The kernel's statfs, which df reads, says a user other than root can write ${g(r.statfs.bavail)} blocks: ${usersShare(size, reserve)}. The other ${g(unavailable)} blocks, ${percent(unavailable, blocks)} or ${bytesOf(unavailable)}, are unavailable to that user before any file is written. Predict: are they all occupied by the filesystem's own structures?`,
    svg: dfSvg(size, reserve),
  });

  out.push({
    id: 'reserve',
    title: `Answer: the 5% root reserve is ${times(def.root, l.metadata)} all the metadata here`,
    caption: `${answer()}. Without -m, mke2fs keeps 5% of the blocks for root: ${g(def.root)} on this disk, free blocks held back for privileged use, not occupied. The metadata is ${g(l.metadata)} blocks, ${percent(l.metadata, l.blocks)}. Once mounted, the kernel holds back ${g(sp.kernel)} more. A user can write the free blocks less both reserves${reserve !== DEFAULT_RESERVE ? `; this run used -m ${reserve}, so root keeps ${g(sp.root)}` : ''}.`,
    svg: reserveSvg(sp),
  });

  out.push({
    id: 'inodes',
    title: `Inode tables are ${percent(l.inodeTables, l.metadata)} of the metadata`,
    caption: `Each file needs an inode, and mke2fs sets aside a fixed number of ${INODE_SIZE}-byte inodes when it formats, by the disk's size type: one per ${INODE_RATIO.default / 1024} KiB for the default type (512 MiB to under 4 TiB), one per ${INODE_RATIO.big / 1024} KiB for big (under 16 TiB) and one per ${INODE_RATIO.huge / 1024} KiB for huge. ${label} is ${l.type === 'default' ? 'of the default type' : `of the ${l.type} type`}, so it gets ${g(l.inodes)} inodes, whose tables take ${g(l.inodeTables)} blocks: ${percent(l.inodeTables, l.blocks)} of the disk.`,
    svg: metadataSvg(sp, 'inodes'),
  });

  out.push({
    id: 'journal',
    title: l.journal === journalBlocks(JOURNAL_STEPS.at(-1)!) ? 'The journal stops growing at 1 GiB' : `The journal is ${bytesOf(l.journal)}, ${percent(l.journal, l.metadata)} of the metadata`,
    caption: `mke2fs sizes the journal by steps of disk size: 16 MiB from 128 MiB, doubling at each step to 1 GiB from 128 GiB, and no larger beyond. ${label} gets ${g(l.journal)} blocks, ${bytesOf(l.journal)}: ${percent(l.journal, l.metadata)} of the metadata and ${percent(l.journal, l.blocks)} of the disk.`,
    svg: metadataSvg(sp, 'journal'),
  });

  out.push({
    id: 'other',
    title: `The other ${g(l.other)} blocks: superblock copies, bitmaps and the first files`,
    caption: `Groups 0 and 1 and groups that are powers of 3, 5 or 7 hold a copy of the superblock and the group descriptors: ${g(l.superGroups)} of ${g(l.groups)} groups here${l.reservedGdt ? `, each with ${g(l.reservedGdt)} spare descriptor blocks for growing the filesystem` : ''}. Every group has a block bitmap and an inode bitmap. The root directory, lost+found, the orphan file${l.files.resize ? ', the resize inode' : ''} and ${l.files.journalTree ? 'the journal’s extent block' : 'nothing else'} take ${g(l.filesTotal)} blocks.`,
    svg: metadataSvg(sp, 'other'),
  });

  if (reserve !== DEFAULT_RESERVE) {
    const gain = sp.users - def.users;
    out.push({
      id: 'chosen',
      title: `With -m ${reserve}, a user can write ${percent(sp.users, l.blocks)}`,
      caption: reserve === 0
        ? `mkfs.ext4 -m 0 keeps nothing for root, so only the kernel's ${g(sp.kernel)} blocks are held back. A user can write ${g(sp.users)} blocks, ${g(gain)} more than at -m 5, ${bytesOf(gain)}. Root then has no more room than anyone else.`
        : `mkfs.ext4 -m 1 keeps 1% for root: ${g(sp.root)} blocks. A user can write ${g(sp.users)} blocks, ${g(gain)} more than at -m 5, ${bytesOf(gain)}.`,
      svg: reserveSvg(sp),
    });
  }

  const big = space(SIZES['20t'].bytes, reserve);
  out.push({
    id: 'sizes',
    title: `At -m ${reserve}, a user can write ${SIZE_KEYS.map((k) => usersShare(k, reserve)).join(', ')} of 1 GiB, 1 TiB and 20 TiB`,
    caption: `The metadata's share falls as disks grow, from ${SIZE_KEYS.map((k) => percent(metadataOf(runOf(k, reserve)), runOf(k, reserve).dumpe2fs.blocks)).join(' to ')}, because the journal stops at 1 GiB and the big and huge types give larger disks fewer inodes per byte. ${reserve ? `A ${reserve}% reserve grows with the disk: at 20 TiB it is ${bytesOf(big.root)}, ${times(big.root, big.layout.metadata)} the metadata.` : 'With no root reserve, nearly every free block is a user’s.'}`,
    svg: sizesSvg(size, reserve),
  });
  return out;
}

const q1 = questions[1]();
export const CHECKS = [
  { q: q1.question, a: q1.answer },
  { q: 'At 4 TiB mke2fs switches to its big type, with one inode per 32 KiB of disk instead of 16 KiB. How does a 4 TiB disk’s metadata compare with that of a disk 128 MiB smaller?', a: questions[2]() },
  { q: 'An administrator runs tune2fs -m 0 on the 1 TiB disk to reclaim the filesystem’s overhead. What do users get back, and what stays?', a: questions[3]() },
];

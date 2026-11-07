// How the exgit explainer draws one state: the bytes Git hashes for a blob, the id they hash to, and each
// commit's row of object boxes (the commit, its tree, each entry's blob) as the steps record them. The
// object diagram is Mermaid, laid out by the scene's live diagram.
import { Text, Rectangle, Group, Arrow, BraceLabel } from '../../../src/index.ts';
import type { Mobject, Scene, Box } from '../../../src/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import { CodeBlock } from '../../../explain/index.ts';
import type { Palette } from '../../../explain/index.ts';

/** The stage's colours these pictures use: text, secondary text and the emphasis colour. */
export type Ink = { ink: string; soft: string; accent: string };
/** The bytes Git hashes for the blob, as the steps record them: header bytes first. */
export interface BlobState { bytes: number[]; header: number }
/** One commit's row as the steps record it: the commit, its tree and parents, and each entry's blob and text. */
export interface RowState { label: string; commit: string; tree: string; parents: string[]; entries: { file: string; blob: string; text: string }[] }

export const short = (id: string) => id.slice(0, 7);
/** How a byte reads in a cell: printable, or its escape. */
const glyph = (b: number) => (b === 0 ? '\\0' : b === 10 ? '\\n' : b === 32 ? 'sp' : String.fromCharCode(b));

const CELL = 0.98,
  GAP = 0.1;
/** The height of the blob's cells; the hash arrow and the id hang under it. */
export const CELL_Y = 0.5;

/** The blob's cells, from the bytes the state records: `part` is the header's or the content's, with its label over it. */
export function blobCells({ bytes, header: n }: BlobState, part: 'header' | 'content', { ink, soft, accent }: Ink): Group {
  const x0 = -((bytes.length - 1) * (CELL + GAP)) / 2;
  const cells = bytes.map((b, i) => {
    const isHead = i < n;
    const box = new Rectangle({
      width: CELL,
      height: 0.9,
      cornerRadius: 0.08,
      fill: isHead ? accent : ink,
      fillOpacity: 0.1,
      stroke: isHead ? accent : soft,
      strokeWidth: 0.02,
    });
    const ch = new Text(glyph(b), { fontSize: 0.36, font: 'mono', color: isHead ? accent : ink });
    const hex = new Text(b.toString(16).padStart(2, '0'), { fontSize: 0.22, font: 'mono', color: soft });
    const x = x0 + i * (CELL + GAP);
    box.moveTo([x, CELL_Y]);
    ch.moveTo([x, CELL_Y]);
    hex.moveTo([x, CELL_Y - 0.72]);
    return new Group(box, ch, hex);
  });
  const g = new Group(...(part === 'header' ? cells.slice(0, n) : cells.slice(n)));
  const color = part === 'header' ? accent : ink;
  const [a, , b] = g.box()!;
  const t = new Text(part, { fontSize: 0.26, color });
  t.moveTo([(a + b) / 2, CELL_Y + 0.85]);
  const rule = new Rectangle({ width: b - a, height: 0.03, fill: color, stroke: 'none' }).moveTo([(a + b) / 2, CELL_Y + 0.58]);
  return keyed(new Group(g, new Group(t, rule)), `exgit-${part}`);
}

/** The blob's id, its first seven digits highlighted. */
export function idRow(id: string, { ink, accent }: Ink): { idRow: Group; idHead: Text } {
  const idHead = new Text(short(id), { fontSize: 0.42, font: 'mono', color: accent, weight: 'bold' }),
    idTail = new Text(id.slice(7), { fontSize: 0.42, font: 'mono', color: ink });
  const idRow = new Group(idHead, idTail);
  idTail.nextTo(idHead, [1, 0], 0.02);
  idRow.moveTo([0, CELL_Y - 2.65]);
  return { idRow, idHead };
}

/** An object as a box: its kind and short id, then lines of what it holds. */
function objectBox(kind: string, id: string, lines: readonly string[], width: number, height: number, stroke: string, { ink, soft }: Ink): Group {
  const rect = new Rectangle({ width, height, cornerRadius: 0.08, fill: ink, fillOpacity: 0.06, stroke, strokeWidth: 0.024 });
  const top = (0.3 + lines.length * 0.28) / 2;
  const headText = new Text(`${kind} ${short(id)}`, { fontSize: 0.21, font: 'mono', color: ink, weight: 'bold' });
  headText.moveTo([0, top - 0.12]);
  const rows = lines.map((l, i) => new Text(l, { fontSize: 0.19, font: 'mono', color: soft }).moveTo([0, top - 0.42 - i * 0.28]));
  return new Group(rect, headText, ...rows);
}

const ROW_H = 1.2,
  ENTRY_W = 3.62,
  TREE_LEFT = -1.75;
export const ROW_Y = [-1.7, -3.1];

/** One commit's row, from the state's record of it. `lit` outlines a blob in the emphasis colour; `skip` leaves it out, to arrive by copy. */
export function commitRow(row: RowState, y: number, { lit, skip }: { lit?: string | null; skip?: string | null }, colours: Ink): { row: Group; blobs: Map<string, Group> } {
  const { ink, soft, accent } = colours;
  const keyOf = (file: string) => `exgit-${row.label.replace(' ', '-')}:${file}`;
  const name = new Text(row.label, { fontSize: 0.22, color: soft, anchor: 'end' }).moveTo([TREE_LEFT - 2.9, y], [1, 0]);
  const commitBox = objectBox('commit', row.commit, [`tree ${short(row.tree)}`, ...row.parents.map((p) => `parent ${short(p)}`)], 2.5, ROW_H, soft, colours).moveTo([TREE_LEFT - 1.45, y]);
  const width = row.entries.length * ENTRY_W + 0.15;
  const treeBox = new Rectangle({ width, height: ROW_H, cornerRadius: 0.08, fill: ink, fillOpacity: 0.03, stroke: soft, strokeWidth: 0.024 }).moveTo([TREE_LEFT + width / 2, y]);
  const treeHead = new Text(`tree ${short(row.tree)}`, { fontSize: 0.21, font: 'mono', color: ink, weight: 'bold', anchor: 'start' }).moveTo([TREE_LEFT + 0.2, y + ROW_H / 2 - 0.25], [-1, 0]);
  const parts: Mobject[] = [name, commitBox, treeBox, treeHead];
  const blobs = new Map<string, Group>();
  row.entries.forEach(({ file, blob, text }, k) => {
    const x = TREE_LEFT + 0.2 + k * ENTRY_W,
      by = y - 0.17;
    parts.push(new Text(file, { fontSize: 0.19, font: 'mono', color: soft, anchor: 'start' }).moveTo([x, by], [-1, 0]));
    const box = objectBox('blob', blob, [JSON.stringify(text)], 2.15, 0.66, file === lit ? accent : soft, colours);
    blobs.set(file, keyed(box.moveTo([x + 1.27 + 2.15 / 2, by]), keyOf(file)));
    if (file !== skip) parts.push(box);
  });
  return { row: new Group(...parts), blobs };
}

/** A commit's row in words, from the same record the boxes show. */
export const rowWords = (row: RowState) =>
  `${row.label}: commit ${short(row.commit)} names tree ${short(row.tree)}, which lists ${row.entries.map((e) => `${e.file} as blob ${short(e.blob)}`).join(' and ')}`;

/** A code panel keyed `exgit-<name>`, laid out as s.code lays one out, its bar on `focus` when given. */
export const codePanel = (scene: Scene, palette: Palette, name: string, lines: string[], at: Box, focus?: [number, number]) =>
  new CodeBlock(scene, palette, lines, { at, ...(focus ? { focus } : {}), key: `exgit-${name}` });

/** The arrow from the blob's bytes down to their id, labelled SHA-1. */
export function hashArrow(soft: string): { arrow: Arrow; how: Text } {
  const arrow = new Arrow([0, CELL_Y - 1.1], [0, CELL_Y - 2.05], { stroke: soft, strokeWidth: 0.03, tipLength: 0.2 });
  const how = new Text('SHA-1', { fontSize: 0.24, color: soft, anchor: 'start' }).moveTo([0.3, CELL_Y - 1.57], [-1, 0]);
  return { arrow, how };
}

/** The blob's id row, keyed as the blob step shows it. */
export const blobIdRow = (id: string, colours: Ink) => keyed(idRow(id, colours).idRow, 'exgit-blob-id');

/** The brace under the id's first seven digits, the short name later pictures use. */
export function abbrevBrace(id: string, colours: Ink): BraceLabel {
  const { idHead } = idRow(id, colours);
  return keyed(new BraceLabel(idHead, `${short(id)} names it from here on`, [0, -1], { fontSize: 0.26, color: colours.soft, buff: 0.06, labelBuff: 0.12 }), 'exgit-abbrev');
}

/** The commits' rows the state records, one under another; `shared` outlined, and left out of every row after the first. */
export interface RowsState { commits: RowState[]; shared: string | null }
export const commitRows = (r: RowsState, colours: Ink) =>
  keyed(new Group(...r.commits.map((row, i) => commitRow(row, ROW_Y[i]!, { lit: r.shared, skip: i ? r.shared : null }, colours).row)), 'exgit-rows');
/** The shared blob's box alone, in row `row`'s place: over commit one's box, or in tree two's row. */
export const sharedBlob = (r: RowsState, row: number, colours: Ink) =>
  keyed(commitRow(r.commits[row]!, ROW_Y[row]!, { lit: r.shared, skip: r.shared }, colours).blobs.get(r.shared!)!, 'exgit-shared-blob');

/** Where each changed id sits in the hash step: old above new, tree above commit. */
const ID_Y = { tree: { old: -1.8, new: -2.1 }, commit: { old: -2.6, new: -2.9 } };
/** A line of secondary text in the hash step's column, starting at `x`. */
export const idLabel = (text: string, x: number, y: number, soft: string) =>
  new Text(text, { fontSize: 0.22, color: soft, anchor: 'start' }).moveTo([x, y], [-1, 0]);
/** An id in mono, with the digits it shares, place for place, with `other` in the emphasis colour. */
function hex(id: string, other: string, x: number, y: number, color: string, accent: string) {
  const t = new Text(id, { fontSize: 0.2, font: 'mono', color, anchor: 'start' }).moveTo([x + 1.45, y], [-1, 0]);
  if (t.children.length !== id.length) throw new Error('Expected one glyph per hex digit');
  t.children.forEach((g, i) => id[i] === other[i] && g.setFill(accent));
  return t;
}
/**
 * One changed id, old or new, coloured where it agrees with the other place for place. Until `changed`, the new id
 * is a copy of the old one in its place, so the morph can change it.
 */
export function changedId(ids: { old: string; now: string }, kind: 'tree' | 'commit', age: 'old' | 'new', changed: boolean, x: number, { ink, soft, accent }: Ink) {
  const { old, now } = ids;
  const y = ID_Y[kind][age];
  if (age === 'new' && !changed) return keyed(hex(old, now, x, y + 0.3, soft, accent), `exgit-id:${kind}:${age}`);
  return keyed(age === 'old' ? hex(old, now, x, y, soft, accent) : hex(now, old, x, y, ink, accent), `exgit-id:${kind}:${age}`);
}
/** What the two id morphs paired, beside the digits that are equal in place. */
export const pairCounts = (paired: { tree: number; commit: number }, same: { tree: number; commit: number }, x: number, soft: string) =>
  new Group(
    idLabel(`Paired with an equal digit anywhere: tree ${paired.tree}, commit ${paired.commit} of 40`, x, -3.4, soft),
    idLabel(`Same digit in the same place, coloured: tree ${same.tree}, commit ${same.commit} of 40`, x, -3.8, soft),
  );

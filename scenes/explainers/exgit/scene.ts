import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/exgit.ts';
import type { Evidence } from '../../../src/index.ts';
import {
  Scene,
  Text,
  Rectangle,
  Arrow,
  Group,
  FadeIn,
  FadeOut,
  BraceLabel,
  TransformFromCopy,
  TransformMatchingShapes,
  TransformMatchingText,
  DOWN,
} from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { Repo, AUTHOR, parseTree } from '../lib/git.ts';

const STYLE = 'catppuccin-mocha';
const short = (id: string) => id.slice(0, 7);
const DIAGRAM = regionBox('top', { bottom: -0.85 }),
  BOTTOM = regionBox('bottom', { top: -1.1 }),
  LEFT = regionBox('bottom', { top: -1.1, right: -0.15 }),
  RIGHT = regionBox('bottom', { top: -1.1, left: 0.15 });
/** "<type> <length>\0", the header Git hashes in front of an object's bytes. */
const objectHeader = (repo: Repo, id: string) => `${repo.objects[id]!.type} ${repo.objects[id]!.bytes.length}\\0`;
/** A tree's entries as stored: mode, name, a zero byte, then the 20-byte id (shown as hex). */
const entryLines = (repo: Repo, id: string, hex: number) =>
  parseTree(repo.objects[id]!.bytes).map(
    ([mode, name, child]) => `${mode} ${name}\\0 ${hex < 40 ? child.slice(0, hex) + '…' : child}`,
  );
/** A tree's bytes as listed on stage: its header, its entries with full ids, then its own id. */
const treeLines = (repo: Repo, id: string) => [
  `header  ${objectHeader(repo, id)}`,
  ...entryLines(repo, id, 40),
  `sha1    ${id}`,
];
/** A commit's stored text, one line per row. */
const objectLines = (repo: Repo, id: string) => repo.text(id).replace(/\n$/, '').split('\n');
/** Every object a commit reaches through its tree and parent lines: what a clone has to fetch. */
const reachable = (repo: Repo, from: string): string[] => {
  const seen = new Set<string>();
  const walk = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = repo.objects[id]!;
    if (o.type === 'commit')
      for (const line of objectLines(repo, id)) {
        if (line === '') break;
        const [k, v] = line.split(' ');
        if (k === 'tree' || k === 'parent') walk(v!);
      }
    else if (o.type === 'tree') for (const [, , child] of parseTree(o.bytes)) walk(child);
  };
  walk(from);
  return [...seen];
};
/** What the last `n` matching transforms of the scene recorded (Scene.record): their pairing, as evidence. */
const lastMatches = (scene: Scene, n: number): Evidence[] => {
  const found = scene.evidence.filter((e) => e.kind === 'match').slice(-n);
  if (found.length !== n) throw new Error(`Expected ${n} recorded matches, found ${found.length}`);
  return found;
};
/** In how many of the 40 positions two ids hold the same hex digit. */
const samePlace = (a: string, b: string) => [...a].filter((c, i) => b[i] === c).length;
/** How a byte reads in a cell: printable, or its escape. */
const glyph = (b: number) => (b === 0 ? '\\0' : b === 10 ? '\\n' : b === 32 ? 'sp' : String.fromCharCode(b));

export default class GitExplainer extends Scene {
  static meta = {
    id: 'exgit',
    title: 'What does Git store when a file changes?',
    sources: [
      'https://git-scm.com/book/en/v2/Git-Internals-Git-Objects',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/lib/gitmodel.ts',
    ],
  };
  static settings = [
    {
      id: 'change',
      label: 'The second commit',
      default: 'add',
      options: [
        { value: 'add', label: 'Add world.txt' },
        { value: 'edit', label: 'Edit hello.txt' },
      ],
    },
  ];
  override async construct() {
    const which = settingsOf(this).change,
      add = which === 'add',
      repo = new Repo(),
      s = stage(this, { headingSize: 0.6, style: STYLE }),
      ink = s.palette.ink,
      accent = s.emphasis;

    // ── blob: the bytes that are hashed ────────────────────────────────
    await readerFirst(this, s, readerFrames(which!));
    await this.step('blob', {
      detail: true,
      title: 'A blob id is the SHA-1 of typed bytes',
      line: 'Header bytes, then content bytes: 13 in all, hashed together.',
      caption:
        'Git hashes a header (the type, the byte length and a zero byte) followed by the content. The id is the SHA-1 of exactly these 13 bytes, and the brace marks the seven digits that name it in later pictures.',
    });
    await s.clear();
    const hello = repo.blob('hello\n');
    this.state.hello = hello;
    const object = repo.objects[hello]!,
      header = new TextEncoder().encode(`${object.type} ${object.bytes.length}\0`),
      all = [...header, ...object.bytes];
    const cell = 0.98,
      gap = 0.1,
      x0 = -((all.length - 1) * (cell + gap)) / 2,
      cellY = 0.5;
    const cells = all.map((b, i) => {
      const isHead = i < header.length;
      const box = new Rectangle({
        width: cell,
        height: 0.9,
        cornerRadius: 0.08,
        fill: isHead ? accent : ink,
        fillOpacity: 0.1,
        stroke: isHead ? accent : s.soft,
        strokeWidth: 0.02,
      });
      const ch = new Text(glyph(b), { fontSize: 0.36, font: 'mono', color: isHead ? accent : ink });
      const hex = new Text(b.toString(16).padStart(2, '0'), { fontSize: 0.22, font: 'mono', color: s.soft });
      const x = x0 + i * (cell + gap);
      box.moveTo([x, cellY]);
      ch.moveTo([x, cellY]);
      hex.moveTo([x, cellY - 0.72]);
      return new Group(box, ch, hex);
    });
    const headCells = new Group(...cells.slice(0, header.length)),
      bodyCells = new Group(...cells.slice(header.length));
    const span = (g: Group, text: string, color: string) => {
      const [a, , b] = g.box()!;
      const t = new Text(text, { fontSize: 0.26, color });
      t.moveTo([(a + b) / 2, cellY + 0.85]);
      const rule = new Rectangle({ width: b - a, height: 0.03, fill: color, stroke: 'none' }).moveTo([
        (a + b) / 2,
        cellY + 0.58,
      ]);
      return new Group(t, rule);
    };
    const bodyLabel = span(bodyCells, 'content', ink),
      headLabel = span(headCells, 'header', accent);
    await s.enter(bodyCells, bodyLabel, {
      runTime: 0.5,
      describe: `The content bytes ${JSON.stringify(new TextDecoder().decode(object.bytes))}, one cell each with its hex value`,
    });
    await s.enter(headCells, headLabel, {
      runTime: 0.6,
      shift: [0.6, 0],
      describe: `The header bytes “${object.type} ${object.bytes.length}” and a zero byte, in front of the content`,
    });
    const arrow = new Arrow([0, cellY - 1.1], [0, cellY - 2.05], { stroke: s.soft, strokeWidth: 0.03, tipLength: 0.2 });
    const how = new Text('SHA-1', { fontSize: 0.24, color: s.soft, anchor: 'start' }).moveTo(
      [0.3, cellY - 1.57],
      [-1, 0],
    );
    const idHead = new Text(short(hello), { fontSize: 0.42, font: 'mono', color: accent, weight: 'bold' }),
      idTail = new Text(hello.slice(7), { fontSize: 0.42, font: 'mono', color: ink });
    const idRow = new Group(idHead, idTail);
    idTail.nextTo(idHead, [1, 0], 0.02);
    idRow.moveTo([0, cellY - 2.65]);
    await s.enter(arrow, how, { runTime: 0.4, describe: 'An arrow labelled SHA-1 from the bytes to their id' });
    await s.enter(idRow, { runTime: 0.6, describe: `The blob id ${hello}, its first seven digits highlighted` });
    // The short name every later picture uses is this prefix of the real id.
    const abbrev = new BraceLabel(idHead, `${short(hello)} names it from here on`, DOWN, {
      fontSize: 0.26,
      color: s.soft,
      buff: 0.06,
      labelBuff: 0.12,
    });
    await s.enter(abbrev, {
      runTime: 0.4,
      describe: `A brace under the first seven digits, ${short(hello)}: the name later pictures give the blob`,
    });

    // ── tree: names live in the tree ────────────────────────────────────
    await this.step('tree', {
      detail: true,
      title: 'A tree gives those bytes a name',
      line: 'The name hello.txt is in the tree entry, not in the blob.',
      caption:
        'A tree entry stores a mode, the name hello.txt and the blob’s id. Hashing the tree’s own bytes gives it an id too. The name lives in the tree, never in the blob.',
    });
    // The bytes go; their id is carried into the tree entry that names it, where the tree's bytes take it up.
    await this.play(
      ...[...cells, headLabel, bodyLabel, arrow, how, abbrev].map((m) => new FadeOut(m, { runTime: 0.4 })),
    );
    const t1 = repo.tree([['100644', 'hello.txt', hello]]);
    const treeCode = await s.code(treeLines(repo, t1), { at: BOTTOM, enter: false });
    await s.carry(idRow, treeCode.code.token(1, hello).box()!);
    await this.play(new FadeIn(treeCode, { runTime: 0.4 }), new FadeOut(idRow, { runTime: 0.4 }));
    const B1 = `Hello["blob<br/>${short(hello)}"]`;
    const T1 = `T1["tree ${short(t1)}<br/>hello.txt"]`;
    const TREE = `graph LR\n${T1}\n${B1}\nT1 --> Hello`;
    const d = await s.show({ source: TREE }, { box: DIAGRAM });
    await treeCode.focus(1);

    // ── commit: a commit names a tree; a branch names a commit ─────────
    await this.step('commit', {
      detail: true,
      title: 'A commit names a tree; a branch names a commit',
      line: 'main → commit → tree → blob: each holds the next one’s id.',
      caption:
        'The commit’s first line is its tree’s id. The branch main is just a reference holding the commit’s id. Follow main to the commit, its tree and the file bytes.',
    });
    const c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' });
    repo.refs['refs/heads/main'] = c1;
    const C1 = `C1["commit<br/>${short(c1)}"]`;
    const COMMIT = `graph LR\nMain([main])\n${C1}\n${T1}\n${B1}\nMain --> C1\nC1 --> T1\nT1 --> Hello`;
    const commitCode = await s.code(objectLines(repo, c1), { at: BOTTOM, enter: false });
    await this.play(new FadeOut(treeCode), new FadeIn(commitCode));
    await d.morph({ source: COMMIT });
    await d.walk(
      [
        ['Main', 'C1'],
        ['C1', 'T1'],
        ['T1', 'Hello'],
      ],
      { trail: true },
    );
    await commitCode.focus(0);
    this.state = { hello, t1, c1, head: repo.resolve('refs/heads/main') };

    // ── change: a second commit writes only what is new ────────────────
    const nextBlob = repo.blob(add ? 'world\n' : 'hello again\n');
    const t2 = repo.tree(
      add
        ? [
            ['100644', 'hello.txt', hello],
            ['100644', 'world.txt', nextBlob],
          ]
        : [['100644', 'hello.txt', nextBlob]],
    );
    const c2 = repo.commit({ tree: t2, parents: [c1], author: AUTHOR, message: 'second\n' });
    // Objects commit two reaches that commit one does not: what the second commit wrote.
    const before = reachable(repo, c1),
      written = reachable(repo, c2).filter((id) => !before.includes(id)).length;
    await this.step('change', {
      detail: true,
      title: add ? 'Add a file: the old blob is reused' : 'Edit a file: new blob, new tree, new commit',
      line: add
        ? `Tree two names blob ${short(hello)} again; ${written} new objects are written.`
        : `Changed bytes change every id above them: ${written} new objects.`,
      caption: add
        ? `Tree two lists hello.txt with the very same blob id, plus world.txt. Below, commit one’s row stays put, ${written} new objects grow in, and the hello blob moves into tree two as the same object: git does not write it again.`
        : `New bytes hash to a new blob id. The tree naming it changes, so its id changes, and so does the commit’s. Below, commit one’s row stays put and all ${written} of commit two’s objects grow in new.`,
    });
    const B2 = `New["blob<br/>${short(nextBlob)}"]`,
      T2 = `T2["tree ${short(t2)}<br/>${add ? 'hello.txt, world.txt' : 'hello.txt'}"]`,
      C2 = `C2["commit<br/>${short(c2)}"]`;
    const objects =
      `${C2}\n${C1}\n${T2}\n${T1}\n${B2}\n${B1}\n` +
      `C1 --> T1\nT1 --> Hello\nC2 --> C1\nC2 --> T2\n` +
      (add ? `T2 --> Hello\nT2 --> New` : `T2 --> New`);
    const CHANGE = `graph LR\nMain([main])\n${objects}\nMain --> C1`;
    await s.clearOverlays();
    await d.morph({ source: CHANGE });
    await d.note('edge:C2->C1#0', 'parent', { side: 'below' });
    // Below the graph, each commit's row as native boxes with the model's ids:
    // the commit, then its tree holding each entry's blob, read back from the stored bytes.
    /** An object as a box: its kind and short id, then lines of what it holds. */
    const objectBox = (
      kind: string,
      id: string,
      lines: readonly string[],
      width: number,
      height: number,
      stroke: string,
    ) => {
      const rect = new Rectangle({
        width,
        height,
        cornerRadius: 0.08,
        fill: ink,
        fillOpacity: 0.06,
        stroke,
        strokeWidth: 0.024,
      });
      const top = (0.3 + lines.length * 0.28) / 2;
      const head = new Text(`${kind} ${short(id)}`, { fontSize: 0.21, font: 'mono', color: ink, weight: 'bold' });
      head.moveTo([0, top - 0.12]);
      const rows = lines.map((l, i) =>
        new Text(l, { fontSize: 0.19, font: 'mono', color: s.soft }).moveTo([0, top - 0.42 - i * 0.28]),
      );
      return new Group(rect, head, ...rows);
    };
    const ROW_H = 1.2,
      ENTRY_W = 3.62,
      TREE_LEFT = -1.75;
    /** One commit's row. `lit` outlines a blob in the emphasis colour; `skip` leaves it out, to arrive by copy. */
    const commitRow = (
      label: string,
      commit: string,
      y: number,
      { lit, skip }: { lit?: string; skip?: string } = {},
    ) => {
      const text = objectLines(repo, commit),
        tree = text.find((l) => l.startsWith('tree '))!.slice(5),
        parents = text.filter((l) => l.startsWith('parent ')).map((l) => l.slice(7));
      const name = new Text(label, { fontSize: 0.22, color: s.soft, anchor: 'end' }).moveTo(
        [TREE_LEFT - 2.9, y],
        [1, 0],
      );
      const commitBox = objectBox(
        'commit',
        commit,
        [`tree ${short(tree)}`, ...parents.map((p) => `parent ${short(p)}`)],
        2.5,
        ROW_H,
        s.soft,
      ).moveTo([TREE_LEFT - 1.45, y]);
      const entries = parseTree(repo.objects[tree]!.bytes),
        width = entries.length * ENTRY_W + 0.15;
      const treeBox = new Rectangle({
        width,
        height: ROW_H,
        cornerRadius: 0.08,
        fill: ink,
        fillOpacity: 0.03,
        stroke: s.soft,
        strokeWidth: 0.024,
      }).moveTo([TREE_LEFT + width / 2, y]);
      const treeHead = new Text(`tree ${short(tree)}`, {
        fontSize: 0.21,
        font: 'mono',
        color: ink,
        weight: 'bold',
        anchor: 'start',
      }).moveTo([TREE_LEFT + 0.2, y + ROW_H / 2 - 0.25], [-1, 0]);
      const parts = [name, commitBox, treeBox, treeHead];
      const blobs = new Map<string, Group>();
      entries.forEach(([, file, blob], k) => {
        const x = TREE_LEFT + 0.2 + k * ENTRY_W,
          by = y - 0.17;
        parts.push(
          new Text(file, { fontSize: 0.19, font: 'mono', color: s.soft, anchor: 'start' }).moveTo([x, by], [-1, 0]),
        );
        const box = objectBox(
          'blob',
          blob,
          [JSON.stringify(repo.text(blob))],
          2.15,
          0.66,
          file === lit ? accent : s.soft,
        );
        blobs.set(file, box.moveTo([x + 1.27 + 2.15 / 2, by]));
        if (file !== skip) parts.push(box);
      });
      return { row: new Group(...parts), blobs };
    };
    /** A commit's row in words, from the same stored bytes the boxes show. */
    const rowWords = (label: string, commit: string) => {
      const tree = objectLines(repo, commit)[0]!.slice(5),
        entries = parseTree(repo.objects[tree]!.bytes).map(([, file, blob]) => `${file} as blob ${short(blob)}`);
      return `${label}: commit ${short(commit)} names tree ${short(tree)}, which lists ${entries.join(' and ')}`;
    };
    const shared = add ? 'hello.txt' : undefined;
    const one = commitRow('commit one', c1, -1.7);
    await s.enter(one.row, { runTime: 0.5, describe: `The row of ${rowWords('commit one', c1)}` });
    // Redrawn with commit two's row under it, morphed by shape: what is the same stays, the rest grows in.
    const oneAgain = commitRow('commit one', c1, -1.7, { lit: shared }),
      two = commitRow('commit two', c2, -3.1, { lit: shared, skip: shared });
    const bothRows = () =>
      `Two rows, ${rowWords('commit one', c1)}; under it, ${rowWords('commit two', c2)}` +
      (shared ? `. The ${shared} blob ${short(hello)} is outlined in both trees: one object, named twice` : '');
    const rows = s.keep(new Group(oneAgain.row, two.row), { describe: bothRows });
    await this.play(new TransformMatchingShapes(one.row, rows, { runTime: 1.2 }));
    const [grown] = lastMatches(this, 1);
    if (grown!.removed !== 0 || grown!.morphed !== 0) throw new Error('The morph did not keep commit one’s row whole');
    const morphNote = s.keep(
      new Text(`The redraw kept all ${grown!.matched} shapes of commit one’s row and grew ${grown!.added} new ones.`, {
        fontSize: 0.22,
        color: s.soft,
      }).moveTo([0, -4.07]),
    );
    await this.play(new FadeIn(morphNote, { runTime: 0.4 }));
    if (shared) {
      // Tree two names the very object tree one names: the same box moves across, id and all.
      const same = s.keep(two.blobs.get(shared)!, { describe: bothRows });
      await this.play(new TransformFromCopy(oneAgain.blobs.get(shared)!, same, { runTime: 0.9 }));
    }
    if (add) {
      await d.mark(['Hello', 'edge:T1->Hello#0', 'edge:T2->Hello#0']);
      await d.note('Hello', 'one blob, two trees', { side: 'above' });
    } else {
      await d.mark(['C2', 'T2', 'New']);
      await d.note('New', 'new bytes, new id', { side: 'below' });
    }

    // ── head: the branch moves; HEAD follows it ─────────────────────────
    await this.step('head', {
      detail: true,
      title: 'Moving main to commit two changes one reference',
      line: 'refs/heads/main now holds commit two’s id; no object is copied.',
      caption:
        'HEAD names refs/heads/main, and moving the branch rewrote the id main holds from commit one to commit two, as the note under main says. No object was copied: both rows below are as they were, and commit one stays reachable through commit two’s parent link.',
    });
    await this.play(new FadeOut(morphNote, { runTime: 0.3 }));
    repo.refs['refs/heads/main'] = c2;
    repo.refs.HEAD = { symbolic: 'refs/heads/main' };
    this.state.head = repo.resolve('HEAD');
    const HEADS = `graph LR\nHEAD([HEAD])\nMain([main])\n${objects}\nHEAD --> Main\nMain --> C2`;
    // Only the references change: each says what it holds, and both commits' rows stay below, untouched.
    await d.morph({ source: HEADS });
    await d.note('HEAD', 'ref: refs/heads/main', { side: 'above' });
    await d.note('Main', `${short(c1)} → ${short(c2)}`, { side: 'below' });
    await d.walk(
      [
        ['HEAD', 'Main'],
        ['Main', 'C2'],
        ['C2', 'T2'],
        ['T2', 'New'],
      ],
      { trail: true },
    );
    await d.note('edge:C2->C1#0', 'parent', { side: 'below' });

    // ── hashes: every id covers the ids beneath it ──────────────────────
    // Positions where the new id holds the old id's digit: the coloured digits, counted place for place.
    const inPlace = { tree: samePlace(t1, t2), commit: samePlace(c1, c2) },
      kept = inPlace.tree + inPlace.commit;
    await this.step('hashes', {
      detail: true,
      title: 'Commit two’s id depends on every object it reaches',
      line: `${kept} of 80 digits match in place, about the ${80 / 16} chance gives.`,
      caption: `Commit two’s bytes hold its tree’s id and its parent’s id, so its id depends on everything it reaches. Of the 80 digits in the new tree and commit ids, ${kept} are the same digit in the same place as in the old ids, about the ${80 / 16} that chance alone gives: SHA-1 changes everywhere. A test checks every id against git hash-object.`,
    });
    this.record('samePlace', inPlace);
    await s.clearOverlays();
    const body = await s.code(objectLines(repo, c2), { at: LEFT });
    // The two ids above the change: each old id stays, and a copy of it morphs, glyph by glyph,
    // into the new id under it. The morph pairs equal digits wherever they sit, longest runs
    // first, so a paired digit may fly in from another column; the coloured digits are the
    // ones equal place for place, which the morph does not single out.
    const idX = RIGHT[0] + 0.3,
      label = (text: string, y: number) =>
        new Text(text, { fontSize: 0.22, color: s.soft, anchor: 'start' }).moveTo([idX, y], [-1, 0]),
      /** An id in mono, with the digits it shares, place for place, with `other` in the emphasis colour. */
      hex = (id: string, other: string, y: number, color: string) => {
        const t = new Text(id, { fontSize: 0.2, font: 'mono', color, anchor: 'start' }).moveTo(
          [idX + 1.45, y],
          [-1, 0],
        );
        if (t.children.length !== id.length) throw new Error('Expected one glyph per hex digit');
        t.children.forEach((g, i) => id[i] === other[i] && g.setFill(accent));
        return t;
      };
    const idLabels = [
      label('Ids that changed, old above new', -1.35),
      label('tree one', -1.8),
      label('tree two', -2.1),
      label('commit one', -2.6),
      label('commit two', -2.9),
    ];
    const treeOld = hex(t1, t2, -1.8, s.soft),
      commitOld = hex(c1, c2, -2.6, s.soft);
    await s.enter(...idLabels, treeOld, commitOld, {
      runTime: 0.4,
      describe: `Tree one’s id ${t1} and commit one’s id ${c1}, each with a line left under it for the id that replaced it`,
    });
    const treeNew = hex(t2, t1, -2.1, ink),
      commitNew = hex(c2, c1, -2.9, ink);
    s.keep(treeNew, commitNew, {
      describe: `Tree two’s id ${t2} under tree one’s, and commit two’s id ${c2} under commit one’s; each digit equal to the old id’s in the same place is coloured`,
    });
    await this.play(
      new TransformMatchingText(treeOld.copy(), treeNew, { runTime: 1.5 }),
      new TransformMatchingText(commitOld.copy(), commitNew, { runTime: 1.5 }),
    );
    const [treeMatch, commitMatch] = lastMatches(this, 2);
    const counts = [
      label(
        `Paired with an equal digit anywhere: tree ${treeMatch!.matched}, commit ${commitMatch!.matched} of 40`,
        -3.4,
      ),
      label(`Same digit in the same place, coloured: tree ${inPlace.tree}, commit ${inPlace.commit} of 40`, -3.8),
    ];
    await s.enter(...counts, { runTime: 0.4 });
    await d.unmark();
    await d.mark(['C2', 'T2', 'C1', 'edge:C2->T2#0', 'edge:C2->C1#0']);
    await d.note('edge:C2->C1#0', 'parent', { side: 'below' });
    await body.focus([0, 1]);
    this.state = { hello, t1, c1, nextBlob, t2, c2, shared: add, head: this.state.head };
  }
}

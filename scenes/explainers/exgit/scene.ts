import type { Evidence, Box, Mobject, Vec, View } from '../../../src/index.ts';
import {
  Scene,
  Text,
  Rectangle,
  Arrow,
  Group,
  FadeIn,
  FadeOut,
  BraceLabel,
  view,
} from '../../../src/index.ts';
import { stage, settingsOf, regionBox, CodeBlock } from '../../../explain/index.ts';
import type { Diagram, NoteSide } from '../../../explain/index.ts';
import { Repo, AUTHOR, parseTree } from './model.ts';
import { keyed } from '../../../explain/drawing.ts';
import { objectLines, reachable, secondCommit } from './objects.ts';

const STYLE = 'catppuccin-mocha';
const short = (id: string) => id.slice(0, 7);
const DIAGRAM = regionBox('top', { bottom: -0.85 }),
  BOTTOM = regionBox('bottom', { top: -1.1 }),
  LEFT = regionBox('bottom', { top: -1.1, right: -0.15 }),
  RIGHT = regionBox('bottom', { top: -1.1, left: 0.15 });
/** "<type> <length>\0", the header Git hashes in front of an object's bytes. */
const objectHeader = (repo: Repo, id: string) => `${repo.objects[id]!.type} ${repo.objects[id]!.bytes.length}\\0`;
/** A tree as the steps record it: its header and its entries, read back from its stored bytes. */
interface TreeState { header: string; entries: { mode: string; name: string; id: string }[] }
const treeOf = (repo: Repo, id: string): TreeState => ({
  header: objectHeader(repo, id),
  entries: parseTree(repo.objects[id]!.bytes).map(([mode, name, child]) => ({ mode, name, id: child })),
});
/** A tree's bytes as listed on stage: its header, its entries (mode, name, a zero byte, the id in hex), then its own id. */
const treeLines = (tree: TreeState, id: string) => [`header  ${tree.header}`, ...tree.entries.map((e) => `${e.mode} ${e.name}\\0 ${e.id}`), `sha1    ${id}`];
/** One commit's row as the steps record it: the commit, its tree and parents, and each entry's blob and text. */
interface RowState { label: string; commit: string; tree: string; parents: string[]; entries: { file: string; blob: string; text: string }[] }
type Tone = 'emphasis';
/** What the steps record: the model's ids and objects, and what the pictures mark. */
interface GitState {
  hello: string;
  blob: { id: string; bytes: number[]; header: number };
  t1: string;
  c1: string;
  t2: string;
  c2: string;
  trees: Record<string, TreeState>;
  commits: Record<string, string[]>;
  focus?: Record<string, [number, number]>;
  diagram: { source: string; marks: { part: string; tone: Tone; as: string }[] };
  notes: { id: string; part: string; text: string; side: NoteSide }[];
  rows: { commits: RowState[]; shared: string | null };
  samePlace: { tree: number; commit: number };
  paired: { tree: number; commit: number };
}
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

/** The script's one-sentence answer (meta.answer), which the change step states. */
const ANSWER = 'Git writes only the objects whose bytes are new, and names unchanged content again by its id';
/** The check questions' commits, from the same model: a rename and a copy of hello.txt after commit one. */
const RENAMED = secondCommit('rename'),
  COPIED = secondCommit('copy');
/** What a commit wrote, in words: "a tree and a commit". */
const kinds = (c: ReturnType<typeof secondCommit>) => {
  const types = c.written.map((id) => c.repo.objects[id]!.type);
  return ['blob', 'tree', 'commit']
    .filter((k) => types.includes(k))
    .map((k) => `a ${k}`)
    .join(' and ');
};

export default class GitExplainer extends Scene {
  static meta = {
    id: 'exgit',
    title: 'What does Git store when a file changes?',
    sources: [
      'https://git-scm.com/book/en/v2/Git-Internals-Git-Objects',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/lib/gitmodel.ts',
    ],
    answer: ANSWER,
    checks: [
      {
        question: 'Starting again from commit one, a commit renames hello.txt to greeting.txt and changes nothing else. Which new objects does Git write, and why is no blob among them?',
        answer: `${RENAMED.written.length} objects, ${kinds(RENAMED)}. The name lives in the tree’s bytes, so the tree changes, and so does the commit that names it. The file’s bytes are unchanged, so its id is still ${short(RENAMED.hello)} and the new tree names the stored blob.`,
      },
      {
        question: 'Starting again from commit one, a commit adds copy.txt containing exactly hello and a newline. How many new blobs does Git write?',
        answer: `None. Its bytes hash to ${short(COPIED.hello)}, which is already stored, so the new tree lists both names against that one blob. The commit writes ${COPIED.written.length} objects, ${kinds(COPIED)}.`,
      },
      {
        question: 'Two people on different machines each commit a file containing hello and a newline. Do their blobs have the same id? Do their commits?',
        answer: `The blobs do: both are ${short(COPIED.hello)}, because a blob’s id depends only on its bytes. Commits match only if all their bytes match, including the tree, the parents, the author and committer lines with their timestamps, and the message, so in practice they differ.`,
      },
    ],
    claims: [
      { says: 'Git writes only the objects whose bytes are new', test: 'test/explain-exgit.test.ts: Git writes only the objects whose bytes are new' },
      { says: 'Changed bytes change every id above them', test: 'test/explain-exgit.test.ts: Git writes only the objects whose bytes are new' },
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
    const st = () => this.state as unknown as GitState;
    /**
     * A code view: the lines `lines(state)` gives, laid out as s.code lays them out, with its bar on the
     * focus the state records for `name`. The panel describes itself and says what it emphasises.
     */
    const codeView = (name: string, at: Box, lines: (g: GitState) => string[]) => {
      const draw = (state: object) => {
        const g = state as unknown as GitState,
          focus = g.focus?.[name];
        return keyed(new CodeBlock(this, s.palette, lines(g), { at, ...(focus ? { focus } : {}) }), `exgit-${name}`);
      };
      return { v: view(this, draw, { place: false }) };
    };
    const focus = async (code: { v: View }, name: string, lines: readonly [number, number]) => {
      this.state.focus = { ...(st().focus ?? {}), [name]: lines };
      await this.play(code.v.sync({ match: 'index', runTime: 0.4 }));
    };

    // ── blob: the bytes that are hashed ────────────────────────────────
    const hello = repo.blob('hello\n');
    const object = repo.objects[hello]!,
      header = new TextEncoder().encode(`${object.type} ${object.bytes.length}\0`),
      all = [...header, ...object.bytes];
    await this.step('blob', {
      title: `Git hashes ${all.length} bytes to name this blob`,
      line: add
        ? 'Predict: a second commit adds world.txt. Does Git store these bytes again?'
        : 'Predict: a second commit edits hello.txt to “hello again”. What must Git write?',
      caption: `A Git commit records a snapshot of the whole project, which sounds as if each commit copies all its files. Look at what Git stores for one file. hello.txt holds hello and a newline; Git puts a header with the type and length in front of those bytes and hashes the lot, and the 40-digit result names a blob. The file’s name is not among the hashed bytes, so any file holding exactly these bytes gets this same id, ${short(hello)}.`,
    });
    await s.clear();
    this.state.hello = hello;
    // The bytes Git hashes: the header's and the content's, and the id they hash to.
    this.state.blob = { id: hello, bytes: all, header: header.length };
    const cell = 0.98,
      gap = 0.1,
      cellY = 0.5;
    /** The blob's cells, from the bytes the state records: `part` is the header's or the content's, with its label over it. */
    const cellsOf = (part: 'header' | 'content') => (state: object) => {
      const { bytes, header: n } = (state as unknown as GitState).blob;
      const x0 = -((bytes.length - 1) * (cell + gap)) / 2;
      const cells = bytes.map((b, i) => {
        const isHead = i < n;
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
      const g = new Group(...(part === 'header' ? cells.slice(0, n) : cells.slice(n)));
      const color = part === 'header' ? accent : ink;
      const [a, , b] = g.box()!;
      const t = new Text(part, { fontSize: 0.26, color });
      t.moveTo([(a + b) / 2, cellY + 0.85]);
      const rule = new Rectangle({ width: b - a, height: 0.03, fill: color, stroke: 'none' }).moveTo([(a + b) / 2, cellY + 0.58]);
      return keyed(new Group(g, new Group(t, rule)), `exgit-${part}`);
    };
    const body = view(this, cellsOf('content'), { place: false }),
      head = view(this, cellsOf('header'), { place: false });
    const blobOf = () => st().blob;
    await s.enter(body, {
      runTime: 0.5,
      describe: () => `The content bytes ${JSON.stringify(new TextDecoder().decode(new Uint8Array(blobOf().bytes.slice(blobOf().header))))}, one cell each with its hex value`,
    });
    await s.enter(head, {
      runTime: 0.6,
      shift: [0.6, 0],
      describe: () => {
        const words = new TextDecoder().decode(new Uint8Array(blobOf().bytes.slice(0, blobOf().header - 1)));
        return `The header bytes “${words}” and a zero byte, in front of the content`;
      },
    });
    const arrow = new Arrow([0, cellY - 1.1], [0, cellY - 2.05], { stroke: s.soft, strokeWidth: 0.03, tipLength: 0.2 });
    const how = new Text('SHA-1', { fontSize: 0.24, color: s.soft, anchor: 'start' }).moveTo([0.3, cellY - 1.57], [-1, 0]);
    /** The blob's id, its first seven digits highlighted, from the state. */
    const idRowOf = (state: object) => {
      const id = (state as unknown as GitState).blob.id;
      const idHead = new Text(short(id), { fontSize: 0.42, font: 'mono', color: accent, weight: 'bold' }),
        idTail = new Text(id.slice(7), { fontSize: 0.42, font: 'mono', color: ink });
      const idRow = new Group(idHead, idTail);
      idTail.nextTo(idHead, [1, 0], 0.02);
      idRow.moveTo([0, cellY - 2.65]);
      return { idRow, idHead };
    };
    const idView = view(this, (state) => keyed(idRowOf(state).idRow, 'exgit-blob-id'), { place: false });
    await s.enter(arrow, how, { runTime: 0.4, describe: 'An arrow labelled SHA-1 from the bytes to their id' });
    await s.enter(idView, { runTime: 0.6, describe: () => `The blob id ${blobOf().id}, its first seven digits highlighted` });
    // The short name every later picture uses is this prefix of the real id.
    const abbrev = view(
      this,
      (state) => {
        const { idHead } = idRowOf(state);
        const id = (state as unknown as GitState).blob.id;
        return keyed(new BraceLabel(idHead, `${short(id)} names it from here on`, [0, -1], { fontSize: 0.26, color: s.soft, buff: 0.06, labelBuff: 0.12 }), 'exgit-abbrev');
      },
      { place: false },
    );
    await s.enter(abbrev, {
      runTime: 0.4,
      describe: () => `A brace under the first seven digits, ${short(blobOf().id)}: the name later pictures give the blob`,
    });

    // The diagram of the objects, from the source the state records, built from the model's ids. It is laid out
    // from its pinned snapshot by the live diagram, which builds and morphs it; between morphs a view draws it
    // with the marks the state records, and the live diagram, off the stage, keeps its geometry and description.
    let d: Diagram;
    const colorOf: Record<Tone, string> = { emphasis: accent };
    const picture = (state: object) => {
      const g = (state as unknown as GitState).diagram;
      if (d.spec.source !== g.source) throw new Error('The diagram on show is not the one the state records');
      return d.picture(Object.fromEntries(g.marks.map((m) => [m.part, { color: colorOf[m.tone], as: m.as }])));
    };
    let diagramView: View | undefined;
    s.emphasise(() => (st().diagram?.marks ?? []).map((m) => [m.part, `mark ${colorOf[m.tone]} ${m.as}`] as [string, string]));
    /** The view takes the live diagram's place: the same picture, now drawn from the state, and described as the diagram with its marks and notes. */
    const adopt = () => {
      this.state.diagram = { source: d.spec.source!, marks: [] };
      if (diagramView) diagramView.rebuild();
      else diagramView = view(this, picture, { place: false });
      this.add(diagramView);
      this.remove(d.root);
      d.showBy(diagramView);
      s.keep(diagramView);
    };
    const mark = async (marks: GitState['diagram']['marks'], runTime = 0.45) => {
      this.state.diagram = { ...st().diagram, marks };
      await this.play(diagramView!.sync({ match: 'index', runTime }));
    };
    // Notes beside the diagram's parts, each its own view of the state, as Diagram.note draws and places one;
    // each describes itself and says what it emphasises.
    const notes = new Map<string, View>();
    const notePicture = (id: string) => (state: object) => {
      const n = (state as unknown as GitState).notes.find((x) => x.id === id)!;
      return d.notePicture(n.part, n.text, { side: n.side, color: accent, key: `exgit-note:${id}` });
    };
    const note = async (id: string, part: string, text: string, side: NoteSide) => {
      this.state.notes = [...(st().notes ?? []), { id, part, text, side }];
      const v = view(this, notePicture(id), { place: false });
      notes.set(id, v);
      await s.enter(v, { runTime: 0.35, shift: [0, -0.06] });
    };
    /** The marks go and the notes fade, then the live diagram, back in the view's place, morphs to `next`. */
    const morph = async (next: string) => {
      const going = [...notes.values()];
      if (going.length || st().diagram.marks.length) {
        this.state.diagram = { ...st().diagram, marks: [] };
        this.state.notes = [];
        notes.clear();
        await this.play(diagramView!.sync({ match: 'index', runTime: 0.4 }), ...going.map((v) => new FadeOut(v, { runTime: 0.4 })));
      }
      this.add(d.root);
      this.remove(diagramView!);
      await d.morph({ source: next });
      adopt();
    };
    const walk = async (hops: [string, string][], trail: GitState['diagram']['marks']) => {
      await d.walk(hops);
      await mark(trail);
    };
    const travelled = (hops: [string, string][]) => hops.map(([a, b]) => ({ part: d.link(a, b).id, tone: 'emphasis' as const, as: 'travelled' }));

    // ── tree: names live in the tree ────────────────────────────────────
    await this.step('tree', {
      title: 'A tree gives those bytes a name',
      line: 'The name hello.txt is in the tree entry, not in the blob.',
      caption: 'A tree associates the name hello.txt and its mode with the blob’s id. The same content object can therefore be named by different trees without copying it. Hashing the tree’s own bytes gives that collection of names and references an id too.',
    });
    // The bytes go; their id is carried into the tree entry that names it, where the tree's bytes take it up.
    await this.play(...[head, body, arrow, how, abbrev].map((m) => new FadeOut(m, { runTime: 0.4 })));
    const t1 = repo.tree([['100644', 'hello.txt', hello]]);
    this.state.t1 = t1;
    this.state.trees = { [t1]: treeOf(repo, t1) };
    const treeCode = codeView('tree', BOTTOM, (g) => treeLines(g.trees[g.t1]!, g.t1));
    await s.carry(idView, (treeCode.v.current as CodeBlock).code.token(1, hello).box()!);
    s.keep(treeCode.v);
    await this.play(new FadeIn(treeCode.v, { runTime: 0.4 }), new FadeOut(idView, { runTime: 0.4 }));
    const B1 = `Hello["blob<br/>${short(hello)}"]`;
    const T1 = `T1["tree ${short(t1)}<br/>hello.txt"]`;
    const TREE = `graph LR\n${T1}\n${B1}\nT1 --> Hello`;
    d = await s.show({ source: TREE }, { box: DIAGRAM });
    adopt();
    await focus(treeCode, 'tree', [1, 1]);

    // ── commit: a commit names a tree; a branch names a commit ─────────
    await this.step('commit', {
      title: 'A commit names a tree; a branch names a commit',
      line: 'main → commit → tree → blob: each holds the next one’s id.',
      caption: 'The branch main holds a commit’s id, and that commit names a tree. Following the references reaches the snapshot’s file names and contents. The commit describes the whole snapshot by naming objects that other commits can name too, without holding any file’s bytes itself.',
    });
    const c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' });
    repo.refs['refs/heads/main'] = c1;
    const C1 = `C1["commit<br/>${short(c1)}"]`;
    const COMMIT = `graph LR\nMain([main])\n${C1}\n${T1}\n${B1}\nMain --> C1\nC1 --> T1\nT1 --> Hello`;
    Object.assign(this.state, { c1, head: repo.resolve('refs/heads/main'), commits: { [c1]: objectLines(repo, c1) } });
    const commitCode = codeView('commit', BOTTOM, (g) => g.commits[g.c1]!);
    s.keep(commitCode.v);
    await this.play(new FadeOut(treeCode.v), new FadeIn(commitCode.v));
    await morph(COMMIT);
    const toBlob: [string, string][] = [
      ['Main', 'C1'],
      ['C1', 'T1'],
      ['T1', 'Hello'],
    ];
    await walk(toBlob, travelled(toBlob));
    await focus(commitCode, 'commit', [0, 0]);

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
      title: add
        ? `Answer: no. Tree two names blob ${short(hello)} again`
        : `Answer: ${written} new objects, a blob, a tree and a commit`,
      line: add
        ? `${written} new objects: world’s blob, tree two and commit two.`
        : 'Changed bytes change every id above them.',
      caption: add ? `${ANSWER}. The new tree adds world.txt while naming hello’s original blob again. It needs a new tree, world’s blob and a new commit, but the two snapshots share hello’s unchanged content.` : `${ANSWER}. Editing hello changes its blob’s bytes and id. That id changes the tree’s bytes, and the changed tree id changes the commit. The old objects remain intact; the new commit’s parent reference leads back to the earlier history.`,
    });
    const B2 = `New["blob<br/>${short(nextBlob)}"]`,
      T2 = `T2["tree ${short(t2)}<br/>${add ? 'hello.txt, world.txt' : 'hello.txt'}"]`,
      C2 = `C2["commit<br/>${short(c2)}"]`;
    const objects =
      `${C2}\n${C1}\n${T2}\n${T1}\n${B2}\n${B1}\n` +
      `C1 --> T1\nT1 --> Hello\nC2 --> C1\nC2 --> T2\n` +
      (add ? `T2 --> Hello\nT2 --> New` : `T2 --> New`);
    const CHANGE = `graph LR\nMain([main])\n${objects}\nMain --> C1`;
    Object.assign(this.state, { nextBlob, t2, c2 });
    this.state.focus = {};
    await this.play(new FadeOut(commitCode.v, { runTime: 0.3 }));
    await morph(CHANGE);
    await note('parent', 'edge:C2->C1#0', 'parent', 'below');
    // Below the graph, each commit's row as native boxes with the model's ids:
    // the commit, then its tree holding each entry's blob, as the state records them from the stored bytes.
    /** An object as a box: its kind and short id, then lines of what it holds. */
    const objectBox = (kind: string, id: string, lines: readonly string[], width: number, height: number, stroke: string) => {
      const rect = new Rectangle({ width, height, cornerRadius: 0.08, fill: ink, fillOpacity: 0.06, stroke, strokeWidth: 0.024 });
      const top = (0.3 + lines.length * 0.28) / 2;
      const headText = new Text(`${kind} ${short(id)}`, { fontSize: 0.21, font: 'mono', color: ink, weight: 'bold' });
      headText.moveTo([0, top - 0.12]);
      const rows = lines.map((l, i) => new Text(l, { fontSize: 0.19, font: 'mono', color: s.soft }).moveTo([0, top - 0.42 - i * 0.28]));
      return new Group(rect, headText, ...rows);
    };
    const ROW_H = 1.2,
      ENTRY_W = 3.62,
      TREE_LEFT = -1.75;
    const ROW_Y = [-1.7, -3.1];
    /** One commit's row, from the state's record of it. `lit` outlines a blob in the emphasis colour; `skip` leaves it out, to arrive by copy. */
    const commitRow = (row: RowState, y: number, { lit, skip }: { lit?: string | null; skip?: string | null } = {}) => {
      const keyOf = (file: string) => `exgit-${row.label.replace(' ', '-')}:${file}`;
      const name = new Text(row.label, { fontSize: 0.22, color: s.soft, anchor: 'end' }).moveTo([TREE_LEFT - 2.9, y], [1, 0]);
      const commitBox = objectBox('commit', row.commit, [`tree ${short(row.tree)}`, ...row.parents.map((p) => `parent ${short(p)}`)], 2.5, ROW_H, s.soft).moveTo([TREE_LEFT - 1.45, y]);
      const width = row.entries.length * ENTRY_W + 0.15;
      const treeBox = new Rectangle({ width, height: ROW_H, cornerRadius: 0.08, fill: ink, fillOpacity: 0.03, stroke: s.soft, strokeWidth: 0.024 }).moveTo([TREE_LEFT + width / 2, y]);
      const treeHead = new Text(`tree ${short(row.tree)}`, { fontSize: 0.21, font: 'mono', color: ink, weight: 'bold', anchor: 'start' }).moveTo([TREE_LEFT + 0.2, y + ROW_H / 2 - 0.25], [-1, 0]);
      const parts: Mobject[] = [name, commitBox, treeBox, treeHead];
      const blobs = new Map<string, Group>();
      row.entries.forEach(({ file, blob, text }, k) => {
        const x = TREE_LEFT + 0.2 + k * ENTRY_W,
          by = y - 0.17;
        parts.push(new Text(file, { fontSize: 0.19, font: 'mono', color: s.soft, anchor: 'start' }).moveTo([x, by], [-1, 0]));
        const box = objectBox('blob', blob, [JSON.stringify(text)], 2.15, 0.66, file === lit ? accent : s.soft);
        blobs.set(file, keyed(box.moveTo([x + 1.27 + 2.15 / 2, by]), keyOf(file)));
        if (file !== skip) parts.push(box);
      });
      return { row: new Group(...parts), blobs };
    };
    /** A commit's row in words, from the same record the boxes show. */
    const rowWords = (row: RowState) =>
      `${row.label}: commit ${short(row.commit)} names tree ${short(row.tree)}, which lists ${row.entries.map((e) => `${e.file} as blob ${short(e.blob)}`).join(' and ')}`;
    const rowOf = (label: string, commit: string): RowState => {
      const text = objectLines(repo, commit),
        tree = text.find((l) => l.startsWith('tree '))!.slice(5);
      return {
        label,
        commit,
        tree,
        parents: text.filter((l) => l.startsWith('parent ')).map((l) => l.slice(7)),
        entries: parseTree(repo.objects[tree]!.bytes).map(([, file, blob]) => ({ file, blob, text: repo.text(blob) })),
      };
    };
    const shared = add ? 'hello.txt' : null;
    // The rows the state records: commit one's alone, then both, with the blob they share outlined in each.
    this.state.rows = { commits: [rowOf('commit one', c1)], shared: null };
    const rows = view(
      this,
      (state) => {
        const r = (state as unknown as GitState).rows;
        return keyed(new Group(...r.commits.map((row, i) => commitRow(row, ROW_Y[i]!, { lit: r.shared, skip: i ? r.shared : null }).row)), 'exgit-rows');
      },
      { place: false },
    );
    const rowsInWords = () => {
      const r = st().rows;
      return r.commits.length === 1
        ? `The row of ${rowWords(r.commits[0]!)}`
        : `Two rows, ${rowWords(r.commits[0]!)}; under it, ${rowWords(r.commits[1]!)}` +
            (r.shared ? `. The ${r.shared} blob ${short(r.commits[0]!.entries.find((e) => e.file === r.shared)!.blob)} is outlined in both trees: one object, named twice` : '');
    };
    await s.enter(rows, { runTime: 0.5, describe: rowsInWords });
    // Redrawn with commit two's row under it, morphed by shape: what is the same stays, the rest grows in.
    this.state.rows = { commits: [rowOf('commit one', c1), rowOf('commit two', c2)], shared };
    await this.play(rows.sync({ match: 'shapes', runTime: 1.2 }));
    const [grown] = lastMatches(this, 1);
    if (grown!.removed !== 0 || grown!.morphed !== 0) throw new Error('The morph did not keep commit one’s row whole');
    // The diagram's marks come first, so commit one's redrawn row has settled before anything copies from it.
    if (add) {
      await mark(['Hello', 'edge:T1->Hello#0', 'edge:T2->Hello#0'].map((part) => ({ part, tone: 'emphasis', as: 'marked' })));
      await note('shared', 'Hello', 'one blob, two trees', 'above');
    } else {
      await mark(['C2', 'T2', 'New'].map((part) => ({ part, tone: 'emphasis', as: 'marked' })));
      await note('new', 'New', 'new bytes, new id', 'below');
    }
    let same: View | null = null;
    if (shared) {
      // Tree two names the very object tree one names: the same box moves across, id and all.
      // Drawn first over commit one's box, then in tree two's row: a copy of the box, moved across.
      this.shown.copied = false;
      same = view(
        this,
        (state, shown) => {
          const r = (state as unknown as GitState).rows;
          const row = shown.copied ? 1 : 0;
          return keyed(commitRow(r.commits[row]!, ROW_Y[row]!, { lit: r.shared, skip: r.shared }).blobs.get(r.shared!)!, 'exgit-shared-blob');
        },
        { place: false },
      );
      s.keep(same, { describe: rowsInWords });
      this.add(same);
      this.shown.copied = true;
      await this.play(same.sync({ match: 'index', runTime: 0.9 }));
    }

    // ── head: the branch moves; HEAD follows it ─────────────────────────
    await this.step('head', {
      title: 'Moving main to commit two changes one reference',
      line: 'refs/heads/main now holds commit two’s id; no object is copied.',
      caption: 'main now names commit two. Moving this reference does not copy the objects it reaches, and the parent link keeps commit one reachable. The content objects remain immutable while the branch name moves. This is the logical object model; compression of those objects on disk is a separate question.',
    });
    repo.refs['refs/heads/main'] = c2;
    repo.refs.HEAD = { symbolic: 'refs/heads/main' };
    this.state.head = repo.resolve('HEAD');
    const HEADS = `graph LR\nHEAD([HEAD])\nMain([main])\n${objects}\nHEAD --> Main\nMain --> C2`;
    // Only the references change: each says what it holds, and both commits' rows stay below, untouched.
    await morph(HEADS);
    await note('head', 'HEAD', 'ref: refs/heads/main', 'above');
    await note('main', 'Main', `${short(c1)} → ${short(c2)}`, 'below');
    const toNew: [string, string][] = [
      ['HEAD', 'Main'],
      ['Main', 'C2'],
      ['C2', 'T2'],
      ['T2', 'New'],
    ];
    await walk(toNew, travelled(toNew));
    await note('parent', 'edge:C2->C1#0', 'parent', 'below');

    // ── hashes: every id covers the ids beneath it ──────────────────────
    // Positions where the new id holds the old id's digit: the coloured digits, counted place for place.
    const inPlace = { tree: samePlace(t1, t2), commit: samePlace(c1, c2) },
      kept = inPlace.tree + inPlace.commit;
    await this.step('hashes', {
      kind: 'detail',
      title: 'Commit two’s bytes hold its tree’s and parent’s ids',
      line: `${kept} of 80 digits match in place, about the ${80 / 16} chance gives.`,
      caption: `The tree and parent ids are part of the commit’s bytes, and a tree’s bytes hold its blobs’ ids in turn, so a change to any file below changes the commit’s id even when most of its text stays the same. The new ids share digits with the old ones about as often as random digits would, so the matches say nothing about how similar the files are.`,
    });
    this.record('samePlace', inPlace);
    this.state.samePlace = inPlace;
    // Everything but the diagram goes: the rows, the shared blob and the notes.
    const leaving = [rows, ...(same ? [same] : []), ...notes.values()];
    this.state.notes = [];
    notes.clear();
    await this.play(...leaving.map((m) => new FadeOut(m, { runTime: 0.3 })));
    this.state.commits = { ...st().commits, [c2]: objectLines(repo, c2) };
    const bodyCode = codeView('body', LEFT, (g) => g.commits[g.c2]!);
    s.keep(bodyCode.v);
    await this.play(new FadeIn(bodyCode.v, { runTime: 0.4 }));
    // The two ids above the change: each old id stays, and a copy of it morphs, glyph by glyph,
    // into the new id under it. The morph pairs equal digits wherever they sit, longest runs
    // first, so a paired digit may fly in from another column; the coloured digits are the
    // ones equal place for place, which the morph does not single out.
    const idX = RIGHT[0] + 0.3,
      label = (text: string, y: number) => new Text(text, { fontSize: 0.22, color: s.soft, anchor: 'start' }).moveTo([idX, y], [-1, 0]),
      /** An id in mono, with the digits it shares, place for place, with `other` in the emphasis colour. */
      hex = (id: string, other: string, y: number, color: string) => {
        const t = new Text(id, { fontSize: 0.2, font: 'mono', color, anchor: 'start' }).moveTo([idX + 1.45, y], [-1, 0]);
        if (t.children.length !== id.length) throw new Error('Expected one glyph per hex digit');
        t.children.forEach((g, i) => id[i] === other[i] && g.setFill(accent));
        return t;
      };
    const idLabels = [label('Ids that changed, old above new', -1.35), label('tree one', -1.8), label('tree two', -2.1), label('commit one', -2.6), label('commit two', -2.9)];
    /** One id of the state, old or new, coloured where it agrees with the other place for place. */
    const idView2 = (kind: 'tree' | 'commit', age: 'old' | 'new') =>
      view(
        this,
        (state, shown) => {
          const g = state as unknown as GitState;
          const [old, now] = kind === 'tree' ? [g.t1, g.t2] : [g.c1, g.c2];
          const y = { tree: { old: -1.8, new: -2.1 }, commit: { old: -2.6, new: -2.9 } }[kind][age];
          // The new id is first a copy of the old one, in its place, until the morph has changed it.
          if (age === 'new' && !shown.idsChanged) return keyed(hex(old, now, y + 0.3, s.soft), `exgit-id:${kind}:${age}`);
          return keyed(age === 'old' ? hex(old, now, y, s.soft) : hex(now, old, y, ink), `exgit-id:${kind}:${age}`);
        },
        { place: false },
      );
    this.shown.idsChanged = false;
    const ids = { treeOld: idView2('tree', 'old'), commitOld: idView2('commit', 'old'), treeNew: idView2('tree', 'new'), commitNew: idView2('commit', 'new') };
    await s.enter(...idLabels, ids.treeOld, ids.commitOld, {
      runTime: 0.4,
      describe: () => `Tree one’s id ${st().t1} and commit one’s id ${st().c1}, each with a line left under it for the id that replaced it`,
    });
    s.keep(ids.treeNew, ids.commitNew, {
      describe: () => `Tree two’s id ${st().t2} under tree one’s, and commit two’s id ${st().c2} under commit one’s; each digit equal to the old id’s in the same place is coloured`,
    });
    this.add(ids.treeNew, ids.commitNew);
    this.shown.idsChanged = true;
    await this.play(ids.treeNew.sync({ match: 'text', runTime: 1.5 }), ids.commitNew.sync({ match: 'text', runTime: 1.5 }));
    const [treeMatch, commitMatch] = lastMatches(this, 2);
    // What the two morphs paired, recorded with what the coloured digits show.
    this.state.paired = { tree: treeMatch!.matched as number, commit: commitMatch!.matched as number };
    const counts = view(
      this,
      (state) => {
        const g = state as unknown as GitState;
        return new Group(
          label(`Paired with an equal digit anywhere: tree ${g.paired.tree}, commit ${g.paired.commit} of 40`, -3.4),
          label(`Same digit in the same place, coloured: tree ${g.samePlace.tree}, commit ${g.samePlace.commit} of 40`, -3.8),
        );
      },
      { place: false },
    );
    await s.enter(counts, { runTime: 0.4 });
    await mark([]);
    await mark(['C2', 'T2', 'C1', 'edge:C2->T2#0', 'edge:C2->C1#0'].map((part) => ({ part, tone: 'emphasis', as: 'marked' })));
    await note('parent', 'edge:C2->C1#0', 'parent', 'below');
    await focus(bodyCode, 'body', [0, 1]);
    Object.assign(this.state, { shared: add });
  }
}

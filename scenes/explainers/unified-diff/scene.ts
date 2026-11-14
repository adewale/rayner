import { Scene, Group, Line, Brace, Create, FadeIn, FadeOut, Restore, Succession, SurroundingRectangle, Text, Transform, TransformDiff, parseUnifiedDiff, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf, answerOf, having } from '../../../explain/index.ts';
import type { Stage, ExplainerMeta, Setting } from '../../../explain/index.ts';
import { emphasised } from '../../../explain/drawing.ts';
import { AFTER, BEFORE, COPIES, LOOKALIKE, NAME, PATCH, apply, header, newSide, oldSide, placed, report, sectionAt } from './model.ts';
import type { CopyId, Hunk, PatchState } from './model.ts';
import { CHAR, PITCH, SIZE, codeAt, fileAt, linesBox, numberAt, rowY, stack, wordsAt } from './picture.ts';
import { listed } from '../lib/format.ts';

/** The first row of every block, and where the blocks stand. */
const TOP = 1.95, LABEL_Y = 2.72;
const PATCH_AT: Vec = [-7.2, TOP], FILE_AT: Vec = [0.9, TOP], COPY_AT: Vec = [-3.5, TOP], CARD_X = 1.6;
/** The widest line of the page's files and of its patch, in characters. */
const WIDE_FILE = 12, WIDE_PATCH = 15;

/** Words broken into lines of at most `width` characters. */
const wrap = (text: string, width: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => (lines.length && (lines.at(-1)! + ' ' + word).length <= width ? [...lines.slice(0, -1), `${lines.at(-1)} ${word}`] : [...lines, word]), []);

export default class UnifiedDiff extends Scene<PatchState, {}> {
  static meta = {
    sources: [
      'https://git-scm.com/docs/git-apply/2.43.0',
      'https://github.com/git/git/blob/v2.43.0/apply.c',
      'https://www.gnu.org/software/diffutils/manual/html_node/Detailed-Unified.html',
    ],
    claims: [
      { says: 'its line numbers only say where to look first', test: 'model.test.ts: a hunk goes where its context and removed lines match the file, and the nearest such place to its line wins' },
      { says: 'The line numbers were only a first guess', test: 'model.test.ts: a hunk goes where its context and removed lines match the file, and the nearest such place to its line wins' },
      { says: 'every place three lines could go', test: 'model.test.ts: a hunk goes where its context and removed lines match the file, and the nearest such place to its line wins' },
      { says: 'every line below them has moved down by two', shown: true as const },
      { says: 'Git says so only if asked', test: 'model.test.ts: the page’s files' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    { id: 'copy', label: 'Since the patch was made, your copy', default: 'moved', options: [{ value: 'moved', label: 'gained two lines at the top' }, { value: 'edited', label: 'had its port changed' }] },
  ] satisfies readonly Setting[];

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const which = settingsOf(this).copy as CopyId, copy = [...COPIES[which]];
    const [hunk] = parseUnifiedDiff(PATCH) as [Hunk], head = header(hunk), old = oldSide(hunk);
    const made = apply(BEFORE, [hunk]), yours = apply(copy, [hunk]);
    if (!made.ok) throw new Error('the patch applies to the file it was made from');
    const ink = s.look.ink, soft = s.look.soft, accent = s.look.emphasis;
    const fade = (...mobs: Mobject[]) => mobs.map((m) => new FadeOut(m, { runTime: 0.3 }));

    // 1. The patch, and the file it was made from.
    await this.step('patch', {
      title: 'A patch names lines to remove, lines to add, and lines to find',
      line: 'Minus: remove. Plus: add. No mark: context, left alone.',
      caption: `This patch changes one setting in ${NAME} and adds another. Lines marked with a minus are removed and lines marked with a plus are added. The two unmarked lines are context: they are not changed, they are there so the change can be found. A block like this, context and all, is a hunk, and the line that starts @@ is its header.`,
    });
    this.state = { file: [...BEFORE], header: head };
    const patch = keyed(codeAt(s, PATCH.trimEnd().split('\n'), PATCH_AT), 'patch');
    const file = fileAt(s, BEFORE, FILE_AT, 'file');
    const titles = [wordsAt(s, 'The patch', [PATCH_AT[0], LABEL_Y], { soft: true }), wordsAt(s, `${NAME}, as its author had it`, [FILE_AT[0], LABEL_Y], { soft: true })];
    await s.enter(patch, ...titles, { describe: `The patch: ${PATCH.trimEnd().split('\n').join(' / ')}` });
    await s.enter(file.code, ...file.numbers, { describe: () => `${NAME}, numbered from 1: ${(this.state.result ?? this.state.file).join(' / ')}` });

    // 2. The header's numbers: a brace on the file's lines the old side names, joined to the header at its tip.
    await this.step('header', {
      title: `-${hunk.oldStart},${hunk.oldLines} says: ${hunk.oldLines} lines, starting at line ${hunk.oldStart}`,
      line: 'The old side of a hunk is its context lines and its minus lines.',
      caption: `The header counts the hunk’s two sides. The old side is what the hunk expects to find: its context and minus lines, ${hunk.oldLines} lines starting at line ${hunk.oldStart} of the file. The brace marks them. The new side, +${hunk.newStart},${hunk.newLines}, is what the hunk leaves: context and plus lines, ${hunk.newLines} lines starting at line ${hunk.newStart}. These are line numbers in the author’s file, on the day the patch was made.`,
    });
    const outline = emphasised(keyed(new SurroundingRectangle(linesBox(PATCH_AT, 3, 3, WIDE_PATCH), { buff: 0.04, cornerRadius: 0.08, stroke: accent, strokeWidth: 0.05 }), 'header:outline'), 'outlined: the hunk’s header');
    const braceOn = (from: number, to: number) => new Brace(linesBox(FILE_AT, from, to, WIDE_FILE, { gutter: true }), [-1, 0], { stroke: ink, strokeWidth: 0.04 });
    const brace = keyed(braceOn(hunk.oldStart, hunk.oldStart + hunk.oldLines - 1), 'brace');
    // The connector runs from the outlined header to the brace's tip: these numbers, these lines.
    const from: Vec = [outline.box()![2], rowY(TOP, 2)];
    const link = keyed(new Line(from, brace.tip(), { stroke: accent, strokeWidth: 0.05 }), 'link');
    s.keep(outline, brace, link, { describe: () => `The header ${head} is outlined and joined to a brace on the file’s lines ${this.state.applied ? `${hunk.newStart} to ${hunk.newStart + hunk.newLines - 1}, its new side` : `${hunk.oldStart} to ${hunk.oldStart + hunk.oldLines - 1}, its old side`}` });
    await this.play(new Create(outline, { runTime: 0.5 }));
    await this.play(new Create(link, { runTime: 0.4 }), new Create(brace, { runTime: 0.6 }));

    // 3. Applied to the author's own file: the patch's own hunk moves the lines.
    await this.step('apply', {
      title: 'In the author’s file the hunk is where its header says',
      line: `Lines ${hunk.oldStart} to ${hunk.oldStart + hunk.oldLines - 1} become lines ${hunk.newStart} to ${hunk.newStart + hunk.newLines - 1}: +${hunk.newStart},${hunk.newLines}.`,
      caption: `Git finds the ${hunk.oldLines} old-side lines at line ${made.placements[0]!.at}, takes out the minus line and puts the plus lines in its place. This is the file the patch was made from, so everything is where the header says. But ${answerOf(this).replace(/^A/, 'a')}. The next steps change the file under the patch to show it.`,
    });
    this.state = { file: [...BEFORE], header: head, tried: made.placements[0]!.tried, at: made.placements[0]!.at, offset: 0, applied: true, report: report(made, NAME), result: made.file };
    const after = keyed(codeAt(s, AFTER, FILE_AT), 'file');
    const brace2 = braceOn(hunk.newStart, hunk.newStart + hunk.newLines - 1), added = numberAt(s, AFTER.length, FILE_AT, 'file');
    await this.play(new TransformDiff(file.code, after, { hunks: [hunk], runTime: 1.4 }));
    s.keep(after, added);
    await this.play(new Transform(brace, brace2, { runTime: 0.6 }), new Transform(link, new Line(from, brace2.tip(), { stroke: accent, strokeWidth: 0.05 }), { runTime: 0.6 }), new FadeIn(added, { runTime: 0.4 }));

    // 4. The reader's copy, with the three lines the hunk expects laid beside the lines its header names.
    const moved = which === 'moved';
    await this.step('yours', {
      title: moved ? 'Your copy has two new lines at the top' : 'In your copy the port has changed',
      line: 'Predict: will the patch still apply, and where?',
      caption: moved
        ? `The patch reaches you later, and your copy of ${NAME} has gained two lines at the top, so every line below them has moved down by two. The hunk still says line ${hunk.oldStart}. Beside the file are the three lines it expects there, and the file’s lines ${hunk.oldStart} to ${hunk.oldStart + 2} are not those. Will Git apply the patch at line ${hunk.oldStart}, apply it at another line, or refuse it?`
        : `The patch reaches you later, and in your copy someone has changed the port from 8080 to 8081. Nothing has moved: workers = 2, the line the patch removes, is still line 3. Beside the file are the three lines the hunk expects, starting at line ${hunk.oldStart}. Will Git apply the patch at line ${hunk.oldStart}, apply it at another line, or refuse it?`,
      // The reader commits before the search; the answer is the model's, which model.test.ts holds to Git.
      predict: { options: [`At line ${hunk.oldStart}`, 'At another line', 'Not at all'], answer: !yours.ok ? 'Not at all' : yours.placements[0]!.offset ? 'At another line' : `At line ${hunk.oldStart}` },
    });
    await s.clear({ runTime: 0.2 });
    this.state = { file: copy, header: head };
    const mine = fileAt(s, copy, COPY_AT, 'copy');
    const changed = moved ? [1, 2] as const : [2, 2] as const;
    const note = keyed(new Brace(linesBox(COPY_AT, changed[0], changed[1], WIDE_FILE, { gutter: true }), [-1, 0], { stroke: soft, strokeWidth: 0.04 }), 'changed');
    const noted = new Text(moved ? 'added' : 'changed', { fontSize: SIZE, color: soft, shaping: this.textShaping });
    note.putAtTip(noted, 0.12);
    // The hunk's old side, level with the lines the header names.
    const cardAt = (line: number): Vec => [CARD_X, rowY(TOP, line - 1)];
    const card = keyed(codeAt(s, old, cardAt(hunk.oldStart), accent), 'card');
    // The card and, from the next step, the frame around it and the file's lines move as one.
    const probe = keyed(new Group(card), 'probe');
    const expects = wordsAt(s, 'The hunk expects:', [CARD_X, rowY(TOP, hunk.oldStart - 2)], { soft: true });
    await s.enter(mine.code, ...mine.numbers, note, noted, { describe: () => `Your copy of ${NAME}, numbered from 1: ${(this.state.result ?? this.state.file).join(' / ')}. ${moved ? 'Lines 1 and 2 are marked added' : 'Line 2 is marked changed'}` });
    await s.enter(probe, expects, { describe: () => `Beside the file, the three lines the hunk expects: ${old.join(' / ')}${this.state.tried ? `, framed with the file’s lines from line ${this.state.at ?? hunk.oldStart}` : `, level with line ${hunk.oldStart}`}` });

    // 5. The search: a frame over three lines of the file and the hunk beside them, tried place by place.
    const tried = yours.ok ? yours.placements[0]!.tried : yours.tried;
    await this.step('search', {
      title: yours.ok ? `Git tries lines ${listed(tried)} and finds the hunk at line ${yours.placements[0]!.at}` : `Git tries lines ${listed(tried)}: the hunk fits nowhere`,
      line: 'From the line the header names: one down, one up, two down.',
      caption: yours.ok
        ? `Git compares the hunk’s three old lines with the file at the line the header names, then one line down, one up, two down, working outward. At line ${yours.placements[0]!.at} all three match, so that is where the hunk goes: an offset of ${yours.placements[0]!.offset} from where it was sent. The line numbers were only a first guess. What placed the hunk was its context.`
        : `Git compares the hunk’s three old lines with the file at the line the header names, then one line down, one up, two down: every place three lines could go. Nowhere do all three match, because the context line port = 8080 is gone. The frame returns to line ${yours.line}, the line Git will name. One changed context line refuses the hunk, though the line to remove is right there.`,
    });
    this.state = { file: copy, header: head, tried, at: yours.ok ? yours.placements[0]!.at : null, ...(yours.ok ? { offset: yours.placements[0]!.offset } : {}) };
    const frameBox = linesBox(COPY_AT, hunk.oldStart, hunk.oldStart + old.length - 1, WIDE_FILE, { gutter: true });
    const frame = keyed(new SurroundingRectangle([frameBox[0], frameBox[1], CARD_X + WIDE_FILE * CHAR + 0.1, frameBox[3]], { buff: 0.03, cornerRadius: 0.1, stroke: accent, strokeWidth: 0.06 }), 'frame');
    probe.add(frame);
    await this.play(new Create(frame, { runTime: 0.5 }), new FadeOut(expects, { runTime: 0.3 }));
    // Where the search started: on a refusal the frame comes back to exactly this.
    probe.saveState();
    const moves = tried.slice(1).map((line, i) => probe.animate.shift([0, -(line - tried[i]!) * PITCH]));
    await this.play(new Succession(moves), { runTime: 0.75 * moves.length });
    if (!yours.ok) await this.play(new Restore(probe, { runTime: 0.8 }));

    // 6. What Git does and says.
    const said = yours.ok ? report(yours, NAME) : report(yours, NAME, old).slice(-2);
    await this.step('result', {
      title: yours.ok ? `Applied at line ${yours.placements[0]!.at}, and Git says so only if asked` : 'Refused, and the file is left untouched',
      line: yours.ok ? `git apply -v: “${said[0]}”` : `git apply: “${said[0]}”`,
      caption: yours.ok
        ? `Git takes out the minus line and puts in the plus lines at line ${yours.placements[0]!.at}, as in the author’s file but two lines lower. Asked to be verbose, it reports the offset. Without -v it says nothing: a patch that applied at an offset looks like any other patch that applied.`
        : `Git reports the hunk’s own line, ${yours.line}, and stops. It writes nothing: had the patch held other hunks that fit, they would not be applied either. The outlined lines are the mismatch, port = 8081 in the file against port = 8080 in the hunk. To make this change, the patch has to be made again from the file as it is now, or the difference settled by hand.`,
    });
    this.state = { file: copy, header: head, tried, at: yours.ok ? yours.placements[0]!.at : null, ...(yours.ok ? { offset: yours.placements[0]!.offset, result: yours.file } : {}), applied: yours.ok, report: said };
    if (yours.ok) {
      const place = yours.placements[0]!, next = keyed(codeAt(s, yours.file, COPY_AT), 'copy'), extra = numberAt(s, yours.file.length, COPY_AT, 'copy');
      const says = stack(s, ['git apply -v says:', ...said.flatMap((l) => wrap(l, 22))], [1.3, rowY(TOP, 1)], { soft: false });
      await this.play(...fade(probe));
      // The hunk as it was placed: its header's lines moved by the offset, so it describes this file.
      await this.play(new TransformDiff(mine.code, next, { hunks: [placed(hunk, place)], runTime: 1.4 }), new FadeIn(extra, { runTime: 0.4 }));
      s.keep(next, extra);
      await s.enter(says);
    } else {
      const differ = [
        new SurroundingRectangle(linesBox(COPY_AT, 2, 2, WIDE_FILE), { buff: 0, cornerRadius: 0.06, stroke: s.look.bad, strokeWidth: 0.05 }),
        new SurroundingRectangle(linesBox(cardAt(hunk.oldStart), 1, 1, WIDE_FILE), { buff: 0, cornerRadius: 0.06, stroke: s.look.bad, strokeWidth: 0.05 }),
      ].map((m, i) => emphasised(keyed(m, `differ:${i}`), 'outlined: the lines that differ'));
      const says = stack(s, said, [COPY_AT[0] - 1.2, rowY(TOP, copy.length + 0.6)], { mono: false });
      s.keep(differ[0]!, differ[1]!, { describe: 'Outlined: port = 8081 in the file and port = 8080 in the hunk, the lines that differ' });
      await this.play(...differ.map((m) => new Create(m, { runTime: 0.5 })));
      await s.enter(says);
    }

    // 7. The practical boundary: a copy where the hunk's lines occur in another section, nearer its line.
    const wrong = apply(LOOKALIKE, [hunk]);
    if (!wrong.ok) throw new Error('the hunk fits the lookalike file');
    const landed = wrong.placements[0]!;
    await s.steps([
      {
        id: 'wrong',
        title: 'A patch can apply cleanly in the wrong place',
        line: 'Git matched the lines. It cannot know which section was meant.',
        caption: `In this copy the ${sectionAt(LOOKALIKE, landed.at)} section comes first and holds the same three lines. The hunk finds its old side at line ${landed.at} and Git applies it without a word: to ${sectionAt(LOOKALIKE, landed.at)}, though the author changed ${sectionAt(BEFORE, hunk.oldStart)}. One line of context was too little to tell the sections apart. With the usual three, the hunk would have carried the ${sectionAt(BEFORE, hunk.oldStart)} line itself and been refused. After applying a patch to a file that has changed, read the result.`,
        state: { file: [...LOOKALIKE], header: head, tried: landed.tried, at: landed.at, offset: landed.offset, applied: true, report: report(wrong, NAME), result: wrong.file, landed: sectionAt(LOOKALIKE, landed.at), meant: sectionAt(BEFORE, hunk.oldStart) } as PatchState,
        draw: (state: PatchState, s: Stage) => {
          const st = having(state, 'result', 'landed', 'meant'), at = st.at ?? 1;
          const shown = fileAt(s, st.result, COPY_AT, 'copy');
          const size = newSide(hunk).length, box = linesBox(COPY_AT, at, at + size - 1, WIDE_FILE, { gutter: true });
          const mark = emphasised(keyed(new SurroundingRectangle(box, { buff: 0.03, cornerRadius: 0.1, stroke: s.look.emphasis, strokeWidth: 0.06 }), 'landed'), 'outlined: the lines the patch changed');
          const there = st.result.findIndex((l, i) => i > at && l === st.meant) + 1;
          return new Group(shown.code, ...shown.numbers, mark,
            stack(s, ['The patch landed here,', `in ${st.landed}`], [box[2] + 0.5, rowY(TOP, at - 0.5)]),
            stack(s, [`The author meant ${st.meant},`, 'which is unchanged'], [box[2] + 0.5, rowY(TOP, there - 0.5)], { soft: true }));
        },
      },
    ]);
  }
}

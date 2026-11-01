import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/wcag-map.ts';
import { Scene } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  GUIDELINES,
  LEVELS,
  PRINCIPLES,
  PUBLISHED,
  VERSIONS,
  change,
  criteria,
  guidelinesIn,
  opened,
  principleOf,
  tally,
  totals,
} from '../lib/wcag-map.ts';
import type { Criterion, Level, Version } from '../lib/wcag-map.ts';

// Of the light styles, github-light draws the root's label plainly; hand-drawn, excalidraw and pen-and-ink
// outline it in the paper colour on a dark circle, which smears it. A mark's colour stands for a version:
// the accent for 2.1, green for 2.2, red for the removal.
const STYLE = 'github-light';
// w3c/wcag at tag WCAG22-20241212, commit 1dfe1647bdecf32fb4f76b9ce1cc33139505630c.
const REPO = 'https://github.com/w3c/wcag/blob/1dfe1647bdecf32fb4f76b9ce1cc33139505630c/guidelines/';
// Mind map labels reach 14 px at a 1280 px stage only with Mermaid's node padding cut to 4; nodes up to
// 300 px wide keep the longest criterion names on one line, so 7 rows fit on a side.
const HEAD = '---\nconfig:\n  mindmap:\n    padding: 4\n    maxNodeWidth: 300\n---\n';

/** Topic ids: root, p2 (a principle), g2_4 (a guideline), c2_4_11 (a criterion). */
const pid = (num: string) => `p${num}`;
const gid = (num: string) => `g${num.replace('.', '_')}`;
const cid = (num: string) => `c${num.replaceAll('.', '_')}`;
const nameOfPrinciple = (num: string) => PRINCIPLES.find((p) => p.num === num)!.name;
const guideline = (num: string) => GUIDELINES.find((g) => g.num === num)!;

interface Topic {
  id: string;
  label: string;
  parent?: string;
  shape: 'circle' | 'square';
}
/** The whole map for one version: root, principles, guidelines, each with the criteria the level asks for. */
function mapTopics(v: Version, level: Level): Topic[] {
  const t = tally(v, level);
  const out: Topic[] = [{ id: 'root', label: `WCAG ${v} · ${t.total}`, shape: 'circle' }];
  for (const p of PRINCIPLES) {
    out.push({ id: pid(p.num), label: `${p.num} ${p.name} · ${t.principles[p.num]}`, parent: 'root', shape: 'square' });
    for (const g of guidelinesIn(v).filter((g) => principleOf(g.num) === p.num))
      out.push({
        id: gid(g.num),
        label: `${g.num} ${g.name} · ${t.guidelines[g.num]}`,
        parent: pid(p.num),
        shape: 'square',
      });
  }
  return out;
}
/** The versions a criterion is part of: "2.2", or "2.0 to 2.1" for one removed in 2.2. */
const span = (c: Criterion) => (c.removed ? `${c.added} to ${VERSIONS[VERSIONS.indexOf(c.removed) - 1]}` : c.added);
/** One guideline as its own root, with every criterion it has held at the level: its level, and the version that added it. */
function openTopics(num: string, level: Level): Topic[] {
  const g = guideline(num);
  const out: Topic[] = [
    { id: gid(num), label: `${num} ${g.name} · ${criteria('2.2', level, num).length}`, shape: 'circle' },
  ];
  for (const c of opened(num, level))
    out.push({
      id: cid(c.num),
      label: `${c.num} ${c.name} · ${c.level}, ${span(c)}`,
      parent: gid(num),
      shape: 'square',
    });
  return out;
}
function source(topics: readonly Topic[]): string {
  const depth = (t: Topic): number => (t.parent ? 1 + depth(topics.find((x) => x.id === t.parent)!) : 0);
  const lines = ['mindmap'];
  const walk = (t: Topic) => {
    const pad = '  '.repeat(depth(t) + 1);
    lines.push(t.shape === 'circle' ? `${pad}${t.id}((${t.label}))` : `${pad}${t.id}[${t.label}]`);
    for (const c of topics.filter((x) => x.parent === t.id)) walk(c);
  };
  walk(topics.find((t) => !t.parent)!);
  return HEAD + lines.join('\n');
}
/** The edits that turn one map into the next: new topics, then changed labels. */
function edits(before: readonly Topic[], after: readonly Topic[]) {
  const had = new Map(before.map((t) => [t.id, t]));
  const ops: Record<string, unknown>[] = [];
  for (const t of after)
    if (!had.has(t.id)) {
      const siblings = after.filter((x) => x.parent === t.parent);
      ops.push({
        kind: 'add_node',
        id: t.id,
        label: t.label,
        parent: t.parent,
        shape: 'rect',
        index: siblings.indexOf(t),
      });
    } else if (had.get(t.id)!.label !== t.label) ops.push({ kind: 'set_label', id: t.id, label: t.label });
  return ops;
}

/** What level X asks for, in words. */
const asks: Record<Level, string> = {
  A: 'every level A criterion',
  AA: 'every level A and level AA criterion',
  AAA: 'every criterion at levels A, AA and AAA',
};
/** "n of them at level A or AA", or for AAA, which asks for all of them, nothing. */
const ofThem = (n: number, all: number, level: Level) =>
  level === 'AAA'
    ? ''
    : `, ${n === all ? 'all' : n === 0 ? 'none' : n} of them at level ${level === 'A' ? 'A' : 'A or AA'}`;
const listed = (xs: readonly string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export default class WcagMapExplainer extends Scene {
  static meta = {
    id: 'wcag-map',
    title: 'What does a WCAG conformance level require?',
    sources: [
      'https://www.w3.org/WAI/WCAG22/wcag.json',
      REPO + 'index.html#L93',
      REPO + 'index.html#L418-L421',
      REPO + 'sc/20/parsing.html#L3-L5',
      REPO + 'sc/20/focus-visible.html#L5',
      'https://www.w3.org/TR/2008/REC-WCAG20-20081211/',
      'https://www.w3.org/TR/2018/REC-WCAG21-20180605/#new-features-in-wcag-2-1',
      'https://www.w3.org/TR/2023/REC-WCAG21-20230921/',
      'https://www.w3.org/TR/2024/REC-WCAG22-20241212/',
      'https://www.w3.org/TR/2023/REC-WCAG22-20231005/#changelog',
      'https://www.w3.org/TR/2020/WD-WCAG22-20200227/#focus-visible',
      'https://www.w3.org/TR/2023/CRD-WCAG22-20230125/#focus-visible',
      'https://www.w3.org/TR/2023/CRD-WCAG22-20230517/#focus-visible',
      'https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/',
    ],
  };
  static settings = [
    {
      id: 'level',
      label: 'Conformance level',
      default: 'AA',
      options: LEVELS.map((l) => ({ value: l, label: l })),
    },
    {
      id: 'guideline',
      label: 'Guideline to open',
      default: '2.4',
      options: ['1.4', '2.4', '2.5', '4.1'].map((g) => ({ value: g, label: `${g} ${guideline(g).name}` })),
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const level = values.level as Level,
      open = values.guideline!;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const t20 = tally('2.0', level),
      t21 = tally('2.1', level),
      t22 = tally('2.2', level);

    // ------------------------------------------------------------------ 2.0
    await readerFirst(this, s, readerFrames(level, open));
    await this.step('v20', {
      detail: true,
      title: `WCAG 2.0 at level ${level} asks for ${t20.total} success criteria`,
      line: `Each number counts the criteria level ${level} asks for.`,
      caption: `WCAG 2.0 (${PUBLISHED['2.0']}) sorts its success criteria under ${PRINCIPLES.length} principles and ${guidelinesIn('2.0').length} guidelines. Conforming at level ${level} means meeting ${asks[level]}. The number on each topic counts the criteria under it that level ${level} asks for: ${t20.total} in all. We will add the criteria from 2.1 and 2.2, then subtract the one 2.2 removed, to see exactly what this conformance level asks for.`,
    });
    await s.clear();
    let topics = mapTopics('2.0', level);
    const d = await s.show({ source: source(topics) }, { box: 'full' });
    this.state.v20 = t20;

    // ------------------------------------------------------------------ 2.1
    const c21 = change('2.0', '2.1', level);
    const gained21 = guidelinesIn('2.1').filter((g) => t21.guidelines[g.num] !== (t20.guidelines[g.num] ?? 0));
    // One new guideline, 2.5 (wcag.json gives it versions 2.1 and 2.2); the tests hold the model to that.
    const fresh = guideline(c21.newGuidelines[0]!);
    await this.step('v21', {
      detail: true,
      title: `WCAG 2.1 adds guideline ${fresh.num} and ${c21.added.length} criteria for level ${level}`,
      line: `Marked guidelines gained criteria; ${fresh.num} ${fresh.name} is new.`,
      caption: `WCAG 2.1 (${PUBLISHED['2.1']}) keeps all of 2.0 and adds ${c21.addedAll} criteria${ofThem(c21.added.length, c21.addedAll, level)}. The marked guidelines gained criteria for this level; ${fresh.num} ${fresh.name}, new under ${nameOfPrinciple(principleOf(fresh.num))}, holds ${t21.guidelines[fresh.num]} of them. Level ${level} now asks for ${t21.total}.`,
    });
    const next21 = mapTopics('2.1', level);
    await d.morph({ source: source(next21) }, { ops: edits(topics, next21) });
    topics = next21;
    await d.mark(
      gained21.map((g) => gid(g.num)),
      { as: 'gained criteria in 2.1' },
    );
    this.state.v21 = { tally: t21, change: c21 };

    // ------------------------------------------------------------------ 2.2
    const c22 = change('2.1', '2.2', level);
    const gained22 = guidelinesIn('2.2').filter((g) => t22.guidelines[g.num]! > t21.guidelines[g.num]!);
    const lost22 = guidelinesIn('2.2').filter((g) => t22.guidelines[g.num]! < t21.guidelines[g.num]!);
    const where = listed(c22.principlesGained.map(nameOfPrinciple));
    await this.step('v22', {
      detail: true,
      title: `WCAG 2.2 adds ${c22.addedAll} criteria and removes 4.1.1 Parsing`,
      line: `${t21.total}, plus ${c22.added.length}, minus ${c22.removed.length}: ${t22.total} criteria.`,
      caption: `WCAG 2.2 (${PUBLISHED['2.2']}) adds ${c22.addedAll} criteria${ofThem(c22.added.length, c22.addedAll, level)}, under ${where}. It also removes 4.1.1 Parsing, so guideline 4.1 drops from ${t21.guidelines['4.1']} to ${t22.guidelines['4.1']}. Level ${level} now asks for ${t22.total}: ${t21.total}, plus ${c22.added.length}, minus ${c22.removed.length}.`,
    });
    const next22 = mapTopics('2.2', level);
    await d.morph({ source: source(next22) }, { ops: edits(topics, next22) });
    topics = next22;
    await d.mark(
      gained22.map((g) => gid(g.num)),
      { color: s.good, as: 'gained criteria in 2.2' },
    );
    await d.mark(
      lost22.map((g) => gid(g.num)),
      { color: s.bad, as: 'lost a criterion in 2.2' },
    );
    this.state.v22 = { tally: t22, change: c22 };

    // ------------------------------------------------------------------ Parsing
    await this.step('parsing', {
      detail: true,
      title: '4.1.1 Parsing is obsolete, so WCAG 2.2 drops it',
      line: 'Its markup problems are gone or covered by other criteria.',
      // 2.0 Recommendation, 4.1.1; guidelines/sc/20/parsing.html:5; guidelines/index.html:93.
      caption:
        '4.1.1 asked for well-formed markup: complete start and end tags, correct nesting, no duplicate attributes, unique ids. W3C’s note says assistive technology no longer needs to parse HTML directly, so those problems are gone or covered by other criteria. Anyone held by policy to 2.0 or 2.1 may still need to test and report it.',
    });
    await d.dim(['root', pid('4'), gid('4.1')]);
    await d.note(gid('4.1'), '4.1.1 Parsing removed', { side: 'below' });
    this.state.removed = c22.removed;

    // ------------------------------------------------------------------ one guideline
    const g = guideline(open);
    const shown = opened(open, level);
    const now = criteria('2.2', level, open);
    const by = (v: Version) => shown.filter((c) => c.added === v).map((c) => c.num);
    const gone = shown.filter((c) => c.removed).map((c) => c.num);
    const later = [...by('2.1'), ...by('2.2')];
    // "2.4.11 to 2.4.13" when the numbers run on without a gap, otherwise each one.
    const last = (n: string) => Number(n.split('.')[2]);
    const range = (xs: readonly string[]) =>
      xs.length > 2 && xs.every((x, i) => i === 0 || last(x) === last(xs[i - 1]!) + 1)
        ? `${xs[0]} to ${xs.at(-1)}`
        : listed(xs);
    const added = (['2.1', '2.2'] as const).filter((v) => by(v).length).map((v) => `${range(by(v))} in ${v}`);
    const forLevel = `for level ${level}`;
    await this.step('open', {
      detail: true,
      title: gone.length
        ? `Guideline ${open} ${later.length ? `gained ${later.length} and ` : ''}lost 4.1.1 Parsing ${forLevel}`
        : later.length === now.length
          ? `All ${now.length} of guideline ${open}’s criteria ${forLevel} came after 2.0`
          : later.length
            ? `${later.length} of guideline ${open}’s ${now.length} criteria ${forLevel} came after 2.0`
            : `Guideline ${open} has had the same ${now.length} criteria ${forLevel} since 2.0`,
      line: 'Each criterion shows its level and the version that added it.',
      caption: `Guideline ${open} ${g.name} on its own: each topic gives a criterion’s level and the version that added it, and the number on the guideline, ${now.length}, counts those level ${level} asks for in 2.2. ${
        later.length
          ? `${later.length === 1 ? 'The marked one was' : 'The marked ones were'} added later: ${added.join('; ')}.`
          : 'Every one dates from 2.0.'
      }${gone.length ? ` 4.1.1 Parsing is marked as removed, and not counted.` : ''}`,
    });
    await d.morph({ source: source(openTopics(open, level)) });
    await d.mark(by('2.1').map(cid), { as: 'added in 2.1' });
    await d.mark(by('2.2').map(cid), { color: s.good, as: 'added in 2.2' });
    if (gone.length) await d.mark(gone.map(cid), { color: s.bad, as: 'removed in 2.2' });
    this.state.opened = shown.map((c: Criterion) => ({
      num: c.num,
      level: c.level,
      added: c.added,
      ...(c.removed ? { removed: c.removed } : {}),
    }));

    // ------------------------------------------------------------------ 2.4.7, where it is shown
    if (open === '2.4' && level !== 'A') {
      await this.step('focus-visible', {
        detail: true,
        title: '2.4.7 Focus Visible is still level AA',
        line: 'Drafts made it level A; since May 2023 it is AA again.',
        // "(Level A)" in every 2.2 draft from WD-WCAG22-20200227 to CRD-WCAG22-20230125; "(Level AA)" from
        // CRD-WCAG22-20230517 on. The change logs of those drafts and of REC-WCAG22-20231005 keep
        // "2019-11-10: Promoted Focus Visible from Level AA to Level A."; REC-WCAG22-20241212 drops it.
        // guidelines/sc/20/focus-visible.html:5 at the pinned tag: "AA".
        caption:
          'Drafts of WCAG 2.2 from February 2020 to January 2023 made 2.4.7 Focus Visible level A. From the May 2023 draft on it is AA again, as in 2.0 and 2.1, but the October 2023 Recommendation’s change log still listed the move to A. The December 2024 update deleted that entry.',
      });
      await d.dim([gid('2.4'), cid('2.4.7')]);
      await d.mark([cid('2.4.7')], { as: 'still level AA' });
      this.state.focusVisible = criteria('2.2', level, '2.4').find((c) => c.num === '2.4.7')!.level;
    }

    // ------------------------------------------------------------------ totals
    const gain = (num: string) => t22.principles[num]! - t20.principles[num]!;
    const top = Math.max(...PRINCIPLES.map((p) => gain(p.num)));
    const most = PRINCIPLES.filter((p) => gain(p.num) === top);
    await this.step('totals', {
      detail: true,
      title: `WCAG 2.2 at level ${level}: ${t22.total} criteria, ${PRINCIPLES.map((p) => t22.principles[p.num]).join(', ')} by principle`,
      line: `Level ${level}: ${t20.total} in 2.0, ${t21.total} in 2.1, ${t22.total} in 2.2.`,
      caption: `${level === 'A' ? 'Level A is the minimum.' : `The list for level ${level} includes ${level === 'AA' ? 'level A' : 'levels A and AA'}.`} From 2.0 to 2.2 the list for level ${level} grew from ${t20.total} to ${t22.total}: ${c21.added.length} more in 2.1, then ${c22.added.length} added and ${c22.removed.length} removed in 2.2. ${most.length === 1 ? `${most[0]!.name} gained the most, from ${t20.principles[most[0]!.num]} to ${t22.principles[most[0]!.num]}` : `${listed(most.map((p) => p.name))} gained the most, ${top} each`}.`,
    });
    await s.clear();
    const all = totals();
    // Three cards side by side: by version, by principle, by level.
    const column = (i: number) => regionBox('full', { left: -7.55 + i * 5.1, right: -7.55 + i * 5.1 + 4.85 });
    const byVersion = await s.card(
      VERSIONS.map((v) => [`WCAG ${v}`, String(all[v][level])] as [string, string]),
      { at: column(0), title: `Level ${level}`, fontSize: 0.42, enter: false },
    );
    const byPrinciple = await s.card(
      PRINCIPLES.map((p) => [p.name, String(t22.principles[p.num])] as [string, string]),
      { at: column(1), title: `WCAG 2.2, level ${level}`, fontSize: 0.42, enter: false },
    );
    const byLevel = await s.card(
      LEVELS.map((l) => [`Level ${l}`, String(all['2.2'][l])] as [string, string]),
      { at: column(2), title: 'WCAG 2.2', fontSize: 0.42, enter: false },
    );
    await s.enter(byVersion, byPrinciple, byLevel);
    await byLevel.mark(`Level ${level}`, { as: 'this level' });
    this.state.totals = {
      versions: VERSIONS.map((v) => all[v][level]),
      principles: t22.principles,
      levels: all['2.2'],
    };
  }
}

// The wcag-map explainer's model, held to W3C's own documents: the w3c/wcag repository at the tag
// of the December 2024 Recommendation, and the published 2.0, 2.1 and 2.2 Recommendations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectProject } from '../tools/lib/explain-project.ts';
import {
  CRITERIA,
  GUIDELINES,
  LEVELS,
  PRINCIPLES,
  VERSIONS,
  change,
  criteria,
  guidelinesIn,
  inVersion,
  opened,
  tally,
  totals,
} from '../scenes/explainers/lib/wcag-map.ts';
import type { Level, Version } from '../scenes/explainers/lib/wcag-map.ts';

// w3c/wcag at tag WCAG22-20241212, commit 1dfe1647bdecf32fb4f76b9ce1cc33139505630c, read on 2026-10-25.
// guidelines/index.html: the line of each principle's and guideline's <section>, then each criterion's
// data-include line with the file it includes and the level in that file's <p class="conformance-level">.
// sc/20/parsing.html has no level. Set WCAG_REPO to a checkout of that tag to read them again.
const SECTIONS: readonly [line: number, kind: 'principle' | 'guideline', id: string][] = [
  [127, 'principle', 'perceivable'],
  [131, 'guideline', 'text-alternatives'],
  [138, 'guideline', 'time-based-media'],
  [161, 'guideline', 'adaptable'],
  [179, 'guideline', 'distinguishable'],
  [212, 'principle', 'operable'],
  [216, 'guideline', 'keyboard-accessible'],
  [230, 'guideline', 'enough-time'],
  [248, 'guideline', 'seizures-and-physical-reactions'],
  [260, 'guideline', 'navigable'],
  [292, 'guideline', 'input-modalities'],
  [315, 'principle', 'understandable'],
  [319, 'guideline', 'readable'],
  [337, 'guideline', 'predictable'],
  [355, 'guideline', 'input-assistance'],
  [380, 'principle', 'robust'],
  [384, 'guideline', 'compatible'],
];
// prettier-ignore
const INCLUDES: readonly [line: number, file: string, level: string][] = [
  [135, 'sc/20/non-text-content.html', 'A'],
  [142, 'sc/20/audio-only-and-video-only-prerecorded.html', 'A'],
  [144, 'sc/20/captions-prerecorded.html', 'A'],
  [146, 'sc/20/audio-description-or-media-alternative-prerecorded.html', 'A'],
  [148, 'sc/20/captions-live.html', 'AA'],
  [150, 'sc/20/audio-description-prerecorded.html', 'AA'],
  [152, 'sc/20/sign-language-prerecorded.html', 'AAA'],
  [154, 'sc/20/extended-audio-description-prerecorded.html', 'AAA'],
  [156, 'sc/20/media-alternative-prerecorded.html', 'AAA'],
  [158, 'sc/20/audio-only-live.html', 'AAA'],
  [165, 'sc/20/info-and-relationships.html', 'A'],
  [167, 'sc/20/meaningful-sequence.html', 'A'],
  [169, 'sc/20/sensory-characteristics.html', 'A'],
  [171, 'sc/21/orientation.html', 'AA'],
  [173, 'sc/21/identify-input-purpose.html', 'AA'],
  [175, 'sc/21/identify-purpose.html', 'AAA'],
  [183, 'sc/20/use-of-color.html', 'A'],
  [185, 'sc/20/audio-control.html', 'A'],
  [187, 'sc/20/contrast-minimum.html', 'AA'],
  [189, 'sc/20/resize-text.html', 'AA'],
  [191, 'sc/20/images-of-text.html', 'AA'],
  [193, 'sc/20/contrast-enhanced.html', 'AAA'],
  [195, 'sc/20/low-or-no-background-audio.html', 'AAA'],
  [197, 'sc/20/visual-presentation.html', 'AAA'],
  [199, 'sc/20/images-of-text-no-exception.html', 'AAA'],
  [201, 'sc/21/reflow.html', 'AA'],
  [203, 'sc/21/non-text-contrast.html', 'AA'],
  [205, 'sc/21/text-spacing.html', 'AA'],
  [207, 'sc/21/content-on-hover-or-focus.html', 'AA'],
  [220, 'sc/20/keyboard.html', 'A'],
  [222, 'sc/20/no-keyboard-trap.html', 'A'],
  [224, 'sc/20/keyboard-no-exception.html', 'AAA'],
  [226, 'sc/21/character-key-shortcuts.html', 'A'],
  [234, 'sc/20/timing-adjustable.html', 'A'],
  [236, 'sc/20/pause-stop-hide.html', 'A'],
  [238, 'sc/20/no-timing.html', 'AAA'],
  [240, 'sc/20/interruptions.html', 'AAA'],
  [242, 'sc/20/re-authenticating.html', 'AAA'],
  [244, 'sc/21/timeouts.html', 'AAA'],
  [252, 'sc/20/three-flashes-or-below-threshold.html', 'A'],
  [254, 'sc/20/three-flashes.html', 'AAA'],
  [256, 'sc/21/animation-from-interactions.html', 'AAA'],
  [264, 'sc/20/bypass-blocks.html', 'A'],
  [266, 'sc/20/page-titled.html', 'A'],
  [268, 'sc/20/focus-order.html', 'A'],
  [270, 'sc/20/link-purpose-in-context.html', 'A'],
  [272, 'sc/20/multiple-ways.html', 'AA'],
  [274, 'sc/20/headings-and-labels.html', 'AA'],
  [276, 'sc/20/focus-visible.html', 'AA'],
  [278, 'sc/20/location.html', 'AAA'],
  [280, 'sc/20/link-purpose-link-only.html', 'AAA'],
  [282, 'sc/20/section-headings.html', 'AAA'],
  [284, 'sc/22/focus-not-obscured-minimum.html', 'AA'],
  [286, 'sc/22/focus-not-obscured-enhanced.html', 'AAA'],
  [288, 'sc/22/focus-appearance.html', 'AAA'],
  [296, 'sc/21/pointer-gestures.html', 'A'],
  [298, 'sc/21/pointer-cancellation.html', 'A'],
  [300, 'sc/21/label-in-name.html', 'A'],
  [302, 'sc/21/motion-actuation.html', 'A'],
  [304, 'sc/21/target-size-enhanced.html', 'AAA'],
  [306, 'sc/21/concurrent-input-mechanisms.html', 'AAA'],
  [308, 'sc/22/dragging-movements.html', 'AA'],
  [310, 'sc/22/target-size-minimum.html', 'AA'],
  [323, 'sc/20/language-of-page.html', 'A'],
  [325, 'sc/20/language-of-parts.html', 'AA'],
  [327, 'sc/20/unusual-words.html', 'AAA'],
  [329, 'sc/20/abbreviations.html', 'AAA'],
  [331, 'sc/20/reading-level.html', 'AAA'],
  [333, 'sc/20/pronunciation.html', 'AAA'],
  [341, 'sc/20/on-focus.html', 'A'],
  [343, 'sc/20/on-input.html', 'A'],
  [345, 'sc/20/consistent-navigation.html', 'AA'],
  [347, 'sc/20/consistent-identification.html', 'AA'],
  [349, 'sc/20/change-on-request.html', 'AAA'],
  [351, 'sc/22/consistent-help.html', 'A'],
  [359, 'sc/20/error-identification.html', 'A'],
  [361, 'sc/20/labels-or-instructions.html', 'A'],
  [363, 'sc/20/error-suggestion.html', 'AA'],
  [365, 'sc/20/error-prevention-legal-financial-data.html', 'AA'],
  [367, 'sc/20/help.html', 'AAA'],
  [369, 'sc/20/error-prevention-all.html', 'AAA'],
  [371, 'sc/22/redundant-entry.html', 'A'],
  [373, 'sc/22/accessible-authentication-minimum.html', 'AA'],
  [375, 'sc/22/accessible-authentication-enhanced.html', 'AAA'],
  [388, 'sc/20/parsing.html', ''],
  [390, 'sc/20/name-role-value.html', 'A'],
  [392, 'sc/21/status-messages.html', 'AA'],
];
const FOLDER: Record<string, Version> = { '20': '2.0', '21': '2.1', '22': '2.2' };

/** Number each included criterion the way the published document does: by its place in its guideline. */
function numbered() {
  return INCLUDES.map(([line, file, level]) => {
    const before = SECTIONS.filter(([l]) => l < line);
    const principle = before.filter(([, k]) => k === 'principle').length;
    const start = before.filter(([, k]) => k === 'principle').at(-1)![0];
    const guideline = before.filter(([l, k]) => k === 'guideline' && l > start).length;
    const gStart = before.at(-1)![0];
    const n = INCLUDES.filter(([l]) => l > gStart && l <= line).length;
    return { num: `${principle}.${guideline}.${n}`, file, level, folder: FOLDER[file.split('/')[1]!]! };
  });
}

test('every criterion, its level and the version that added it are the pinned repository’s', () => {
  const repo = numbered();
  assert.equal(CRITERIA.length, repo.length);
  for (const [i, c] of CRITERIA.entries()) {
    const r = repo[i]!;
    assert.equal(c.num, r.num, r.file);
    assert.equal(c.added, r.folder, `${c.num} is in ${r.file}`);
    // 4.1.1 has no level in 2.2; the published 2.0 and 2.1 give it, checked in the next test.
    if (r.file === 'sc/20/parsing.html') assert.deepEqual([r.level, c.removed], ['', '2.2']);
    else assert.equal(c.level, r.level, `${c.num} ${c.name}: ${r.file}`);
  }
  // The guidelines and their order: each criterion sits under one the model lists, in order.
  assert.deepEqual(
    [...new Set(repo.map((r) => r.num.split('.').slice(0, 2).join('.')))],
    GUIDELINES.map((g) => g.num),
  );
});

test('re-reading the repository gives the same table, when WCAG_REPO points at a checkout', { skip: !process.env.WCAG_REPO }, () => {
  const root = join(process.env.WCAG_REPO!, 'guidelines');
  const lines = readFileSync(join(root, 'index.html'), 'utf8').split('\n');
  const includes = lines.flatMap((l, i) => {
    const m = /data-include="(sc\/2[012]\/[^"]+\.html)"/.exec(l);
    if (!m) return [];
    const level = /<p class="conformance-level">\s*(A+)\s*<\/p>/.exec(readFileSync(join(root, m[1]!), 'utf8'));
    return [[i + 1, m[1]!, level?.[1] ?? '']];
  });
  assert.deepEqual(includes, INCLUDES);
  const sections = lines.flatMap((l, i) => {
    const m = /<section class="(principle|guideline)" id="([^"]+)"/.exec(l);
    return m ? [[i + 1, m[1], m[2]]] : [];
  });
  assert.deepEqual(sections, SECTIONS);
  assert.ok(existsSync(join(root, 'sc/20/parsing.html')));
});

// Each criterion and level as the published Recommendations print them, "(Level A)" and so on, read
// on 2026-10-25 from https://www.w3.org/TR/2008/REC-WCAG20-20081211/,
// https://www.w3.org/TR/2023/REC-WCAG21-20230921/ (the 2018 original, REC-WCAG21-20180605, agrees on
// every one) and https://www.w3.org/TR/2024/REC-WCAG22-20241212/, where 4.1.1 has no level ("-").
const PUBLISHED: Record<Version, string> = {
  '2.0':
    '1.1.1:A 1.2.1:A 1.2.2:A 1.2.3:A 1.2.4:AA 1.2.5:AA 1.2.6:AAA 1.2.7:AAA 1.2.8:AAA 1.2.9:AAA 1.3.1:A ' +
    '1.3.2:A 1.3.3:A 1.4.1:A 1.4.2:A 1.4.3:AA 1.4.4:AA 1.4.5:AA 1.4.6:AAA 1.4.7:AAA 1.4.8:AAA 1.4.9:AAA ' +
    '2.1.1:A 2.1.2:A 2.1.3:AAA 2.2.1:A 2.2.2:A 2.2.3:AAA 2.2.4:AAA 2.2.5:AAA 2.3.1:A 2.3.2:AAA 2.4.1:A ' +
    '2.4.2:A 2.4.3:A 2.4.4:A 2.4.5:AA 2.4.6:AA 2.4.7:AA 2.4.8:AAA 2.4.9:AAA 2.4.10:AAA 3.1.1:A 3.1.2:AA ' +
    '3.1.3:AAA 3.1.4:AAA 3.1.5:AAA 3.1.6:AAA 3.2.1:A 3.2.2:A 3.2.3:AA 3.2.4:AA 3.2.5:AAA 3.3.1:A 3.3.2:A ' +
    '3.3.3:AA 3.3.4:AA 3.3.5:AAA 3.3.6:AAA 4.1.1:A 4.1.2:A',
  '2.1':
    '1.1.1:A 1.2.1:A 1.2.2:A 1.2.3:A 1.2.4:AA 1.2.5:AA 1.2.6:AAA 1.2.7:AAA 1.2.8:AAA 1.2.9:AAA 1.3.1:A ' +
    '1.3.2:A 1.3.3:A 1.3.4:AA 1.3.5:AA 1.3.6:AAA 1.4.1:A 1.4.2:A 1.4.3:AA 1.4.4:AA 1.4.5:AA 1.4.6:AAA ' +
    '1.4.7:AAA 1.4.8:AAA 1.4.9:AAA 1.4.10:AA 1.4.11:AA 1.4.12:AA 1.4.13:AA 2.1.1:A 2.1.2:A 2.1.3:AAA ' +
    '2.1.4:A 2.2.1:A 2.2.2:A 2.2.3:AAA 2.2.4:AAA 2.2.5:AAA 2.2.6:AAA 2.3.1:A 2.3.2:AAA 2.3.3:AAA 2.4.1:A ' +
    '2.4.2:A 2.4.3:A 2.4.4:A 2.4.5:AA 2.4.6:AA 2.4.7:AA 2.4.8:AAA 2.4.9:AAA 2.4.10:AAA 2.5.1:A 2.5.2:A ' +
    '2.5.3:A 2.5.4:A 2.5.5:AAA 2.5.6:AAA 3.1.1:A 3.1.2:AA 3.1.3:AAA 3.1.4:AAA 3.1.5:AAA 3.1.6:AAA 3.2.1:A ' +
    '3.2.2:A 3.2.3:AA 3.2.4:AA 3.2.5:AAA 3.3.1:A 3.3.2:A 3.3.3:AA 3.3.4:AA 3.3.5:AAA 3.3.6:AAA 4.1.1:A ' +
    '4.1.2:A 4.1.3:AA',
  '2.2':
    '1.1.1:A 1.2.1:A 1.2.2:A 1.2.3:A 1.2.4:AA 1.2.5:AA 1.2.6:AAA 1.2.7:AAA 1.2.8:AAA 1.2.9:AAA 1.3.1:A ' +
    '1.3.2:A 1.3.3:A 1.3.4:AA 1.3.5:AA 1.3.6:AAA 1.4.1:A 1.4.2:A 1.4.3:AA 1.4.4:AA 1.4.5:AA 1.4.6:AAA ' +
    '1.4.7:AAA 1.4.8:AAA 1.4.9:AAA 1.4.10:AA 1.4.11:AA 1.4.12:AA 1.4.13:AA 2.1.1:A 2.1.2:A 2.1.3:AAA ' +
    '2.1.4:A 2.2.1:A 2.2.2:A 2.2.3:AAA 2.2.4:AAA 2.2.5:AAA 2.2.6:AAA 2.3.1:A 2.3.2:AAA 2.3.3:AAA 2.4.1:A ' +
    '2.4.2:A 2.4.3:A 2.4.4:A 2.4.5:AA 2.4.6:AA 2.4.7:AA 2.4.8:AAA 2.4.9:AAA 2.4.10:AAA 2.4.11:AA ' +
    '2.4.12:AAA 2.4.13:AAA 2.5.1:A 2.5.2:A 2.5.3:A 2.5.4:A 2.5.5:AAA 2.5.6:AAA 2.5.7:AA 2.5.8:AA 3.1.1:A ' +
    '3.1.2:AA 3.1.3:AAA 3.1.4:AAA 3.1.5:AAA 3.1.6:AAA 3.2.1:A 3.2.2:A 3.2.3:AA 3.2.4:AA 3.2.5:AAA 3.2.6:A ' +
    '3.3.1:A 3.3.2:A 3.3.3:AA 3.3.4:AA 3.3.5:AAA 3.3.6:AAA 3.3.7:A 3.3.8:AA 3.3.9:AAA 4.1.1:- 4.1.2:A ' +
    '4.1.3:AA',
};
const published = (v: Version) => PUBLISHED[v].split(' ').map((x) => x.split(':') as [string, string]);

test('each version’s criteria and levels are its own Recommendation’s', () => {
  for (const v of VERSIONS) {
    // A criterion with no level is printed but not part of the version: 4.1.1 in 2.2.
    const want = published(v).filter(([, l]) => l !== '-');
    const have = criteria(v, 'AAA').map((c) => [c.num, c.level]);
    assert.deepEqual(have, want, v);
  }
  assert.deepEqual(
    published('2.2').filter(([, l]) => l === '-'),
    [['4.1.1', '-']],
  );
});

test('the counts per level are the Recommendations’ own, level by level', () => {
  // Counted from PUBLISHED: a level asks for its own criteria and those of the levels below it.
  const count = (v: Version, l: Level) =>
    published(v).filter(([, x]) => x !== '-' && LEVELS.indexOf(x as Level) <= LEVELS.indexOf(l)).length;
  for (const v of VERSIONS) for (const l of LEVELS) assert.equal(totals()[v][l], count(v, l), `${v} ${l}`);
  assert.deepEqual(totals(), {
    '2.0': { A: 25, AA: 38, AAA: 61 },
    '2.1': { A: 30, AA: 50, AAA: 78 },
    '2.2': { A: 31, AA: 55, AAA: 86 },
  });
  // The explainer's title: 55 at AA in 2.2, 20 Perceivable, 20 Operable, 13 Understandable, 2 Robust.
  assert.deepEqual(tally('2.2', 'AA').principles, { 1: 20, 2: 20, 3: 13, 4: 2 });
  assert.deepEqual(tally('2.0', 'AA').principles, { 1: 14, 2: 12, 3: 10, 4: 2 });
  assert.deepEqual(tally('2.1', 'AA').principles, { 1: 20, 2: 17, 3: 10, 4: 3 });
});

test('what 2.1 and 2.2 add and remove is what W3C lists', () => {
  // REC-WCAG21-20180605 §0.5.1: "The following Success Criteria are new in WCAG 2.1:" (17).
  const new21 = '1.3.4 1.3.5 1.3.6 1.4.10 1.4.11 1.4.12 1.4.13 2.1.4 2.2.6 2.3.3 2.5.1 2.5.2 2.5.3 2.5.4 2.5.5 2.5.6 4.1.3';
  // guidelines/index.html:98–107 at the pinned tag: "The following success criteria are new in WCAG 2.2:".
  const new22 = '2.4.11 2.4.12 2.4.13 2.5.7 2.5.8 3.2.6 3.3.7 3.3.8 3.3.9';
  assert.deepEqual(change('2.0', '2.1', 'AAA').added, new21.split(' '));
  assert.deepEqual(change('2.1', '2.2', 'AAA').added, new22.split(' '));
  // What's New in WCAG 2.2: "WCAG 2.2 provides 9 additional success criteria since WCAG 2.1."
  assert.equal(change('2.1', '2.2', 'A').addedAll, 9);
  // guidelines/index.html:93: "WCAG 2.2 has removed one success criterion, 4.1.1 Parsing."
  for (const l of LEVELS) assert.deepEqual(change('2.1', '2.2', l).removed, ['4.1.1']);
  assert.deepEqual(change('2.0', '2.1', 'AAA').removed, []);
  // Guideline 2.5 is the one new guideline: wcag.json gives it versions ["2.1", "2.2"].
  assert.deepEqual(change('2.0', '2.1', 'A').newGuidelines, ['2.5']);
  assert.deepEqual(change('2.1', '2.2', 'A').newGuidelines, []);
});

test('2.4.7 Focus Visible is level AA in every version', () => {
  // A common belief has 2.2 moving it to level A. Drafts did (WD-WCAG22-20200227 to CRD-WCAG22-20230125);
  // every Recommendation, and guidelines/sc/20/focus-visible.html:5 at the pinned tag, give AA.
  for (const v of VERSIONS) assert.ok(published(v).some(([n, l]) => n === '2.4.7' && l === 'AA'), v);
  assert.equal(CRITERIA.find((c) => c.num === '2.4.7')!.level, 'AA');
  assert.ok(INCLUDES.some(([, f, l]) => f === 'sc/20/focus-visible.html' && l === 'AA'));
});

test('every version and level tally adds up, by principle and by guideline', () => {
  for (const v of VERSIONS) for (const l of LEVELS) {
    const t = tally(v, l);
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    assert.equal(sum(t.principles), t.total, `${v} ${l} principles`);
    assert.equal(sum(t.guidelines), t.total, `${v} ${l} guidelines`);
    assert.deepEqual(Object.keys(t.guidelines), guidelinesIn(v).map((g) => g.num));
  }
});

test('every version and level includes everything the level below it asks for', () => {
  const pairs: readonly (readonly [Level, Level])[] = [['A', 'AA'], ['AA', 'AAA'], ['A', 'AAA']];
  for (const v of VERSIONS) for (const [lo, hi] of pairs) {
    const higher = new Set(criteria(v, hi).map((c) => c.num));
    for (const c of criteria(v, lo)) assert.ok(higher.has(c.num), `${v}: ${c.num} at ${lo} but not ${hi}`);
  }
});

test('every adjacent version and level is its predecessor plus additions minus removals', () => {
  const pairs: readonly (readonly [Version, Version])[] = [['2.0', '2.1'], ['2.1', '2.2']];
  for (const [a, b] of pairs) for (const l of LEVELS) {
    const c = change(a, b, l);
    const before = criteria(a, l).map((x) => x.num);
    const expected = [...before.filter((n) => !c.removed.includes(n)), ...c.added];
    assert.deepEqual(new Set(criteria(b, l).map((x) => x.num)), new Set(expected));
    assert.equal(criteria(b, l).length, before.length + c.added.length - c.removed.length);
  }
});

test('every opened guideline and level counts its current criteria and holds every criterion it ever had', () => {
  for (const { num: g } of GUIDELINES) for (const l of LEVELS) {
    const shown = opened(g, l);
    assert.deepEqual(
      shown.filter((c) => inVersion(c, '2.2')).map((c) => c.num),
      criteria('2.2', l, g).map((c) => c.num),
    );
    for (const v of VERSIONS) for (const c of criteria(v, l, g)) assert.ok(shown.includes(c), `${c.num} in ${v}`);
  }
});

test('every authored case is collected, and the mind map reads as its outline', async () => {
  const project = await collectProject('scenes/explainers/wcag-map', { write: false });
  assert.equal(project.cases.length, 12);
  // Step-state fidelity for every case lives in explain-fidelity.test.ts.
  // The description lists a mind map's topics depth first, each principle followed by its own
  // guidelines, rather than alternating between the root's two sides (1.1, 2.1, 1.2, …).
  const v20 = project.cases[0]!.trace.steps.find((s) => s.step === 'v20')!;
  const items = (v20.shown!.picture as { entries: { items: string[] }[] }).entries[0]!.items.filter((x) => !x.includes('→'));
  const outline = [
    `WCAG 2.0`,
    ...PRINCIPLES.flatMap((p) => [`${p.num} ${p.name}`, ...guidelinesIn('2.0').filter((g) => g.num.startsWith(p.num + '.')).map((g) => `${g.num} ${g.name}`)]),
  ];
  assert.deepEqual(
    items.map((x) => x.replace(/ · \d+$/, '')),
    outline,
  );
});

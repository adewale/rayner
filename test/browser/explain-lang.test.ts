import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../../tools/lib/explain-serve.ts';
import { collectProject, ROOT } from '../../tools/lib/explain-project.ts';
import type { Project } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { chromeFor, caseNameIn, CHROME, descriptionLang, descriptionsLang, settingsProblem } from '../../app/embed-strings.ts';
import type { SettingsProblem } from '../../app/embed-strings.ts';
import { caseName, resolveSettings } from '../../explain/index.ts';
import { pictureSummary, pictureHtml, picture } from '../../explain/trace.ts';
import { VOCABULARY, wordsFor, describedIn, familyNames, markHeading } from '../../explain/words.ts';
import type { Words } from '../../explain/words.ts';

const FAMILIES = wordsFor('en').families;
import { launch } from '../../tools/lib/browser.ts';

const NB = ' ';
// One scene per language: a setting, a card (so each step has a generated description) and a caption.
const scene = (lang: string, label: string, caption: string) =>
  `import{Scene}from'rayner';import{stage,settingsOf}from'rayner/explain';export default class L extends Scene{static meta={id:'lang-${lang}',title:'${label}',lang:'${lang}',sources:['https://example.com/source']};static settings=[{id:'n',label:'${label}',default:'1',options:[{value:'1',label:'1'},{value:'2',label:'2'}]}];async construct(){const s=stage(this);await this.step('one',{title:'${label}',caption:'${caption}'});await s.card([['${label}',settingsOf(this).n]]);}}`;
// A French scene that uses every kind of generated words: a flowchart marked, noted, walked with
// and without a trail and dimmed; a titled card with a lit row; code with a diff and a focus; a
// chart with two bar series and two lines; kept text with no describe.
const rich = `import{Scene,Text}from'rayner';import{stage}from'rayner/explain';export default class R extends Scene{static meta={id:'riche',title:'Riche',lang:'fr'};async construct(){const s=stage(this);
await this.step('flux',{title:'Flux',caption:'Le revenu passe par le barème.'});
const d=await s.show({source:'graph LR\\nA["Revenu"] --> B["Barème"]\\nB --> C["Impôt"]'},{box:[-8,0,8,3.4]});
await d.mark(['A']);await d.note('C','plafond');
const c=await s.card([['Parts','2'],['Quotient','15 000 €']],{title:'Foyer',at:[-4,-2]});await c.mark('Parts');
await this.step('trajet',{title:'Trajet',caption:'Le revenu va au barème.'});
await d.walk([['A','B']],{trail:true});await d.dim(['A','B']);
const k=await s.code(['+ seuil: 11600','+ plafond: 1807','- seuil: 11497','taux: 11 %'],{diff:true,title:'barème',at:[4,-2]});await k.focus(3);
await this.step('chemin',{title:'Chemin',caption:'Puis à l’impôt.'});
await d.walk([['B','C']]);
await this.step('graphique',{title:'Graphique',caption:'Les montants par mois.'});
await s.clear();
await s.show({source:'xychart-beta\\n x-axis "Mois" ["janvier","février","mars","avril","mai"]\\n y-axis "Montant" 0 --> 2000\\n bar [10, 20.5, 1500, 3, 4]\\n bar [30, 40, 50, 60, 70]\\n line [5, 5, 5, 5, 5]\\n line [1, 90, 90, 90, 90]'},{box:[-8,-2,8,3.4]});
await s.enter(new Text('Seuil libre').moveTo([-3,-3]),new Text('Autre texte').moveTo([3,-3]));
}}`;
let folder: string;
const built: Record<'fr' | 'en' | 'de', { project: Project; html: string; file: string }> = {} as never;
let riche: Project;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'rayner-lang-'));
  for (const [lang, label, caption] of [
    ['fr', 'Enfants à charge', 'Un couple déclare son revenu.'],
    ['en', 'Children', 'A couple files a return.'],
    // A language with page words in neither table: English chrome, English descriptions marked so.
    ['de', 'Kinder', 'Ein Paar reicht seine Erklärung ein.'],
  ] as const) {
    const source = join(folder, `${lang}.ts`),
      file = join(folder, `${lang}.html`);
    await writeFile(source, scene(lang, label, caption));
    const project = await collectProject(source);
    built[lang] = { project, html: (await buildExplainer(project, file)).html, file };
  }
  await writeFile(join(folder, 'riche.ts'), rich);
  riche = await collectProject(join(folder, 'riche.ts'));
});
after(() => rm(folder, { recursive: true, force: true }));

/** Every step's summary and full list, as a reader hears them (tags dropped, entities decoded). */
const described = (project: Project) =>
  project.variants.flatMap(({ trace }) =>
    trace.steps.map((s, i) => ({
      step: s.step,
      summary: pictureSummary(s.after),
      html: pictureHtml(s.after, trace.steps[i - 1]?.after),
    })),
  );
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
/** The words a text is made of, lower case. */
const wordsIn = (t: string) => t.toLowerCase().match(/\p{L}{2,}/gu) ?? [];
/**
 * Every English word the generated descriptions can say: each English entry, each pattern
 * applied to a placeholder, each noun's plural, and the English family names.
 * Words French spells the same way (code, note, message, point…) are left out.
 */
const ENGLISH = (() => {
  const en = VOCABULARY.en as Words;
  const said: string[] = [];
  for (const value of Object.values(en)) {
    if (typeof value === 'string') said.push(value);
    else if (typeof value === 'function') said.push((value as (...a: unknown[]) => string)('Q', 'Q', 'Q', 'Q', 'Q'));
    else if (Array.isArray(value)) said.push(...value);
    else said.push(...Object.values(value as Record<string, string>));
  }
  for (const noun of [en.label, en.labelledValue, en.line, en.category, en.part, en.link]) said.push(en.count(2, noun));
  for (const [name, thing, link] of Object.values(FAMILIES)) said.push(name, ...[thing, link].filter((n): n is string => !!n).map((n) => en.count(2, n) + ' ' + n));
  const same = new Set(['code', 'note', 'notes', 'part', 'parts', 'participant', 'participants', 'message', 'messages', 'transition', 'transitions', 'commit', 'commits', 'point', 'points', 'service', 'services', 'classes', 'architecture', 'git', 'xy', 'gantt', 'qs']);
  return new Set(wordsIn(said.join(' ')).filter((w) => !same.has(w)));
})();
const englishIn = (t: string) => [...new Set(wordsIn(t).filter((w) => ENGLISH.has(w)))];

test('page words come from a table by primary language, English when there is none', () => {
  assert.equal(chromeFor('fr').transcript, 'Transcription');
  assert.equal(chromeFor('fr-BE').next, 'Suivant');
  // The step heading's kicker, and with a title a step bar segment's name; the rail's disclosure.
  assert.equal(chromeFor('en').stepOf(3, 4), 'Step 3 of 4');
  assert.equal(chromeFor('en').stepOf(3, 4, 'Title'), 'Step 3 of 4: Title');
  assert.equal(chromeFor('fr').stepOf(3, 4), 'Étape 3 sur 4');
  assert.equal(chromeFor('fr').stepOf(3, 4, 'Titre'), `Étape 3 sur 4${NB}: Titre`);
  assert.equal(chromeFor('en').allSteps(4), 'All 4 steps');
  assert.equal(chromeFor('fr').allSteps(4), 'Les 4 étapes');
  // The footer's mark and way out of a frame (specs/player-tile.md T7); "Rayner" is a name, never translated.
  assert.equal(chromeFor('en').madeWith, 'Made with Rayner');
  assert.equal(chromeFor('fr').madeWith, 'Réalisé avec Rayner');
  assert.equal(chromeFor('en').open, 'Open the explainer');
  assert.equal(chromeFor('fr').open, 'Ouvrir l’explication');
  for (const words of Object.values(CHROME)) assert.equal(Object.hasOwn(words, 'newTab'), false);
  assert.equal(chromeFor('de'), CHROME.en);
  assert.equal(chromeFor(), CHROME.en);
  // A tag that names an Object property is a language with no table, not that property.
  for (const tag of ['constructor', '__proto__']) assert.equal(chromeFor(tag), CHROME.en, tag);
  // Every language names every piece of chrome.
  for (const [lang, words] of Object.entries(CHROME)) assert.deepEqual(Object.keys(words).sort(), Object.keys(CHROME.en!).sort(), lang);
});

const PROBLEMS: SettingsProblem[] = [
  { kind: 'option', id: 'n', label: 'Enfants à charge', value: '9' },
  { kind: 'setting', id: 'x' },
  { kind: 'other', message: 'Invalid options/default for setting: n' },
];
test('French chrome follows French typography: a narrow no-break space before : ; ! ? and inside « »', () => {
  const fr = chromeFor('fr');
  const texts = Object.entries(fr).flatMap(([key, v]) =>
    typeof v !== 'function'
      ? [v]
      : key === 'fallback'
        ? PROBLEMS.map((p) => fr.fallback(p))
        : [(v as (a: string, b: string) => string)('Titre', 'étape')],
  );
  for (const text of texts) {
    assert.doesNotMatch(text, /[^\u202f][:;!?»]/, text);
    assert.doesNotMatch(text, /«[^\u202f]/, text);
  }
});

test('the invalid-settings notice names the problem in the page’s language; English says what the validator says', () => {
  const { Scene } = built.fr.project;
  const problem = (values: Record<string, string>) => {
    try {
      resolveSettings(Scene, values);
    } catch (error) {
      return { error: (error as Error).message, problem: settingsProblem(Scene, values, error) };
    }
    throw new Error('accepted');
  };
  const option = problem({ n: '9' }),
    unknown = problem({ x: '1' }),
    both = problem({ x: '1', n: '9' });
  assert.deepEqual(option.problem, { kind: 'option', id: 'n', label: 'Enfants à charge', value: '9' });
  assert.deepEqual(unknown.problem, { kind: 'setting', id: 'x' });
  // The validator checks declared settings first; so does the notice.
  assert.equal(both.problem.kind, 'option');
  for (const p of [option, unknown, both]) assert.equal(chromeFor('en').fallback(p.problem), `${p.error}. Showing the default case.`);
  assert.equal(
    chromeFor('fr').fallback(option.problem),
    `Le réglage «${NB}Enfants à charge${NB}» n’a pas d’option «${NB}9${NB}». Le cas par défaut est affiché.`,
  );
  assert.equal(chromeFor('fr').fallback(unknown.problem), `Cette explication n’a pas de réglage «${NB}x${NB}». Le cas par défaut est affiché.`);
  // The French notice never quotes the validator's English.
  assert.doesNotMatch(chromeFor('fr').fallback(PROBLEMS[2]!), /Invalid/);
});

test('a case name keeps English punctuation in English and takes French punctuation in French', () => {
  const { Scene } = built.en.project;
  assert.equal(caseNameIn('en', Scene, { n: '2' }), caseName(Scene, { n: '2' }));
  assert.equal(caseNameIn('fr', built.fr.project.Scene, { n: '2' }), `Enfants à charge${NB}: 2`);
});

test('every vocabulary key has a French entry; a language with none describes in English', () => {
  assert.deepEqual(Object.keys(VOCABULARY.fr!).sort(), Object.keys(VOCABULARY.en!).sort());
  for (const [key, value] of Object.entries(VOCABULARY.en!))
    if (value && typeof value === 'object' && key !== 'plurals' && key !== 'families')
      assert.deepEqual(Object.keys((VOCABULARY.fr as Record<string, object>)[key]!).sort(), Object.keys(value).sort(), key);
  assert.equal(describedIn('fr-CA'), 'fr');
  assert.equal(describedIn('de'), 'en');
  assert.equal(describedIn(), 'en');
  assert.equal(wordsFor('de'), wordsFor('en'));
  assert.equal(wordsFor('de').marked, 'marked');
  assert.equal(wordsFor('fr-BE').marked, 'en évidence');
  // A page marks descriptions lang="en" only where they are not in its language.
  assert.equal(descriptionLang('fr'), '');
  assert.equal(descriptionLang('fr-CA'), '');
  assert.equal(descriptionLang('en-GB'), '');
  assert.equal(descriptionLang('de'), ' lang="en"');
  assert.equal(descriptionsLang('de'), 'en');
  assert.equal(descriptionsLang('fr'), undefined);
});

test('every family has French words: its own, or the generic ones, never English', (t) => {
  const fr = wordsFor('fr'),
    en = wordsFor('en');
  const missing = Object.keys(FAMILIES).filter((f) => !Object.hasOwn(fr.families, f));
  // Families with English names but no French entry in explain/words.ts.
  t.diagnostic(`families without French names: ${missing.join(', ') || 'none'}`);
  for (const family of Object.keys(FAMILIES)) {
    const names = familyNames(fr, family);
    assert.deepEqual(englishIn(names.join(' ')), [], `${family}: ${names.join(', ')}`);
    if (missing.includes(family)) assert.deepEqual(names, [`Diagramme ${family}`, 'élément', 'lien']);
  }
  // A family neither table knows.
  assert.deepEqual(familyNames(fr, 'sankey'), ['Diagramme sankey', 'élément', 'lien']);
  assert.deepEqual(familyNames(en, 'sankey'), ['sankey diagram', 'part', 'link']);
  assert.deepEqual(familyNames(en, 'flowchart'), ['Flowchart', 'node', 'link']);
  assert.deepEqual(familyNames(fr, 'flowchart'), ['Logigramme', 'nœud', 'lien']);
  assert.deepEqual(familyNames(en, 'xychart'), ['XY chart', 'part', 'link']);
  assert.deepEqual(familyNames(en, 'constructor'), ['constructor diagram', 'part', 'link']);
});

test('French counts, plurals and agreement: 0 and 1 singular, regular and irregular plurals, elision', () => {
  const fr = wordsFor('fr'),
    en = wordsFor('en');
  assert.equal(fr.count(0, 'nœud'), '0 nœud');
  assert.equal(fr.count(1, 'nœud'), '1 nœud');
  assert.equal(fr.count(2, 'nœud'), '2 nœuds');
  assert.equal(fr.count(1, fr.labelledValue), '1 valeur étiquetée');
  assert.equal(fr.count(4, fr.labelledValue), '4 valeurs étiquetées');
  assert.equal(fr.count(2, 'canal'), '2 canaux');
  assert.equal(fr.count(3, 'tableau'), '3 tableaux');
  assert.equal(fr.count(2, 'prix'), '2 prix');
  assert.equal(fr.count(1500, fr.line), `1${NB}500 lignes`);
  assert.equal(fr.more(1), 'et 1 autre');
  assert.equal(fr.more(5), 'et 5 autres');
  assert.equal(fr.number(385.33), '385,33');
  assert.equal(fr.number(10000), `10${NB}000`);
  // Emphasis words over several parts: the helper's agree, an author's stay as written.
  assert.equal(markHeading(fr, fr.added, 1), 'ajoutée');
  assert.equal(markHeading(fr, fr.added, 3), 'ajoutées');
  assert.equal(markHeading(fr, `${fr.focused}, ${fr.removed}`, 2), 'en surbrillance, supprimées');
  assert.equal(markHeading(fr, fr.marked, 5), 'en évidence');
  assert.equal(markHeading(fr, 'ce foyer', 3), 'ce foyer');
  for (const lang of ['en', 'fr']) for (const word of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])
    for (const n of [1, 2, 3]) assert.equal(markHeading(wordsFor(lang), word, n), word);
  assert.equal(markHeading(fr, `${fr.added}, constructor`, 2), 'ajoutées, constructor');
  // …and so does a summary, which lists the parts under their word.
  const lines = (mark: string, n: number) => ({ what: 'Code', parts: Array.from({ length: n }, (_, i) => ({ name: `${i + 1}${NB}: x`, mark })) });
  assert.equal(pictureSummary({ picture: picture([lines(fr.added, 2)], new Set(), 'fr') }), `Code. Ajoutées${NB}: 1${NB}: x${NB}; 2${NB}: x.`);
  assert.equal(pictureSummary({ picture: picture([lines(fr.added, 1)], new Set(), 'fr') }), `Code. Ajoutée${NB}: 1${NB}: x.`);
  assert.equal(pictureSummary({ picture: picture([lines('ce foyer', 2)], new Set(), 'fr') }), `Code. Ce foyer${NB}: 1${NB}: x${NB}; 2${NB}: x.`);
  assert.equal(fr.beside('plafond', 'Impôt'), `«${NB}plafond${NB}» à côté d’Impôt`);
  assert.equal(fr.beside('plafond', 'Barème'), `«${NB}plafond${NB}» à côté de Barème`);
  assert.equal(fr.span('le début', 'les fins'), 'du début aux fins');
  assert.equal(fr.span('0', 'avril'), 'de 0 à avril');
  assert.equal(fr.span('avril', 'mai'), 'd’avril à mai');
  // English keeps its rules exactly.
  assert.equal(en.count(1, en.category), '1 category');
  assert.equal(en.count(12, en.category), '12 categories');
  assert.equal(en.count(2, 'branch'), '2 branches');
  assert.equal(en.count(3, en.labelledValue), '3 labelled values');
  assert.equal(markHeading(en, 'note', 2), 'note');
});

test('a French scene’s resting pictures are described in French, with French typography', () => {
  const steps = described(riche);
  for (const s of steps) {
    assert.deepEqual(englishIn(s.summary), [], `${s.step} summary: ${s.summary}`);
    assert.deepEqual(englishIn(text(s.html)), [], `${s.step} list: ${s.html}`);
  }
  const at = (step: string) => steps.find((s) => s.step === step)!;
  // NB is U+202F, the narrow no-break space French sets before : and ; and inside « ».
  const flow = `Logigramme${NB}: 3 nœuds, 2 liens`,
    card = `«${NB}Foyer${NB}», 2 valeurs étiquetées`,
    code = `Code «${NB}barème${NB}», 4 lignes`,
    note = `«${NB}plafond${NB}» à côté d’Impôt`;
  assert.equal(at('flux').summary, `${flow}${NB}; ${card}. Note${NB}: ${note}${NB}; en évidence${NB}: Revenu${NB}; Parts${NB}: 2.`);
  assert.equal(
    at('trajet').summary,
    `${flow}${NB}; ${card}${NB}; ${code}. Note${NB}: ${note}${NB}; en évidence${NB}: Revenu${NB}; Parts${NB}: 2${NB}; ` +
      `sur le trajet${NB}: Revenu → Barème${NB}; et 4 autres. Nouveau à cette étape${NB}: ${code}.`,
  );
  assert.equal(
    at('trajet').html,
    `<ul><li>${flow}${NB}:<ul><li>${note} (note)${NB};</li><li>Revenu (en évidence)${NB};</li><li>Revenu → Barème (sur le trajet)${NB};</li>` +
      `<li>Barème${NB};</li><li>Barème → Impôt (en retrait)${NB};</li><li>Impôt (en retrait).</li></ul></li>` +
      `<li>${card}${NB}:<ul><li>Parts${NB}: 2 (en évidence)${NB};</li><li>le reste comme à l’étape précédente.</li></ul></li>` +
      `<li>${code}${NB}:<ul><li>1${NB}: + seuil: 11600 (ajoutée)${NB};</li><li>2${NB}: + plafond: 1807 (ajoutée)${NB};</li>` +
      `<li>3${NB}: - seuil: 11497 (supprimée)${NB};</li><li>4${NB}: taux: 11 % (en surbrillance).</li></ul></li></ul>`,
  );
  // A walk without a trail names its path.
  assert.ok(at('chemin').summary.includes(`. Trajet${NB}: Barème → Impôt${NB}; note`), at('chemin').summary);
  assert.equal(
    at('graphique').summary,
    `Graphique XY${NB}: Montant de 0 à 2${NB}000 selon Mois, 5 catégories de janvier à mai${NB}; 2 étiquettes.`,
  );
  const chart = text(at('graphique').html);
  for (const said of [
    `février (barres 1)${NB}: 20,5${NB};`,
    `mars (barres 1)${NB}: 1${NB}500${NB};`,
    `Courbe 1${NB}: constante à 5${NB};`,
    `Courbe 2${NB}: minimum 1 (janvier), maximum 90 (février, mars, avril et 1 autre).`,
    `2 étiquettes${NB}:`,
  ])
    assert.ok(chart.includes(said), said);
});

test('quotient-familial: every English word in its descriptions is one its author wrote', async () => {
  const project = await collectProject(join(ROOT, 'scenes/explainers/quotient-familial/scene.ts'));
  // Words the scene's own source holds (labels, code, mark words passed as `as`) are the author's.
  const authored = new Set(wordsIn(await readFile(project.file, 'utf8')));
  for (const s of described(project)) {
    const generated = englishIn(`${s.summary} ${text(s.html)}`).filter((w) => !authored.has(w));
    assert.deepEqual(generated, [], `${s.step}: ${s.summary}`);
  }
  assert.ok(described(project).find(s=>s.step==='revenu')!.summary.startsWith(`Logigramme${NB}: 8 nœuds, 8 liens${NB}; «${NB}Ce foyer${NB}», 4 valeurs étiquetées`));
});

// Golden descriptions of shipped English explainers, pinned from this branch's output: a change
// to the vocabulary, or to what these steps draw, shows up here.
const GOLDEN_DESCRIPTIONS = [
  {
    id: "seasons",
    step: "compare",
    summary:
      "A chart of daylight in hours, 0 to 24, through the months January to December; Tromsø’s daylight through the year, from 0.0 h to 24.0 h, flat at 24 h for 60 days and at 0 h for 61; Dashed lines at the March and September equinoxes and the June and December solstices; The same model’s curves for London, Quito, Sydney in grey, each named at its end, with Tromsø’s in red. New in this step: Dashed lines at the March and September equinoxes and the June and December solstices; The same model’s curves for London, Quito, Sydney in grey, each named at its end, with Tromsø’s in red.",
    html: "<ul><li>A chart of daylight in hours, 0 to 24, through the months January to December;</li><li>Tromsø’s daylight through the year, from 0.0 h to 24.0 h, flat at 24 h for 60 days and at 0 h for 61;</li><li>Dashed lines at the March and September equinoxes and the June and December solstices;</li><li>The same model’s curves for London, Quito, Sydney in grey, each named at its end, with Tromsø’s in red.</li></ul>",
  },
  {
    id: "mr-cache",
    step: "request",
    summary: "Two request paths, hit highlighted: hit goes from KV to Reply with 0 D1 reads; miss goes from KV through D1 to Reply with 1 D1 read and caches the row for 300 seconds.",
    html: "<ul><li>Two request paths, hit highlighted: hit goes from KV to Reply with 0 D1 reads; miss goes from KV through D1 to Reply with 1 D1 read and caches the row for 300 seconds.</li></ul>",
  },
  {
    id: "glyph",
    step: "morph",
    summary:
      "Code “label.txt”, 2 lines; Lines join the 6 paired letters of “cache miss” (c a c h e i) to their places in “cache hit”; the dropped m s s are crossed out and the new h t underlined; 5 labels. Removed: 1: - cache miss; added: 2: + cache hit.",
    html: "<ul><li>Code “label.txt”, 2 lines:<ul><li>1: - cache miss (removed);</li><li>2: + cache hit (added).</li></ul></li><li>Lines join the 6 paired letters of “cache miss” (c a c h e i) to their places in “cache hit”; the dropped m s s are crossed out and the new h t underlined;</li><li>5 labels:<ul><li>cache miss;</li><li>cache hit;</li><li>3 shrink away: m s s;</li><li>6 paired: c a c h e i;</li><li>2 grow in: h t.</li></ul></li></ul>",
  },
  {
    id: "exgit",
    step: "change",
    summary:
      "Flowchart: 7 nodes, 7 links; Two rows, commit one: commit 161f392 names tree aaa96ce, which lists hello.txt as blob ce01362; under it, commit two: commit 7edf38a names tree 88e3870, which lists hello.txt as blob ce01362 and world.txt as blob cc628cc. The hello.txt blob ce01362 is outlined in both trees: one object, named twice; 1 label. Note: “parent” beside commit 7edf38a → commit 161f392; “one blob, two trees” beside blob ce01362; marked: tree 88e3870 hello.txt, world.txt → blob ce01362; tree aaa96ce hello.txt → blob ce01362; and 1 more. New in this step: commit 7edf38a; commit 7edf38a → commit 161f392; commit 7edf38a → tree 88e3870 hello.txt, world.txt; and 5 more.",
    html: "<ul><li>Flowchart: 7 nodes, 7 links:<ul><li>“parent” beside commit 7edf38a → commit 161f392 (note);</li><li>“one blob, two trees” beside blob ce01362 (note);</li><li>tree aaa96ce hello.txt → blob ce01362 (marked);</li><li>tree 88e3870 hello.txt, world.txt → blob ce01362 (marked);</li><li>blob ce01362 (marked);</li><li>main;</li><li>main → commit 161f392;</li><li>commit 7edf38a;</li><li>commit 7edf38a → commit 161f392;</li><li>commit 7edf38a → tree 88e3870 hello.txt, world.txt;</li><li>commit 161f392;</li><li>commit 161f392 → tree aaa96ce hello.txt;</li><li>tree aaa96ce hello.txt;</li><li>tree 88e3870 hello.txt, world.txt;</li><li>tree 88e3870 hello.txt, world.txt → blob cc628cc;</li><li>blob cc628cc.</li></ul></li><li>Two rows, commit one: commit 161f392 names tree aaa96ce, which lists hello.txt as blob ce01362; under it, commit two: commit 7edf38a names tree 88e3870, which lists hello.txt as blob ce01362 and world.txt as blob cc628cc. The hello.txt blob ce01362 is outlined in both trees: one object, named twice;</li><li>1 label:<ul><li>The redraw kept all 76 shapes of commit one’s row and grew 98 new ones.</li></ul></li></ul>",
  },
];
test('English descriptions match the golden descriptions byte for byte', async () => {
  for (const pinned of GOLDEN_DESCRIPTIONS) {
    const project = await collectProject(join(ROOT, `scenes/explainers/${pinned.id}/scene.ts`));
    const s = described(project).find((d) => d.step === pinned.step)!;
    assert.equal(s.summary, pinned.summary, pinned.id);
    if (pinned.html) assert.equal(s.html, pinned.html, pinned.id);
  }
});

test('a French page has French chrome and French descriptions, with no lang="en"', () => {
  const { html } = built.fr;
  assert.match(html, /^<!doctype html>\n<html lang="fr">/);
  assert.match(html, /<summary>Transcription<\/summary>/);
  assert.match(html, /<h2>Sources<\/h2>/);
  assert.match(html, /<h2>Enfants à charge\u202f: 1<\/h2>/);
  // The bundle is minified to ASCII, so only the unaccented start of the message is matched.
  assert.ok(html.includes('Le lecteur interactif n'));
  assert.doesNotMatch(html, /<summary>Transcript<\/summary>/);
  // Each step's description in the transcript is French, in the page's language.
  const descriptions = [...html.matchAll(/<\/p><div( lang="en")?><ul><li>([^<]*)/g)];
  assert.equal(descriptions.length, 2); // one step in each of two cases
  assert.ok(descriptions.every((m) => m[1] === undefined));
  assert.deepEqual(
    descriptions.map((m) => m[2]),
    [`1 valeur étiquetée${NB}:`, `1 valeur étiquetée${NB}:`],
  );
});

test('a page in a language with no vocabulary marks its English descriptions lang="en"', () => {
  const { html } = built.de;
  assert.match(html, /^<!doctype html>\n<html lang="de">/);
  const descriptions = [...html.matchAll(/<\/p><div( lang="en")?><ul><li>([^<]*)/g)];
  assert.equal(descriptions.length, 2);
  assert.ok(descriptions.every((m) => m[1] === ' lang="en"' && m[2] === '1 labelled value:'));
});

test('an English page is unchanged: English chrome and no lang attribute on its descriptions', () => {
  const { html } = built.en;
  assert.match(html, /^<!doctype html>\n<html lang="en">/);
  assert.match(html, /<summary>Transcript<\/summary><section data-case="n=1"><h2>Children: 1<\/h2>/);
  assert.match(html, /<h2>Sources<\/h2>/);
  assert.ok(html.includes('The interactive player could not start. The transcript is available below.'));
  assert.equal([...html.matchAll(/<\/p><div><ul>/g)].length, 2);
  assert.doesNotMatch(html, /<div lang="en">/);
});

test(
  'in Chromium, the French player speaks French, its descriptions take the page’s language, and its notices are French',
  { skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for the browser check' },
  async () => {
    const server = await serve(folder, 0, 'fr.html');
    let browser: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      browser = await launch();
      const page = await browser.newPage();
      const read = async (lang: 'fr' | 'en' | 'de', query = '') => {
        await page.goto(`${server.url}/${lang}.html${query}`);
        await page.waitForSelector('[data-ready=true]');
        return page.evaluate(() => ({
          next: document.querySelector('.stepper .primary span')?.textContent,
          nextLabel: document.querySelector('.stepper .primary')?.getAttribute('aria-label'),
          previous: document.querySelector('.stepper button')?.getAttribute('aria-label'),
          tools: document.querySelector('.stepper .tools')?.getAttribute('aria-label'),
          disclosure: document.querySelector('.described > summary')?.textContent,
          summaryLang: document.getElementById('picture-summary')?.getAttribute('lang'),
          pictureLang: document.querySelector('.described > div')?.getAttribute('lang'),
          summary: document.getElementById('picture-summary')?.textContent,
          picture: document.querySelector('.described > div')?.textContent,
          transcript: document.querySelector('.transcript > summary')?.textContent,
          notice: document.querySelector('.notice')?.textContent,
        }));
      };
      // Each language's scene has one step, so the reader opens at the end: Next is Start again (specs/player-guidance.md G2).
      const fr = await read('fr');
      assert.deepEqual(
        { ...fr, picture: undefined },
        {
          next: 'Recommencer',
          nextLabel: 'Recommencer à l’étape 1',
          previous: 'Étape précédente',
          tools: 'Outils d’affichage',
          disclosure: 'Ce que montre l’image',
          summaryLang: null,
          pictureLang: null,
          summary: '1 valeur étiquetée.',
          picture: undefined,
          transcript: 'Transcription',
          notice: '',
        },
      );
      assert.equal(fr.picture, `1 valeur étiquetée${NB}:Enfants à charge${NB}: 1.`);
      const invalid = await read('fr', '?n=9');
      assert.equal(
        invalid.notice,
        `Le réglage «${NB}Enfants à charge${NB}» n’a pas d’option «${NB}9${NB}». Le cas par défaut est affiché.`,
      );
      const de = await read('de');
      assert.deepEqual([de.summaryLang, de.pictureLang, de.summary], ['en', 'en', '1 labelled value.']);
      const en = await read('en');
      assert.deepEqual(
        { ...en, summary: undefined, picture: undefined, notice: undefined },
        {
          next: 'Start again',
          nextLabel: 'Start again from step 1',
          previous: 'Previous step',
          tools: 'View tools',
          disclosure: 'What the picture shows',
          summaryLang: null,
          pictureLang: null,
          summary: undefined,
          picture: undefined,
          transcript: 'Transcript',
          notice: undefined,
        },
      );
      assert.equal((await read('en', '?n=9')).notice, 'Unknown n option: 9. Showing the default case.');
    } finally {
      try { await browser?.close(); }
      finally { server.close(); }
    }
  },
);

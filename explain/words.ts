// The words generated picture descriptions use, by the scene's language (`meta.lang`).
// English is the source of truth and the fallback: every key starts here, and a language
// with no table describes its pictures in English (its pages mark those lang="en"). Mark
// words an author passes (`as: '…'`) and the labels a picture quotes stay as written.

/** A noun a description counts: one form (plural made by the language's rule), or both forms. */
export type Noun = string | readonly [one: string, other: string];
/** A family's name, and the nouns for its things and its links. */
export type FamilyNames = readonly [family: string, thing?: string, link?: string];

export interface Words {
  /** Emphasis words a helper gives when the author names none. */
  marked: string;
  focused: string;
  added: string;
  removed: string;
  travelled: string;
  path: string;
  note: string;
  /** Plural forms of emphasis words, for a summary that lists several parts under one word. */
  plurals: Readonly<Record<string, string>>;
  /** Nouns that descriptions count. */
  label: Noun;
  labelledValue: Noun;
  line: Noun;
  category: Noun;
  /** A diagram's things and links when its family names none. */
  part: Noun;
  link: Noun;
  /** What a code panel is. */
  code: string;
  /** A chart's value axis when it has no title. */
  values: string;
  /** The family name of a diagram whose family has no name in this language. */
  diagram: (family: string) => string;
  /** Names for diagram families, by snapshot family id. */
  families: Readonly<Record<string, FamilyNames>>;
  /** Between items of a list in a sentence. */
  separator: string;
  /** Ends a list item that has a sub-list, or that is followed by another. */
  colon: string;
  semicolon: string;
  /** "label: value", a link and its label, an emphasis word and its parts. */
  pair: (a: string, b: string) => string;
  /** A link by its ends: "Client → Load balancer". */
  arrow: (from: string, to: string) => string;
  /** A title as quoted in a description. */
  quote: (text: string) => string;
  count: (n: number, noun: Noun) => string;
  number: (n: number) => string;
  /** How many items a shortened list leaves out. */
  more: (n: number) => string;
  dimmed: (name: string) => string;
  /** A note's words and the part it sits beside. */
  beside: (text: string, part: string) => string;
  newInStep: string;
  /** A sub-list that would repeat the previous step's. */
  restAsBefore: string;
  /** A range: "from 0 to 500". */
  span: (from: string, to: string) => string;
  /** The axis the values are plotted against. */
  by: (axis: string) => string;
  /** A chart line's name; `k` numbers it when there are several. */
  series: (k?: number) => string;
  /** A bar series' number, when there are several. */
  bars: (k: number) => string;
  /** A line that keeps one value. */
  flat: (name: string, value: string) => string;
  /** What an ER crow's-foot marker says, by its capture category (Mermaid's `||`, `|o`, `}o`, `}|`). */
  cardinality: Readonly<Record<string, string>>;
  /** One end of an ER relationship: "each TRIP has one or more STOP_TIME". */
  eachHas: (entity: string, cardinality: string, other: string) => string;
  /** An architecture junction, named by its id. */
  junction: (id: string) => string;
  /**
   * A state diagram's start or end dot (`[*]`), named by the state it belongs to and, in a
   * state split into concurrent regions, its region's number: "start of on, region 2".
   */
  pseudostate: (kind: 'start' | 'end', parent?: string, region?: number) => string;
  /** A line's lowest and highest values and where they fall. */
  extremes: (name: string, lo: string, atLo: string, hi: string, atHi: string) => string;
  /** A journey task's score, which the chart draws only as a face's height: "score 3 of 5". */
  score: (value: string, top: string) => string;
  /** A journey's line through its tasks' scores. */
  curve: string;
  /** A journey's score scale, after its count of tasks: "scored from 1 to 5". */
  scale: (from: string, to: string) => string;
  /** A journey's actors, named as in its source: "actor P1". */
  actors: (n: number, names: string) => string;
  /** A radar chart's spokes, counted: "17 axes". */
  axis: Noun;
  /** One value of a radar curve and the spoke it sits on: "0.248 at red". */
  valueAt: (value: string, axis: string) => string;
  /** A true or false state value, as a step's "what changed" says it (explain/trace.ts, watchedValue). */
  yes: string;
  no: string;
}

const one = (noun: Noun) => (typeof noun === 'string' ? noun : noun[0]);

const EN: Words = {
  marked: 'marked',
  focused: 'focused',
  added: 'added',
  removed: 'removed',
  travelled: 'travelled',
  path: 'path',
  note: 'note',
  plurals: {},
  label: 'label',
  labelledValue: 'labelled value',
  line: 'line',
  category: 'category',
  part: 'part',
  link: 'link',
  code: 'Code',
  values: 'values',
  diagram: (family) => `${family} diagram`,
  families: {
    flowchart: ['Flowchart', 'node', 'link'],
    sequence: ['Sequence diagram', 'participant', 'message'],
    state: ['State diagram', 'state', 'transition'],
    class: ['Class diagram', 'class', 'relationship'],
    mindmap: ['Mind map', 'topic', 'branch'],
    gitgraph: ['Git graph', 'commit', 'link'],
    er: ['ER diagram', 'entity', 'relationship'],
    xychart: ['XY chart'],
    timeline: ['Timeline', 'period'],
    gantt: ['Gantt chart', 'task'],
    quadrant: ['Quadrant chart', 'point'],
    pie: ['Pie chart', 'slice'],
    architecture: ['Architecture diagram', 'service', 'edge'],
    journey: ['User journey', 'task'],
    radar: ['Radar chart', 'curve'],
  },
  separator: '; ',
  colon: ':',
  semicolon: ';',
  pair: (a, b) => `${a}: ${b}`,
  arrow: (from, to) => `${from} → ${to}`,
  quote: (text) => `“${text}”`,
  count: (n, noun) =>
    `${n} ${n === 1 ? one(noun) : typeof noun === 'string' ? noun.replace(/(s|ch)$/, '$1e').replace(/y$/, 'ie') + 's' : noun[1]}`,
  number: (n) => String(n),
  more: (n) => `and ${n} more`,
  dimmed: (name) => `${name} (dimmed)`,
  beside: (text, part) => `“${text}” beside ${part}`,
  newInStep: 'new in this step',
  yes: 'yes',
  no: 'no',
  restAsBefore: 'the rest as in the previous step',
  span: (from, to) => `from ${from} to ${to}`,
  by: (axis) => `by ${axis}`,
  series: (k) => (k ? `Line ${k}` : 'Line'),
  bars: (k) => `bars ${k}`,
  flat: (name, value) => `${name}: ${value} throughout`,
  cardinality: { one: 'exactly one', 'zero-one': 'zero or one', 'zero-many': 'zero or more', many: 'one or more' },
  eachHas: (entity, cardinality, other) => `each ${entity} has ${cardinality} ${other}`,
  junction: (id) => `junction ${id}`,
  pseudostate: (kind, parent, region) => (parent ? `${kind} of ${parent}${region ? `, region ${region}` : ''}` : kind),
  extremes: (name, lo, atLo, hi, atHi) => `${name}: lowest ${lo} (${atLo}), highest ${hi} (${atHi})`,
  score: (value, top) => `score ${value} of ${top}`,
  curve: 'Experience curve',
  scale: (from, to) => `scored from ${from} to ${to}`,
  actors: (n, names) => `${n === 1 ? 'actor' : 'actors'} ${names}`,
  axis: ['axis', 'axes'],
  valueAt: (value, axis) => `${value} at ${axis}`,
};

/** French typography: a narrow no-break space (U+202F) before : ; ! ? and inside « ». */
const NB = ' ';
/** "de" before a word, elided before a vowel and contracted with le, les. */
const de = (word: string) =>
  /^les /i.test(word)
    ? 'des ' + word.slice(4)
    : /^le /i.test(word)
      ? 'du ' + word.slice(3)
      : /^[aeiouyàâäéèêëîïôöûùüœæ]/i.test(word)
        ? 'd’' + word
        : 'de ' + word;
/** "à" before a word, contracted with le, les. */
const a = (word: string) => (/^les /i.test(word) ? 'aux ' + word.slice(4) : /^le /i.test(word) ? 'au ' + word.slice(3) : 'à ' + word);
/** A French plural by the regular rules: -s, -x, -z stay; -au, -eau, -eu take -x; -al becomes -aux; others take -s. */
const pluriel = (noun: string) =>
  /[sxz]$/.test(noun) ? noun : /(au|eu)$/.test(noun) ? noun + 'x' : /al$/.test(noun) ? noun.slice(0, -1) + 'ux' : noun + 's';
let format: Intl.NumberFormat | undefined;
/** A number as French writes it: 1 791,5. Made on first use, so a bundle that never describes skips it. */
const nombre = (n: number) => (format ??= new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 20 })).format(n);

const FR: Partial<Words> = {
  // Invariable where the part's gender is unknown: "en évidence", not "marqué(e)".
  marked: 'en évidence',
  focused: 'en surbrillance',
  // Only code lines are added or removed: une ligne ajoutée.
  added: 'ajoutée',
  removed: 'supprimée',
  travelled: 'sur le trajet',
  path: 'trajet',
  note: 'note',
  plurals: { ajoutée: 'ajoutées', supprimée: 'supprimées', note: 'notes' },
  label: 'étiquette',
  labelledValue: ['valeur étiquetée', 'valeurs étiquetées'],
  line: 'ligne',
  category: 'catégorie',
  part: 'élément',
  link: 'lien',
  code: 'Code',
  values: 'valeurs',
  diagram: (family) => `Diagramme ${family}`,
  families: {
    flowchart: ['Logigramme', 'nœud', 'lien'],
    sequence: ['Diagramme de séquence', 'participant', 'message'],
    state: ['Diagramme d’états', 'état', 'transition'],
    class: ['Diagramme de classes', 'classe', 'relation'],
    mindmap: ['Carte mentale', 'sujet', 'branche'],
    gitgraph: ['Graphe Git', 'commit', 'lien'],
    er: ['Diagramme entité-association', 'entité', 'relation'],
    xychart: ['Graphique XY'],
    timeline: ['Frise chronologique', 'période'],
    gantt: ['Diagramme de Gantt', 'tâche'],
    quadrant: ['Graphique à quadrants', 'point'],
    pie: ['Diagramme circulaire', 'secteur'],
    architecture: ['Diagramme d’architecture', 'service', 'lien'],
    journey: ['Parcours utilisateur', 'tâche'],
    // LibreOffice's French name for the chart type; "radar" reads as English to test/explain-lang.test.ts.
    radar: ['Graphique en toile', 'courbe'],
  },
  separator: `${NB}; `,
  colon: `${NB}:`,
  semicolon: `${NB};`,
  pair: (x, y) => `${x}${NB}: ${y}`,
  arrow: (from, to) => `${from} → ${to}`,
  quote: (text) => `«${NB}${text}${NB}»`,
  // French counts 0 and 1 in the singular: 0 enfant, 1 lien, 2 liens.
  count: (n, noun) => `${nombre(n)} ${n < 2 ? one(noun) : typeof noun === 'string' ? pluriel(noun) : noun[1]}`,
  number: nombre,
  more: (n) => `et ${nombre(n)} ${n < 2 ? 'autre' : 'autres'}`,
  dimmed: (name) => `${name} (en retrait)`,
  beside: (text, part) => `«${NB}${text}${NB}» à côté ${de(part)}`,
  newInStep: 'nouveau à cette étape',
  yes: 'oui',
  no: 'non',
  restAsBefore: 'le reste comme à l’étape précédente',
  span: (from, to) => `${de(from)} ${a(to)}`,
  by: (axis) => `selon ${axis}`,
  series: (k) => (k ? `Courbe ${k}` : 'Courbe'),
  bars: (k) => `barres ${k}`,
  flat: (name, value) => `${name}${NB}: constante ${a(value)}`,
  // Numerals, not un/une: an entity's gender is unknown.
  cardinality: { one: 'exactement 1', 'zero-one': 'au plus 1', 'zero-many': 'zéro, 1 ou plusieurs', many: 'au moins 1' },
  eachHas: (entity, cardinality, other) => `chaque ${entity} a ${cardinality} ${other}`,
  junction: (id) => `jonction ${id}`,
  pseudostate: (kind, parent, region) => {
    const word = kind === 'start' ? 'début' : 'fin';
    return parent ? `${word} ${de(parent)}${region ? `, région ${region}` : ''}` : word;
  },
  extremes: (name, lo, atLo, hi, atHi) => `${name}${NB}: minimum ${lo} (${atLo}), maximum ${hi} (${atHi})`,
  // Une tâche est notée: "note 3 sur 5"; the tasks are "notées de 1 à 5".
  score: (value, top) => `note ${value} sur ${top}`,
  curve: 'Courbe d’expérience',
  scale: (from, to) => `notées ${de(from)} ${a(to)}`,
  actors: (n, names) => `${n < 2 ? 'acteur' : 'acteurs'} ${names}`,
  axis: ['axe', 'axes'],
  valueAt: (value, axis) => `${value} pour ${axis}`,
};

/** Each language's own entries, as written; `wordsFor` fills any gap from English. */
export const VOCABULARY: Readonly<Record<string, Partial<Words>>> = { en: EN, fr: FR };

const resolved = new Map<string, Words>();

/** The primary subtag of a BCP 47 tag, lower case: "fr-CA" → "fr". */
export const primaryLanguage = (lang: string) => lang.split('-')[0]!.toLowerCase();
/** The language descriptions are written in for a scene in `lang`: its own when it has words here, else English. */
export const describedIn = (lang = 'en') => (Object.hasOwn(VOCABULARY, primaryLanguage(lang)) ? primaryLanguage(lang) : 'en');
/** The description words for `lang`, English where it has none. */
export function wordsFor(lang = 'en'): Words {
  const said = describedIn(lang);
  let words = resolved.get(said);
  if (!words) resolved.set(said, (words = said === 'en' ? EN : { ...EN, ...VOCABULARY[said] }));
  return words;
}
/** A scene's language: its class's `meta.lang`, if it names one. */
export const langOf = (scene: object): string | undefined => (scene.constructor as { meta?: { lang?: string } }).meta?.lang;
/** The description words for a scene, by its class's `meta.lang`. */
export const wordsOf = (scene: object): Words => wordsFor(langOf(scene));
/**
 * A family's name and nouns in `words`' language. A family with no entry in this language
 * takes the language's generic name and nouns, never English words.
 */
export function familyNames(words: Words, family: string): [string, string, string] {
  const own = Object.hasOwn(words.families, family) ? words.families[family] : undefined;
  return [own?.[0] ?? words.diagram(family), own?.[1] ?? one(words.part), own?.[2] ?? one(words.link)];
}
/** An emphasis word as a heading over `n` parts: plural where the language has a form for it. */
export const markHeading = (words: Words, word: string, n: number) =>
  n < 2 ? word : word.split(', ').map((w) => Object.hasOwn(words.plurals, w) ? words.plurals[w] : w).join(', ');

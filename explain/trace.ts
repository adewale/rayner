import type { Scene, SceneState } from '../src/index.ts';
import type { StepRecord } from '../src/testing.ts';
import { canonicalJson } from '../src/json.ts';
import { wordsFor, describedIn, markHeading, writeNumber } from './words.ts';
import type { Words } from './words.ts';
interface WalkRecord {
  step?: string;
  from: string;
  to: string;
  edge: string;
}
const logs = new WeakMap<Scene, WalkRecord[]>();
/**
 * Keep helper evidence even when an author replaces the program-state object. The state's `walks`
 * key is reserved for it: a scene's own `walks` is refused rather than replaced.
 */
export function recordWalk(scene: Scene, walk: WalkRecord): void {
  let log = logs.get(scene);
  const own = (scene.state as Record<string, unknown>).walks;
  if (own !== undefined && (!log || canonicalJson(own) !== canonicalJson(log)))
    throw new Error('this.state: its own walks key would be replaced by the walks a diagram records there; rename the scene\'s key');
  if (!log) {
    log = [];
    logs.set(scene, log);
    const entries = log;
    scene.addJson(() => ({ walks: entries.map((entry) => ({ ...entry })) }));
  }
  log.push(walk);
  scene.state.walks = log.map((entry) => ({ ...entry }));
}


/** A part of something on the stage, as a reader would name it, with its emphasis. */
export interface DescriptionPart {
  name: string;
  /** The word for its emphasis ("marked", "rejected", "focused", in the scene's language); absent when plain. */
  mark?: string;
  dimmed?: boolean;
}
/**
 * Words for one thing on the stage, as its helper sees it: what it is, its parts, and anything drawn
 * without words. What `describe()` returns on a card, a code panel and a diagram.
 */
export interface Description {
  what: string;
  parts: DescriptionPart[];
  /** Drawn things with nothing to say for them (a part id, a kept drawing): `undescribed` reports these. */
  blank?: string[];
}
/** One thing on the stage as a reader would list it: what it is, its emphasised parts by their word, then the rest. */
export interface PictureEntry {
  what: string;
  /** Emphasised parts, grouped by the word for their emphasis ("marked", "focused", "note"). */
  marked?: Record<string, string[]>;
  /** The other parts in reading order, dimmed ones last. */
  items: string[];
}
/** What a step's resting picture shows; the stage records it in each step's state as `picture`. */
export interface Picture {
  entries: PictureEntry[];
  /** Parts that arrived or changed during the step; absent when everything did. */
  changed?: string[];
  undescribed?: string[];
  /** The language of its words when not English (explain/words.ts); the summary and list follow it. */
  lang?: string;
}
export const htmlEscape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/**
 * A step's words: its title, the line under it and its caption. Every surface that shows a
 * step in words (the player and the page's transcript) reads them here,
 * so a word the stage draws is never missing from the text.
 */
export function stepWords(s: { step: string; meta: Record<string, unknown> }): { title: string; line: string; caption: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return { title: text(s.meta.title) || s.step, line: text(s.meta.line), caption: text(s.meta.caption) };
}
/**
 * A step's line and caption as transcript paragraphs; the caller marks up the title. `dir`
 * gives each paragraph's attributes from its text (a right-to-left marker, say).
 */
export function wordsHtml(words: { line: string; caption: string }, dir: (text: string) => string = () => ''): string {
  return `${words.line ? `<p${dir(words.line)}><strong>${htmlEscape(words.line)}</strong></p>` : ''}<p${dir(words.caption)}>${htmlEscape(words.caption)}</p>`;
}
/** The most entries `meta.watch` may name, and the most changes one step shows. */
export const WATCH_MAX = 8,
  CHANGES_MAX = 4;
/** One watched value a step changed, as a reader reads it; a side is absent when it had no value. */
export interface WatchedChange {
  label: string;
  before?: string;
  after?: string;
}
function sayOne(v: unknown, lang: string): string | null {
  if (typeof v === 'number') return writeNumber(v, lang, 2);
  if (typeof v === 'string') {
    const chars = [...v];
    return chars.length > 24 ? chars.slice(0, 23).join('') + '…' : v;
  }
  if (typeof v === 'boolean') return v ? wordsFor(lang).yes : wordsFor(lang).no;
  return null;
}
/**
 * A watched state value as a reader reads it: a number as the scene's description language writes
 * it (`writeNumber`, two decimals at most), a string cut to 24
 * characters, yes or no, or up to four such items and how many more; '' when it has no value (null,
 * absent or an empty list); null when it cannot be said briefly (an object, a list of objects).
 */
export function watchedValue(v: unknown, lang = 'en'): string | null {
  if (v == null) return '';
  if (!Array.isArray(v)) return sayOne(v, lang);
  const items = v.map((x) => sayOne(x, lang));
  if (items.some((x) => x == null)) return null;
  return items.slice(0, 4).join(', ') + (items.length > 4 ? ` +${items.length - 4}` : '');
}
/**
 * What a step changed of the state its author names for readers (`meta.watch`, key to label): each
 * watched key whose JSON differs (whatever the order of its keys) between the step's start and end, in `watch` order, at most four.
 * A key whose value cannot be said briefly is skipped and its name pushed to `unformatted`; one that
 * reads the same before and after (0.001 and 0.002 both read 0) is no change to a reader. The player,
 * the page's transcript, `describeExplainer` and `rayner check` all read changes here.
 */
export function watchedChanges(
  step: { before?: SceneState; after?: SceneState },
  watch: Readonly<Record<string, string>> | undefined,
  lang = 'en',
  unformatted?: string[],
): WatchedChange[] {
  const changes: WatchedChange[] = [];
  for (const [key, label] of Object.entries(watch ?? {})) {
    const was = step.before?.[key],
      is = step.after?.[key];
    if (canonicalJson(was) === canonicalJson(is)) continue;
    const before = watchedValue(was, lang),
      after = watchedValue(is, lang);
    if (before == null || after == null) unformatted?.push(key);
    else if (before !== after && changes.length < CHANGES_MAX)
      changes.push({ label: label.trim(), ...(before ? { before } : {}), ...(after ? { after } : {}) });
  }
  return changes;
}
/**
 * Refuse a `meta.watch` that cannot work: not a record, more than eight entries, an empty key or
 * label, or a key that is never in the state of any step of any scenario (`steps`, all scenarios' steps).
 */
export function checkWatch(watch: unknown, steps: readonly { before?: SceneState; after?: SceneState }[]): void {
  if (watch === undefined) return;
  if (!watch || typeof watch !== 'object' || Array.isArray(watch))
    throw new TypeError('meta.watch: it must be a record from a state key to the label readers see');
  const entries = Object.entries(watch);
  if (entries.length > WATCH_MAX) throw new RangeError(`meta.watch: it names ${entries.length} keys; name at most ${WATCH_MAX}, so a step's changes stay readable`);
  for (const [key, label] of entries) {
    if (!key) throw new TypeError('meta.watch: it has an empty key');
    if (typeof label !== 'string' || !label.trim()) throw new TypeError(`meta.watch: it gives ${JSON.stringify(key)} an empty label`);
    if (!steps.some((s) => Object.hasOwn(s.before ?? {}, key) || Object.hasOwn(s.after ?? {}, key)))
      throw new RangeError(`meta.watch: it names ${JSON.stringify(key)}, which is never in the scene's state at any step of any scenario`);
  }
}
const pictureOf = (state: unknown): Picture | undefined => (state as { picture?: Picture } | undefined)?.picture;
/**
 * Descriptions as entries, emphasis first, and what is new since `before` (the names shown
 * when the step began), in the words of `lang`, the scene's language.
 */
export function picture(all: readonly Description[], before: ReadonlySet<string>, lang?: string): Picture {
  const words = wordsFor(lang),
    said = describedIn(lang);
  const undescribed = all.flatMap((s) => s.blank ?? []);
  const seen = all.filter((s) => s.what);
  const entries = seen.map(({ what, parts }) => {
    const grouped = new Map<string, string[]>();
    for (const p of parts) if (p.mark) {
      const names = grouped.get(p.mark) ?? [];
      names.push(p.name);
      grouped.set(p.mark, names);
    }
    const marked = Object.fromEntries(grouped);
    const rest = parts.filter((p) => !p.mark).sort((a, b) => +!!a.dimmed - +!!b.dimmed);
    const items = rest.map((p) => (p.dimmed ? words.dimmed(p.name) : p.name));
    return { what, ...(Object.keys(marked).length ? { marked } : {}), items };
  });
  // A thing wholly new is named once, by what it is; otherwise its new parts are.
  const fresh = seen.map(({ what, parts }) => {
    const names = parts.filter((p) => !before.has(p.name)).map((p) => p.name);
    return !parts.length ? (before.has(what) ? [] : [what]) : names.length === parts.length ? [what] : names;
  });
  // When everything is new (a first step, a clean slate), what is shown already says it.
  const changed = fresh.every((f, i) => f.length === 1 && f[0] === seen[i]!.what) ? [] : fresh.flat();
  return {
    entries,
    ...(changed.length ? { changed } : {}),
    ...(undescribed.length ? { undescribed } : {}),
    ...(said !== 'en' ? { lang: said } : {}),
  };
}
/** The names a picture shows, for the next step's `before`. */
export const shownNames = (seen: readonly Description[]) =>
  new Set(seen.filter((s) => s.what).flatMap(({ what, parts }) => (parts.length ? parts.map((p) => p.name) : [what])));

/**
 * Up to `max` items joined with semicolons (code's column spacing closed up, and an item's own
 * trailing comma or semicolon dropped, as the join separates them), then how many more. No-break
 * spaces stay: French sets one before a colon, and in 30 000 €.
 */
function some(words: Words, items: readonly string[], max = 3): string {
  const shown = items
    .slice(0, max)
    .map((t) => t.trim().replace(/[^\S\u00a0\u2007\u202f]+/g, ' ').replace(/[,;]+$/, ''))
    .join(words.separator);
  return items.length > max ? `${shown}${words.separator}${words.more(items.length - max)}` : shown;
}
const end = (text: string, mark: string) => (/[.;:!?,…]$/.test(text) ? text : text + mark);
const sentence = (text: string) => end(text[0]!.toUpperCase() + text.slice(1), '.');
/**
 * A step's picture in two or three short sentences, for the stage's accessible
 * description: what is shown, what is emphasised, and what is new in this step.
 */
export function pictureSummary(state: unknown): string {
  const p = pictureOf(state);
  if (!p?.entries.length) return '';
  const w = wordsFor(p.lang);
  const words = new Map<string, string[]>();
  for (const e of p.entries) for (const [word, names] of Object.entries(e.marked ?? {})) {
    const group = words.get(word) ?? [];
    group.push(...names);
    words.set(word, group);
  }
  // At most four emphasised parts in all and three under one word, those new in this step
  // first, so the description stays short and says what this step did; one count at the end
  // says how many it leaves to the full list.
  const fresh = new Set(p.changed);
  const first = (names: string[]) => names.filter((n) => fresh.has(n)).length;
  // Preserve the serialized record’s numeric-key order as well as ordinary word order.
  const groups = Object.entries(Object.fromEntries(words))
    .map(([word, names]) => [word, [...names].sort((a, b) => +fresh.has(b) - +fresh.has(a))] as const)
    .sort((a, b) => first(b[1]) - first(a[1]));
  const named = groups.flatMap(([, names]) => names);
  let room = 4;
  const marked = groups.flatMap(([word, names]) => {
    const shown = names.slice(0, Math.min(3, room));
    room -= shown.length;
    return shown.length ? [w.pair(markHeading(w, word, names.length), some(w, shown))] : [];
  });
  const left = named.length - (4 - room);
  const changed = (p.changed ?? []).filter((c) => !named.includes(c));
  return [
    p.entries.map((e) => e.what).join(w.separator),
    ...(marked.length ? [marked.join(w.separator) + (left ? w.separator + w.more(left) : '')] : []),
    ...(changed.length ? [w.pair(w.newInStep, some(w, changed))] : []),
  ]
    .map(sentence)
    .join(' ');
}
/** An entry's emphasised parts, each with its word: "bulb (lit)". */
const markedParts = (e: Pick<PictureEntry, 'marked'>) =>
  Object.entries(e.marked ?? {}).flatMap(([word, names]) => names.map((n) => `${n} (${word})`));
/** What an entry shows, its emphasis and its parts, in any order: equal when the thing looks as it did. */
const entryKey = (e: Pick<PictureEntry, 'marked'> & { items?: readonly string[] }) => [...markedParts(e), ...(e.items ?? [])].sort().join('\n');
/**
 * What changed of the picture since `previous` (a step's or event's shown state), in words:
 * each described thing that was not there, or whose emphasis or parts differ from the thing
 * of the same name before, named with its emphasised parts, in the picture's language. A thing
 * that only moved in the list is not a change. Empty when nothing changed: what a screen reader
 * hears after a live event, rather than the whole picture.
 */
export function pictureChange(state: unknown, previous?: unknown): string {
  const p = pictureOf(state);
  if (!p?.entries.length) return '';
  const w = wordsFor(p.lang);
  const before = new Map<string, Set<string>>();
  for (const e of pictureOf(previous)?.entries ?? []) before.set(e.what, (before.get(e.what) ?? new Set()).add(entryKey(e)));
  return p.entries
    .filter((e) => !before.get(e.what)?.has(entryKey(e)))
    .map((e) => [e.what, ...markedParts(e)].join(', ').replace(/[\u00a0\u202f]?[.;,]+$/, ''))
    .join(w.separator);
}
/**
 * The picture as nested lists, each thing's emphasised parts first, punctuated so it
 * reads as sentences when flattened. Given the previous step's state, a thing whose
 * parts are all as they were lists only its emphasis.
 */
export function pictureHtml(state: unknown, previous?: unknown): string {
  const p = pictureOf(state);
  if (!p?.entries.length) return '';
  const w = wordsFor(p.lang);
  const before = new Map((pictureOf(previous)?.entries ?? []).map((e) => [e.what, entryKey(e)]));
  const li = (text: string, last: boolean, sub = '') =>
    `<li>${htmlEscape(end(text, sub ? w.colon : last ? '.' : w.semicolon))}${sub}</li>`;
  const ul = (texts: string[]) => `<ul>${texts.map((t, i) => li(t, i === texts.length - 1)).join('')}</ul>`;
  return `<ul>${p.entries
    .map((e, i) => {
      const same = e.items.length && before.get(e.what) === entryKey(e);
      const items = [...markedParts(e), ...(same ? [w.restAsBefore] : e.items)];
      return li(e.what, i === p.entries.length - 1, items.length ? ul(items) : '');
    })
    .join('')}</ul>`;
}
/**
 * What a step's picture leaves unsaid: kept drawings and diagram parts with no words.
 * Empty when everything on the stage is described; `rayner check` fails a step otherwise.
 */
export const undescribed = (state: unknown): string[] => pictureOf(state)?.undescribed ?? [];
/** A step's picture in words, as each reading surface says it (`pictureWordsAt`). */
export interface PictureWords {
  /** Two or three short sentences: what is shown, what is emphasised and what is new; the stage's accessible description. */
  summary: string;
  /** Everything shown, each thing's emphasised parts first, as the player's picture list reads; plain text. */
  full: string;
  /** As `full`, except that a thing whose parts are as in the previous step lists only its emphasis, as the page's transcript reads. */
  transcript: string;
}
/**
 * The picture in words at the end of the step named `step`, from a trace (`traceScene`, or a
 * scenario of `loadProject`): what a reader who cannot see the stage is told about it.
 */
export function pictureWordsAt(trace: { steps: readonly Pick<StepRecord, 'step' | 'shown'>[] }, step: string): PictureWords {
  const i = trace.steps.findIndex((s) => s.step === step);
  if (i < 0) throw new RangeError(`pictureWordsAt(): the trace has no step ${JSON.stringify(step)}; its steps are ${trace.steps.map((s) => s.step).join(', ')}`);
  const { shown } = trace.steps[i]!,
    previous = trace.steps[i - 1]?.shown;
  const text = (html: string) =>
    html
      .replace(/<li>/g, ' ')
      .replace(/<\/?(?:ul|li)>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[e]!)
      .trim();
  return { summary: pictureSummary(shown), full: text(pictureHtml(shown)), transcript: text(pictureHtml(shown, previous)) };
}

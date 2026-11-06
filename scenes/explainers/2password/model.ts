// Ported from kitlangton/2password at e011177 (src/discover.ts `find`, src/op.ts `exec`), with
// the op CLI replaced by an in-memory vault. The sample items are the ones its own find tests use.
export const SOURCE = 'https://github.com/kitlangton/2password/blob/e011177d3e35f97a580b8903df6fff7e02593d16';
/** An item as `op item get` returns it, with one concealed field. */
const item = (
  id: string,
  title: string,
  category: string,
  vault: string,
  field: string,
  purpose?: string,
) => ({
  id,
  title,
  category,
  vault,
  fields: [
    {
      id: field,
      type: 'CONCEALED',
      purpose,
      reference: `op://${vault}/${title}/${field}`,
      value: `secret-${title.toLowerCase().replace(' ', '-')}`,
    },
  ],
});
type Item = ReturnType<typeof item>;
export const ITEMS: readonly Item[] = [
  item('1', 'Cloud API', 'API_CREDENTIAL', 'Personal', 'credential'),
  item('2', 'Cloud Login', 'LOGIN', 'Work', 'password', 'PASSWORD'),
  item('3', 'Database', 'DATABASE', 'Work', 'password', 'PASSWORD'),
];
export const SUGGESTION_THRESHOLD = 0.6;
const SUGGESTIONS_PER_MISS = 3;
/** Not in the code: the README says each command needs one desktop approval, and a service account none. */
export const PROMPTS_PER_COMMAND = { desktop: 1, service: 0 } as const;

const kind = (category: string) => category.toLowerCase().replaceAll('_', '-');
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
export const terms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);
/** A title matches when it contains every query term. */
export const matches = (query: string, title: string) =>
  terms(query).every((t) => title.toLowerCase().includes(t));
/** Levenshtein distance. */
export function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length]!;
}
/** How close a title comes to a query that matched nothing (0..1): each term scores its best title word. */
export function closeness(queryTerms: readonly string[], title: string): number {
  const candidates = words(title);
  const score = (term: string) =>
    Math.max(
      0,
      ...candidates.map((word) =>
        word.includes(term) || (word.length >= 3 && term.includes(word))
          ? 1
          : 1 - distance(term, word) / Math.max(term.length, word.length),
      ),
    );
  return queryTerms.reduce((sum, term) => sum + score(term), 0) / queryTerms.length;
}

/** `2password find`: references for matches, and close titles as suggestions for a query that matched nothing. */
export function find(queries: readonly string[], items: readonly Item[] = ITEMS) {
  const searches = [...new Set(queries)].map((query) => {
    const hits = items.filter((item) => matches(query, item.title));
    const suggested = hits.length
      ? []
      : items
          .map((item) => ({ item, score: closeness(terms(query), item.title) }))
          .filter(({ score }) => score >= SUGGESTION_THRESHOLD)
          .toSorted((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
          .slice(0, SUGGESTIONS_PER_MISS)
          .map(({ item }) => item);
    return { query, items: hits, suggested };
  });
  // One `op item get -` call fetches every item a match or a suggestion needs.
  const fetched = items.filter((item) =>
    searches.some((s) => s.items.includes(item) || s.suggested.includes(item)),
  );
  // Decoding keeps a field's reference and drops its value before anything else sees it.
  const refs = (list: readonly Item[]) =>
    list.flatMap((item) =>
      item.fields
        .filter((f) => f.reference !== undefined && (f.type === 'CONCEALED' || f.purpose === 'PASSWORD'))
        .map((f) => ({ ref: f.reference!, title: item.title, kind: kind(item.category) })),
    );
  const found = new Map<string, { ref: string; title: string; kind: string; queries: string[] }>();
  for (const { query, items: hits } of searches)
    for (const match of refs(hits)) {
      const existing = found.get(match.ref);
      if (existing) existing.queries.push(query);
      else found.set(match.ref, { ...match, queries: [query] });
    }
  const suggestions = searches.flatMap(({ query, suggested }) =>
    refs(suggested).map((m) => ({ query, ...m })),
  );
  return {
    opCalls: ['item list --format json', ...(fetched.length ? ['item get - --format json'] : [])],
    fetched: fetched.map((item) => item.title),
    matches: [...found.values()]
      .map(({ queries: answered, ...m }) => (searches.length === 1 ? m : { ...m, queries: answered }))
      .toSorted((a, b) => a.ref.localeCompare(b.ref)),
    ...(suggestions.length ? { suggestions } : {}),
  };
}

/**
 * `2password run --env NAME=op://… -- command`. With a service-account token, op runs
 * `env -u OP_SERVICE_ACCOUNT_TOKEN command`, so the token stops at op. `opEnv` is what op starts
 * with; `childEnv` is what the command gets once op has resolved each reference and run the argv.
 * op.ts spawns op with extendEnv, so both carry the whole parent environment; PATH stands in for it.
 */
export function run(
  auth: 'desktop' | 'service',
  assignments: Record<string, string>,
  command: readonly string[],
) {
  const service = auth === 'service';
  const argv = ['op', 'run', '--', ...(service ? ['env', '-u', 'OP_SERVICE_ACCOUNT_TOKEN'] : []), ...command];
  const opEnv: Record<string, string> = {
    PATH: '/usr/bin',
    ...(service ? { OP_SERVICE_ACCOUNT_TOKEN: '<service token>' } : {}),
    ...assignments,
  };
  const childEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(opEnv)) {
    if (service && name === 'OP_SERVICE_ACCOUNT_TOKEN') continue;
    const field = ITEMS.flatMap((i) => i.fields).find((f) => f.reference === value);
    childEnv[name] = field ? field.value : value;
  }
  return { argv, opEnv, childEnv };
}

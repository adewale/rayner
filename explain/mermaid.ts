// Mermaid source, built from typed values instead of string concatenation, refusing at the line
// that builds it what capture would refuse later (a zero slice, an empty title), with a message
// that names the value. `s.show({ source })` takes the string these return, unchanged.

/** A front-matter value: a string, a finite number, a boolean, or a nested map of them. */
export type FrontMatterValue = string | number | boolean | { readonly [key: string]: FrontMatterValue };

// A key or a plain scalar YAML reads back as the same string: no quoting needed.
const KEY = /^[A-Za-z_][\w-]*$/;
const PLAIN = /^[A-Za-z0-9][\w.\-]*$/;
const RESERVED = /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d[\d_]*)?\.?\d+(?:e[-+]?\d+)?)$/i;

function yamlScalar(value: string | number | boolean, path: string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`frontMatter: ${path} is ${value}; a config value must be a finite number`);
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (/[\n\r]/.test(value)) throw new Error(`frontMatter: ${path} spans lines; a config value must be one line`);
  // A colour such as #8250df would start a YAML comment unquoted, so anything not plain is quoted.
  return PLAIN.test(value) && !RESERVED.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
}

function yamlLines(map: { readonly [key: string]: FrontMatterValue }, indent: string, path: string): string[] {
  const keys = Object.keys(map);
  if (!keys.length) throw new Error(`frontMatter: ${path || 'config'} is empty; leave the key out instead`);
  return keys.flatMap((key) => {
    const at = path ? `${path}.${key}` : key;
    if (!KEY.test(key)) throw new Error(`frontMatter: "${at}" is not a config key Mermaid reads`);
    const value = map[key]!;
    return typeof value === 'object'
      ? [`${indent}${key}:`, ...yamlLines(value, `${indent}  `, at)]
      : [`${indent}${key}: ${yamlScalar(value, at)}`];
  });
}

/**
 * The `---` block that opens a Mermaid source with its `config:`, two spaces per level, without a
 * trailing newline: `frontMatter({ flowchart: { rankSpacing: 24 } })` is
 * "---\nconfig:\n  flowchart:\n    rankSpacing: 24\n---". Strings YAML would read as something
 * else (a colour's `#`, `true`, a number) are single-quoted. An empty map, a non-finite number, a
 * value over two lines or a key Mermaid cannot read is refused.
 */
export function frontMatter(config: { readonly [key: string]: FrontMatterValue }): string {
  return ['---', 'config:', ...yamlLines(config, '  ', ''), '---'].join('\n');
}

/** One slice of a pie: its legend label and its value, which must be above zero. */
export interface PieSlice {
  label: string;
  value: number;
}
export interface PieOptions {
  /** The title line; absent for none, and refused when given empty or over two lines. */
  title?: string;
  /** `pie showData`: the legend shows each slice's value. */
  showData?: boolean;
  /** Front matter for the chart (`frontMatter`'s argument). */
  config?: { readonly [key: string]: FrontMatterValue };
}

/**
 * A Mermaid pie: front matter, `pie` (or `pie showData`), the title, then `  "label" : value` per
 * slice, each line ending in a newline. Mermaid draws no slice of zero and refuses a negative one,
 * so a slice that is not a positive finite number is refused here, naming it: leave a zero slice out
 * (`slices.filter((s) => s.value > 0)`) when the model can produce one. A pie with no slices, a label
 * that is empty, holds a double quote or repeats another, and an empty title are refused too.
 */
export function pie(slices: readonly PieSlice[], { title, showData = false, config }: PieOptions = {}): string {
  if (!slices.length) throw new Error('pie: a pie needs at least one slice');
  const seen = new Set<string>();
  for (const { label, value } of slices) {
    if (!label.trim() || /["\n\r]/.test(label)) throw new Error(`pie: the slice label ${JSON.stringify(label)} must be one line of text without double quotes`);
    if (seen.has(label)) throw new Error(`pie: two slices are labelled "${label}"; Mermaid keeps one`);
    seen.add(label);
    if (!(Number.isFinite(value) && value > 0))
      throw new Error(`pie: the slice "${label}" is ${value}; Mermaid draws only positive slices, so leave it out of the pie`);
  }
  if (title !== undefined && (!title.trim() || /[\n\r]/.test(title))) throw new Error('pie: a title must be one line of text; leave it out for none');
  return (
    (config ? `${frontMatter(config)}\n` : '') +
    `pie${showData ? ' showData' : ''}\n` +
    (title !== undefined ? `  title ${title}\n` : '') +
    slices.map((s) => `  "${s.label}" : ${s.value}\n`).join('')
  );
}

/** The builders as one name, `mermaid.pie(...)` and `mermaid.frontMatter(...)`, as `rayner/explain` exports them. */
export const mermaid = { frontMatter, pie } as const;

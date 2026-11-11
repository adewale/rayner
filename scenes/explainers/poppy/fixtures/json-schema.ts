// Used by the Poppy chapters' model.test.ts files to hold their models to the protocol's own schemas.
// A small JSON Schema 2020-12 checker, written for these tests, for the keywords the Personal Agent
// Protocol's published schemas use (fixtures/*.json): type, enum, const, pattern, minLength,
// maxLength, minimum, maximum, exclusiveMinimum, minItems, maxItems, items, properties, required,
// additionalProperties, propertyNames, allOf, anyOf, oneOf, not, if/then/else, $ref (within a
// schema, or to another by its $id) and the formats date-time and uri. Any other keyword in a
// schema is an error, so a schema update that needs more cannot pass by being ignored.

type Schema = boolean | { readonly [keyword: string]: unknown };
export type Schemas = Readonly<Record<string, Schema>>;

const KNOWN = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'enum', 'const', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'minItems', 'maxItems', 'items', 'properties', 'required', 'additionalProperties', 'propertyNames',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'format',
]);

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v: unknown, t: string) => typeOf(v) === t || (t === 'number' && typeOf(v) === 'integer');

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function dateTime(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return !!days && d >= 1 && d <= days && h <= 23 && mi <= 59 && se <= 60 && (m[9] === undefined || (Number(m[9]) <= 23 && Number(m[10]) <= 59));
}
function uri(s: string): boolean {
  if (/[\s\x00-\x1f\x7f]/.test(s)) return false;
  try { return /^[a-z][a-z0-9+.-]*:/i.test(s) && !!new URL(s); } catch { return false; }
}

function pointer(root: Schema, fragment: string): Schema {
  let node: unknown = root;
  for (const raw of fragment.split('/').slice(1)) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    node = (node as Record<string, unknown> | undefined)?.[key];
  }
  if (typeof node !== 'boolean' && (typeof node !== 'object' || node === null)) throw new Error(`unresolved $ref fragment #${fragment}`);
  return node as Schema;
}

/** Every rule `value` breaks, as "path: what" lines; none means it is valid. `name` is a schema's $id, optionally with a #fragment. */
export function validate(schemas: Schemas, name: string, value: unknown): string[] {
  const [file, fragment = ''] = name.split('#') as [string, string?];
  const root = schemas[file];
  if (root === undefined) throw new Error(`no schema ${file}`);
  const errors: string[] = [];
  run(fragment ? pointer(root, fragment) : root, value, '', root);
  return errors;

  function run(schema: Schema, v: unknown, path: string, base: Schema): boolean {
    const before = errors.length;
    const fail = (what: string) => errors.push(`${path || '/'}: ${what}`);
    if (schema === true) return true;
    if (schema === false) { fail('not allowed'); return false; }
    const s = schema;
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`schema keyword ${k} is not supported by this checker`);
    const quiet = (sub: Schema, b: Schema = base) => { const n = errors.length; const ok = run(sub, v, path, b); errors.length = n; return ok; };
    if (typeof s.$ref === 'string') {
      const [f, frag = ''] = s.$ref.split('#') as [string, string?];
      const target = f ? schemas[f] : base;
      if (target === undefined) throw new Error(`$ref to ${f}, which is not loaded`);
      run(frag ? pointer(target, frag) : target, v, path, target);
    }
    if (s.type !== undefined) {
      const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
      if (!types.some((t) => isType(v, t))) { fail(`must be ${types.join(' or ')}, not ${typeOf(v)}`); return false; }
    }
    if (Array.isArray(s.enum) && !s.enum.some((o) => equal(o, v))) fail(`must be one of ${JSON.stringify(s.enum)}`);
    if ('const' in s && !equal(s.const, v)) fail(`must be ${JSON.stringify(s.const)}`);
    if (typeof v === 'string') {
      const length = [...v].length;
      if (typeof s.minLength === 'number' && length < s.minLength) fail(`must be at least ${s.minLength} characters`);
      if (typeof s.maxLength === 'number' && length > s.maxLength) fail(`must be at most ${s.maxLength} characters`);
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(v)) fail(`must match ${s.pattern} (is ${JSON.stringify(v)})`);
      if (s.format === 'date-time' && !dateTime(v)) fail('must be an RFC 3339 date-time');
      if (s.format === 'uri' && !uri(v)) fail('must be an absolute URI');
    }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) fail(`must be at least ${s.minimum}`);
      if (typeof s.maximum === 'number' && v > s.maximum) fail(`must be at most ${s.maximum}`);
      if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum) fail(`must be more than ${s.exclusiveMinimum}`);
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) fail(`must have at least ${s.minItems} items`);
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) fail(`must have at most ${s.maxItems} items`);
      if (s.items !== undefined) v.forEach((item, i) => run(s.items as Schema, item, `${path}/${i}`, base));
    }
    if (typeOf(v) === 'object') {
      const o = v as Record<string, unknown>, props = (s.properties ?? {}) as Record<string, Schema>;
      for (const k of (s.required ?? []) as string[]) if (!(k in o)) fail(`requires ${k}`);
      for (const [k, sub] of Object.entries(props)) if (k in o) run(sub, o[k], `${path}/${k}`, base);
      if (s.additionalProperties !== undefined) for (const k of Object.keys(o)) if (!(k in props)) run(s.additionalProperties as Schema, o[k], `${path}/${k}`, base);
      if (s.propertyNames !== undefined) for (const k of Object.keys(o)) run(s.propertyNames as Schema, k, `${path}/${k} (name)`, base);
    }
    if (Array.isArray(s.allOf)) for (const sub of s.allOf as Schema[]) run(sub, v, path, base);
    if (Array.isArray(s.anyOf) && !(s.anyOf as Schema[]).some((sub) => quiet(sub))) fail('matches none of anyOf');
    if (Array.isArray(s.oneOf) && (s.oneOf as Schema[]).filter((sub) => quiet(sub)).length !== 1) fail('must match exactly one of oneOf');
    if (s.not !== undefined && quiet(s.not as Schema)) fail('matches a form it must not (not)');
    if (s.if !== undefined) {
      const branch = quiet(s.if as Schema) ? s.then : s.else;
      if (branch !== undefined) run(branch as Schema, v, path, base);
    }
    return errors.length === before;
  }
}

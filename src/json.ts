/** Values that survive Rayner's trace and artifact serialization. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

/** Clone JSON data without silently replacing invalid numbers or dropping functions.
 * Undefined object fields are omitted; undefined array items and holes are refused. */
export function jsonObject(value: unknown, name = 'state'): JsonObject {
  const ancestors = new Set<object>();
  const clone = (input: unknown, path: string): JsonValue => {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input === 0 ? 0 : input;
    if (!input || typeof input !== 'object' || ancestors.has(input)) throw new TypeError(`${path} must contain finite, acyclic JSON data`);
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new TypeError(`${path} must be a JSON object or array`);
    if (Object.getOwnPropertySymbols(input).length) throw new TypeError(`${path} must use JSON string keys`);
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        const output: JsonValue[] = [];
        for (let i = 0; i < input.length; i++) {
          if (!Object.hasOwn(input, i)) throw new TypeError(`${path}[${i}] must not be an array hole`);
          output.push(clone(input[i], `${path}[${i}]`));
        }
        return output;
      }
      const output: JsonObject = {};
      for (const key of Object.keys(input)) {
        const item: unknown = (input as Record<string, unknown>)[key];
        if (item !== undefined) Object.defineProperty(output, key, {value: clone(item, `${path}.${key}`), enumerable: true, writable: true, configurable: true});
      }
      return output;
    } finally { ancestors.delete(input); }
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a JSON object`);
  return clone(value, name) as JsonObject;
}

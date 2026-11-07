/** Values that survive Rayner's trace and artifact serialization. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

/** Clone JSON data without silently replacing invalid numbers or dropping functions.
 * Undefined object fields are omitted; undefined array items and holes are refused. `name` is
 * the value's name in an error message. */
export function jsonObject(value: unknown, name = 'state'): JsonObject {
  return cloneJson(value, 'jsonObject()', name);
}

/**
 * jsonObject for the library's own callers: an error names `api`, the call the author made, and
 * the value's path from `name` (docs/ENGINE.md, "Error messages").
 */
export function cloneJson(value: unknown, api: string, name: string, where = ''): JsonObject {
  const ancestors = new Set<object>();
  const clone = (input: unknown, path: string): JsonValue => {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input === 0 ? 0 : input;
    if (!input || typeof input !== 'object' || ancestors.has(input)) throw new TypeError(`${api}: ${path} must contain finite, acyclic JSON data${where}`);
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new TypeError(`${api}: ${path} must be a JSON object or array${where}`);
    if (Object.getOwnPropertySymbols(input).length) throw new TypeError(`${api}: ${path} must use JSON string keys${where}`);
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        const output: JsonValue[] = [];
        for (let i = 0; i < input.length; i++) {
          if (!Object.hasOwn(input, i)) throw new TypeError(`${api}: ${path}[${i}] must not be an array hole${where}`);
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${api}: ${name} must be a JSON object${where}`);
  return clone(value, name) as JsonObject;
}

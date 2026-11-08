/** Spatial order of native panels; independent of text shaping and graph flow. */
export type LayoutDirection = 'ltr' | 'rtl';

/** Read only an explicitly authored option; never coerce a value or inherit a default. */
export function layoutDirection(options: { direction?: LayoutDirection }, fallback: LayoutDirection = 'ltr', api = 'stage()'): LayoutDirection {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError(`${api}: the options must be an object`);
  if (!Object.hasOwn(options, 'direction')) {
    if ('direction' in options) throw new TypeError(`${api}: direction must be the options' own property, not inherited`);
    return fallback;
  }
  const property = Object.getOwnPropertyDescriptor(options, 'direction')!;
  if (!('value' in property)) throw new TypeError(`${api}: direction must be a plain value, not a getter`);
  const direction: unknown = property.value;
  if (direction === undefined) return fallback;
  if (direction !== 'ltr' && direction !== 'rtl') throw new RangeError(`${api}: direction must be 'ltr' or 'rtl', not ${typeof direction === 'string' ? JSON.stringify(direction) : direction === null ? 'null' : `${/^[aeiou]/.test(typeof direction) ? 'an' : 'a'} ${typeof direction}`}`);
  return direction;
}

/** `at` with the logical regions `'start'` and `'end'` turned into `'left'` or `'right'` for `direction`. */
export function physicalAt<T>(at: T | 'start' | 'end', direction: LayoutDirection): T | 'left' | 'right' {
  if (at === 'start') return direction === 'ltr' ? 'left' : 'right';
  if (at === 'end') return direction === 'ltr' ? 'right' : 'left';
  return at as T;
}

/** Spatial order of native panels; independent of text shaping and graph flow. */
export type LayoutDirection = 'ltr' | 'rtl';

/** Read only an explicitly authored option; never coerce a value or inherit a default. */
export function layoutDirection(options: { direction?: LayoutDirection }, fallback: LayoutDirection = 'ltr'): LayoutDirection {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Layout options must be an object');
  if (!Object.hasOwn(options, 'direction')) {
    if ('direction' in options) throw new TypeError('Layout direction must be an own option');
    return fallback;
  }
  const property = Object.getOwnPropertyDescriptor(options, 'direction')!;
  if (!('value' in property)) throw new TypeError('Layout direction must be a data option');
  const direction: unknown = property.value;
  if (direction === undefined) return fallback;
  if (direction !== 'ltr' && direction !== 'rtl') throw new TypeError('Layout direction must be "ltr" or "rtl"');
  return direction;
}

/** `at` with the logical regions `'start'` and `'end'` turned into `'left'` or `'right'` for `direction`. */
export function physicalAt<T>(at: T | 'start' | 'end', direction: LayoutDirection): T | 'left' | 'right' {
  if (at === 'start') return direction === 'ltr' ? 'left' : 'right';
  if (at === 'end') return direction === 'ltr' ? 'right' : 'left';
  return at as T;
}

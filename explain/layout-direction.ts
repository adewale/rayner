/** Spatial order of native panels; independent of text shaping and graph flow. */
export type LayoutDirection = 'ltr' | 'rtl';

/** `at` with the logical regions `'start'` and `'end'` turned into `'left'` or `'right'` for `direction`. */
export function physicalAt<T>(at: T | 'start' | 'end', direction: LayoutDirection): T | 'left' | 'right' {
  if (at === 'start') return direction === 'ltr' ? 'left' : 'right';
  if (at === 'end') return direction === 'ltr' ? 'right' : 'left';
  return at as T;
}

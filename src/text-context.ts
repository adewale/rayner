import type {Text, CodeSpan} from './text.ts';
import type {Box} from './mobject.ts';
import type {Run} from '../vendor/glyph.js';

/** A text object's retained shaping service. It never replaces the embedded font table. */
export interface TextShaping {
  prepare?(): Promise<void>;
  shape(owner: Text, text: string, size: number): Run;
  realBold?(owner: Text): boolean;
  spanBox?(span: CodeSpan): Box | undefined;
  clusterKey?(owner: Text, cluster: number): string | undefined;
}
const contexts = new WeakMap<object, {shaping: TextShaping; explicit: boolean}>();
export function textContextOf(source: object): TextShaping | undefined { return contextOf(source)?.shaping; }
function contextOf(source: object) {
  for (let c: object | null = source; c; c = Object.getPrototypeOf(c)) {
    const found = contexts.get(c); if (found) return found;
  }
  return undefined;
}
let defaultContext: TextShaping | undefined;
export function setDefaultTextContext(context: TextShaping | undefined) { defaultContext = context; }
let legacy = false, leased = false, ambient: TextShaping | undefined;
let pending: Promise<unknown> = Promise.resolve();
const plainRuns = new Set<Promise<unknown>>(), nested = new Set<Promise<unknown>>();
export function bindTextContext(source: object, shaping: TextShaping, explicit: boolean) {
  contexts.set(source, {shaping, explicit});
  if (!explicit && !legacy) { legacy = true; pending = Promise.allSettled([...plainRuns]); }
}
export const ambientTextContext = (): TextShaping | undefined => ambient ?? defaultContext;
function track<T>(work: () => Promise<T>, tasks: Set<Promise<unknown>>): Promise<T> {
  const result = Promise.resolve().then(work); tasks.add(result);
  void result.then(() => tasks.delete(result), () => tasks.delete(result));
  return result;
}
/** Legacy `new Text()` scenes need an ambient constructor context. Explicit scenes
 * use Scene.text()/TextOpts.shaping and can overlap without that compatibility lease. */
export function withTextContext<T>(source: object, work: () => Promise<T>): Promise<T> {
  const context = contextOf(source), shaping = context?.shaping;
  if (context?.explicit) return Promise.resolve(shaping?.prepare?.()).then(work);
  if (!legacy) return track(work, plainRuns);
  if (leased && ambient === shaping) return track(work, nested);
  const execute = async () => {
    await shaping?.prepare?.(); ambient = shaping; leased = true;
    try { return await work(); }
    finally {
      while (nested.size) await Promise.allSettled([...nested]);
      ambient = undefined; leased = false;
    }
  };
  const result = pending.then(execute, execute);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

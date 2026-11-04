export const RESIZE_TYPE = 'rayner:resize',
  STEP_TYPE = 'rayner:step',
  GOTO_TYPE = 'rayner:goto';
/** A settled step as the host hears it: its name, its place of how many, and the scenario. No captions or other content. */
export interface StepDetail {
  step: string;
  index: number;
  total: number;
  settings: Record<string, string>;
}
/** What a host asks the page to show: a step by name, settings by id, each optional. */
export interface GotoRequest {
  step?: string;
  settings?: Record<string, string>;
}
type Message = Pick<MessageEvent, 'origin' | 'source' | 'data'>;
/** The data of a message of ours, `type` at version 1, sent by `source` from `origin`; else null. */
function ours(event: Message, origin: string, source: MessageEventSource | null, type: string): Record<string, unknown> | null {
  if (!source || event.origin !== origin || event.source !== source) return null;
  const d: unknown = event.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const data = d as Record<string, unknown>;
  return data.type === type && data.version === 1 ? data : null;
}
/** A record of strings, copied (a key named like an Object property stays a key); else null. */
function strings(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, v]) => typeof v === 'string') ? (Object.fromEntries(entries) as Record<string, string>) : null;
}
/** The page's report of a settled step, for the parent. */
export const stepMessage = (d: StepDetail) => ({ type: STEP_TYPE, version: 1 as const, step: d.step, index: d.index, total: d.total, settings: { ...d.settings } });
/** The loader's reading of a step report: only from that iframe's window at the artifact's origin. */
export function stepDetail(event: Message, origin: string, source: MessageEventSource | null): StepDetail | null {
  const data = ours(event, origin, source, STEP_TYPE);
  if (!data) return null;
  const { step, index, total } = data,
    settings = strings(data.settings);
  return typeof step === 'string' &&
    typeof total === 'number' && Number.isInteger(total) && total >= 1 &&
    typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < total &&
    settings
    ? { step, index, total, settings }
    : null;
}
/** A host's request to show a step or a scenario; only what is given is sent. */
export const gotoMessage = (step?: string, settings?: Record<string, string>) => ({
  type: GOTO_TYPE,
  version: 1 as const,
  ...(step === undefined ? {} : { step }),
  ...(settings === undefined ? {} : { settings: { ...settings } }),
});
/** The page's reading of a goto request: only from its parent window at the parentOrigin. */
export function gotoRequest(event: Message, origin: string, source: MessageEventSource | null): GotoRequest | null {
  const data = ours(event, origin, source, GOTO_TYPE);
  if (!data) return null;
  if (Object.hasOwn(data, 'step') && typeof data.step !== 'string') return null;
  const settings = Object.hasOwn(data, 'settings') ? strings(data.settings) : undefined;
  if (settings === null) return null;
  return { ...(typeof data.step === 'string' ? { step: data.step } : {}), ...(settings ? { settings } : {}) };
}
export function exactHttpOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && value === url.origin ? url.origin : null;
  } catch {
    return null;
  }
}
export function resizeHeight(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  origin: string,
  source: MessageEventSource | null,
): number | null {
  if (!source || event.origin !== origin || event.source !== source) return null;
  const d: unknown = event.data;
  if (!d || typeof d !== 'object') return null;
  const data = d as Record<string, unknown>;
  return data.type === RESIZE_TYPE &&
    data.version === 1 &&
    typeof data.height === 'number' &&
    Number.isInteger(data.height) &&
    data.height >= 1 &&
    data.height <= 100000
    ? data.height
    : null;
}
/**
 * The page's side of the host API, under the rule the resize message keeps: framed, with a valid
 * parentOrigin. It hands each goto request from the parent window at that origin to `go`, and
 * returns the function that reports a settled step to it. Anywhere else it does neither.
 */
export function connectHost(go: (request: GotoRequest) => void): (detail: StepDetail) => void {
  const origin = exactHttpOrigin(new URLSearchParams(location.search).get('parentOrigin'));
  if (window.parent === window || !origin) return () => {};
  window.addEventListener('message', (event) => {
    const request = gotoRequest(event, origin, window.parent);
    if (request) go(request);
  });
  return (detail) => parent.postMessage(stepMessage(detail), origin);
}
export function reportHeight(root: HTMLElement): () => void {
  const origin = exactHttpOrigin(new URLSearchParams(location.search).get('parentOrigin'));
  if (window.parent === window || !origin) return () => {};
  let last = 0;
  const measure = () => {
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height !== last && height >= 1 && height <= 100000) {
      last = height;
      parent.postMessage({ type: RESIZE_TYPE, version: 1, height }, origin);
    }
  };
  // ResizeObserver already delivers at most once per rendering update, so measure
  // in its callback. Browsers may stop rendering an offscreen cross-origin frame,
  // the usual place for an embed, and then neither requestAnimationFrame nor
  // ResizeObserver fires. Measuring forces layout without rendering, so also
  // measure whenever the player settles on a step, and once the page has loaded.
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  document.addEventListener('rayner:step', measure);
  window.addEventListener('load', measure);
  measure();
  return () => {
    observer.disconnect();
    document.removeEventListener('rayner:step', measure);
    window.removeEventListener('load', measure);
  };
}

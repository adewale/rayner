import { STEP_TYPE, exactHttpOrigin, gotoMessage, resizeHeight, stepDetail } from './embed-protocol.ts';
import type { StepDetail } from './embed-protocol.ts';
import { chromeFor } from './embed-strings.ts';
import { PAGE_QUERY } from '../explain/internal.ts';

/**
 * Optional host-side convenience. Never required by the artifact itself. It adds the iframe and
 * nothing else: the page's own footer carries the way out of the frame. `lang` is kept for
 * compatibility; the script tag's `data-lang` (else the host page's language) chooses the language
 * of the frame's default name.
 *
 * Each step the page settles on reaches the host as a `rayner:step` event on the iframe (it bubbles)
 * and through `onStep`; the returned dispose function's `goTo` asks the page for a step, a scenario or
 * both, and does nothing once disposed.
 */
export function mountExplainer(
  target: HTMLElement,
  src: string,
  options: { title: string; height?: number; theme?: 'light' | 'dark' | 'auto'; lang?: string; onStep?: (detail: StepDetail) => void },
): (() => void) & { goTo(step?: string, settings?: Record<string, string>): void } {
  const url = new URL(src, document.baseURI);
  const origin = exactHttpOrigin(url.origin);
  if (!origin) throw new Error(`mountExplainer(): ${JSON.stringify(url.href)} is not an HTTP or HTTPS URL; the frame sizes itself only for a page served over HTTP or HTTPS`);
  url.searchParams.set(PAGE_QUERY.parentOrigin, location.origin);
  // The frame is transparent; Chromium paints an opaque canvas under a cross-origin frame whose
  // colour scheme differs from its host's, so 'auto' means the host page's scheme, not the device's.
  url.searchParams.set(PAGE_QUERY.theme, options.theme && options.theme !== 'auto' ? options.theme : hostScheme());
  const frame = document.createElement('iframe');
  frame.title = options.title;
  frame.loading = 'lazy';
  frame.allow = 'fullscreen';
  frame.src = url.href;
  frame.style.cssText = `width:100%;height:${options.height ?? 640}px;border:0;border-radius:12px;display:block`;
  // Both messages under one rule: from this iframe's window, at the artifact's origin.
  const receive = (event: MessageEvent) => {
    const height = resizeHeight(event, origin, frame.contentWindow);
    if (height != null) frame.style.height = `${height}px`;
    const detail = stepDetail(event, origin, frame.contentWindow);
    if (detail) {
      frame.dispatchEvent(new CustomEvent(STEP_TYPE, { bubbles: true, detail }));
      options.onStep?.(detail);
    }
  };
  window.addEventListener('message', receive);
  target.append(frame);
  let disposed = false;
  const dispose = () => {
    disposed = true;
    window.removeEventListener('message', receive);
    frame.remove();
  };
  return Object.assign(dispose, {
    /** Show `step` (by name) and `settings` (by id, over the scenario on show); a message to the page, which validates both. */
    goTo(step?: string, settings?: Record<string, string>) {
      if (!disposed) frame.contentWindow?.postMessage(gotoMessage(step, settings), origin);
    },
  });
}

/**
 * The host page's used colour scheme: dark when its computed color-scheme allows only dark, or
 * allows dark and the device prefers it; light otherwise, including `normal`.
 */
function hostScheme(): 'light' | 'dark' {
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const dark = /\bdark\b/.test(scheme),
    light = /\blight\b/.test(scheme);
  return dark && (!light || matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

/** The language the loader's words are in: the one given, else the host page's. */
const hostLang = (lang?: string) => lang || document.documentElement.lang || 'en';

const script = document.currentScript as HTMLScriptElement | null;
if (script?.dataset.src) {
  const target = script.dataset.target
    ? document.getElementById(script.dataset.target)
    : script.parentElement;
  if (target)
    mountExplainer(target, script.dataset.src, {
      title: script.dataset.title ?? chromeFor(hostLang(script.dataset.lang)).frame,
      theme: (script.dataset.theme ?? 'auto') as 'auto',
      lang: script.dataset.lang,
    });
}

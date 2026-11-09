import { toSvgString } from '../../src/output.ts';
import type { Scene } from '../../src/index.ts';
import { FRAME } from '../../src/internal.ts';
import { cliManifest } from './roots.ts';

/** Package ranges, so a missing package's error gives the install line the help gives. */
const PACKAGES = cliManifest.dependencies;
let resvg: typeof import('@resvg/resvg-js') | undefined;
/** Rasterise an SVG with the embedded fonts only. resvg loads on first use: only PNG output needs it. */
export async function rasterize(svg: string) {
  resvg ??= await import('@resvg/resvg-js').catch(() => {
    throw new Error('PNG output needs @resvg/resvg-js; npm i @resvg/resvg-js@' + PACKAGES['@resvg/resvg-js']);
  });
  return new resvg.Resvg(svg, { font: { loadSystemFonts: false } }).render();
}

/** The horizontal band `height` units tall around y = 0, `width` pixels wide: a window onto the scene's SVG. */
export function band(scene: Scene, width: number, height: number, background?: string): string {
  const full = Math.round((width * FRAME.h) / FRAME.w),
    px = Math.round((width * height) / FRAME.w);
  // cull: resvg 2.6.2 aborts on a fading element the camera has left outside the view.
  // overflow="visible": resvg 2.6.2 also panics (geom.rs, unwrap on None) on a translucent element
  // inside a nested svg that clips its viewport when something there reaches past it, as the paper
  // does under a zoomed camera. The outer svg crops the band, which lies inside the inner viewport,
  // so letting the inner one overflow shows nothing more.
  const stage = toSvgString(scene, { width, background, cull: true }).replace(/^<svg /, '<svg overflow="visible" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${px}" viewBox="0 ${(full - px) / 2} ${width} ${px}">${stage}</svg>`;
}


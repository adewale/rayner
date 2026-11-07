// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { percent } from '../lib/format.ts';
import { cssMap, rows, summarize, swatch } from './model.ts';

const pct = (v: number) => percent(v, { of: 100 });
const deg = (h: number) => `${h.toFixed(1)}°`;
/** The 500 shades the answers compare, and the roomiest 500 family's 700 shade. */
export const OPEN = summarize('500'),
  OPENING = swatch(OPEN.mostOfSrgb.family, '500'),
  OPEN_MAPPED = cssMap(OPENING.L, OPENING.C, OPENING.h, 'srgb'),
  OPEN_ROW = rows('500').find((r) => r.family === OPENING.family)!,
  RAW = rows('500').find((r) => r.family === OPEN.furthest.family)!,
  ROOMY = OPEN.leastOfSrgb.family,
  ROOMY_700 = rows('700').find((r) => r.family === ROOMY)!;

export const questions = {
  1: () => ({
    question: `An sRGB screen paints ${OPENING.family}-500 with chroma ${OPEN_ROW.shown.toFixed(3)}. Suppose you write that chroma yourself, at ${OPENING.family}-500’s own lightness and hue: oklch(${(OPENING.L * 100).toFixed(1)}% ${OPEN_ROW.shown.toFixed(3)} ${OPENING.h}). Does it fit sRGB?`,
    answer: `No. The sRGB edge at that lightness and hue is ${OPEN_ROW.srgb.toFixed(3)}, below ${OPEN_ROW.shown.toFixed(3)}. The mapped colour fits because the final clip also moved it, to lightness ${(OPEN_MAPPED.L * 100).toFixed(1)}% and hue ${deg(OPEN_MAPPED.h)}, where the edge is higher. Whether a chroma fits depends on the lightness and hue it comes with.`,
  }),
  2: () => ({
    question: `In raw chroma, ${RAW.family}-500 is the 500 colour furthest past the sRGB edge. Why does the share view put ${OPENING.family}-500 first instead?`,
    answer: `The edge sits at a different chroma on every spoke. ${RAW.family}-500 overshoots by ${OPEN.furthest.value.toFixed(3)} on an edge at ${RAW.srgb.toFixed(3)}; ${OPENING.family}’s edge is ${OPEN_ROW.srgb.toFixed(3)}, so its smaller overshoot is a larger share of it.`,
  }),
  3: () => ({
    question: `${ROOMY}-500 has the most room of the 500 shades, at ${pct(OPEN.leastOfSrgb.value)} of its sRGB edge. Does that make ${ROOMY}-700 safe on an sRGB screen?`,
    answer: `No: ${ROOMY}-700 asks for ${pct(ROOMY_700.ofSrgb)} of its edge, so an sRGB screen maps it. The darker shade has its own lightness and chroma, and the edge moves with lightness, so a family’s name says nothing about whether it fits.`,
  }),
};

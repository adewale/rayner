// The sizes `rayner check` and the served-page review read at: one place for the stage width
// labels are measured at, the legibility floor, the review's viewports and the embed widths.
import { FRAME } from '../../src/svg.ts';

/** The stage width, in CSS px, at which a label's size is measured. */
export const STAGE_PX = 1280;
/** Reader CSS pixels per scene unit on a STAGE_PX stage, with the camera home. */
export const STAGE_PX_PER_UNIT = STAGE_PX / FRAME.w;
/** Smallest label, in CSS pixels at a STAGE_PX stage, a reader must be able to see; live states included. */
export const MIN_PX = 14;
/** The phone the review reads on. */
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
/** The desktop the review reads on, a tile beside the page's text. */
export const DESKTOP_VIEWPORT = { width: 1180, height: 980 } as const;
/** The served-page review's viewports, phone first. */
export const REVIEW_VIEWPORTS = [PHONE_VIEWPORT, DESKTOP_VIEWPORT] as const;
/** The review's widths, phone first. */
export const REVIEW_WIDTHS = REVIEW_VIEWPORTS.map((v) => v.width);
/** The widths a framed page's heights are measured at, for hosts sizing an iframe. */
export const EMBED_WIDTHS = [390, 640, 900] as const;
/** One of EMBED_WIDTHS, as a key. */
export type EmbedWidth = `${(typeof EMBED_WIDTHS)[number]}`;

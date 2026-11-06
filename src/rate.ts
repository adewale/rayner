// Rate functions: [0,1] -> [0,1], mapping normalized time to animation alpha.

export type RateFunc = (t: number) => number;

export const linear: RateFunc = (t) => t;
// Quintic smoothstep: zero first and second derivative at both ends (manim's `smooth`)
export const smooth: RateFunc = (t) => { const s = Math.min(Math.max(t, 0), 1); return s * s * s * (s * (6 * s - 15) + 10); };
export const rushInto: RateFunc = (t) => 2 * smooth(t / 2);
export const rushFrom: RateFunc = (t) => 2 * smooth(t / 2 + 0.5) - 1;
export const thereAndBack: RateFunc = (t) => (t < 0.5 ? smooth(2 * t) : smooth(2 * (1 - t)));
export const clip = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

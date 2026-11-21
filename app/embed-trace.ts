// The player receives selected, formatted readouts and picture descriptions, never raw model,
// specimen, presentation or diagnostic records. Built and on-demand scenarios use this projection.
import type { StepRecord, Trace } from '../explain/testing.ts';
import type { SceneState } from '../src/index.ts';
import type { ExplainerMeta } from '../explain/index.ts';
import { watchedReadings, type WatchReading } from '../explain/internal.ts';

export type PlayerStep = Pick<StepRecord, 'step' | 't0' | 'frame0' | 't1' | 'frame1' | 'hold' | 'holdFrame' | 'meta'> & {
  derived?: PlayerDerived;
  watched?: WatchReading[];
};
/** Only the picture's structured description belongs in the player payload. */
export type PlayerDerived = Readonly<{ picture: unknown }>;
export function playerDerived(derived: SceneState | undefined): PlayerDerived | undefined {
  return derived && Object.hasOwn(derived, 'picture') ? { picture: derived.picture } : undefined;
}
export interface PlayerTrace {
  fps: number;
  duration: number;
  frames: number;
  steps: PlayerStep[];
}
export function playerTrace(trace: Trace, watch: ExplainerMeta['watch'], lang = 'en'): PlayerTrace {
  const { fps, duration, frames } = trace;
  return {
    fps, duration, frames,
    steps: trace.steps.map(record => {
      const { step, t0, frame0, t1, frame1, hold, holdFrame, meta, derived } = record;
      const observed = playerDerived(derived);
      return {
        step, t0, frame0, t1, frame1,
        ...(hold !== undefined ? { hold } : {}),
        ...(holdFrame !== undefined ? { holdFrame } : {}),
        meta,
        ...(observed ? { derived: observed } : {}),
        ...(watch ? { watched: watchedReadings(record, watch, lang) } : {}),
      };
    }),
  };
}

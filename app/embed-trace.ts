// The trace as the player reads it. The player shows a step's words, timing and what it showed,
// and of its state only the changes its author names for readers (`meta.watch`). Every trace the
// player holds is pruned to that one shape, the default scenario's as the build ships it and every
// other scenario's as the page runs it, and the watched state is opaque, so the player cannot read
// a key the page might not carry.
import type { StepRecord, Trace } from '../explain/testing.ts';
import type { SceneState } from '../src/index.ts';
import { watchedChanges, type WatchedChange } from '../explain/internal.ts';

declare const watchedOnly: unique symbol;
/**
 * A step's state as the player keeps it: only its watched keys (`meta.watch`), none when the scene
 * watches nothing. It is JSON at run time and opaque to the compiler: `playerChanges` reads it.
 */
export type WatchedState = { readonly [watchedOnly]: true };

/** One step of a `PlayerTrace`: its name, timing, words and what it showed, and its watched state before and after. */
export type PlayerStep = Pick<StepRecord, 'step' | 't0' | 'frame0' | 't1' | 'frame1' | 'hold' | 'holdFrame' | 'meta' | 'shown'> & {
  before: WatchedState;
  after: WatchedState;
};

/** A trace as the player reads it (`playerTrace`): a `Trace` whose steps keep only their watched state and no evidence. */
export interface PlayerTrace {
  fps: number;
  duration: number;
  frames: number;
  steps: PlayerStep[];
}

/**
 * `trace` as the player reads it: each step's state before and after keeps only the keys `watch`
 * names, and the evidence only `rayner check` reads is left out, so a scene whose state holds a
 * drawing's points does not ship them all.
 */
export function playerTrace(trace: Trace, watch: Readonly<Record<string, string>> | undefined): PlayerTrace {
  const watched = Object.keys(watch ?? {});
  const keep = (state: SceneState) => Object.fromEntries(watched.filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]])) as unknown as WatchedState;
  const { fps, duration, frames } = trace;
  return {
    fps, duration, frames,
    steps: trace.steps.map(({ step, t0, frame0, t1, frame1, hold, holdFrame, meta, shown, before, after }) => ({
      step, t0, frame0, t1, frame1,
      ...(hold !== undefined ? { hold } : {}),
      ...(holdFrame !== undefined ? { holdFrame } : {}),
      meta,
      ...(shown !== undefined ? { shown } : {}),
      before: keep(before),
      after: keep(after),
    })),
  };
}

/** What `step` changed of its watched state, as `watchedChanges` says it. */
export function playerChanges(step: PlayerStep, watch: Readonly<Record<string, string>> | undefined, lang = 'en'): WatchedChange[] {
  return watchedChanges(step as unknown as { before: SceneState; after: SceneState }, watch, lang);
}

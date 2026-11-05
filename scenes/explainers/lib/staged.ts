import type { StagedStep } from '../../../explain/index.ts';

/**
 * One staged step whose state has its own type, so its draw reads that state typed. stage.steps
 * hands each draw its own step's state, so a list may mix steps whose states differ; `rayner check`
 * also draws each step from other states, and a draw that throws on one has read its state.
 */
export const staged = <S extends object>(step: StagedStep<S>): StagedStep => step as unknown as StagedStep;

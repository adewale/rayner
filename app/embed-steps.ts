import { isDetail, teachingIndices } from '../explain/internal.ts';
import type { TeachingStep } from '../explain/internal.ts';

/** Reference steps remain linkable and reviewable, outside the short reading path (explain/script.ts teachingIndices). */
export const storyIndices = teachingIndices;
export function adjacentStep(
  steps: readonly TeachingStep[],
  from: number,
  direction: 1 | -1,
): number {
  if (steps[from] && isDetail(steps[from])) return Math.max(0, Math.min(steps.length - 1, from + direction));
  const main = storyIndices(steps);
  return (direction === 1 ? main.find((i) => i > from) : main.findLast((i) => i < from)) ?? from;
}

/** Reference steps remain linkable and reviewable, outside the short reading path. */
export function storyIndices(steps: readonly { meta: Record<string, unknown> }[]): number[] {
  const main = steps.flatMap((s, i) => (s.meta.detail === true ? [] : [i]));
  return main.length ? main : steps.map((_, i) => i);
}
export function adjacentStep(
  steps: readonly { meta: Record<string, unknown> }[],
  from: number,
  direction: 1 | -1,
): number {
  if (steps[from]?.meta.detail === true) return Math.max(0, Math.min(steps.length - 1, from + direction));
  const main = storyIndices(steps);
  return (direction === 1 ? main.find((i) => i > from) : main.findLast((i) => i < from)) ?? from;
}

import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { DEFAULT_RESERVE, SIZES, metadataPie, space, wholePie } from '../../../scenes/explainers/lib/ext4-space.ts';
import type { Size } from '../../../scenes/explainers/lib/ext4-space.ts';

/** Every case's step state equals the model's layout for its size and reserve. */
export function check(trace: Trace, values: Record<string, string>): void {
  const size = values.size as Size,
    m = Number(values.reserve);
  const sp = space(SIZES[size].bytes, DEFAULT_RESERVE),
    chosen = space(SIZES[size].bytes, m),
    l = sp.layout;
  // The opening: what statfs says users can write, and the rest; the opening pie is those two numbers.
  assertStepState(trace, 'df', {
    df: {
      blocks: l.blocks,
      users: sp.users,
      gone: l.blocks - sp.users,
      pie: [
        { label: 'Not available', value: l.blocks - sp.users },
        { label: 'Users can write', value: sp.users },
      ],
    },
  });
  // The answer: the not-available blocks split into metadata and the two reserves (the free-blocks pie
  // of the old opening and the separate users step are folded in here).
  assertStepState(trace, 'reserve', {
    reserve: { root: sp.root, kernel: sp.kernel, metadata: l.metadata, free: l.free, users: sp.users, pie: wholePie(sp, 'users') },
  });
  assert.equal(l.free - sp.root - sp.kernel, sp.users);
  assertStepState(trace, 'inodes', {
    inodes: { type: l.type, inodeRatio: l.inodeRatio, inodes: l.inodes, inodeTables: l.inodeTables, pie: metadataPie(l) },
  });
  assertStepState(trace, 'journal', { journal: { journal: l.journal } });
  assertStepState(trace, 'other', {
    other: {
      groups: l.groups,
      superGroups: l.superGroups,
      superCopies: l.superCopies,
      reservedGdt: l.reservedGdt,
      bitmaps: l.bitmaps,
      files: l.filesTotal,
      other: l.other,
    },
  });
  // The chosen reserve has its own step only when it is not the default.
  const hasChosen = trace.steps.some((s) => s.step === 'chosen');
  assert.equal(hasChosen, m !== DEFAULT_RESERVE);
  if (hasChosen)
    assertStepState(trace, 'chosen', {
      chosen: { percent: m, root: chosen.root, users: chosen.users, gained: chosen.users - sp.users, pie: wholePie(chosen, 'users') },
    });
  assertStepState(trace, 'sizes', {
    sizes: Object.fromEntries(
      (Object.keys(SIZES) as Size[]).map((k) => {
        const x = space(SIZES[k].bytes, m);
        return [k, { metadata: x.layout.metadata, root: x.root, users: x.users }];
      }),
    ),
  });
}

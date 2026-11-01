import { Group, Arrow } from '../../../../src/index.ts';
import { ringStory } from '../models.ts';
import { label, tile } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
import type { Stage } from '../../../../explain/index.ts';
export function frames(which: string): ReaderFrame[] {
  const e = ringStory(which),
    full = e[4]!,
    last = e.at(-1)!;
  const draw = (s: Stage, snap: typeof full.result) => {
    const g = new Group(
      ...snap.data.map(
        (v, i) =>
          new Group(
            tile(v ?? 'empty', (i - 2) * 2.6, 0.6, 2.25, 1.25, s, { size: 0.7, key: `slot:${i}` }),
            label(`slot ${i}`, (i - 2) * 2.6, 1.85, s.soft, 0.6),
          ),
      ),
    );
    const same = snap.head === snap.tail;
    g.add(
      label(
        same ? `head = tail = ${snap.head}` : `head = ${snap.head}; tail = ${snap.tail}`,
        0,
        -1.3,
        s.palette.ink,
        0.7,
        'indices',
      ),
      label(`Occupied: ${snap.length} / 5`, 0, -2.6, s.palette.ink, 0.7, 'length'),
    );
    return g;
  };
  return [
    {
      id: 'reader-capacity',
      title: 'Does head = tail mean empty?',
      line: 'The occupied count removes the ambiguity.',
      caption:
        'After five pushes, all slots hold values and both pointers return to slot 0. The occupied count is 5. An empty ring can have the same pointers, but its count is 0.',
      values: { ...full.result },
      draw: (s) => draw(s, full.result),
    },
    {
      id: 'reader-reuse',
      title: which === 'wrap' ? 'Which slots get reused?' : 'What happens to the sixth push?',
      line: which === 'wrap' ? 'Pop twice, then push 6 and 7.' : 'A full buffer refuses the write.',
      caption:
        which === 'wrap'
          ? 'Popping 1 and 2 frees slots 0 and 1. Pushes 6 and 7 reuse them, and tail wraps to 2. Reads begin at head, giving queue order 3, 4, 5, 6, 7 despite the storage row starting with 6.'
          : 'Pushes 6 and 7 throw Full. Stored values and pointers stay unchanged, so the caller must handle a refused write rather than losing the oldest value.',
      values: { ...last.result, error: last.error ?? null },
      draw: (s) =>
        new Group(
          draw(s, last.result),
          label(
            which === 'wrap' ? 'Queue order: 3, 4, 5, 6, 7' : 'push 6 and push 7 → Full',
            0,
            -3.8,
            which === 'wrap' ? s.palette.ink : s.bad,
            0.65,
            'operation-result',
          ),
        ),
    },
  ];
}
